/**
 * Placeholder product art for listings without a photo: an emoji picked from
 * the title on a gradient picked from a hash of the title.
 *
 * Shared by the shop cards (components/ProductArt.tsx, Tailwind classes) and the
 * Blink preview image (app/api/actions/art, plain hex colours) so both match.
 */

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

/** Each gradient as Tailwind classes (for the UI) and hex stops (for images). Keep them in sync. */
export const GRADIENTS: { classes: string; hex: [string, string, string] }[] = [
  { classes: "from-fuchsia-500 via-purple-600 to-indigo-700", hex: ["#d946ef", "#9333ea", "#4338ca"] },
  { classes: "from-amber-400 via-orange-500 to-rose-600", hex: ["#fbbf24", "#f97316", "#e11d48"] },
  { classes: "from-emerald-400 via-teal-500 to-cyan-700", hex: ["#34d399", "#14b8a6", "#0e7490"] },
  { classes: "from-sky-400 via-blue-600 to-violet-700", hex: ["#38bdf8", "#2563eb", "#6d28d9"] },
  { classes: "from-pink-400 via-rose-500 to-red-600", hex: ["#f472b6", "#f43f5e", "#dc2626"] },
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export const emojiFor = (title: string) => EMOJI_RULES.find(([re]) => re.test(title))?.[1] ?? "🛍️";
export const gradientFor = (title: string) => GRADIENTS[hash(title) % GRADIENTS.length];
