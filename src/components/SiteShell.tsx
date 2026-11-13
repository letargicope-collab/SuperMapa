import type { ReactNode } from "react";

/** Fundo texturizado verde compartilhado pelas páginas Super Connect. */
export default function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="sc-root"
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: "100vh",
        background: "linear-gradient(rgba(35,150,15,.12),rgba(6,45,26,.28)),url('https://i.imgur.com/50StUE0.jpeg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      {children}
    </div>
  );
}