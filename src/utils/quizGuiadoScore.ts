// ============================================================================
// quizGuiadoScore.ts — LÓGICA PURA DE PONTUAÇÃO DO QUIZ GUIADO
// ----------------------------------------------------------------------------
// Refactor incremental (Fase 9): a pontuação por acerto (modo competitivo com
// bônus por velocidade, modo educacional com valor fixo) fica isolada do
// SSTContext para ser testável. NÃO muda nenhuma regra.
// ============================================================================

export interface CalcularPontosQuizGuiadoArgs {
  correta: boolean | undefined;
  estilo?: string;
  tempoMs: number;
  tempoPorPerguntaSeg?: number;
  pontosServer?: number;
}

export function calcularPontosQuizGuiado(args: CalcularPontosQuizGuiadoArgs): number {
  const { correta, estilo, tempoMs, tempoPorPerguntaSeg, pontosServer } = args;

  if (!correta) return 0;

  // Quando a validação veio do servidor, o valor calculado ali tem prioridade.
  if (pontosServer !== undefined && pontosServer !== null) return pontosServer;

  // Modo competitivo: quanto mais rápido respondeu, mais pontos ganha.
  // No avanço manual (0s), concede a pontuação base cheia de 1000 pontos.
  if (estilo === 'competitivo') {
    const tempoSeg = tempoPorPerguntaSeg !== undefined ? Number(tempoPorPerguntaSeg) : 30;
    if (tempoSeg > 0) {
      const tempoMaxMs = tempoSeg * 1000;
      const tempoRestanteRatio = Math.max(0, (tempoMaxMs - tempoMs) / tempoMaxMs);
      return 1000 + Math.round(tempoRestanteRatio * 500);
    }
    return 1000;
  }

  // Modo educacional/interativo: valor fixo por acerto.
  return 100;
}