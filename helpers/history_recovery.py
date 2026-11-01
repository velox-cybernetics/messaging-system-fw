from helpers.log import redis_client, read_bs, write_bs, summary_entry_of, prepend_summary
from helpers.car_model_analyze import car_model_analyze
from helpers import dashboard as dash
from src.rage_functions import BOOKING_LINK
import json, re


#redis was started fresh at the v2 cutover, so every customer from before it is a stranger to the bot even though the dashboard kept their whole thread
#the thread is folded into one conversation_summary entry, the same shape summarize() leaves, and the book state the thread implies is restored


# V1 TEXT WRAPPER
#the first system wrote a customer's texts into the thread wrapped as "Note: the attached media ...\nUser Text:\n1) hey\n2) how much\n\nmedia 1 (...)\nAttached Media Description: ..."
#the note that opened a message with media, everything up to the texts themselves
V1_MEDIA_NOTE_RE: re.Pattern = re.compile(r"\ANote: the attached media.*?(?=User Text:)", re.DOTALL)

V1_TEXT_HEADER_RE: re.Pattern = re.compile(r"^User Text:[ \t]*\n?", re.MULTILINE)

#"1) " at the start of each text in the batch
V1_NUMBERING_RE: re.Pattern = re.compile(r"^\d+\)[ \t]*", re.MULTILINE)

#"media 1 (media the user sent and is asking about)", the description line under it is kept since it says what the picture showed
V1_MEDIA_HEADER_RE: re.Pattern = re.compile(r"^media \d+ \([^)\n]*\)[ \t]*\n?", re.MULTILINE)

BLANK_RUN_RE: re.Pattern = re.compile(r"\n{3,}")

#the roles the dashboard gives the shop's side of a thread
SHOP_ROLES: set[str] = {"agent", "owner"}


#one customer text as the customer typed it, with the first system's wrapper stripped
def clean_customer_text(text: str) -> str:
    cleaned: str = V1_MEDIA_NOTE_RE.sub("", text or "")

    cleaned = V1_TEXT_HEADER_RE.sub("", cleaned)

    cleaned = V1_NUMBERING_RE.sub("", cleaned)

    cleaned = V1_MEDIA_HEADER_RE.sub("", cleaned)

    return BLANK_RUN_RE.sub("\n\n", cleaned).strip()


#the thread as the conversation shape the models read, customer messages in a row are one turn and the shop messages after them are its reply
def conversation_of(thread: list[dict]) -> dict:
    turns: list[list[str]] = []

    for message in thread:
        text: str = str(message.get("text") or "").strip()

        if(text == ""):
            continue

        #the shop spoke first, so the turn opens with nothing from the customer
        if(message.get("role") in SHOP_ROLES):
            if(turns == []):
                turns.append(["", text])

            elif(turns[-1][1] == ""):
                turns[-1][1] = text

            else:
                turns[-1][1] += "\n\n" + text

        else:
            text = clean_customer_text(text)

            if(text == ""):
                continue

            if(turns != [] and turns[-1][1] == ""):
                turns[-1][0] = (turns[-1][0] + "\n" + text).strip()

            else:
                turns.append([text, ""])

    conversation: dict = {}

    for i, (user_text, shop_text) in enumerate(turns):
        conversation[f"user_message_{i}"] = {"user_media": {}, "user_text": user_text}

        conversation[f"agent_response_to_user_message_{i}"] = shop_text

    return conversation


#the book state the thread implies, only the fields the thread can speak to
def book_state_of(thread: list[dict]) -> dict:
    book_state: dict = {}

    shop_texts: list[tuple[str, int]] = [(str(message.get("text") or ""), int(message.get("ts") or 0)) for message in thread if(message.get("role") in SHOP_ROLES)]

    if(any("$" in text for text, ts in shop_texts)):
        book_state["pricing_state"] = "SENT"

    if(any(BOOKING_LINK in text for text, ts in shop_texts)):
        book_state["booking_link_state"] = "SENT"

    #the last priced reply is the quote the booking site reads
    for text, ts in reversed(shop_texts):
        quoted: dict = dash.quote_from_reply(text)

        if(quoted["amounts"] != []):
            book_state["quoted_text"] = quoted["text"]
            book_state["quoted_amounts"] = json.dumps(quoted["amounts"])
            book_state["quoted_at"] = ts / 1000 if(ts) else quoted["at"]

            break

    customer_text: str = "\n".join(clean_customer_text(str(message.get("text") or "")) for message in thread if(message.get("role") not in SHOP_ROLES)).strip()

    #every text the customer typed read as one message, the analyzer keeps the most complete vehicle named in it
    if(customer_text != ""):
        car_model: str = car_model_analyze({"user_media": {}, "user_text": customer_text}, {})

        if(car_model != ""):
            book_state["car_model"] = car_model

    return book_state


#folds the thread in front of the customer's history and fills the book state fields that are still empty, true when something was folded
def fold_thread(id: str, thread: list[dict]) -> bool:
    conversation: dict = conversation_of(thread)

    if(conversation == {}):
        return False

    prepend_summary(id, summary_entry_of(conversation))

    current_state: dict = read_bs(f"{id}_bstate")

    missing_state: dict = {field: value for field, value in book_state_of(thread).items() if(not current_state.get(field))}

    if(missing_state != {}):
        write_bs(f"{id}_bstate", missing_state)

    print(f"HISTORY RECOVERED FOR {id}: {len(thread)} dashboard messages folded, book state filled: {sorted(missing_state)}")
    print()

    return True


#a customer the bot has no history for gets the thread the dashboard kept, if there is one, before their message is answered
def recover_history(id: str, channel: str) -> None:
    if(redis_client.llen(f"{id}_usermsg") > 0):
        return

    thread: list[dict] = dash.fetch_thread(id, channel)

    if(thread == []):
        return

    fold_thread(id, thread)
