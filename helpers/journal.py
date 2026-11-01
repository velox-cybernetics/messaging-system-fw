from helpers.log import redis_client
import json


#every incoming message is saved here before it is buffered, and trimmed off once its batch is answered
#key is "<channel>|<id>_journal", a list of messages in the order they came in
def journal_key(channel: str, id: str) -> str:
    return f"{channel}|{id}_journal"


#save one message before it is buffered, so a restart during the batch timer does not lose it
def save(channel: str, id: str, message: list) -> None:
    redis_client.rpush(journal_key(channel, id), json.dumps(message, ensure_ascii=False))


#messages that never came in by webhook go in front of the batch they are answered with, the head is where that batch's messages are, so clear() trims them with it
def save_front(channel: str, id: str, messages: list[list]) -> None:
    redis_client.lpush(journal_key(channel, id), *[json.dumps(message, ensure_ascii=False) for message in reversed(messages)])


#drops the first count messages once they were answered, ones that came in after stay for the next batch
def clear(channel: str, id: str, count: int) -> None:
    #redis deletes the key once the list is empty
    redis_client.ltrim(journal_key(channel, id), count, -1)


#every unanswered message as (channel, id, messages), read at boot to replay them
def pending() -> list[tuple]:
    journaled: list[tuple] = []

    cursor: int = 0

    while True:
        cursor, keys = redis_client.scan(cursor, match="*_journal", count=100)

        for key in keys:
            channel, id = key.removesuffix("_journal").split("|", 1)

            messages: list = [json.loads(message) for message in redis_client.lrange(key, 0, -1)]

            if(messages != []):
                journaled.append((channel, id, messages))

        if(int(cursor) == 0):
            break

    return journaled
