import { avatarGradient } from "@/lib/format";
import { isImageUrl } from "@/lib/metadata";

export function TokenAvatar({
  address,
  symbol,
  image,
  size = 44,
  className = "",
}: {
  address: string;
  symbol: string;
  image?: string;
  size?: number;
  className?: string;
}) {
  const dim = { width: size, height: size };
  if (isImageUrl(image)) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={image}
        alt={symbol}
        style={dim}
        className={`shrink-0 rounded-full object-cover ring-1 ring-white/10 ${className}`}
      />
    );
  }
  return (
    <div
      style={{ ...dim, background: avatarGradient(address || "0x0000") }}
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white/90 ring-1 ring-white/10 ${className}`}
    >
      {(symbol || "?").slice(0, 3).toUpperCase()}
    </div>
  );
}
