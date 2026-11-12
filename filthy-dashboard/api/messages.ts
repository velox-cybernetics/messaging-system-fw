import { fail, json, server_error } from "./_lib/http.js";
import { redis } from "./_lib/redis.js";
import { refuse_bot } from "./_lib/session.js";
import { is_channel, parse_rows, without_owner_copies, type Role, type Row, type RowMedia } from "./_lib/shop.js";


//TYPES
type Message = { role: Role, text: string, ts: number, media: RowMedia[] };


//THREAD MESSAGES
//helpers/dashboard.py fetch_thread rebuilds a history the bot lost from this, oldest first
async function thread_messages(request: Request): Promise<Response> {
    const refused: Response | null = refuse_bot(request);

    if(refused !== null) {
        return refused;
    }

    const params: URLSearchParams = new URL(request.url).searchParams;

    const channel: string | null = params.get("channel");

    const user_id: string | null = params.get("userId");

    if(!is_channel(channel) || user_id === null || user_id === "") {
        return fail(400, "Missing channel or userId");
    }

    const member: string = (channel as string) + "|" + user_id;

    const stored: unknown = await redis(["LRANGE", "dash:msgs:" + member, 0, -1]);

    const rows: Row[] = without_owner_copies(parse_rows(stored));

    const messages: Message[] = [];

    for(const row of rows) {
        messages.push({ role: row.role, text: row.text, ts: row.ts, media: row.media });
    }

    return json({ messages: messages }, 200);
}


//GET
export async function GET(request: Request): Promise<Response> {
    try {
        return await thread_messages(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
