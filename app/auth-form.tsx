"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle, LogIn, UserPlus, CheckCircle } from "lucide-react";
import { Logo } from "./store";
import { safeReturnTo } from "../lib/auth-path";

export default function AuthForm({ signup = false, sitesAvailable = false }: { signup?: boolean; sitesAvailable?: boolean }) {
 const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [returnTo, setReturnTo] = useState("/");
 useEffect(() => {
  setReturnTo(safeReturnTo(new URLSearchParams(location.search).get("return_to")));
  // Supabase's default confirmation link redirects with a URL fragment. Do not persist its tokens.
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has("error")) setError("Este link de confirmação é inválido ou expirou. Solicite um novo cadastro com o mesmo e-mail.");
  else if (fragment.has("access_token")) setMessage("E-mail confirmado. Entre com seu e-mail e senha para continuar.");
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
 }, []);
 const suffix = `?return_to=${encodeURIComponent(returnTo)}`;
 async function submit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const password = String(form.get("password") || "");
  if (signup && password !== form.get("confirmation")) { setError("As senhas precisam ser iguais."); return; }
  setBusy(true); setError(""); setMessage("");
  try {
   const response = await fetch(`/api/auth/${signup ? "signup" : "login"}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: form.get("email"), password, ...(signup ? { name: form.get("name") } : {}) }),
   });
   const result = await response.json() as { error?: string; message?: string };
   if (!response.ok) throw new Error(result.error || "Não foi possível concluir a ação.");
   if (signup) { setMessage(result.message || "Confira seu e-mail para confirmar o cadastro."); (event.target as HTMLFormElement).reset(); }
   else { location.assign(returnTo); }
  } catch (error) { setError(error instanceof Error ? error.message : "Não foi possível conectar. Tente novamente."); }
  finally { setBusy(false); }
 }
 return <main className="auth-page"><Logo/><section className="panel auth-panel">
  <span className="auth-symbol">{signup ? <UserPlus size={28}/> : <LogIn size={28}/>}</span>
  <h1>{signup ? "Crie sua conta" : "Entre na sua conta"}</h1>
  <p className="muted">{signup ? "Cadastre-se para comprar e acompanhar a entrega dos seus jogos." : "Acompanhe seus pedidos e acesse suas keys."}</p>
  {error && <p className="error" role="alert">{error}</p>}
  {message && <div className="notice auth-message" role="status"><CheckCircle size={20}/><p>{message}</p></div>}
  {!(signup && message) && <form className="auth-form" onSubmit={submit}>
   {signup && <label htmlFor="auth-name">Nome<input id="auth-name" name="name" autoComplete="name" required minLength={2} maxLength={100} disabled={busy}/></label>}
   <label htmlFor="auth-email">E-mail<input id="auth-email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy}/></label>
   <label htmlFor="auth-password">Senha<input id="auth-password" name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 12 : 1} maxLength={128} aria-describedby={signup ? "password-hint" : undefined} disabled={busy}/>{signup && <small id="password-hint" className="muted">Use pelo menos 12 caracteres.</small>}</label>
   {signup && <label htmlFor="auth-confirmation">Confirme sua senha<input id="auth-confirmation" name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} disabled={busy}/></label>}
   <button type="submit" className="primary full" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin"/> : signup ? <UserPlus size={18}/> : <LogIn size={18}/>} {busy ? "Aguarde…" : signup ? "Criar conta" : "Entrar"}</button>
  </form>}
  <p className="auth-switch">{signup ? "Já tem uma conta?" : "Ainda não tem uma conta?"} <a href={`${signup ? "/entrar" : "/cadastro"}${suffix}`}>{signup ? "Entrar" : "Cadastre-se"}<ArrowRight size={14}/></a></p>
  {sitesAvailable && !signup && <a className="secondary full" target="_top" href={`/signin-with-chatgpt${suffix}`}>Entrar com ChatGPT</a>}
  <a className="text-btn auth-back" href={returnTo === "/admin" ? "/" : returnTo}><ArrowLeft size={16}/>Voltar para a loja</a>
 </section></main>;
}
