import UnitsPage from "./pages/UnitsPage";

/**
 * SUPER CONNECT — ONDE NÓS ESTAMOS
 *
 * A página principal agora é exclusivamente o mapa interativo das unidades.
 * Não há mais proposta comercial, clientes, consultor ou conteúdo da Carajás
 * no entry point/na página principal.
 *
 * A proposta anterior foi preservada como arquivo estático em
 * `public/proposta/index.html` (disponível em `/proposta/`), sem link nesta
 * página, apenas para consulta/revisão. Ela não faz parte do bundle principal.
 *
 * Componentes e funcionalidades do mapa:
 *  - src/map/ (mapa, dados das unidades, rotas, GPS, bússola e chegada);
 *  - src/components/SiteHero.tsx (cabeçalho, compartilhado com o arquivo da
            proposta preservada);
 *  - src/pages/UnitsPage.tsx (página principal).
 */
export default function App() {
  return <UnitsPage />;
}
