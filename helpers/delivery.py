from helpers import senders as send
from helpers import username as un
from helpers import dashboard as dash
from helpers.alerts import alert_owner_once
from src.rage_functions import BOOKING_LINK
from urllib.parse import quote


#CONSTANTS
#graph error 190 means the access token expired or was reset, every send on that channel fails until a new one is set
TOKEN_EXPIRED_CODE: int = 190

#551 means they blocked the account or left the conversation, 10 means the 24 hour window closed, a retry never reaches them
UNREACHABLE_CODES: list[int] = [551, 10]

#100 means meta refused the reply itself, a retry never fixes it so the turn is recorded as unanswered and the owner is told why
REJECTED_CODE: int = 100

#subcode of 100 for another connected app owning the instagram thread, meta gives the thread to whichever app messaged the customer first (a welcome dm automation for example) for 24 hours after each customer message, so every reply from here is refused while they keep messaging
NOT_THREAD_OWNER_SUBCODE: int = 2534037

#blooio holds every text to a conversation until the customer texts back: 3 sent before their first reply, 4 in a row since their last one, or 14 days quiet, a retry never gets through
BLOOIO_HELD_CODES: list[str] = ["conversation_awaiting_reply", "conversation_streak_limit", "conversation_inactive_paused"]

#blooio refuses links and media until the customer has texted back once, the same text without the links goes through
BLOOIO_NO_LINKS_CODE: str = "conversation_content_restricted"

#one token alert an hour per channel, one unreachable or rejected alert a day per customer
TOKEN_ALERT_SECONDS: int = 3600
UNREACHABLE_ALERT_SECONDS: int = 86400
REJECTED_ALERT_SECONDS: int = 86400


#the booking link names the conversation it went to, so the dashboard only counts bookings made through the system's own link
def with_ref(channel: str, id: str, text: str) -> str:
    #no link, or the owner pasted one that already names a conversation
    if(BOOKING_LINK not in text or "?ref=" in text or channel not in dash.DASH_CHANNELS):
        return text

    #quoted whole so the | and the + of a phone number make it through the url
    member: str = quote(dash.DASH_CHANNELS[channel] + "|" + id, safe="")

    return text.replace(BOOKING_LINK, f"{BOOKING_LINK}?ref={member}")


#sends one message to a customer on their channel, and texts the owner when meta says why it failed
def send_message(channel: str, id: str, text: str) -> dict:
    send_result: dict = send.send_result(False)

    #only the customer's copy carries the ref, the history and the dashboard keep the plain link
    sent_text: str = with_ref(channel, id, text)

    if(channel == "ig"):
        send_result = send.send_ig_message(id, sent_text)
    elif(channel == "blooio"):
        send_result = send.send_blooio_message(id, sent_text)
    elif(channel == "messenger"):
        send_result = send.send_messenger_message(id, sent_text)

    if(send_result["sent"]):
        return send_result

    #send results error code to alert owner if run into any servering side failures
    error_code: int = send_result["error_code"]

    #if sending the message is a failure on metas end due to their rules, then only send once rather that spamming owner
    if(error_code == TOKEN_EXPIRED_CODE):
        alert_owner_once(f"token_{channel}", TOKEN_ALERT_SECONDS, f"SEND FAILED, {channel.upper()} TOKEN EXPIRED (error 190)\nEvery reply on {channel} fails until a new access token is set on the server\nCUSTOMER: {un.username(id, channel)}\nMESSAGE NOT SENT: {text}")

    elif(error_code in UNREACHABLE_CODES):
        alert_owner_once(f"unreachable_{channel}_{id}", UNREACHABLE_ALERT_SECONDS, f"SEND FAILED, CUSTOMER UNREACHABLE (error {error_code})\nThey blocked the account, left the conversation, or the 24 hour window closed\nCHANNEL: {channel}\nCUSTOMER: {un.username(id, channel)}\nMESSAGE NOT SENT: {text}")

    elif(error_code == REJECTED_CODE and send_result["error_subcode"] == NOT_THREAD_OWNER_SUBCODE):
        alert_owner_once(f"rejected_{channel}_{id}", REJECTED_ALERT_SECONDS, f"SEND FAILED, ANOTHER APP OWNS THIS {channel.upper()} THREAD (error 100/2534037)\nA different automation messaged them first (like a welcome dm) so meta refuses every reply from this system until they go 24 hours without messaging\nCHANNEL: {channel}\nCUSTOMER: {un.username(id, channel)}\nMESSAGE NOT SENT: {text}\nReply to them manually, then turn that automation off or make this app the default in the instagram conversation routing settings")

    elif(error_code == REJECTED_CODE):
        alert_owner_once(f"rejected_{channel}_{id}", REJECTED_ALERT_SECONDS, f"SEND FAILED, {channel.upper()} REJECTED THE REPLY (error 100)\nMETA SAID: {send_result['error_message']}\nCHANNEL: {channel}\nCUSTOMER: {un.username(id, channel)}\nMESSAGE NOT SENT: {text}\nReply to them manually")

    return send_result


#true when the customer can never get this message, or blooio holds it until they text back, so it is not retried
def unreachable(send_result: dict) -> bool:
    return send_result["error_code"] in UNREACHABLE_CODES or send_result["error_code"] == REJECTED_CODE or send_result["blooio_code"] in BLOOIO_HELD_CODES


#true when blooio refused the text only for the links in it
def links_refused(send_result: dict) -> bool:
    return send_result["blooio_code"] == BLOOIO_NO_LINKS_CODE
