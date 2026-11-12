import { forwardRef } from 'react'
import { HQ_PHOTO, type Place } from '../data/places'

/** Se a foto da unidade não existir ainda, usa a foto institucional. */
function photoFallback(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget
  if (img.dataset.fallbackUsed) return
  img.dataset.fallbackUsed = '1'
  img.src = HQ_PHOTO
}

type PlaceCardProps = {
  place: Place
  closing: boolean
  /** Posição horizontal do cursor do marcador dentro do cartão (px). */
  caret: number
  /** true quando o cartão é exibido abaixo do marcador. */
  flip: boolean
  onClose: () => void
  /** Traça a rota do visitante até esta unidade. */
  onRoute: () => void
  /** Aguardando a localização do visitante para esta rota. */
  routeBusy: boolean
}

const PlaceCard = forwardRef<HTMLDivElement, PlaceCardProps>(function PlaceCard(
  { place, closing, caret, flip, onClose, onRoute, routeBusy },
  ref,
) {
  return (
    <article
      ref={ref}
      className={`atlas-card${closing ? ' is-closing' : ''}`}
      data-flip={flip ? 'true' : 'false'}
      style={{ ['--caret-x' as string]: `${caret}px` }}
      aria-label={`Super Connect em ${place.city}, ${place.uf}`}
    >
      <figure className="atlas-card__media">
        <img
          className="atlas-card__photo"
          src={place.photo}
          alt={`Fotografia do escritório da Super Connect em ${place.city}`}
          decoding="async"
          onError={photoFallback}
        />
        <button
          type="button"
          className="atlas-card__close"
          onClick={onClose}
          aria-label={`Fechar cartão de ${place.name}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </figure>

      <div className="atlas-card__body">
        <h3 className="atlas-card__title">Super Connect</h3>
        <p className="atlas-card__location">{place.city}, {place.uf}</p>
        <button
          type="button"
          className="atlas-card__route"
          onClick={onRoute}
          disabled={routeBusy}
        >
          {routeBusy ? (
            <>
              <span className="atlas-nearest-spinner" aria-hidden="true" />
              Localizando você…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 20v-7a4 4 0 0 1 4-4h10" />
                <path d="M15 5l4 4-4 4" />
              </svg>
              Traçar rota até aqui
            </>
          )}
        </button>
        <details className="atlas-card__details">
          <summary>Mais detalhes</summary>
          <dl>
            <dt>Endereço</dt>
            <dd>{place.address}</dd>
            {place.reference && (
              <>
                <dt>Referência</dt>
                <dd>{place.reference}</dd>
              </>
            )}
          </dl>
        </details>
      </div>

      <span className="atlas-card__caret" aria-hidden="true" />
    </article>
  )
})

export default PlaceCard
