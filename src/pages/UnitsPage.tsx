import CoverageMapSection from "../map/CoverageMapSection";
import SiteShell from "../components/SiteShell";

/** Consulta em formato de app: mapa primeiro, menu de unidades em seguida. */
export default function UnitsPage() {
  return (
    <SiteShell>
      <main
        className="sc-wrap sc-units-app"
        style={{ position: "relative", zIndex: 1, maxWidth: 1180, margin: "0 auto", padding: "0 28px 36px" }}
      >
        <h1 className="sc-map-sr-only">Aonde nós estamos — unidades Super Connect</h1>
        <CoverageMapSection />
      </main>
    </SiteShell>
  );
}