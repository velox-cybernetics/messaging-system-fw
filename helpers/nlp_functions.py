from dotenv import load_dotenv

from helpers import dashboard as dash

import os, re, json, requests

#API key
load_dotenv()
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY")

#JEV model for R, A, and E
DECISIONS_URL: str = "https://openrouter.ai/api/alpha/decisions"
ROUTER_MODEL: str = "typesafe/jev-1.13"

#generator models for G and Potentially E
GENERATORS_URL: str = "https://openrouter.ai/api/v1/chat/completions"

#tried in order, so one provider outage does not stop every reply, glm leads since it is the cheapest
GENERATOR_CHAIN: list[str] = ["z-ai/glm-5.3-flash", "moonshotai/kimi-k3", "x-ai/grok-4.6", "openai/gpt-5.6-sol", "anthropic/claude-opus-5"]


#when jev is down a generator answers the same questions in the same shape, so the routing still works
JEV_FALLBACK_PROMPT: str = """
You answer classification questions about one customer conversation for Filthy Wraps, a car customization shop.
The input is JSON: STATE is the conversation and QUESTIONS are the questions to answer, keyed by name.
Every question has a type:
- "choice": pick exactly one key from its criteria, answer {"choice": "<criteria key>", "confidence": <number 0 to 1>}
- "noul": answer {"noul": <number 0 to 1, the probability the answer is yes>}
Return only one JSON object keyed by the same question names, no markdown and no other text.
"""


#reports the tokens of one model call to the dashboard, usage names differ between the two endpoints
def report_tokens(usage: dict) -> None:
    tokens_in: int = int(usage.get("prompt_tokens") or usage.get("input_tokens") or 0)
    tokens_out: int = int(usage.get("completion_tokens") or usage.get("output_tokens") or 0)

    dash.log_tokens(tokens_in, tokens_out)


#send messages down the generator chain and return the first real reply
def call_chain(messages: list, settings: dict, timeout: int) -> str:
    headers: dict = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}

    last_error: Exception = RuntimeError("no model in the generator chain")

    for model in GENERATOR_CHAIN:
        #z-ai serves glm first, every other model is left to openrouter's own routing
        provider_settings: dict = {"allow_fallbacks": True}

        if(model.startswith("z-ai/")):
            provider_settings["order"] = ["z-ai"]

        payload: dict = {"model": model, "messages": messages, "provider": provider_settings, **settings}

        #any failure moves on to the next model, an upstream error can also come back inside a 200 body
        try:
            http_response: requests.Response = requests.post(GENERATORS_URL, headers=headers, json=payload, timeout=timeout)
            http_response.raise_for_status()

            result: dict = http_response.json()

            reply: str | None = result["choices"][0]["message"]["content"]

            if(reply is None or reply.strip() == ""):
                raise ValueError("empty reply")

            #token counts are only for the dashboard, so they can never fail the call
            try:
                report_tokens(result.get("usage") or {})

            except Exception as error:
                print("TOKEN REPORT ERROR: " + str(error))

            return reply

        except Exception as error:
            print(f"MODEL {model} FAILED, TRYING NEXT: {error}")

            last_error = error

    raise last_error


#send questions to the jev model and return its answers keyed by question name
def call_jev(state, questions: dict) -> dict:
    headers: dict = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}
    payload: dict = {"model": ROUTER_MODEL, "state": state, "questions": questions}

    try:
        http_response: requests.Response = requests.post(DECISIONS_URL, headers=headers, json=payload, timeout=10)
        http_response.raise_for_status()

        result: dict = http_response.json()

        answers: dict = result["answers"]

        for name in questions:
            if(name not in answers):
                raise ValueError(f"jev did not answer {name}")

    #jev being down must not stop every reply, so a generator answers instead
    except Exception as error:
        print("JEV ERROR, USING FALLBACK: " + str(error))

        return call_jev_fallback(state, questions)

    try:
        report_tokens(result.get("usage") or {})

    except Exception as error:
        print("TOKEN REPORT ERROR: " + str(error))

    return answers


#answers jev questions with the generator chain, in the exact shape jev returns
def call_jev_fallback(state, questions: dict) -> dict:
    user_text: str = json.dumps({"STATE": state, "QUESTIONS": questions}, ensure_ascii=False)

    reply: str = call_llm(JEV_FALLBACK_PROMPT, user_text, "low", 4000)

    #models sometimes wrap the json in a markdown fence
    reply = re.sub(r"^```(?:json)?\s*|\s*```$", "", reply.strip())

    raw_answers: dict = json.loads(reply)

    answers: dict = {}

    for name, question in questions.items():
        raw_answer: dict = raw_answers[name]

        if(question["type"] == "choice"):
            choice: str = raw_answer["choice"]

            #a made up category would route nowhere, so it fails like jev being down
            if(choice not in question["criteria"]):
                raise ValueError(f"fallback picked unknown choice {choice} for {name}")

            answers[name] = {"type": "choice", "choice": choice, "confidence": float(raw_answer["confidence"])}

        else:
            answers[name] = {"type": question["type"], question["type"]: float(raw_answer[question["type"]])}

    return answers


#send a system prompt and user text to the generator llm and return its reply
def call_llm(system_prompt: str, user_text: str, effort: str, max_tokens: int) -> str:
    #system prompt goes first and never changes, so it can be cached
    system_block: dict = {"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}
    system_message: dict = {"role": "system", "content": [system_block]}
    user_message: dict = {"role": "user", "content": user_text}

    reasoning_settings: dict = {"effort": effort}
    settings: dict = {"reasoning": reasoning_settings, "max_tokens": max_tokens}

    return call_chain([system_message, user_message], settings, 60)
