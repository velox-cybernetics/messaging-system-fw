import { api, ApiError, by_id, CHANNEL_NAMES, day_label, make_element, on_pulse, readable_id, shop_parts, toast, when_short } from "./shared.js";


//TYPES
//shapes come from api/convos.ts and api/thread.ts
type Tab = "forms" | "instagram" | "messenger";

type View = "on" | "booked" | "off";

type Role = "customer" | "agent" | "owner";

type Convo = { id: string, tab: Tab, channel: string, name: string, lastAt: number, lastRole: Role | null, lastText: string, off: boolean, flagged: boolean, booked: boolean };

type ThreadConvo = { id: string, tab: Tab, channel: string, name: string, lastAt: number, lastRole: Role | null, lastText: string, off: boolean, flagged: boolean, tabOff: boolean, flaggedAt: number, booked: boolean };

type PicMedia = { kind: "pic", url: string, caption: string };

type NoteMedia = { kind: "video" | "image", caption: string };

type Media = PicMedia | NoteMedia;

type Part = { text?: string, media?: Media };

type InEntry = { at: number, kind: "in", parts: Part[], off: boolean };

type OutEntry = { at: number, kind: "out", by: "system" | "owner", parts: Part[] };

type HilEntry = { at: number, kind: "hil" };

type SwitchEntry = { at: number, kind: "switch", on: boolean, by: "dashboard" | "reply" | "quote" };

type FlagEntry = { at: number, kind: "flag", feedback: string };

type Entry = InEntry | OutEntry | HilEntry | SwitchEntry | FlagEntry;

type ConvoPage = { tab: Tab, view: View, counts: Record<string, number>, viewCounts: Record<string, number>, offTabs: Tab[], convos: Convo[], more: boolean };

type Thread = { convo: ThreadConvo, entries: Entry[] };

type Preview = { text: string, is_reply: boolean };

type TabParts = { button: HTMLButtonElement, count: HTMLSpanElement, off_mark: HTMLSpanElement };

type ViewParts = { button: HTMLButtonElement, count: HTMLSpanElement };


//CONSTANTS
const TABS: Tab[] = ["forms", "instagram", "messenger"];

//booked sits between on and off, same order as the buttons
const VIEWS: View[] = ["on", "booked", "off"];

const TAB_NAMES: Record<string, string> = { forms: "Forms", instagram: "Instagram", messenger: "Messenger" };

//how close to the bottom still counts as reading the newest message
const NEAR_BOTTOM_PX: number = 80;


//ELEMENTS
const page: HTMLElement = by_id("messages");

const tabs_nav: HTMLElement = by_id("tabs");

const list: HTMLUListElement = by_id("convos") as HTMLUListElement;

const list_note: HTMLParagraphElement = by_id("list-note") as HTMLParagraphElement;

const more_button: HTMLButtonElement = by_id("more") as HTMLButtonElement;

const thread_head: HTMLElement = by_id("thread-head");

const thread_name: HTMLHeadingElement = by_id("thread-name") as HTMLHeadingElement;

const thread_meta: HTMLParagraphElement = by_id("thread-meta") as HTMLParagraphElement;

const switch_button: HTMLButtonElement = by_id("switch") as HTMLButtonElement;

const switch_label: HTMLSpanElement = by_id("switch-label") as HTMLSpanElement;

const flag_button: HTMLButtonElement = by_id("flag") as HTMLButtonElement;

const channel_bar: HTMLElement = by_id("channel-bar");

const channel_switch: HTMLButtonElement = by_id("channel-switch") as HTMLButtonElement;

const channel_switch_label: HTMLSpanElement = by_id("channel-switch-label") as HTMLSpanElement;

const list_head: HTMLElement = by_id("list-head");

const view_on_parts: ViewParts = { button: by_id("view-on") as HTMLButtonElement, count: by_id("view-on-count") as HTMLSpanElement };

const view_booked_parts: ViewParts = { button: by_id("view-booked") as HTMLButtonElement, count: by_id("view-booked-count") as HTMLSpanElement };

const view_off_parts: ViewParts = { button: by_id("view-off") as HTMLButtonElement, count: by_id("view-off-count") as HTMLSpanElement };

const view_buttons: Record<string, ViewParts> = { on: view_on_parts, booked: view_booked_parts, off: view_off_parts };

const log: HTMLElement = by_id("log");

const composer: HTMLFormElement = by_id("composer") as HTMLFormElement;

const reply: HTMLTextAreaElement = by_id("reply") as HTMLTextAreaElement;

const send_button: HTMLButtonElement = by_id("send") as HTMLButtonElement;

const flag_dialog: HTMLDialogElement = by_id("flag-dialog") as HTMLDialogElement;

const flag_text: HTMLTextAreaElement = by_id("flag-text") as HTMLTextAreaElement;

const flag_error: HTMLParagraphElement = by_id("flag-error") as HTMLParagraphElement;

const flag_send: HTMLButtonElement = by_id("flag-send") as HTMLButtonElement;

const trash_button: HTMLButtonElement = by_id("trash") as HTMLButtonElement;

const trash_dialog: HTMLDialogElement = by_id("trash-dialog") as HTMLDialogElement;

const trash_note: HTMLParagraphElement = by_id("trash-note") as HTMLParagraphElement;

const trash_error: HTMLParagraphElement = by_id("trash-error") as HTMLParagraphElement;

const trash_confirm: HTMLButtonElement = by_id("trash-confirm") as HTMLButtonElement;


//IS TAB
function is_tab(value: string | null): boolean {
    for(const tab of TABS) {
        if(tab === value) {
            return true;
        }
    }

    return false;
}


//STATE
const params: URLSearchParams = new URLSearchParams(location.search);

const requested_tab: string | null = params.get("tab");

let current_tab: Tab = "forms";

if(is_tab(requested_tab)) {
    current_tab = requested_tab as Tab;
}

let current_view: View = "on";

if(params.get("view") === "off") {
    current_view = "off";
} else if(params.get("view") === "booked") {
    current_view = "booked";
}

let current_id: string = "";

const requested_id: string | null = params.get("id");

if(requested_id !== null) {
    current_id = requested_id;
}

let shown_convos: Convo[] = [];

let current_convo: ThreadConvo | null = null;

//tabs whose whole channel is switched off, as of the last list load
let off_tabs: Set<string> = new Set();

//pics have no size so each load pushes things down, keep a thread read at the bottom stuck there
let pinned: boolean = true;

const tab_buttons: Record<string, TabParts> = {};


//CONVO TITLE
function convo_title(convo: Convo | ThreadConvo): string {
    if(convo.name) {
        return convo.name;
    }

    return readable_id(convo.id);
}


//REMEMBER PLACE
//tab, view and convo live in the address so a reload or a follow ups link opens the same spot
function remember_place(): void {
    const query: URLSearchParams = new URLSearchParams({ tab: current_tab });

    if(current_view !== "on") {
        query.set("view", current_view);
    }

    if(current_id) {
        query.set("id", current_id);
    }

    history.replaceState(null, "", "/messages?" + query.toString());
}


//PICK TAB
function pick_tab(event: Event): void {
    let tab: Tab | null = null;

    for(const each_tab of TABS) {
        const parts: TabParts = tab_buttons[each_tab] as TabParts;

        if(parts.button === event.currentTarget) {
            tab = each_tab;
        }
    }

    if(tab === null || tab === current_tab) {
        return;
    }

    current_tab = tab;

    //every channel opens on the convos the system answers
    current_view = "on";

    current_id = "";

    shown_convos = [];

    remember_place();

    show_list();

    for(const each_tab of TABS) {
        const parts: TabParts = tab_buttons[each_tab] as TabParts;

        parts.button.setAttribute("aria-pressed", String(each_tab === tab));
    }

    press_view();

    render_channel();

    load_list(false);
}


//BUILD TABS
//built once so a refresh never pulls focus off the tab being used
function build_tabs(): void {
    for(const tab of TABS) {
        const count: HTMLSpanElement = make_element("span", "tab-count", "") as HTMLSpanElement;

        const off_mark: HTMLSpanElement = make_element("span", "tab-off", "") as HTMLSpanElement;

        off_mark.setAttribute("hidden", "");

        off_mark.append(make_element("span", "visually-hidden", "System off"));

        const button: HTMLButtonElement = make_element("button", "", "") as HTMLButtonElement;

        button.setAttribute("type", "button");

        button.setAttribute("class", "tab");

        button.setAttribute("aria-pressed", String(tab === current_tab));

        button.append(TAB_NAMES[tab] as string);

        button.append(off_mark);

        button.append(count);

        button.addEventListener("click", pick_tab);

        tab_buttons[tab] = { button: button, count: count, off_mark: off_mark };

        tabs_nav.append(button);
    }
}


//PRESS VIEW
function press_view(): void {
    for(const view of VIEWS) {
        const parts: ViewParts = view_buttons[view] as ViewParts;

        parts.button.setAttribute("aria-pressed", String(view === current_view));
    }
}


//PICK VIEW
function pick_view(event: Event): void {
    let view: View | null = null;

    for(const each_view of VIEWS) {
        const parts: ViewParts = view_buttons[each_view] as ViewParts;

        if(parts.button === event.currentTarget) {
            view = each_view;
        }
    }

    if(view === null || view === current_view) {
        return;
    }

    current_view = view;

    shown_convos = [];

    remember_place();

    press_view();

    load_list(false);
}


//EMPTY NOTE
function empty_note(view_counts: Record<string, number>): string {
    const name: string = TAB_NAMES[current_tab] as string;

    if(current_view === "off") {
        return "No " + name + " conversations are switched off.";
    }

    if(current_view === "booked") {
        return "No " + name + " customers have booked yet.";
    }

    const off_count: number = view_counts.off as number;

    const booked_count: number = view_counts.booked as number;

    if(off_count > 0 || booked_count > 0) {
        return "Every " + name + " conversation is booked or switched off. Check Booked and System off.";
    }

    return "No " + name + " conversations yet. They show up here the moment a customer messages in.";
}


//BOOKED MARK
//the green dollar sign that sits in front of anyone who booked a job
function booked_mark(): HTMLElement {
    const mark: HTMLElement = make_element("span", "booked-mark", "$");

    mark.setAttribute("title", "Booked a job");

    mark.setAttribute("aria-label", "Booked a job");

    return mark;
}


//PREVIEW OF
function preview_of(convo: Convo): Preview {
    if(convo.lastRole === "agent") {
        return { text: "System: " + convo.lastText, is_reply: true };
    }

    if(convo.lastRole === "owner") {
        return { text: "Owner: " + convo.lastText, is_reply: true };
    }

    if(convo.lastRole === "customer") {
        let text: string = convo.lastText;

        if(!text) {
            text = "Sent media";
        }

        return { text: text, is_reply: false };
    }

    return { text: "No messages kept", is_reply: true };
}


//PICK CONVO
function pick_convo(event: Event): void {
    const button: HTMLButtonElement = event.currentTarget as HTMLButtonElement;

    current_id = button.getAttribute("data-id") as string;

    remember_place();

    const rows: NodeListOf<Element> = list.querySelectorAll(".convo");

    for(const row of rows) {
        row.setAttribute("aria-current", String(row === button));
    }

    load_thread(true, true);
}


//CONVO ROW
function convo_row(convo: Convo, is_new: boolean): HTMLLIElement {
    const preview: Preview = preview_of(convo);

    let button_class: string = "convo";

    if(is_new) {
        button_class = "convo is-new";
    }

    const button: HTMLButtonElement = make_element("button", "", "") as HTMLButtonElement;

    button.setAttribute("type", "button");

    button.setAttribute("class", button_class);

    button.setAttribute("data-id", convo.id);

    button.setAttribute("aria-current", String(convo.id === current_id));

    const top: HTMLElement = make_element("span", "convo-top", "");

    const who: HTMLElement = make_element("span", "convo-who", "");

    if(convo.booked) {
        who.append(booked_mark());
    }

    who.append(make_element("span", "convo-name", convo_title(convo)));

    top.append(who);

    const time: HTMLElement = make_element("time", "", when_short(convo.lastAt));

    time.setAttribute("datetime", new Date(convo.lastAt).toISOString());

    top.append(time);

    button.append(top);

    let preview_class: string = "convo-preview";

    if(preview.is_reply) {
        preview_class = "convo-preview is-reply";
    }

    button.append(make_element("span", preview_class, preview.text));

    if(convo.flagged) {
        const badges: HTMLElement = make_element("span", "convo-badges", "");

        badges.append(make_element("span", "badge is-flagged", "Flagged"));

        button.append(badges);
    }

    button.addEventListener("click", pick_convo);

    const row: HTMLLIElement = make_element("li", "", "") as HTMLLIElement;

    row.append(button);

    return row;
}


//LOAD LIST
async function load_list(append: boolean): Promise<void> {
    if(!append && shown_convos.length === 0) {
        list_note.textContent = "Loading conversations…";

        list_note.hidden = false;
    }

    try {
        //a refresh asks for everything on screen so a list opened past 50 with show older stays open
        let query: string = "limit=" + String(Math.max(50, shown_convos.length));

        if(append) {
            query = "start=" + String(shown_convos.length);
        }

        const data: ConvoPage = (await api("/api/convos?tab=" + current_tab + "&view=" + current_view + "&" + query)) as ConvoPage;

        //another tab or view got picked while this one loaded
        if(data.tab !== current_tab || data.view !== current_view) {
            return;
        }

        for(const tab of TABS) {
            const parts: TabParts = tab_buttons[tab] as TabParts;

            let count: number | undefined = data.counts[tab];

            if(count === undefined || count === null) {
                count = 0;
            }

            parts.count.textContent = String(count);
        }

        for(const view of VIEWS) {
            const parts: ViewParts = view_buttons[view] as ViewParts;

            let count: number | undefined = data.viewCounts[view];

            if(count === undefined || count === null) {
                count = 0;
            }

            parts.count.textContent = String(count);
        }

        off_tabs = new Set(data.offTabs);

        render_channel();

        const last_seen: Map<string, number> = new Map();

        for(const convo of shown_convos) {
            last_seen.set(convo.id, convo.lastAt);
        }

        let focused_id: string | undefined = undefined;

        if(document.activeElement instanceof HTMLElement) {
            focused_id = document.activeElement.dataset.id;
        }

        if(append) {
            const all_convos: Convo[] = [];

            for(const convo of shown_convos) {
                all_convos.push(convo);
            }

            for(const convo of data.convos) {
                all_convos.push(convo);
            }

            shown_convos = all_convos;
        } else {
            shown_convos = data.convos;

            list.replaceChildren();
        }

        for(const convo of data.convos) {
            const seen: number | undefined = last_seen.get(convo.id);

            const is_new: boolean = !append && seen !== undefined && convo.lastAt > seen;

            list.append(convo_row(convo, is_new));
        }

        //a refresh rebuilds the rows so the focused row gets focus back
        if(focused_id) {
            const focused_row: HTMLButtonElement | null = list.querySelector(".convo[data-id=\"" + CSS.escape(focused_id) + "\"]");

            if(focused_row !== null) {
                focused_row.focus();
            }
        }

        list_note.textContent = empty_note(data.viewCounts);

        list_note.hidden = shown_convos.length > 0;

        more_button.hidden = !data.more;
    } catch(error: unknown) {
        if(error instanceof ApiError) {
            list_note.textContent = error.message;
        } else {
            list_note.textContent = "Couldn't load conversations. It retries on its own.";
        }

        list_note.hidden = false;
    }
}


//SHOW OLDER
function show_older(): void {
    load_list(true);
}


//PIC LOADED
function pic_loaded(): void {
    if(pinned) {
        log.scrollTop = log.scrollHeight;
    }
}


//PIC FAILED
function pic_failed(event: Event): void {
    const image: HTMLImageElement = event.currentTarget as HTMLImageElement;

    image.replaceWith(make_element("span", "attachment is-gone", "This pic couldn't load."));
}


//MEDIA NODE
function media_node(media: Media, from_customer: boolean): HTMLElement {
    if(media.kind === "pic") {
        const source: string = "/api/media?url=" + encodeURIComponent(media.url);

        let alt_text: string = media.caption;

        if(!alt_text) {
            if(from_customer) {
                alt_text = "Pic the customer sent";
            } else {
                alt_text = "Pic the system sent";
            }
        }

        const image: HTMLImageElement = make_element("img", "", "") as HTMLImageElement;

        image.setAttribute("src", source);

        image.setAttribute("alt", alt_text);

        if(media.caption) {
            image.setAttribute("title", media.caption);
        }

        image.setAttribute("loading", "lazy");

        image.addEventListener("load", pic_loaded);

        image.addEventListener("error", pic_failed);

        const link: HTMLElement = make_element("a", "pic", "");

        link.setAttribute("href", source);

        link.setAttribute("target", "_blank");

        link.setAttribute("rel", "noopener");

        link.append(image);

        return link;
    }

    //a video, or a pic that didnt upload, only keeps what the models said it showed
    let label: string = "Pic";

    if(media.kind === "video") {
        label = "Video";
    }

    let text: string = label;

    if(media.caption) {
        text = label + ": " + media.caption;
    }

    return make_element("span", "attachment", text);
}


//PART NODES
function part_nodes(parts: Part[], from_customer: boolean): HTMLElement[] {
    const nodes: HTMLElement[] = [];

    for(const part of parts) {
        if(part.text) {
            nodes.push(make_element("p", "bubble", part.text));
        }

        if(part.media) {
            nodes.push(media_node(part.media, from_customer));
        }
    }

    return nodes;
}


//MESSAGE NODE
function message_node(class_name: string, parts: Part[], from_customer: boolean, footer: HTMLElement): HTMLElement {
    const article: HTMLElement = make_element("article", class_name, "");

    const nodes: HTMLElement[] = part_nodes(parts, from_customer);

    for(const node of nodes) {
        article.append(node);
    }

    article.append(footer);

    return article;
}


//EVENT NODE
function event_node(class_name: string, note: string, time: HTMLElement): HTMLElement {
    const event_line: HTMLElement = make_element("p", class_name, note);

    event_line.append(time);

    return event_line;
}


//ENTRY NODE
function entry_node(entry: Entry): HTMLElement {
    const time: HTMLElement = make_element("time", "", shop_parts(entry.at).time);

    time.setAttribute("datetime", new Date(entry.at).toISOString());

    if(entry.kind === "in") {
        const footer: HTMLElement = make_element("footer", "", "");

        footer.append(time);

        if(entry.off) {
            footer.append(make_element("span", "msg-note is-off", "System was off, not answered"));
        }

        return message_node("msg is-in", entry.parts, true, footer);
    }

    if(entry.kind === "out") {
        const footer: HTMLElement = make_element("footer", "", "");

        if(entry.by === "owner") {
            footer.append(make_element("span", "msg-note", "Owner"));

            footer.append(time);

            return message_node("msg is-out is-owner", entry.parts, false, footer);
        }

        footer.append(time);

        return message_node("msg is-out", entry.parts, false, footer);
    }

    if(entry.kind === "hil") {
        return event_node("event is-hil", "HIL: the system handed them to the owner.", time);
    }

    if(entry.kind === "switch") {
        let note: string = "System switched off from the dashboard.";

        if(entry.on) {
            note = "System switched back on from the dashboard.";
        }

        if(entry.by === "reply") {
            note = "System switched off when you replied from the dashboard.";
        } else if(entry.by === "quote") {
            note = "System switched back on by a new website quote.";
        }

        let class_name: string = "event is-off";

        if(entry.on) {
            class_name = "event";
        }

        return event_node(class_name, note, time);
    }

    if(entry.kind === "flag") {
        return event_node("event is-hil", "Flagged: " + entry.feedback, time);
    }

    return make_element("p", "event", "An entry this dashboard doesn't know how to show.");
}


//RENDER LOG
function render_log(entries: Entry[]): void {
    const nodes: HTMLElement[] = [];

    let last_date: string = "";

    for(const entry of entries) {
        const date: string = shop_parts(entry.at).date;

        if(date !== last_date) {
            nodes.push(make_element("h3", "day", day_label(date)));

            last_date = date;
        }

        nodes.push(entry_node(entry));
    }

    if(nodes.length === 0) {
        nodes.push(make_element("p", "log-note", "Nothing is kept for this conversation anymore. Threads last 90 days after the last message."));
    }

    log.replaceChildren();

    for(const node of nodes) {
        log.append(node);
    }
}


//RENDER HEAD
function render_head(convo: ThreadConvo): void {
    thread_head.hidden = false;

    composer.hidden = false;

    thread_name.replaceChildren();

    if(convo.booked) {
        thread_name.append(booked_mark());
    }

    thread_name.append(convo_title(convo));

    reply.placeholder = "Reply to " + convo_title(convo);

    let where: string | undefined = CHANNEL_NAMES[convo.channel];

    if(where === undefined || where === null) {
        where = convo.channel;
    }

    if(convo.name) {
        thread_meta.textContent = where + ", " + readable_id(convo.id);
    } else {
        thread_meta.textContent = where;
    }

    //a whole channel switched off outranks the customers own switch
    const channel_name: string = TAB_NAMES[convo.tab] as string;

    switch_button.disabled = convo.tabOff;

    switch_button.setAttribute("aria-checked", String(!convo.off && !convo.tabOff));

    if(convo.tabOff) {
        switch_label.textContent = channel_name + " off";

        switch_button.title = "System is off for all of " + channel_name + ". Switch it back on at the top of the " + channel_name + " list.";
    } else {
        if(convo.off) {
            switch_label.textContent = "System off";
        } else {
            switch_label.textContent = "System on";
        }

        switch_button.title = "";
    }

    flag_button.classList.toggle("is-flagged", convo.flagged);

    if(!convo.flagged) {
        flag_button.title = "Flag this conversation";
    } else if(convo.flaggedAt > 0) {
        flag_button.title = "Flagged " + when_short(convo.flaggedAt) + ". Flag again";
    } else {
        flag_button.title = "Flagged. Flag again";
    }
}


//LOG NOTE
function log_note(text: string): void {
    log.replaceChildren(make_element("p", "log-note", text));
}


//LOAD THREAD
async function load_thread(fresh: boolean, to_bottom: boolean): Promise<void> {
    if(!current_id) {
        return;
    }

    const id: string = current_id;

    const tab: Tab = current_tab;

    page.classList.add("show-thread");

    if(fresh) {
        thread_head.hidden = true;

        //a half written reply never carries over to someone else
        composer.hidden = true;

        reply.value = "";

        log_note("Loading messages…");
    }

    const near_bottom: boolean = log.scrollHeight - log.scrollTop - log.clientHeight < NEAR_BOTTOM_PX;

    try {
        const data: Thread = (await api("/api/thread?tab=" + tab + "&id=" + encodeURIComponent(id))) as Thread;

        //another convo got picked while this one loaded
        if(id !== current_id || tab !== current_tab) {
            return;
        }

        current_convo = data.convo;

        render_head(data.convo);

        render_log(data.entries);

        if(to_bottom || near_bottom) {
            log.scrollTop = log.scrollHeight;
        }
    } catch(error: unknown) {
        if(error instanceof ApiError) {
            log_note(error.message);
        } else {
            log_note("Couldn't load this conversation. It retries on its own.");
        }
    }
}


//LOG SCROLLED
function log_scrolled(): void {
    pinned = log.scrollHeight - log.scrollTop - log.clientHeight < NEAR_BOTTOM_PX;
}


//SHOW LIST
function show_list(): void {
    page.classList.remove("show-thread");

    thread_head.hidden = true;

    composer.hidden = true;

    reply.value = "";

    current_convo = null;

    log_note("Pick a conversation to see every message in and every reply out.");
}


//GO BACK
function go_back(): void {
    current_id = "";

    remember_place();

    show_list();

    const rows: NodeListOf<Element> = list.querySelectorAll(".convo");

    for(const row of rows) {
        row.setAttribute("aria-current", "false");
    }
}


//FLIP SWITCH
//off means the system sends this customer nothing until its switched back on
async function flip_switch(): Promise<void> {
    if(current_convo === null) {
        return;
    }

    const convo: ThreadConvo = current_convo;

    const on: boolean = convo.off;

    switch_button.disabled = true;

    try {
        await api("/api/switch", "POST", { tab: convo.tab, id: convo.id, on: on });

        convo.off = !on;

        render_head(convo);

        //booked customers stay under Booked whichever way the switch goes
        if(on && convo.booked) {
            toast("System switched on for " + convo_title(convo) + ". It answers their next message, and they stay under Booked.");
        } else if(on) {
            toast("System switched on for " + convo_title(convo) + ". It answers their next message, and they're back under System on.");
        } else if(convo.booked) {
            toast("System switched off for " + convo_title(convo) + ". Nothing goes out to them now, and they stay under Booked.");
        } else {
            toast("System switched off for " + convo_title(convo) + ". Nothing goes out to them now, and they're under System off.");
        }

        load_thread(false, false);

        load_list(false);
    } catch(error: unknown) {
        if(error instanceof ApiError) {
            toast(error.message, true);
        } else {
            toast("The switch didn't change. Try again.", true);
        }
    } finally {
        if(current_convo === null) {
            switch_button.disabled = false;
        } else {
            switch_button.disabled = current_convo.tabOff;
        }
    }
}


//RENDER CHANNEL
function render_channel(): void {
    const name: string = TAB_NAMES[current_tab] as string;

    const off: boolean = off_tabs.has(current_tab);

    list_head.hidden = false;

    channel_bar.classList.toggle("is-off", off);

    channel_switch.setAttribute("aria-checked", String(!off));

    channel_switch.setAttribute("aria-label", "System replies on " + name);

    if(off) {
        channel_switch_label.textContent = "System off";
    } else {
        channel_switch_label.textContent = "System on";
    }

    for(const tab of TABS) {
        const parts: TabParts = tab_buttons[tab] as TabParts;

        parts.off_mark.hidden = !off_tabs.has(tab);
    }
}


//FLIP CHANNEL
//off means the system answers nobody on this tabs channel until its back on
async function flip_channel(): Promise<void> {
    const tab: Tab = current_tab;

    const name: string = TAB_NAMES[tab] as string;

    const on: boolean = off_tabs.has(tab);

    channel_switch.disabled = true;

    try {
        await api("/api/switch", "POST", { tab: tab, on: on });

        if(on) {
            off_tabs.delete(tab);
        } else {
            off_tabs.add(tab);
        }

        render_channel();

        if(on) {
            toast("System switched on for " + name + ". It answers the next message that comes in there.");
        } else {
            toast("System switched off for all of " + name + ". Nothing goes out there now.");
        }

        load_list(false);

        load_thread(false, false);
    } catch(error: unknown) {
        if(error instanceof ApiError) {
            toast(error.message, true);
        } else {
            toast("The switch didn't change. Try again.", true);
        }
    } finally {
        channel_switch.disabled = false;
    }
}


//REPLY KEY
//enter sends, shift+enter is a new line
function reply_key(event: KeyboardEvent): void {
    if(event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();

        composer.requestSubmit();
    }
}


//SEND REPLY
//the owner replying switches the system off for that customer so only one of them answers
async function send_reply(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if(current_convo === null) {
        return;
    }

    const convo: ThreadConvo = current_convo;

    const text: string = reply.value.trim();

    if(text === "") {
        reply.focus();

        return;
    }

    send_button.disabled = true;

    reply.disabled = true;

    try {
        await api("/api/send", "POST", { tab: convo.tab, id: convo.id, text: text });

        reply.value = "";

        toast("Reply on its way to " + convo_title(convo) + ". The system stays off for them, so the conversation is yours.");

        load_thread(false, true);

        load_list(false);
    } catch(error: unknown) {
        if(error instanceof ApiError) {
            toast(error.message, true);
        } else {
            toast("The reply didn't send. Check your connection and try again.", true);
        }
    } finally {
        send_button.disabled = false;

        reply.disabled = false;

        reply.focus();
    }
}


//OPEN TRASH
function open_trash(): void {
    if(current_convo === null) {
        return;
    }

    trash_note.textContent = "Every message, reply, pic and follow up kept for " + convo_title(current_convo) + " comes off the dashboard for good. The Overview's numbers stay as they are. Their switch stays as it is, and a new message from them starts a new conversation.";

    trash_error.hidden = true;

    trash_dialog.showModal();
}


//CLOSE TRASH
function close_trash(): void {
    trash_dialog.close();
}


//DELETE THREAD
async function delete_thread(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if(current_convo === null) {
        return;
    }

    const convo: ThreadConvo = current_convo;

    trash_confirm.disabled = true;

    try {
        await api("/api/thread?tab=" + convo.tab + "&id=" + encodeURIComponent(convo.id), "DELETE");

        trash_dialog.close();

        toast("Deleted the conversation with " + convo_title(convo) + ".");

        current_id = "";

        remember_place();

        show_list();

        load_list(false);
    } catch(error: unknown) {
        if(error instanceof ApiError) {
            trash_error.textContent = error.message;
        } else {
            trash_error.textContent = "It didn't delete. Check your connection and try again.";
        }

        trash_error.hidden = false;
    } finally {
        trash_confirm.disabled = false;
    }
}


//OPEN FLAG
function open_flag(): void {
    if(current_convo === null) {
        return;
    }

    flag_error.hidden = true;

    flag_text.value = "";

    flag_dialog.showModal();
}


//CLOSE FLAG
function close_flag(): void {
    flag_dialog.close();
}


//SEND FLAG
//saved for review along with the customers last messages and the systems last replies
async function send_flag(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if(current_convo === null) {
        return;
    }

    const feedback: string = flag_text.value.trim();

    if(feedback === "") {
        flag_error.textContent = "Write what went wrong first.";

        flag_error.hidden = false;

        return;
    }

    flag_send.disabled = true;

    flag_send.textContent = "Sending…";

    try {
        await api("/api/flag", "POST", { tab: current_convo.tab, id: current_convo.id, feedback: feedback });

        flag_dialog.close();

        toast("Flag saved for review.");

        load_thread(false, false);

        load_list(false);
    } catch(error: unknown) {
        if(error instanceof ApiError) {
            flag_error.textContent = error.message;
        } else {
            flag_error.textContent = "The flag didn't send. Check your connection and try again.";
        }

        flag_error.hidden = false;
    } finally {
        flag_send.disabled = false;

        flag_send.textContent = "Send flag";
    }
}


//PULSE CHANGED
function pulse_changed(): void {
    load_list(false);

    load_thread(false, false);
}


//START
build_tabs();

view_on_parts.button.addEventListener("click", pick_view);

view_booked_parts.button.addEventListener("click", pick_view);

view_off_parts.button.addEventListener("click", pick_view);

press_view();

more_button.addEventListener("click", show_older);

log.addEventListener("scroll", log_scrolled, { passive: true });

by_id("back").addEventListener("click", go_back);

switch_button.addEventListener("click", flip_switch);

channel_switch.addEventListener("click", flip_channel);

reply.addEventListener("keydown", reply_key);

composer.addEventListener("submit", send_reply);

trash_button.addEventListener("click", open_trash);

by_id("trash-cancel").addEventListener("click", close_trash);

by_id("trash-form").addEventListener("submit", delete_thread);

flag_button.addEventListener("click", open_flag);

by_id("flag-cancel").addEventListener("click", close_flag);

by_id("flag-form").addEventListener("submit", send_flag);

remember_place();

load_list(false);

if(current_id) {
    load_thread(true, true);
} else {
    show_list();
}

on_pulse(pulse_changed);
