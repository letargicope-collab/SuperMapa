import type { Place } from '../data/places'

/** Nome da região/bairro exibido no menu (CIDADE — BAIRRO). */
export function districtOf(place: Place): string {
  if (place.district) return place.district

  const tail = place.address.split(' — ')[1] ?? ''
  const neighborhood = tail.split(',')[0].trim()
  if (!neighborhood || neighborhood.toLowerCase() === place.city.toLowerCase()) {
    return 'Centro'
  }
  return neighborhood.replace(/^Bairro\s+/i, '').replace(/^Povoado\s+/i, '')
}

/** Rótulo padronizado: cidade — bairro; a sede/matriz mantém sua identificação. */
export function placeLabel(place: Place): string {
  if (place.isHeadquarters) return place.name
  return `${place.city} — ${districtOf(place)}`
}

/** Matriz primeiro; demais unidades em ordem alfabética pelo rótulo exibido. */
export function comparePlaces(a: Place, b: Place): number {
  if (Boolean(a.isHeadquarters) !== Boolean(b.isHeadquarters)) {
    return a.isHeadquarters ? -1 : 1
  }
  return (
    placeLabel(a).localeCompare(placeLabel(b), 'pt-BR') ||
    a.id.localeCompare(b.id)
  )
}
