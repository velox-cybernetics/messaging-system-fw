from helpers.state_form import message_form, message_history_form
from helpers.car_model_analyze import car_model_analyze
from helpers.not_interested_analyze import not_interested_analyze
from helpers.history_recovery import recover_history
from helpers.log import write, write_bs, read_bs, has_id, add_id, remove_id, FOLLOWUP_KEY
from helpers.restriction import is_restricted
from helpers.output_guard import guard_reply, drop_greeting, drop_links
from helpers import dashboard as dash
from helpers import delivery

from src import mams as m
from src.rage_functions import BOOKING_LINK

from collections.abc import Callable
from datetime import datetime
from zoneinfo import ZoneInfo
import json


#core function that handles states and calls mams()
#returns "done", "failed" so the batcher retries it, or "stale" when a newer message came in and both get answered together
def core(current_message_batch: list, id: str, channel: str, is_stale: Callable[[], bool]) -> str:

    #CREATE USER MESSAGE FROM MESSAGE BATCH, previews are the downloaded media for the dashboard and never go to the models
    try:
        user_message, previews = message_form(current_message_batch, channel)

    #media that breaks is dropped, so the text still gets answered
    except Exception as error:
        print("MESSAGE FORM ERROR: " + str(error))

        text_batch: list = []

        for message in current_message_batch:
            if(isinstance(message, str)):
                text_batch.append(message)

        #text only, so there are no previews
        user_message, previews = message_form(text_batch, channel)

    #RECOVER A WIPED HISTORY, a customer the bot has no turns for gets the thread the dashboard kept (every customer from before the v2 cutover) folded in first
    try:
        recover_history(id, channel)

    #without it the message is still answered, as a first message
    except Exception as error:
        print("HISTORY RECOVERY ERROR: " + str(error))


    #ASSEMBLE THE MESSAGE HISTORY
    message_history: dict = {}
    try:
        message_history = message_history_form(id) 

    #without history message can stil be answered on its own
    except Exception as error:
        print("HISTORY ERROR: " + str(error))


    #ANALYZE THE USER_MESSAGE FOR A CAR MODEL 
    try:
        book_state: dict = read_bs(f"{id}_bstate")

        #runs every message with the history, so a car switch or a car finished over a few messages still gets saved
        car_model: str = car_model_analyze(user_message, message_history) 

        print(f"CAR_MODEL: {car_model}")
        print()

        if(car_model != "" and car_model != book_state.get("car_model", "")):
            write_bs(f"{id}_bstate", {"car_model": car_model})

    #a failed car model call must not stop the message from being answered
    except Exception as error:
        print("CAR MODEL ERROR: " + str(error))


    #ANALYZE THE USER_MESSAGE FOR NOT INTERESTED
    not_interested: bool = False
    try:
        not_interested = not_interested_analyze(user_message, message_history)

        print(f"NOT_INTERESTED: {not_interested}")
        print()

    #when unsure no follow up goes out, and the message still gets answered
    except Exception as error:
        print("NOT INTERESTED ERROR: " + str(error))

        not_interested = True


    #USER ANSWERED, SO FOLLOW UPS START OVER FROM HERE
    try:
        remove_id(FOLLOWUP_KEY, id)

        write_bs(f"{id}_bstate", {"channel": channel, "last_user_time": int(datetime.now().timestamp()), "followup_count": 0})

    except Exception as error:
        print("FOLLOW UP STATE ERROR: " + str(error))

    
    #ASSEMBLE THE STATE
    shop_time: datetime = datetime.now(ZoneInfo("America/Chicago"))

    current_date_time: str = shop_time.strftime("%A, %B %d, %Y at %I:%M %p")

    state: dict = {"current_date_time": current_date_time, "current_user_message": user_message, "message_history": message_history}


    #A NEWER MESSAGE CAME IN, so mams is skipped and the batcher answers everything together
    if(is_stale()):
        return "stale"


    #QUOTE GREETING, the quote webhook sets it so the first message out to a website quote opens with it, it stays set until that message is answered
    quote_greeting: str = ""

    try:
        quote_greeting = read_bs(f"{id}_bstate").get("quote_greeting", "")

    except Exception as error:
        print("QUOTE GREETING ERROR: " + str(error))


    #RESPONSE OF "AGENT"
    agent_response: str = ""

    #what the branches want done once the reply is out, like handing the customer to a human
    handoff: dict = m.new_handoff()

    try:

        #switched off in the dashboard or handed to a human, so nothing is generated or sent, their message only goes to the dashboard
        #a website quote is always answered, the quote webhook turned the bot back on for it
        if(quote_greeting == "" and is_restricted(id)):
            print("RESTRICTED, NO REPLY: " + id)
            print()

        else:
            agent_response = m.mams(state, id, channel, handoff)

        #examples wrap replies in quotes, so a stray quote the model copies over is cut off
        agent_response = agent_response.strip().strip('"')

    #nothing was sent yet, so the batcher retries it with backoff
    except Exception as error:
        print("CORE ERROR: " + str(error))
        print()

        return "failed"


    #OUTPUT SAFETY, cleaned up, and blocked with an owner alert when it leaks reasoning, a made up address, or a link that is not the shop's
    #the greeting only opens the first reply, a later reply that still has one ("Hey Jailene, ") gets it cut so a customer is never greeted twice
    agent_response = guard_reply(agent_response, id, channel, message_history == {})


    #A NEWER MESSAGE CAME IN while this one was generated, so it is not sent
    if(is_stale()):
        return "stale"


    #QUOTE GREETING opens the first message out to a website quote
    if(agent_response != "" and quote_greeting != ""):
        agent_response = with_quote_greeting(quote_greeting, agent_response)


    #SWITCHED OFF while this one was generated, so it is not sent, read fresh since the cached switch can be 15 seconds old, a website quote is always answered
    if(agent_response != "" and quote_greeting == "" and is_restricted(id, fresh=True)):
        print("RESTRICTED BEFORE SEND, REPLY DROPPED: " + id)
        print()

        agent_response = ""

        #nothing went out, so no hand off or picture wait comes from it
        handoff = m.new_handoff()

    
    #SEND RESPONSE FOR PARICULAR CHANNEL 
    if(agent_response != ""): 
        send_result: dict = delivery.send_message(channel, id, agent_response)

        #blooio takes no links until the customer has texted back once, a website quote never has, so the reply goes out again without them
        if(delivery.links_refused(send_result) and drop_links(agent_response) != ""):
            agent_response = drop_links(agent_response)

            print(f"LINKS REFUSED, SENDING WITHOUT THEM: {agent_response}")
            print()

            send_result = delivery.send_message(channel, id, agent_response)

        if(not send_result["sent"]):

            #they blocked the account, the window closed, meta refused the reply, or blooio holds every text until they text back, a retry never reaches them so the turn is recorded as unanswered and shows as waiting in the dashboard
            if(delivery.unreachable(send_result)):
                agent_response = ""

            #nothing changed yet, so the retry starts clean
            else:
                return "failed"

        else:
            print(f"AGENT SENT: {agent_response}")
            print()

            #pricing and booking link states updated only once the provider accepted the reply
            try:
                record_sent_states(id, channel, agent_response)

            except Exception as error:
                print("SENT STATE ERROR: " + str(error))


    #HANDOFF, the human takes over and the picture wait starts or ends only once the reply is out, so a stale or failed run leaves nothing behind for the retry
    try:
        m.apply_handoff(handoff, id, state, channel)

    except Exception as error:
        print("HANDOFF ERROR: " + str(error))


    #the quote greeting only ever goes on the first message out
    if(quote_greeting != ""):
        try:
            write_bs(f"{id}_bstate", {"quote_greeting": ""})

        except Exception as error:
            print("QUOTE GREETING ERROR: " + str(error))


    #DASHBOARD, customer batch first and then the reply in the same thread so the thread stays in order
    customer_text: str = user_message["user_text"].strip()
    customer_media: list[dict] = dashboard_media(user_message, previews)

    if(agent_response != ""):
        dash.log_outgoing(id, channel, agent_response, customer_text, customer_media)
    else:
        dash.log_customer_message(id, channel, customer_text, customer_media)


    #WRITE USER_MESSAGE AND AGENT RESPONSE, written together only once the turn is done so a retry never writes it twice
    try:
        write(f"{id}_usermsg", user_message)

        write(f"{id}_agentres", agent_response)

    except Exception as error:
        print("WRITE ERROR: " + str(error))


    #QUEUE FOLLOW UP, when the customer got a reply or only signed off, and did not say they are not interested
    if((agent_response != "" or handoff["sign_off"]) and not not_interested):
        try:
            if(not has_id(FOLLOWUP_KEY, id)):
                add_id(FOLLOWUP_KEY, id)

            #a sign off gets no reply, so the time of the shop's last message stays as it was
            if(agent_response != ""):
                write_bs(f"{id}_bstate", {"last_agent_time": int(datetime.now().timestamp())})

        except Exception as error:
            print("FOLLOW UP STATE ERROR: " + str(error))

    return "done"


#the quote greeting in place of the greeting the models open a first message with
def with_quote_greeting(quote_greeting: str, agent_response: str) -> str:
    answer: str = drop_greeting(agent_response)

    if(answer == ""):
        return quote_greeting

    return quote_greeting + "\n\n" + answer


#each preview with what the models said it showed, as {"type", "data_url", "description"} for the dashboard
def dashboard_media(user_message: dict, previews: list[dict]) -> list[dict]:
    customer_media: list[dict] = []

    for preview in previews:
        media_element: dict = user_message["user_media"].get(f"media_element_{preview['index']}", {})

        description: str = " ".join(str(value) for value in media_element.values() if value)

        customer_media.append({"type": preview["type"], "data_url": preview["data_url"], "description": description})

    return customer_media


#a delivered reply sets the pricing and booking link states, and pushes the quote the booking site reads
def record_sent_states(id: str, channel: str, agent_response: str) -> None:
    if("$" in agent_response):
        write_bs(f"{id}_bstate", {"pricing_state": "SENT"}) 

    quoted: dict = dash.quote_from_reply(agent_response)

    #every priced reply is the newest quote
    if(quoted["amounts"] != []):
        write_bs(f"{id}_bstate", {"quoted_text": quoted["text"], "quoted_amounts": json.dumps(quoted["amounts"]), "quoted_at": quoted["at"]})

        dash.log_quote(id, channel, quoted)

    if(BOOKING_LINK in agent_response):
        write_bs(f"{id}_bstate", {"booking_link_state": "SENT"})

        book_state: dict = read_bs(f"{id}_bstate")

        #pushed again with the link, so the booking site has the quote even if the earlier push was lost
        if(quoted["amounts"] == [] and book_state.get("quoted_text")):
            quoted_amounts = book_state["quoted_amounts"]

            #redis can hand the json back already parsed
            if(isinstance(quoted_amounts, str)):
                quoted_amounts = json.loads(quoted_amounts)

            dash.log_quote(id, channel, {"text": book_state["quoted_text"], "amounts": quoted_amounts, "at": book_state["quoted_at"]})
