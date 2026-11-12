//CONSTANTS
const TEXTBELT_SEND_URL: string = "https://textbelt.com/text";

const NOT_DIGIT_PATTERN: RegExp = /\D/g;

const TRAILING_SLASHES_PATTERN: RegExp = /\/+$/;


//NORMALIZE PHONE
export function normalize_phone(raw: unknown): string | null {
    let raw_text: string = "";

    if(raw) {
        raw_text = String(raw);
    }

    const digits: string = raw_text.replace(NOT_DIGIT_PATTERN, "");

    if(!digits) {
        return null;
    }

    if(digits.length === 10) {
        return "+1" + digits;
    }

    if(digits.length === 11 && digits.startsWith("1")) {
        return "+" + digits;
    }

    if(digits.length > 11) {
        return "+" + digits;
    }

    return null;
}


//SEND MESSAGE
//texts stay link free, textbelt only sends urls once the key is whitelisted
export async function send_message(to_phone: string, text: string): Promise<Record<string, unknown>> {
    const key: string | undefined = process.env.TEXTBELT_API_KEY;

    if(!key) {
        throw new Error("TEXTBELT_API_KEY not set");
    }

    const payload: Record<string, string> = { phone: to_phone, message: text, key: key };

    const booking_url: string | undefined = process.env.BOOKING_URL;

    //textbelt posts the reply here, thats how "reply CANCEL" reaches cancel-webhook
    if(booking_url) {
        payload.replyWebhookUrl = booking_url.replace(TRAILING_SLASHES_PATTERN, "") + "/api/cancel-webhook";
    } else {
        console.warn("MESSAGING: BOOKING_URL not set, replies (CANCEL) won't reach api/cancel-webhook");
    }

    const response: Response = await fetch(TEXTBELT_SEND_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    let body: unknown = {};

    try {
        body = await response.json();
    } catch(error: unknown) {
        body = {};
    }

    const result: Record<string, unknown> = body as Record<string, unknown>;

    //textbelt answers 200 with success false when it didnt send, like out of quota
    if(!response.ok || !result.success) {
        if(result.error) {
            throw new Error(String(result.error));
        }

        throw new Error(`HTTP ${response.status}`);
    }

    return result;
}
