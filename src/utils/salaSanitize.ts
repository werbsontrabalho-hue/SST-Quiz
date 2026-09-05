// =====================================================================
// salaSanitize.ts — Sanitização do gabarito de Quiz Guiado no cliente.
//
// O payload completo de uma sala contém resposta_correta/explicacao de
// CADA pergunta. Um participante não deve receber o gabarito de perguntas
// que ainda não foram reveladas (anti-cola), nem dados de salas que não
// gerencia (isolamento entre empresas em modo legado sem RLS).
//
// Regra: dispositivos cujo usuário NÃO gerencia a sala só recebem o
// gabarito das perguntas já reveladas (índice < pergunta_atual_index, ou
// a pergunta atual quando revelar_resposta_atual estiver ativo). Instrutor
// /admin/super da sala continuam recebendo o payload completo.
// =====================================================================

import type { SalaQuizGuiado } from '../types';

export interface UsuarioSalaMinimo {
  id?: string;
  perfil?: string;
  is_instrutor?: boolean;
  empresa_id?: string;
}

export function podeGerenciarSala(
  user: UsuarioSalaMinimo | null | undefined,
  sala: SalaQuizGuiado
): boolean {
  if (!user || !user.id) return false;
  if (user.perfil === 'super_admin') return true;
  if (sala.instrutor_id && sala.instrutor_id === user.id) return true;
  if (
    (user.perfil === 'admin' || user.is_instrutor === true) &&
    sala.empresa_id &&
    user.empresa_id &&
    sala.empresa_id === user.empresa_id
  ) {
    return true;
  }
  return false;
}

export function sanitizeSalaParaParticipante(sala: SalaQuizGuiado): SalaQuizGuiado {
  const perguntaAtualIndex = Number(sala.pergunta_atual_index ?? 0);
  const revelarAtual = sala.revelar_resposta_atual === true;

  const perguntas = Array.isArray(sala.perguntas)
    ? sala.perguntas.map((q, i) => {
        const jaRevelada = i < perguntaAtualIndex || (i === perguntaAtualIndex && revelarAtual);
        if (jaRevelada) return q;
        const sanitizada: Record<string, unknown> = { ...q };
        delete sanitizada.resposta_correta;
        delete sanitizada.explicacao;
        return sanitizada as unknown as typeof q;
      })
    : sala.perguntas;

  return { ...sala, perguntas };
}

export function sanitizeSalaParaDispositivo(
  user: UsuarioSalaMinimo | null | undefined,
  sala: SalaQuizGuiado
): SalaQuizGuiado {
  return podeGerenciarSala(user, sala) ? sala : sanitizeSalaParaParticipante(sala);
}