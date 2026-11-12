import { distanceKm, type UserLocation } from './userLocation'

/**
 * Detecção de chegada ao escritório do destino.
 *
 * A posição do escritório é o endereço da unidade, e o GPS do celular erra
 * alguns metros, então "chegar" é estar a até 50 m dela, somando a margem de
 * erro informada pelo próprio GPS (no máximo mais 50 m). Para evitar avisos
 * falsos:
 *  - só vale GPS: a região do IP erra por quilômetros;
 *  - leituras com precisão pior que 150 m são ignoradas;
 *  - são necessárias duas leituras seguidas dentro do raio (basta uma se a
 *    precisão for de até 30 m);
 *  - depois de avisar, só avisa de novo se o visitante se afastar mais de 250 m.
 */

const BASE_RADIUS_M = 50
const MAX_ACCURACY_BONUS_M = 50
const MAX_USABLE_ACCURACY_M = 150
const PRECISE_ACCURACY_M = 30
const LEAVE_RADIUS_M = 250
const READINGS_NEEDED = 2

export type ArrivalTracker = {
  /** Destino que está sendo acompanhado. */
  destinationId: string | null
  /** Leituras consecutivas dentro do raio de chegada. */
  nearReadings: number
  /** O aviso de chegada deste destino já foi dado. */
  arrived: boolean
  /** Última leitura analisada (a mesma leitura não conta duas vezes). */
  lastFix: UserLocation | null
}

export function createArrivalTracker(): ArrivalTracker {
  return { destinationId: null, nearReadings: 0, arrived: false, lastFix: null }
}

export function resetArrivalTracker(tracker: ArrivalTracker): void {
  tracker.destinationId = null
  tracker.nearReadings = 0
  tracker.arrived = false
  tracker.lastFix = null
}

/** Raio de chegada para uma leitura de GPS com a precisão informada. */
export function arrivalRadiusMeters(accuracy: number | undefined): number {
  const bonus = Math.min(Math.max(accuracy ?? 0, 0), MAX_ACCURACY_BONUS_M)
  return BASE_RADIUS_M + bonus
}

export type ArrivalResult = {
  /** Visitante considerado no destino (inclui o período depois do aviso). */
  arrived: boolean
  /** Chegada confirmada exatamente nesta leitura: hora de avisar. */
  justArrived: boolean
  /** Distância em linha reta até o escritório, em metros. */
  meters: number
}

/**
 * Atualiza o acompanhamento com a posição mais recente.
 * `destinationChanged` zera a contagem quando a rota passa a ter outro destino.
 */
export function evaluateArrival(
  tracker: ArrivalTracker,
  user: UserLocation,
  destination: { id: string; coordinates: [number, number] },
  destinationChanged: boolean,
): ArrivalResult {
  const meters = distanceKm(user.coordinates, destination.coordinates) * 1000

  if (destinationChanged || tracker.destinationId !== destination.id) {
    tracker.destinationId = destination.id
    tracker.nearReadings = 0
    tracker.arrived = false
  }

  const repeated = tracker.lastFix === user && !destinationChanged
  tracker.lastFix = user

  // IP e leituras muito imprecisas não servem para afirmar que chegou.
  const accuracy = user.accuracy ?? Number.POSITIVE_INFINITY
  const reliable = user.source === 'gps' && accuracy <= MAX_USABLE_ACCURACY_M
  if (!reliable) {
    if (user.source === 'ip') tracker.nearReadings = 0
    return { arrived: tracker.arrived, justArrived: false, meters }
  }

  if (tracker.arrived) {
    if (meters > LEAVE_RADIUS_M) {
      tracker.arrived = false
      tracker.nearReadings = 0
    }
    return { arrived: tracker.arrived, justArrived: false, meters }
  }

  if (!repeated) {
    tracker.nearReadings = meters <= arrivalRadiusMeters(accuracy) ? tracker.nearReadings + 1 : 0
  }

  const confirmed =
    tracker.nearReadings >= READINGS_NEEDED ||
    (tracker.nearReadings >= 1 && accuracy <= PRECISE_ACCURACY_M)
  if (confirmed) {
    tracker.arrived = true
    return { arrived: true, justArrived: true, meters }
  }
  return { arrived: false, justArrived: false, meters }
}
