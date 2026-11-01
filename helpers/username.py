from dotenv import load_dotenv
import os, requests

load_dotenv()
IG_ACCESS_TOKEN = os.environ["IG_ACCESS_TOKEN"]

#getenv so the ig and blooio servers still start before the messenger page token is in .env
MESSENGER_ACCESS_TOKEN = os.getenv("MESSENGER_ACCESS_TOKEN")

def username_ig(ig_id: str) -> str:
    res = requests.get(
        f"https://graph.instagram.com/v25.0/{ig_id}",
        headers={"Authorization": f"Bearer {IG_ACCESS_TOKEN}"},
        params={"fields": "username"},
        timeout=20,
    )

    res.raise_for_status()
    return res.json()["username"]


#messenger has no username, so the name comes from the participants of the page's conversation with them
def username_messenger(psid: str) -> str:
    try:
        res = requests.get(
            "https://graph.facebook.com/v25.0/me/conversations",
            headers={"Authorization": f"Bearer {MESSENGER_ACCESS_TOKEN}"},
            params={"user_id": psid, "fields": "participants"},
            timeout=20,
        )

        res.raise_for_status()

        for conversation in res.json().get("data", []):
            for participant in conversation.get("participants", {}).get("data", []):
                if(participant.get("id") == psid):
                    return participant.get("name", psid)

    #the psid still identifies them, so a failed lookup never stops a reply or an alert
    except Exception as error:
        print(f"[MESSENGER] name lookup for {psid} failed: {error}")

    return psid


def username(id: str, channel: str) -> str:
    #the id still identifies them, so a failed lookup never stops an alert
    try:
        if(channel == "ig"):
            return username_ig(id)

        elif(channel == "messenger"):
            return username_messenger(id)

    except Exception as error:
        print(f"[{channel.upper()}] name lookup for {id} failed: {error}")

    #blooio ids are already the customer's phone number
    return id
