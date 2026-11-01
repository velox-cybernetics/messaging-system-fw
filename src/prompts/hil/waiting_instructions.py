# WAITING QUESTION
def waiting_instructions() -> str:
    return "The shop asked this customer for pictures of a custom job the owner has to see before pricing it, and is waiting on them. Is `current_user_message` part of that picture request, a side question while they still want the custom job, or did the customer break out of it by dropping the custom job? Read `message_history` oldest to newest first to see which job the pictures are for and what the shop said since. Short replies like 'here', 'ok', or 'yes' answer the newest agent response in `message_history`. When you are not sure if the message is about the pictures or the custom job, choose pictures, and when you are not sure if they dropped the custom job, choose side_question."


# PICTURES CRITERIA
def pictures_instructions() -> str:
    return "The customer is answering the picture request or asking about that custom job, so the owner takes it from here. That covers sending pictures or videos, saying they will send them later or cannot right now, asking which pictures to send, offering to bring the car by so the shop can see it, asking about that custom job like its price or how long it takes, adding details to that job, a bare 'ok', 'bet', or 'thanks' only when the newest agent response in `message_history` is the one that asked for the pictures, and any message that sends or asks about the pictures while also asking something else, like 'here u go, also how much is tint'."


# SIDE QUESTION CRITERIA
def side_question_instructions() -> str:
    return "The customer has not dropped the custom job, but asks about something else the shop answers on its own, with no pictures and nothing about the custom job. That covers a set service like 'how much is tint' or 'can yall also do tint on it', hours, location, or booking like 'what are yall hours', and replying to the newest agent response in `message_history` when that response was about something else and not the pictures, like 'ok', 'yes', or 'book me' after the shop priced tint and asked to book it. NOT a message that drops the custom job, that is broke_out."


# BROKE OUT CRITERIA
def broke_out_instructions() -> str:
    return "The customer clearly drops the custom job the shop asked pictures for. That covers saying they changed their mind or no longer want it, like 'nvm', 'forget it', or 'not trying to get them wrapped after all', and asking for a different service, car, or job in place of it, like 'actually lets just do window tint instead, how much'. The message itself has to drop the custom job, NOT just ask about something else, that is side_question, and NOT send, promise, or ask about the pictures."
