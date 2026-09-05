// ============================================================================
// desafioWinner.ts — LÓGICA PURA DE DECISÃO DE VENCEDOR DO DESAFIO 1x1
// ----------------------------------------------------------------------------
// Refactor incremental (Fase 9): a decisão de vencedor (5 perguntas, pergunta
// de desempate, desempate por tempo e regra final da empresa) fica isolada do
// SSTContext para ser testável e reutilizável. NÃO muda nenhuma regra — apenas
// move o cálculo para um módulo puro e DETERMINÍSTICO (a pergunta de desempate
// é escolhida por hash estável do id do desafio, garantindo que os dois
// dispositivos selecionem a mesma pergunta — AUD-50/F-21).
// ============================================================================

import { Desafio1v1, Pergunta } from '../types';

export interface RespostaDesafioItem {
  pergunta_id: string;
  alternativa_escolhida: number;
  correta: boolean;
  tempo_resposta_segundos: number;
}

export type DesempateRule = 'desafiante' | 'desafiado' | 'ninguem';

export interface CalcularDesafioArgs {
  desafio: Desafio1v1;
  respostas: RespostaDesafioItem[];
  isDesafiante: boolean;
  perguntasDisponiveis: Pergunta[];
  desempateRule: DesempateRule;
}

export interface CalcularDesafioResultado {
  respostasDesafiante: RespostaDesafioItem[];
  respostasDesafiado: RespostaDesafioItem[];
  perguntas: Pergunta[];
  status: Desafio1v1['status'];
  vencedorId?: string;
  vencedorSetorId?: string;
  motivoVitoria?: string;
  decididoNoDesempate: boolean;
  placarFinal?: string;
}

export function calcularResultadoDesafio(args: CalcularDesafioArgs): CalcularDesafioResultado {
  const { desafio, respostas, isDesafiante, perguntasDisponiveis, desempateRule } = args;

  // Mantém as respostas de cada jogador (quem está respondendo atualiza
  // suas próprias respostas, mantendo as do oponente).
  const novasRespDesafiante = isDesafiante ? respostas : (desafio.respostas_desafiante || []);
  const novasRespDesafiado = !isDesafiante ? respostas : (desafio.respostas_desafiado || []);

  const totalPerguntasPartida = desafio.perguntas?.length || 5;

  // Pega apenas as respostas das 5 perguntas principais.
  const resp5Desafiante = novasRespDesafiante.slice(0, 5);
  const resp5Desafiado = novasRespDesafiado.slice(0, 5);

  const concluiu5Desafiante = resp5Desafiante.length >= Math.min(5, totalPerguntasPartida);
  const concluiu5Desafiado = resp5Desafiado.length >= Math.min(5, totalPerguntasPartida);

  let statusFinal: Desafio1v1['status'] = 'em_andamento';

  let vencedorId: string | undefined = undefined;
  let vencedorSetorId: string | undefined = undefined;
  let motivoVitoria: string | undefined = undefined;
  let decididoNoDesempate = false;
  let placarFinal: string | undefined = undefined;

  let perguntasFinais = desafio.perguntas;

  // Busca uma pergunta nova (ainda não usada no desafio e disponível para
  // desafios) para o desempate.
  // CORREÇÃO (auditoria forense AUD-50/F-21): antes usava Math.random(), o
  // que sorteava perguntas DIFERENTES em cada dispositivo (desafiante e
  // desafiado divergiam na 6ª pergunta). Agora o sorteio é DETERMINÍSTICO:
  // usamos um hash estável do id do desafio como índice — os dois lados
  // escolhem SEMPRE a mesma pergunta de desempate.
  const pegarProximaPergunta = (desafioAtual: Desafio1v1): Pergunta | undefined => {
    const pIdsExistentes = new Set(desafioAtual.perguntas.map(p => p.id));
    const candidatos = perguntasDisponiveis.filter(
      p => p.empresa_id === desafioAtual.empresa_id
        && p.disponivel_desafios !== false
        && !pIdsExistentes.has(p.id)
    );
    if (candidatos.length === 0) return undefined;
    // Hash determinístico (FNV-1a) do id do desafio → índice estável.
    const seed = String(desafioAtual.id || 'desafio');
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const idx = Math.abs(hash) % candidatos.length;
    return candidatos[idx];
  };

  // Só avalia o resultado quando os DOIS jogadores responderam as 5 perguntas.
  if (concluiu5Desafiante && concluiu5Desafiado) {
    const acertos5_1 = resp5Desafiante.filter(r => r.correta).length;
    const acertos5_2 = resp5Desafiado.filter(r => r.correta).length;

    if (acertos5_1 > acertos5_2) {
      // Desafiante vence direto nas 5 perguntas.
      statusFinal = 'concluido';
      vencedorId = desafio.desafiante_id;
      vencedorSetorId = desafio.desafiante_setor_id;
      placarFinal = `${acertos5_1} x ${acertos5_2}`;
      motivoVitoria = `Vitória por acertos: ${acertos5_1} x ${acertos5_2}`;
    } else if (acertos5_2 > acertos5_1) {
      // Desafiado vence direto nas 5 perguntas.
      statusFinal = 'concluido';
      vencedorId = desafio.desafiado_id;
      vencedorSetorId = desafio.desafiado_setor_id;
      placarFinal = `${acertos5_2} x ${acertos5_1}`;
      motivoVitoria = `Vitória por acertos: ${acertos5_2} x ${acertos5_1}`;
    } else {
      // EMPATE nas 5 perguntas → precisa da Pergunta de Desempate (6ª).
      const currentTotalQ = perguntasFinais.length || 5;

      if (currentTotalQ === 5) {
        // Adiciona dinamicamente a 6ª pergunta (desempate) após os dois
        // terminarem as 5 primeiras.
        const proximaPergunta = pegarProximaPergunta({ ...desafio, perguntas: perguntasFinais });
        if (proximaPergunta) {
          perguntasFinais = [...perguntasFinais, proximaPergunta];
        }
        statusFinal = 'em_andamento';
      } else {
        // O desafio já tem 6+ perguntas (desempate em andamento).
        const currentTBIndex = currentTotalQ - 1;
        const respTB_1 = novasRespDesafiante[currentTBIndex];
        const respTB_2 = novasRespDesafiado[currentTBIndex];

        if (respTB_1 && respTB_2) {
          // Os dois responderam a pergunta de desempate!
          decididoNoDesempate = true;

          if (respTB_1.correta && !respTB_2.correta) {
            // Só o desafiante acertou → vence.
            statusFinal = 'concluido';
            vencedorId = desafio.desafiante_id;
            vencedorSetorId = desafio.desafiante_setor_id;
            placarFinal = `${acertos5_1} x ${acertos5_2} (+ Desempate)`;
            motivoVitoria = `Vitória por acerto na Pergunta de Desempate (${currentTotalQ}ª pergunta)!`;
          } else if (respTB_2.correta && !respTB_1.correta) {
            // Só o desafiado acertou → vence.
            statusFinal = 'concluido';
            vencedorId = desafio.desafiado_id;
            vencedorSetorId = desafio.desafiado_setor_id;
            placarFinal = `${acertos5_2} x ${acertos5_1} (+ Desempate)`;
            motivoVitoria = `Vitória por acerto na Pergunta de Desempate (${currentTotalQ}ª pergunta)!`;
          } else if (respTB_1.correta && respTB_2.correta) {
            // AMBOS acertaram → quem respondeu mais rápido vence.
            // CORREÇÃO (auditoria forense AUD-51): o fallback "|| 20" fazia
            // tempo 0/ausente virar 20s, distorcendo o desempate. Agora, tempo
            // inválido vira um número alto apenas para efeito de comparação
            // (quem não informou tempo perde), e tempo 0 real é respeitado.
            const t1 = Number.isFinite(Number(respTB_1.tempo_resposta_segundos))
              ? Number(respTB_1.tempo_resposta_segundos)
              : Number.MAX_SAFE_INTEGER;
            const t2 = Number.isFinite(Number(respTB_2.tempo_resposta_segundos))
              ? Number(respTB_2.tempo_resposta_segundos)
              : Number.MAX_SAFE_INTEGER;

            if (t1 !== t2) {
              statusFinal = 'concluido';
              if (t1 < t2) {
                // Desafiante respondeu mais rápido.
                vencedorId = desafio.desafiante_id;
                vencedorSetorId = desafio.desafiante_setor_id;
                placarFinal = `${acertos5_1} x ${acertos5_2} (+ Tempo Desempate)`;
                motivoVitoria = `Ambos acertaram! Vitória por resposta mais rápida na ${currentTotalQ}ª pergunta (${t1.toFixed(1)}s vs ${t2.toFixed(1)}s)!`;
              } else {
                // Desafiado respondeu mais rápido.
                vencedorId = desafio.desafiado_id;
                vencedorSetorId = desafio.desafiado_setor_id;
                placarFinal = `${acertos5_2} x ${acertos5_1} (+ Tempo Desempate)`;
                motivoVitoria = `Ambos acertaram! Vitória por resposta mais rápida na ${currentTotalQ}ª pergunta (${t2.toFixed(1)}s vs ${t1.toFixed(1)}s)!`;
              }
            } else {
              // Empate exato no tempo → adiciona mais uma pergunta.
              const proximaPergunta = pegarProximaPergunta({ ...desafio, perguntas: perguntasFinais });
              if (proximaPergunta) {
                perguntasFinais = [...perguntasFinais, proximaPergunta];
                statusFinal = 'em_andamento';
              } else {
                // Sem mais perguntas disponíveis: regra padrão (desafiante vence).
                statusFinal = 'concluido';
                vencedorId = desafio.desafiante_id;
                vencedorSetorId = desafio.desafiante_setor_id;
                placarFinal = `${acertos5_1} x ${acertos5_2} (+ Tempo Desempate)`;
                motivoVitoria = 'Ambos acertaram e empataram em tempo. Desafiante venceu por regra padrão.';
              }
            }
          } else {
            // AMBOS erraram no desempate → adiciona outra pergunta (looping
            // até alguém vencer ou acabarem as perguntas).
            const proximaPergunta = pegarProximaPergunta({ ...desafio, perguntas: perguntasFinais });
            if (proximaPergunta) {
              perguntasFinais = [...perguntasFinais, proximaPergunta];
              statusFinal = 'em_andamento';
            } else {
              // Sem mais perguntas: decide pela regra de desempate da empresa
              // (desafiante, desafiado ou ninguém).
              statusFinal = 'concluido';
              if (desempateRule === 'desafiado') {
                vencedorId = desafio.desafiado_id;
                vencedorSetorId = desafio.desafiado_setor_id;
              } else if (desempateRule === 'ninguem') {
                vencedorId = undefined;
                vencedorSetorId = undefined;
              } else {
                vencedorId = desafio.desafiante_id;
                vencedorSetorId = desafio.desafiante_setor_id;
              }
              placarFinal = `${acertos5_1} x ${acertos5_2} (+ Sem mais perguntas)`;
              motivoVitoria = 'Sem mais perguntas disponíveis. Vencedor decidido pela regra de desempate da empresa.';
            }
          }
        } else {
          // Ainda aguardando o oponente responder a pergunta de desempate.
          statusFinal = 'em_andamento';
        }
      }
    }
  }

  return {
    respostasDesafiante: novasRespDesafiante,
    respostasDesafiado: novasRespDesafiado,
    perguntas: perguntasFinais,
    status: statusFinal,
    vencedorId,
    vencedorSetorId,
    motivoVitoria,
    decididoNoDesempate,
    placarFinal,
  };
}