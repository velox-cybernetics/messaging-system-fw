//JSON RESPONSE
export function json(data: unknown, status: number, extra_headers: Record<string, string> = {}): Response {
    const headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

    for(const name of Object.keys(extra_headers)) {
        headers[name] = extra_headers[name] as string;
    }

    return new Response(JSON.stringify(data), { status: status, headers: headers });
}


//FAIL
export function fail(status: number, error: string): Response {
    return json({ error: error }, status);
}


//READ BODY
//null when the body is missing or isnt json
export async function read_body(request: Request): Promise<Record<string, unknown> | null> {
    try {
        const data: unknown = await request.json();

        if(typeof data === "object" && data !== null) {
            return data as Record<string, unknown>;
        }

        return null;
    } catch(error: unknown) {
        return null;
    }
}


//SERVER ERROR
//every handler answers with a readable error instead of a bare 500
export function server_error(error: unknown): Response {
    console.error("DASHBOARD ERROR: " + String(error));

    let message: string = "Something broke on the server.";

    if(error instanceof Error) {
        message = error.message;
    }

    return fail(500, message);
}
