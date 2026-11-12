/**
 * Som discreto para a notificação de chegada ao escritório.
 *
 * Navegadores móveis (principalmente o Safari no iPhone) bloqueiam áudio
 * gerado em segundo plano se o contexto de áudio não tiver sido aberto durante
 * um toque do usuário. Por isso `prepareArrivalSound()` é chamado quando o
 * visitante toca para iniciar a rota — destravando o contexto sem emitir som —
 * e `playArrivalSound()` toca o sinal quando o GPS confirma a chegada.
 */

let audioContext: AudioContext | null = null

type LegacyWindow = Window & { webkitAudioContext?: typeof AudioContext }

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (audioContext && audioContext.state !== 'closed') return audioContext
  const Ctor = window.AudioContext ?? (window as LegacyWindow).webkitAudioContext
  if (!Ctor) return null
  try {
    audioContext = new Ctor()
    return audioContext
  } catch {
    return null
  }
}

/**
 * Abre e destrava o áudio dentro do toque que inicia a rota, tocando um pulso
 * silencioso. Seguro de chamar em qualquer navegador.
 */
export function prepareArrivalSound(): void {
  const ctx = getContext()
  if (!ctx) return
  try {
    if (ctx.state === 'suspended') void ctx.resume()
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start(0)
  } catch {
    /* áudio bloqueado ou indisponível: o aviso visual segue normalmente */
  }
}

/** Duas notas suaves ascendentes (C6 → G6), em volume baixo. */
export function playArrivalSound(): void {
  const ctx = getContext()
  if (!ctx) return
  try {
    const start = () => {
      const now = ctx.currentTime
      // Quinta justa suave: soa como sino leve de confirmação, sem susto.
      scheduleChimeNote(ctx, 1046.5, now, 0.24, 0.1)
      scheduleChimeNote(ctx, 1567.98, now + 0.13, 0.38, 0.085)
    }
    if (ctx.state === 'suspended') {
      void ctx.resume().then(start).catch(() => {})
    } else {
      start()
    }
  } catch {
    /* falha silenciosa: não interrompe o aviso na tela */
  }
}

function scheduleChimeNote(
  ctx: AudioContext,
  frequency: number,
  when: number,
  duration: number,
  peakGain: number,
): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(frequency, when)

  // Envelope sem clique: sobe rápido e desvanece devagar.
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.linearRampToValueAtTime(peakGain, when + 0.018)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(when)
  osc.stop(when + duration + 0.02)
}
