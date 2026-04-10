"use client";
import { T, typo, S, R, Layout } from "@/lib/tokens";

const TOKENS = [
  { key: "heading",     label: "heading",      desc: "Заголовки страниц", size: T.heading.size,     weight: T.heading.weight,     lh: T.heading.lh,     font: "Outfit" },
  { key: "headingNum",  label: "heading-num",   desc: "Число уровня (в круге)", size: T.headingNum.size,  weight: T.headingNum.weight,  lh: T.headingNum.lh,  font: "Outfit" },
  { key: "title",       label: "title",         desc: "Заголовки карточек, имя, модалки", size: T.title.size,       weight: T.title.weight,       lh: T.title.lh,       font: "Inter" },
  { key: "titleBold",   label: "title-bold",    desc: "Акцентные заголовки (имя, значения)", size: T.titleBold.size,   weight: T.titleBold.weight,   lh: T.titleBold.lh,   font: "Inter" },
  { key: "body",        label: "body",          desc: "Основной текст, описания", size: T.body.size,        weight: T.body.weight,        lh: T.body.lh,        font: "Inter" },
  { key: "caption",     label: "caption",       desc: "Табы, фильтры, подписи, счётчики", size: T.caption.size,     weight: T.caption.weight,     lh: T.caption.lh,     font: "Inter" },
  { key: "capsDisplay", label: "caps-display",  desc: "Декоративные CAPS (УРОВЕНЬ СОЗНАНИЯ)", size: T.capsDisplay.size, weight: T.capsDisplay.weight, lh: T.capsDisplay.lh, font: "Inter · CAPS", caps: true },
  { key: "label",       label: "label",         desc: "Uppercase лейблы, секции, бейджи", size: T.label.size,       weight: T.label.weight,       lh: T.label.lh,       font: "Inter · CAPS", caps: true },
  { key: "micro",       label: "micro",         desc: "Нижнее меню, influence badge", size: T.micro.size,       weight: T.micro.weight,       lh: T.micro.lh,       font: "Inter" },
  { key: "microBold",   label: "micro-bold",    desc: "Badge текст (СИЛЬНОЕ, СРЕДНЕЕ)", size: T.microBold.size,   weight: T.microBold.weight,   lh: T.microBold.lh,   font: "Inter" },
] as const;

export default function TypographyPage() {
  return (
    <div style={{ background: "#060818", minHeight: "100vh", padding: "40px 20px", color: "#fff" }}>
      <h1 style={{ ...typo("heading"), background: "linear-gradient(135deg, #a78bfa, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 8 }}>
        Типографика AVATAR
      </h1>
      <p style={{ ...typo("body"), color: "rgba(255,255,255,0.4)", marginBottom: 40 }}>
        Единый источник: <code style={{ color: "#a78bfa" }}>lib/typography.ts</code> — меняем там, меняется везде
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        {/* HEADING */}
        <Card token="heading" desc="Заголовки страниц" spec="22px · 800 · lh 1.2 · Outfit">
          <span style={{ ...typo("heading"), color: "#fff" }}>Твой мир</span>
          <span style={{ ...typo("heading"), background: "linear-gradient(135deg, #a78bfa, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Дневник</span>
          <span style={{ ...typo("heading"), background: "linear-gradient(135deg, #a78bfa, #8b5cf6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Профиль</span>
        </Card>

        {/* HEADING NUM */}
        <Card token="heading-num" desc="Число уровня (в круге)" spec="40px · 800 · lh 1.0 · Outfit">
          <div style={{ display: "flex", gap: 24 }}>
            <span style={{ ...typo("headingNum"), background: "linear-gradient(135deg, #a78bfa, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>1</span>
            <span style={{ ...typo("headingNum"), background: "linear-gradient(135deg, #a78bfa, #f59e0b)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>42</span>
          </div>
        </Card>

        {/* TITLE */}
        <Card token="title" desc="Заголовки карточек, имя, модалки" spec="15px · 600 · lh 1.3 · Inter">
          <span style={{ ...typo("title"), color: "#fff" }}>Валерий</span>
          <span style={{ ...typo("title"), color: "#fff" }}>Внешняя Нелюбовь</span>
        </Card>

        {/* TITLE BOLD */}
        <Card token="title-bold" desc="Акцентные заголовки (значения карточек)" spec="15px · 700 · lh 1.3 · Inter">
          <span style={{ ...typo("titleBold"), color: "#8b5cf6" }}>Сострадающий Алхимик</span>
          <span style={{ ...typo("titleBold"), color: "#fff" }}>Валерий</span>
        </Card>

        {/* BODY */}
        <Card token="body" desc="Основной текст, описания" spec="13px · 500 · lh 1.6 · Inter">
          <span style={{ ...typo("body"), color: "rgba(255,255,255,0.95)", lineHeight: "1.6" }}>
            Раненый, но светящийся строитель мостов, превращающий внутренние разломы в мудрость и сочувствие.
          </span>
          <span style={{ ...typo("body"), fontWeight: 700, color: "#8b5cf6" }}>Космический Архитектор</span>
          <span style={{ ...typo("body"), fontWeight: 700, color: "#f59e0b" }}>100</span>
        </Card>

        {/* CAPTION */}
        <Card token="caption" desc="Табы, фильтры, подписи, счётчики" spec="11px · 500 · lh 1.4 · Inter">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Chip active>Портрет</Chip>
            <Chip>Разбор</Chip>
            <Chip>Стороны</Chip>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill active>Все</Pill>
            <Pill>Личность</Pill>
            <Pill>Ресурсы</Pill>
            <Pill>Связи</Pill>
          </div>
          <span style={{ ...typo("caption"), color: "rgba(255,255,255,0.4)" }}>45 · 12 сфер</span>
          <span style={{ ...typo("caption"), color: "rgba(255,255,255,0.4)" }}>Новичок · Ур.1</span>
        </Card>

        {/* CAPS DISPLAY */}
        <Card token="caps-display" desc="Декоративные CAPS надписи" spec="11px · 600 · lh 1.2 · Inter · CAPS">
          <span style={{ ...typo("capsDisplay"), color: "rgba(255,255,255,0.2)" }}>Уровень Сознания</span>
          <span style={{ ...typo("capsDisplay"), color: "rgba(255,255,255,0.25)" }}>☼ Чат с внутренним миром</span>
        </Card>

        {/* LABEL */}
        <Card token="label" desc="Uppercase лейблы, секции, даты, бейджи" spec="10px · 700 · lh 1.2 · Inter · CAPS">
          <span style={{ ...typo("label"), color: "rgba(139,92,246,0.5)" }}>Идентификация Аватара</span>
          <span style={{ ...typo("label"), color: "rgba(139,92,246,0.8)" }}>Архетип</span>
          <span style={{ ...typo("label"), color: "#10b981" }}>Сильные стороны</span>
          <span style={{ ...typo("label"), color: "#ef4444" }}>Теневые аспекты</span>
          <span style={{ ...typo("label"), color: "rgba(255,255,255,0.2)" }}>Активные сферы</span>
        </Card>

        {/* MICRO */}
        <Card token="micro" desc="Нижнее меню подписи" spec="9px · 600 · lh 1.3 · Inter">
          <div style={{ display: "flex", gap: 16 }}>
            <span style={{ ...typo("micro"), color: "#fff" }}>Главная</span>
            <span style={{ ...typo("micro"), color: "rgba(255,255,255,0.35)" }}>Твой мир</span>
            <span style={{ ...typo("micro"), color: "rgba(255,255,255,0.35)" }}>Ассистент</span>
            <span style={{ ...typo("micro"), color: "rgba(255,255,255,0.35)" }}>Дневник</span>
            <span style={{ ...typo("micro"), color: "rgba(255,255,255,0.35)" }}>Профиль</span>
          </div>
        </Card>

        {/* MICRO BOLD */}
        <Card token="micro-bold" desc="Badge текст (influence)" spec="9px · 700 · lh 1.3 · Inter">
          <div style={{ display: "flex", gap: 8 }}>
            <Badge color="#10b981">СИЛЬНОЕ</Badge>
            <Badge color="#f59e0b">СРЕДНЕЕ</Badge>
            <Badge color="rgba(255,255,255,0.3)">СЛАБОЕ</Badge>
          </div>
        </Card>

      </div>

      {/* ── SPACING ── */}
      <h2 style={{ ...typo("heading"), color: "#fff", marginTop: 48, marginBottom: 24 }}>Отступы (Spacing)</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(Object.entries(S) as [string, number][]).map(([name, value]) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ ...typo("body"), fontWeight: 700, color: "#a78bfa", width: 40 }}>{name}</span>
            <div style={{ width: value, height: 24, borderRadius: 4, background: "linear-gradient(90deg, #8b5cf6, #a78bfa)", opacity: 0.6 }} />
            <span style={{ ...typo("caption"), color: "rgba(255,255,255,0.4)" }}>{value}px</span>
            <span style={{ ...typo("caption"), color: "rgba(255,255,255,0.25)" }}>
              {name === "xs" && "зазор label↔значение"}
              {name === "sm" && "gap grid, между badge"}
              {name === "md" && "padding карточки, gap элементов"}
              {name === "base" && "padding страницы, gap карточек"}
              {name === "lg" && "padding секций, header"}
              {name === "xl" && "padding модалок, между секциями"}
              {name === "xxl" && "между блоками контента"}
              {name === "page" && "верхний отступ empty state"}
            </span>
          </div>
        ))}
      </div>

      {/* ── RADIUS ── */}
      <h2 style={{ ...typo("heading"), color: "#fff", marginTop: 48, marginBottom: 24 }}>Радиусы (Radius)</h2>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {(Object.entries(R) as [string, number | string][]).map(([name, value]) => (
          <div key={name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
            <div style={{
              width: 56, height: 56,
              borderRadius: value,
              background: "rgba(139,92,246,0.15)",
              border: "2px solid rgba(139,92,246,0.4)",
            }} />
            <span style={{ ...typo("label"), color: "#a78bfa" }}>{name}</span>
            <span style={{ ...typo("micro"), color: "rgba(255,255,255,0.3)" }}>{typeof value === "number" ? `${value}px` : value}</span>
          </div>
        ))}
      </div>

      {/* ── LAYOUT ── */}
      <h2 style={{ ...typo("heading"), color: "#fff", marginTop: 48, marginBottom: 24 }}>Layout</h2>
      <div style={{ padding: 20, borderRadius: R.xl, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        {(Object.entries(Layout) as [string, number][]).map(([name, value]) => (
          <div key={name} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ ...typo("body"), color: "#a78bfa", fontWeight: 600 }}>{name}</span>
            <span style={{ ...typo("body"), color: "rgba(255,255,255,0.6)" }}>{value}px</span>
          </div>
        ))}
      </div>

      {/* Summary table */}
      <div style={{ marginTop: 40, padding: 20, borderRadius: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <p style={{ ...typo("label"), color: "rgba(139,92,246,0.5)", marginBottom: 16 }}>Сводная таблица</p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ color: "rgba(255,255,255,0.3)", textAlign: "left" }}>
              <th style={{ padding: "6px 0", fontWeight: 600 }}>Токен</th>
              <th style={{ padding: "6px 0", fontWeight: 600 }}>px</th>
              <th style={{ padding: "6px 0", fontWeight: 600 }}>wt</th>
              <th style={{ padding: "6px 0", fontWeight: 600 }}>lh</th>
              <th style={{ padding: "6px 0", fontWeight: 600 }}>Шрифт</th>
              <th style={{ padding: "6px 0", fontWeight: 600 }}>CAPS</th>
            </tr>
          </thead>
          <tbody style={{ color: "rgba(255,255,255,0.7)" }}>
            {TOKENS.map(t => (
              <tr key={t.key} style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <td style={{ padding: "8px 0", color: "#a78bfa", fontWeight: 600 }}>{t.label}</td>
                <td style={{ padding: "8px 0" }}>{t.size}</td>
                <td style={{ padding: "8px 0" }}>{t.weight}</td>
                <td style={{ padding: "8px 0" }}>{t.lh}</td>
                <td style={{ padding: "8px 0", color: "rgba(255,255,255,0.4)" }}>{t.font}</td>
                <td style={{ padding: "8px 0" }}>{"caps" in t && t.caps ? "✓" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ token, desc, spec, children }: { token: string; desc: string; spec: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <span style={{ ...typo("body"), fontWeight: 700, color: "#a78bfa" }}>{token}</span>
        <span style={{ ...typo("caption"), color: "rgba(255,255,255,0.3)" }}>{spec}</span>
      </div>
      <p style={{ ...typo("caption"), color: "rgba(255,255,255,0.3)", margin: "0 0 16px 0" }}>{desc}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function Chip({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span style={{ ...typo("caption"), padding: "8px 16px", borderRadius: 10, background: active ? "rgba(255,255,255,0.1)" : "transparent", color: active ? "#fff" : "rgba(255,255,255,0.4)" }}>
      {children}
    </span>
  );
}

function Pill({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span style={{ ...typo("caption"), padding: "4px 12px", borderRadius: 20, background: active ? "rgba(139,92,246,0.1)" : "transparent", color: active ? "#a78bfa" : "rgba(255,255,255,0.4)", border: `1px solid ${active ? "#a78bfa" : "rgba(255,255,255,0.1)"}` }}>
      {children}
    </span>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ ...typo("microBold"), padding: "2px 8px", borderRadius: 10, background: `${color}15`, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
      {children}
    </span>
  );
}
