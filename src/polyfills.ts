// Alexa-hosted skills run Node.js 16, which lacks globals the Anthropic SDK relies on.
// Import this before anything else.
import { webcrypto } from "node:crypto";
import { ReadableStream } from "node:stream/web";
import { fetch, FormData, Headers, Request, Response } from "undici";

const g = globalThis as Record<string, unknown>;
const fill = (name: string, value: unknown) => {
  if (g[name] === undefined) g[name] = value;
};

fill("fetch", fetch);
fill("Headers", Headers);
fill("Request", Request);
fill("Response", Response);
fill("FormData", FormData);
fill("ReadableStream", ReadableStream);
fill("crypto", webcrypto);
