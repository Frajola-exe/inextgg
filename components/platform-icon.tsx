import { Package } from "lucide-react";

const logos: Record<string, string> = {
  Steam: "/platforms/steam.svg",
  PlayStation: "/platforms/playstation.svg",
  Xbox: "/platforms/xbox.svg",
};

/** Decorative: every platform icon is accompanied by its platform name. */
export function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  const src = logos[platform];
  return src ? (
    <img className="platform-logo" src={src} width={size} height={size} alt="" aria-hidden="true" />
  ) : (
    <Package size={size} aria-hidden="true" />
  );
}
