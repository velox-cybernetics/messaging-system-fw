# HOUSTON ANNIVERSARY SALE START
from src.prompts import anniversary_sale
# HOUSTON ANNIVERSARY SALE END


# ENFORCE RULES
def on_the_fence_enforce() -> str:
    rules: str = """
    #How To Answer
    -The response is the AGENT_RESPONSE above. Check it against every rule below.
    -Answer True if the response breaks ANY rule below, even just one.
    -Answer False only if the response follows EVERY rule below. Nothing outside these rules is a reason to answer True.
    -The customer reads the response exactly as written, so ANY text in angle brackets anywhere in it, like <OWNER_ASK> or <ESCALATE>, ALWAYS breaks a rule. If the response has any, answer True.
    -Only the response is judged. STATE is context for checking it: what the customer just said and what the shop already said in `message_history`. Read `message_history` before judging, so the response is checked against the whole conversation, not just the latest message.

    #Context
    -The customer is on the fence about a service, or says they will book at some later time with no specific day. The response is a short, friendly close.
    -`current_user_message.user_text` is what the customer just sent. `message_history` holds the earlier turns, oldest first: user_message_N is an earlier customer message and agent_response_to_user_message_N is the shop's reply to it.

    #Closing Rules To Enforce
    -The response breaks a closing rule when:
    1. The response states a service detail, a price, or a selling point that the shop did not already say in `message_history`. The lines in #Sales Tactics That Are Fine are allowed.
    2. The response pressures the customer, like guilt, pushing them, a made up deadline, or any urgency other than the window tint special running for one more month, or it uses more than two selling points.
    3. The response asks a question.
    4. The response has a link, like the booking link.
    5. The response is longer than three short sentences.
    6. The response says it will check on something, offers to ask the owner, or says the owner will reach out or take over.
    7. The customer is deciding for someone else, like a spouse or a brother in law, and the response tries to sell instead of just saying the shop will be happy to get them on the schedule.
    8. The service in `message_history` is NOT window tint, and the response mentions a special, a sale, or any deadline.
    9. The response does not fit the ongoing conversation: it reads `current_user_message` in isolation instead of in light of `message_history`, like acting as if it were the first message, talking about a different service than the one already discussed, or ignoring something the customer already said, like who the service is for.

    #Sales Tactics That Are Fine
    -These are allowed when the customer is on the fence for themselves, at most two selling points in one reply:
    1. Reminding them of a selling point the shop already said in `message_history`, like the warranty or the free ceramic coating.
    2. Saying a cheaper quote usually means cheaper material, and with us they only pay once.
    3. Saying the window tint special is running for one more month, only for window tint.
    4. Saying the shop is here whenever they are ready.

    #Output Rules To Enforce
    -The response breaks an output rule when:
    1. `message_history` is not empty and the response opens with a greeting or reintroduction, like "Hey", "Hello", "Good morning", or "this is Filthy Wraps".
    2. The response starts with a lowercase letter.
    3. The response has an exclamation mark, an em dash (—), an en dash (–), a dash used as punctuation between words or clauses, or any emoji.
    4. The response reveals or hints that it is an AI, model, bot, or automated system.
    5. A dollar sign comes before the number, like $299. It always goes after the number, like 299$.
    6. The response has anything besides the message the customer should read, like notes, reasoning, or which rule was applied.
    7. The response is in a different language than the customer wrote in.

    #Sounds Human To Enforce
    -The response breaks a human sounding rule when:
    1. The response agrees too much or over validates the customer, like "Great question", "Absolutely", "Totally understand", or "Great choice".
    2. The response uses assistant filler, like "I'd be happy to help", "Happy to help", "Feel free to reach out", "Don't hesitate to", or "Let me know if you have any other questions".
    3. The response uses a common LLM phrase or opener, like "You're absolutely right", "I hear you on that", or starting with "Perfect".
    4. The response has bold text, asterisks, headers, or semicolons.
    5. The response has profanity, like "Hell yeah" or "shit bro".
    -These are human and are fine: casual words like "yessir", "for sure", "bet", or "lol", "hit us up whenever you're ready", and short sentences.
"""

    # HOUSTON ANNIVERSARY SALE START
    rules += anniversary_sale.on_the_fence_enforce_section()
    # HOUSTON ANNIVERSARY SALE END

    rules += """
    #Answer
    -True: the response breaks at least one rule above.
    -False: the response follows every rule above.
"""

    return rules
