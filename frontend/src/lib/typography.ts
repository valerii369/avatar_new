/**
 * AVATAR Typography System — единый источник правды.
 * Меняем здесь → меняется везде.
 */

export const T = {
  heading:     { size: 22, weight: 800, font: "'Outfit', sans-serif" },
  headingNum:  { size: 40, weight: 800, font: "'Outfit', sans-serif" },
  title:       { size: 15, weight: 600, font: "inherit" },
  titleBold:   { size: 15, weight: 700, font: "inherit" },
  body:        { size: 13, weight: 500, font: "inherit" },
  caption:     { size: 11, weight: 500, font: "inherit" },
  label:       { size: 10, weight: 700, font: "inherit", caps: true, spacing: "0.08em" },
  capsDisplay: { size: 11, weight: 600, font: "inherit", caps: true, spacing: "0.15em" },
  micro:       { size: 9,  weight: 600, font: "inherit" },
  microBold:   { size: 9,  weight: 700, font: "inherit" },
} as const;

/** Helper: returns CSSProperties for a typography token */
export function typo(token: keyof typeof T): React.CSSProperties {
  const t = T[token];
  return {
    fontSize: t.size,
    fontWeight: t.weight,
    fontFamily: t.font,
    ...('caps' in t && t.caps ? { textTransform: "uppercase" as const, letterSpacing: t.spacing } : {}),
  };
}
