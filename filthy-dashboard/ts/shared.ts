//CONSTANTS
//day and hour counts are in shop time, keep in step with api/_lib/shop.ts
export const SHOP_TIME_ZONE: string = "America/Chicago";

//one redis read per pulse, the bot waits 10-20s before answering so 15s still feels live
const PULSE_MS: number = 15 * 1000;

//idle screens slow down so they dont burn the free monthly redis requests
const IDLE_AFTER_MS: number = 5 * 60 * 1000;

const IDLE_PULSE_MS: number = 60 * 1000;

const TOAST_MS: number = 5000;

const DAY_MS: number = 24 * 60 * 60 * 1000;

const ACTIVITY_EVENTS: string[] = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"];

const US_NUMBER: RegExp = /^\+1(\d{3})(\d{3})(\d{4})$/;

const COMPACT_FORMAT: Intl.NumberFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const WHOLE_FORMAT: Intl.NumberFormat = new Intl.NumberFormat("en-US");

//the bot names each channel after its platform, keep in step with api/_lib/shop.ts
export const CHANNEL_NAMES: Record<string, string> = { blooio: "Text", instagram: "Instagram", facebook: "Messenger" };


//TYPES
export type Pulse = { version: number, upLast: number };

type ChangeHandler = () => void;

type PulseHandler = (pulse: Pulse) => void;

export type BigNumber = { short: string, exact: string };

type ShopParts = { date: string, time: string };


//API ERROR
export class ApiError extends Error {}


//STATE
//a bunch of calls can 401 at once, only the first one goes to sign in
let signing_in: boolean = false;

let pulse_version: number = -1;

let pulse_timer: number = 0;

let last_active: number = Date.now();

let pulse_on_change: ChangeHandler | null = null;

let pulse_on_each: PulseHandler | null = null;

let toast_timer: number = 0;

let toast_note: HTMLElement | null = null;


//API
export async function api(path: string, method: string = "GET", body: object | null = null): Promise<unknown> {
    const options: RequestInit = { credentials: "same-origin", method: method, headers: { "Content-Type": "application/json" } };

    if(body !== null) {
        options.body = JSON.stringify(body);
    }

    const response: Response = await fetch(path, options);

    if(response.status === 401 && location.pathname !== "/login" && !signing_in) {
        signing_in = true;

        const next_path: string = encodeURIComponent(location.pathname + location.search);

        location.assign("/login?next=" + next_path);
    }

    let data: unknown = null;

    try {
        data = await response.json();
    } catch(error: unknown) {
        data = null;
    }

    if(!response.ok) {
        let message: string = "The server answered " + String(response.status) + ".";

        if(data !== null && typeof data === "object" && "error" in data) {
            const error_data: Record<string, unknown> = data as Record<string, unknown>;

            message = String(error_data.error);
        }

        throw new ApiError(message);
    }

    return data;
}


//PULSE CHECK
async function pulse_check(): Promise<void> {
    window.clearTimeout(pulse_timer);

    try {
        const pulse: Pulse = (await api("/api/pulse")) as Pulse;

        if(pulse_on_each !== null) {
            pulse_on_each(pulse);
        }

        if(pulse_version !== -1 && pulse.version !== pulse_version) {
            if(pulse_on_change !== null) {
                pulse_on_change();
            }
        }

        pulse_version = pulse.version;
    } catch(error: unknown) {
        //a missed check just waits for the next beat
    }

    //cleared again so a check kicked off by coming back never leaves two timers
    window.clearTimeout(pulse_timer);

    if(document.visibilityState === "visible") {
        let wait_ms: number = PULSE_MS;

        if(Date.now() - last_active > IDLE_AFTER_MS) {
            wait_ms = IDLE_PULSE_MS;
        }

        pulse_timer = window.setTimeout(pulse_check, wait_ms);
    }
}


//PAGE SHOWN
function page_shown(): void {
    if(document.visibilityState === "visible") {
        pulse_check();
    }
}


//USER ACTIVE
function user_active(): void {
    const was_idle: boolean = Date.now() - last_active > IDLE_AFTER_MS;

    last_active = Date.now();

    if(was_idle) {
        pulse_check();
    }
}


//ON PULSE
export function on_pulse(on_change: ChangeHandler, on_each: PulseHandler | null = null): void {
    pulse_on_change = on_change;

    pulse_on_each = on_each;

    document.addEventListener("visibilitychange", page_shown);

    for(const event_name of ACTIVITY_EVENTS) {
        window.addEventListener(event_name, user_active, { passive: true });
    }

    pulse_check();
}


//MAKE ELEMENT
//text always goes in as text so nothing a customer sends turns into markup
export function make_element(tag: string, class_name: string = "", text: string = ""): HTMLElement {
    const element: HTMLElement = document.createElement(tag);

    if(class_name !== "") {
        element.className = class_name;
    }

    if(text !== "") {
        element.textContent = text;
    }

    return element;
}


//BY ID
export function by_id(id: string): HTMLElement {
    const element: HTMLElement | null = document.getElementById(id);

    if(element === null) {
        throw new Error("The page is missing #" + id + ".");
    }

    return element;
}


//REMOVE TOAST
function remove_toast(): void {
    if(toast_note !== null) {
        toast_note.remove();
    }
}


//TOAST
export function toast(message: string, is_error: boolean = false): void {
    const old_note: Element | null = document.querySelector(".toast");

    if(old_note !== null) {
        old_note.remove();
    }

    window.clearTimeout(toast_timer);

    let class_name: string = "toast";

    let role: string = "status";

    if(is_error) {
        class_name = "toast is-error";

        role = "alert";
    }

    const note: HTMLElement = make_element("div", class_name, message);

    note.setAttribute("role", role);

    document.body.append(note);

    toast_note = note;

    toast_timer = window.setTimeout(remove_toast, TOAST_MS);
}


//BIG NUMBER
export function big_number(value: number): BigNumber {
    let short_text: string = WHOLE_FORMAT.format(value);

    if(value >= 10000) {
        short_text = COMPACT_FORMAT.format(value);
    }

    return { short: short_text, exact: WHOLE_FORMAT.format(value) };
}


//SHOP PARTS
export function shop_parts(at: number): ShopParts {
    const date_format: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

    const time_format: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-US", { timeZone: SHOP_TIME_ZONE, hour: "numeric", minute: "2-digit" });

    return { date: date_format.format(at), time: time_format.format(at) };
}


//WHEN SHORT
//"3:41 PM" today, "Tue" this week, "Oct 12" before that
export function when_short(at: number): string {
    const parts: ShopParts = shop_parts(at);

    const today: string = shop_parts(Date.now()).date;

    if(parts.date === today) {
        return parts.time;
    }

    if(Date.now() - at < 6 * DAY_MS) {
        const weekday_format: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-US", { timeZone: SHOP_TIME_ZONE, weekday: "short" });

        return weekday_format.format(at);
    }

    const day_format: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-US", { timeZone: SHOP_TIME_ZONE, month: "short", day: "numeric" });

    return day_format.format(at);
}


//DAY TEXT
//dates come as YYYY-MM-DD or YYYY-MM, formatting in utc keeps the day from shifting
export function day_text(date: string, options: Intl.DateTimeFormatOptions): string {
    const pieces: string[] = date.split("-");

    let year: number = 1970;

    let month: number = 1;

    let day: number = 1;

    if(pieces[0] !== undefined) {
        year = Number(pieces[0]);
    }

    if(pieces[1] !== undefined) {
        month = Number(pieces[1]);
    }

    if(pieces[2] !== undefined) {
        day = Number(pieces[2]);
    }

    const format_options: Record<string, unknown> = { timeZone: "UTC" };

    const given_options: Record<string, unknown> = options as Record<string, unknown>;

    for(const name of Object.keys(given_options)) {
        format_options[name] = given_options[name];
    }

    const day_format: Intl.DateTimeFormat = new Intl.DateTimeFormat("en-US", format_options as Intl.DateTimeFormatOptions);

    return day_format.format(Date.UTC(year, month - 1, day));
}


//DAY LABEL
export function day_label(date: string): string {
    const today: string = shop_parts(Date.now()).date;

    const yesterday: string = shop_parts(Date.now() - DAY_MS).date;

    if(date === today) {
        return "Today";
    }

    if(date === yesterday) {
        return "Yesterday";
    }

    return day_text(date, { weekday: "long", month: "short", day: "numeric" });
}


//HOUR TEXT
export function hour_text(hour: number): string {
    let clock_hour: number = hour % 12;

    if(clock_hour === 0 || Number.isNaN(clock_hour)) {
        clock_hour = 12;
    }

    let half: string = "PM";

    if(hour < 12) {
        half = "AM";
    }

    return String(clock_hour) + " " + half;
}


//READABLE ID
//a us number reads as (555) 123-4567, anything else stays as it came
export function readable_id(id: string): string {
    const match: RegExpExecArray | null = US_NUMBER.exec(id);

    if(match === null) {
        return id;
    }

    return "(" + match[1] + ") " + match[2] + "-" + match[3];
}


//SIGN OUT
async function sign_out(): Promise<void> {
    try {
        await api("/api/logout", "POST");
    } catch(error: unknown) {
        //signing out goes to login no matter what
    }

    location.assign("/login");
}


//START
const sign_out_button: HTMLButtonElement | null = document.querySelector(".sign-out");

if(sign_out_button !== null) {
    sign_out_button.addEventListener("click", sign_out);
}
