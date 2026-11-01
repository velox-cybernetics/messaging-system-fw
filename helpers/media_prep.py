import requests, base64, io, ipaddress, socket, threading, time
from urllib.parse import urljoin, urlsplit, SplitResult
from pillow_heif import register_heif_opener 
from PIL import Image 

#cal such that pillow knows what HEIC is 
register_heif_opener() 


#CONSTANTS
#meta's own cap on an attachment, a bigger download is cut off before it can run the instance out of memory
MAX_MEDIA_BYTES: int = 25 * 1024 * 1024

#every download in one batch together, two meta sized videos fit, so a batch of huge files can not fill memory either
MAX_BATCH_MEDIA_BYTES: int = 50 * 1024 * 1024

#the 30 second timeout only covers one read, so a server trickling bytes is cut off by this
DOWNLOAD_DEADLINE_SECONDS: int = 60

#meta's media links redirect to the cdn once or twice
MAX_REDIRECTS: int = 5

#the biggest phone photo, 50 megapixels at 8160 x 6144, a decompression bomb past it is refused from its header before anything is decoded
MAX_IMAGE_PIXELS: int = 8160 * 6144

#the formats customers send, pillow's other decoders (eps even runs ghostscript) are never handed a download
IMAGE_FORMATS: list[str] = ["JPEG", "PNG", "GIF", "WEBP", "HEIF", "AVIF", "TIFF", "BMP"]


#STATE
#one picture decoded at a time, so a few big ones at once can not run the instance out of memory
decode_lock: threading.Lock = threading.Lock()


#opens a customer picture without decoding it, only in the formats above and refused when it has too many pixels
def open_image(image_bytes: bytes) -> Image.Image:
    image: Image.Image = Image.open(io.BytesIO(image_bytes), formats=IMAGE_FORMATS)

    if(image.width * image.height > MAX_IMAGE_PIXELS):
        raise ValueError(f"image is {image.width}x{image.height}, over the {MAX_IMAGE_PIXELS} pixel cap")

    return image


#function to convert image types to JPEG
def convert_to_jpeg(image_bytes: bytes) -> bytes:
    #decoding is where the memory goes, so it only happens under the lock
    with decode_lock:
        image: Image.Image = open_image(image_bytes)

        rgb_image: Image.Image = image.convert("RGB") 

        buffer: io.BytesIO = io.BytesIO() 

        rgb_image.save(buffer, format="JPEG")
    
    return buffer.getvalue()


#loopback, private, link local (where cloud metadata lives), and reserved addresses are never downloaded from
def public_ip(address: str) -> bool:
    ip: ipaddress.IPv4Address | ipaddress.IPv6Address = ipaddress.ip_address(address)

    #"::ffff:127.0.0.1" is loopback written as ipv6
    if(ip.version == 6 and ip.ipv4_mapped):
        ip = ip.ipv4_mapped

    return ip.is_global and not ip.is_multicast


#true for an http or https url whose host only resolves to public addresses
def public_url(url: str) -> bool:
    try:
        parts: SplitResult = urlsplit(url)

        if(parts.scheme not in ["http", "https"] or not parts.hostname):
            return False

        port: int = parts.port or (443 if(parts.scheme == "https") else 80)

        addresses: list = socket.getaddrinfo(parts.hostname, port, type=socket.SOCK_STREAM)

    #a bad port, a host that does not resolve, or a name too broken to look up
    except (OSError, ValueError):
        return False

    for address in addresses:
        if(not public_ip(address[4][0])):
            return False

    return addresses != []


#gets a media url one hop at a time, each redirect is checked again so neither the url nor where it points can reach the server's own network
def download(media_url: str) -> requests.Response:
    url: str = media_url

    for _ in range(MAX_REDIRECTS + 1):
        if(not public_url(url)):
            raise ValueError("url is not http or https on a public address")

        http_response: requests.Response = requests.get(url, timeout=30, stream=True, allow_redirects=False)

        if(not http_response.is_redirect):
            return http_response

        http_response.close()

        url = urljoin(url, http_response.headers["Location"])

    raise ValueError(f"more than {MAX_REDIRECTS} redirects")


#the body in chunks, cut off past max_bytes or the deadline, so a huge or trickled file can not fill memory or hold the thread
def read_capped(http_response: requests.Response, max_bytes: int) -> bytes:
    content_length: str = http_response.headers.get("Content-Length", "")

    #the server already said it is too big, so none of it is read
    if(content_length.isdigit() and int(content_length) > max_bytes):
        http_response.close()

        raise ValueError(f"media is {content_length} bytes, over the {max_bytes} byte cap")

    chunks: list[bytes] = []
    size: int = 0
    started: float = time.monotonic()

    for chunk in http_response.iter_content(65536):
        chunks.append(chunk)

        size += len(chunk)

        if(size > max_bytes):
            http_response.close()

            raise ValueError(f"media is over the {max_bytes} byte cap")

        if(time.monotonic() - started > DOWNLOAD_DEADLINE_SECONDS):
            http_response.close()

            raise ValueError(f"download took over {DOWNLOAD_DEADLINE_SECONDS} seconds")

    return b"".join(chunks)


#a fresh budget for one batch, every prepare_media call in the batch draws from it
def new_media_budget() -> dict:
    return {"bytes": MAX_BATCH_MEDIA_BYTES}


#prepare media for pass to model, budget is the batch's {"bytes": left} from new_media_budget
def prepare_media(media_url: str, budget: dict) -> tuple:
    if(not media_url):
        print("MEDIA PREP ERROR: no media url was given")
        return ("", "")

    #the batch already downloaded its share, so the rest of its media is skipped
    if(budget["bytes"] <= 0):
        print("MEDIA PREP ERROR: the batch's media budget is used up")
        return ("", "")

    try:
        http_response: requests.Response = download(media_url)
        http_response.raise_for_status()

        media_bytes: bytes = read_capped(http_response, min(MAX_MEDIA_BYTES, budget["bytes"]))

    #the guards refuse a private address, too many redirects, or too many bytes with a ValueError
    except (requests.RequestException, ValueError) as error:
        print("MEDIA PREP ERROR: download failed, " + str(error))
        return ("", "")

    #counted even when the type check below refuses it, so a batch never pulls more than its budget
    budget["bytes"] -= len(media_bytes)

    content_type: str = http_response.headers.get("Content-Type", "")

    media_type: str = content_type.split(";")[0]

    if(not media_type.startswith("image/") and not media_type.startswith("video/")):
        print("MEDIA PREP ERROR: not an image or video, content type was " + content_type)
        return ("", "")

    safe_types: list[str] = ["image/jpeg", "image/png", "image/gif", "image/webp"]

    if(media_type.startswith("image/") and media_type not in safe_types):
        try:
            media_bytes = convert_to_jpeg(media_bytes)
        except Exception as error:
            print("MEDIA PREP ERROR: could not convert image to jpeg, " + str(error))
            return ("", "")
        media_type = "image/jpeg"


    encoded_bytes: bytes = base64.b64encode(media_bytes) 

    media_data: str = encoded_bytes.decode("utf-8") 

    data_url: str = "data:" + media_type + ";base64," + media_data

    if(media_type.startswith("image/")):
        return (data_url, "i")
    else:
        return (data_url, "v")


