import { booked_members, linked_members } from "./_lib/booked.js";
import { fail, json, server_error } from "./_lib/http.js";
import { as_object, as_strings, pipeline, type Command } from "./_lib/redis.js";
import { refuse } from "./_lib/session.js";
import { CHANNEL_TABS, is_tab, parse_row, preview_text, split_member, summary_of, TAB_CHANNELS, TABS, type Channel, type Member, type Role, type Row, type Summary, type Tab } from "./_lib/shop.js";


//CONSTANTS
const PAGE_SIZE: number = 50;

//a refresh after show older asks for everything already on screen so the list doesnt snap back to 50
const MAX_LIMIT: number = 500;

//each tab splits into the convos the system answers, the ones sent the link, the ones that booked, and the ones switched off
const VIEWS: string[] = ["on", "linked", "booked", "off"];


//TYPES
type ConvoRow = { id: string, tab: Tab, channel: Channel, name: string, lastAt: number, lastRole: Role | null, lastText: string, off: boolean, flagged: boolean, booked: boolean, linked: boolean };


//WHOLE NUMBER
//NaN or 0 falls back to the default
function whole_number(text: string | null, fallback: number): number {
    let number: number = 0;

    if(text !== null) {
        number = Math.floor(Number(text));
    }

    if(isNaN(number) || number === 0) {
        return fallback;
    }

    return number;
}


//LOAD CONVOS
async function load_convos(members: string[], restricted: Set<string>, booked: Set<string>, linked: Set<string>, flagged: Set<string>): Promise<ConvoRow[]> {
    const convos: ConvoRow[] = [];

    if(members.length === 0) {
        return convos;
    }

    const hash_commands: Command[] = [];

    for(const member of members) {
        hash_commands.push(["HGETALL", "dash:conv:" + member]);
    }

    const hashes: unknown[] = await pipeline(hash_commands);

    const convs: Record<string, string>[] = [];

    for(const hash of hashes) {
        convs.push(as_object(hash));
    }

    //a convo from before previews were kept gets one from the end of its thread once, HSETNX so a newer message wins
    const missing: string[] = [];

    for(let index: number = 0; index < members.length; index++) {
        const conv: Record<string, string> = convs[index] as Record<string, string>;

        if(Object.keys(conv).length > 0 && conv.preview === undefined) {
            missing.push(members[index] as string);
        }
    }

    if(missing.length > 0) {
        const last_commands: Command[] = [];

        for(const member of missing) {
            last_commands.push(["LINDEX", "dash:msgs:" + member, -1]);
        }

        const last_rows: unknown[] = await pipeline(last_commands);

        const fills: Command[] = [];

        for(let index: number = 0; index < missing.length; index++) {
            const member: string = missing[index] as string;

            const row: Row | null = parse_row(last_rows[index]);

            let preview: string = "";

            if(row !== null) {
                preview = preview_text(row.role, row.text);
            }

            const conv: Record<string, string> = convs[members.indexOf(member)] as Record<string, string>;

            conv.preview = preview;

            fills.push(["HSETNX", "dash:conv:" + member, "preview", preview]);
        }

        await pipeline(fills);
    }

    for(let index: number = 0; index < members.length; index++) {
        const member: string = members[index] as string;

        const summary: Summary | null = summary_of(member, convs[index] as Record<string, string>);

        if(summary !== null) {
            //linked only means still waiting on them, once they book its just booked
            const waiting: boolean = linked.has(member) && !booked.has(member);

            convos.push({ id: summary.id, tab: summary.tab, channel: summary.channel, name: summary.name, lastAt: summary.lastAt, lastRole: summary.lastRole, lastText: summary.lastText, off: restricted.has(summary.id), flagged: flagged.has(member), booked: booked.has(member), linked: waiting });
        }
    }

    return convos;
}


//LIST CONVOS
//dash:convs keeps the newest 200 across every channel so it comes back whole
async function list_convos(request: Request): Promise<Response> {
    const refused: Response | null = refuse(request);

    if(refused !== null) {
        return refused;
    }

    const params: URLSearchParams = new URL(request.url).searchParams;

    let tab: string | null = params.get("tab");

    if(tab === null) {
        tab = "forms";
    }

    if(!is_tab(tab)) {
        return fail(400, `Unknown tab "${tab}".`);
    }

    let view: string | null = params.get("view");

    if(view === null) {
        view = "on";
    }

    if(!VIEWS.includes(view)) {
        return fail(400, `Unknown view "${view}".`);
    }

    const start: number = Math.max(0, whole_number(params.get("start"), 0));

    const limit: number = Math.min(MAX_LIMIT, Math.max(1, whole_number(params.get("limit"), PAGE_SIZE)));

    const answers: unknown[] = await pipeline([["ZRANGE", "dash:convs", 0, -1, "REV"], ["SMEMBERS", "dash:restricted"], ["SMEMBERS", "dash:off_channels"], ["SMEMBERS", "dash:flagged"]]);

    const restricted: Set<string> = new Set(as_strings(answers[1]));

    const off_channels: Set<string> = new Set(as_strings(answers[2]));

    const flagged: Set<string> = new Set(as_strings(answers[3]));

    const booked: Set<string> = await booked_members();

    const linked: Set<string> = await linked_members();

    const counts: Record<Tab, number> = { forms: 0, instagram: 0, messenger: 0 };

    const on_members: string[] = [];

    const off_members: string[] = [];

    const booked_list: string[] = [];

    const linked_list: string[] = [];

    for(const member of as_strings(answers[0])) {
        const where: Member | null = split_member(member);

        if(where === null) {
            continue;
        }

        counts[CHANNEL_TABS[where.channel]]++;

        if(where.channel !== TAB_CHANNELS[tab as Tab]) {
            continue;
        }

        //booked wins over the switch so a paying customer never hides under System off, same deal for one holding the link
        if(booked.has(member)) {
            booked_list.push(member);
        } else if(linked.has(member)) {
            linked_list.push(member);
        } else if(restricted.has(where.id)) {
            off_members.push(member);
        } else {
            on_members.push(member);
        }
    }

    let listed: string[] = on_members;

    if(view === "off") {
        listed = off_members;
    } else if(view === "booked") {
        listed = booked_list;
    } else if(view === "linked") {
        listed = linked_list;
    }

    const members: string[] = listed.slice(start, start + limit);

    const off_tabs: Tab[] = [];

    for(const each of TABS) {
        if(off_channels.has(TAB_CHANNELS[each])) {
            off_tabs.push(each);
        }
    }

    const convos: ConvoRow[] = await load_convos(members, restricted, booked, linked, flagged);

    const view_counts: Record<string, number> = { on: on_members.length, linked: linked_list.length, booked: booked_list.length, off: off_members.length };

    return json({ tab: tab, view: view, counts: counts, viewCounts: view_counts, offTabs: off_tabs, more: start + members.length < listed.length, convos: convos }, 200);
}


//GET
export async function GET(request: Request): Promise<Response> {
    try {
        return await list_convos(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
