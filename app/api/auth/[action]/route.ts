import { z } from "zod";
import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { AuthError, authRequest, saveSession, clearSession, sessionUser, type Session, type AuthUser } from "../../../../lib/auth";

const credentials = z.object({
 email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
 password: z.string().min(1).max(128),
 name: z.string().trim().min(2).max(100).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
 const noStore = { "Cache-Control": "private, no-store" };
 try {
  if (request.headers.get("origin") !== new URL(request.url).origin) throw new AuthError("Origem inválida.", 403);
  const { action } = await context.params;
  if (!["login", "signup", "logout"].includes(action)) throw new AuthError("Ação inválida.", 404);
  if (action === "logout") {
   await sessionUser();
   const token = (await cookies()).get("inext-access")?.value;
   // Invalidate the provider session before reporting a successful sign-out.
   if (token) {
    try { await authRequest("logout", {}, token); }
    catch (error) { if (!(error instanceof AuthError) || error.status !== 401) throw error; }
   }
   await clearSession();
   return Response.json({ ok: true }, { headers: noStore });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AuthError("Envie os dados do formulário.", 415);
  const text = await request.text();
  if (text.length > 4096) throw new AuthError("Formulário muito grande.", 413);
  let input;
  try { input = JSON.parse(text); } catch { throw new AuthError("Formulário inválido."); }
  const parsed = credentials.safeParse(input);
  if (!parsed.success) throw new AuthError("Confira o e-mail e os campos do formulário.");
  const { email, password, name } = parsed.data;
  if (action === "signup") {
   if (!name || password.length < 12) throw new AuthError("Informe seu nome e uma senha com pelo menos 12 caracteres.");
   if (!env.SITE_URL) throw new AuthError("O cadastro está temporariamente indisponível.", 503);
   const redirect = new URL("/entrar", env.SITE_URL);
   await authRequest(`signup?redirect_to=${encodeURIComponent(redirect.href)}`, { email, password, data: { name } });
   // Always require email confirmation; never create an admin session from signup input.
   return Response.json({ message: "Se o cadastro puder ser concluído, você receberá um e-mail de confirmação. Confira também a pasta de spam. Depois de confirmar, entre com seu e-mail e senha." }, { headers: noStore });
  }
  const session = await authRequest<Session>("token?grant_type=password", { email, password });
  // Validate with Auth instead of trusting client claims or editable user metadata.
  const user = await authRequest<AuthUser>("user", undefined, session.access_token);
  if (!user.email_confirmed_at || !user.email || !user.id) throw new AuthError("Confirme seu e-mail antes de entrar.", 401);
  await saveSession(session);
  return Response.json({ ok: true }, { headers: noStore });
 } catch (error) {
  return Response.json({ error: error instanceof AuthError ? error.message : "Não foi possível concluir a ação. Tente novamente." }, { status: error instanceof AuthError ? error.status : 500, headers: noStore });
 }
}
