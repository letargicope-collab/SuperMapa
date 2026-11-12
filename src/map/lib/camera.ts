/**
 * Cálculos de câmera com rotação.
 *
 * O `fitBounds` do MapLibre sempre volta o mapa para o norte (bearing 0), então
 * o enquadramento girado é calculado aqui, em coordenadas Web Mercator
 * normalizadas (0–1), usando a mesma convenção do MapLibre:
 * bearing em graus, sentido horário, 0 = norte para cima.
 */

export type LngLatTuple = [number, number]
export type ScreenPoint = [number, number]
export type Padding = { top: number; bottom: number; left: number; right: number }
export type Camera = { center: LngLatTuple; zoom: number; bearing: number }

/** Tamanho do mundo em pixels no zoom 0 (tiles de 512 px no MapLibre). */
const TILE_SIZE = 512
const MAX_LAT = 85.051129

function toMercator([lng, lat]: LngLatTuple): [number, number] {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat))
  const sin = Math.sin((clamped * Math.PI) / 180)
  return [(lng + 180) / 360, 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)]
}

function fromMercator([x, y]: [number, number]): LngLatTuple {
  return [x * 360 - 180, (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI]
}

/** Deslocamento no mundo (y para baixo) → deslocamento na tela girada. */
function toScreen(dx: number, dy: number, bearing: number): [number, number] {
  const b = (bearing * Math.PI) / 180
  const cos = Math.cos(b)
  const sin = Math.sin(b)
  return [dx * cos + dy * sin, -dx * sin + dy * cos]
}

/** Inverso de `toScreen`. */
function toWorld(sx: number, sy: number, bearing: number): [number, number] {
  const b = (bearing * Math.PI) / 180
  const cos = Math.cos(b)
  const sin = Math.sin(b)
  return [sx * cos - sy * sin, sx * sin + sy * cos]
}

/** Normaliza um ângulo para (-180, 180]. */
export function normalizeBearing(degrees: number): number {
  const value = ((degrees % 360) + 540) % 360 - 180
  return value === -180 ? 180 : value
}

/** Menor diferença angular de `from` até `to`, em graus (-180, 180]. */
export function angleDelta(from: number, to: number): number {
  return normalizeBearing(to - from)
}

/**
 * Bearing que coloca `to` exatamente acima de `from` na tela
 * (o destino fica "à frente" do visitante).
 */
export function bearingTowards(from: LngLatTuple, to: LngLatTuple): number {
  const [ax, ay] = toMercator(from)
  const [bx, by] = toMercator(to)
  const dx = bx - ax
  const dy = by - ay
  if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) return 0
  return normalizeBearing((Math.atan2(dx, -dy) * 180) / Math.PI)
}

/**
 * Câmera que enquadra todos os pontos já girada no `bearing` pedido,
 * respeitando o espaço livre (padding) de cada lado do painel do mapa.
 */
export function cameraForPoints(
  points: LngLatTuple[],
  bearing: number,
  width: number,
  height: number,
  padding: Padding,
  zoomLimits: { min: number; max: number },
): Camera | null {
  if (points.length === 0 || width <= 0 || height <= 0) return null

  const origin = toMercator(points[0])
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of points) {
    const [mx, my] = toMercator(point)
    const [sx, sy] = toScreen(mx - origin[0], my - origin[1], bearing)
    minX = Math.min(minX, sx)
    maxX = Math.max(maxX, sx)
    minY = Math.min(minY, sy)
    maxY = Math.max(maxY, sy)
  }

  const availableWidth = Math.max(40, width - padding.left - padding.right)
  const availableHeight = Math.max(40, height - padding.top - padding.bottom)
  const spanX = Math.max(maxX - minX, 1e-9)
  const spanY = Math.max(maxY - minY, 1e-9)
  const scaleForFit = Math.min(availableWidth / spanX, availableHeight / spanY)
  const zoom = Math.min(
    zoomLimits.max,
    Math.max(zoomLimits.min, Math.log2(scaleForFit / TILE_SIZE)),
  )
  const scale = TILE_SIZE * 2 ** zoom

  // O centro do retângulo útil fica deslocado do centro do mapa pelo padding.
  const offsetX = (padding.left - padding.right) / 2
  const offsetY = (padding.top - padding.bottom) / 2
  const centerScreenX = (minX + maxX) / 2 - offsetX / scale
  const centerScreenY = (minY + maxY) / 2 - offsetY / scale
  const [wx, wy] = toWorld(centerScreenX, centerScreenY, bearing)

  return {
    center: fromMercator([origin[0] + wx, origin[1] + wy]),
    zoom,
    bearing: normalizeBearing(bearing),
  }
}

/**
 * Centro do mapa que faz `point` aparecer na posição `screen` (px a partir do
 * canto superior esquerdo do mapa), com o bearing e o zoom informados.
 * É o que permite girar o mapa "em torno" do visitante.
 */
export function centerPlacingPointAt(
  point: LngLatTuple,
  screen: ScreenPoint,
  width: number,
  height: number,
  bearing: number,
  zoom: number,
): LngLatTuple {
  const scale = TILE_SIZE * 2 ** zoom
  const [px, py] = toMercator(point)
  const offsetX = (screen[0] - width / 2) / scale
  const offsetY = (screen[1] - height / 2) / scale
  const [wx, wy] = toWorld(offsetX, offsetY, bearing)
  return fromMercator([px - wx, py - wy])
}

/**
 * Zoom em que todos os pontos cabem num círculo de `radius` pixels ao redor
 * de `center` — assim nenhum ponto sai da tela, qualquer que seja a rotação.
 */
export function zoomForRadius(
  center: LngLatTuple,
  points: LngLatTuple[],
  radius: number,
  zoomLimits: { min: number; max: number },
): number {
  const [cx, cy] = toMercator(center)
  let farthest = 0
  for (const point of points) {
    const [x, y] = toMercator(point)
    farthest = Math.max(farthest, Math.hypot(x - cx, y - cy))
  }
  if (farthest < 1e-12) return zoomLimits.max
  const zoom = Math.log2(Math.max(20, radius) / (farthest * TILE_SIZE))
  return Math.min(zoomLimits.max, Math.max(zoomLimits.min, zoom))
}

/** Polígono aproximando um círculo geográfico (raio em metros). */
export function circlePolygon(center: LngLatTuple, radiusMeters: number, steps = 64): LngLatTuple[] {
  const [lng, lat] = center
  const earth = 6_378_137
  const angular = radiusMeters / earth
  const latRad = (lat * Math.PI) / 180
  const lngRad = (lng * Math.PI) / 180
  const ring: LngLatTuple[] = []
  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * 2 * Math.PI
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(angular) + Math.cos(latRad) * Math.sin(angular) * Math.cos(theta),
    )
    const pointLng =
      lngRad +
      Math.atan2(
        Math.sin(theta) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * Math.sin(pointLat),
      )
    ring.push([(pointLng * 180) / Math.PI, (pointLat * 180) / Math.PI])
  }
  return ring
}
