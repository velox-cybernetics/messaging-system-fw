import { fail, json, read_body, server_error } from "./_lib/http.js";
import { as_number, pipeline, redis } from "./_lib/redis.js";
import { password_matches, session_cookie } from "./_lib/session.js";


//CONSTANTS
//10 wrong passwords from one address locks it out for 15 min
const MAX_FAILURES: number = 10;

const LOCKOUT_SECONDS: number = 15 * 60;


//CLIENT ADDRESS
function client_address(request: Request): string {
    let forwarded: string | null = request.headers.get("x-forwarded-for");

    if(forwarded === null) {
        forwarded = "local";
    }

    const first_address: string = forwarded.split(",")[0] as string;

    return first_address.trim();
}


//LOGIN
async function login(request: Request): Promise<Response> {
    const failures_key: string = "dash:login_failures:" + client_address(request);

    const failures: number = as_number(await redis(["GET", failures_key]));

    if(failures >= MAX_FAILURES) {
        return fail(429, "Too many wrong passwords. Try again in 15 minutes.");
    }

    const body: Record<string, unknown> | null = await read_body(request);

    let password_ok: boolean = false;

    if(body !== null && typeof body.password === "string") {
        password_ok = password_matches(body.password);
    }

    if(!password_ok) {
        await pipeline([["INCR", failures_key], ["EXPIRE", failures_key, LOCKOUT_SECONDS]]);

        return fail(401, "Wrong password.");
    }

    return json({ ok: true }, 200, { "Set-Cookie": session_cookie() });
}


//POST
export async function POST(request: Request): Promise<Response> {
    try {
        return await login(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
