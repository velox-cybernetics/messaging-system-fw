import { as_number, type Command } from "./redis.js";


//CONSTANTS
//day and hour counts run on the shops own clock, same as the follow ups in helpers/followup.py
const SHOP_TIME_ZONE: string = "America/Chicago";

const CLOCK_FORMAT: Intl.DateTimeFormatOptions = { timeZone: SHOP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

//keep in step with DASH_CHANNELS in helpers/dashboard.py
export const CHANNELS: Channel[] = ["blooio", "instagram", "facebook"];

//forms holds every text convo since website quote leads get answered by text
export const TABS: Tab[] = ["forms", "instagram", "messenger"];

export const TAB_CHANNELS: Record<Tab, Channel> = { forms: "blooio", instagram: "instagram", messenger: "facebook" };

export const CHANNEL_TABS: Record<Channel, Tab> = { blooio: "forms", instagram: "instagram", facebook: "messenger" };

//any printable text is fine, ids only ever reach redis keys, encoded urls and textContent
const VALID_ID: RegExp = /^[^\u0000-\u001f\u007f]{1,64}$/;


//LIMITS
//each thread keeps its newest 50 messages for 90 days after the last one
const MAX_MESSAGES: number = 50;

const MESSAGES_TTL_SECONDS: number = 90 * 24 * 60 * 60;

export const MAX_TEXT_CHARS: number = 2000;

//the per day sets behind the distinct counts
export const DAY_SET_SECONDS: number = 400 * 24 * 60 * 60;

//the hour keeps a reply sent in parts from counting as a follow up
const FOLLOWUP_GAP_MS: number = 60 * 60 * 1000;

//two weeks like the follow ups page, plus a day so its oldest day is whole
const FOLLOWUPS_KEPT_MS: number = 15 * 24 * 60 * 60 * 1000;

const PREVIEW_CHARS: number = 140;

//the bot reports a dashboard reply back as its own, inside this window its the same message
const OWNER_MIRROR_WINDOW_MS: number = 10 * 60 * 1000;


//TYPES
export type Channel = "blooio" | "instagram" | "facebook";

export type Tab = "forms" | "instagram" | "messenger";

export type Member = { channel: Channel, id: string };

export type Role = "customer" | "agent" | "owner";

export type RowMedia = { type: "image" | "video", url: string, description: string };

export type Row = { role: Role, text: string, ts: number, media: RowMedia[], off: boolean };

type Preview = { role: Role, text: string };

type HilEvent = { at: number, kind: "hil" };

type SwitchEvent = { at: number, kind: "switch", on: boolean, by: "dashboard" | "reply" | "quote" };

type FlagEvent = { at: number, kind: "flag", feedback: string };

export type ThreadEvent = HilEvent | SwitchEvent | FlagEvent;

export type Summary = { id: string, tab: Tab, channel: Channel, name: string, lastAt: number, lastRole: Role | null, lastText: string };

export type Clock = { date: string, hour: number };


//IS CHANNEL
export function is_channel(value: unknown): boolean {
    for(const channel of CHANNELS) {
        if(value === channel) {
            return true;
        }
    }

    return false;
}


//IS TAB
export function is_tab(value: unknown): boolean {
    for(const tab of TABS) {
        if(value === tab) {
            return true;
        }
    }

    return false;
}


//SPLIT MEMBER
//a convo is one customer on one channel, kept as "channel|userId"
export function split_member(member: string): Member | null {
    const cut: number = member.indexOf("|");

    const channel: string = member.slice(0, cut);

    if(cut > 0 && is_channel(channel)) {
        return { channel: channel as Channel, id: member.slice(cut + 1) };
    }

    return null;
}


//VALID ID
export function valid_id(value: unknown): boolean {
    if(typeof value !== "string") {
        return false;
    }

    return VALID_ID.test(value);
}


//TEXT OF
//missing or null turns into ""
export function text_of(value: unknown): string {
    if(value === undefined || value === null) {
        return "";
    }

    return String(value);
}


//FIELDS OF
export function fields_of(value: unknown): Record<string, unknown> {
    if(value !== null && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    return {};
}


//PARSE JSON
export function parse_json(text: unknown): unknown {
    if(typeof text !== "string") {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch(error: unknown) {
        return null;
    }
}


//PARSE ROW
//null for anything thats not a row or has neither text nor media
export function parse_row(text: unknown): Row | null {
    const fields: Record<string, unknown> = fields_of(parse_json(text));

    const media: RowMedia[] = [];

    if(Array.isArray(fields.media)) {
        for(const item of fields.media as unknown[]) {
            const each: Record<string, unknown> = fields_of(item);

            let type: "image" | "video" = "image";

            if(each.type === "video") {
                type = "video";
            }

            media.push({ type: type, url: text_of(each.url), description: text_of(each.description) });
        }
    }

    let role: Role = "customer";

    if(fields.role === "agent" || fields.role === "owner") {
        role = fields.role as Role;
    }

    const row: Row = { role: role, text: text_of(fields.text), ts: as_number(fields.ts), media: media, off: fields.off === true };

    if(row.text !== "" || row.media.length > 0) {
        return row;
    }

    return null;
}


//PARSE ROWS
export function parse_rows(list: unknown): Row[] {
    const rows: Row[] = [];

    if(!Array.isArray(list)) {
        return rows;
    }

    for(const item of list as unknown[]) {
        const row: Row | null = parse_row(item);

        if(row !== null) {
            rows.push(row);
        }
    }

    return rows;
}


//OWNER ORIGINAL
//the owner row a reported message repeats, when the report is just the bots copy of it
export function owner_original(rows: Row[], text: string, at: number): Row | null {
    for(const row of rows) {
        if(row.role === "owner" && row.text === text && Math.abs(at - row.ts) <= OWNER_MIRROR_WINDOW_MS) {
            return row;
        }
    }

    return null;
}


//WITHOUT OWNER COPIES
//old threads hold both copies, only show the owners
export function without_owner_copies(rows: Row[]): Row[] {
    const kept: Row[] = [];

    for(const row of rows) {
        if(row.role !== "agent" || owner_original(rows, row.text, row.ts) === null) {
            kept.push(row);
        }
    }

    return kept;
}


//ROW COMMANDS
export function row_commands(member: string, row: Row): Command[] {
    const stored: Record<string, unknown> = { role: row.role, text: row.text.slice(0, MAX_TEXT_CHARS), ts: row.ts };

    if(row.media.length > 0) {
        stored.media = row.media;
    }

    if(row.off) {
        stored.off = true;
    }

    const key: string = "dash:msgs:" + member;

    return [["RPUSH", key, JSON.stringify(stored)], ["LTRIM", key, -MAX_MESSAGES, -1], ["EXPIRE", key, MESSAGES_TTL_SECONDS]];
}


//PREVIEW TEXT
//the convo list line for the newest row, kept on the convo hash so the list reads one hash per convo
export function preview_text(role: Role, text: string): string {
    return JSON.stringify({ role: role, text: text.slice(0, PREVIEW_CHARS) });
}


//PARSE PREVIEW
function parse_preview(text: unknown): Preview | null {
    const fields: Record<string, unknown> = fields_of(parse_json(text));

    if(fields.role !== "customer" && fields.role !== "agent" && fields.role !== "owner") {
        return null;
    }

    return { role: fields.role as Role, text: text_of(fields.text) };
}


//PARSE EVENT
export function parse_event(text: unknown): ThreadEvent | null {
    const fields: Record<string, unknown> = fields_of(parse_json(text));

    const at: number = as_number(fields.at);

    if(at <= 0) {
        return null;
    }

    if(fields.kind === "hil") {
        return { at: at, kind: "hil" };
    }

    if(fields.kind === "switch") {
        let by: "dashboard" | "reply" | "quote" = "dashboard";

        if(fields.by === "reply" || fields.by === "quote") {
            by = fields.by as "reply" | "quote";
        }

        return { at: at, kind: "switch", on: fields.on === true, by: by };
    }

    if(fields.kind === "flag") {
        return { at: at, kind: "flag", feedback: text_of(fields.feedback) };
    }

    return null;
}


//EVENT COMMANDS
export function event_commands(member: string, event: ThreadEvent): Command[] {
    const key: string = "dash:events:" + member;

    return [["RPUSH", key, JSON.stringify(event)], ["LTRIM", key, -MAX_MESSAGES, -1], ["EXPIRE", key, MESSAGES_TTL_SECONDS]];
}


//SUMMARY OF
//dash:conv:<member> also holds the price the bot last quoted, the booking website reads it when they book
export function summary_of(member: string, conv: Record<string, string>): Summary | null {
    const where: Member | null = split_member(member);

    if(where === null || Object.keys(conv).length === 0) {
        return null;
    }

    const preview: Preview | null = parse_preview(conv.preview);

    let name: string | undefined = conv.username;

    if(name === undefined) {
        name = "";
    }

    let last_role: Role | null = null;

    let last_text: string = "";

    if(preview !== null) {
        last_role = preview.role;

        last_text = preview.text;
    }

    return { id: where.id, tab: CHANNEL_TABS[where.channel], channel: where.channel, name: name, lastAt: as_number(conv.lastMs), lastRole: last_role, lastText: last_text };
}


//IS FOLLOW UP
//last_out is the HMGET lastDir lastMs answer, an outbound an hour after an unanswered one is a follow up
export function is_follow_up(last_out: unknown, now: number): boolean {
    if(!Array.isArray(last_out)) {
        return false;
    }

    const last_dir: unknown = last_out[0];

    const last_ms: unknown = last_out[1];

    return last_dir === "out" && now - as_number(last_ms) >= FOLLOWUP_GAP_MS;
}


//FOLLOW UP NUMBER
//counted back to the customers last message, the first shop row after it is the reply
export function follow_up_number(rows: Row[]): number {
    let number: number = 1;

    for(let index: number = rows.length - 1; index > 0; index--) {
        const row: Row = rows[index] as Row;

        const before: Row = rows[index - 1] as Row;

        if(row.role === "customer" || before.role === "customer") {
            break;
        }

        if(row.ts - before.ts >= FOLLOWUP_GAP_MS) {
            number++;
        }
    }

    return number;
}


//FOLLOW UP COMMANDS
export function follow_up_commands(channel: Channel, id: string, number: number, at: number): Command[] {
    const sent: string = JSON.stringify({ id: id, channel: channel, number: number, at: at });

    return [["ZADD", "dash:followups:sent", at, sent], ["ZREMRANGEBYSCORE", "dash:followups:sent", "-inf", at - FOLLOWUPS_KEPT_MS]];
}


//CLOCK PART
function clock_part(parts: Intl.DateTimeFormatPart[], type: string): string {
    for(const part of parts) {
        if(part.type === type) {
            return part.value;
        }
    }

    return "00";
}


//TWO DIGITS
export function two_digits(number: number): string {
    const text: string = String(number);

    return text.padStart(2, "0");
}


//SHOP CLOCK
//the shops date as YYYY-MM-DD and its hour
export function shop_clock(at: number): Clock {
    const format: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-CA", CLOCK_FORMAT);

    const parts: Intl.DateTimeFormatPart[] = format.formatToParts(at);

    const date: string = clock_part(parts, "year") + "-" + clock_part(parts, "month") + "-" + clock_part(parts, "day");

    return { date: date, hour: Number(clock_part(parts, "hour")) };
}


//UTC DAY
//calendar math on plain dates so daylight saving never skips or repeats a day
function utc_day(date: string): number {
    const pieces: string[] = date.split("-");

    let year: number = 1970;

    let month: number = 1;

    let day: number = 1;

    if(pieces.length > 0) {
        year = Number(pieces[0]);
    }

    if(pieces.length > 1) {
        month = Number(pieces[1]);
    }

    if(pieces.length > 2) {
        day = Number(pieces[2]);
    }

    return Date.UTC(year, month - 1, day);
}


//ADD DAYS
export function add_days(date: string, days: number): string {
    const moved: Date = new Date(utc_day(date) + days * 24 * 60 * 60 * 1000);

    const iso: string = moved.toISOString();

    return iso.slice(0, 10);
}


//WEEKDAY INDEX
//0 for monday through 6 for sunday
export function weekday_index(date: string): number {
    const day: Date = new Date(utc_day(date));

    return (day.getUTCDay() + 6) % 7;
}


//DAYS IN MONTH
export function days_in_month(month: string): number {
    const pieces: string[] = month.split("-");

    let year: number = 1970;

    let number: number = 1;

    if(pieces.length > 0) {
        year = Number(pieces[0]);
    }

    if(pieces.length > 1) {
        number = Number(pieces[1]);
    }

    const last_day: Date = new Date(Date.UTC(year, number, 0));

    return last_day.getUTCDate();
}
