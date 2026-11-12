import { BRAZIL_RINGS } from '../data/brazil-boundary'

/**
 * Enquadramento "Brasil inteiro": calcula, para o tamanho atual do painel,
 * o centro, o zoom e os limites de navegação que deixam o território
 * continental brasileiro centralizado na visão mais afastada.
 */

export type LngLat = [number, number]
export type Bounds = [LngLat, LngLat]

export type Overview = {
  /** Centro do Brasil continental (na projeção do mapa). */
  center: LngLat
  /** Zoom em que o Brasil cabe inteiro no painel, com respiro. */
  zoom: number
  /** Área visível nesse zoom: usada como trava de navegação. */
  bounds: Bounds
}

/** Tamanho do mundo em pixels no zoom 0 (padrão do MapLibre). */
const TILE_SIZE = 512

/** Folga mínima para a trava não disputar com o zoom mínimo por arredondamento. */
const BOUNDS_SLACK = 1.0015

function mercatorX(lng: number): number {
  return (lng + 180) / 360
}

function mercatorY(lat: number): number {
  const sin = Math.sin((lat * Math.PI) / 180)
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)
}

function lngFromMercatorX(x: number): number {
  return x * 360 - 180
}

function latFromMercatorY(y: number): number {
  return (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI
}

/**
 * O contorno traz ilhas oceânicas (Trindade, São Pedro e São Paulo, Noronha)
 * que deslocariam o centro para o Atlântico. O enquadramento usa só o
 * continente: o anel com mais vértices.
 */
const MAINLAND = BRAZIL_RINGS.reduce(
  (largest, ring) => (ring.length > largest.length ? ring : largest),
  BRAZIL_RINGS[0],
)

const MAINLAND_LNG = MAINLAND.reduce(
  (range, [lng]) => ({ west: Math.min(range.west, lng), east: Math.max(range.east, lng) }),
  { west: Infinity, east: -Infinity },
)

/**
 * Anéis usados no contorno do país: continente e ilhas costeiras. As ilhas
 * oceânicas ficam de fora para não aparecerem como pontos soltos na borda.
 */
export const BRAZIL_OUTLINE_RINGS: number[][][] = BRAZIL_RINGS.filter((ring) =>
  ring.every(([lng]) => lng >= MAINLAND_LNG.west - 0.01 && lng <= MAINLAND_LNG.east + 0.01),
)

const BOX = (() => {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const [lng, lat] of MAINLAND) {
    if (lng < west) west = lng
    if (lng > east) east = lng
    if (lat < south) south = lat
    if (lat > north) north = lat
  }
  return {
    x0: mercatorX(west),
    x1: mercatorX(east),
    y0: mercatorY(north),
    y1: mercatorY(south),
  }
})()

/** Respiro entre o Brasil e a borda do painel, proporcional à largura. */
function overviewPadding(width: number): number {
  return Math.min(48, Math.max(18, width * 0.06))
}

export function brazilOverview(width: number, height: number): Overview {
  const w = Math.max(width, 240)
  const h = Math.max(height, 300)
  const padding = overviewPadding(w)

  const spanX = BOX.x1 - BOX.x0
  const spanY = BOX.y1 - BOX.y0
  const worldSize = Math.min((w - 2 * padding) / spanX, (h - 2 * padding) / spanY)
  const zoom = Math.log2(worldSize / TILE_SIZE)

  const centerX = (BOX.x0 + BOX.x1) / 2
  const centerY = (BOX.y0 + BOX.y1) / 2
  const halfW = (w / worldSize / 2) * BOUNDS_SLACK
  const halfH = (h / worldSize / 2) * BOUNDS_SLACK

  return {
    center: [lngFromMercatorX(centerX), latFromMercatorY(centerY)],
    zoom,
    bounds: [
      [lngFromMercatorX(centerX - halfW), latFromMercatorY(centerY + halfH)],
      [lngFromMercatorX(centerX + halfW), latFromMercatorY(centerY - halfH)],
    ],
  }
}

/**
 * Escala dos marcadores conforme o zoom: na visão do país as unidades ficam
 * a poucos pixels umas das outras, então os pontos encolhem para formar um
 * agrupamento legível e crescem ao aproximar.
 */
export function pinScaleForZoom(zoom: number): number {
  return Math.min(1, Math.max(0.34, 0.34 + (zoom - 3) * 0.165))
}
