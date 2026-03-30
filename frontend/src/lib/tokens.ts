/**
 * AVATAR Design Tokens — единый источник правды.
 * Типографика + отступы + радиусы.
 * Меняем здесь → меняется везде.
 */

// ─── Typography ──────────────────────────────────────────────────────────────

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

export function typo(token: keyof typeof T): React.CSSProperties {
  const t = T[token];
  return {
    fontSize: t.size,
    fontWeight: t.weight,
    fontFamily: t.font,
    ...('caps' in t && t.caps ? { textTransform: "uppercase" as const, letterSpacing: t.spacing } : {}),
  };
}

// ─── Spacing ─────────────────────────────────────────────────────────────────

export const S = {
  /** 4px — минимальный зазор (между label и значением) */
  xs:   4,
  /** 8px — малый (gap в grid, между badge) */
  sm:   8,
  /** 12px — средний (padding карточки по вертикали, gap между элементами) */
  md:   12,
  /** 16px — стандартный (padding по бокам страницы, gap между карточками) */
  base: 16,
  /** 20px — большой (padding секций, header по бокам) */
  lg:   20,
  /** 24px — увеличенный (padding модалок, между секциями) */
  xl:   24,
  /** 32px — секционный (между блоками контента) */
  xxl:  32,
  /** 40px — страничный (верхний отступ empty state) */
  page: 40,
} as const;

// ─── Radius ──────────────────────────────────────────────────────────────────

export const R = {
  /** 8px — badge, мелкие элементы */
  sm:   8,
  /** 10px — табы, фильтры */
  md:   10,
  /** 14px — карточки, input */
  lg:   14,
  /** 16px — секции, большие карточки */
  xl:   16,
  /** 20px — bottom nav, модалки, контейнеры */
  xxl:  20,
  /** 50% — аватар, иконки */
  full: "50%",
} as const;

// ─── Page Layout ─────────────────────────────────────────────────────────────

export const Layout = {
  /** Боковой padding страницы */
  pagePx:      S.base,    // 16px
  /** Верхний padding header (после safe area) */
  headerPt:    6,
  /** Нижний padding header */
  headerPb:    8,
  /** Padding контента от bottom nav */
  navClearance: 90,
  /** Высота bottom nav (с отступами) */
  navHeight:    72,
  /** Padding внутри карточек */
  cardPx:      14,
  cardPy:      12,
  /** Gap между карточками в grid */
  cardGap:     S.sm,      // 8px
  /** Gap между секциями */
  sectionGap:  S.md,      // 12px
} as const;
