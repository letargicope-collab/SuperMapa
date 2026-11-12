import { PLACES, type Place } from '../data/places'

/**
 * Localização aproximada do visitante.
 *
 * Ordem de tentativa:
 *  1. GPS contínuo do navegador (costuma exigir permissão);
 *  2. serviços de geolocalização por IP (aproximados, sem rastreio contínuo).
 *
 * Não usamos nenhuma API com chave: os serviços públicos abaixo aceitam
 * requisições diretas do navegador.
 */

export type UserLocation = {
  /** [longitude, latitude] */
  coordinates: [number, number]
  /** Origem do dado, exibida na tela. */
  source: 'gps' | 'ip'
  /** Cidade/estado estimados quando vêm do IP. */
  label?: string
  /** Precisão em metros (apenas GPS). */
  accuracy?: number
  /** Direção do deslocamento em graus (apenas GPS em movimento). */
  heading?: number
  /** Velocidade em m/s (apenas GPS). */
  speed?: number
  /** Momento da leitura (ms). */
  timestamp?: number
}

/** Motivo de o GPS não estar disponível, para orientar o visitante. */
export type GpsFailure =
  | 'unsupported'
  | 'insecure'
  | 'policy'
  | 'denied'
  | 'timeout'
  | 'unavailable'

export type UserLocationResult =
  | { status: 'ok'; location: UserLocation }
  | { status: 'unavailable' }
  | { status: 'outside' }

/** Distância máxima aceitável entre a posição do visitante e o Brasil. */
const BRAZIL_LIMITS = { west: -78, east: -30, south: -35, north: 8 }

export function insideBrazil([lng, lat]: [number, number]): boolean {
  return (
    lng >= BRAZIL_LIMITS.west &&
    lng <= BRAZIL_LIMITS.east &&
    lat >= BRAZIL_LIMITS.south &&
    lat <= BRAZIL_LIMITS.north
  )
}

/** ------------------------------ GPS ------------------------------ */

/** Sem nenhuma leitura até aqui: mostra a região do IP enquanto o GPS continua tentando. */
const GPS_FALLBACK_DELAY = 9_000
/** Leitura pior que a anterior, chegando logo depois, é ruído (rede x satélite). */
const WORSE_FIX_WINDOW = 15_000

type PolicyDocument = Document & {
  permissionsPolicy?: { allowsFeature?: (feature: string) => boolean }
  featurePolicy?: { allowsFeature?: (feature: string) => boolean }
}

/** O site pode estar dentro de um iframe que bloqueia a geolocalização. */
function geolocationBlockedByPolicy(): boolean {
  const doc = document as PolicyDocument
  const policy = doc.permissionsPolicy ?? doc.featurePolicy
  try {
    return typeof policy?.allowsFeature === 'function' && !policy.allowsFeature('geolocation')
  } catch {
    return false
  }
}

/**
 * Mantém o GPS ligado até o usuário sair do modo rota.
 *
 *  - Uma leitura rápida (rede/Wi-Fi) entra primeiro, para o mapa não esperar o
 *    satélite; a leitura de alta precisão substitui assim que chega.
 *  - O rastreamento não usa `timeout`: em GPS "frio" a primeira leitura precisa
 *    pode levar mais de 10 s, e o timeout fazia o navegador desistir e o mapa
 *    cair para o IP. Se nada chegar em 9 s, o IP aparece provisoriamente e o
 *    GPS segue tentando em segundo plano.
 *  - Leituras bem menos precisas que a anterior, chegando logo em seguida,
 *    são descartadas (o celular alterna entre rede e satélite).
 */
export function watchUserLocation(
  onUpdate: (location: UserLocation) => void,
  onUnavailable: (reason: GpsFailure) => void,
): () => void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onUnavailable('unsupported')
    return () => {}
  }
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    onUnavailable('insecure')
    return () => {}
  }
  if (geolocationBlockedByPolicy()) {
    onUnavailable('policy')
    return () => {}
  }

  let active = true
  let hasFix = false
  let fallbackStarted = false
  let watchId: number | null = null
  let last: { accuracy: number; at: number } | null = null

  const fallback = (reason: GpsFailure) => {
    if (!active || fallbackStarted || hasFix) return
    fallbackStarted = true
    onUnavailable(reason)
  }

  const accept = (position: GeolocationPosition) => {
    if (!active) return
    const { coords } = position
    if (!Number.isFinite(coords.longitude) || !Number.isFinite(coords.latitude)) return
    const accuracy = Number.isFinite(coords.accuracy) ? coords.accuracy : 9_999
    const now = Date.now()
    if (last && accuracy > Math.max(last.accuracy * 2, 80) && now - last.at < WORSE_FIX_WINDOW) {
      return
    }
    last = { accuracy, at: now }
    hasFix = true
    fallbackStarted = false
    window.clearTimeout(timer)
    const moving = Number.isFinite(coords.speed) && (coords.speed ?? 0) > 0.8
    onUpdate({
      coordinates: [coords.longitude, coords.latitude],
      source: 'gps',
      accuracy: Math.round(accuracy),
      heading: moving && Number.isFinite(coords.heading) ? (coords.heading as number) : undefined,
      speed: Number.isFinite(coords.speed) ? (coords.speed as number) : undefined,
      timestamp: position.timestamp || now,
    })
  }

  const fail = (error: GeolocationPositionError) => {
    if (!active) return
    if (error.code === error.PERMISSION_DENIED) {
      // Permissão recusada: continuar tentando seria inútil.
      window.clearTimeout(timer)
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      watchId = null
      hasFix = false
      fallbackStarted = false
      fallback('denied')
      return
    }
    fallback(error.code === error.TIMEOUT ? 'timeout' : 'unavailable')
  }

  const timer = window.setTimeout(() => fallback('timeout'), GPS_FALLBACK_DELAY)

  try {
    // Rastreamento contínuo de alta precisão, sem timeout.
    watchId = navigator.geolocation.watchPosition(accept, fail, {
      enableHighAccuracy: true,
      maximumAge: 0,
    })
  } catch {
    fallback('unavailable')
  }
  try {
    // Leitura rápida e aproximada (Wi-Fi/rede), aceita cache de até 1 minuto.
    navigator.geolocation.getCurrentPosition(accept, () => {}, {
      enableHighAccuracy: false,
      maximumAge: 60_000,
      timeout: GPS_FALLBACK_DELAY,
    })
  } catch {
    /* opcional: o rastreamento contínuo acima continua valendo */
  }

  return () => {
    active = false
    window.clearTimeout(timer)
    if (watchId !== null) navigator.geolocation.clearWatch(watchId)
  }
}

/** ------------------------------- IP ------------------------------- */

type IpService = {
  url: string
  read: (data: unknown) => { lng: number; lat: number; label?: string } | null
}

const IP_SERVICES: IpService[] = [
  {
    url: 'https://get.geojs.io/v1/ip/geo.json',
    read: (data) => {
      const d = data as { longitude?: string; latitude?: string; city?: string; region?: string }
      if (d.longitude == null || d.latitude == null) return null
      const lng = Number(d.longitude)
      const lat = Number(d.latitude)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
      return { lng, lat, label: [d.city, d.region].filter(Boolean).join(' · ') }
    },
  },
  {
    url: 'https://ipapi.co/json/',
    read: (data) => {
      const d = data as { longitude?: number; latitude?: number; city?: string; region?: string }
      if (typeof d.longitude !== 'number' || typeof d.latitude !== 'number') return null
      return {
        lng: d.longitude,
        lat: d.latitude,
        label: [d.city, d.region].filter(Boolean).join(' · '),
      }
    },
  },
  {
    url: 'https://ipwho.is/',
    read: (data) => {
      const d = data as {
        success?: boolean
        longitude?: number
        latitude?: number
        city?: string
        region?: string
      }
      if (d.success === false) return null
      if (typeof d.longitude !== 'number' || typeof d.latitude !== 'number') return null
      return {
        lng: d.longitude,
        lat: d.latitude,
        label: [d.city, d.region].filter(Boolean).join(' · '),
      }
    },
  },
]

const IP_TIMEOUT = 6000

/** Consulta os serviços de IP em sequência até um responder com coordenadas. */
export async function locateByIp(signal?: AbortSignal): Promise<UserLocationResult> {
  let outside = false
  for (const service of IP_SERVICES) {
    if (signal?.aborted) return { status: 'unavailable' }
    const result = await fetchLocation(service, signal)
    if (result) {
      if (!insideBrazil(result.coordinates)) {
        outside = true
        continue
      }
      return { status: 'ok', location: result }
    }
  }
  return { status: outside ? 'outside' : 'unavailable' }
}

function fetchLocation(service: IpService, signal?: AbortSignal): Promise<UserLocation | null> {
  return new Promise((resolve) => {
    const controller = new AbortController()
    let settled = false
    const finish = (result: UserLocation | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve(result)
    }
    const abort = () => {
      controller.abort()
      finish(null)
    }
    const timer = window.setTimeout(() => {
      controller.abort()
      finish(null)
    }, IP_TIMEOUT)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
      return
    }

    fetch(service.url, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!data) return finish(null)
        const parsed = service.read(data)
        if (!parsed) return finish(null)
        finish({
          coordinates: [parsed.lng, parsed.lat],
          source: 'ip',
          label: parsed.label,
        })
      })
      .catch(() => finish(null))
  })
}

/** ------------------------ escritório mais próximo ------------------------ */

const EARTH_RADIUS_KM = 6371
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180

/** Distância em linha reta, em quilômetros (fórmula de haversine). */
export function distanceKm(a: [number, number], b: [number, number]): number {
  const dLat = toRadians(b[1] - a[1])
  const dLng = toRadians(b[0] - a[0])
  const lat1 = toRadians(a[1])
  const lat2 = toRadians(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

export type NearestOffice = {
  place: Place
  /** Distância em linha reta até o visitante. */
  distanceKm: number
  /** Índice na lista de unidades ordenada por distância. */
  rank: number
}

export function nearestOffice(coordinates: [number, number]): NearestOffice | null {
  if (PLACES.length === 0) return null

  const sorted = officesByDistance(coordinates)
  const best = sorted[0]
  return { place: best.place, distanceKm: best.distanceKm, rank: 0 }
}

/** Unidades ordenadas pela distância até o visitante. */
export function officesByDistance(coordinates: [number, number]): { place: Place; distanceKm: number }[] {
  return PLACES.map((place) => ({ place, distanceKm: distanceKm(coordinates, place.coordinates) })).sort(
    (a, b) => a.distanceKm - b.distanceKm,
  )
}

