from helpers import journal, delivery, missed_messages
from helpers import dashboard as dash
from helpers import username as un
from helpers.alerts import alert_owner
from helpers.log import first_seen
from helpers.restriction import is_restricted
from src.core import core
import asyncio, time


#CONSTANTS
#how long each channel waits for the customer to stop typing
BATCH_TIME: dict[str, int] = {"blooio": 10, "ig": 20, "messenger": 20}

#wait before each retry of a batch that was not answered, the last one repeats
RETRY_WAIT_SECONDS: list[int] = [60, 120, 300, 600, 900, 1800]

#the owner is texted when this many tries in a row failed
OWNER_ALERT_ATTEMPT: int = 3

#a batch is given up on after a day, the meta window is closed by then anyway
MAX_RETRY_SECONDS: int = 86400

#sent once after the first failed try, so the customer is never left in silence while the retries run
HOLDING_REPLY: str = "Thanks for your message. Give me a few minutes and I'll get right back to you."


#STATE, everything is keyed by "channel|id"
#countdown for each customer that is still typing
timer_dict: dict[str, asyncio.Task] = {}

#messages waiting to be answered, {"messages", "attempts", "holding_sent", "first_time"}
batch_dict: dict[str, dict] = {}

#one lock per customer so two runs never answer them at the same time, [lock, holders] so an idle lock is dropped
lock_dict: dict[str, list] = {}

#messages received per customer, a run is stale once this moves past what it started with
message_count_dict: dict[str, int] = {}


#an empty batch
def new_batch() -> dict:
    return {"messages": [], "attempts": 0, "holding_sent": False, "first_time": time.time()}


#one webhook message in, message is the channel's parts list like [text, attachments, referral]
async def add_message(channel: str, id: str, message_id: str | None, message: list, replay: bool = False) -> None:
    key: str = f"{channel}|{id}"

    if(not replay):
        #meta resends webhooks, an id already seen was already answered
        if(message_id):
            try:
                if(not await asyncio.to_thread(first_seen, f"{channel}_{message_id}")):
                    print(f"DUPLICATE WEBHOOK SKIPPED: {channel} {message_id}")
                    print()

                    return

            #redis down must not drop the message, it is answered without the dedupe
            except Exception as error:
                print("DEDUPE ERROR: " + str(error))

        #saved before buffering, so a restart during the batch timer replays it at boot
        try:
            await asyncio.to_thread(journal.save, channel, id, message)

        except Exception as error:
            print("JOURNAL SAVE ERROR: " + str(error))

        dash.log_incoming(id, channel)

    if(key not in batch_dict):
        batch_dict[key] = new_batch()

    batch_dict[key]["messages"].append(message)

    message_count_dict[key] = message_count_dict.get(key, 0) + 1

    #restart the clock for the current id
    if(key in timer_dict):
        timer_dict[key].cancel()

    timer_dict[key] = asyncio.create_task(batch(channel, id))


#main batch function, waits out the timer then answers under the customer's lock
async def batch(channel: str, id: str) -> None:
    key: str = f"{channel}|{id}"

    await asyncio.sleep(BATCH_TIME[channel])

    #removed before anything else, so a new message from here on starts its own timer instead of cancelling this run
    del timer_dict[key]

    lock_entry: list = lock_dict.setdefault(key, [asyncio.Lock(), 0])
    lock_entry[1] += 1

    try:
        async with lock_entry[0]:
            current_batch: dict | None = batch_dict.pop(key, None)

            #an earlier run already took these messages with its own
            if(current_batch is None):
                return

            await answer_until_done(channel, id, current_batch)

    finally:
        lock_entry[1] -= 1

        if(lock_entry[1] == 0):
            del lock_dict[key]

            #nothing waiting or running, so the count can start over
            if(key not in batch_dict and key not in timer_dict):
                message_count_dict.pop(key, None)


#runs core until the batch is answered, retrying with backoff, and hands it back when a newer message comes in
async def answer_until_done(channel: str, id: str, current_batch: dict) -> None:
    key: str = f"{channel}|{id}"

    count_at_start: int = message_count_dict.get(key, 0)

    #core runs in a worker thread, it calls this to see if a newer message came in
    def is_stale() -> bool:
        return message_count_dict.get(key, 0) != count_at_start

    #the name lookup is a blocking call, so it runs off the event loop
    user_name: str = await asyncio.to_thread(un.username, id, channel)

    #texts meta never sent a webhook for go in front of the batch, so the reply answers them too
    await take_missed(channel, id, current_batch, user_name)

    #each message is a parts list, core takes them as one flat list
    current_message_batch: list = [part for message in current_batch["messages"] for part in message]

    print(f"INCOMING MESSAGE BATCH FROM on {channel.upper()} from: {user_name}")
    print(f"Message batch: {current_message_batch}")
    print()

    while True:
        if(is_stale()):
            merge_back(channel, id, current_batch)
            return

        current_batch["attempts"] += 1

        #call core with await asyncio.to_thread(core_fn, core_args), to create a worker thread for current id to process without stopping program ever
        try:
            outcome: str = await asyncio.to_thread(core, current_message_batch, id, channel, is_stale)

        except Exception as error:
            print("CORE CRASHED: " + str(error))
            print()

            outcome = "failed"

        if(outcome == "done"):
            await close_batch(channel, id, current_batch)
            return

        if(outcome == "stale"):
            merge_back(channel, id, current_batch)
            return

        #FAILED, so it is retried with backoff until it gets through or is a day old
        if(time.time() - current_batch["first_time"] > MAX_RETRY_SECONDS):
            print(f"GIVING UP ON {channel.upper()} BATCH FROM: {user_name}")
            print()

            await asyncio.to_thread(alert_owner, f"MAMS GAVE UP after retrying for a day\nCHANNEL: {channel}\nCUSTOMER: {user_name}\nTheir message never got a reply, reply manually and check the server logs")

            await close_batch(channel, id, current_batch)
            return

        if(not current_batch["holding_sent"]):
            current_batch["holding_sent"] = True

            await asyncio.to_thread(send_holding_reply, channel, id)

        if(current_batch["attempts"] == OWNER_ALERT_ATTEMPT):
            await asyncio.to_thread(alert_owner, f"MAMS FAILED {OWNER_ALERT_ATTEMPT} TIMES and is still retrying\nCHANNEL: {channel}\nCUSTOMER: {user_name}\nReply manually if you can and check the server logs")

        wait_seconds: int = RETRY_WAIT_SECONDS[min(current_batch["attempts"], len(RETRY_WAIT_SECONDS)) - 1]

        print(f"RETRY {current_batch['attempts']} FOR {channel.upper()} BATCH FROM {user_name} IN {wait_seconds}s")
        print()

        #a newer message ends the wait early, the stale check at the top hands it back
        waited: int = 0

        while(waited < wait_seconds and not is_stale()):
            await asyncio.sleep(1)

            waited += 1


#meta does not send a webhook for every message, so the conversation is checked and a text that never came in joins the front of the batch
async def take_missed(channel: str, id: str, current_batch: dict, user_name: str) -> None:
    try:
        recovered: list[list] = await asyncio.to_thread(missed_messages.recover, channel, id)

    #the batch is still answered with what did come in
    except Exception as error:
        print("MISSED MESSAGE CHECK ERROR: " + str(error))

        return

    if(recovered == []):
        return

    #journaled at the head with the rest of this batch, so a restart replays them and close_batch trims them with it
    try:
        await asyncio.to_thread(journal.save_front, channel, id, recovered)

    except Exception as error:
        print("JOURNAL SAVE ERROR: " + str(error))

    for message in recovered:
        dash.log_incoming(id, channel)

        print(f"MISSED {channel.upper()} MESSAGE RECOVERED FROM {user_name}: {message[0]}")

    print()

    current_batch["messages"] = recovered + current_batch["messages"]


#a newer message came in, so this batch goes back in front of it and both get answered together
def merge_back(channel: str, id: str, current_batch: dict) -> None:
    key: str = f"{channel}|{id}"

    print(f"STALE RUN FOR {channel.upper()} {id}, ANSWERING IT WITH THE NEWER MESSAGE")
    print()

    pending_batch: dict | None = batch_dict.get(key)

    if(pending_batch is None):
        batch_dict[key] = current_batch

        if(key not in timer_dict):
            timer_dict[key] = asyncio.create_task(batch(channel, id))

        return

    pending_batch["messages"] = current_batch["messages"] + pending_batch["messages"]
    pending_batch["attempts"] = max(pending_batch["attempts"], current_batch["attempts"])
    pending_batch["holding_sent"] = pending_batch["holding_sent"] or current_batch["holding_sent"]
    pending_batch["first_time"] = min(pending_batch["first_time"], current_batch["first_time"])


#the batch is answered or given up on, so its messages are trimmed off the journal
async def close_batch(channel: str, id: str, current_batch: dict) -> None:
    try:
        await asyncio.to_thread(journal.clear, channel, id, len(current_batch["messages"]))

    except Exception as error:
        print("JOURNAL CLEAR ERROR: " + str(error))


#tells the customer the answer is coming, never sent to someone the bot is switched off for, read fresh since a flip can be newer than the cache
def send_holding_reply(channel: str, id: str) -> None:
    try:
        if(is_restricted(id, fresh=True)):
            return

        send_result: dict = delivery.send_message(channel, id, HOLDING_REPLY)

        if(not send_result["sent"]):
            print(f"HOLDING REPLY NOT SENT TO {id}")
            print()

            return

        dash.log_outgoing(id, channel, HOLDING_REPLY)

        print(f"HOLDING REPLY SENT TO {id}")
        print()

    except Exception as error:
        print("HOLDING REPLY ERROR: " + str(error))


#at boot, every message that never got answered goes back through the batcher
async def replay() -> None:
    journaled: list[tuple] = await asyncio.to_thread(journal.pending)

    for channel, id, messages in journaled:
        if(channel not in BATCH_TIME):
            continue

        print(f"REPLAYING {len(messages)} UNANSWERED MESSAGES ON {channel.upper()} FROM: {id}")
        print()

        for message in messages:
            await add_message(channel, id, None, message, replay=True)
