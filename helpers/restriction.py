from helpers.log import redis_client, add_id, has_id, remove_id, read_ids, RESTRICTED_KEY
from helpers import dashboard as dash
import threading, time


#CONSTANTS
#ids restricted here whose restrict event the dashboard has not taken yet, they stay restricted even though the dashboard does not list them
RESTRICTED_UNACKED_KEY: str = "hil_restricted_unacked"

#the restrict event keeps being sent through 4xx and deploys, so a handoff is never lost
RESTRICT_RETRY_WAITS: list[int] = [30, 120, 300]

#set once, so ids restricted before the dashboard existed are only pushed to it on the first boot
RESTRICTED_SYNCED_KEY: str = "dash_restricted_synced"


#hands a customer to a human, and mirrors it to the dashboard toggle
def restrict(id: str) -> None:
    if(not has_id(RESTRICTED_KEY, id)):
        add_id(RESTRICTED_KEY, id)

    if(not dash.ENABLED):
        return

    if(not has_id(RESTRICTED_UNACKED_KEY, id)):
        add_id(RESTRICTED_UNACKED_KEY, id)

    threading.Thread(target=mirror_restricted, args=(id,), daemon=True).start()


#keeps sending the restrict event until the dashboard takes it
def mirror_restricted(id: str) -> None:
    for attempt in range(len(RESTRICT_RETRY_WAITS) + 1):
        if(dash.post_event({"event": "restrict", "userId": id})):
            #the dashboard owns it now, so the owner's toggle can turn the bot back on
            remove_id(RESTRICTED_UNACKED_KEY, id)
            return

        if(attempt < len(RESTRICT_RETRY_WAITS)):
            time.sleep(RESTRICT_RETRY_WAITS[attempt])

    print(f"DASH RESTRICT NEVER TAKEN FOR {id}, KEEPING IT RESTRICTED LOCALLY")
    print()


#turns the bot back on for a customer who sent a new website quote, here and on the dashboard toggle
def unrestrict(id: str) -> None:
    remove_id(RESTRICTED_KEY, id)
    remove_id(RESTRICTED_UNACKED_KEY, id)

    if(not dash.ENABLED):
        return

    threading.Thread(target=mirror_unrestricted, args=(id,), daemon=True).start()


#keeps sending the unrestrict event until the dashboard takes it, core answers the quote either way
def mirror_unrestricted(id: str) -> None:
    for attempt in range(len(RESTRICT_RETRY_WAITS) + 1):
        if(dash.post_event({"event": "unrestrict", "userId": id})):
            #refreshes the cached switch, so their next text is answered right away
            dash.restricted_ids(fresh=True)
            return

        if(attempt < len(RESTRICT_RETRY_WAITS)):
            time.sleep(RESTRICT_RETRY_WAITS[attempt])

    print(f"DASH UNRESTRICT NEVER TAKEN FOR {id}, THE DASHBOARD STILL HAS THE BOT OFF FOR THEM")
    print()


#dashboard first so the owner's toggle wins, local redis when the dashboard is off or down
#fresh rereads the dashboard past its 15 second cache, for the check right before a send
def is_restricted(id: str, fresh: bool = False) -> bool:
    local: bool = has_id(RESTRICTED_KEY, id)

    if(not dash.ENABLED):
        return local

    remote_ids: set | None = dash.restricted_ids(fresh)

    if(remote_ids is None):
        return local

    if(id in remote_ids):
        #kept locally too, so a later dashboard outage still has the owner's choice
        if(not local):
            add_id(RESTRICTED_KEY, id)

        return True

    #restricted here but the event has not landed yet, so it is not the owner turning the bot back on
    if(has_id(RESTRICTED_UNACKED_KEY, id)):
        return True

    #the owner turned the bot back on in the dashboard
    if(local):
        remove_id(RESTRICTED_KEY, id)

    return False


#at boot, resends restrict events that never landed, and pushes ids restricted before the dashboard existed once
def sync_restricted() -> None:
    if(not dash.ENABLED):
        return

    for id in read_ids(RESTRICTED_UNACKED_KEY):
        threading.Thread(target=mirror_restricted, args=(id,), daemon=True).start()

    if(redis_client.set(RESTRICTED_SYNCED_KEY, "1", nx=True)):
        for id in read_ids(RESTRICTED_KEY):
            restrict(id)
