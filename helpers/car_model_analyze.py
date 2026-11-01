from src.prompts.car_model import car_model_sys_prompt as cmSP
from helpers.nlp_functions import call_llm

import json

def car_model_analyze(user_message: dict, message_history: dict) -> str:
    #compact json with no extra spaces or escaped unicode
    user_message_as_text: str = json.dumps(user_message, ensure_ascii=False, separators=(",", ":"))
    message_history_as_text: str = json.dumps(message_history, ensure_ascii=False, separators=(",", ":"))

    #create the text to pass
    user_text: str = f"MESSAGE_HISTORY: {message_history_as_text}\nUSER_MESSAGE: {user_message_as_text}"

    #send request down the model chain, so one provider outage does not lose the car model
    car_model: str = call_llm(cmSP.car_model_system_prompt(), user_text, "low", 2000).strip()

    #no car model given
    if(car_model.lower() == "none"):
        return ""

    return car_model
