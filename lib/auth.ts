import { cookies } from "next/headers";
import { env } from "cloudflare:workers";
import { getChatGPTUser, type ChatGPTUser } from "../app/chatgpt-auth";

const ACCESS = "inext-access";
const REFRESH = "inext-refresh";
export type Session = { access_token: string; refresh_token: string; expires_in: number };
export type AuthUser = { id: string; email?: string; email_confirmed_at?: string; user_metadata?: { name?: string } };

export class AuthError extends Error {
 constructor(message: string, public status = 400) { super(message); }
}

export function authConfigured() { return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY); }

export async function authRequest<T = Record<string, unknown>>(path: string, body?: unknown, token?: string): Promise<T> {
 if (!authConfigured()) throw new AuthError("O acesso à conta está indisponível no momento. Tente novamente mais tarde.", 503);
 const base = new URL(env.SUPABASE_URL!);
 if (base.protocol !== "https:") throw new AuthError("O acesso à conta está indisponível no momento.", 503);
 let response: Response;
 try {
  response = await fetch(`${base.origin}/auth/v1/${path}`, {
   method: body === undefined ? "GET" : "POST", cache: "no-store",
   headers: { apikey: env.SUPABASE_ANON_KEY!, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
   body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
 } catch { throw new AuthError("Não foi possível conectar ao serviço de contas. Tente novamente.", 503); }
 const data = await response.json().catch(() => ({})) as Record<string, unknown>;
 if (!response.ok) {
  if (response.status === 429) throw new AuthError("Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.", 429);
  if (response.status >= 500) throw new AuthError("O serviço de contas está temporariamente indisponível.", 503);
  if (data.code === "email_not_confirmed" || data.error_code === "email_not_confirmed") throw new AuthError("Confirme seu e-mail antes de entrar.", 401);
  throw new AuthError("Não foi possível autenticar. Confira seus dados e a confirmação do e-mail.", 401);
 }
 return data as T;
}

function userIdentity(user: AuthUser): ChatGPTUser | null {
 // Only provider-verified email can match ADMIN_EMAILS. Never trust metadata roles.
 if (!user.id || !user.email || !user.email_confirmed_at) return null;
 const name = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : user.email;
 return { userId: `supabase:${user.id}`, email: user.email, displayName: name, fullName: name };
}

export async function saveSession(session: Session) {
 if (typeof session.access_token !== "string" || !session.access_token || typeof session.refresh_token !== "string" || !session.refresh_token || !Number.isFinite(session.expires_in) || session.expires_in <= 0) throw new AuthError("Sessão inválida. Entre novamente.", 401);
 const jar = await cookies();
 const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
 jar.set(ACCESS, session.access_token, { ...options, maxAge: Math.max(1, session.expires_in) });
 jar.set(REFRESH, session.refresh_token, { ...options, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSession() {
 const jar = await cookies();
 for (const name of [ACCESS, REFRESH]) jar.set(name, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export async function sessionUser(): Promise<ChatGPTUser | null> {
 const jar = await cookies();
 const access = jar.get(ACCESS)?.value, refresh = jar.get(REFRESH)?.value;
 if (!access && !refresh) return null;
 if (!authConfigured()) return null;
 if (access) {
  try { return userIdentity(await authRequest<AuthUser>("user", undefined, access)); }
  catch (error) { if (!(error instanceof AuthError) || error.status !== 401) throw error; }
 }
 if (refresh) {
  try {
   const session = await authRequest<Session>("token?grant_type=refresh_token", { refresh_token: refresh });
   const user = userIdentity(await authRequest<AuthUser>("user", undefined, session.access_token));
   if (user) { await saveSession(session); return user; }
  } catch (error) { if (!(error instanceof AuthError) || error.status !== 401) throw error; }
 }
 await clearSession();
 return null;
}

export async function currentUser() { return (await sessionUser()) ?? (await getChatGPTUser()); }

export function isAdmin(user: ChatGPTUser | null) {
 return !!user && (env.ADMIN_EMAILS || "").split(",").map(email => email.trim().toLowerCase()).filter(Boolean).includes(user.email.toLowerCase());
}

