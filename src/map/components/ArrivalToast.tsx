import { createPortal } from 'react-dom'
import type { Place } from '../data/places'
import { placeLabel } from '../lib/placeLabel'

type ArrivalToastProps = {
  place: Place
  /** O visitante já estava no local quando pediu a rota. */
  alreadyThere: boolean
  /** Encerra a rota. */
  onFinish: () => void
  /** Fecha o aviso e mantém o mapa como está. */
  onDismiss: () => void
}

/**
 * Aviso de chegada. É desenhado direto no <body>, fixo no topo da janela, para
 * aparecer mesmo quando a página está rolada para longe do mapa (no celular, o
 * visitante costuma olhar para outro trecho da página ao chegar).
 */
export default function ArrivalToast({ place, alreadyThere, onFinish, onDismiss }: ArrivalToastProps) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="sc-atlas sc-arrival-layer">
      <div className="sc-arrival" role="alert">
        <span className="sc-arrival__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>

        <div className="sc-arrival__text">
          <strong className="sc-arrival__title">
            {alreadyThere ? 'Você já está aqui!' : 'Você chegou!'}
          </strong>
          <span className="sc-arrival__place">Unidade {placeLabel(place)}</span>
          <span className="sc-arrival__address">{place.address}</span>
        </div>

        <button type="button" className="sc-arrival__finish" onClick={onFinish}>
          Concluir rota
        </button>

        <button
          type="button"
          className="sc-arrival__close"
          onClick={onDismiss}
          aria-label="Fechar aviso de chegada"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  )
}
