import { json } from "./_lib/http.js";
import { cleared_cookie } from "./_lib/session.js";


//POST
export function POST(): Response {
    return json({ ok: true }, 200, { "Set-Cookie": cleared_cookie() });
}
