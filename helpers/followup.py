from helpers.state_form import message_history_form
from helpers.log import read_ids, read_bs, write_bs, remove_id, append_last, claim, FOLLOWUP_KEY
from helpers.restriction import is_restricted
from helpers.output_guard import guard_reply
from helpers import dashboard as dash
from helpers import delivery

from src.rage_functions import followup_gen

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import asyncio


#CONSTANTS
#8am at the shop, inside texting hours and the meta 24 hour window for anyone who messaged during the day before
FOLLOWUP_HOUR: int = 8

#most follow ups a customer gets before the system stops, starts over each time they answer
MAX_FOLLOWUPS: int = 5

#the conversation's last message has to be at least this old, so someone mid conversation is not followed up on
FOLLOWUP_WAIT_HOURS: int = 12

#ig and messenger only allow sending within 24 hours of the customer's last message
META_WINDOW_HOURS: int = 24


#seconds from now until the next 8am at the shop
def seconds_until_next_run() -> float:
    shop_time: datetime = datetime.now(ZoneInfo("America/Chicago"))

    next_run: datetime = shop_time.replace(hour=FOLLOWUP_HOUR, minute=0, second=0, microsecond=0)

    #already past 8am today, so the next run is tomorrow
    if(next_run <= shop_time):
        next_run = next_run + timedelta(days=1)

    #timestamps so a daylight savings switch overnight is still counted right
    return next_run.timestamp() - shop_time.timestamp()


#runs forever next to the webhooks, started once by app.py
async def followup_loop():
    while True:
        await asyncio.sleep(seconds_until_next_run())

        run_date: str = datetime.now(ZoneInfo("America/Chicago")).strftime("%Y-%m-%d")

        #during a deploy two instances can be up at 8am, only the one that claims the day sends
        if(claim(f"followup_run_{run_date}")):
            #worker thread so the webhooks keep answering while follow ups go out
            await asyncio.to_thread(send_followups)


#goes through every id waiting on an answer
def send_followups() -> None:
    ids: list[str] = read_ids(FOLLOWUP_KEY)

    print(f"FOLLOW UP RUN: {len(ids)} waiting")
    print()

    for id in ids:
        #one broken id must not stop the rest from getting their follow up
        try:
            send_followup(id)

        except Exception as error:
            print("FOLLOW UP ERROR: " + str(error))


#sends one follow up when the id is due, and drops the id when it never will be
def send_followup(id: str) -> None:
    book_state: dict = read_bs(f"{id}_bstate")

    channel: str = book_state.get("channel", "")
    followup_count: int = int(book_state.get("followup_count", 0))

    current_time: int = int(datetime.now().timestamp())
    hours_since_user: float = (current_time - int(book_state.get("last_user_time", 0))) / 3600
    hours_since_agent: float = (current_time - int(book_state.get("last_agent_time", 0))) / 3600

    #restricted customers are handled by a human, the dashboard toggle is checked first
    if(is_restricted(id)):
        remove_id(FOLLOWUP_KEY, id)
        return

    #the booking link went out, so they book through it on their own and are never followed up on
    if(book_state.get("booking_link_state", "") != ""):
        remove_id(FOLLOWUP_KEY, id)
        return

    #already got every follow up
    if(followup_count >= MAX_FOLLOWUPS):
        remove_id(FOLLOWUP_KEY, id)
        return

    #meta window closed, it only opens again when they message, which takes them off the list anyway
    if((channel == "ig" or channel == "messenger") and hours_since_user >= META_WINDOW_HOURS):
        remove_id(FOLLOWUP_KEY, id)
        return

    #the conversation's last message is too fresh, tomorrow's run checks again
    #the customer's counts too, since a sign off like "thanks" is left unanswered on purpose
    if(hours_since_agent < FOLLOWUP_WAIT_HOURS or hours_since_user < FOLLOWUP_WAIT_HOURS):
        return

    #ASSEMBLE THE STATE
    shop_time: datetime = datetime.now(ZoneInfo("America/Chicago"))

    current_date_time: str = shop_time.strftime("%A, %B %d, %Y at %I:%M %p")

    message_history: dict = message_history_form(id)

    state: dict = {"current_date_time": current_date_time, "followup_number": followup_count + 1, "message_history": message_history}

    #examples leave replies unquoted, but a stray quote the model adds is cut off
    followup: str = followup_gen(state).strip().strip('"')

    #OUTPUT SAFETY, cleaned up, and blocked with an owner alert when it leaks reasoning, a made up address, or a link that is not the shop's
    #a follow up always comes after a reply, so a greeting on it is cut
    followup = guard_reply(followup, id, channel, False)

    if(followup == ""):
        return

    #the switch can be flipped off while the follow up was written, so it is read fresh right before it goes out
    if(is_restricted(id, fresh=True)):
        remove_id(FOLLOWUP_KEY, id)
        return

    #SEND FOLLOW UP FOR PARTICULAR CHANNEL
    send_result: dict = delivery.send_message(channel, id, followup)

    if(not send_result["sent"]):
        #they can never get it, or blooio holds it until they text back, which takes them off the list anyway, so they are not tried again tomorrow
        if(delivery.unreachable(send_result)):
            remove_id(FOLLOWUP_KEY, id)

        return

    dash.log_outgoing(id, channel, followup)

    print(f"FOLLOW UP {followup_count + 1} SENT TO {id}: {followup}")
    print()

    #WRITE FOLLOW UP
    append_last(f"{id}_agentres", followup)

    write_bs(f"{id}_bstate", {"followup_count": followup_count + 1, "last_agent_time": current_time})
