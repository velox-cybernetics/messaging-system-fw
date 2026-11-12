import { get, put, type GetBlobResult, type PutBlobResult } from "@vercel/blob";
import { fail, json, server_error } from "./_lib/http.js";
import { refuse, refuse_bot } from "./_lib/session.js";


//CONSTANTS
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

const MAX_BYTES: number = 4 * 1024 * 1024;

const NOT_LETTERS: RegExp = /[^a-z]/g;


//IS BLOB URL
//only the private blob store, the one kind ingest keeps and this serves back
function is_blob_url(value: string): boolean {
    try {
        const url: URL = new URL(value);

        return url.protocol === "https:" && url.hostname.endsWith(".private.blob.vercel-storage.com");
    } catch(error: unknown) {
        return false;
    }
}


//SHOW PIC
//the store is private so every pic comes through here for a signed in owner
async function show_pic(request: Request): Promise<Response> {
    const refused: Response | null = refuse(request);

    if(refused !== null) {
        return refused;
    }

    const params: URLSearchParams = new URL(request.url).searchParams;

    let url: string | null = params.get("url");

    if(url === null) {
        url = "";
    }

    if(!is_blob_url(url)) {
        return fail(400, "That pic link isn't one the dashboard keeps.");
    }

    const result: GetBlobResult | null = await get(url, { access: "private" });

    if(result === null || result.statusCode !== 200) {
        return fail(404, "This pic isn't kept anymore.");
    }

    //every upload gets a new random name so a stored pic never changes
    const headers: Record<string, string> = { "Content-Type": result.blob.contentType, "Cache-Control": "private, max-age=31536000, immutable" };

    return new Response(result.stream, { headers: headers });
}


//STORE PIC
//the bot sends raw image bytes here and puts the url it gets back in the transcript event
async function store_pic(request: Request): Promise<Response> {
    const refused: Response | null = refuse_bot(request);

    if(refused !== null) {
        return refused;
    }

    let content_type: string | null = request.headers.get("content-type");

    if(content_type === null) {
        content_type = "";
    }

    const first_part: string = content_type.split(";")[0] as string;

    const type: string = first_part.trim();

    const extension: string | undefined = EXTENSIONS[type];

    if(extension === undefined) {
        return fail(415, "Unsupported image type");
    }

    const length_header: string | null = request.headers.get("content-length");

    let content_length: number = 0;

    if(length_header !== null) {
        content_length = Number(length_header);
    }

    if(content_length > MAX_BYTES) {
        return fail(413, "Image too large");
    }

    const bytes: Buffer = Buffer.from(await request.arrayBuffer());

    if(bytes.length > MAX_BYTES) {
        return fail(413, "Image too large");
    }

    if(bytes.length === 0) {
        return fail(400, "Empty body");
    }

    const params: URLSearchParams = new URL(request.url).searchParams;

    let channel_param: string | null = params.get("channel");

    if(channel_param === null) {
        channel_param = "";
    }

    let channel: string = channel_param.replace(NOT_LETTERS, "");

    if(channel === "") {
        channel = "unknown";
    }

    const path: string = "mams/" + channel + "/" + String(Date.now()) + "." + extension;

    const blob: PutBlobResult = await put(path, bytes, { access: "private", contentType: type, addRandomSuffix: true });

    return json({ url: blob.url }, 200);
}


//GET
export async function GET(request: Request): Promise<Response> {
    try {
        return await show_pic(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}


//POST
export async function POST(request: Request): Promise<Response> {
    try {
        return await store_pic(request);
    } catch(error: unknown) {
        return server_error(error);
    }
}
