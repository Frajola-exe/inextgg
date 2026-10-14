import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Exercise the real auth function with a headers implementation that must not run
// when deployed to Vercel: visitor-provided identity headers are untrusted there.
test("Vercel rejects Sites identity headers before reading them", async () => {
  const source = await readFile(new URL("../app/chatgpt-auth.ts", import.meta.url), "utf8");
  const stub = `data:text/javascript,${encodeURIComponent('export function headers(){throw new Error("untrusted headers read")} export function redirect(){throw new Error("redirect")}')}`;
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll('"next/headers"', JSON.stringify(stub)).replaceAll('"next/navigation"', JSON.stringify(stub));
  const auth = await import(`data:text/javascript,${encodeURIComponent(code)}`);
  const previous = { VERCEL: process.env.VERCEL, INEXT_VERCEL_RUNTIME: process.env.INEXT_VERCEL_RUNTIME };
  try {
    for (const flag of ["VERCEL", "INEXT_VERCEL_RUNTIME"]) {
      delete process.env.VERCEL;
      delete process.env.INEXT_VERCEL_RUNTIME;
      process.env[flag] = "1";
      assert.equal(await auth.getChatGPTUser(), null);
    }
    delete process.env.VERCEL;
    delete process.env.INEXT_VERCEL_RUNTIME;
    await assert.rejects(auth.getChatGPTUser(), /untrusted headers read/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
