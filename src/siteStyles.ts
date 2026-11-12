import type { CSSProperties } from "react";

/* ------------------------------------------------------------------ */
/*  Estilos compartilhados da página (tipografia do site original)     */
/* ------------------------------------------------------------------ */
export const sectionTitle: CSSProperties = {
  margin: "0 0 14px",
  textAlign: "center",
  font: "700 clamp(32px,4.6vw,52px)/1.04 'Space Grotesk',sans-serif",
  color: "#fff",
  letterSpacing: "-.02em",
  textShadow: "0 3px 18px rgba(0,40,20,.45)",
  textWrap: "balance",
};

export const sectionDivider: CSSProperties = {
  width: 78,
  height: 5,
  borderRadius: 3,
  background: "#dff900",
  margin: "0 auto 18px",
  boxShadow: "0 0 18px rgba(223,249,0,.65)",
};

export const sectionLead: CSSProperties = {
  margin: "0 auto 36px",
  textAlign: "center",
  maxWidth: 700,
  font: "600 16px/1.6 'Manrope',sans-serif",
  color: "#eafce0",
  textShadow: "0 2px 12px rgba(0,40,20,.4)",
  textWrap: "pretty",
};

export const cardLabel: CSSProperties = {
  font: "700 12px/1 'Space Grotesk',sans-serif",
  letterSpacing: ".14em",
  textTransform: "uppercase",
  color: "#dff900",
};

export const cardText: CSSProperties = {
  margin: 0,
  font: "500 14.5px/1.6 'Manrope',sans-serif",
  color: "#cfe6d8",
};

export const iconBox: CSSProperties = {
  flex: "none",
  width: 46,
  height: 46,
  borderRadius: 13,
  display: "grid",
  placeItems: "center",
  background: "rgba(223,249,0,.14)",
  boxShadow: "inset 0 0 0 1px rgba(223,249,0,.35)",
};
