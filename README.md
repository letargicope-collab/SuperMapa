# Super Connect — Onde nós estamos

A página principal é um mapa interativo de consulta de unidades. Abre diretamente
no mapa, sem hero ou informações de apresentação acima dele; no celular o menu
de unidades aparece logo abaixo do mapa. Os totais de unidades, cidades e
estados ficam depois do cartão mapa/menu.

## Executar

- `npm run dev` — desenvolvimento.
- `npm run build` — gera `dist/index.html` (HTML único) e os arquivos públicos.
- `npm run preview` — prévia da versão compilada.

## Arquivos principais

- `src/App.tsx` — entry point; renderiza apenas a página do mapa.
- `src/pages/UnitsPage.tsx` — página principal em formato de mapa/app.
- `src/map/` — componentes, dados das 35 unidades, rotas, GPS, bússola,
  enquadramento, som e aviso de chegada.
- `src/components/SiteShell.tsx` — fundo texturizado e identidade visual.
- `index.html` — metadados e estilos-base da página principal.

## Mapa

Os dados das 35 unidades estão em `src/map/data/places.ts`. Os endereços seguem
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
35 unidades (24 em Alagoas, 8 em Sergipe, 3 em Pernambuco, 28 cidades). Os menus
usam o rótulo **CIDADE — BAIRRO** (ex.: `Arapiraca — Baixa Grande`), com a
Sede/Matriz no topo e as demais unidades em ordem alfabética. A unidade
**Arapiraca — Primavera** foi incluída com a foto da sede como placeholder.

O endereço completo e a referência aparecem somente quando o visitante abre
**Mais detalhes**, no cartão da unidade ou no painel da rota. Nesse mesmo painel
há uma orientação curta de como usar o mapa, também escondida por padrão.


## Rótulos dos menus

`src/map/lib/placeLabel.ts` centraliza `placeLabel` (cidade — bairro) e
`comparePlaces`. O campo opcional `district` de cada unidade em
`src/map/data/places.ts` define o bairro exibido; se ausente, ele é derivado do
endereço. A sede/matriz continua com sua identificação própria e sempre vem
primeiro. O mesmo rótulo é usado na lista, no seletor de destino da rota e no
aviso de chegada.
