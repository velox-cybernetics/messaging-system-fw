import { error_text, fail, json } from "./_lib/http.js";
import { is_known_location } from "./_lib/locations.js";
import { is_known_service } from "./_lib/rules.js";
import { get_availability } from "./_lib/store.js";


//CONSTANTS
const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;

//so a bad client cant ask for a year of data
const MAX_DAYS: number = 95;

const DAY_MS: number = 24 * 60 * 60 * 1000;


//ONE PARAM
//a repeated param counts as bad
function one_param(params: URLSearchParams, name: string): string | null {
    const values: string[] = params.getAll(name);

    if(values.length !== 1) {
        return null;
    }

    return values[0] as string;
}


//GET
export async function GET(request: Request): Promise<Response> {
    const params: URLSearchParams = new URL(request.url).searchParams;

    const start: string | null = one_param(params, "start");

    const end: string | null = one_param(params, "end");

    const location: string | null = one_param(params, "location");

    const service: string | null = one_param(params, "service");

    if(start === null || end === null || !DATE_PATTERN.test(start) || !DATE_PATTERN.test(end)) {
        return fail(400, "start and end must be YYYY-MM-DD");
    }

    if(start > end) {
        return fail(400, "start must be on or before end");
    }

    if(!location || !is_known_location(location)) {
        return fail(400, "unknown or missing location");
    }

    if(!service || !is_known_service(service)) {
        return fail(400, "unknown or missing service");
    }

    //local time parse on purpose, both sides shift the same
    const days: number = Math.round((Date.parse(end + "T00:00:00") - Date.parse(start + "T00:00:00")) / DAY_MS) + 1;

    if(days > MAX_DAYS) {
        return fail(400, "range too large (max 95 days)");
    }

    try {
        const taken: Record<string, string[]> = await get_availability(location, service, start, end);

        return json({ taken: taken }, 200, { "Cache-Control": "no-store" });
    } catch(error: unknown) {
        console.error("AVAILABILITY ERROR: " + error_text(error));

        return fail(500, "Storage error");
    }
}
