// Runs the real routes with an in-memory D1 adapter and stubbed platform identity.
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
export async function resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'test:workers',shortCircuit:true};
 if(specifier.endsWith('/app/chatgpt-auth'))return {url:'test:identity',shortCircuit:true};
 if(specifier.startsWith('.')){const url=new URL(specifier,context.parentURL);for(const ext of ['.ts','.tsx']){const candidate=url.href+ext;if(existsSync(fileURLToPath(candidate)))return {url:candidate,shortCircuit:true};}}
 return next(specifier,context);
}
export async function load(url,context,next){
 if(url==='test:workers')return {format:'module',source:'export const env=globalThis.__appmaxTestEnv; export const waitUntil=p=>globalThis.__appmaxTestTasks.push(p);',shortCircuit:true};
 if(url==='test:identity')return {format:'module',source:'export const getChatGPTUser=async()=>globalThis.__appmaxTestUser;',shortCircuit:true};
 if(url.endsWith('.ts')||url.endsWith('.tsx')){const source=await readFile(fileURLToPath(url),'utf8');return {format:'module',source:ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};}
 return next(url,context);
}
