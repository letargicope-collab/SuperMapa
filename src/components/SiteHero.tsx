import type { ReactNode } from "react";

export const SITE_LOGO = "https://i.imgur.com/hAG9YIi.png";
export const SITE_BG = "https://i.imgur.com/50StUE0.jpeg";
const ROBOT = "https://i.imgur.com/WQMLI6P.png";

/** Fundo texturizado verde de todas as páginas. */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="sc-root"
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "100vh",
        background: `linear-gradient(rgba(35,150,15,.12),rgba(6,45,26,.28)),url('${SITE_BG}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {children}
    </div>
  );
}

type SiteHeroProps = {
  /** Selo escuro acima da logo. */
  badge: string;
  /** Pílula amarela abaixo da logo. */
  pill: string;
  /** Título para leitores de tela e buscadores. */
  srTitle: string;
  /** Texto de apoio. */
  children: ReactNode;
};

/** Cabeçalho: selo, logo Super Connect, robô voando, pílula e texto. */
export function SiteHero({ badge, pill, srTitle, children }: SiteHeroProps) {
  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <img
        src={ROBOT}
        alt=""
        aria-hidden="true"
        className="sc-print-hide sc-fly"
        style={{
          position: "absolute",
          top: 56,
          left: 0,
          width: "clamp(280px,32vw,480px)",
          height: "auto",
          zIndex: 100,
          pointerEvents: "none",
          filter:
            "drop-shadow(-28px 0 12px rgba(0,45,18,.55)) drop-shadow(-56px 0 26px rgba(0,45,18,.34)) drop-shadow(-88px 0 38px rgba(0,45,18,.16))",
          animation: "scFly 13s linear infinite",
        }}
        decoding="async"
        loading="lazy"
      />

      <div
        className="sc-wrap sc-hero"
        style={{
          position: "relative",
          zIndex: 3,
          maxWidth: 1180,
          margin: "0 auto",
          padding: "64px 28px 84px",
          textAlign: "center",
        }}
      >
        <header style={{ animation: "scFadeUp .8s cubic-bezier(.16,1,.3,1) both" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "7px 16px",
              borderRadius: 999,
              background: "rgba(4,30,16,.82)",
              boxShadow: "inset 0 0 0 1px rgba(223,249,0,.35)",
              font: "600 12px/1 'Space Grotesk',sans-serif",
              letterSpacing: ".16em",
              textTransform: "uppercase",
              color: "#dff900",
            }}
          >
            {badge}
          </span>

          <div style={{ margin: "26px auto 0", maxWidth: 520 }}>
            <img
              src={SITE_LOGO}
              alt="Super Connect"
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                filter: "drop-shadow(0 14px 30px rgba(0,40,15,.35))",
              }}
              decoding="async"
              loading="eager"
              fetchPriority="high"
            />
          </div>
          <h1 style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
            {srTitle}
          </h1>

          <div
            style={{
              margin: "22px auto 0",
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 22px",
              borderRadius: 999,
              background: "#dff900",
              boxShadow: "0 12px 26px -8px rgba(223,249,0,.6)",
              font: "700 13px/1.2 'Space Grotesk',sans-serif",
              letterSpacing: ".12em",
              textTransform: "uppercase",
              color: "#06301c",
            }}
          >
            {pill}
          </div>

          <p
            style={{
              margin: "22px auto 0",
              maxWidth: 740,
              font: "500 19px/1.55 'Manrope',sans-serif",
              color: "#fff",
              textShadow: "0 2px 14px rgba(0,40,20,.45)",
              textWrap: "pretty",
            }}
          >
            {children}
          </p>
        </header>
      </div>
    </div>
  );
}
