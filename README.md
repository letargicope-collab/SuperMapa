# Super Connect — Onde nós estamos

A página principal é uma consulta de unidades: cabeçalho Super Connect e mapa
interativo. Não contém proposta comercial, consultor ou referências à Carajás.

## Executar

- `npm run dev` — desenvolvimento.
- `npm run build` — gera `dist/index.html` (HTML único) e os arquivos públicos.
- `npm run preview` — prévia da versão compilada.

## Arquivos principais

- `src/App.tsx` — entry point; renderiza apenas a página do mapa.
- `src/pages/UnitsPage.tsx` — cabeçalho e página principal.
- `src/map/` — componentes, dados das 32 unidades, rotas, GPS, bússola,
  enquadramento, som e aviso de chegada.
- `src/components/SiteHero.tsx` — cabeçalho com a identidade original.
- `index.html` — metadados e estilos-base da página principal.

## Proposta anterior (arquivo separado)

A proposta comercial anterior foi preservada em **`public/proposta/index.html`**,
servida em **`/proposta/`**. É um arquivo estático completo, com seu próprio
HTML/CSS/JS, e não é carregado pela página principal. Não há link para ele no
mapa. Pode ser mantido para revisão ou removido da pasta `public/proposta/` caso
não seja mais necessário.

## Mapa

Os dados das 32 unidades estão em `src/map/data/places.ts`. Os endereços seguem
a lista oficial da Super Connect; as coordenadas foram conferidas no
OpenStreetMap/Nominatim (com geocodificação reversa do município) e os pontos
aproximados estão comentados no próprio arquivo. As imagens e logos
continuam nos links originais do Imgur. O mapa usa OpenFreeMap/OpenStreetMap e
OSRM para os trajetos viários. A configuração de um servidor OSRM autorizado
para produção e as regras de GPS/rotas/chegada estão em `MAP_ROUTING.md`.

A localização do visitante exige HTTPS (ou localhost em desenvolvimento) e
permissão do navegador. A localização por IP é aproximada e não é usada para
confirmar a chegada ao escritório.


## Costa e bordas do mapa

O contorno do Brasil vem de uma geometria simplificada (Natural Earth): perto
do litoral ela erra a costa em alguns quilômetros — em Maceió, cerca de 2,4 km.
Isso fazia a máscara verde cobrir parte da cidade e o contorno de lima aparecer
"serpenteando" no zoom.

Solução adotada (sem embutir vários MB de geometria):

- **Visão do país (até o zoom ~6,4):** a silhueta simplificada, o preenchimento
  por estado e o contorno continuam sendo usados e são os responsáveis pelo
  visual verde do Brasil.
- **Zoom de cidade (a partir de ~6,4):** essas três camadas deixam de ser
  desenhadas (`maxzoom`). A fronteira terra/água passa a vir dos próprios tiles
  do OpenStreetMap/OpenFreeMap, com precisão de rua; a água recebe a cor do
  fundo (`sc-detailed-water` e `sc-detailed-waterway`). O resultado mantém a
  identidade visual e corrige a costa em qualquer cidade litorânea.
- A transição é feita por opacidade entre os zooms 5,2 e 6,4, sem "pulo" visual.
- O verde-claro de AL, SE e PE continua visível em qualquer zoom, usando os
  limites estaduais detalhados de `src/map/data/highlight-states.ts`
  (geoBoundaries, ADM1 2023, CC BY 2.5 — https://www.geoboundaries.org). Como
  essa geometria avança sobre o mar, a camada de água dos tiles recorta a costa
  real por cima. Os demais estados ficam com a geometria simplificada (cor igual
  à do fundo, só importa na visão do país).

A API do IBGE não respondeu no ambiente de desenvolvimento; a fonte usada foi
a geoBoundaries (gbOpen), com atribuição registrada no próprio arquivo de dados.

A versão arquivada em `public/proposta/index.html` (rota `/proposta/`) é um
snapshot anterior a esta correção e mantém o mapa antigo.


## Fotos dos escritórios

As fotos ficam em `public/fotos/{NomeDaCidade_Rua}.png` (ex.: `São_Bento_liberato.png`,
`Olho_centro.png`; índice em `public/fotos/README.md`) e são **embutidas no HTML**
em `src/map/data/office-photos.ts` (JPEG otimizado 800×450, ~57 KB cada). Assim
aparecem em qualquer contexto — GitHub Pages, preview do editor ou arquivo aberto
localmente — sem depender do caminho `fotos/...`.

Para adicionar ou trocar uma foto: coloque/substitua o PNG em `public/fotos/`,
rode `npm run fotos` (requer ImageMagick) e faça o build. Se a chave de uma
unidade não existir em `office-photos.ts`, o cartão usa a foto institucional.


## Endereços e referências

Cada unidade em `src/map/data/places.ts` tem `address` (rua, número — bairro,
cidade, UF), `reference` (ponto de referência informado pela empresa) e
`coordinates` (lng, lat). A lista mais recente da Super Connect foi aplicada em
34 unidades (23 em Alagoas, 8 em Sergipe, 3 em Pernambuco, 28 cidades); a única
unidade nova em relação à lista anterior é **Itaporanga d'Ajuda (SE)**.

O endereço completo e a referência aparecem somente quando o visitante abre
**Mais detalhes**, no cartão da unidade ou no painel da rota. Nesse mesmo painel
há uma orientação curta de como usar o mapa, também escondida por padrão.


## Nomes das unidades

Todas as unidades seguem o padrão **Cidade — Bairro** (ex.: `Maceió — Cidade Universitária`,
`Arapiraca — Brasília`), para que o município apareça sempre no nome e nenhuma
unidade seja confundida com outra cidade. O campo `unitType` traz o tipo (Sede,
Filial, ESC etc.).

Na lista, dentro de cada estado, a **Sede/Matriz** aparece sempre em primeiro
(com a etiqueta SEDE/MATRIZ) e as demais em ordem alfabética pelo nome.
