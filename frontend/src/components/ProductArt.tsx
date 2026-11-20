"use client";
/**
 * Product picture. Uses the listing's image URL when there is one; otherwise
 * draws a colourful gradient with an emoji picked from the title, so listings
 * without photos still look good in the feed. The emoji/gradient rules live in
 * lib/art.ts (shared with the Blink preview image).
 */
import { useState } from "react";
import { emojiFor, gradientFor } from "@/lib/art";

export function ProductArt({ title, imageUrl, className = "" }: { title: string; imageUrl: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (imageUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={title} onError={() => setBroken(true)} className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br ${gradientFor(title).classes} ${className}`}>
      <span className="text-7xl drop-shadow-lg">{emojiFor(title)}</span>
    </div>
  );
}
