from dotenv import load_dotenv 
from upstash_redis import Redis
from upstash_redis.client import Pipeline
from helpers.nlp_functions import call_llm
import json

# HOUSTON ANNIVERSARY SALE START
from src.prompts import anniversary_sale
# HOUSTON ANNIVERSARY SALE END

load_dotenv() 

redis_client: Redis = Redis.from_env() 


# MEMORY LIMITS
MAX_ENTRIES: int = 12

#once a list is full, every turn except the last KEEP_RECENT is folded into one summary entry
KEEP_RECENT: int = 4


# DEDUPE
#meta resends a webhook it thinks was missed, a message id is remembered for 48 hours so it is only answered once
SEEN_TTL_SECONDS: int = 172800


# FLAG REPORTS
#conversations the owner flagged in the dashboard, report id -> report json
FLAGGED_KEY: str = "flagged_conversations"


# HIL LISTS
#ids waiting to send pictures after asking about a custom service
HIL_QUEUE_KEY: str = "hil_queue"

#ids handed to a human, the system never responds to them
RESTRICTED_KEY: str = "hil_restricted"


# FOLLOW UP LIST
#ids that got a reply and have not answered since, the daily follow up run goes through them
FOLLOWUP_KEY: str = "followup_pending"


# SUMMARY PROMPT
SUMMARY_PROMPT: str = """
Summarize this text conversation between Filthy Wraps, a car customization shop, and one customer, so the shop's agent can keep going without the full history.
The input is JSON, oldest first: user_message_N is the customer and agent_response_to_user_message_N is the shop's reply to it. A conversation_summary entry already covers even earlier messages, merge it in.
Write one short plain text paragraph, under 120 words, that keeps:
- the customer's vehicle (year, make, model) exactly as they typed it
- every service discussed and every price the shop quoted, with the exact numbers written like the shop does (299$, not $299)
- what the customer decided, asked for, or is still waiting on (booking, the shop checking on something, a hand off to the owner)
- what any media they sent or replied to showed, if it matters
Only use facts from the conversation. No greeting, no advice, no markdown, no em dashes.
"""

# HOUSTON ANNIVERSARY SALE START
SUMMARY_PROMPT += anniversary_sale.summary_note()
# HOUSTON ANNIVERSARY SALE END


#read, turns json strings into dicts, and leaves plain text as is 
def read(key: str) -> list:
    values_as_text: list[str] = redis_client.lrange(key, 0, -1)
    values: list = []

    for value_as_text in values_as_text:
        try:
            value: dict = json.loads(value_as_text)
            values.append(value)
        except json.JSONDecodeError:
            values.append(value_as_text)

    return values


# SUMMARIZE
def summarize(id: str) -> None:
    user_key: str = f"{id}_usermsg"

    agent_key: str = f"{id}_agentres"

    lock_key: str = f"{id}_summarizing"

    #only one summary per conversation at a time, the lock removes itself after 120 seconds
    if(not redis_client.set(lock_key, "1", nx=True, ex=120)):
        return

    try:
        user_messages: list = read(user_key)

        agent_responses: list = read(agent_key)

        #only fold complete turns so user and agent turns stay paired
        complete_turns: int = min(len(user_messages), len(agent_responses))

        fold_count: int = complete_turns - KEEP_RECENT

        if(fold_count < 2):
            return

        conversation: dict = {}

        for i in range(fold_count):
            conversation[f"user_message_{i}"] = user_messages[i]

            conversation[f"agent_response_to_user_message_{i}"] = agent_responses[i]

        summary_entry: str = summary_entry_of(conversation)

        #swap the folded turns for the summary in one transaction, anything pushed meanwhile stays at the end
        transaction: Pipeline = redis_client.multi()

        transaction.ltrim(user_key, fold_count, -1)

        transaction.lpush(user_key, summary_entry)

        transaction.ltrim(agent_key, fold_count, -1)

        transaction.lpush(agent_key, "")

        transaction.exec()

    #on any failure every message is kept as is and the next agent reply tries again
    except Exception as error:
        print("SUMMARY ERROR: " + str(error))

    finally:
        redis_client.delete(lock_key)


#one short paragraph for a conversation shaped user_message_N / agent_response_to_user_message_N, as the json entry that stands in for those turns
#fallback chain, so one provider being down does not stop the history from being folded, raises when no model gave a summary
def summary_entry_of(conversation: dict) -> str:
    summary: str = call_llm(SUMMARY_PROMPT, json.dumps(conversation, ensure_ascii=False), "low", 4000)

    if(summary.strip() == ""):
        raise ValueError("empty summary")

    return json.dumps({"conversation_summary": summary.strip()}, ensure_ascii=False)


#puts a summary of turns the history never had in front of it, paired with an empty agent turn like a folded summary
def prepend_summary(id: str, summary_entry: str) -> None:
    transaction: Pipeline = redis_client.multi()

    transaction.lpush(f"{id}_usermsg", summary_entry)

    transaction.lpush(f"{id}_agentres", "")

    transaction.exec()


#write
def write(key: str, value) -> None:

    #ensure staying within limit, folded when the agent reply is stored so a summary never delays a reply
    if(key.endswith("_agentres") and redis_client.llen(key) >= MAX_ENTRIES):
        id: str = key.removesuffix("_agentres")

        summarize(id)


    if(isinstance(value, dict)):
        value_as_text: str = json.dumps(value, ensure_ascii=False) 
        redis_client.rpush(key, value_as_text) 

    else:
        redis_client.rpush(key, value) 

#BOOK STATE
#overwrites only the fields given, like {"car_model": "..."}, the other fields stay
def write_bs(key: str, value: dict) -> None:
    redis_client.hset(key, values=value)

#every field as one dict, {} when nothing was written yet
def read_bs(key: str) -> dict:
    book_state: dict = redis_client.hgetall(key)

    return book_state


# ID LISTS
def add_id(key: str, id: str) -> None:
    redis_client.rpush(key, id)


def has_id(key: str, id: str) -> bool:
    ids: list[str] = redis_client.lrange(key, 0, -1)

    return id in ids


def remove_id(key: str, id: str) -> None:
    redis_client.lrem(key, 0, id)


#every id as plain text, read() would turn an all number id into an int
def read_ids(key: str) -> list[str]:
    ids: list[str] = redis_client.lrange(key, 0, -1)

    return ids


#FOLLOW UP
#adds the follow up onto the last agent reply, so user and agent turns stay paired in the history
def append_last(key: str, text: str) -> None:
    #upstash hands an empty reply back as None, so a turn the bot left unanswered takes the text on its own
    last_value: str = redis_client.lindex(key, -1) or ""

    redis_client.lset(key, -1, f"{last_value}\n\n{text}" if(last_value) else text)


#true only for the first caller, so the daily run happens once even with two instances up during a deploy
def claim(key: str) -> bool:
    claimed = redis_client.set(key, "1", nx=True, ex=86400)

    return bool(claimed)


#DEDUPE
#true only the first time a key is seen, set nx is one atomic step so two copies of a webhook can never both get through
def first_seen(key: str) -> bool:
    seen = redis_client.set(f"seen_{key}", "1", nx=True, ex=SEEN_TTL_SECONDS)

    return bool(seen)


#FLAG REPORTS
#keyed by report id, so a report the dashboard sends again just overwrites itself
def write_flag(report: dict) -> None:
    redis_client.hset(FLAGGED_KEY, report["id"], json.dumps(report, ensure_ascii=False))

