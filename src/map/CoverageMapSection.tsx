import { useCallback, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import AtlasMap, { type AtlasMapHandle } from "./components/AtlasMap";
import OfficeDirectory from "./components/OfficeDirectory";
import { PLACES, type Place } from "./data/places";
import { sectionDivider, sectionLead, sectionTitle } from "../siteStyles";
import "./atlas.css";

const chipRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 12,
  justifyContent: "center",
  margin: "0 auto 26px",
};

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        flex: "0 1 auto",
        minWidth: 148,
        padding: "14px 20px",
        borderRadius: 16,
        background: "rgba(4,30,16,.62)",
        boxShadow: "inset 0 0 0 1px rgba(223,249,0,.24)",
        textAlign: "center",
      }}
    >
      <div style={{ font: "700 26px/1 'Space Grotesk',sans-serif", color: "#dff900" }}>{value}</div>
      <div style={{ marginTop: 5, font: "500 12.5px/1.3 'Manrope',sans-serif", color: "#a9c9b3" }}>{label}</div>
    </div>
  );
}

/**
 * AONDE NÓS ESTAMOS
 * Mapa interativo das unidades (script do repositório MapTest) integrado à
 * identidade visual da página: cartão fechado, menu lateral de cidades à
 * esquerda e mapa à direita.
 */
export default function CoverageMapSection({ first = false }: { first?: boolean } = {}) {
  const mapRef = useRef<AtlasMapHandle | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [routeId, setRouteId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const stats = useMemo(() => {
    const cities = new Set(PLACES.map((place) => place.city)).size;
    const states = new Set(PLACES.map((place) => place.uf)).size;
    return { units: PLACES.length, cities, states };
  }, []);

  const handleOpenChange = useCallback((place: Place | null) => {
    setActiveId(place?.id ?? null);
  }, []);

  /**
   * No celular a lista fica abaixo do mapa: ao escolher uma unidade por ela,
   * a página rola até o mapa (só quando ele está quase todo fora da tela).
   */
  const revealMap = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const viewport = window.innerHeight;
    const visible = Math.min(rect.bottom, viewport) - Math.max(rect.top, 0);
    if (visible >= Math.min(rect.height, viewport) * 0.6) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    panel.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: rect.height > viewport ? "start" : "nearest",
    });
  }, []);

  const handleSelect = useCallback((place: Place) => {
    mapRef.current?.focus(place);
    revealMap();
  }, [revealMap]);

  const handleRoute = useCallback((place: Place) => {
    mapRef.current?.routeTo(place);
    revealMap();
  }, [revealMap]);

  return (
    <section
      className={first ? undefined : "sc-sec"}
      style={{ marginTop: first ? 0 : 112, animation: "scFadeUp .8s cubic-bezier(.16,1,.3,1) both .08s" }}
    >
      <h2 style={sectionTitle}>Aonde nós estamos</h2>
      <div style={sectionDivider} />
      <p style={{ ...sectionLead, maxWidth: 680, marginBottom: 26 }}>
        Selecione uma cidade no menu ou toque em um marcador para ver a unidade. Você também pode
                traçar uma rota até o escritório que preferir.
      </p>

      <div style={chipRow}>
        <StatChip value={String(stats.units)} label="Unidades" />
        <StatChip value={String(stats.cities)} label="Cidades atendidas" />
        <StatChip value={String(stats.states)} label="Estados · AL SE PE" />
      </div>

      <div className="sc-atlas">
        <div className="sc-atlas-card">
          <div className="sc-atlas-shell">
            {/* menu lateral: acompanha a altura do mapa e rola por dentro */}
            <div className="sc-atlas-side">
              <OfficeDirectory
                places={PLACES}
                activeId={activeId}
                routeId={routeId}
                onSelect={handleSelect}
                onRoute={handleRoute}
              />
            </div>

            {/* mapa em proporção 4:5, com o Brasil centralizado na visão afastada */}
            <div className="map-panel" ref={panelRef}>
              <AtlasMap ref={mapRef} onOpenChange={handleOpenChange} onRouteChange={setRouteId} />

              {/* legenda da cartografia: estados com atuação destacada */}
              <div
                style={{
                  position: "absolute",
                  right: 14,
                  bottom: 12,
                  zIndex: 4,
                  pointerEvents: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 14px",
                  borderRadius: 999,
                  background: "rgba(4,35,26,.78)",
                  boxShadow: "inset 0 0 0 1px rgba(223,249,0,.4)",
                  backdropFilter: "blur(6px)",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: "#1a7d33",
                    boxShadow: "inset 0 0 0 1px rgba(223,249,0,.55)",
                  }}
                />
                <span
                  style={{
                    font: "700 11px/1 'Space Grotesk',sans-serif",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    color: "#eafce0",
                  }}
                >
                  AL · SE · PE
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
