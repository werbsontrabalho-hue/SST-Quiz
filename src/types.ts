// ============================================================================
// TIPOS E INTERFACES DA PLATAFORMA (SST Quiz Corporate)
// ----------------------------------------------------------------------------
// Este arquivo define TODOS os formatos de dados usados no app.
// ============================================================================

export type PerfilUsuario = 'super_admin' | 'admin' | 'colaborador';

export type CategoriaPergunta = 
  | 'SST'
  | 'Meio Ambiente'
  | 'Procedimentos Internos'
  | 'Procedimentos Operacionais'
  | 'Normas e Treinamentos'
  | (string & {});

export type DificuldadePergunta = 'Fácil' | 'Médio' | 'Difícil';

export type TipoPergunta = 'multipla_escolha' | 'verdadeiro_falso';

export interface HistoricoTemporada {
  id: string;
  empresa_id: string;
  nome_temporada: string;
  data_inicio: string;
  data_fim: string;
  data_encerramento: string;
  rankings_setores: RankingSetorData[];
  rankings_colaboradores: {
    usuario_id: string;
    nome: string;
    setor_nome: string;
    cargo: string;
    avatar: string;
    pontos_totais: number;
    posicao: number;
  }[];
}

export interface RegraTrofeu {
  meta: number;
  trofeuId: string;
  imagem: string;
  nome: string;
  // NOVO: ativo=false desativa a regra sem remover conquistas já ganhas.
  ativo?: boolean;
  // NOVO: acumulado = total de vida toda; sequencial = zera ao perder/errar.
  modoContagem?: 'acumulado' | 'sequencial';
  // NOVO: mostra barra de progresso no app do colaborador.
  mostrarProgresso?: boolean;
  // NOVO: quantos pontos faltam para o troféu aparecer em "Próximos" (0 = mostra todos).
  limiteProximidade?: number;
  // NOVO (só Defesa Imbatível): gatilho da conquista.
  gatilhoDefesa?: 'desafiado' | 'setor_maior' | 'ambos';
}

// Troféu conquistado por um colaborador (fonte de verdade).
export interface TrofeuConquistado {
  nome: string;
  trofeuId?: string;
  imagem?: string;
  categoria: string;
  conquistado_em: string;
  temporada?: string;
}

export interface ConfiguracoesTrofeus {
  vitoriasTotais?: RegraTrofeu[];
  winStreak?: RegraTrofeu[];
  acertosTotais?: RegraTrofeu[];
  defesasImbativel?: RegraTrofeu[];
  recuperacoesEpicas?: RegraTrofeu[];
  veteranoSST?: RegraTrofeu[];
}

// Registro de troféus ganhos em uma temporada (Linha do Tempo).
export interface TrofeuTemporada {
  temporada: string;
  data_inicio?: string;
  data_fim?: string;
  trofeus: TrofeuConquistado[];
}

export interface ConfiguracoesEmpresa {
  limiteDesafiosSemana: number;
  pontosVitoriaDesafio: number;
  perguntasPorDesafio: number;
  desempateRule: 'desafiante' | 'desafiado' | 'ninguem';
  tempoLimiteAceiteHoras: number;
  permitirAmistosos: boolean;
  permitirMesmoSetorAmistoso: boolean;
  percentualMinimoParticipacao: number;
  nome_temporada_atual?: string;
  data_inicio_temporada?: string;
  data_fim_temporada?: string;
  cota_desafios_colaborador?: number;
  pontosVitoriaAmistoso?: number;
  pontosDerrotaAmistoso?: number;
  pontosPorAcertoQuiz?: number;
  bonusVelocidadeMax?: number;
  bonusStreakMax?: number;
  regrasTrofeus?: ConfiguracoesTrofeus;
}

export interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
  plano: 'Basic' | 'Pro' | 'Enterprise';
  ativa?: boolean;
  data_contratacao?: string;
  limite_colaboradores?: number;
  configuracoes: ConfiguracoesEmpresa;
  historico_temporadas?: HistoricoTemporada[];
}

export interface Setor {
  id: string;
  empresa_id: string;
  nome: string;
  colaboradores_ativos: number;
}

export interface EstatisticasUsuario {
  pontos_quizzes: number;
  pontos_desafios: number;
  pontos_totais: number;
  pontos_resgataveis?: number;
  streak_dias: number;
  quizzes_respondidos: number;
  acertos_totais: number;
  erros_totais: number;
  tempo_medio_resposta_seg: number;
  desafios_vencidos: number;
  desafios_jogados: number;
  // NOVO: troféus conquistados (com data) — substitui o antigo array "medalhas".
  trofeus_conquistados?: TrofeuConquistado[];
  // NOVO: defesas vencidas (vitórias como DESAFIADO).
  defesas_vencidas?: number;
  // NOVO: sequências reais (modo contagem "sequencial").
  sequencia_vitorias?: number;
  maior_sequencia_vitorias?: number;
  sequencia_defesas?: number;
  maior_sequencia_defesas?: number;
  sequencia_acertos?: number;
  maior_sequencia_acertos?: number;
  // NOVO: última data de atividade (para streak diário REAL por data).
  ultimo_quiz_data?: string;
}

export interface Usuario {
  id: string;
  empresa_id: string;
  setor_id: string;
  nome: string;
  email: string;
  senha?: string;
  avatar: string;
  perfil: PerfilUsuario;
  cargo: string;
  ativo?: boolean;
  is_instrutor?: boolean; // Marcação funcional: Habilitado para conduzir treinamentos e criar salas de Quiz Guiado
  estatisticas: EstatisticasUsuario;
  created_at?: string;
  // Linha do Tempo: troféus conquistados em temporadas anteriores (informativo).
  trofeus_temporadas?: TrofeuTemporada[];
  // FASE 2 — vinculo com o Supabase Auth (auth.users.id) para políticas RLS.
  auth_uid?: string;
}

export interface Pergunta {
  id: string;
  empresa_id: string;
  categoria: CategoriaPergunta;
  tipo: TipoPergunta;
  dificuldade: DificuldadePergunta;
  enunciado: string;
  alternativas: string[];
  resposta_correta: number;
  explicacao: string;
  tempo_limite_segundos: number;
  norma_relacionada?: string;
  ativa?: boolean;
  disponivel_desafios?: boolean;
}

export interface Campanha {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string;
  frequencia: 'diaria' | 'semanal' | 'personalizada';
  setores_alvo: string[];
  quantidade_perguntas: number;
  pergunta_ids?: string[];
  data_inicio: string;
  data_fim: string;
  horario_disparo: string;
  ativa: boolean;
  pontos_por_acerto?: number;
}

export interface DetalheRespostaQuiz {
  pergunta_id: string;
  resposta_escolhida: number;
  correta: boolean;
  tempo_gasto_segundos: number;
  pontos_ganhos: number;
}

export interface QuizSessao {
  id: string;
  campanha_id?: string;
  colaborador_id: string;
  empresa_id: string;
  titulo: string;
  categoria: CategoriaPergunta;
  perguntas: Pergunta[];
  status: 'pendente' | 'concluido' | 'expirado';
  pontuacao_total: number;
  respostas: DetalheRespostaQuiz[];
  criado_em: string;
  respondido_em?: string;
}

export interface RespostaDesafioPartida {
  pergunta_id: string;
  alternativa_escolhida: number;
  correta: boolean;
  tempo_resposta_segundos: number;
}

export interface Desafio1v1 {
  id: string;
  empresa_id: string;
  desafiante_id: string;
  desafiante_setor_id: string;
  desafiado_id: string;
  desafiado_setor_id: string;
  tema_sorteado: CategoriaPergunta;
  status: 'pendente' | 'aceito' | 'em_andamento' | 'recusado' | 'concluido' | 'expirado';
  vale_ponto: boolean;
  tipo: 'competitivo' | 'amistoso';
  pontuacao_setor: number;
  aposta_pontos?: number;
  vencedor_id?: string;
  vencedor_setor_id?: string;
  data_criacao: string;
  perguntas: Pergunta[];
  respostas_desafiante?: RespostaDesafioPartida[];
  respostas_desafiado?: RespostaDesafioPartida[];
  revanche_id?: string;
  motivo_vitoria?: string;
  decidido_no_desempate?: boolean;
  placar_final?: string;
}

export interface Premiacao {
  id: string;
  empresa_id: string;
  titulo: string;
  descricao: string;
  tipo: 'vale_presente' | 'brinde' | 'folga' | 'outro';
  mes_referencia: string;
  requisito: string;
  custo_pontos?: number;
  estoque?: number;
  ativo?: boolean;
  imagem?: string;
}

export interface ResgatePremio {
  id: string;
  empresa_id: string;
  usuario_id: string;
  usuario_nome: string;
  usuario_email?: string;
  usuario_setor_nome?: string;
  premiacao_id: string;
  premiacao_titulo: string;
  premiacao_imagem?: string;
  custo_pontos: number;
  status: 'pendente' | 'aprovado' | 'entregue' | 'rejeitado';
  data_resgate: string;
  data_atualizacao?: string;
  observacoes?: string;
}

export interface RankingSetorData {
  setor_id: string;
  setor_nome: string;
  total_pontos_quizzes: number;
  total_pontos_desafios: number;
  total_pontos: number;
  total_colaboradores_ativos: number;
  colaboradores_participantes: number;
  taxa_participacao: number;
  elegivel: boolean;
  pontuacao_media: number;
  posicao: number;
}

export interface ItemSincronizacaoOffline {
  id: string;
  tipo:
    | 'RESPONDER_QUIZ'
    | 'RESPONDER_DESAFIO'
    | 'CRIAR_DESAFIO'
    | 'SOLICITAR_RESGATE'
    | 'ATUALIZAR_RESGATE'
    | 'EDITAR_PERFIL';
  payload: any;
  criado_em: string;
  status: 'pendente' | 'sincronizado';
}

export interface NotificacaoSST {
  id: string;
  usuario_id: string;
  titulo: string;
  mensagem: string;
  tipo: 'quiz_diario' | 'desafio_1v1' | 'campanha' | 'alerta_sst' | 'certificado';
  link_acao?: string;
  lida: boolean;
  criada_em: string;
  canal: 'push' | 'email' | 'ambos';
}

// ============================================================================
// TIPOS DO MÓDULO QUIZ GUIADO (TREINAMENTOS SST EM TEMPO REAL)
// ============================================================================

export type ModalidadeQuizGuiado = 'interativo' | 'avaliacao';
export type EstiloQuizGuiado = 'competitivo' | 'educacional';
export type StatusSalaQuiz = 'aguardando' | 'em_andamento' | 'pausado' | 'concluido';
export type EstadoApresentacaoQuiz = 'AGUARDANDO' | 'QUESTION_ACTIVE' | 'QUESTION_ENDED' | 'ANSWER_REVEALED' | 'RANKING_SHOWN' | 'CONCLUIDO';

export interface RespostaParticipanteQuiz {
  resposta_index: number;
  tempo_ms: number;
  timestamp: string;
  correta?: boolean;
  answer_id?: string;
}

export interface ParticipanteSalaQuiz {
  id: string;
  usuario_id?: string;
  nome: string;
  matricula?: string;
  cpf?: string;
  cpf_ou_empresa?: string;
  is_visitante: boolean;
  respostas: Record<string, RespostaParticipanteQuiz>; // pergunta_id -> resposta
  pontuacao_acumulada: number;
  nota_final?: number; // 0.0 a 10.0
  situacao?: 'APROVADO' | 'NAO_APROVADO';
  concluido?: boolean;
  posicao_anterior?: number;
  posicao_atual?: number;
  online_status?: 'conectado' | 'instavel' | 'desconectado';
}

export interface SessaoHistoricoQuiz {
  id: string;
  sessao_id: string;
  data_inicio: string;
  data_fim?: string;
  total_participantes: number;
  vencedor_nome?: string;
  vencedor_pontos?: number;
  participantes_resumo: { nome: string; pontuacao: number; posicao: number }[];
}

export interface SalaQuizGuiado {
  id: string;
  pin: string; // PIN de 6 dígitos (ex: "849201")
  treinamento_titulo: string;
  nome?: string;
  instrutor_id: string;
  instrutor_nome: string;
  // CORREÇÃO (auditoria Quiz Guiado/Avaliação): referência opcional ao QUIZ
  // de origem (criador) — separada do instrutor da sessão. O instrutor
  // (quem conduz esta sessão) pode ser diferente do criador do quiz.
  quiz_origem_id?: string;
  quiz_origem_nome?: string;
  quiz_origem_criador_id?: string;
  quiz_origem_criador_nome?: string;
  empresa_id: string;
  data_criacao: string;
  status: StatusSalaQuiz;
  estado_apresentacao?: EstadoApresentacaoQuiz;
  sessao_id?: string;
  question_started_at?: number; // timestamp epoch ms
  question_ends_at?: number; // timestamp epoch ms
  modalidade: ModalidadeQuizGuiado;
  estilo?: EstiloQuizGuiado;
  nota_minima: number; // ex: 7.0
  nota_minima_aprovacao?: number;
  tempo_por_pergunta_seg: number; // ex: 30
  tempo_por_pergunta?: number;
  perguntas: Pergunta[];
  pergunta_atual_index: number;
  mostrar_ranking: boolean;
  permitir_visitantes: boolean;
  participantes: ParticipanteSalaQuiz[];
  revelar_resposta_atual?: boolean; // Para o modo educacional/interativo
  mostrar_modo_tv?: boolean;
  posicoes_anteriores?: Record<string, number>; // participante_id -> posicao_na_pergunta_anterior
  historico_sessoes?: SessaoHistoricoQuiz[];
}

export interface ResultadoAvaliacaoSST {
  id: string;
  sala_id: string;
  empresa_id?: string;
  instrutor_id?: string;
  sala_pin?: string;
  // CORREÇÃO (auditoria Quiz Guiado/Avaliação): a avaliação é vinculada à
  // SESSÃO específica (sessao_id) — não apenas à sala — para que uma nova
  // sessão do mesmo Quiz não recupere a avaliação/PDF da sessão anterior.
  sessao_id?: string;
  participante_nome: string;
  participante_id?: string;
  matricula?: string;
  cpf?: string;
  cpf_ou_empresa?: string;
  is_visitante: boolean;
  treinamento_titulo: string;
  instrutor_nome: string;
  data: string;
  total_perguntas: number;
  acertos: number;
  erros: number;
  nota_final: number; // 0.0 a 10.0
  nota_minima: number;
  situacao: 'APROVADO' | 'NAO_APROVADO';
  desempenho_por_tema: { tema: string; total: number; acertos: number; percentual: number; porcentagem?: number }[];
  respostas_detalhadas: {
    pergunta_id: string;
    enunciado: string;
    norma_relacionada?: string;
    alternativas?: string[];
    resposta_fornecida_index?: number;
    resposta_correta_index?: number;
    resposta_fornecida: string;
    resposta_correta: string;
    correta: boolean;
    explicacao?: string;
  }[];
  // Alias opcionais para relatórios
  cargo?: string;
  setor_nome?: string;
  email?: string;
  sala_nome?: string;
  data_finalizacao?: string;
  porcentagem_acertos?: number;
  questoes_corretas?: number;
  total_questoes?: number;
  nota_minima_aprovacao?: number;
  // CORREÇÃO: código de documento e sessão únicos por avaliação/sessão
  // (usados no PDF — evita reutilizar arquivo/nome de uma sessão anterior).
  codigo_documento?: string;
  sessao_codigo?: string;
}

