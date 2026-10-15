import { waitUntil } from "@vercel/functions";
import { postgresDatabase } from "./postgres.mjs";

export { waitUntil };

// Read secrets at request time; never embed them in the client or build output.
export const env = new Proxy({}, {
  get(_target, key) {
    if (key === "DB") return postgresDatabase();
    return typeof key === "string" ? process.env[key] : undefined;
  },
});
