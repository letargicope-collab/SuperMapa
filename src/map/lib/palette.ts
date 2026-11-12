import type { Map as MapLibreMap } from 'maplibre-gl'
import { BRAZIL_RINGS } from '../data/brazil-boundary'
import { BRAZIL_STATES, type StatePolygon } from '../data/brazil-states'
import { HIGHLIGHT_STATES } from '../data/highlight-states'
import { PLACES } from '../data/places'

/**
 * Base cartográfica real (OpenMapTiles / OpenStreetMap) servida pelo OpenFreeMap.
 * Os polígonos dos estados e a máscara do Brasil vêm de dados geográficos reais.
 */
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

/** Cor dos estados destacados: Alagoas, Sergipe e Pernambuco. */
export const HIGHLIGHT_GREEN = '#1a7d33'
/** Cor dos demais estados brasileiros. */
export const STATE_GREEN = '#0b3a24'
/**
 * Papel do mapa na identidade Super Connect: verde profundo usado pela máscara
 * fora do Brasil, pelas ruas/avenidas e pelas divisas estaduais.
 */
export const MAP_PAPER = '#04231a'

const HIGHLIGHTED_UFS = ['AL', 'SE', 'PE']
const WHITE = '#FFFFFF'

/** Um município aparece quando o estado observado ocupa esta fração da tela. */
const STATE_SCREEN_SHARE = 0.5
/** Municípios sem escritório só aparecem a partir deste zoom (bem próximo). */
const CLOSE_ZOOM = 10
/** Tamanho do mundo em pixels por unidade de zoom (tiles de 512 px, padrão do MapLibre). */
const WORLD_PX = 512
const MAX_ZOOM = 24

const STATE_FILL_SOURCE = 'brazil-states'
const STATE_FILL_LAYER = 'brazil-states-fill'
/**
 * Verde-claro de AL, SE e PE. Usa os limites detalhados de
 * `data/highlight-states.ts` e fica visível em qualquer zoom; os demais estados
 * continuam com a geometria simplificada (cor igual ao fundo, só importa na
 * visão do país).
 */
const HIGHLIGHT_FILL_LAYER = 'sc-highlight-states-fill'

/** Filtro GeoJSON dos estados destacados / dos demais. */
const HIGHLIGHT_FILTER = ['in', ['get', 'uf'], ['literal', HIGHLIGHTED_UFS]] as never
const OTHER_STATES_FILTER = ['!', HIGHLIGHT_FILTER] as never
const MASK_LAYER = 'brazil-outside-mask'
/** Água detalhada dos próprios tiles, usada no lugar da máscara em zoom alto. */
const DETAILED_WATER_LAYER = 'sc-detailed-water'
const DETAILED_WATERWAY_LAYER = 'sc-detailed-waterway'

/**
 * Transição entre a silhueta simplificada (visão do país) e a costa detalhada
 * dos tiles (visão de cidade): abaixo de 5,5 vale a máscara; a partir de 7,2
 * só os tiles desenham a fronteira terra/água. Assim a costa de Maceió — e de
 * qualquer cidade litorânea — fica exata, sem a borda serrilhada.
 */
const COAST_FADE_START = 5.2
const COAST_FADE_END = 6.4

/** Divisas estaduais (admin_level 4) e nomes dos estados. */
const STATE_BORDER_LAYER = 'boundary_3'
const STATE_LABEL_LAYER = 'label_state'

/** Ruas e avenidas principais, com espessura crescente conforme o zoom. */
const ROAD_WIDTHS: Record<string, unknown[]> = {
  highway_motorway_inner: ['interpolate', ['linear'], ['zoom'], 6, 0.8, 10, 2, 14, 4.5, 17, 9],
  highway_motorway_bridge_inner: ['interpolate', ['linear'], ['zoom'], 6, 0.8, 10, 2, 14, 4.5, 17, 9],
  highway_major_inner: ['interpolate', ['linear'], ['zoom'], 6, 0.6, 9, 1.1, 12, 2.2, 14, 3.2, 17, 7],
  highway_minor: ['interpolate', ['linear'], ['zoom'], 9, 0.5, 13, 1.6, 15, 2.8, 17, 5],
}

/**
 * Faixa de zoom das ruas. No Positron, as rodovias estaduais e federais
 * (primary/secondary/trunk) só aparecem a partir do zoom 11 — abaixo disso
 * existe uma camada "subtle" que estava oculta. Sem este ajuste, o
 * enquadramento de uma rota no celular (zoom ~10) mostrava só rótulos.
 */
const ROAD_ZOOM_RANGES: Record<string, [number, number]> = {
  highway_major_inner: [6, 24],
  highway_minor: [8, 24],
}

/** Nomes de ruas e avenidas (o estilo base já controla quando cada um aparece). */
const ROAD_NAME_LAYERS = ['highway-name-major', 'highway-name-minor']

/** Municípios: capital, cidades, distritos e vilarejos. */
const CITY_LAYERS = ['label_city_capital', 'label_city', 'label_town', 'label_village']
/** Cópias dos municípios que possuem escritório da Super Connect (aparecem primeiro). */
const CITY_OFFICE_LAYERS = CITY_LAYERS.map((id) => `${id}-office`)

/** Camadas de cidade originais guardam aqui o filtro do estilo base, antes das alterações. */
const baseCityFilters = new Map<string, unknown>()

/** Território brasileiro como MultiPolygon: limita rótulos ao que está dentro do país. */
const BRAZIL_GEOMETRY = {
  type: 'MultiPolygon' as const,
  coordinates: BRAZIL_RINGS.map((ring) => [ring]),
}

/** Nome do estado em português, com retorno ao nome original do OSM. */
const STATE_NAME_FIELD = ['coalesce', ['get', 'name:pt'], ['get', 'name']]

/** Nomes das cidades com escritório, com as duas grafias possíveis do apóstrofo. */
const OFFICE_CITY_NAMES = (() => {
  const names = new Set<string>()
  for (const place of PLACES) {
    names.add(place.city)
    names.add(place.city.replace(/'/g, '’'))
    names.add(place.city.replace(/’/g, "'"))
  }
  return [...names]
})()

const CITY_NAME_FIELD = ['coalesce', ['get', 'name:pt'], ['get', 'name']]

/** Rótulo do município em foco: garante o nome da cidade mesmo em zoom de rua. */
const FOCUS_CITY_SOURCE = 'focus-city'
const FOCUS_CITY_LAYER = 'focus-city-label'

type FocusCity = { city: string; coordinates: [number, number] }

function focusCityData(place: FocusCity | null) {
  return {
    type: 'FeatureCollection' as const,
    features: place
      ? [
          {
            type: 'Feature' as const,
            properties: { name: place.city },
            geometry: { type: 'Point' as const, coordinates: place.coordinates },
          },
        ]
      : [],
  }
}

/**
 * Cria o rótulo do município em foco. Fica acima dos demais rótulos, então vence
 * a colisão e substitui o nome vindo dos tiles, sem duplicar.
 */
function ensureFocusCityLayer(map: MapLibreMap): void {
  if (!map.getSource(FOCUS_CITY_SOURCE)) {
    map.addSource(FOCUS_CITY_SOURCE, { type: 'geojson', data: focusCityData(null) })
  }
  if (map.getLayer(FOCUS_CITY_LAYER)) return

  map.addLayer({
    id: FOCUS_CITY_LAYER,
    type: 'symbol',
    source: FOCUS_CITY_SOURCE,
    minzoom: 11,
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 11, 12, 16, 16],
      'text-transform': 'uppercase',
      'text-letter-spacing': 0.16,
      'text-anchor': 'top',
      'text-offset': [0, 1.35],
      'text-max-width': 12,
    },
    paint: { 'text-color': WHITE, 'text-halo-width': 0 },
  })
}

/** Mostra o nome do município do escritório selecionado (ou limpa o rótulo). */
export function setFocusCity(map: MapLibreMap, place: FocusCity | null): void {
  const source = map.getSource(FOCUS_CITY_SOURCE) as import('maplibre-gl').GeoJSONSource | undefined
  source?.setData(focusCityData(place))
}
const OFFICE_CITY_MATCH = ['in', CITY_NAME_FIELD, ['literal', OFFICE_CITY_NAMES]]

/** Cor do painel do mapa: as ruas, avenidas e divisas usam esta mesma cor. */
export function pageColor(): string {
  return MAP_PAPER
}

/**
 * Aplica uma nova cor de fundo da página ao mapa: ruas, avenidas, divisas estaduais
 * e a máscara fora do Brasil usam sempre a mesma cor do fundo.
 */
export function updatePageColor(map: MapLibreMap, color: string): void {
  if (map.getLayer(STATE_BORDER_LAYER)) {
    map.setPaintProperty(STATE_BORDER_LAYER, 'line-color', color)
  }
  for (const id of Object.keys(ROAD_WIDTHS)) {
    if (map.getLayer(id)) map.setPaintProperty(id, 'line-color', color)
  }
  if (map.getLayer(MASK_LAYER)) map.setPaintProperty(MASK_LAYER, 'fill-color', color)
}


/* ------------------------------------------------ geometria dos estados --- */

interface Box {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
}

const STATE_BOXES = new Map<string, Box>()
for (const state of BRAZIL_STATES) {
  const box: Box = { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity }
  for (const polygon of state.coordinates) {
    for (const [lng, lat] of polygon[0]) {
      box.minLng = Math.min(box.minLng, lng)
      box.maxLng = Math.max(box.maxLng, lng)
      box.minLat = Math.min(box.minLat, lat)
      box.maxLat = Math.max(box.maxLat, lat)
    }
  }
  STATE_BOXES.set(state.uf, box)
}

/** Ray casting: ponto dentro de um anel fechado [lng, lat][]. */
function inRing(ring: number[][], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function containsPoint(state: StatePolygon, x: number, y: number): boolean {
  return state.coordinates.some(
    (polygon) => inRing(polygon[0], x, y) && !polygon.slice(1).some((hole) => inRing(hole, x, y)),
  )
}

/** Latitude em unidades de projeção Web Mercator (radianos). */
function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
}

/**
 * Zoom em que o estado sob o centro da tela ocupa STATE_SCREEN_SHARE da tela
 * (na dimensão em que ele mais ocupa). Sem estado sob o centro, retorna o zoom máximo.
 */
function stateViewZoom(map: MapLibreMap): number {
  const center = map.getCenter()
  const state = BRAZIL_STATES.find((candidate) => containsPoint(candidate, center.lng, center.lat))
  const box = state ? STATE_BOXES.get(state.uf) : undefined
  if (!box) return MAX_ZOOM

  const container = map.getContainer()
  const width = container.clientWidth
  const height = container.clientHeight
  if (!width || !height) return MAX_ZOOM

  const zoomForWidth = Math.log2(
    (STATE_SCREEN_SHARE * width * 360) / (WORLD_PX * (box.maxLng - box.minLng)),
  )
  const spanY = mercatorY(box.maxLat) - mercatorY(box.minLat)
  const zoomForHeight = Math.log2((STATE_SCREEN_SHARE * height * 2 * Math.PI) / (WORLD_PX * spanY))

  return Math.min(MAX_ZOOM, Math.max(0, Math.min(zoomForWidth, zoomForHeight)))
}

/* ------------------------------------------------------- municípios --- */

/** Cria as cópias das camadas de cidade que contêm só os municípios com escritório. */
function configureCityLayers(map: MapLibreMap): void {
  const within = ['within', BRAZIL_GEOMETRY]

  for (const id of CITY_LAYERS) {
    if (!map.getLayer(id)) continue
    const base = baseCityFilters.get(id)
    const scope = base ? ['all', base, within] : within

    // Camada original: apenas municípios SEM escritório.
    map.setFilter(id, ['all', scope, ['!', OFFICE_CITY_MATCH]] as never)

    const officeId = `${id}-office`
    if (!map.getLayer(officeId)) {
      const original = map.getStyle().layers.find((layer) => layer.id === id)
      if (!original) continue
      map.addLayer(
        { ...original, id: officeId, filter: ['all', scope, OFFICE_CITY_MATCH] } as never,
        id,
      )
    }
  }
}

/**
 * Define a partir de qual zoom cada grupo de municípios aparece:
 *  - cidades com escritório: quando o estado observado ocupa 50% da tela;
 *  - demais cidades: também exigem zoom de proximidade (CLOSE_ZOOM).
 */
const lastCityRange = new WeakMap<MapLibreMap, string>()

export function updateCityVisibility(map: MapLibreMap): void {
  if (!map.getLayer(CITY_LAYERS[0])) return

  const stateZoom = stateViewZoom(map)
  const otherZoom = Math.max(stateZoom, CLOSE_ZOOM)
  const key = `${stateZoom.toFixed(3)}|${otherZoom.toFixed(3)}`
  if (lastCityRange.get(map) === key) return
  lastCityRange.set(map, key)

  for (const id of CITY_LAYERS) {
    if (map.getLayer(id)) map.setLayerZoomRange(id, otherZoom, MAX_ZOOM)
  }
  for (const id of CITY_OFFICE_LAYERS) {
    if (map.getLayer(id)) map.setLayerZoomRange(id, stateZoom, MAX_ZOOM)
  }
}

/* -------------------------------------------------------- estilo geral --- */

/**
 * Transforma o estilo carregado em um mapa minimalista:
 *  - estados pintados individualmente (AL, SE e PE em um verde, os demais em outro);
 *  - ruas, avenidas e divisas estaduais na cor de fundo da página, criando vazios
 *    no preenchimento verde;
 *  - nome de cada estado na visão afastada;
 *  - municípios com escritório primeiro, demais municípios só bem próximos;
 *  - nomes de ruas e cidades em branco; o restante do estilo fica oculto.
 */
export function applyBrazilStatesStyle(map: MapLibreMap): void {
  // Estilo de contingência (raster): não possui as camadas vetoriais abaixo.
  if (!map.getLayer(STATE_BORDER_LAYER) || !map.getLayer(STATE_LABEL_LAYER)) return

  const background = pageColor()

  // Guarda o filtro original dos municípios antes de qualquer alteração.
  for (const id of CITY_LAYERS) {
    if (!baseCityFilters.has(id) && map.getLayer(id)) baseCityFilters.set(id, map.getFilter(id))
  }

  // ---- Visibilidade: somente as camadas usadas permanecem visíveis.
  const visible = new Set<string>([
    'background',
    STATE_FILL_LAYER,
    HIGHLIGHT_FILL_LAYER,
    MASK_LAYER,
    STATE_BORDER_LAYER,
    STATE_LABEL_LAYER,
    ...Object.keys(ROAD_WIDTHS),
    ...ROAD_NAME_LAYERS,
    ...CITY_LAYERS,
    ...CITY_OFFICE_LAYERS,
    FOCUS_CITY_LAYER,
  ])
  for (const layer of map.getStyle().layers) {
    if (layer.id === 'background') {
      map.setPaintProperty(layer.id, 'background-color', STATE_GREEN)
      continue
    }
    map.setLayoutProperty(layer.id, 'visibility', visible.has(layer.id) ? 'visible' : 'none')
  }

  // ---- Polígonos dos estados, logo acima do fundo.
  if (map.getLayer(STATE_FILL_LAYER)) {
    map.setPaintProperty(STATE_FILL_LAYER, 'fill-opacity', [
      'interpolate', ['linear'], ['zoom'], COAST_FADE_START, 1, COAST_FADE_END, 0,
    ] as never)
    map.setLayerZoomRange(STATE_FILL_LAYER, 0, COAST_FADE_END)
    map.setPaintProperty(STATE_FILL_LAYER, 'fill-color', STATE_GREEN)
    map.setFilter(STATE_FILL_LAYER, OTHER_STATES_FILTER)
  }
  if (map.getLayer(HIGHLIGHT_FILL_LAYER)) {
    map.setPaintProperty(HIGHLIGHT_FILL_LAYER, 'fill-color', HIGHLIGHT_GREEN)
    map.setPaintProperty(HIGHLIGHT_FILL_LAYER, 'fill-opacity', 1)
  }
  if (!map.getSource(STATE_FILL_SOURCE)) {
    map.addSource(STATE_FILL_SOURCE, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: BRAZIL_STATES.map((state) => {
          // AL, SE e PE entram com os limites detalhados, para o verde-claro
          // acompanhar a costa e as divisas em qualquer zoom.
          const detailed = HIGHLIGHT_STATES.find((item) => item.uf === state.uf)
          return {
            type: 'Feature' as const,
            properties: { uf: state.uf, name: state.name },
            geometry: {
              type: 'MultiPolygon' as const,
              coordinates: detailed ? detailed.coordinates : state.coordinates,
            },
          }
        }),
      },
    })
    const firstAboveBackground = map.getStyle().layers.find((layer) => layer.id !== 'background')
    map.addLayer(
      {
        id: STATE_FILL_LAYER,
        type: 'fill',
        source: STATE_FILL_SOURCE,
        filter: OTHER_STATES_FILTER,
        paint: {
          'fill-color': STATE_GREEN as never,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], COAST_FADE_START, 1, COAST_FADE_END, 0] as never,
        },
        // A partir daqui a costa detalhada dos tiles assume: a silhueta
        // simplificada deixa de ser desenhada (evita bordas erradas e
        // artefatos de precisão em zoom alto).
        maxzoom: COAST_FADE_END,
      },
      firstAboveBackground?.id,
    )
    // Verde-claro de AL/SE/PE com os limites detalhados: visível em todo zoom.
    map.addLayer(
      {
        id: HIGHLIGHT_FILL_LAYER,
        type: 'fill',
        source: STATE_FILL_SOURCE,
        filter: HIGHLIGHT_FILTER,
        paint: { 'fill-color': HIGHLIGHT_GREEN as never, 'fill-opacity': 1 },
      },
      firstAboveBackground?.id,
    )
  }

  // ---- Divisas estaduais: na cor de fundo da página, com 1 px fixo.
  map.setFilter(STATE_BORDER_LAYER, [
    'all',
    ['==', ['get', 'admin_level'], 4],
    ['!=', ['get', 'maritime'], 1],
  ] as never)
  map.setLayerZoomRange(STATE_BORDER_LAYER, 0, MAX_ZOOM)
  map.setPaintProperty(STATE_BORDER_LAYER, 'line-color', background)
  map.setPaintProperty(STATE_BORDER_LAYER, 'line-opacity', 1)
  map.setPaintProperty(STATE_BORDER_LAYER, 'line-dasharray', null)
  map.setPaintProperty(STATE_BORDER_LAYER, 'line-width', 1)

  // ---- Nome do estado: visível na visão afastada, desaparece ao aproximar.
  map.setLayerZoomRange(STATE_LABEL_LAYER, 0, 9)
  map.setFilter(STATE_LABEL_LAYER, [
    'all',
    ['==', ['get', 'class'], 'state'],
    ['within', BRAZIL_GEOMETRY],
  ] as never)
  map.setLayoutProperty(STATE_LABEL_LAYER, 'text-field', STATE_NAME_FIELD as never)
  map.setLayoutProperty(STATE_LABEL_LAYER, 'text-font', ['Noto Sans Bold'])
  map.setLayoutProperty(STATE_LABEL_LAYER, 'text-letter-spacing', 0.08)
  map.setLayoutProperty(STATE_LABEL_LAYER, 'text-size', [
    'interpolate',
    ['linear'],
    ['zoom'],
    2,
    8,
    3.5,
    10.5,
    6,
    13,
  ] as never)
  map.setPaintProperty(STATE_LABEL_LAYER, 'text-color', WHITE)
  map.setPaintProperty(STATE_LABEL_LAYER, 'text-halo-width', 0)
  map.setPaintProperty(STATE_LABEL_LAYER, 'text-halo-blur', 0)
  map.setPaintProperty(STATE_LABEL_LAYER, 'text-opacity', [
    'interpolate',
    ['linear'],
    ['zoom'],
    5,
    1,
    7.5,
    0,
  ] as never)

  // ---- Ruas e avenidas principais: na cor de fundo, sem contorno.
  for (const [id, width] of Object.entries(ROAD_WIDTHS)) {
    if (!map.getLayer(id)) continue
    map.setPaintProperty(id, 'line-color', background)
    map.setPaintProperty(id, 'line-width', width as never)
    map.setPaintProperty(id, 'line-opacity', 1)
    const range = ROAD_ZOOM_RANGES[id]
    if (range) map.setLayerZoomRange(id, range[0], range[1])
  }

  // ---- Nomes de ruas e avenidas: brancos, sem contorno.
  for (const id of ROAD_NAME_LAYERS) {
    map.setPaintProperty(id, 'text-color', WHITE)
    map.setPaintProperty(id, 'text-halo-width', 0)
    map.setPaintProperty(id, 'text-halo-blur', 0)
  }

  // ---- Municípios: separa os que têm escritório e aplica o estilo a ambos os grupos.
  configureCityLayers(map)
  for (const id of [...CITY_LAYERS, ...CITY_OFFICE_LAYERS]) {
    if (!map.getLayer(id)) continue
    map.setPaintProperty(id, 'text-color', WHITE)
    map.setPaintProperty(id, 'text-halo-width', 0)
    map.setPaintProperty(id, 'text-halo-blur', 0)
  }
  ensureFocusCityLayer(map)
  lastCityRange.delete(map)
  updateCityVisibility(map)
}

/**
 * Sobe os nomes de estados e municípios para cima da máscara que apaga o
 * exterior do Brasil. Como esses rótulos já são filtrados ao território
 * brasileiro, nada de fora reaparece — e nomes que ultrapassam a costa ou a
 * fronteira (Rio Grande do Norte, Rio de Janeiro, Rondônia…) deixam de ser
 * cortados na visão do país inteiro.
 */
export function raiseLabelsAboveMask(map: MapLibreMap): void {
  const labels = new Set<string>([
    STATE_LABEL_LAYER,
    ...CITY_LAYERS,
    ...CITY_OFFICE_LAYERS,
    FOCUS_CITY_LAYER,
  ])
  // Percorre na ordem atual do estilo para preservar a prioridade entre eles.
  for (const layer of map.getStyle().layers) {
    if (labels.has(layer.id) && map.getLayer(layer.id)) map.moveLayer(layer.id)
  }
}

/**
 * Em zoom alto, a silhueta simplificada do Brasil dá lugar à costa detalhada
 * do OpenStreetMap que já vem nos tiles do mapa.
 *
 * Motivo: o contorno do país é uma geometria simplificada (Natural Earth). Em
 * zoom de cidade — Maceió, por exemplo — ela corta o continente para dentro e a
 * máscara verde cobria parte do município. Em vez de embutir vários megabytes
 * de geometria, a partir do zoom 7,2 a máscara e o preenchimento dos estados
 * somem e a água dos tiles (precisa na escala da rua) assume a cor do fundo,
 * mantendo o visual verde e corrigindo as bordas em qualquer cidade litorânea.
 */
export function applyDetailedCoastline(map: MapLibreMap): void {
  const style = map.getStyle()
  const waterLayer = style.layers.find((layer) => layer.id === 'water') as
    | { source?: string; filter?: unknown }
    | undefined
  const waterwayLayer = style.layers.find((layer) => layer.id === 'waterway') as
    | { filter?: unknown }
    | undefined
  const sourceId = waterLayer?.source
  if (!sourceId || !map.getSource(sourceId)) return

  const opacity = [
    'interpolate', ['linear'], ['zoom'], COAST_FADE_START, 0, COAST_FADE_END, 1,
  ] as never

  if (!map.getLayer(DETAILED_WATER_LAYER)) {
    map.addLayer({
      id: DETAILED_WATER_LAYER,
      type: 'fill',
      source: sourceId,
      'source-layer': 'water',
      filter: waterLayer?.filter as never,
      paint: { 'fill-color': MAP_PAPER, 'fill-opacity': opacity },
      minzoom: COAST_FADE_START,
    })
  }

  if (!map.getLayer(DETAILED_WATERWAY_LAYER) && waterwayLayer) {
    map.addLayer({
      id: DETAILED_WATERWAY_LAYER,
      type: 'line',
      source: sourceId,
      'source-layer': 'waterway',
      filter: waterwayLayer.filter as never,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': MAP_PAPER,
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 4] as never,
        'line-opacity': opacity,
      },
      minzoom: COAST_FADE_START,
    })
  }
}
