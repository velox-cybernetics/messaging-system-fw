from dotenv import load_dotenv
from helpers import senders as send
from helpers.log import redis_client
import os, time, requests

load_dotenv()

#the owner's phone, every alert goes to it over blooio
HIL_RECIPENT: str = os.getenv("HIL_RECIPENT")

#CONSTANTS
ALERT_ATTEMPTS: int = 3
ALERT_RETRY_SECONDS: int = 5

#texts the owner, retried so one blooio hiccup does not swallow a handoff
def alert_owner(message: str) -> bool:
    for attempt in range(1, ALERT_ATTEMPTS + 1):
        if(send.send_textbelt_message(HIL_RECIPENT, message)["sent"]):
            return True

        print(f"OWNER ALERT ATTEMPT {attempt}/{ALERT_ATTEMPTS} FAILED")

        if(attempt < ALERT_ATTEMPTS):
            time.sleep(ALERT_RETRY_SECONDS)

    print("OWNER ALERT NEVER SENT: " + message)
    print()

    return False


#sends one alert per key until it expires, so a dead token does not text the owner for every customer
def alert_owner_once(key: str, seconds: int, message: str) -> bool:
    if(not redis_client.set(f"alert_{key}", "1", nx=True, ex=seconds)):
        return False

    sent: bool = alert_owner(message)

    #never reached the owner, so the next failure gets to try again
    if(not sent):
        redis_client.delete(f"alert_{key}")

    return sent
