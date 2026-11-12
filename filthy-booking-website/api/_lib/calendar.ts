import { createSign, Sign } from "node:crypto";
import { BUSINESS_TIMEZONE, wall_time_to_utc_ms } from "./time.js";


//CONSTANTS
const TOKEN_URL: string = "https://oauth2.googleapis.com/token";

const SCOPE: string = "https://www.googleapis.com/auth/calendar.events";

//matches the 1 hour slot spacing
const EVENT_MINUTES: number = 60;

const PADDING_PATTERN: RegExp = /=/g;

const PLUS_PATTERN: RegExp = /\+/g;

const SLASH_PATTERN: RegExp = /\//g;

const ESCAPED_NEWLINE_PATTERN: RegExp = /\\n/g;


//BASE64 URL
function base64_url(base64_text: string): string {
    const no_padding: string = base64_text.replace(PADDING_PATTERN, "");

    const no_plus: string = no_padding.replace(PLUS_PATTERN, "-");

    return no_plus.replace(SLASH_PATTERN, "_");
}


//PRIVATE KEY
function private_key(): string | null {
    const key: string | undefined = process.env.GOOGLE_PRIVATE_KEY;

    if(!key) {
        return null;
    }

    //the env stores newlines as a literal \n
    if(key.includes("\\n")) {
        return key.replace(ESCAPED_NEWLINE_PATTERN, "\n");
    }

    return key;
}


//ACCESS TOKEN
//service account jwt traded for a short lived google token, null when not set up
async function access_token(): Promise<unknown> {
    const client_email: string | undefined = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

    const key: string | null = private_key();

    if(!client_email || !key) {
        return null;
    }

    const now: number = Math.floor(Date.now() / 1000);

    const header_json: string = JSON.stringify({ alg: "RS256", typ: "JWT" });

    const claims_json: string = JSON.stringify({ iss: client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 });

    const header: string = base64_url(Buffer.from(header_json).toString("base64"));

    const claims: string = base64_url(Buffer.from(claims_json).toString("base64"));

    const unsigned: string = `${header}.${claims}`;

    const signer: Sign = createSign("RSA-SHA256");

    signer.update(unsigned);

    const signature: string = base64_url(signer.sign(key, "base64"));

    const assertion: string = `${unsigned}.${signature}`;

    const form: URLSearchParams = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: assertion });

    const response: Response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });

    const body: Record<string, unknown> = await read_json(response) as Record<string, unknown>;

    if(!response.ok) {
        let reason: unknown = body.error;

        if(!reason) {
            reason = response.status;
        }

        let description: unknown = body.error_description;

        if(!description) {
            description = "";
        }

        const message: string = `Google token error: ${String(reason)} ${String(description)}`;

        throw new Error(message.trim());
    }

    return body.access_token;
}


//READ JSON
async function read_json(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch(error: unknown) {
        return {};
    }
}


//CALENDAR ERROR
function calendar_error(body: Record<string, unknown>, status: number): Error {
    const error: Record<string, unknown> = body.error as Record<string, unknown>;

    if(error && error.message) {
        return new Error(String(error.message));
    }

    return new Error(`Calendar API HTTP ${status}`);
}


//CALENDAR ID
//houston has its own calendar, cypress uses the main one, the service account needs edit rights on both
function calendar_id_for(location: unknown): string | undefined {
    if(location === "houston" && process.env.GOOGLE_CALENDAR_ID_HOUSTON) {
        return process.env.GOOGLE_CALENDAR_ID_HOUSTON;
    }

    return process.env.GOOGLE_CALENDAR_ID;
}


//CREATE EVENT
//null when calendar isnt set up
export async function create_booking_event(booking: Record<string, unknown>): Promise<unknown> {
    const calendar_id: string | undefined = calendar_id_for(booking.location);

    if(!calendar_id) {
        return null;
    }

    const token: unknown = await access_token();

    if(!token) {
        return null;
    }

    const start_ms: number = wall_time_to_utc_ms(String(booking.date), String(booking.time));

    if(isNaN(start_ms)) {
        throw new Error("Invalid booking date/time");
    }

    const end_ms: number = start_ms + EVENT_MINUTES * 60 * 1000;

    const summary: string = `[${String(booking.locationLabel)}] ${String(booking.serviceLabel)} — ${String(booking.name)}`;

    const description: string = `Service: ${String(booking.serviceLabel)}\nName: ${String(booking.name)}\nPhone: ${String(booking.phone)}\nLocation: ${String(booking.locationAddress)}`;

    const start: Record<string, string> = { dateTime: new Date(start_ms).toISOString(), timeZone: BUSINESS_TIMEZONE };

    const end: Record<string, string> = { dateTime: new Date(end_ms).toISOString(), timeZone: BUSINESS_TIMEZONE };

    const event: Record<string, unknown> = { summary: summary, description: description, location: booking.locationAddress, start: start, end: end };

    const url: string = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events`;

    const headers: Record<string, string> = { "Authorization": `Bearer ${String(token)}`, "Content-Type": "application/json" };

    const response: Response = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify(event) });

    const body: Record<string, unknown> = await read_json(response) as Record<string, unknown>;

    if(!response.ok) {
        throw calendar_error(body, response.status);
    }

    return body;
}


//DELETE EVENT
//null when calendar isnt set up
export async function delete_booking_event(event_id: unknown, location: unknown): Promise<boolean | null> {
    if(!event_id) {
        return null;
    }

    const calendar_id: string | undefined = calendar_id_for(location);

    if(!calendar_id) {
        return null;
    }

    const token: unknown = await access_token();

    if(!token) {
        return null;
    }

    const url: string = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar_id)}/events/${encodeURIComponent(String(event_id))}`;

    const response: Response = await fetch(url, { method: "DELETE", headers: { "Authorization": `Bearer ${String(token)}` } });

    //404 and 410 mean it was already gone, thats fine
    if(response.status === 204 || response.status === 404 || response.status === 410) {
        return true;
    }

    const body: Record<string, unknown> = await read_json(response) as Record<string, unknown>;

    throw calendar_error(body, response.status);
}
