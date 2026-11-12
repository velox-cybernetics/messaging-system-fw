//CONSTANTS
//shop hours mon-sat 10am-5pm, keep in step with api/_lib/rules
const SLOTS: string[] = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];


//TYPES
type TimeHandler = (time: string) => void;

type TimeslotState = { selected_date: Date, selected_time: string | null, taken_times: string[], on_select_time: TimeHandler };


//STATE
let select_handler: TimeHandler | null = null;


//FORMAT TIME
export function format_time_label(time_24: string): string {
    const parts: string[] = time_24.split(":");

    const hour_text: string = parts[0] as string;

    const minute_text: string = parts[1] as string;

    let hour: number = parseInt(hour_text, 10);

    let suffix: string = "AM";

    if(hour >= 12) {
        suffix = "PM";
    }

    if(hour === 0) {
        hour = 12;
    } else if(hour > 12) {
        hour = hour - 12;
    }

    return `${hour}:${minute_text} ${suffix}`;
}


//SLOT TIMES
//closed sundays
export function get_slot_times_for_date(date: Date): string[] {
    if(date.getDay() === 0) {
        return [];
    }

    return SLOTS;
}


//CLICK SLOT
function click_slot(event: MouseEvent): void {
    const button: HTMLButtonElement = event.currentTarget as HTMLButtonElement;

    if(select_handler !== null) {
        select_handler(button.dataset.time as string);
    }
}


//RENDER TIMESLOTS
export function render_timeslots(container: HTMLElement, state: TimeslotState): void {
    container.innerHTML = "";

    select_handler = state.on_select_time;

    const slot_times: string[] = get_slot_times_for_date(state.selected_date);

    for(const time of slot_times) {
        const button: HTMLButtonElement = document.createElement("button");

        button.type = "button";

        button.className = "timeslot";

        button.textContent = format_time_label(time);

        button.dataset.time = time;

        if(state.taken_times.includes(time)) {
            button.classList.add("timeslot--unavailable");

            button.disabled = true;
        } else {
            if(state.selected_time === time) {
                button.classList.add("timeslot--selected");
            }

            button.addEventListener("click", click_slot);
        }

        container.appendChild(button);
    }
}
