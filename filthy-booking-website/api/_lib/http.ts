//JSON
export function json(data: unknown, status: number, headers: Record<string, string> = {}): Response {
    const all_headers: Record<string, string> = { "Content-Type": "application/json; charset=utf-8" };

    for(const name of Object.keys(headers)) {
        all_headers[name] = headers[name] as string;
    }

    return new Response(JSON.stringify(data), { status: status, headers: all_headers });
}


//FAIL
export function fail(status: number, error: string): Response {
    return json({ error: error }, status);
}


//ERROR TEXT
export function error_text(error: unknown): string {
    if(error instanceof Error) {
        return error.message;
    }

    return String(error);
}
