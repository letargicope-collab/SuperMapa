/**
 * Trajetos de carro calculados sobre a malha viária do OpenStreetMap via OSRM.
 * Configure VITE_OSRM_BASE_URL com uma instância autorizada para produção.
 */

export type Coordinate = [number, number]

export type RoadRoute = {
  coordinates: Coordinate[]
  distanceMeters: number
  durationSeconds: number
  roadStart: Coordinate
  roadEnd: Coordinate
}

export class RoutingError extends Error {
  constructor(public readonly kind: 'unavailable' | 'no-route' | 'timeout') {
    super(kind)
  }
}

const DEMO_BASE_URL = 'https://router.project-osrm.org'
const REQUEST_TIMEOUT_MS = 12_000

function endpoint(): string {
  return (import.meta.env.VITE_OSRM_BASE_URL || DEMO_BASE_URL).replace(/\/$/, '')
}

function validPoint(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  )
}

function parseRoute(data: unknown): RoadRoute {
  const result = data as {
    code?: string
    routes?: {
      geometry?: { type?: string; coordinates?: unknown[] }
      distance?: number
      duration?: number
    }[]
    waypoints?: { location?: unknown }[]
  } | null

  if (result?.code === 'NoRoute' || result?.code === 'NoSegment') {
    throw new RoutingError('no-route')
  }

  const route = result?.code === 'Ok' ? result.routes?.[0] : undefined
  const coordinates = route?.geometry?.coordinates
  if (
    route?.geometry?.type !== 'LineString' ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !coordinates.every(validPoint) ||
    !Number.isFinite(route.distance) ||
    !Number.isFinite(route.duration)
  ) {
    throw new RoutingError('unavailable')
  }

  const path = coordinates as Coordinate[]
  const start = result?.waypoints?.[0]?.location
  const end = result?.waypoints?.[1]?.location
  return {
    coordinates: path,
    distanceMeters: route.distance!,
    durationSeconds: route.duration!,
    roadStart: validPoint(start) ? start : path[0],
    roadEnd: validPoint(end) ? end : path[path.length - 1],
  }
}

/** Não desenha linhas fictícias se a API não encontrar uma rota. */
export async function fetchRoadRoute(
  from: Coordinate,
  to: Coordinate,
  signal: AbortSignal,
): Promise<RoadRoute> {
  if (!validPoint(from) || !validPoint(to)) throw new RoutingError('no-route')

  const locations = [from, to].map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';')
  const url = `${endpoint()}/route/v1/driving/${locations}?overview=full&geometries=geojson&steps=false`
  const request = new AbortController()
  let timedOut = false
  const abort = () => request.abort()
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  const timer = window.setTimeout(() => {
    timedOut = true
    request.abort()
  }, REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: request.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new RoutingError('unavailable')
    return parseRoute(await response.json())
  } catch (error) {
    if (signal.aborted) throw new DOMException('Requisição cancelada', 'AbortError')
    if (timedOut) throw new RoutingError('timeout')
    if (error instanceof RoutingError) throw error
    throw new RoutingError('unavailable')
  } finally {
    window.clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export function directionsUrl(from: Coordinate, to: Coordinate): string {
  const [fromLng, fromLat] = from
  const [toLng, toLat] = to
  const params = new URLSearchParams({
    api: '1',
    origin: `${fromLat},${fromLng}`,
    destination: `${toLat},${toLng}`,
    travelmode: 'driving',
  })
  return `https://www.google.com/maps/dir/?${params}`
}