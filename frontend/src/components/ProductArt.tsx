"use client";
/**
 * Product picture. Uses the listing's image URL when there is one; otherwise
 * draws a colourful gradient with an emoji picked from the title, so listings
 * without photos still look good in the feed.
 */
import { useState } from "react";

// First match wins, so put more specific words first ("lip mask" → 💋, not 🧴).
const EMOJI_RULES: [RegExp, string][] = [
  [/lip|lipstick|gloss/i, "💋"],
  [/serum|cream|skin|lotion|mask/i, "🧴"],
  [/phone|grip|case|charger/i, "📱"],
  [/printer|label/i, "🖨️"],
  [/bud|headphone|earphone|audio|speaker/i, "🎧"],
  [/shoe|sneaker/i, "👟"],
  [/shirt|hoodie|dress|tee/i, "👕"],
  [/watch/i, "⌚"],
  [/lamp|light|led/i, "💡"],
  [/bag|tote|backpack/i, "👜"],
];

const GRADIENTS = [
  "from-fuchsia-500 via-purple-600 to-indigo-700",
  "from-amber-400 via-orange-500 to-rose-600",
  "from-emerald-400 via-teal-500 to-cyan-700",
  "from-sky-400 via-blue-600 to-violet-700",
  "from-pink-400 via-rose-500 to-red-600",
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function ProductArt({ title, imageUrl, className = "" }: { title: string; imageUrl: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (imageUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt={title} onError={() => setBroken(true)} className={`object-cover ${className}`} />;
  }
  const emoji = EMOJI_RULES.find(([re]) => re.test(title))?.[1] ?? "🛍️";
  const gradient = GRADIENTS[hash(title) % GRADIENTS.length];
  return (
    <div className={`flex items-center justify-center bg-gradient-to-br ${gradient} ${className}`}>
      <span className="text-7xl drop-shadow-lg">{emoji}</span>
    </div>
  );
}
