//TYPES
type DetailRow = { label: string, value: unknown };


//CONSTANTS
//app.ts saves the booking under this key right before coming here
const STORAGE_KEY: string = "filthywraps_booking";

//starts once the title words finish landing
const BASE_DELAY: number = 0.55;

const STAGGER: number = 0.12;


//ELEMENTS
const details_list: HTMLElement = document.getElementById("success-details") as HTMLElement;


//LOAD BOOKING
function load_booking(): unknown {
    try {
        const raw: string | null = sessionStorage.getItem(STORAGE_KEY);

        if(raw) {
            return JSON.parse(raw);
        }

        return null;
    } catch(error: unknown) {
        return null;
    }
}


//ADD LINE
function add_line(tag: string, delay: string, text: unknown): void {
    const line: HTMLElement = document.createElement(tag);

    line.className = "fall-line";

    line.style.setProperty("--delay", delay);

    line.textContent = text as string;

    details_list.appendChild(line);
}


//SHOW DETAILS
function show_details(): void {
    const loaded: unknown = load_booking();

    if(!loaded) {
        add_line("dd", "0.5s", "No booking details found.");

        return;
    }

    const booking: Record<string, unknown> = loaded as Record<string, unknown>;

    const rows: DetailRow[] = [];

    rows.push({ label: "Service", value: booking.serviceLabel });

    rows.push({ label: "When", value: `${booking.dateLabel} at ${booking.timeLabel}` });

    rows.push({ label: "Where", value: booking.locationAddress });

    rows.push({ label: "Name", value: booking.name });

    rows.push({ label: "Phone", value: booking.phone });

    //?bk= means square sent them back after paying the deposit
    if(new URLSearchParams(window.location.search).has("bk")) {
        rows.push({ label: "Deposit", value: `$${booking.depositDollars} paid (non-refundable)` });
    }

    for(let index: number = 0; index < rows.length; index++) {
        const row: DetailRow = rows[index] as DetailRow;

        const delay: string = `${BASE_DELAY + index * STAGGER}s`;

        add_line("dt", delay, row.label);

        add_line("dd", delay, row.value);
    }
}


//START
show_details();
