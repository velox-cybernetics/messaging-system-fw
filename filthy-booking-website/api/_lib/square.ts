import { createHmac, timingSafeEqual } from "node:crypto";


//CONSTANTS
const SQUARE_VERSION: string = "2024-10-17";

//vinyl wrap has the bigger deposit, keep in step with SERVICE_OPTIONS in the client app
const VINYL_WRAP_DEPOSIT_CENTS: number = 50000;

const DEFAULT_DEPOSIT_CENTS: number = 10000;


//TYPES
export type PaymentLink = { url: unknown, orderId: unknown };


//SQUARE BASE
function square_base(): string {
    let environment: string | undefined = process.env.SQUARE_ENVIRONMENT;

    if(!environment) {
        environment = "sandbox";
    }

    if(environment.toLowerCase() === "production") {
        return "https://connect.squareup.com";
    }

    return "https://connect.squareupsandbox.com";
}


//DEPOSIT CENTS
function deposit_cents(service: string): number {
    if(service === "Vinyl Wrap") {
        return VINYL_WRAP_DEPOSIT_CENTS;
    }

    let setting: string | undefined = process.env.SQUARE_DEPOSIT_CENTS;

    if(!setting) {
        setting = "10000";
    }

    const cents: number = parseInt(setting, 10);

    if(Number.isFinite(cents) && cents > 0) {
        return cents;
    }

    return DEFAULT_DEPOSIT_CENTS;
}


//CREATE PAYMENT LINK
//the order id is how the payment webhook finds this booking again
export async function create_deposit_payment_link(booking: Record<string, unknown>, redirect_url: string, idempotency_key: string): Promise<PaymentLink> {
    const token: string | undefined = process.env.SQUARE_ACCESS_TOKEN;

    if(!token) {
        throw new Error("SQUARE_ACCESS_TOKEN not set");
    }

    const location_id: string | undefined = process.env.SQUARE_LOCATION_ID;

    if(!location_id) {
        throw new Error("SQUARE_LOCATION_ID not set");
    }

    const quick_pay: Record<string, unknown> = { name: `Non-refundable deposit — ${String(booking.serviceLabel)}`, price_money: { amount: deposit_cents(String(booking.service)), currency: "USD" }, location_id: location_id };

    const checkout_options: Record<string, unknown> = { redirect_url: redirect_url, ask_for_shipping_address: false };

    const payment_note: string = `Filthy Wraps deposit — ${String(booking.id)} (${String(booking.name)}, ${String(booking.dateLabel)} ${String(booking.timeLabel)})`;

    const request_body: Record<string, unknown> = { idempotency_key: idempotency_key, quick_pay: quick_pay, checkout_options: checkout_options, payment_note: payment_note };

    const headers: Record<string, string> = { "Authorization": `Bearer ${token}`, "Square-Version": SQUARE_VERSION, "Content-Type": "application/json" };

    const response: Response = await fetch(square_base() + "/v2/online-checkout/payment-links", { method: "POST", headers: headers, body: JSON.stringify(request_body) });

    let body: unknown = {};

    try {
        body = await response.json();
    } catch(error: unknown) {
        body = {};
    }

    const result: Record<string, unknown> = body as Record<string, unknown>;

    if(!response.ok) {
        let detail: unknown = undefined;

        const errors: unknown[] = result.errors as unknown[];

        if(errors && errors[0]) {
            detail = (errors[0] as Record<string, unknown>).detail;
        }

        if(detail) {
            throw new Error(String(detail));
        }

        if(result.message) {
            throw new Error(String(result.message));
        }

        throw new Error(`HTTP ${response.status}`);
    }

    let link: Record<string, unknown> = {};

    if(result.payment_link) {
        link = result.payment_link as Record<string, unknown>;
    }

    return { url: link.url, orderId: link.order_id };
}


//VERIFY WEBHOOK
//square signs base64 hmac-sha256 of notification url + raw body with SQUARE_WEBHOOK_SIGNATURE_KEY
export function verify_webhook_signature(raw_body: string, signature_header: string | null, notification_url: string): boolean {
    const key: string | undefined = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;

    //no key means checks are off, only safe while wiring up
    if(!key) {
        return true;
    }

    if(!signature_header) {
        return false;
    }

    const expected: string = createHmac("sha256", key).update(notification_url + raw_body).digest("base64");

    const expected_bytes: Buffer = Buffer.from(expected);

    const given_bytes: Buffer = Buffer.from(signature_header);

    if(expected_bytes.length !== given_bytes.length) {
        return false;
    }

    return timingSafeEqual(expected_bytes, given_bytes);
}
