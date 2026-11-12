import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import maplibregl from 'maplibre-gl'
import type { Map as MapLibreMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { PLACES, type Place } from '../data/places'
import { BRAZIL_RINGS } from '../data/brazil-boundary'
import {
  BASEMAP_STYLE_URL,
  applyBrazilStatesStyle,
  applyDetailedCoastline,
  pageColor,
  raiseLabelsAboveMask,
  setFocusCity,
  updateCityVisibility,
  updatePageColor,
} from '../lib/palette'
import {
  BRAZIL_OUTLINE_RINGS,
  brazilOverview,
  pinScaleForZoom,
  type Overview,
} from '../lib/overview'
import {
  distanceKm,
  insideBrazil,
  locateByIp,
  nearestOffice,
  watchUserLocation,
  type GpsFailure,
  type UserLocation,
} from '../lib/userLocation'
import {
  angleDelta,
  bearingTowards,
  cameraForPoints,
  centerPlacingPointAt,
  circlePolygon,
  zoomForRadius,
  type LngLatTuple,
  type Padding,
} from '../lib/camera'
import { requestCompassPermission, watchCompass } from '../lib/compass'
import { directionsUrl, fetchRoadRoute, RoutingError, type RoadRoute } from '../lib/roadRouting'
import {
  createArrivalTracker,
  evaluateArrival,
  resetArrivalTracker,
} from '../lib/arrival'
import { playArrivalSound, prepareArrivalSound } from '../lib/arrivalSound'
import ArrivalToast from './ArrivalToast'
import PlaceCard from './PlaceCard'

/**
 * Fora do Safari, o MapLibre usa um único worker para tudo: blocos do mapa e
 * as camadas próprias (estados, máscara do Brasil, rota). Durante um zoom, a
 * linha da rota ficava segundos na fila atrás dos blocos. Com mais workers,
 * cada fonte de dados é processada em paralelo.
 */
if (typeof navigator !== 'undefined') {
  const cores = navigator.hardwareConcurrency || 4
  maplibregl.setWorkerCount(Math.max(2, Math.min(3, Math.floor(cores / 2))))
}

/** Anel externo CCW cobrindo o mundo todo; os anéis do Brasil entram como furos. */
const WORLD_RING: number[][] = [
  [-180, -90],
  [180, -90],
  [180, 90],
  [-180, 90],
  [-180, -90],
]

/** Zoom de destino ao escolher um escritório: mostra a cidade e a rua do endereço. */
const STREET_ZOOM = 16.4

/** Aproximação máxima permitida. */
const MAX_ZOOM = 17

/** Abaixo deste zoom os marcadores se sobrepõem: o clique aproxima a região. */
const CLUSTER_ZOOM = 5.4

/** Tolerância para considerar que o mapa está na visão do Brasil inteiro. */
const OVERVIEW_TOLERANCE = 0.04

/** Parou a menos disto do zoom mínimo: encaixa na visão exata, com o Brasil no centro. */
const OVERVIEW_SNAP = 0.12

/** Recalcular a rota só após deslocamento real, sem sobrecarregar o serviço público. */
const REROUTE_DISTANCE_KM = 0.04
const REROUTE_INTERVAL_MS = 15_000
const NEW_DESTINATION_INTERVAL_MS = 1_250

/** Zoom máximo ao enquadrar a rota inteira. */
const ROUTE_MAX_ZOOM = 16
/** Zoom máximo no modo bússola (visitante no centro, mapa girando). */
const COMPASS_MAX_ZOOM = 16.5

/**
 * Orientação do mapa:
 *  - north: norte para cima (padrão);
 *  - free: girado (na direção do destino ou pelo botão direito do mouse);
 *  - compass: acompanha a direção do celular (bússola ou GPS em movimento).
 */
type Orientation = 'north' | 'free' | 'compass'

type HeadingReading = { deg: number; at: number; source: 'device' | 'gps' }

/** Texto exibido quando o GPS não está disponível e a região vem do IP. */
const GPS_ISSUE_TEXT: Record<GpsFailure, string> = {
  denied: 'GPS bloqueado nas permissões do navegador. Libere a localização para ver sua posição exata.',
  policy: 'Este visualizador bloqueia o GPS. Abra o site diretamente no navegador para ver sua posição exata.',
  insecure: 'O GPS exige conexão segura (HTTPS). Mostrando a região aproximada pelo IP.',
  unsupported: 'Este navegador não oferece GPS. Mostrando a região aproximada pelo IP.',
  timeout: 'Aguardando sinal do GPS… Enquanto isso, mostramos a região aproximada pelo IP.',
  unavailable: 'Sinal do GPS indisponível no momento. Mostrando a região aproximada pelo IP.',
}

function formatAccuracy(meters: number): string {
  if (meters < 1000) return `±${Math.max(1, Math.round(meters))} m`
  return `±${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

type GeoJsonData = Parameters<maplibregl.GeoJSONSource['setData']>[0]

/** Valor da opção "voltar ao mais próximo" no seletor de destino. */
const NEAREST_OPTION = '__nearest'

/** Unidades agrupadas por estado, para o seletor de destino da rota. */
const DESTINATION_GROUPS = (
  [['AL', 'Alagoas'], ['SE', 'Sergipe'], ['PE', 'Pernambuco']] as const
).map(([uf, label]) => ({
  uf,
  label,
  places: PLACES.filter((place) => place.uf === uf).sort((a, b) => {
    if (Boolean(a.isHeadquarters) !== Boolean(b.isHeadquarters)) return a.isHeadquarters ? -1 : 1
    return a.name.localeCompare(b.name, 'pt-BR')
  }),
})).filter((group) => group.places.length > 0)

type ActiveRoute = {
  user: UserLocation
  place: Place
  /** true = destino escolhido pelo visitante; false = unidade mais próxima (automático). */
  chosen: boolean
  road: RoadRoute | null
  status: 'loading' | 'updating' | 'ready' | 'error'
  error?: string
  staleLocation?: boolean
  /** O visitante chegou ao escritório do destino. */
  arrived?: boolean
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? `${hours} h ${remainder} min` : `${hours} h`
}

/** Respeita a preferência do sistema por menos movimento. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Região atendida: enquadra todos os escritórios cadastrados no Nordeste. */
const OFFICE_BOUNDS: [[number, number], [number, number]] = [
  [-38.2, -11.2],
  [-35.85, -8.15],
]

/** Estilo raster de contingência caso o serviço vetorial não responda. */
const RASTER_FALLBACK = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
}

/**
 * Apaga tudo fora do Brasil: preenche o mundo com a cor de fundo,
 * deixando só o território brasileiro (furos da máscara) visível.
 * A camada entra no topo do estilo, então some com países vizinhos,
 * oceanos, fronteiras e rótulos externos — os marcadores (HTML) seguem acima.
 * Um contorno fino na cor da marca define a silhueta do país na visão afastada.
 */
function applyBrazilOnlyMask(map: MapLibreMap): void {
  const data = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'Polygon' as const,
          coordinates: [WORLD_RING, ...BRAZIL_RINGS],
        },
      },
    ],
  }

  if (map.getSource('brazil-outside-mask')) {
    ;(map.getSource('brazil-outside-mask') as maplibregl.GeoJSONSource).setData(data)
  } else {
    map.addSource('brazil-outside-mask', { type: 'geojson', data })
    map.addLayer({
      id: 'brazil-outside-mask',
      type: 'fill',
      source: 'brazil-outside-mask',
      paint: {
        'fill-color': pageColor(),
        // Some no zoom de cidade: a costa real passa a vir dos tiles.
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5.2, 1, 6.4, 0] as never,
      },
      // Fora da vista do país a camada não é mais desenhada.
      maxzoom: 6.4,
    })
  }

  if (!map.getSource('brazil-outline')) {
    map.addSource('brazil-outline', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'MultiLineString', coordinates: BRAZIL_OUTLINE_RINGS },
      },
    })
  }
  if (map.getLayer('brazil-outside-mask')) map.setLayerZoomRange('brazil-outside-mask', 0, 6.4)
  if (map.getLayer('brazil-outline')) map.setLayerZoomRange('brazil-outline', 0, 6)

  if (!map.getLayer('brazil-outline')) {
    map.addLayer({
      id: 'brazil-outline',
      type: 'line',
      source: 'brazil-outline',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        // O contorno só existe na visão do país; em zoom de cidade ele é
        // substituído pela costa detalhada dos tiles (ver applyDetailedCoastline).
        'line-color': '#dff900',
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 4.8, 0.32, 6, 0] as never,
        'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1, 8, 1.5] as never,
      },
      maxzoom: 6,
    })
  }
}

export type AtlasMapHandle = {
  /** Abre o cartão do escritório e aproxima o mapa até a rua dele. */
  focus: (place: Place) => void
  /** Traça a rota do visitante até a unidade escolhida. */
  routeTo: (place: Place) => void
  /** Troca a cor usada por ruas, avenidas, divisas e pela máscara fora do Brasil. */
  setPageColor: (color: string) => void
}

type AtlasMapProps = {
  onOpenChange?: (place: Place | null) => void
  /** Unidade de destino da rota (em andamento ou aguardando a localização). */
  onRouteChange?: (destinationId: string | null) => void
}

const AtlasMap = forwardRef<AtlasMapHandle, AtlasMapProps>(function AtlasMap(
  { onOpenChange, onRouteChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const pinRefs = useRef(new Map<string, HTMLButtonElement>())
  const cardRef = useRef<HTMLDivElement | null>(null)
  const openIdRef = useRef<string | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const overviewRef = useRef<Overview | null>(null)

  const onOpenChangeRef = useRef(onOpenChange)
  onOpenChangeRef.current = onOpenChange
  const onRouteChangeRef = useRef(onRouteChange)
  onRouteChangeRef.current = onRouteChange

  const [openId, setOpenId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [anchor, setAnchor] = useState({ left: 0, top: 0, caret: 0, flip: false })
  const [view, setView] = useState({ atOverview: true, atMax: false, clustered: true, rotated: false })

  /** Modo rota: GPS contínuo, destino e geometria viária obtida do OSRM. */
  const [route, setRoute] = useState<ActiveRoute | null>(null)
  const [locating, setLocatingState] = useState(false)
  const locatingRef = useRef(false)
  const setLocating = useCallback((value: boolean) => {
    locatingRef.current = value
    setLocatingState(value)
  }, [])
  /** Aviso de chegada ao escritório do destino. */
  const [arrival, setArrival] = useState<{ place: Place; alreadyThere: boolean } | null>(null)
  const arrivalRef = useRef(createArrivalTracker())
  /** Destino escolhido pelo visitante; nulo = unidade mais próxima (automático). */
  const chosenRef = useRef<Place | null>(null)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const routeRef = useRef<ActiveRoute | null>(null)
  const userMarkerRef = useRef<maplibregl.Marker | null>(null)
  const stopGpsRef = useRef<(() => void) | null>(null)
  const ipRequestRef = useRef<AbortController | null>(null)
  const roadRequestRef = useRef<AbortController | null>(null)
  const rerouteTimerRef = useRef<number | null>(null)
  const sessionRef = useRef(0)
  const requestRef = useRef(0)
  const lastRequestAtRef = useRef(0)
  const lastRequestedPositionRef = useRef<[number, number] | null>(null)
  const lastAutoFitAtRef = useRef(0)

  /** Rotação: bússola do celular, botão direito do mouse e direção do destino. */
  const stageRef = useRef<HTMLDivElement | null>(null)
  const styleReadyRef = useRef(false)
  const [orientation, setOrientationState] = useState<Orientation>('north')
  const orientationRef = useRef<Orientation>('north')
  const [compassAvailable, setCompassAvailable] = useState(false)
  const compassAvailableRef = useRef(false)
  const headingRef = useRef<HeadingReading | null>(null)
  const stopCompassRef = useRef<(() => void) | null>(null)
  const compassFrameRef = useRef<number | null>(null)
  const lastFrameAtRef = useRef(0)
  const recenterRef = useRef(false)
  const interactingRef = useRef(false)
  /** O visitante desligou a bússola: novas leituras não a religam sozinhas. */
  const userChoseNorthRef = useRef(false)
  const coneMarkerRef = useRef<maplibregl.Marker | null>(null)
  const [gpsIssue, setGpsIssue] = useState<GpsFailure | null>(null)

  const setOrientation = useCallback((next: Orientation) => {
    orientationRef.current = next
    setOrientationState(next)
    if (next !== 'compass' && compassFrameRef.current !== null) {
      window.cancelAnimationFrame(compassFrameRef.current)
      compassFrameRef.current = null
    }
  }, [])

  const publishRoute = useCallback((next: ActiveRoute | null) => {
    routeRef.current = next
    setRoute(next)
  }, [])

  const closeCard = useCallback(() => {
    const current = openIdRef.current
    if (!current) return
    openIdRef.current = null
    pinRefs.current.get(current)?.classList.remove('is-active')
    if (mapRef.current) setFocusCity(mapRef.current, null)
    onOpenChangeRef.current?.(null)
    setClosing(true)
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      setOpenId(null)
      setClosing(false)
    }, 260)
  }, [])

  const selectPlace = useCallback(
    (place: Place) => {
      if (openIdRef.current === place.id) {
        closeCard()
        return
      }
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
      pinRefs.current.get(openIdRef.current ?? '')?.classList.remove('is-active')
      openIdRef.current = place.id
      pinRefs.current.get(place.id)?.classList.add('is-active')
      if (mapRef.current) setFocusCity(mapRef.current, place)
      onOpenChangeRef.current?.(place)
      setClosing(false)
      setOpenId(place.id)
    },
    [closeCard],
  )

  /** Voo suave até o endereço: só o mapa se move, o painel ao lado fica parado. */
  const flyToOffice = useCallback((place: Place, resetBearing = false) => {
    const map = mapRef.current
    if (!map) return
    map.stop()
    map.flyTo({
      center: place.coordinates,
      zoom: STREET_ZOOM,
      ...(resetBearing ? { bearing: 0 } : {}),
      speed: 1.5,
      curve: 1.5,
      essential: true,
      duration: prefersReducedMotion() ? 0 : 2200,
    })
  }, [])

  /** Aproxima até a região atendida (Alagoas, Sergipe e Pernambuco). */
  const flyToRegion = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    map.stop()
    setOrientation('north')
    map.fitBounds(OFFICE_BOUNDS, {
      padding: 42,
      maxZoom: 7.5,
      essential: true,
      duration: prefersReducedMotion() ? 0 : 1600,
    })
  }, [setOrientation])

  /** Volta à visão mais afastada: Brasil inteiro, centralizado no painel. */
  const flyToOverview = useCallback(() => {
    const map = mapRef.current
    const overview = overviewRef.current
    if (!map || !overview) return
    closeCard()
    // Maximizar volta o norte para cima e desliga a bússola.
    if (orientationRef.current === 'compass') userChoseNorthRef.current = true
    setOrientation('north')
    map.stop()
    map.flyTo({
      center: overview.center,
      zoom: overview.zoom,
      bearing: 0,
      curve: 1.2,
      essential: true,
      duration: prefersReducedMotion() ? 0 : 1800,
    })
  }, [closeCard, setOrientation])

  const zoomBy = useCallback((direction: 1 | -1) => {
    const map = mapRef.current
    if (!map) return
    const options = { duration: prefersReducedMotion() ? 0 : 280 }
    if (direction > 0) {
      map.zoomIn(options)
      return
    }
    // O último passo de afastamento termina exatamente na visão centralizada do Brasil.
    const overview = overviewRef.current
    if (overview && map.getZoom() - 1 <= overview.zoom + OVERVIEW_SNAP) {
      if (orientationRef.current === 'compass') userChoseNorthRef.current = true
      setOrientation('north')
      map.easeTo({ center: overview.center, zoom: overview.zoom, bearing: 0, ...options })
      return
    }
    map.zoomOut(options)
  }, [setOrientation])

  /** A geometria vem exclusivamente do serviço de rotas, nunca de uma reta. */
  const showRoadRoute = useCallback((road: RoadRoute) => {
    const map = mapRef.current
    // `isStyleLoaded()` fica falso enquanto qualquer tile carrega — exatamente
    // durante o zoom até a rota. Usamos o carregamento do estilo em si.
    if (!map || !styleReadyRef.current) return
    const data = {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: road.coordinates },
    }
    const source = map.getSource('user-route') as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData(data)
      return
    }

    map.addSource('user-route', { type: 'geojson', data })
    const before = map.getLayer('label_state') ? 'label_state' : undefined
    map.addLayer({
      id: 'user-route-glow',
      type: 'line',
      source: 'user-route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#dff900', 'line-width': 12, 'line-blur': 8, 'line-opacity': 0.5 },
    }, before)
    map.addLayer({
      id: 'user-route',
      type: 'line',
      source: 'user-route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#dff900', 'line-width': 4, 'line-opacity': 1 },
    }, before)
  }, [])

  const clearRoadRoute = useCallback(() => {
    const map = mapRef.current
    if (!map || !styleReadyRef.current) return
    if (map.getLayer('user-route-glow')) map.removeLayer('user-route-glow')
    if (map.getLayer('user-route')) map.removeLayer('user-route')
    if (map.getSource('user-route')) map.removeSource('user-route')
  }, [])

  /** O Marker nativo acompanha o mapa e recebe cada novo fix do GPS. */
  const showUserMarker = useCallback((user: UserLocation) => {
    const map = mapRef.current
    if (!map) return
    if (!userMarkerRef.current) {
      const host = document.createElement('div')
      host.className = 'atlas-user-host'
      host.innerHTML = '<span class="atlas-user-dot" aria-hidden="true"></span>' +
        '<span class="atlas-user-pulse" aria-hidden="true"></span>' +
        '<span class="atlas-user-label"></span>'
      userMarkerRef.current = new maplibregl.Marker({ element: host, anchor: 'center' })
        .setLngLat(user.coordinates)
        .addTo(map)
    } else {
      userMarkerRef.current.setLngLat(user.coordinates)
    }
    const host = userMarkerRef.current.getElement()
    const label = host.querySelector<HTMLElement>('.atlas-user-label')
    if (label) label.textContent = user.source === 'gps' ? 'Você está aqui' : 'Região aproximada (IP)'
  }, [])

  /** Espaço livre ao redor da rota: painel no topo, botões nas laterais/rodapé. */
  const routePadding = useCallback((map: MapLibreMap): Padding => {
    const container = map.getContainer()
    const mobile = container.clientWidth < 520
    const panel = container.closest('.atlas-stage')?.querySelector('.atlas-route-panel')
    const panelBottom = panel
      ? panel.getBoundingClientRect().bottom - container.getBoundingClientRect().top
      : mobile ? 130 : 160
    return mobile
      ? { top: Math.max(110, panelBottom + 20), bottom: 142, left: 30, right: 74 }
      : { top: Math.max(110, panelBottom + 30), bottom: 96, left: 64, right: 84 }
  }, [])

  /** Rota inteira enquadrada, já girada no ângulo pedido. */
  const frameRoute = useCallback((
    user: UserLocation,
    place: Place,
    road: RoadRoute | null,
    bearing: number,
    duration = 1300,
  ) => {
    const map = mapRef.current
    if (!map) return
    const container = map.getContainer()
    const points: LngLatTuple[] = [...(road?.coordinates ?? []), user.coordinates, place.coordinates]
    const camera = cameraForPoints(
      points,
      bearing,
      container.clientWidth,
      container.clientHeight,
      routePadding(map),
      { min: overviewRef.current?.zoom ?? 2, max: ROUTE_MAX_ZOOM },
    )
    if (!camera) return
    lastAutoFitAtRef.current = Date.now()
    map.easeTo({ ...camera, duration: prefersReducedMotion() ? 0 : duration, essential: true })
  }, [routePadding])

  /** No modo bússola, o visitante fica no centro da área livre do mapa. */
  const compassFrame = useCallback((map: MapLibreMap) => {
    const container = map.getContainer()
    const width = container.clientWidth
    const height = container.clientHeight
    const padding = routePadding(map)
    const availableWidth = Math.max(60, width - padding.left - padding.right)
    const availableHeight = Math.max(60, height - padding.top - padding.bottom)
    return {
      width,
      height,
      anchor: [
        padding.left + availableWidth / 2,
        padding.top + availableHeight / 2,
      ] as [number, number],
      // Um círculo cabe na área livre em qualquer rotação: a rota nunca sai da tela.
      radius: Math.min(availableWidth, availableHeight) / 2 - 6,
    }
  }, [routePadding])

  const frameCompass = useCallback((user: UserLocation, place: Place, road: RoadRoute | null) => {
    const map = mapRef.current
    if (!map) return
    const { width, height, anchor, radius } = compassFrame(map)
    const bearing = headingRef.current?.deg ?? map.getBearing()
    const points: LngLatTuple[] = [...(road?.coordinates ?? []), place.coordinates]
    const zoom = zoomForRadius(user.coordinates, points, radius, {
      min: overviewRef.current?.zoom ?? 2,
      max: COMPASS_MAX_ZOOM,
    })
    const center = centerPlacingPointAt(user.coordinates, anchor, width, height, bearing, zoom)
    lastAutoFitAtRef.current = Date.now()
    recenterRef.current = false
    map.easeTo({ center, zoom, bearing, duration: prefersReducedMotion() ? 0 : 900, essential: true })
  }, [compassFrame])

  /**
   * Bússola contínua: a cada quadro, aproxima o bearing do mapa da direção do
   * celular (com suavização) girando em torno do visitante, que fica parado
   * na tela. Pausa enquanto o usuário arrasta/aplica zoom ou durante animações.
   */
  const compassLoopRef = useRef<(time: number) => void>(() => {})
  compassLoopRef.current = (time: number) => {
    compassFrameRef.current = null
    const map = mapRef.current
    const active = routeRef.current
    if (!map || !active || orientationRef.current !== 'compass') return
    compassFrameRef.current = window.requestAnimationFrame((t) => compassLoopRef.current(t))
    const elapsed = lastFrameAtRef.current ? Math.min(100, time - lastFrameAtRef.current) : 16
    lastFrameAtRef.current = time
    const heading = headingRef.current
    if (!heading || interactingRef.current || map.isMoving()) return

    const current = map.getBearing()
    const delta = angleDelta(current, heading.deg)
    const rotation = 1 - Math.exp(-elapsed / 110)
    const next = Math.abs(delta) < 0.12 ? heading.deg : current + delta * rotation

    const container = map.getContainer()
    const width = container.clientWidth
    const height = container.clientHeight
    const point = map.project(active.user.coordinates)
    const inside = point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height
    let pivot: LngLatTuple = active.user.coordinates
    let screen: [number, number] = [point.x, point.y]
    if (!inside) {
      // Visitante fora da tela (o usuário arrastou o mapa): gira em torno do centro.
      pivot = map.getCenter().toArray() as LngLatTuple
      screen = [width / 2, height / 2]
    } else if (recenterRef.current) {
      const { anchor } = compassFrame(map)
      const follow = 1 - Math.exp(-elapsed / 240)
      screen = [point.x + (anchor[0] - point.x) * follow, point.y + (anchor[1] - point.y) * follow]
      if (Math.hypot(anchor[0] - point.x, anchor[1] - point.y) < 0.8) recenterRef.current = false
    }
    if (Math.abs(next - current) < 0.02 && !recenterRef.current) return
    const center = centerPlacingPointAt(pivot, screen, width, height, next, map.getZoom())
    map.jumpTo({ center, bearing: next })
  }

  const startCompassLoop = useCallback(() => {
    if (compassFrameRef.current !== null) return
    lastFrameAtRef.current = 0
    compassFrameRef.current = window.requestAnimationFrame((t) => compassLoopRef.current(t))
  }, [])

  const enableCompassMode = useCallback(() => {
    const active = routeRef.current
    if (!active || !headingRef.current) return
    userChoseNorthRef.current = false
    setOrientation('compass')
    frameCompass(active.user, active.place, active.road)
    startCompassLoop()
  }, [frameCompass, setOrientation, startCompassLoop])

  /**
   * Enquadra a rota no modo atual. Ao mostrar uma rota nova, gira o mapa para
   * o destino ficar "à frente" — ou, se o celular tiver bússola, passa a
   * acompanhar a direção do aparelho.
   */
  const frameForMode = useCallback((
    user: UserLocation,
    place: Place,
    road: RoadRoute | null,
    towardsDestination: boolean,
  ) => {
    const map = mapRef.current
    if (!map) return
    const wantsCompass = Boolean(headingRef.current) && !userChoseNorthRef.current
    if (orientationRef.current === 'compass' || (towardsDestination && wantsCompass)) {
      if (orientationRef.current !== 'compass') setOrientation('compass')
      frameCompass(user, place, road)
      startCompassLoop()
      return
    }
    if (towardsDestination) {
      setOrientation('free')
      frameRoute(user, place, road, bearingTowards(user.coordinates, place.coordinates))
      return
    }
    frameRoute(user, place, road, map.getBearing(), 900)
  }, [frameCompass, frameRoute, setOrientation, startCompassLoop])

  /** Cone de direção do visitante (gira junto com o mapa). */
  const updateHeadingCone = useCallback(() => {
    const map = mapRef.current
    const active = routeRef.current
    const heading = headingRef.current
    if (!map || !active || !heading || active.user.source !== 'gps') {
      coneMarkerRef.current?.remove()
      coneMarkerRef.current = null
      return
    }
    if (!coneMarkerRef.current) {
      const element = document.createElement('div')
      element.className = 'atlas-user-cone'
      element.setAttribute('aria-hidden', 'true')
      coneMarkerRef.current = new maplibregl.Marker({
        element,
        anchor: 'center',
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      }).setLngLat(active.user.coordinates).addTo(map)
    }
    coneMarkerRef.current.setLngLat(active.user.coordinates).setRotation(heading.deg)
  }, [])

  /** Círculo de precisão do GPS, para deixar claro o quanto a posição é exata. */
  const updateAccuracy = useCallback((user: UserLocation | null) => {
    const map = mapRef.current
    if (!map || !styleReadyRef.current) return
    const show = Boolean(user && user.source === 'gps' && (user.accuracy ?? 0) > 6)
    const data = {
      type: 'FeatureCollection' as const,
      features: show && user
        ? [{
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'Polygon' as const,
              coordinates: [circlePolygon(user.coordinates, Math.min(user.accuracy ?? 0, 25_000))],
            },
          }]
        : [],
    } as GeoJsonData
    const source = map.getSource('user-accuracy') as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData(data)
      return
    }
    if (!show) return
    map.addSource('user-accuracy', { type: 'geojson', data })
    const before = map.getLayer('user-route-glow')
      ? 'user-route-glow'
      : map.getLayer('label_state') ? 'label_state' : undefined
    map.addLayer({
      id: 'user-accuracy-fill',
      type: 'fill',
      source: 'user-accuracy',
      paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.13 },
    }, before)
    map.addLayer({
      id: 'user-accuracy-line',
      type: 'line',
      source: 'user-accuracy',
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.5, 'line-width': 1.2 },
    }, before)
  }, [])

  const clearAccuracy = useCallback(() => {
    const map = mapRef.current
    if (!map || !styleReadyRef.current) return
    if (map.getLayer('user-accuracy-line')) map.removeLayer('user-accuracy-line')
    if (map.getLayer('user-accuracy-fill')) map.removeLayer('user-accuracy-fill')
    if (map.getSource('user-accuracy')) map.removeSource('user-accuracy')
  }, [])

  /** Nova direção (bússola do aparelho ou rumo do GPS em movimento). */
  const receiveHeading = useCallback((deg: number, source: HeadingReading['source']) => {
    const now = performance.now()
    const previous = headingRef.current
    // A bússola do aparelho tem prioridade; o rumo do GPS só entra sem ela.
    if (source === 'gps' && previous?.source === 'device' && now - previous.at < 2500) return
    headingRef.current = { deg, at: now, source }
    if (source === 'device' && !compassAvailableRef.current) {
      compassAvailableRef.current = true
      setCompassAvailable(true)
    }
    updateHeadingCone()
    const active = routeRef.current
    if (!active?.road) return
    if (orientationRef.current === 'compass') startCompassLoop()
    else if (!userChoseNorthRef.current) enableCompassMode()
  }, [enableCompassMode, startCompassLoop, updateHeadingCone])

  /** Liga a bússola (no iPhone, precisa partir de um toque do usuário). */
  const ensureCompass = useCallback(() => {
    if (stopCompassRef.current) return
    const session = sessionRef.current
    void requestCompassPermission().then((permission) => {
      if (permission !== 'granted' || session !== sessionRef.current || stopCompassRef.current) return
      stopCompassRef.current = watchCompass((heading) => receiveHeading(heading, 'device'))
    })
  }, [receiveHeading])

  const handleCompassButton = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    if (orientationRef.current === 'compass') {
      userChoseNorthRef.current = true
      setOrientation('north')
      map.easeTo({ bearing: 0, duration: prefersReducedMotion() ? 0 : 450 })
      return
    }
    if (routeRef.current && headingRef.current) {
      enableCompassMode()
      return
    }
    if (routeRef.current && !compassAvailableRef.current) ensureCompass()
    setOrientation('north')
    map.easeTo({ bearing: 0, duration: prefersReducedMotion() ? 0 : 450 })
  }, [enableCompassMode, ensureCompass, setOrientation])

  /** Uma requisição por deslocamento relevante, abortável quando o destino muda. */
  const requestRoadRoute = useCallback(async () => {
    rerouteTimerRef.current = null
    const current = routeRef.current
    if (!current) return

    roadRequestRef.current?.abort()
    const controller = new AbortController()
    roadRequestRef.current = controller
    const request = ++requestRef.current
    const session = sessionRef.current
    const from: [number, number] = [...current.user.coordinates]
    const destination = current.place
    lastRequestAtRef.current = Date.now()
    lastRequestedPositionRef.current = from
    publishRoute({ ...current, status: current.road ? 'updating' : 'loading', error: undefined })

    try {
      const road = await fetchRoadRoute(from, destination.coordinates, controller.signal)
      const latest = routeRef.current
      if (
        controller.signal.aborted || request !== requestRef.current ||
        session !== sessionRef.current || !latest || latest.place.id !== destination.id
      ) return

      const firstRoute = !latest.road
      publishRoute({ ...latest, road, status: 'ready', error: undefined })
      showRoadRoute(road)
      if (firstRoute) frameForMode(latest.user, latest.place, road, true)
    } catch (error) {
      const latest = routeRef.current
      if (
        controller.signal.aborted || request !== requestRef.current ||
        session !== sessionRef.current || !latest || latest.place.id !== destination.id
      ) return

      const reason = error instanceof RoutingError ? error.kind : 'unavailable'
      const errorText = reason === 'no-route'
        ? 'Não encontramos um trajeto pelas vias entre esses pontos.'
        : reason === 'timeout'
          ? 'O serviço de rotas demorou a responder.'
          : 'Não foi possível calcular o trajeto pelas vias agora.'
      // Um trajeto antigo não deve parecer válido para a posição atual.
      clearRoadRoute()
      publishRoute({ ...latest, road: null, status: 'error', error: errorText })
    } finally {
      if (roadRequestRef.current === controller) roadRequestRef.current = null
    }
  }, [clearRoadRoute, frameForMode, publishRoute, showRoadRoute])

  /** Intervalo generoso no GPS contínuo: evita pedir rota a cada pequeno ajuste. */
  const scheduleRoadRoute = useCallback((force = false) => {
    const current = routeRef.current
    if (!current) return
    const lastPosition = lastRequestedPositionRef.current
    if (
      !force && lastPosition &&
      distanceKm(lastPosition, current.user.coordinates) < REROUTE_DISTANCE_KM
    ) return

    if (rerouteTimerRef.current !== null) {
      if (!force) return
      window.clearTimeout(rerouteTimerRef.current)
    }

    const interval = force ? NEW_DESTINATION_INTERVAL_MS : REROUTE_INTERVAL_MS
    const wait = Math.max(0, lastRequestAtRef.current + interval - Date.now())
    rerouteTimerRef.current = window.setTimeout(() => void requestRoadRoute(), wait)
    if (current.road && current.status !== 'updating') {
      publishRoute({ ...current, status: 'updating' })
    }
  }, [publishRoute, requestRoadRoute])

  /**
   * Posição ao vivo. No modo automático o destino troca se outra unidade ficar
   * mais perto; com um destino escolhido pelo visitante, ele é mantido.
   */
  const receiveLocation = useCallback((user: UserLocation) => {
    if (!insideBrazil(user.coordinates)) {
      setLocating(false)
      setMessage('A rota está disponível para localizações no Brasil.')
      return
    }
    setLocating(false)
    setMessage(null)
    const nearest = nearestOffice(user.coordinates)
    if (!nearest) return
    const chosen = chosenRef.current
    const target = chosen ?? nearest.place

    const previous = routeRef.current
    const changed = previous?.place.id !== target.id
    const sourceChanged = Boolean(previous && previous.user.source !== user.source)

    // Chegada ao escritório: só conta com GPS preciso (ver lib/arrival.ts).
    const arrivalState = evaluateArrival(arrivalRef.current, user, target, changed)
    if (changed) setArrival((current) => (current && current.place.id !== target.id ? null : current))
    if (arrivalState.justArrived) {
      setArrival({ place: target, alreadyThere: changed })
      playArrivalSound()
      try {
        navigator.vibrate?.([180, 90, 180])
      } catch {
        /* vibração indisponível: o aviso na tela basta */
      }
    }

    if ((changed || sourceChanged) && previous) {
      roadRequestRef.current?.abort()
      requestRef.current++
      if (rerouteTimerRef.current !== null) window.clearTimeout(rerouteTimerRef.current)
      rerouteTimerRef.current = null
      lastRequestedPositionRef.current = null
      clearRoadRoute()
    }

    publishRoute({
      user,
      place: target,
      chosen: Boolean(chosen),
      road: changed || sourceChanged ? null : previous?.road ?? null,
      status: changed || sourceChanged ? 'loading' : previous?.status ?? 'loading',
      error: changed || sourceChanged ? undefined : previous?.error,
      staleLocation: false,
      arrived: arrivalState.arrived,
    })
    containerRef.current?.classList.add('is-route')
    showUserMarker(user)
    updateAccuracy(user)
    if (user.source === 'gps') setGpsIssue(null)
    if (user.heading !== undefined) receiveHeading(user.heading, 'gps')
    else updateHeadingCone()
    if (openIdRef.current !== target.id) selectPlace(target)

    const map = mapRef.current
    if (map) {
      if (changed) {
        // Novo destino (ou primeira posição): mostra os dois pontos, já virado para ele.
        frameForMode(user, target, null, true)
      } else if (orientationRef.current === 'compass') {
        // Bússola: o visitante volta suavemente ao centro se andou para longe dele.
        const point = map.project(user.coordinates)
        const { anchor, width, height } = compassFrame(map)
        const offscreen = point.x < 0 || point.y < 0 || point.x > width || point.y > height
        if (!offscreen && Math.hypot(point.x - anchor[0], point.y - anchor[1]) > 48) {
          recenterRef.current = true
        }
      } else {
        const point = map.project(user.coordinates)
        const container = map.getContainer()
        const padding = routePadding(map)
        const outside =
          point.x < 18 || point.x > container.clientWidth - 18 ||
          point.y < padding.top - 12 || point.y > container.clientHeight - 40
        // A posição muda imediatamente; só reenquadra se sair da área visível.
        if (outside && Date.now() - lastAutoFitAtRef.current > 5000) {
          frameForMode(user, target, sourceChanged ? null : previous?.road ?? null, false)
        }
      }
    }
    // Já no destino não há trajeto a recalcular.
    if (!arrivalState.arrived) scheduleRoadRoute(changed || sourceChanged)
  }, [
    clearRoadRoute,
    compassFrame,
    frameForMode,
    publishRoute,
    receiveHeading,
    routePadding,
    scheduleRoadRoute,
    selectPlace,
    showUserMarker,
    updateAccuracy,
    updateHeadingCone,
  ])

  /** Alternativa aproximada quando GPS não é permitido ou perde sinal. */
  const startIpFallback = useCallback(async (session: number, reason: GpsFailure) => {
    if (session !== sessionRef.current) return
    setGpsIssue(reason)
    if (ipRequestRef.current) return
    const current = routeRef.current
    if (current?.user.source === 'gps') {
      publishRoute({ ...current, staleLocation: true })
    }
    const controller = new AbortController()
    ipRequestRef.current = controller
    const result = await locateByIp(controller.signal)
    if (ipRequestRef.current === controller) ipRequestRef.current = null
    if (controller.signal.aborted || session !== sessionRef.current) return

    if (result.status === 'ok') {
      receiveLocation(result.location)
    } else if (routeRef.current) {
      // Não finge tempo real se a localização parou de atualizar.
      setMessage('Sinal GPS indisponível. Exibindo a última localização conhecida.')
    } else {
      setLocating(false)
      setMessage(result.status === 'outside'
        ? 'Sua localização por IP está fora da área do Brasil.'
        : `${GPS_ISSUE_TEXT[reason]} A região aproximada pelo IP também não respondeu.`)
    }
  }, [publishRoute, receiveLocation])

  /** Encerra o acompanhamento e devolve opacidade e enquadramento originais. */
  const stopTracking = useCallback((goHome = true) => {
    sessionRef.current++
    stopGpsRef.current?.()
    stopGpsRef.current = null
    ipRequestRef.current?.abort()
    ipRequestRef.current = null
    roadRequestRef.current?.abort()
    roadRequestRef.current = null
    requestRef.current++
    if (rerouteTimerRef.current !== null) window.clearTimeout(rerouteTimerRef.current)
    rerouteTimerRef.current = null
    lastRequestedPositionRef.current = null
    userMarkerRef.current?.remove()
    userMarkerRef.current = null
    coneMarkerRef.current?.remove()
    coneMarkerRef.current = null
    stopCompassRef.current?.()
    stopCompassRef.current = null
    headingRef.current = null
    compassAvailableRef.current = false
    setCompassAvailable(false)
    userChoseNorthRef.current = false
    recenterRef.current = false
    chosenRef.current = null
    setChosenId(null)
    resetArrivalTracker(arrivalRef.current)
    setArrival(null)
    setGpsIssue(null)
    clearRoadRoute()
    clearAccuracy()
    containerRef.current?.classList.remove('is-route')
    publishRoute(null)
    setLocating(false)
    setMessage(null)
    closeCard()
    setOrientation('north')
    if (goHome) flyToOverview()
  }, [clearAccuracy, clearRoadRoute, closeCard, flyToOverview, publishRoute, setOrientation])

  /** Liga o GPS (e a bússola) para a rota até `destination` — ou até a mais próxima. */
  const startTracking = useCallback((destination: Place | null) => {
    // Recomeça limpo se uma tentativa anterior ficou sem GPS e sem IP.
    if (stopGpsRef.current) stopTracking(false)
    chosenRef.current = destination
    setChosenId(destination?.id ?? null)
    const session = ++sessionRef.current
    setLocating(true)
    setMessage(null)
    // Pedidos feitos dentro do mesmo toque (exigência do Safari no iPhone):
    // permissão da bússola e destravamento do áudio para o aviso de chegada.
    ensureCompass()
    prepareArrivalSound()
    stopGpsRef.current = watchUserLocation(
      (user) => {
        if (session !== sessionRef.current) return
        ipRequestRef.current?.abort()
        ipRequestRef.current = null
        receiveLocation(user)
      },
      (reason) => { void startIpFallback(session, reason) },
    )
  }, [ensureCompass, receiveLocation, setLocating, startIpFallback, stopTracking])

  /**
   * Rota até a unidade que o visitante escolher. Com `null`, volta ao modo
   * automático (unidade mais próxima). Em modo rota, só troca o destino:
   * GPS, bússola e posição atual continuam valendo.
   */
  const chooseDestination = useCallback((place: Place | null) => {
    prepareArrivalSound()
    const active = routeRef.current
    if (active) {
      chosenRef.current = place
      setChosenId(place?.id ?? null)
      receiveLocation(active.user)
      return
    }
    if (locatingRef.current) {
      // Aguardando a primeira posição: ela já chega valendo para este destino.
      chosenRef.current = place
      setChosenId(place?.id ?? null)
    } else {
      startTracking(place)
    }
    if (place && openIdRef.current !== place.id) selectPlace(place)
  }, [receiveLocation, selectPlace, startTracking])

  /** Botão "escritório mais próximo": liga o modo rota automático ou sai dele. */
  const findNearestOffice = useCallback(() => {
    if (locatingRef.current || routeRef.current) {
      stopTracking()
      return
    }
    startTracking(null)
  }, [startTracking, stopTracking])

  const focusPlace = useCallback((place: Place) => {
    const active = routeRef.current
    if (active) {
      // Em modo rota, escolher outra unidade troca o destino.
      if (active.place.id !== place.id) chooseDestination(place)
      else frameForMode(active.user, active.place, active.road, true)
      return
    }
    const wasTracking = Boolean(stopGpsRef.current)
    if (wasTracking) stopTracking(false)
    if (openIdRef.current !== place.id) selectPlace(place)
    flyToOffice(place, wasTracking)
  }, [chooseDestination, flyToOffice, frameForMode, selectPlace, stopTracking])

  const setPageColor = useCallback((color: string) => {
    const map = mapRef.current
    if (map && styleReadyRef.current) updatePageColor(map, color)
  }, [])

  useImperativeHandle(
    ref,
    () => ({ focus: focusPlace, routeTo: chooseDestination, setPageColor }),
    [chooseDestination, focusPlace, setPageColor],
  )

  // Informa a lista de unidades qual é o destino da rota (ativa ou aguardando o GPS).
  const routeTargetId = route?.place.id ?? (locating ? chosenId : null)
  useEffect(() => {
    onRouteChangeRef.current?.(routeTargetId)
  }, [routeTargetId])

  // O cartão acompanha a coordenada geográfica; os marcadores não se deslocam.
  const sync = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    const openPlace = PLACES.find((place) => place.id === openIdRef.current)
    if (!openPlace) return

    const projected = map.project(openPlace.coordinates)
    const pointX = projected.x
    const pointY = projected.y

    const container = containerRef.current
    const stageWidth = container?.clientWidth ?? 0
    const stageHeight = container?.clientHeight ?? 0
    const card = cardRef.current
    const cardWidth = card?.offsetWidth ?? 296
    const cardHeight = card?.offsetHeight ?? 290
    const gap = 20

    let top = pointY - gap - cardHeight
    let flip = false
    if (top < 18) {
      top = pointY + gap
      flip = true
    }
    top = Math.min(Math.max(top, 18), Math.max(18, stageHeight - cardHeight - 18))

    const left = Math.min(
      Math.max(18, pointX - cardWidth / 2),
      Math.max(18, stageWidth - cardWidth - 18),
    )
    const caret = Math.min(
      Math.max(cardWidth * 0.14, pointX - left),
      cardWidth * 0.86,
    )

    setAnchor((previous) =>
      previous.left === left &&
      previous.top === top &&
      previous.caret === caret &&
      previous.flip === flip
        ? previous
        : { left, top, caret, flip },
    )
  }, [])

  const scheduleSync = useCallback(() => {
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      sync()
    })
  }, [sync])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Visão inicial e mais afastada: Brasil inteiro, centralizado no painel 4:5.
    const initial = brazilOverview(container.clientWidth, container.clientHeight)
    overviewRef.current = initial

    const map = new maplibregl.Map({
      container,
      style: BASEMAP_STYLE_URL,
      center: initial.center,
      zoom: initial.zoom,
      minZoom: initial.zoom,
      maxZoom: MAX_ZOOM,
      maxBounds: initial.bounds,
      attributionControl: false,
      // Computador: girar com o botão direito (ou Ctrl + arrastar). Inclinação desligada.
      dragRotate: true,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      renderWorldCopies: false,
      fadeDuration: 120,
      // Roda do mouse aplica zoom só com o cursor sobre o mapa; no celular, pinça.
      cooperativeGestures: false,
    })
    mapRef.current = map
    map.touchZoomRotate.disableRotation()
    // Somente para diagnóstico (?mapdebug na URL): expõe a instância do mapa.
    if (new URLSearchParams(window.location.search).has('mapdebug')) {
      ;(window as unknown as { __scMap?: MapLibreMap }).__scMap = map
      ;(window as unknown as { __scWorkers?: number }).__scWorkers = maplibregl.getWorkerCount()
    }

    /**
     * Recalcula o enquadramento do Brasil para o tamanho atual do painel.
     * O zoom mínimo e a trava de navegação passam a ser exatamente essa visão,
     * então afastar ao máximo sempre termina com o país centralizado.
     */
    const refreshOverview = () => {
      const previous = overviewRef.current
      const wasOverview = !previous || map.getZoom() <= previous.zoom + OVERVIEW_TOLERANCE
      const next = brazilOverview(container.clientWidth, container.clientHeight)
      overviewRef.current = next
      map.setMaxBounds(null)
      map.setMinZoom(next.zoom)
      if (wasOverview) map.jumpTo({ center: next.center, zoom: next.zoom, bearing: 0 })
      map.setMaxBounds(next.bounds)
    }

    /** Marcadores acompanham o zoom e os controles refletem zoom e rotação. */
    const syncZoomState = () => {
      const zoom = map.getZoom()
      const bearing = map.getBearing()
      const overview = overviewRef.current
      container.style.setProperty('--pin-scale', pinScaleForZoom(zoom).toFixed(3))
      // A agulha da bússola aponta sempre para o norte real.
      stageRef.current?.style.setProperty('--map-bearing', `${-bearing}deg`)
      const rotated = Math.abs(bearing) > 0.5
      const atOverview = (!overview || zoom <= overview.zoom + OVERVIEW_TOLERANCE) && !rotated
      const atMax = zoom >= MAX_ZOOM - 0.02
      const clustered = zoom < CLUSTER_ZOOM
      setView((previous) =>
        previous.atOverview === atOverview &&
        previous.atMax === atMax &&
        previous.clustered === clustered &&
        previous.rotated === rotated
          ? previous
          : { atOverview, atMax, clustered, rotated },
      )
    }

    map.on('style.load', () => {
      styleReadyRef.current = true
      applyBrazilStatesStyle(map)
      applyBrazilOnlyMask(map)
      // Em zoom de cidade, a costa detalhada dos tiles substitui a silhueta.
      applyDetailedCoastline(map)
      raiseLabelsAboveMask(map)
      if (routeRef.current?.road) showRoadRoute(routeRef.current.road)
      if (routeRef.current) updateAccuracy(routeRef.current.user)
    })

    const fallbackTimer = window.setTimeout(() => {
      if (!map.loaded()) {
        styleReadyRef.current = false
        map.setStyle(RASTER_FALLBACK)
      }
    }, 12000)
    map.on('load', () => window.clearTimeout(fallbackTimer))

    const markers: maplibregl.Marker[] = []
    PLACES.forEach((place, index) => {
      const host = document.createElement('div')
      host.className = 'atlas-marker-host'

      const pin = document.createElement('button')
      pin.type = 'button'
      pin.className = 'atlas-pin'
      pin.setAttribute('aria-label', `Abrir unidade da Super Connect em ${place.name}`)
      // Piscar defasado entre os pontos, para o agrupamento não pulsar em bloco.
      const delay = ((index * 0.37) % 2.4).toFixed(2)
      pin.innerHTML = `<span class="atlas-pin__dot" aria-hidden="true" style="animation-delay:-${delay}s"></span>`
      pin.addEventListener('click', (event) => {
        event.stopPropagation()
        if (routeRef.current) {
          // Em modo rota, tocar em outra unidade troca o destino. Com os pontos
          // sobrepostos (visão do país), o toque seria ambíguo: ignorado.
          if (map.getZoom() >= CLUSTER_ZOOM && place.id !== routeRef.current.place.id) {
            focusPlace(place)
          }
          return
        }
        // Aguardando o GPS para outra unidade: abrir esta cancela aquele pedido.
        if (locatingRef.current && chosenRef.current && chosenRef.current.id !== place.id) {
          stopTracking(false)
        }
        // Na visão do país os pontos se sobrepõem: primeiro aproxima a região.
        if (map.getZoom() < CLUSTER_ZOOM) {
          flyToRegion()
          return
        }
        selectPlace(place)
      })

      host.appendChild(pin)
      pinRefs.current.set(place.id, pin)

      const marker = new maplibregl.Marker({ element: host, anchor: 'center' })
        .setLngLat(place.coordinates)
        .addTo(map)
      markers.push(marker)
    })

    map.on('move', scheduleSync)
    // Visibilidade dos municípios: cálculo pesado, então limitado durante o movimento
    // (a bússola gira o mapa a cada quadro no celular).
    let cityTimer: number | null = null
    map.on('move', () => {
      if (cityTimer !== null) return
      cityTimer = window.setTimeout(() => {
        cityTimer = null
        updateCityVisibility(map)
      }, 160)
    })
    map.on('moveend', () => updateCityVisibility(map))
    map.on('zoom', syncZoomState)
    map.on('rotate', syncZoomState)

    // Gestos do usuário pausam a bússola; o mapa só volta a girar sozinho ao soltar.
    const startInteraction = (event: { originalEvent?: Event }) => {
      if (event.originalEvent) interactingRef.current = true
    }
    map.on('dragstart', startInteraction)
    map.on('zoomstart', startInteraction)
    map.on('rotatestart', (event: { originalEvent?: Event }) => {
      startInteraction(event)
      // Girar com o mouse substitui a direção automática.
      if (event.originalEvent && orientationRef.current !== 'compass') setOrientation('free')
    })
    map.on('moveend', () => {
      if (!map.isMoving()) interactingRef.current = false
    })
    // Afastou quase até o limite (roda, pinça ou duplo toque): centraliza o Brasil.
    map.on('moveend', () => {
      const overview = overviewRef.current
      if (!overview) return
      const zoom = map.getZoom()
      if (!routeRef.current && zoom > overview.zoom + 1e-6 && zoom <= overview.zoom + OVERVIEW_SNAP) {
        setOrientation('north')
        map.easeTo({
          center: overview.center,
          zoom: overview.zoom,
          bearing: 0,
          duration: prefersReducedMotion() ? 0 : 240,
        })
      }
    })
    map.on('resize', () => {
      refreshOverview()
      syncZoomState()
      scheduleSync()
    })
    map.on('click', () => { if (!routeRef.current) closeCard() })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (routeRef.current) stopTracking()
        else closeCard()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    syncZoomState()
    scheduleSync()

    return () => {
      window.clearTimeout(fallbackTimer)
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
      stopGpsRef.current?.()
      stopGpsRef.current = null
      stopCompassRef.current?.()
      stopCompassRef.current = null
      if (compassFrameRef.current !== null) window.cancelAnimationFrame(compassFrameRef.current)
      compassFrameRef.current = null
      if (cityTimer !== null) window.clearTimeout(cityTimer)
      coneMarkerRef.current?.remove()
      coneMarkerRef.current = null
      styleReadyRef.current = false
      ipRequestRef.current?.abort()
      roadRequestRef.current?.abort()
      if (rerouteTimerRef.current !== null) window.clearTimeout(rerouteTimerRef.current)
      sessionRef.current++
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      window.removeEventListener('keydown', handleKeyDown)
      markers.forEach((marker) => marker.remove())
      pinRefs.current.clear()
      containerRef.current?.classList.remove('is-route')
      map.remove()
      mapRef.current = null
    }
  }, [
    closeCard,
    flyToRegion,
    focusPlace,
    scheduleSync,
    selectPlace,
    setOrientation,
    showRoadRoute,
    stopTracking,
    updateAccuracy,
  ])

  useLayoutEffect(() => {
    if (!openId) return
    sync()
    const card = cardRef.current
    const observer =
      card && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => sync()) : null
    observer?.observe(card as Element)
    return () => {
      observer?.disconnect()
    }
  }, [openId, sync])

  const openPlace = openId ? (PLACES.find((place) => place.id === openId) ?? null) : null

  return (
    <div ref={stageRef} className={`atlas-stage${route ? ' is-route-active' : ''}`}>
      <div ref={containerRef} className="atlas-map" />

      {/* Atalho para a região atendida (aparece enquanto o país está em vista). */}
      <button
        type="button"
        className={`atlas-region-btn${view.clustered && !route ? '' : ' is-hidden'}`}
        onClick={flyToRegion}
        tabIndex={view.clustered && !route ? 0 : -1}
        aria-hidden={!(view.clustered && !route)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
        </svg>
        Ver região atendida
      </button>

      {/* Escritório mais próximo: usa GPS ou, na falta dele, a região do IP. */}
      <button
        type="button"
        className={`atlas-nearest-btn${route ? ' is-active' : ''}`}
        onClick={findNearestOffice}
        aria-pressed={Boolean(route) || locating}
        title="Sua posição será usada para encontrar uma rota pelas vias. Sem GPS, usamos a região aproximada do IP."
      >
        {locating ? (
          <>
            <span className="atlas-nearest-spinner" aria-hidden="true" />
            {route ? 'Sair do modo rota' : 'Cancelar localização'}
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.6" />
            </svg>
            {route ? 'Sair do modo rota' : 'Escritório mais próximo'}
          </>
        )}
      </button>

      {/* Aviso quando não há como determinar a localização. */}
      {message && !route && (
        <p className="atlas-nearest-message" role="status">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)} aria-label="Fechar aviso">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </button>
        </p>
      )}

      {route && (
        <div className="atlas-route-panel">
          <span className="atlas-route-panel__label">
            {route.arrived
              ? 'Você chegou ao destino'
              : route.chosen ? 'Destino escolhido' : 'Escritório mais próximo'}
          </span>
          {/* Destino da rota: qualquer unidade pode ser escolhida aqui. */}
          <label className="atlas-route-panel__destination">
            <select
              aria-label="Destino da rota"
              value={route.place.id}
              onChange={(event) => {
                const value = event.target.value
                if (value === NEAREST_OPTION) {
                  chooseDestination(null)
                  return
                }
                const place = PLACES.find((item) => item.id === value)
                if (place) chooseDestination(place)
              }}
            >
              {route.chosen && <option value={NEAREST_OPTION}>↺ Mais próximo de você</option>}
              {DESTINATION_GROUPS.map((group) => (
                <optgroup key={group.uf} label={group.label}>
                  {group.places.map((place) => (
                    <option key={place.id} value={place.id}>{place.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </label>
          <p className="atlas-route-panel__details" role="status" aria-live="polite">
            {route.arrived ? (
              'Você está na unidade'
            ) : route.road ? (
              <>
                {formatDistance(route.road.distanceMeters)} ·{' '}
                {formatDuration(route.road.durationSeconds)} estimados
              </>
            ) : route.status === 'error' ? (
              'Rota não disponível no momento'
            ) : (
              'Calculando trajeto pelas ruas…'
            )}
          </p>
          <p className="atlas-route-panel__source">
            {route.staleLocation
              ? 'GPS indisponível · última posição conhecida'
              : route.user.source === 'gps'
                ? `GPS ao vivo · precisão ${formatAccuracy(route.user.accuracy ?? 0)}${
                    (route.user.accuracy ?? 0) > 150 ? ' · refinando…' : ''
                  }`
                : 'Região aproximada por IP · sem rastreio ao vivo'}
          </p>
          {route.user.source === 'ip' && gpsIssue && (
            <p className="atlas-route-panel__gps">{GPS_ISSUE_TEXT[gpsIssue]}</p>
          )}
          {orientation === 'compass' ? (
            <p className="atlas-route-panel__orientation">
              {headingRef.current?.source === 'gps'
                ? 'Mapa girando conforme seu deslocamento'
                : 'Mapa girando conforme a direção do celular'}
            </p>
          ) : (
            <p className="atlas-route-panel__hint">
              Botão direito do mouse + arrastar para girar o mapa
            </p>
          )}
          {route.status === 'updating' && !route.arrived && (
            <p className="atlas-route-panel__note">Atualizando trajeto…</p>
          )}
          {route.error && (
            <p className="atlas-route-panel__error" role="alert">{route.error}</p>
          )}
          <div className="atlas-route-panel__actions">
            {route.status === 'error' && (
              <button type="button" onClick={() => scheduleRoadRoute(true)}>
                Tentar novamente
              </button>
            )}
            <a
              href={directionsUrl(route.user.coordinates, route.place.coordinates)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir navegação ↗
            </a>
          </div>
          {/* Orientação discreta: só aparece se o visitante abrir os detalhes. */}
          <details className="atlas-route-panel__details-box">
            <summary>Mais detalhes</summary>
            <dl>
              <dt>Endereço completo</dt>
              <dd>{route.place.address}</dd>
              {route.place.reference && (
                <>
                  <dt>Referência</dt>
                  <dd>{route.place.reference}</dd>
                </>
              )}
              <dt>Como chegar</dt>
              <dd>
                {route.road
                  ? `Trajeto pelas vias com ${formatDistance(route.road.distanceMeters)}, cerca de ${formatDuration(route.road.durationSeconds)} de carro. Acompanhe o mapa: o ponto claro é você e o amarelo é a unidade.`
                  : 'O trajeto aparece no mapa assim que a rota é calculada.'}
                {route.user.source === 'ip' &&
                  ' A localização por IP é aproximada: ative o GPS do celular para a posição exata.'}
                {' '}Use <strong>Abrir navegação</strong> para seguir com o Google Maps.
              </dd>
            </dl>
          </details>
        </div>
      )}

      {/* Controles próprios: zoom e retorno à visão do Brasil inteiro. */}
      <div className="atlas-controls" role="group" aria-label="Controles do mapa">
        {/* Bússola: mostra o norte; no celular liga/desliga o giro pela direção do aparelho. */}
        <button
          type="button"
          className={`atlas-ctrl atlas-ctrl--compass${orientation === 'compass' ? ' is-active' : ''}`}
          onClick={handleCompassButton}
          disabled={!view.rotated && !(route && (compassAvailable || orientation === 'compass'))}
          aria-pressed={orientation === 'compass'}
          aria-label={
            orientation === 'compass'
              ? 'Parar de girar com o celular e voltar o norte para cima'
              : route && compassAvailable
                ? 'Girar o mapa conforme a direção do celular'
                : 'Voltar o norte para cima'
          }
          title={
            orientation === 'compass'
              ? 'Voltar o norte para cima'
              : route && compassAvailable
                ? 'Girar conforme a direção do celular'
                : 'Norte para cima · arraste com o botão direito do mouse para girar'
          }
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="atlas-compass-needle">
            <path className="atlas-compass-needle__north" d="M12 2 16.6 12H7.4Z" />
            <path className="atlas-compass-needle__south" d="M12 22 7.4 12h9.2Z" />
          </svg>
        </button>
        <button
          type="button"
          className="atlas-ctrl"
          onClick={() => zoomBy(1)}
          disabled={view.atMax}
          aria-label="Aproximar o mapa"
          title="Aproximar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          className="atlas-ctrl"
          onClick={() => zoomBy(-1)}
          disabled={view.atOverview}
          aria-label="Afastar o mapa"
          title="Afastar"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          className="atlas-ctrl"
          onClick={flyToOverview}
          disabled={view.atOverview}
          aria-label="Ver o Brasil inteiro e voltar o norte para cima"
          title="Ver o Brasil inteiro (zera a rotação)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
        </button>
      </div>

      <p className="atlas-credits">
        © <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a>
        <span aria-hidden="true"> · </span>
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>
      </p>

      {arrival && (
        <ArrivalToast
          place={arrival.place}
          alreadyThere={arrival.alreadyThere}
          onDismiss={() => setArrival(null)}
          onFinish={() => stopTracking()}
        />
      )}

      {openPlace && !route && (
        <div
          className="atlas-card-anchor"
          style={{ transform: `translate3d(${anchor.left}px, ${anchor.top}px, 0)` }}
        >
          <PlaceCard
            ref={cardRef}
            place={openPlace}
            closing={closing}
            caret={anchor.caret}
            flip={anchor.flip}
            onClose={closeCard}
            onRoute={() => chooseDestination(openPlace)}
            routeBusy={locating && chosenId === openPlace.id}
          />
        </div>
      )}
    </div>
  )
})

export default AtlasMap
