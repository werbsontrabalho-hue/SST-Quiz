// ============================================================
// trofeusHelpers.ts — Utilitários compartilhados de Troféus
// ------------------------------------------------------------
// Centraliza a galeria interna de imagens, os textos de dica de
// cada categoria e a montagem da vitrine de troféus exibida ao
// colaborador. Usado por:
//   - AdminManagementView (editor de regras de troféus)
//   - CollaboratorDashboardView (vitrine "Minhas Medalhas")
// ============================================================

import { ConfiguracoesTrofeus, RegraTrofeu, Usuario } from '../types';

// ============================================================
// GALERIA INTERNA DE TROFÉUS (imagens pré-estabelecidas)
// ============================================================
export const TROFEU_GALERIA = [
  { chave: 'medalha_bronze', emoji: '🥉', nome: 'Medalha Bronze' },
  { chave: 'medalha_prata', emoji: '🥈', nome: 'Medalha Prata' },
  { chave: 'medalha_ouro', emoji: '🥇', nome: 'Medalha Ouro' },
  { chave: 'trofeu', emoji: '🏆', nome: 'Troféu Clássico' },
  { chave: 'trofeu_ouro', emoji: '🏆', nome: 'Troféu Ouro' },
  { chave: 'estrela', emoji: '⭐', nome: 'Estrela' },
  { chave: 'coroa', emoji: '👑', nome: 'Coroa' },
  { chave: 'escudo', emoji: '🛡️', nome: 'Escudo' },
  { chave: 'diamante', emoji: '💎', nome: 'Diamante' },
  { chave: 'raio', emoji: '⚡', nome: 'Raio (Velocidade)' },
  { chave: 'fogo', emoji: '🔥', nome: 'Fogo (Ofensiva)' },
  { chave: 'cerebro', emoji: '🧠', nome: 'Cérebro (Conhecimento)' },
  { chave: 'livro', emoji: '📚', nome: 'Livro (Estudo)' },
  { chave: 'coracao', emoji: '❤️', nome: 'Coração (Fidelidade)' },
  { chave: 'medalha_estrela', emoji: '🌟', nome: 'Estrela de Excelência' },
  { chave: 'trofeu_plata', emoji: '🥈', nome: 'Troféu Prata' },
];

// Retorna o emoji de uma imagem salva no banco (ou um troféu padrão)
export const emojiTrofeu = (imagem?: string): string => {
  if (!imagem) return '🏆';
  if (imagem.startsWith('data:') || imagem.startsWith('http')) return '🏆';
  const item = TROFEU_GALERIA.find(g => g.chave === imagem);
  return item ? item.emoji : '🏆';
};

// Verifica se o valor salvo no campo "imagem" do troféu é uma imagem real
// (upload personalizado como data: URL ou uma URL http/https). Qualquer outra
// string — como uma chave da galeria ("trofeu") ou uma chave legada dos dados
// padrão ("streak_3", "acertos_100") — NÃO é uma imagem de verdade e deve ser
// exibida como emoji. Isso evita renderizar <img> quebrado.
export const eImagemRealTrofeu = (imagem?: string): boolean => {
  if (!imagem) return false;
  return imagem.startsWith('data:') || imagem.startsWith('http://') || imagem.startsWith('https://');
};

// ============================================================
// DICAS / TOOLTIPS DE CADA TIPO DE TROFÉU
// ============================================================
export const DICAS_TROFEUS: Record<string, { titulo: string; dica: string }> = {
  vitoriasTotais: {
    titulo: 'Vitórias Totais',
    dica: 'Premia a persistência nos desafios 1x1. O colaborador ganha o troféu ao acumular X vitórias no total, sem limite de tempo. Ex.: 10 vitórias = Bronze, 30 = Prata, 50 = Ouro.',
  },
  winStreak: {
    titulo: 'Sequência de Dias (Streak)',
    dica: 'Premia a consistência diária. O colaborador ganha o troféu ao manter X dias seguidos respondendo quizzes. Se perder um dia, a contagem zera. Ex.: 7 dias = Bronze, 15 = Prata, 30 = Ouro.',
  },
  acertosTotais: {
    titulo: 'Acertos Totais',
    dica: 'Premia o conhecimento técnico. O colaborador ganha o troféu ao acumular X acertos em perguntas de quiz ao longo da carreira dele. Ex.: 100 acertos = Estudioso, 500 = Mestre.',
  },
  defesasImbativel: {
    titulo: 'Defesa Imbatível',
    dica: 'Premia a superação. O colaborador ganha o troféu ao vencer um desafio 1x1 contra um adversário de um setor MAIOR que o dele. Ideal para valorizar quem derruba gigantes.',
  },
  recuperacoesEpicas: {
    titulo: 'Recuperação Épica',
    dica: 'Premia a coragem e o sangue frio. O colaborador ganha o troféu ao vencer um desafio que foi decidido na pergunta de desempate (deathmatch).',
  },
  veteranoSST: {
    titulo: 'Veterano SST',
    dica: 'Premia a frequência e o compromisso. O colaborador ganha o troféu ao responder X quizzes ao longo do tempo, mostrando dedicação contínua aos treinamentos.',
  },
};

// Ordem e rótulo de cada categoria exibida no painel de troféus
export const CATEGORIAS_TROFEUS = [
  { chave: 'vitoriasTotais', titulo: 'Vitórias Totais' },
  { chave: 'winStreak', titulo: 'Sequência de Dias' },
  { chave: 'acertosTotais', titulo: 'Acertos Totais' },
  { chave: 'defesasImbativel', titulo: 'Defesa Imbatível' },
  { chave: 'recuperacoesEpicas', titulo: 'Recuperação Épica' },
  { chave: 'veteranoSST', titulo: 'Veterano SST' },
] as const;

// ============================================================
// MONTAGEM DA VITRINE DA TEMPORADA ATUAL
// ------------------------------------------------------------
// Converte as regras configuradas pela empresa + as medalhas já
// conquistadas pelo colaborador em uma lista de troféus exibíveis
// (com ícone, nome, categoria e status "obtida").
export interface TrofeuExibicao {
  nome: string;
  categoria: string;
  categoriaChave: string;
  icone: string;
  imagem?: string;
  meta?: number;
  obtida: boolean;
  progresso?: number;
  ativo?: boolean;
  modoContagem?: 'acumulado' | 'sequencial';
  limiteProximidade?: number;
}

// Calcula o valor atual de uma regra para o usuário (acumulado = vida toda;
// sequencial = sequência). Espelha a lógica do SSTContext.
export const valorRegraParaUsuario = (categoriaChave: string, regra: RegraTrofeu, usuario: Usuario): number => {
  const s = usuario.estatisticas;
  const modo = regra.modoContagem || 'acumulado';

  switch (categoriaChave) {
    case 'vitoriasTotais':
      return modo === 'sequencial' ? (s.sequencia_vitorias || 0) : (s.desafios_vencidos || 0);
    case 'winStreak':
      // Alinhado à concessão (SSTContext): usa streak_dias atual nos dois modos.
      return (s.streak_dias || 0);
    case 'acertosTotais':
      return modo === 'sequencial' ? (s.sequencia_acertos || 0) : (s.acertos_totais || 0);
    case 'veteranoSST':
      return (s.quizzes_respondidos || 0);
    case 'defesasImbativel':
      return modo === 'sequencial' ? (s.sequencia_defesas || 0) : (s.defesas_vencidas || 0);
    case 'recuperacoesEpicas':
      return (s.desafios_vencidos || 0);
    default:
      return 0;
  }
};

// Monta a vitrine de troféus da temporada atual (conquistados + pendentes),
// já calculando o progresso e o status de "ativo" de cada regra.
export const getTrofeusTemporadaAtual = (
  regrasTrofeus: ConfiguracoesTrofeus | undefined,
  usuario: Usuario
): TrofeuExibicao[] => {
  if (!regrasTrofeus) return [];

  const conquistados = (usuario.estatisticas.trofeus_conquistados || []).map(t => t.nome);
  const conquistadosSet = new Set(conquistados);

  const resultado: TrofeuExibicao[] = [];

  CATEGORIAS_TROFEUS.forEach(cat => {
    const lista = (regrasTrofeus[cat.chave] || []) as RegraTrofeu[];
    lista.forEach(nivel => {
      if (!nivel.nome) return;
      resultado.push({
        nome: nivel.nome,
        categoria: DICAS_TROFEUS[cat.chave]?.titulo || cat.titulo,
        categoriaChave: cat.chave,
        icone: emojiTrofeu(nivel.imagem),
        imagem: nivel.imagem,
        meta: nivel.meta,
        obtida: conquistadosSet.has(nivel.nome),
        progresso: valorRegraParaUsuario(cat.chave, nivel, usuario),
        ativo: nivel.ativo !== false,
        modoContagem: nivel.modoContagem || 'acumulado',
        limiteProximidade: nivel.limiteProximidade,
      });
    });
  });

  return resultado;
};
