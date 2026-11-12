/**
 * Direção para onde o celular aponta (bússola), em graus a partir do norte,
 * no sentido horário — a mesma convenção do bearing do mapa.
 *
 *  - iPhone/iPad (Safari): evento `deviceorientation` com `webkitCompassHeading`;
 *    exige `DeviceOrientationEvent.requestPermission()` chamado num toque.
 *  - Android (Chrome, Samsung Internet, Edge): `deviceorientationabsolute`,
 *    com `alpha` medido a partir do norte magnético, em sentido anti-horário.
 *  - Firefox: `deviceorientation` com `absolute === true`.
 *
 * Computadores normalmente não têm bússola: nenhum evento válido chega e o
 * mapa continua sendo girado manualmente (botão direito do mouse).
 */

type IOSOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number
  webkitCompassAccuracy?: number
}

type PermissionCapableEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
}

export type CompassPermission = 'granted' | 'denied' | 'unsupported'

/**
 * Ângulo atual da tela em relação à posição natural do aparelho
 * (retrato = 0, paisagem = 90/270). A bússola mede a partir da borda superior
 * do aparelho; somando este ângulo, o mapa segue a borda superior da tela.
 */
function screenAngle(): number {
  const angle = window.screen?.orientation?.angle
  if (typeof angle === 'number') return angle
  return legacyOrientation() ?? 0
}

/** `window.orientation`: legado, mas sempre presente e correto no Safari do iPhone. */
function legacyOrientation(): number | null {
  const legacy = (window as unknown as { orientation?: number }).orientation
  return typeof legacy === 'number' ? legacy : null
}

function normalize(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/**
 * Pede permissão à bússola. No iPhone precisa ser chamado diretamente dentro
 * do evento de toque/clique do usuário; nos demais aparelhos resolve na hora.
 */
export async function requestCompassPermission(): Promise<CompassPermission> {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
    return 'unsupported'
  }
  const request = (DeviceOrientationEvent as PermissionCapableEvent).requestPermission
  if (typeof request !== 'function') return 'granted'
  try {
    return (await request.call(DeviceOrientationEvent)) === 'granted' ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}

/**
 * Escuta a bússola e chama `onHeading` a cada leitura válida.
 * Retorna a função que interrompe a escuta.
 */
export function watchCompass(onHeading: (heading: number) => void): () => void {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') {
    return () => {}
  }

  let absoluteSeen = false

  const fromAbsolute = (event: DeviceOrientationEvent) => {
    if (event.alpha == null || !Number.isFinite(event.alpha)) return
    absoluteSeen = true
    onHeading(normalize(360 - event.alpha + screenAngle()))
  }

  const fromRelative = (event: DeviceOrientationEvent) => {
    const ios = event as IOSOrientationEvent
    if (typeof ios.webkitCompassHeading === 'number' && Number.isFinite(ios.webkitCompassHeading)) {
      // Precisão negativa = bússola não calibrada; leitura descartada.
      if (typeof ios.webkitCompassAccuracy === 'number' && ios.webkitCompassAccuracy < 0) return
      onHeading(normalize(ios.webkitCompassHeading + (legacyOrientation() ?? screenAngle())))
      return
    }
    // Firefox entrega o norte real no evento comum quando `absolute` é verdadeiro.
    if (!absoluteSeen && event.absolute && event.alpha != null && Number.isFinite(event.alpha)) {
      onHeading(normalize(360 - event.alpha + screenAngle()))
    }
  }

  const absoluteEvent = 'ondeviceorientationabsolute' in window
  if (absoluteEvent) {
    window.addEventListener('deviceorientationabsolute', fromAbsolute as EventListener)
  }
  window.addEventListener('deviceorientation', fromRelative)

  return () => {
    if (absoluteEvent) {
      window.removeEventListener('deviceorientationabsolute', fromAbsolute as EventListener)
    }
    window.removeEventListener('deviceorientation', fromRelative)
  }
}
