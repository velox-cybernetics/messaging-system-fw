import { fire_confirmations } from "./_lib/confirm.js";
import { fail, json } from "./_lib/http.js";
import { verify_webhook_signature } from "./_lib/square.js";
import { booking_id_for_order, ConfirmResult, confirm_pending_booking, set_calendar_event_id } from "./_lib/store.js";


//CONSTANTS
const TRAILING_SLASHES_PATTERN: RegExp = /\/+$/;


//NOTIFICATION URL
//must match the url registered in the square dashboard, its part of what square signs
function notification_url(request: Request): string {
    const booking_url: string | undefined = process.env.BOOKING_URL;

    if(booking_url) {
        return booking_url.replace(TRAILING_SLASHES_PATTERN, "") + "/api/square-webhook";
    }

    let host: string | null = request.headers.get("x-forwarded-host");

    if(!host) {
        host = request.headers.get("host");
    }

    return `https://${String(host)}/api/square-webhook`;
}


//SEND CONFIRMATIONS
async function send_confirmations(booking_id: string, result: ConfirmResult): Promise<void> {
    try {
        const event_id: unknown = await fire_confirmations(result.booking as Record<string, unknown>);

        if(!event_id) {
            return;
        }

        try {
            await set_calendar_event_id(booking_id, event_id);
        } catch(error: unknown) {
            console.error("CALENDAR EVENT ID ERROR: " + String(error));
        }
    } catch(error: unknown) {
        console.error("CONFIRMATIONS ERROR: " + String(error));
    }
}


//POST
export async function POST(request: Request): Promise<Response> {
    //square signs the exact bytes it sent
    const raw_body: string = await request.text();

    const signature: string | null = request.headers.get("x-square-hmacsha256-signature");

    if(!verify_webhook_signature(raw_body, signature, notification_url(request))) {
        return fail(401, "Invalid signature");
    }

    let parsed: unknown = null;

    try {
        parsed = JSON.parse(raw_body);
    } catch(error: unknown) {
        return fail(400, "Invalid JSON");
    }

    const payload: Record<string, unknown> = parsed as Record<string, unknown>;

    let type: unknown = payload.type;

    if(!type) {
        type = "";
    }

    let payment: unknown = undefined;

    const data: unknown = payload.data;

    if(data) {
        const data_object: unknown = (data as Record<string, unknown>).object;

        if(data_object) {
            payment = (data_object as Record<string, unknown>).payment;
        }
    }

    //only a COMPLETED payment confirms the booking
    if(!(type as string).startsWith("payment.") || !payment) {
        return json({ ok: true, ignored: "not a payment event" }, 200);
    }

    const payment_status: unknown = (payment as Record<string, unknown>).status;

    if(payment_status !== "COMPLETED") {
        return json({ ok: true, ignored: `payment status ${String(payment_status)}` }, 200);
    }

    const order_id: unknown = (payment as Record<string, unknown>).order_id;

    if(!order_id) {
        return json({ ok: true, ignored: "payment has no order_id" }, 200);
    }

    let booking_id: string | null = null;

    try {
        booking_id = await booking_id_for_order(order_id);
    } catch(error: unknown) {
        console.error("ORDER LOOKUP ERROR: " + String(error));

        return fail(500, "Storage error");
    }

    //not one of ours, or the mapping already expired
    if(!booking_id) {
        return json({ ok: true, ignored: "no booking for order" }, 200);
    }

    let result: ConfirmResult = { booking: null, alreadyConfirmed: false };

    try {
        result = await confirm_pending_booking(booking_id);
    } catch(error: unknown) {
        console.error("CONFIRM ERROR: " + String(error));

        return fail(500, "Storage error");
    }

    if(!result.booking) {
        return json({ ok: true, ignored: "booking not found or expired" }, 200);
    }

    if(result.alreadyConfirmed) {
        return json({ ok: true, alreadyConfirmed: true, bookingId: booking_id }, 200);
    }

    //deposit is in, now the texts and calendar event
    await send_confirmations(booking_id, result);

    return json({ ok: true, confirmed: true, bookingId: booking_id }, 200);
}
