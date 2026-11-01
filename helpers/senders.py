import os
from urllib.parse import quote

import requests

#api and access tokens
TEXTBELT_API_KEY = os.environ["TEXTBELT_API_KEY"]
BLOOIO_API_KEY = os.environ["BLOOIO_API_KEY"]
IG_ACCESS_TOKEN = os.environ["IG_ACCESS_TOKEN"]
MESSENGER_ACCESS_TOKEN = os.environ["MESSENGER_ACCESS_TOKEN"]

#base urls for POSTs
TEXTBELT_SEND_URL = "https://textbelt.com/text"
BLOOIO_BASE_URL = "https://backend.blooio.com/v2/api"
IG_SEND_URL = "https://graph.instagram.com/v25.0/me/messages"
MESSENGER_SEND_URL = "https://graph.facebook.com/v25.0/me/messages"

#ERROR HANDLING FUNCTIONS
#every send returns {"sent": bool, "error_code": int, "error_subcode": int, "error_message": str, "blooio_code": str}, the codes are meta's graph error code and subcode and 0 when there is none
#blooio_code is blooio's name for why it refused a text, like "conversation_awaiting_reply", and "" when there is none
def send_result(sent: bool, error: dict | None = None, blooio_code: str = "") -> dict:
    error = error or {}

    return {"sent": sent, "error_code": int(error.get("code") or 0), "error_subcode": int(error.get("error_subcode") or 0), "error_message": str(error.get("message") or ""), "blooio_code": blooio_code}


#meta puts why a send was rejected in the error object, a body that is not json has none
def graph_error(res: requests.Response) -> dict:
    try:
        return res.json().get("error") or {}

    except Exception:
        return {}


#blooio puts why it refused a text in the code field, a body that is not json has none
def blooio_error(res: requests.Response) -> str:
    try:
        return str(res.json().get("code") or "")

    except Exception:
        return ""

#SENDING FUNCTIONS 
def send_ig_message(recipient_id: str, text: str) -> dict:
    try:
        res = requests.post(
            IG_SEND_URL,
            headers={"Authorization": f"Bearer {IG_ACCESS_TOKEN}", "Content-Type": "application/json"},
            json={"recipient": {"id": recipient_id}, "message": {"text": text}},
            timeout=20,
        )
        if(res.status_code >= 400):
            print(f"[IG] send to {recipient_id} failed {res.status_code}: {res.text[:300]}")
            return send_result(False, graph_error(res))
        return send_result(True)
    except Exception as e:
        print(f"[IG] send to {recipient_id} errored: {e}")
        return send_result(False)


def send_messenger_message(recipient_id: str, text: str) -> dict:
    try:
        res = requests.post(
            MESSENGER_SEND_URL,
            headers={"Authorization": f"Bearer {MESSENGER_ACCESS_TOKEN}", "Content-Type": "application/json"},
            json={"recipient": {"id": recipient_id}, "messaging_type": "RESPONSE", "message": {"text": text}},
            timeout=20,
        )
        if(res.status_code >= 400):
            print(f"[MESSENGER] send to {recipient_id} failed {res.status_code}: {res.text[:300]}")
            return send_result(False, graph_error(res))
        return send_result(True)
    except Exception as e:
        print(f"[MESSENGER] send to {recipient_id} errored: {e}")
        return send_result(False)


def send_blooio_message(recipient: str, text: str) -> dict:
    try:
        res = requests.post(
            f"{BLOOIO_BASE_URL}/chats/{quote(recipient, safe='')}/messages",
            headers={"Authorization": f"Bearer {BLOOIO_API_KEY}", "Content-Type": "application/json"},
            json={"text": text},
            timeout=20,
        )
        if(res.status_code >= 400):
            print(f"[BLOOIO] send to {recipient} failed {res.status_code}: {res.text[:300]}")
            return send_result(False, blooio_code=blooio_error(res))
        return send_result(True)
    except Exception as e:
        print(f"[BLOOIO] send to {recipient} errored: {e}")
        return send_result(False)


def send_textbelt_message(recipient: str, text: str) -> dict:
    try:
        res = requests.post(
            TEXTBELT_SEND_URL,
            data={"phone": recipient, "message": text, "key": TEXTBELT_API_KEY},
            timeout=20,
        )
        if(res.status_code >= 400):
            print(f"[TEXTBELT] send to {recipient} failed {res.status_code}: {res.text[:300]}")
            return send_result(False)
        #textbelt answers 200 with success false when it did not send, like an out of quota key
        if(not res.json().get("success")):
            print(f"[TEXTBELT] send to {recipient} failed: {res.text[:300]}")
            return send_result(False)
        return send_result(True)
    except Exception as e:
        print(f"[TEXTBELT] send to {recipient} errored: {e}")
        return send_result(False)

