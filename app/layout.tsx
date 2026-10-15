import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "INEXT | Sua próxima partida começa aqui",
  description: "Keys digitais para Steam, Xbox e PlayStation. Conheça seu próximo jogo na INEXT.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
