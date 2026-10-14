import { waitUntil } from "@vercel/functions";
import { createD1HttpDatabase } from "./d1-http.mjs";

export { waitUntil };

// Read secrets at request time; never embed them in the client or build output.
const database = createD1HttpDatabase(() => ({
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID,
  token: process.env.CLOUDFLARE_D1_API_TOKEN,
}));

export const env = new Proxy({}, {
  get(_target, key) {
    if (key === "DB") return database;
    return typeof key === "string" ? process.env[key] : undefined;
  },
});
