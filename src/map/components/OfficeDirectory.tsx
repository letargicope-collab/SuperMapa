import { useEffect, useMemo, useRef, useState } from 'react'
import type { Place } from '../data/places'

type OfficeDirectoryProps = {
  places: Place[]
  activeId: string | null
  /** Unidade de destino da rota em andamento (ou aguardando a localização). */
  routeId: string | null
  onSelect: (place: Place) => void
  /** Traça a rota do visitante até a unidade. */
  onRoute: (place: Place) => void
}

type Uf = Place['uf']

const STATE_ORDER: Uf[] = ['AL', 'SE', 'PE']

const STATE_LABEL: Record<Uf, string> = {
  AL: 'Alagoas',
  SE: 'Sergipe',
  PE: 'Pernambuco',
}

/**
 * Nome exibido no formato "Cidade — Bairro". Só a Sede/Matriz recebe a etiqueta
 * ao lado; o restante mostra o nome completo, para o município ficar explícito.
 */
function displayName(place: Place): { label: string; flag: string | null } {
  const match = /\s+—\s+(Sede\/Matriz)\s*$/.exec(place.name)
  if (!match) return { label: place.name, flag: null }
  return { label: place.name.slice(0, match.index), flag: 'sede/matriz' }
}

/** Rua/logradouro sem a repetição de cidade e UF no fim do endereço. */
function streetOf(place: Place): string {
  return place.address.split(' — ')[0].trim()
}

/**
 * Marca Super Connect: o círculo permanece aceso e as três ondas acendem uma
 * de cada vez (interna → do meio → externa). Então apagam e o ciclo recomeça.
 *
 * Os três arcos são concêntricos em (16, 25.4), com a mesma abertura de 90°
 * (±45°) e raios 8.6 / 13.6 / 18.6 — espaçamento radial igual entre eles.
 * Assim o símbolo fica simétrico nos dois eixos dentro do viewBox de 32.
 * A animação está em atlas.css.
 */
const SIGNAL_ARCS = [
  { modifier: 'inner', d: 'M9.92 19.32a8.6 8.6 0 0 1 12.16 0' },
  { modifier: 'middle', d: 'M6.38 15.78a13.6 13.6 0 0 1 19.23 0' },
  { modifier: 'outer', d: 'M2.85 12.25a18.6 18.6 0 0 1 26.3 0' },
] as const

function SignalMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className="directory__mark">
      <circle className="signal-dot" cx="16" cy="23" r="3.2" fill="#dff900" />
      {SIGNAL_ARCS.map((arc) => (
        <path
          key={arc.modifier}
          className={`signal-arc signal-arc--${arc.modifier}`}
          d={arc.d}
          fill="none"
          stroke="#dff900"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      ))}
    </svg>
  )
}

export default function OfficeDirectory({
  places,
  activeId,
  routeId,
  onSelect,
  onRoute,
}: OfficeDirectoryProps) {
  const groups = useMemo(() => {
    return STATE_ORDER.map((uf) => {
      const items = places
        .filter((place) => place.uf === uf)
        .sort((a, b) => {
          if (Boolean(a.isHeadquarters) !== Boolean(b.isHeadquarters)) {
            return a.isHeadquarters ? -1 : 1
          }
          return a.name.localeCompare(b.name, 'pt-BR')
        })
      return { uf, label: STATE_LABEL[uf], items }
    }).filter((group) => group.items.length > 0)
  }, [places])

  const cityCount = useMemo(() => new Set(places.map((place) => place.city)).size, [places])

  /** Estados recolhidos. Cada categoria abre e fecha sem afetar as demais. */
  const [closedGroups, setClosedGroups] = useState<Partial<Record<Uf, boolean>>>({})
  const [trackedId, setTrackedId] = useState<string | null>(activeId)

  const activeUf = places.find((place) => place.id === activeId)?.uf ?? null

  // Escolheu uma cidade pelo mapa: abre o estado dela, caso esteja recolhido.
  // Feito durante a renderização, para a linha já estar visível ao rolar a lista.
  if (activeId !== trackedId) {
    setTrackedId(activeId)
    if (activeUf && closedGroups[activeUf]) {
      setClosedGroups({ ...closedGroups, [activeUf]: false })
    }
  }

  const toggleGroup = (uf: Uf) => {
    setClosedGroups((previous) => ({ ...previous, [uf]: !previous[uf] }))
  }

  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Escolheu pelo mapa: traz a linha correspondente para a área visível da lista.
  useEffect(() => {
    if (!activeId) return
    const scroller = scrollRef.current
    const row = scroller?.querySelector<HTMLElement>('.directory__row.is-active')
    if (!scroller || !row) return

    const headHeight =
      scroller.querySelector<HTMLElement>('.directory__group-head')?.offsetHeight ?? 0
    const top = row.offsetTop - headHeight - 8
    const bottom = row.offsetTop + row.offsetHeight + 8
    if (top < scroller.scrollTop) {
      scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    } else if (bottom > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTo({ top: bottom - scroller.clientHeight, behavior: 'smooth' })
    }
  }, [activeId])

  let rowIndex = 0

  return (
    <aside className="directory" aria-label="Lista de unidades da Super Connect">
      <header className="directory__head">
        <div className="directory__brand">
          <SignalMark />
          <div>
            <p className="directory__brand-name">Super Connect</p>
            <p className="directory__brand-sub">Cobertura · Nordeste</p>
          </div>
        </div>
        <h2 className="directory__title">Nossas unidades</h2>
        <p className="directory__meta">
          <span className="directory__count">{places.length}</span> unidades
          <span aria-hidden="true"> · </span>
          {cityCount} cidades
          <span aria-hidden="true"> · </span>
          {groups.length} estados
        </p>
      </header>

      <div className="directory__scroll" ref={scrollRef}>
        {groups.map((group) => {
          const isClosed = Boolean(closedGroups[group.uf])
          const panelId = `directory-panel-${group.uf}`

          return (
            <section className="directory__group" key={group.uf}>
              <h2 className="directory__group-head">
                <button
                  type="button"
                  className="directory__group-toggle"
                  aria-expanded={!isClosed}
                  aria-controls={panelId}
                  onClick={() => toggleGroup(group.uf)}
                >
                  <span className="directory__uf">{group.uf}</span>
                  <span className="directory__group-name">{group.label}</span>
                  <span className="directory__group-count">{group.items.length}</span>
                  <svg className="directory__chevron" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </h2>

              <div
                id={panelId}
                className={`directory__collapse${isClosed ? ' is-closed' : ''}`}
                inert={isClosed}
              >
                <div className="directory__collapse-inner">
                  <ul className="directory__list">
                    {group.items.map((place) => {
                      rowIndex += 1
                      const isActive = place.id === activeId
                      const { label, flag } = displayName(place)
                      const isRoute = place.id === routeId
                      return (
                        <li key={place.id} className="directory__item">
                          <button
                            type="button"
                            className={`directory__row${isActive ? ' is-active' : ''}`}
                            aria-pressed={isActive}
                            onClick={() => onSelect(place)}
                            title={`${place.name} — ${place.address}`}
                          >
                            <span className="directory__index" aria-hidden="true">
                              {String(rowIndex).padStart(2, '0')}
                            </span>
                            <span className="directory__text">
                              <span className="directory__city">
                                <span className="directory__city-name">{label}</span>
                                {flag && <em className="directory__flag">{flag}</em>}
                              </span>
                              <span className="directory__street">{streetOf(place)}</span>
                            </span>
                          </button>
                          <button
                            type="button"
                            className={`directory__route${isRoute ? ' is-active' : ''}`}
                            onClick={() => onRoute(place)}
                            aria-label={
                              isRoute ? `Rota ativa até ${place.name}` : `Traçar rota até ${place.name}`
                            }
                            aria-current={isRoute ? 'true' : undefined}
                            title={isRoute ? `Rota ativa até ${place.name}` : `Traçar rota até ${place.name}`}
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M5 20v-7a4 4 0 0 1 4-4h10" />
                              <path d="M15 5l4 4-4 4" />
                            </svg>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </div>
            </section>
          )
        })}
      </div>

      <footer className="directory__foot">
Selecione uma cidade para vê-la no mapa ou toque em{' '}
        <svg className="directory__foot-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 20v-7a4 4 0 0 1 4-4h10" />
          <path d="M15 5l4 4-4 4" />
        </svg>{' '}
        para traçar a rota até ela.
      </footer>
    </aside>
  )
}
