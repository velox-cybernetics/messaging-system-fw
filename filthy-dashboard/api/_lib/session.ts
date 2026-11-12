import { createHash, createHmac, timingSafeEqual, Hash, Hmac } from "node:crypto";
import { fail } from "./http.js";


//CONSTANTS
const COOKIE_NAME: string = "fw_session";

const SESSION_DAYS: number = 30;


//SECRET
//DASH_PASSWORD is what the owner signs in with, DASH_KEY is the bots long random x-dash-key
function secret(name: string): string {
    let value: string | undefined = process.env[name];

    if(value === undefined) {
        value = "";
    }

    if(value === "") {
        throw new Error(name + " isn't set in Vercel, so nobody can sign in.");
    }

    return value;
}


//SIGN
//key comes from both secrets so changing either signs everyone out and a forged cookie needs DASH_KEY too
function sign(value: string): string {
    const key_text: string = "filthy-dashboard session:" + secret("DASH_KEY") + ":" + secret("DASH_PASSWORD");

    const key_hasher: Hash = createHash("sha256");

    key_hasher.update(key_text);

    const key: Buffer = key_hasher.digest();

    const signer: Hmac = createHmac("sha256", key);

    signer.update(value);

    return signer.digest("base64url");
}


//SAME TEXT
//hash both sides first so the compare takes the same time no matter what was typed
function same_text(given: string, expected: string): boolean {
    const given_hasher: Hash = createHash("sha256");

    given_hasher.update(given);

    const given_hash: Buffer = given_hasher.digest();

    const expected_hasher: Hash = createHash("sha256");

    expected_hasher.update(expected);

    const expected_hash: Buffer = expected_hasher.digest();

    return timingSafeEqual(given_hash, expected_hash);
}


//PASSWORD MATCHES
export function password_matches(given: string): boolean {
    return same_text(given, secret("DASH_PASSWORD"));
}


//SESSION COOKIE
//a session is just a signed expiry time
export function session_cookie(): string {
    const expires: string = String(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

    const max_age: number = SESSION_DAYS * 24 * 60 * 60;

    return COOKIE_NAME + "=" + expires + "." + sign(expires) + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + String(max_age);
}


//CLEARED COOKIE
export function cleared_cookie(): string {
    return COOKIE_NAME + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}


//SIGNED IN
function signed_in(request: Request): boolean {
    let cookie_header: string | null = request.headers.get("cookie");

    if(cookie_header === null) {
        cookie_header = "";
    }

    let value: string = "";

    for(const pair of cookie_header.split(";")) {
        const trimmed: string = pair.trim();

        const pieces: string[] = trimmed.split("=");

        if(pieces[0] === COOKIE_NAME) {
            value = pieces.slice(1).join("=");
        }
    }

    const value_parts: string[] = value.split(".");

    const expires: string = value_parts[0] as string;

    let signature: string = "";

    if(value_parts.length > 1) {
        signature = value_parts[1] as string;
    }

    if(expires === "" || signature === "" || Number(expires) < Date.now()) {
        return false;
    }

    return same_text(signature, sign(expires));
}


//REFUSE
//a 401 for anyone without a valid session, null when they may go on
export function refuse(request: Request): Response | null {
    if(signed_in(request)) {
        return null;
    }

    return fail(401, "Sign in to see the dashboard.");
}


//REFUSE BOT
//the bots calls need x-dash-key to be DASH_KEY, they have no lockout
export function refuse_bot(request: Request): Response | null {
    let key: string | undefined = process.env.DASH_KEY;

    if(key === undefined) {
        key = "";
    }

    let given: string | null = request.headers.get("x-dash-key");

    if(given === null) {
        given = "";
    }

    if(key !== "" && same_text(given, key)) {
        return null;
    }

    return fail(401, "unauthorized");
}
