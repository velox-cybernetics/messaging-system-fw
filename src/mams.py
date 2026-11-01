from src import rage_functions as rf
from helpers import username as un
from helpers import log as lg
from helpers.alerts import alert_owner
from helpers.restriction import restrict
import re

#S_P BRANCH
def service_and_pricing_branch(state: dict, handoff: dict) -> str:
    s_and_p_result: list = rf.service_and_pricing_analyzer(state) 

    s_and_p_reply: str = rf.service_and_pricing_generator(state, s_and_p_result)

    try:
        s_and_p_enforce: bool = rf.service_and_pricing_enforcer(state, s_and_p_reply)

        print("*"*25)
        print(f"S_P Enforcer Result: {s_and_p_enforce}")
        print()

        if(s_and_p_enforce):
            s_and_p_reply = rf.service_and_pricing_regen(state, s_and_p_result, s_and_p_reply)

    except Exception as error:
        print("S_P CHECK ERROR: " + str(error))

    #s_p asked for pictures, so wait on them before handing off to a human, same as services_req_humans
    if(re.search(r"send.{0,40}\b(pics?|pictures?|photos?)\b", s_and_p_reply, re.IGNORECASE)):
        handoff["queue"] = "add"

    return s_and_p_reply


#BUSINESS_OPS BRANCH
def business_operations_branch(state: dict) -> str:
    business_ops_result: list = rf.business_operations_analyzer(state) 

    business_ops_reply: str = rf.business_operations_generator(state, business_ops_result) 
    
    #a failed check or regen still sends the first reply
    try:
        business_ops_enforce: bool = rf.business_operations_enforcer(state, business_ops_reply)

        print("*"*25)
        print(f"B_Ops Enforcer Result: {business_ops_enforce}")
        print()

        if(business_ops_enforce):
            business_ops_reply = rf.business_operations_regen(state, business_ops_result, business_ops_reply)

            return business_ops_reply 
        else: 
            return business_ops_reply

    except Exception as error:
        print("B_O CHECK ERROR: " + str(error))

        return business_ops_reply


#BOOKING BRANCH
def booking_branch(state: dict, id: str, handoff: dict) -> str:
    booking_state: dict = lg.read_bs(f"{id}_bstate")

    car_model: str = booking_state.get("car_model", "")

    pricing_sent: str = booking_state.get("pricing_state", "")

    if(car_model != "" and pricing_sent != ""):
        booking_link_sent: bool = booking_state.get("booking_link_state", "") != ""

        booking_details: dict = {"booking_link": rf.BOOKING_LINK, "booking_link_sent": booking_link_sent, "car_model": car_model}

        booking_reply: str = rf.booking_generator(state, booking_details)

        #a failed check or regen still sends the first reply
        try:
            booking_enforce: bool = rf.booking_enforcer(state, booking_details, booking_reply)

            print("*"*25)
            print(f"Booking Enforcer Result: {booking_enforce}")
            print()

            if(booking_enforce):
                booking_reply = rf.booking_regen(state, booking_details, booking_reply)

                return booking_reply

            else:
                return booking_reply

        except Exception as error:
            print("BOOKING CHECK ERROR: " + str(error))

            return booking_reply

    #the service is priced but the car is not known, so ask for it before booking
    elif(pricing_sent != ""):
        car_model_reply: str = rf.car_model_integrator_gen(state)

        return car_model_reply

    #nothing was priced yet, with or without a car, so the service branch asks what they want done and for their car, and answers what it can
    #the car only question would leave the service unknown and the customer's own question unanswered
    else:
        return service_and_pricing_branch(state, handoff)


#HIL ALERT
def hil_alert(reason: str, id: str, state: dict, channel: str) -> None:
    user_text: str = state["current_user_message"]["user_text"]
    user_name: str = un.username(id, channel)

    #retried up to 3 times, so one blooio hiccup does not leave the owner unaware of a handoff
    alert_owner(f"HIL TRIGERED, due to {reason}\nCHANNEL: {channel}\nCUSTOMER: {user_name}\nMESSAGE: {user_text}")


#HANDOFF
#what the branches want done once the reply is out, core applies it only then so a stale or failed run leaves nothing behind
#sign_off marks a thanks or sign off left unanswered on purpose, so its follow ups still go out like after a reply
def new_handoff() -> dict:
    return {"hil_reason": "", "queue": "", "sign_off": False}


#the human takes over and the picture wait starts or ends, only ever called once the reply is out
def apply_handoff(handoff: dict, id: str, state: dict, channel: str) -> None:
    if(handoff["hil_reason"] != ""):
        hil_alert(handoff["hil_reason"], id, state, channel)

        restrict(id)

    if(handoff["queue"] == "add"):
        lg.add_id(lg.HIL_QUEUE_KEY, id)

    elif(handoff["queue"] == "remove"):
        lg.remove_id(lg.HIL_QUEUE_KEY, id)


#MAMS
def mams(state: dict, id: str, channel: str, handoff: dict) -> str: 

    #customer was asked for pictures, so jev decides if they are answering that ask, asking something on the side, or broke out of it
    if(lg.has_id(lg.HIL_QUEUE_KEY, id)):
        waiting_result: str = rf.waiting_analyzer(state)

        print("*"*25)
        print(f"WAITING RESULT: {waiting_result}")
        print()

        #customer is answering the picture request, so acknowledge it and hand them to a human
        if(waiting_result == "pictures"):
            ack_reply: str = rf.acknowledge_service_gen(state)

            handoff["hil_reason"] = "HUMAN NEEDED FOR SERVICE"
            handoff["queue"] = "remove"

            return ack_reply

        #customer dropped the custom job, so they stop waiting on the pictures
        elif(waiting_result == "broke_out"):
            handoff["queue"] = "remove"

        #broke_out and side_question are routed like any other message, a side question still waits on the pictures

    #ROUTE
    route_result: str = rf.route(state)

    #logging
    print("*"*25)
    print(f"ROUTE RESULT: {route_result}")
    print()

    #s_p branch
    if(route_result == "service_and_pricing"):
        return service_and_pricing_branch(state, handoff)

    #business_ops branch 
    elif(route_result == "business_operations"):
        return business_operations_branch(state)

    #booking branch
    elif(route_result == "booking"):
        return booking_branch(state, id, handoff)


    #services_req_humans branch
    elif(route_result == "services_req_humans"):
        s_rh_reply: str = rf.services_rh_gen(state)

        #wait on the pictures before handing off to a human
        handoff["queue"] = "add"

        return s_rh_reply

    #on_the_fence branch
    elif(route_result == "on_the_fence"):
        fence_reply: str = rf.on_the_fence_gen(state)

        #a failed check or regen still sends the first reply
        try:
            fence_enforce: bool = rf.on_the_fence_enforcer(state, fence_reply)

            print("*"*25)
            print(f"on_the_fence Enforcer Result: {fence_enforce}")
            print()

            if(fence_enforce):
                fence_reply = rf.on_the_fence_regen(state, fence_reply)

                return fence_reply
            else:
                return fence_reply

        except Exception as error:
            print("ON THE FENCE CHECK ERROR: " + str(error))

            return fence_reply

    #closing_statements branch, a thanks or sign off needs no reply, the customer is not muted so their next message still gets answered
    elif(route_result == "closing_statements"):
        handoff["sign_off"] = True

        return ""

    #phone_call branch
    elif(route_result == "phone_call"):
        phone_reply: str = rf.phone_call_gen(state)

        #trigger hil
        handoff["hil_reason"] = "PHONE CALL"

        return phone_reply

    elif(route_result == "escalation"):
        esclation_reply: str = rf.escalation_gen(state)

        #trigger hil
        handoff["hil_reason"] = "ESCLATION"

        return esclation_reply

    #printed_wrap branch, the owner prices printed wraps himself so the customer is told he will reach out
    elif(route_result == "printed_wrap"):
        printed_wrap_reply: str = rf.escalation_gen(state)

        #trigger hil
        handoff["hil_reason"] = "PRINTED WRAP"

        return printed_wrap_reply

    #off topic or spam is ignored, but the customer is not muted so their next real message still gets answered
    elif(route_result == "off_topic"):
        return ""

    #covers owner_convo and general_text, a human takes over so the owner is told who it is
    else:
        handoff["hil_reason"] = route_result.upper()
        return ""


