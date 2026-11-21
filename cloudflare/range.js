// Byte-range answers for video and audio.
// Safari (every browser on an iPhone) only plays a <video> from a server that answers
// "Range: bytes=a-b" with 206 Partial Content. The assets binding answers such a request
// with the whole file and 200, so the worker cuts the requested part out itself.

const isMedia = (headers) => /^(video|audio)\//.test(headers.get("Content-Type") || "");

/** Says "this file can be asked for in parts" on full answers for video and audio. */
export function advertiseRanges(headers) {
  if (isMedia(headers)) headers.set("Accept-Ranges", "bytes");
}

/**
 * Turns a full 200 answer into the part the request asked for.
 * Returns null when there is nothing to do (no Range header, not media, not a plain 200, several ranges).
 */
export async function partialResponse(request, response, headers) {
  const range = request.headers.get("Range");
  if (!range || request.method !== "GET" || response.status !== 200 || !isMedia(headers)) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;

  const body = await response.arrayBuffer();
  const size = body.byteLength;
  let start, end;
  if (match[1] === "") {
    // "bytes=-500": the last 500 bytes
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }

  const out = new Headers(headers);
  out.set("Accept-Ranges", "bytes");
  if (size === 0 || start >= size || start > end) {
    out.set("Content-Range", `bytes */${size}`);
    out.delete("Content-Length");
    return new Response(null, { status: 416, headers: out });
  }
  out.set("Content-Range", `bytes ${start}-${end}/${size}`);
  out.set("Content-Length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers: out });
}
