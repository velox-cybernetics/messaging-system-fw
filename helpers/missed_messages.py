from dotenv import load_dotenv
from helpers.log import first_seen
from datetime import datetime
import os, time, requests

load_dotenv()

IG_ACCESS_TOKEN: str = os.environ["IG_ACCESS_TOKEN"]


#CONSTANTS
#newest messages read from the conversation, every message since the shop's last reply fits in it
MESSAGE_LIMIT: int = 25

#older messages are left alone, meta's reply window is closed by then and their dedupe key (48 hours) may already be gone
MAX_AGE_SECONDS: int = 86400


#the newest messages of the customer's ig conversation, newest first, each {"id", "created_time", "from": {"id"}, "message"}
def ig_conversation(id: str) -> list[dict]:
    res = requests.get(
        "https://graph.instagram.com/v25.0/me/conversations",
        headers={"Authorization": f"Bearer {IG_ACCESS_TOKEN}"},
        params={"platform": "instagram", "user_id": id, "fields": f"messages.limit({MESSAGE_LIMIT}){{id,created_time,from,message}}"},
        timeout=20,
    )

    res.raise_for_status()

    conversations: list = res.json().get("data") or []

    if(conversations == []):
        return []

    return (conversations[0].get("messages") or {}).get("data") or []


#meta does not send a webhook for every message, like the first message of a new conversation or the question a customer taps under a post
#every customer text since the shop's last reply that never came in by webhook, oldest first as [text, None, None] parts lists
#each one is claimed with the same dedupe key a webhook sets, so it is taken once and a late webhook for it is skipped as a duplicate
def recover(channel: str, id: str) -> list[list]:
    if(channel != "ig"):
        return []

    now: float = time.time()

    recovered: list[list] = []

    for message in ig_conversation(id):
        #the shop's last reply, everything before it was already answered
        if((message.get("from") or {}).get("id") != id):
            break

        created: float = datetime.strptime(message["created_time"], "%Y-%m-%dT%H:%M:%S%z").timestamp()

        if(now - created > MAX_AGE_SECONDS):
            break

        text: str = message.get("message") or ""

        #only text is taken, an attachment comes back from the conversation in a different shape than the webhook's
        if(text != "" and first_seen(f"{channel}_{message['id']}")):
            recovered.append([text, None, None])

    recovered.reverse()

    return recovered
