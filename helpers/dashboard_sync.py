from helpers import dashboard as dash
from helpers import delivery
from helpers.alerts import alert_owner
from helpers.log import redis_client, write_bs, remove_id, append_last, write_flag, FOLLOWUP_KEY
from src.rage_functions import BOOKING_LINK
import asyncio


#CONSTANTS
OUTBOX_POLL_SECONDS: int = 10
FLAG_POLL_SECONDS: int = 60

#the dashboard names the channels after the platforms
CHANNELS: dict[str, str] = {"instagram": "ig", "facebook": "messenger", "blooio": "blooio"}


#runs forever next to the webhooks, started once by app.py and never on import so a script can not pop owner replies
async def outbox_loop():
    if(not dash.ENABLED):
        return

    while True:
        #worker thread so the webhooks keep answering while the replies go out
        await asyncio.to_thread(send_outbox)

        await asyncio.sleep(OUTBOX_POLL_SECONDS)


#sends every reply the owner typed in the dashboard composer
def send_outbox() -> None:
    #the dashboard removes them as it hands them out, so a customer is never texted twice
    try:
        messages: list = dash.get("/api/outbox").get("messages", [])

    #unreachable, the next round tries again
    except Exception:
        return

    for message in messages:
        #one bad message must not stop the rest from going out
        try:
            send_outbox_message(message)

        except Exception as error:
            print(f"OUTBOX ERROR: {error} FOR {str(message)[:200]}")


#sends one composer reply, a failed one can not be retried since the dashboard already shows it as sent
def send_outbox_message(message: dict) -> None:
    channel: str = CHANNELS.get(str(message.get("channel") or ""), "")
    id: str = str(message.get("userId") or "")
    text: str = str(message.get("text") or "")

    if(channel == "" or id == "" or text == ""):
        print(f"OUTBOX SKIPPED A MALFORMED REPLY: {str(message)[:200]}")
        return

    send_result: dict = delivery.send_message(channel, id, text)

    if(not send_result["sent"]):
        print(f"OUTBOX REPLY TO {id} ON {channel} NOT DELIVERED")
        print()

        #meta says why it refused one, blooio does not
        reason: str = f"\nMETA SAID: {send_result['error_message']}" if(send_result["error_message"] != "") else ""

        alert_owner(f"DASHBOARD REPLY NOT DELIVERED, the dashboard shows it as sent but {channel} rejected it{reason}\nCUSTOMER: {id}\nREPLY: {text[:160]}\nReply to them directly instead")

        return

    print(f"OUTBOX REPLY SENT TO {id} ON {channel}: {text}")
    print()

    #the reply is already delivered, so a bookkeeping error is only logged
    try:
        dash.log_outgoing(id, channel, text)

        record_owner_reply(id, text)

    except Exception as error:
        print("OUTBOX BOOKKEEPING ERROR: " + str(error))


#the owner answered, so follow ups stop, prices and links count as sent, and the history has the reply
def record_owner_reply(id: str, text: str) -> None:
    remove_id(FOLLOWUP_KEY, id)

    if("$" in text):
        write_bs(f"{id}_bstate", {"pricing_state": "SENT"})
    if(BOOKING_LINK in text):
        write_bs(f"{id}_bstate", {"booking_link_state": "SENT"})

    #added onto the last agent reply, so user and agent turns stay paired in the history
    if(redis_client.llen(f"{id}_agentres") > 0):
        append_last(f"{id}_agentres", text)


#runs forever next to the webhooks, started once by app.py
async def flag_loop():
    if(not dash.ENABLED):
        return

    while True:
        await asyncio.to_thread(save_flags)

        await asyncio.sleep(FLAG_POLL_SECONDS)


#saves every flag report to redis, then acks only the saved ones so a failed save comes back next poll
def save_flags() -> None:
    try:
        reports: list = dash.get("/api/flags").get("flags", [])

    #unreachable, the next round tries again
    except Exception:
        return

    saved_ids: list[str] = []

    for report in reports:
        try:
            write_flag(report)

            saved_ids.append(report["id"])

            print(f"FLAG REPORT SAVED: {report['id']} {report.get('channel')} {report.get('username') or report.get('userId')}")
            print()

        except Exception as error:
            print("FLAG SAVE ERROR: " + str(error))

    if(saved_ids != []):
        try:
            dash.post("/api/flags", {"ack": saved_ids})

        except Exception as error:
            print("FLAG ACK ERROR: " + str(error))
