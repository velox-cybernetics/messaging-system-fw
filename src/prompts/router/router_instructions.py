#instructions for the router as well as examples 

# HOUSTON ANNIVERSARY SALE START
from src.prompts import anniversary_sale
# HOUSTON ANNIVERSARY SALE END

def service_and_prices_instructions() -> str: 
    instructions: str = """
    The customer is asking about a service or its price. That covers:
    - any service the shop offers (window tint, vinyl wrap, clear PPF, colored PPF, windshield PPF, ceramic coating, paint correction, caliper wraps, starlight headliner), including its price, a quote, an estimate, specs, coverage, shades, star counts, warranty, turnaround time, or how long the job takes
    - any vague request for a price or a start, like "how much", "can I get an estimate", "get started", or a booking request that names no service yet, like "can I book an appointment" or "can I get on the schedule"
    - media from the shop about a service, like "how much is this" or "info on this" with a post, reel, story, or ad attached, even if the text also asks where the shop is
    - the customer giving their vehicle because the shop's last response in `message_history` asked for it to price a service
    - a short follow up that only makes sense with `message_history`, like "what about the windshield", "how much for that one", or "same for my other car", when the shop was just discussing a service
    - the customer only giving their vehicle with no service yet, like "hey i got a 2019 camry", so the shop can ask what they want done
    - a photo or video of the customer's own car with no text or vague text, like "can yall do this", "thoughts?", or "how much", so the shop can ask what they want done
    - the customer changing the job (a different service, quantity, or vehicle), even while saying yes to booking
    - the customer telling the shop something new that adds or changes a priced part of the job, even while saying yes to booking, like old tint or film already on the windows that is peeling or has to come off (tint removal), or a sunroof on a starlight job
    - a hood only wrap, tint removal, or clear PPF on just the front bumper, those are priced services
    - NOT a roof wrap, a partial wrap that is not the hood, a chrome delete, house tint, a motorcycle, or any other custom job, those are services_req_humans
    - NOT a printed wrap or a wrap with their own design, logo, or graphics printed on it, that is printed_wrap
    - NOT a complaint about past work, a refund, financing, or a car already at the shop, those are escalation
    """

    # HOUSTON ANNIVERSARY SALE START
    instructions += anniversary_sale.router_service_note()
    # HOUSTON ANNIVERSARY SALE END

    return instructions

def booking_instructions() -> str:
    return """
    The customer wants to book. That covers:
    - the shop's last response in `message_history` asked if they want to get booked or on the schedule, and the customer answers yes in any form ("yes", "yeah lets do it", "ok book me", "sure"). This wins even when the same message also asks a side question that does not change the job, like a discount, a waiting area, or where the shop is. It does NOT win when the message also tells the shop something that changes the price, like old tint on the windows that has to come off, that is service_and_pricing
    - the customer says they want to book at a specific time, like "this week", "Friday", or "any spots today at the shepherd location"
    - the customer asks if they need an appointment or can walk in
    - the customer gives their vehicle because the shop's last response in `message_history` said it needs it before getting them on the books
    - the customer gives booking details the shop asked for
    - a go ahead like "alright lets do it" or "book me" for a job the shop already priced in `message_history`, when the shop has not sent the booking link yet, even if the shop's last response did not ask
    """

def business_operations_instructions() -> str:
    return """
    The customer is asking about the shop itself, not a service. That covers hours, open or closed status ("yall open today", "yall have time right now", "can i swing by rn", "can i come thru today"), where the shop is located or its address, email, website, its social media like instagram or tiktok, who owns the shop, who they are talking to or if they are talking to a real person or a bot ("is this preston", "am i talking to a bot", "r u a bot lol"), how long the shop has been in business, how many employees it has, whether it is licensed or registered, and which payment methods it accepts. It also covers a bare greeting with nothing else, like "hey", "hello", "yo", or "hola". NOT the phone number or a phone call, that is phone_call. NOT financing or payment plans, those are escalation.
    Only when the message has no service question, no service media from the shop, and no yes to a booking question.
    """

def services_req_humans_instructions() -> str:
    return """
    The customer is asking about a service the owner can only price after seeing pictures. That covers:
    - a roof wrap, including the roof with the pillars or mirrors
    - a partial wrap that is NOT only the hood, like the doors, one side, the bumpers, half the car, or stripes
    - a chrome delete, blacking out chrome trim, window trim, badges, or emblems
    - any other custom service that is not one of the shop's set services and depends on the car or the job, like removing an old wrap or PPF, or a hood that is not the factory hood
    - PPF or a wrap on only certain panels, after they turn down the full package the shop already offered, except clear PPF on just the front bumper
    - window tint for a house, office, or any building
    - a vehicle the shop has no set price for, like a motorcycle, boat, or RV
    NOT a factory hood only wrap, NOT tint removal, and NOT clear PPF on just the front bumper, those are service_and_pricing. NOT a printed wrap or a wrap with their own design, logo, or graphics, that is printed_wrap. NOT a complaint, refund, financing, or a car already at the shop, those are escalation.
    """

def printed_wrap_instructions() -> str:
    return """
    The customer is asking about a printed wrap, which the owner handles himself. That covers:
    - asking if the shop does printed wraps, or the price, a quote, or any detail of one, like "do yall do printed wraps" or "how much for a printed wrap"
    - a wrap with a design, picture, pattern, logo, or graphics printed on the vinyl, like their own custom design, a company or business wrap with their logo, a livery, or "can you print my design on a wrap", on the whole car or only part of it
    - changing a job the shop already discussed into a printed wrap, even while saying yes to booking
    NOT a solid color change wrap in a stock color, finish, or chrome film, that is service_and_pricing. NOT a complaint about a printed wrap the shop already did, that is escalation.
    """

def escalation_instructions() -> str:
    return """
    The customer needs the owner himself for something that is not a new service. That covers:
    - a problem or complaint about work the shop already did, like tint bubbling or a wrap peeling
    - asking for a refund
    - financing or payment plans
    - the status of a car that is already at the shop, like "is my car ready yet"
    """

def owner_conversation_instructions() -> str:
    return """
    The customer seems to be continuing a conversation the shop has no record of, like one they had with the owner by phone or in person. That covers:
    - ONLY when `message_history` is empty
    - AND the message is not clearly service_and_pricing, booking, business_operations, escalation, services_req_humans, printed_wrap, on_the_fence, closing_statements, or phone_call
    - AND the message reads like a follow up to a missing earlier conversation or an informal inbound, like "could I go on Saturday afternoon after 2" or "could you send me over the finance application"
    - `current_user_message.user_text` can hold several texts joined into ONE message: if ANY part clearly asks about a service, booking, hours, or location, classify THAT and never owner_conversation. A bare "Yes" or "Ok" next to a real question is filler, not a follow up to a missing conversation
    - NEVER a bare greeting, a photo of their car, just their vehicle, asking to come by now or today, or asking who they are talking to or if they are talking to a bot. Those are business_operations or service_and_pricing
    """

def on_the_fence_instructions() -> str:
    return """
    The customer is on the fence, or wants to book at some vague later time. That covers:
    - hesitation or uncertainty, like "let me think about it", "not sure yet", or "its for my brother in law, let me see what he says"
    - saying they want to book at some vague time in the future with no specific timing, like "ill look into making an appointment soon". A specific timing, like "this week", "a week from now", or "when my car arrives", is booking
    - a thanks or sign off in the same message does not change it, it is still on_the_fence
    - it MUST have NO service content and NO actionable request, and it is a STATEMENT, not a question
    """

def closing_statements_instructions() -> str:
    return """
    The customer is only thanking the shop, agreeing, or signing off, so nothing in the message needs an answer. That covers:
    - a thanks, an ok, or a sign off with no request, like "thanks", "thank you!", "ok sounds good", "sounds great thanks", "thanks will do", "bet", "appreciate it", or "see you then"
    - a yes like "alright lets do it" or "sounds good" when the shop already sent the booking link in `message_history`, since the link already covers it
    - it MUST have NO service content, NO question, NO hesitation, and NO actionable request
    - NOT a go ahead to book a job the shop priced when the booking link was not sent yet, that is booking
    - NOT hesitation, deciding for someone else, or booking at some vague later time, even with a thanks in it, those are on_the_fence
    - a closing statement is always closing_statements, NEVER off_topic
    """

def phone_call_instructions() -> str:
    return """
    The customer wants to talk on the phone. That covers:
    - asking the shop to call them, or asking to talk it through on a call
    - sharing their phone number
    - asking for the shop's phone or contact number
    """

def off_topic_instructions() -> str:
    return """
    The message is off topic or spam and has nothing to do with the shop. That covers:
    - requests that are not about the shop or a car, like sports, weather, or random questions
    - spam, sales pitches, promotions, giveaways, or links sent to the shop
    - ONLY off topic or spam. A closing statement ("thanks", "ok sounds good") is NEVER off_topic, it is closing_statements
    """
