import CoverageMapSection from "../map/CoverageMapSection";
import { SiteHero, SiteShell } from "../components/SiteHero";

/**
 * Página principal: consulta "Aonde nós estamos".
 * Cabeçalho Super Connect + mapa interativo, sem proposta comercial.
 */
export default function UnitsPage() {
  return (
    <SiteShell>
      <SiteHero
        badge="Mapa de unidades · AL · SE · PE"
        pill="Super Connect"
        srTitle="Super Connect — Aonde nós estamos"
      >
        Encontre nossas unidades e explore nossa presença em Alagoas, Sergipe e
                Pernambuco — com atendimento e equipes perto de você.
      </SiteHero>

      <main
        className="sc-wrap"
        style={{ position: "relative", zIndex: 1, maxWidth: 1180, margin: "0 auto", padding: "0 28px 90px" }}
      >
        <CoverageMapSection first />
      </main>
    </SiteShell>
  );
}
