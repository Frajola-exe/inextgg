export function safeReturnTo(value: string | null) {
 if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
 try {
  const url = new URL(value, "https://store.local");
  if (url.origin !== "https://store.local" || /^\/(api|entrar|cadastro|signin-with-chatgpt|signout-with-chatgpt|callback)(\/|$)/.test(url.pathname)) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
 } catch { return "/"; }
}
