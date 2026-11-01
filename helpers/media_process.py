from helpers.nlp_functions import call_chain

from src.prompts.media import media_analyze_prompts as maP

#the most of a description that is kept, a real one is a few hundred characters, so text in the media can not make it bloat every prompt after it
MAX_DESCRIPTION_CHARS: int = 4000

#function to process media 
def process_media(data_url: str, media_type: str) -> str: 
    
    media_info: dict = {"url": data_url} 

    media_block: dict = {}

    prompt: str = ""

    if(media_type == "i"):
        prompt = maP.image_analyze_prompt()

        media_block: dict = {"type": "image_url", "image_url": media_info}


    elif(media_type == "v"):
        prompt = maP.video_analyze_prompt()

        media_block: dict = {"type": "video_url", "video_url": media_info}

    else:
        return "ERROR: MEDIA COULT NOT BE PROCESSED"

    text_block: dict = {"type": "text", "text": prompt}

    content: list = [text_block, media_block] 

    message: dict = {"role": "user", "content": content} 

    #every model in the chain gets a try, so one provider outage does not lose the media
    try:
        description: str = call_chain([message], {}, 120)

    except Exception as error:
        print("MEDIA PROCESS ERROR: " + str(error))
        return "ERROR: MEDIA COULT NOT BE PROCESSED"

    return description[:MAX_DESCRIPTION_CHARS]
