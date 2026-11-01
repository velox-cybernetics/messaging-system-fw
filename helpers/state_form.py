from helpers.media_prep import prepare_media, new_media_budget
from helpers.media_process import process_media
from helpers.log import read


#CONSTANTS
#most attachments one batch downloads and describes, so a flood of pictures can not run up model calls, the dashboard shows the same number
MAX_BATCH_ATTACHMENTS: int = 10

#most of the customer's text one batch hands the models, a real batch is a few hundred characters
MAX_BATCH_TEXT_CHARS: int = 4000


#the prepared media of each element as {"index", "type", "data_url"}, for the dashboard to show the picture
#prepared is one entry per media element in order, the (data_url, type) from prepare_media or "" when nothing was downloaded
def media_previews(prepared: list) -> list[dict]:
    previews: list[dict] = []

    for i, data_url_type in enumerate(prepared):
        #nothing downloaded or prepare_media failed
        if(data_url_type == "" or data_url_type[0] == ""):
            continue

        if(data_url_type[1] == "i"):
            previews.append({"index": i, "type": "image", "data_url": data_url_type[0]})
        else:
            previews.append({"index": i, "type": "video", "data_url": data_url_type[0]})

    return previews


#meta can attach the same picture to several messages in one batch, like a shared post riding on each message, so each picture is kept once
#media_processed entries are [(data_url, type) or "", title], a kept picture takes the first non empty title of its copies
def dedupe_media(media_processed: list[list]) -> list[list]:
    kept: list[list] = []
    kept_by_data_url: dict[str, list] = {}

    for media in media_processed:
        #nothing downloaded, nothing to compare
        if(media[0] == "" or media[0][0] == ""):
            kept.append(media)
            continue

        first: list | None = kept_by_data_url.get(media[0][0])

        if(first is not None):
            if(not first[1] and media[1]):
                first[1] = media[1]

            continue

        kept_by_data_url[media[0][0]] = media
        kept.append(media)

    return kept


#function to form  the media elements in state, previews stay out of the elements since those go to the models and history
def media_element_form(attatchments: list, referrals: list, channel: str) -> tuple[list[dict], list[dict]]:
    #every download in this batch draws from one budget, so a batch of huge files can not fill the instance's memory
    budget: dict = new_media_budget()

    if(channel == "blooio"):
        #prepare media
        data_urls_types: list[tuple] = []

        for attatchment in attatchments:

            if(len(attatchment) > 1):
                for x in attatchment:
                    media_url: str = x.get("url")
                    data_urls_types.append(prepare_media(media_url, budget))

            else:
                media_url: str = attatchment[0].get("url")
                data_urls_types.append(prepare_media(media_url, budget))

        #grabbed before processing, one data url per media element
        previews: list[dict] = media_previews(data_urls_types)

        #process media
        media_descriptions: list[str] = [] 

        for data_url_type in data_urls_types:
            data_url: str = data_url_type[0] 
            media_type: str = data_url_type[1]

            media_descriptions.append(process_media(data_url, media_type))

        media_elements: list[dict] = []

        for media_description in media_descriptions: 
            media_elements.append({
                "media_description": media_description
                })

        return media_elements, previews
    
    elif(channel == "ig"):
        media_processed: list[list] = []
        media_can_process: list[str] = ["ig_story", "story", "story_mention", "ig_post", "image", "video"]

        story_types: list[str] = ["ig_story", "story", "story_mention"]

        #prepare attatchments for processing
        for attatchment in attatchments:

            if(len(attatchment) > 1):
                for x in attatchment:
                    type_media: str = x.get("type")

                    if(type_media in media_can_process and type_media == "ig_post"):
                        data_url_and_type: tuple = prepare_media(x.get("payload").get("url"), budget)

                        media_processed.append([data_url_and_type, x.get("payload").get("title")])

                    elif(type_media in media_can_process and type_media in story_types):
                        story_url: str = x.get("payload").get("url")

                        #meta sends the story link in url, fall back to story_media_url if it is missing
                        if(not story_url):
                            story_url = x.get("payload").get("story_media_url")

                        data_url_and_type: tuple = prepare_media(story_url, budget)

                        media_processed.append([data_url_and_type, ""])

                    elif(type_media in media_can_process and type_media != "ig_reel"):
                        data_url_and_type: tuple = prepare_media(x.get("payload").get("url"), budget)

                        media_processed.append([data_url_and_type, ""])

                    elif(type_media == "ig_reel"):

                        media_processed.append(["", x.get("payload").get("title")])

                    else:
                        media_processed.append(["", ""])

            else:
                type_media: str = attatchment[0].get("type") 
                x = attatchment[0]

                if(type_media in media_can_process and type_media == "ig_post"):
                    data_url_and_type: tuple = prepare_media(x.get("payload").get("url"), budget)

                    media_processed.append([data_url_and_type, x.get("payload").get("title")])

                elif(type_media in media_can_process and type_media in story_types):
                    story_url: str = x.get("payload").get("url")

                    #meta sends the story link in url, fall back to story_media_url if it is missing
                    if(not story_url):
                        story_url = x.get("payload").get("story_media_url")

                    data_url_and_type: tuple = prepare_media(story_url, budget)

                    media_processed.append([data_url_and_type, x.get("payload").get("title")])

                elif(type_media in media_can_process and type_media != "ig_reel"):
                    data_url_and_type: tuple = prepare_media(x.get("payload").get("url"), budget)

                    media_processed.append([data_url_and_type, ""])

                elif(type_media == "ig_reel"):

                    media_processed.append(["", x.get("payload").get("title")])

                else:
                    media_processed.append(["", ""])

        #prepare referrals(ads) for processing
        for referral in referrals:
            data = referral.get("ads_context_data", {})

            if(data.get("photo_url")):
                data_url_and_type: tuple = prepare_media(data.get("photo_url"), budget)

                media_processed.append([data_url_and_type, data.get("ad_title")])

            elif(data.get("video_url")): 
                data_url_and_type: tuple = prepare_media(data.get("video_url"), budget)

                media_processed.append([data_url_and_type, data.get("ad_title")])

            else:
                media_processed.append(["", ""])

        #grabbed before processing replaces the data urls with descriptions
        media_processed = dedupe_media(media_processed)
        previews: list[dict] = media_previews([media[0] for media in media_processed])

        #process all media
        for i, media_proccesing in enumerate(media_processed):
            if(media_proccesing[0] != ""):
                data_url: str = media_proccesing[0][0]
                type_media: str = media_proccesing[0][1]

                media_processed[i][0] = process_media(data_url, type_media)

        media_elements: list[dict] = []

        for media in media_processed:
            media_elements.append({
                "media_description(if applicable)": media[0],
                "post_description(if applicable)": media[1]
            }) 

        return media_elements, previews

    elif(channel == "messenger"):
        media_processed: list[list] = []

        #prepare attatchments for processing
        for attatchment in attatchments:
            for x in attatchment:
                type_media: str = x.get("type")
                payload: dict = x.get("payload") or {}
                title: str = payload.get("title") or ""

                #photos, videos, and shared posts are downloaded, a shared post keeps its caption
                if(type_media in ["image", "video", "post", "ig_post"]):
                    data_url_and_type: tuple = prepare_media(payload.get("url"), budget)

                    media_processed.append([data_url_and_type, title])

                #shared links and reels are not downloaded, their title is the caption
                elif(type_media in ["fallback", "reel", "ig_reel"]):
                    media_processed.append(["", title])

                #audio, files, and anything else cannot be described
                else:
                    media_processed.append(["", ""])

        #prepare referrals(ads) for processing, video_url is the thumbnail of the ad video so both are images
        for referral in referrals:
            data: dict = referral.get("ads_context_data") or {}
            ad_url: str = data.get("photo_url") or data.get("video_url") or ""
            ad_title: str = data.get("ad_title") or ""

            if(ad_url):
                data_url_and_type: tuple = prepare_media(ad_url, budget)

                media_processed.append([data_url_and_type, ad_title])

            else:
                media_processed.append(["", ad_title])

        #grabbed before processing replaces the data urls with descriptions
        media_processed = dedupe_media(media_processed)
        previews: list[dict] = media_previews([media[0] for media in media_processed])

        #process all media
        for i, media_proccesing in enumerate(media_processed):
            if(media_proccesing[0] != ""):
                data_url: str = media_proccesing[0][0]
                type_media: str = media_proccesing[0][1]

                media_processed[i][0] = process_media(data_url, type_media)

        #same two fields as instagram, so the prompts read a shop post or ad the same way on both
        media_elements: list[dict] = []

        for media in media_processed:
            media_elements.append({
                "media_description(if applicable)": media[0],
                "post_description(if applicable)": media[1]
            })

        return media_elements, previews


#the first MAX_BATCH_ATTACHMENTS attachments of the batch in order, each message keeps its own list
def cap_attachments(attachments: list) -> list:
    kept: list = []
    room: int = MAX_BATCH_ATTACHMENTS

    for attachment in attachments:
        if(room <= 0):
            break

        kept.append(attachment[:room])

        room -= len(kept[-1])

    return kept


#function that forms the message in the state, and the media previews for the dashboard next to it
def message_form(current_message_batch: list, channel: str) -> tuple[dict, list[dict]]:
    current_attatchments: list = []
    current_referrals: list = []
    current_text: list = []

    #extract content from message batch
    for message in current_message_batch:
        if(isinstance(message, list) and message != []):
            current_attatchments.append(message)
        
        elif(isinstance(message, str)):
            current_text.append(message) 

        elif(isinstance(message, dict) and message != {}):
            current_referrals.append(message)

    #a flood of attachments is cut to the first MAX_BATCH_ATTACHMENTS, so it can not run up model calls
    current_attatchments = cap_attachments(current_attatchments)

    media: dict = {}
    previews: list[dict] = []
    if(current_attatchments != [] or current_referrals != []):
        media_elements, previews = media_element_form(current_attatchments, current_referrals, channel)

        for i, media_element in enumerate(media_elements):
            media[f"media_element_{i}"] = media_element

    text: str = "" 
    if(current_text != []):
        for txt in current_text:
            text += f"{txt} "

    #a wall of text is cut off, so one batch can not run up every model call and the history after it
    text = text[:MAX_BATCH_TEXT_CHARS]

    message: dict = {
            "user_media": media, 
            "user_text": text
    }

    return message, previews

#function that forms the message history in state
def message_history_form(id: str):
    user_messages: list[str] = read(f"{id}_usermsg") 
    agent_responses: list[str] = read(f"{id}_agentres") 

    msg_hist: dict = {} 

    if(len(user_messages) == len(agent_responses)):
        for i in range(len(user_messages)):
            msg_hist[f"user_message_{i}"] = user_messages[i]
            msg_hist[f"agent_response_to_user_message_{i}"] = agent_responses[i]
    else:
        if(len(user_messages) > len(agent_responses)):
           for i in range(len(user_messages)):
               if(i < len(agent_responses)):
                    msg_hist[f"user_message_{i}"] = user_messages[i]
                    msg_hist[f"agent_response_to_user_message_{i}"] = agent_responses[i]
               else:
                    msg_hist[f"user_message_{i}"] = user_messages[i]
        else: 
           for i in range(len(agent_responses)):
               if(i < len(user_messages)):
                    msg_hist[f"user_message_{i}"] = user_messages[i]
                    msg_hist[f"agent_response_to_user_message_{i}"] = agent_responses[i]

               else:
                    msg_hist[f"agent_response_to_user_message_{i}"] = agent_responses[i]


    return msg_hist

