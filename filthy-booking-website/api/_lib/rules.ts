//TYPES
export type Bucket = { key: string, cap: number };


//CONSTANTS
//mon-sat 10am-5pm, keep in step with the client timeslots
const SLOTS: string[] = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

const DATE_PATTERN: RegExp = /^\d{4}-\d{2}-\d{2}$/;

//the customer types what they need for this one
export const OTHER_SERVICE: string = "Other";

//keep in step with SERVICE_OPTIONS in the client app
const SERVICES: string[] = ["Window Tint", "Vinyl Wrap", "Colored Paint Protection Film (PPF)", "Paint Protection Film (Clear)", "Frontal Paint Protection Film (Clear)", "Windshield Paint Protection Film (PPF)", "Ceramic Coating or Paint Correction", "Starlight Headliner", "Caliper Wraps", OTHER_SERVICE];

//these pay a deposit before the booking is confirmed, amounts live in square.ts
export const DEPOSIT_SERVICES: string[] = ["Colored Paint Protection Film (PPF)", "Paint Protection Film (Clear)", "Vinyl Wrap", "Starlight Headliner"];


//KNOWN SERVICE
export function is_known_service(service: unknown): boolean {
    if(typeof service !== "string") {
        return false;
    }

    return SERVICES.includes(service);
}


//SLOTS FOR DATE
//empty for sundays and fake dates like 2026-13-45
export function slots_for_date(date_text: unknown): string[] {
    if(typeof date_text !== "string" || !DATE_PATTERN.test(date_text)) {
        return [];
    }

    const date_parts: string[] = date_text.split("-");

    const year: number = Number(date_parts[0]);

    const month: number = Number(date_parts[1]);

    const day: number = Number(date_parts[2]);

    const date: Date = new Date(Date.UTC(year, month - 1, day));

    if(isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== date_text) {
        return [];
    }

    if(date.getUTCDay() === 0) {
        return [];
    }

    return SLOTS;
}


//BUCKETS FOR
//cypress has no limits, houston takes one booking per service per hourly slot
export function buckets_for(date_text: string, time_text: string, location: unknown, service: string): Bucket[] {
    if(location !== "houston") {
        return [];
    }

    return [{ key: `occ:slot:houston:${date_text}:${time_text}:${service}`, cap: 1 }];
}
