from src.prompts.followup import not_interested_sys_prompt as niSP
from helpers.nlp_functions import call_llm

import json

def not_interested_analyze(user_message: dict, message_history: dict) -> bool:
    #compact json with no extra spaces or escaped unicode
    user_message_as_text: str = json.dumps(user_message, ensure_ascii=False, separators=(",", ":"))
    message_history_as_text: str = json.dumps(message_history, ensure_ascii=False, separators=(",", ":"))

    #create the text to pass
    user_text: str = f"MESSAGE_HISTORY: {message_history_as_text}\nUSER_MESSAGE: {user_message_as_text}"

    #send request down the model chain, so one provider outage does not decide the follow ups
    answer: str = call_llm(niSP.not_interested_system_prompt(), user_text, "low", 2000).strip()

    return answer.lower() == "yes"
