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

  // Quando a validação veio do servidor, o valor calculado ali tem prioridade (com trava de segurança).
  if (pontosServer !== undefined && pontosServer !== null) {
    const v = Number(pontosServer);
    if (Number.isFinite(v)) return Math.max(0, Math.min(1500, Math.round(v)));
  }

  // Modo competitivo: quanto mais rápido respondeu, mais pontos ganha (1000 base + até 500 de velocidade = máx 1500).
  if (estilo === 'competitivo') {
    const tempoSeg = tempoPorPerguntaSeg !== undefined ? Number(tempoPorPerguntaSeg) : 30;
    if (Number.isFinite(tempoSeg) && tempoSeg > 0) {
      const tempoMaxMs = tempoSeg * 1000;
      const tempoSeguro = Number.isFinite(Number(tempoMs)) ? Math.max(0, Number(tempoMs)) : tempoMaxMs;
      const tempoRestanteRatio = Math.max(0, (tempoMaxMs - tempoSeguro) / tempoMaxMs);
      return 1000 + Math.round(tempoRestanteRatio * 500);
    }
    return 1000;
  }

  // Modo educacional/interativo: valor fixo por acerto.
  return 100;
}