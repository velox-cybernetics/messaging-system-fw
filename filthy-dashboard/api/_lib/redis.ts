//CONFIG
//same upstash database as the booking website, one linked through vercel names it KV_REST_API_*
let base_url: string | undefined = process.env.UPSTASH_REDIS_REST_URL;

if(base_url === undefined) {
    base_url = process.env.KV_REST_API_URL;
}

if(base_url === undefined) {
    base_url = "";
}

let token: string | undefined = process.env.UPSTASH_REDIS_REST_TOKEN;

if(token === undefined) {
    token = process.env.KV_REST_API_TOKEN;
}

if(token === undefined) {
    token = "";
}


//CONSTANTS
const TRAILING_SLASH: RegExp = /\/$/;

const REST_URL: string = base_url.replace(TRAILING_SLASH, "");

const REST_TOKEN: string = token;


//TYPES
export type Command = (string | number)[];


//ERROR IN
function error_in(answer: unknown): string | null {
    if(answer !== null && typeof answer === "object") {
        const fields: Record<string, unknown> = answer as Record<string, unknown>;

        if(fields.error !== undefined) {
            return String(fields.error);
        }
    }

    return null;
}


//RESULT IN
function result_in(answer: unknown): unknown {
    const error: string | null = error_in(answer);

    if(error !== null) {
        throw new Error("Database error: " + error);
    }

    if(answer !== null && typeof answer === "object") {
        const fields: Record<string, unknown> = answer as Record<string, unknown>;

        if(fields.result !== undefined) {
            return fields.result;
        }
    }

    return null;
}


//AS TEXT LIST
function as_text_list(command: Command): string[] {
    const texts: string[] = [];

    for(const part of command) {
        texts.push(String(part));
    }

    return texts;
}


//SEND
async function send(path: string, body: string[] | string[][]): Promise<unknown> {
    if(REST_URL === "" || REST_TOKEN === "") {
        throw new Error("The dashboard database isn't connected. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel.");
    }

    const headers: Record<string, string> = { Authorization: "Bearer " + REST_TOKEN, "Content-Type": "application/json" };

    const response: Response = await fetch(REST_URL + path, { method: "POST", headers: headers, body: JSON.stringify(body) });

    let data: unknown = null;

    try {
        data = await response.json();
    } catch(error: unknown) {
        data = null;
    }

    if(!response.ok) {
        let reason: string | null = error_in(data);

        if(reason === null) {
            reason = response.statusText;
        }

        throw new Error("Database refused the request: " + reason);
    }

    return data;
}


//REDIS
export async function redis(command: Command): Promise<unknown> {
    const answer: unknown = await send("", as_text_list(command));

    return result_in(answer);
}


//PIPELINE
//many commands in one round trip, results come back in the same order
export async function pipeline(commands: Command[]): Promise<unknown[]> {
    if(commands.length === 0) {
        return [];
    }

    const body: string[][] = [];

    for(const command of commands) {
        body.push(as_text_list(command));
    }

    const answers: unknown = await send("/pipeline", body);

    const results: unknown[] = [];

    if(!Array.isArray(answers)) {
        return results;
    }

    for(const answer of answers as unknown[]) {
        results.push(result_in(answer));
    }

    return results;
}


//AS STRINGS
export function as_strings(value: unknown): string[] {
    const strings: string[] = [];

    if(!Array.isArray(value)) {
        return strings;
    }

    for(const item of value as unknown[]) {
        strings.push(String(item));
    }

    return strings;
}


//AS NUMBER
export function as_number(value: unknown): number {
    let number: number = 0;

    if(value !== null && value !== undefined) {
        number = Number(value);
    }

    if(!Number.isFinite(number)) {
        return 0;
    }

    return number;
}


//AS OBJECT
//HGETALL comes back flat as field, value, field, value
export function as_object(flat: unknown): Record<string, string> {
    const object: Record<string, string> = {};

    const items: string[] = as_strings(flat);

    for(let index: number = 0; index + 1 < items.length; index += 2) {
        object[items[index] as string] = items[index + 1] as string;
    }

    return object;
}
