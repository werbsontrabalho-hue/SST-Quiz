// ============================================================================
// EFEITOS SONOROS E VIBRAÇÃO DO APP SST QUIZ (Web Audio API)
// ============================================================================
// Gerencia efeitos sonoros gerados programaticamente (sem arquivos de áudio)
// e a vibração tátil (haptics) de dispositivos móveis durante os desafios.
// A função playAudioEffect é usada no ChallengeDisputeView para sonorizar
// acertos, erros, vitórias e alertas de desafio.

// Contexto de áudio único reutilizado pelo app (Web Audio API).
let audioCtx: AudioContext | null = null;

/**
 * Obtém (e retoma) o contexto de áudio do navegador.
 *
 * - Parâmetros: nenhum.
 * - Retorno: AudioContext ativo, ou null se o navegador não suportar
 *   (ou em ambiente sem window, ex.: renderização no servidor/SSR).
 *
 * Lógica: usa o AudioContext padrão (com fallback para webkitAudioContext,
 * necessário no Safari), cria apenas uma vez e retoma o contexto se estiver
 * suspenso (política de autoplay dos navegadores).
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Reproduz um efeito sonoro e, se suportado, vibra o dispositivo.
 *
 * - Parâmetro: `type` — 'correct' | 'wrong' | 'victory' | 'challenge_alert'.
 * - Retorno: nenhum (efeito sonoro e vibração).
 * - Uso no app: ChallengeDisputeView — toca ao acertar ('correct'), errar
 *   ('wrong'), vencer um desafio ('victory') e ao receber/confirmar um
 *   desafio ('challenge_alert').
 *
 * Lógica:
 *  - Vibração (navigator.vibrate): padrões de duração distintos por tipo;
 *  - Som sintetizado via Web Audio API (sem arquivos): acerto = tom duplo
 *    agudo (C5→E5), erro = zumbido grave, vitória = arpejo de fanfarra
 *    (C5,E5,G5,C6), alerta = sino ascendente (A4→A5);
 *  - Cada nota usa um oscilador conectado a um nó de ganho com fade-out
 *    exponencial (evita cliques), tudo embrulhado em try/catch para nunca
 *    quebrar o fluxo do quiz.
 */
export const playAudioEffect = (type: 'correct' | 'wrong' | 'victory' | 'challenge_alert') => {
  try {
    // Vibração tátil em dispositivos compatíveis (mobile)
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'correct') navigator.vibrate([60, 40, 60]);
      else if (type === 'wrong') navigator.vibrate([150]);
      else if (type === 'victory') navigator.vibrate([100, 50, 100, 50, 250]);
      else if (type === 'challenge_alert') navigator.vibrate([100, 80, 100]);
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (type === 'correct') {
      // Som de acerto: carrilhão de tom duplo agudo (C5 -> E5)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'wrong') {
      // Som de erro: zumbido grave
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(150, now + 0.25);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'victory') {
      // Som de vitória: arpejo de fanfarra (C5, E5, G5, C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.22, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.45);
      });
    } else if (type === 'challenge_alert') {
      // Som de alerta de desafio: sino de convite (A4 -> A5)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.12);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (err) {
    console.warn('Audio playback error:', err);
  }
};
