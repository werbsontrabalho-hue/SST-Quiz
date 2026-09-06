// ============================================================================
// CONTEXTO GLOBAL DA PLATAFORMA (SSTContext.tsx)
// ----------------------------------------------------------------------------
// ESTE É O "CORAÇÃO" DO APP. Aqui ficam:
//  - Todos os dados (empresas, usuários, perguntas, desafios, prêmios...)
//  - Toda a lógica de negócio (pontuação, desafios 1x1, resgates, rankings)
//  - A autenticação (login, recuperação de senha)
//  - A persistência local (localStorage) e a sincronização com o Supabase
//
// Como usar: qualquer tela pode acessar estas funções/estados chamando
// `useSST()` (veja a função no final do arquivo).
//
// COMO FAZER CORREÇÕES AQUI:
//  - Para mudar REGRAS DE PONTUAÇÃO: procure por pontosVitoria/ConfiguracoesEmpresa.
//  - Para mudar LIMITES DE DESAFIOS: procure por cota/limiteSemana.
//  - Para mudar MEDALHAS: procure por medalhas/Bronze/Prata/Ouro.
//  - Lembre-se: alterações feitas em estados já existentes são salvas
//    automaticamente no localStorage pelos useEffect do final do arquivo.
// ============================================================================

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { formatAlternativaText, normalizeAlternativas, normalizePergunta } from '../utils/questionHelpers';
import { 
  Empresa, 
  Setor, 
  Usuario, 
  Pergunta, 
  Campanha, 
  QuizSessao, 
  Desafio1v1, 
  Premiacao,
  ResgatePremio,
  RankingSetorData,
  ItemSincronizacaoOffline,
  CategoriaPergunta,
  NotificacaoSST,
  DetalheRespostaQuiz,
  RegraTrofeu,
  ConfiguracoesTrofeus,
  SalaQuizGuiado,
  ParticipanteSalaQuiz,
  RespostaParticipanteQuiz,
  ResultadoAvaliacaoSST,
  ModalidadeQuizGuiado,
  EstiloQuizGuiado,
  StatusSalaQuiz
} from '../types';
import { 
  mockEmpresas, 
  mockSetores, 
  mockUsuarios, 
  mockPerguntas, 
  mockCampanhas, 
  mockQuizzesIniciais, 
  mockDesafios, 
  mockPremiacoes 
} from '../data/mockData';
import confetti from 'canvas-confetti';
import { supabaseService } from '../services/supabaseService';
import { apiFetch, apiHeaders } from '../lib/api';
import { idbSet, idbGet } from '../services/idb';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { signInWithEmail, signOutSupabase, resetPasswordViaEmail, signUpWithEmail, vincularAuthUidAoUsuario, finalizarRecuperacaoViaToken as finalizarRecuperacaoViaTokenSupabase, temTokenRecuperacaoNaUrl as temTokenRecuperacaoNaUrlSupabase } from '../services/supabaseAuth';
import { safeJsonParse } from '../utils/validators';
import { calcularResultadoDesafio } from '../utils/desafioWinner';
import { calcularPontosQuizGuiado } from '../utils/quizGuiadoScore';
import { calcularResultadoAvaliacaoParticipante } from '../utils/resultadoAvaliacao';

// "Contrato" do contexto: lista todos os estados e funções que as telas
// poderão acessar via useSST(). Se você criar uma nova função aqui dentro,
// deve declarar o tipo dela também nesta interface.
interface SSTContextType {
  // Current session state
  // --- Estado da sessão (quem está logado) ---
  currentUser: Usuario;
  setCurrentUser: (user: Usuario) => void;
  isLoggedIn: boolean;
  login: (user: Usuario) => void;
  loginWithCredentials: (email: string, password: string) => Promise<{ success: boolean; message: string; user?: Usuario }>;
  registerAccount: (dados: { 
    nome: string; 
    email: string; 
    senha: string; 
    cargo: string; 
    empresa_id: string; 
    setor_id: string; 
    perfil?: 'colaborador' | 'admin' | 'super_admin'; 
    avatar?: string 
  }) => Promise<{ success: boolean; message: string; user?: Usuario }>;
  requestPasswordResetCode: (email: string) => Promise<{ success: boolean; message: string }>;
  resetUserPasswordWithCode: (email: string, codigo: string, novaSenha: string) => Promise<{ success: boolean; message: string }>;
  finalizarRecuperacaoViaToken: (novaSenha: string) => Promise<{ success: boolean; message: string }>;
  temTokenRecuperacaoNaUrl: () => boolean;
  logout: () => void;
  empresa: Empresa;
  setEmpresa: (empresa: Empresa) => void;
  
  // Supabase Modal State
  // --- Estado do modal de configuração do Supabase (nuvem) ---
  showSupabaseModal: boolean;
  setShowSupabaseModal: (open: boolean) => void;
  isSupabaseActive: boolean;
  setIsSupabaseActive: (active: boolean) => void;
  
  // Data collections
  // --- Coleções de dados (listas) usadas em todo o app ---
  empresas: Empresa[];
  setEmpresas: React.Dispatch<React.SetStateAction<Empresa[]>>;
  setores: Setor[];
  usuarios: Usuario[];
  setUsuarios: React.Dispatch<React.SetStateAction<Usuario[]>>;
  perguntas: Pergunta[];
  campanhas: Campanha[];
  quizzes: QuizSessao[];
  desafios: Desafio1v1[];
  premiacoes: Premiacao[];
  resgates: ResgatePremio[];
  
  // Offline state
  // --- Estado de modo offline e fila de sincronização ---
  isOfflineMode: boolean;
  setIsOfflineMode: (offline: boolean) => void;
  itensPendentesSync: ItemSincronizacaoOffline[];
  sincronizarDadosPendentes: () => void;
  
  // Helper calculations & rankings
  // --- Cálculos de rankings (setores e colaboradores) ---
  getRankingsSetores: () => RankingSetorData[];
  getRankingsColaboradores: () => Usuario[];
  
  // Actions
  // --- Ações do banco de perguntas ---
  adicionarPergunta: (pergunta: Omit<Pergunta, 'id' | 'empresa_id'>, targetEmpresaId?: string) => void;
  adicionarPerguntasLote: (novasPerguntas: Omit<Pergunta, 'id' | 'empresa_id'>[], targetEmpresaId?: string) => number;
  editarPergunta: (id: string, pergunta: Partial<Pergunta>) => void;
  excluirPergunta: (id: string) => void;
  
  // Global UI Modals
  // --- Modais globais de interface ---
  showProfileModal: boolean;
  setShowProfileModal: (open: boolean) => void;
  criarCampanha: (campanha: Omit<Campanha, 'id'> & { empresa_id?: string }) => void;
  editarCampanha: (id: string, campanha: Partial<Campanha>) => void;
  excluirCampanha: (id: string) => void;
  criarDesafio1v1: (desafiadoId: string, tipo: 'competitivo' | 'amistoso', apostaPontos?: number) => Desafio1v1 | null;
  aceitarDesafio: (desafioId: string) => Promise<void>;
  recusarDesafio: (desafioId: string) => void;
  submeterRespostaDesafio: (
    desafioId: string, 
    userId: string, 
    respostas: { pergunta_id: string; alternativa_escolhida: number; correta: boolean; tempo_resposta_segundos: number }[]
  ) => Promise<void>;
  submeterQuizConcluido: (quizId: string, respostas: DetalheRespostaQuiz[], pontosGanhos: number) => Promise<void>;
  criarRevanche: (desafioOriginalId: string) => Desafio1v1 | null;
  resetarTabelaDesafios1v1: (targetEmpresaId?: string) => void;
  resetarPontuacaoEmpresa: (targetEmpresaId?: string) => void;
  resetarPontuacaoEmpresaPreservarPontos: (targetEmpresaId?: string) => void;
  encerrarEIniciarNovaTemporada: (nomeNovaTemporada: string, dataInicio: string, dataFim: string) => void;
  adicionarPremiacao: (premio: Omit<Premiacao, 'id' | 'empresa_id'>) => void;
  editarPremiacao: (id: string, premio: Partial<Premiacao>) => void;
  excluirPremiacao: (id: string) => void;
  solicitarResgatePremio: (premiacaoId: string) => Promise<{ success: boolean; message: string }>;
  atualizarStatusResgate: (resgateId: string, novoStatus: 'aprovado' | 'entregue' | 'rejeitado', observacoes?: string) => Promise<boolean>;
  
  // CRUD Empresas
  // --- CRUD (criar/editar/excluir) de empresas ---
  adicionarEmpresa: (emp: Omit<Empresa, 'id'>) => void;
  editarEmpresa: (id: string, emp: Partial<Empresa>) => void;
  excluirEmpresa: (id: string) => void;

  // CRUD Setores
  // --- CRUD (criar/editar/excluir) de setores ---
  adicionarSetor: (nome: string, empresaId?: string) => void;
  editarSetor: (id: string, nome: string) => void;
  excluirSetor: (id: string) => void;

  // Notifications State & Push/Email Reminders
  // --- Estado de notificações e lembretes (push/email) ---
  notificacoes: NotificacaoSST[];
  marcarNotificacaoComoLida: (id: string) => void;
  marcarTodasNotificacoesComoLidas: () => void;
  excluirNotificacao: (id: string) => void;
  limparTodasNotificacoes: () => void;
  dispararNotificacaoLembrete: (dados: { titulo: string; mensagem: string; tipo: NotificacaoSST['tipo']; canal?: 'push' | 'email' | 'ambos' }) => void;
  showNotificationDrawer: boolean;
  setShowNotificationDrawer: (open: boolean) => void;

  // Categories
  // --- Categorias de perguntas (padrão + personalizadas) ---
  categoriasPersonalizadas: string[];
  adicionarCategoriaPersonalizada: (novaCategoria: string) => void;
  categoriasDisponiveis: string[];

  // CRUD Usuarios
  // --- CRUD de usuários ---
  adicionarUsuario: (novoUsuario: {
    nome: string;
    email: string;
    cargo: string;
    setor_id: string;
    empresa_id?: string;
    perfil: 'colaborador' | 'admin' | 'super_admin';
    is_instrutor?: boolean;
    avatar?: string;
    senha?: string;
  }) => boolean | void;
  adicionarUsuariosLote: (novosUsuarios: {
    nome: string;
    email: string;
    senha?: string;
    cargo: string;
    setor_nome: string;
    perfil: 'colaborador' | 'admin' | 'super_admin';
    is_instrutor?: boolean;
  }[], targetEmpresaId?: string) => { cadastrados: number; atualizados: number; bloqueadosPorLimite?: number };
  editarUsuario: (id: string, usuario: Partial<Usuario>) => void;
  excluirUsuario: (id: string) => void;

  // CRUD Setores Batch
  // --- Cadastro em lote de setores ---
  adicionarSetoresLote: (nomesSetores: string[], empresaId?: string) => void;

  // Quiz Guiado (Treinamentos SST em Tempo Real)
  salasQuizGuiado: SalaQuizGuiado[];
  resultadosAvaliacaoSST: ResultadoAvaliacaoSST[];
  criarSalaQuizGuiado: (dados: {
    treinamento_titulo: string;
    modalidade: ModalidadeQuizGuiado;
    estilo?: EstiloQuizGuiado;
    nota_minima: number;
    tempo_por_pergunta_seg: number;
    pergunta_ids: string[];
    mostrar_ranking: boolean;
    permitir_visitantes: boolean;
  }) => SalaQuizGuiado;
  editarSalaQuizGuiado: (salaId: string, dados: Partial<SalaQuizGuiado>) => void;
  excluirSalaQuizGuiado: (salaId: string) => void;
  entrarNaSalaQuizGuiado: (pin: string, dadosParticipante: { nome: string; matricula?: string; cpf?: string; cpf_ou_empresa?: string; usuario_id?: string; is_visitante?: boolean }) => Promise<{ success: boolean; message: string; sala?: SalaQuizGuiado; participanteId?: string }>;
  iniciarQuizGuiado: (salaId: string) => void;
  pausarQuizGuiado: (salaId: string) => void;
  retomarQuizGuiado: (salaId: string) => void;
  avancarPerguntaQuizGuiado: (salaId: string) => void;
  revelarRespostaAtualQuizGuiado: (salaId: string) => void;
  exibirRanqueQuizGuiado: (salaId: string) => void;
  reiniciarSalaQuizGuiado: (salaId: string) => void;
  encerrarSalaQuizGuiado: (salaId: string) => void;
  submeterRespostaQuizGuiado: (salaId: string, participanteId: string, perguntaId: string, respostaIndex: number, tempoMs: number) => Promise<void>;
  obterResultadoAvaliacaoParticipante: (salaId: string, participanteId: string, sessaoId?: string) => ResultadoAvaliacaoSST | null;
  excluirResultadoAvaliacaoSST: (resultadoId: string) => Promise<void> | void;

  // SuperAdmin Factory Reset & Backup/Restore System
  // --- Sistema de backup/restauração e reset de fábrica (Super Admin) ---
  executarResetFabricaComercial: () => { success: boolean; message: string };
  gerarBackupSistema: (tipo?: 'manual' | 'automatico', empresaId?: string) => { jsonString: string; filename: string };
  restaurarBackupSistema: (jsonContent: string, targetEmpresaId?: string) => { success: boolean; message: string; detalhes?: string };
  historicoBackups: {
    id: string;
    data: string;
    tipo: 'manual' | 'automatico';
    tamanhoKb: number;
    resumo: string;
    escopo?: 'empresa' | 'global';
    empresaId?: string;
    empresaNome?: string;
    jsonSnapshot?: string;
  }[];
  excluirBackupHistorico: (id: string) => void;
}

const DEFAULT_SENHA = '123456';

// Gera uma senha padrão aleatória e forte para usuários criados/importados
// sem senha. Evita a senha fixa e universal '123456' (que permitia login em
// qualquer conta recém-criada). O administrador deve repassar ao colaborador.
function gerarSenhaPadrao(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pwd = '';
  const rnd = new Uint8Array(10);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(rnd);
  } else {
    for (let i = 0; i < rnd.length; i++) rnd[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < rnd.length; i++) pwd += chars[rnd[i] % chars.length];
  return pwd;
}

// Gera o hash SHA-256 de uma string de texto puro para verificação segura de senha.
async function hashSha256(str: string): Promise<string> {
  if (!str) return '';
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const msgUint8 = new TextEncoder().encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    console.warn('Crypto subtle não disponível para SHA-256:', e);
  }
  return '';
}

// Categorias padrão de perguntas oferecidas pelo sistema.
// O Admin pode criar mais (ficam em categoriasPersonalizadas).
const DEFAULT_CATEGORIES = [
  'SST',
  'Meio Ambiente',
  'Procedimentos Internos',
  'Procedimentos Operacionais',
  'Normas e Treinamentos'
];

// Criação do contexto React. O "undefined" serve de sentinela: se algum
// componente usar useSST() fora do provider, o sistema detecta o erro.
const SSTContext = createContext<SSTContextType | undefined>(undefined);

export const SSTProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load initial states from localStorage if existing, or mock data
  // Cada estado é inicializado lendo o localStorage. Se não existir nada salvo,
  // usa os dados de demonstração (mockData). Isso garante que o app funcione
  // mesmo sem nunca ter sido usado antes (primeira execução).
  const [empresas, setEmpresas] = useState<Empresa[]>(() => {
    return safeJsonParse(localStorage.getItem('sst_empresas'), mockEmpresas);
  });

  // Empresa "selecionada" no momento (a do usuário logado).
  const [empresa, setEmpresa] = useState<Empresa>(() => {
    return safeJsonParse(localStorage.getItem('sst_empresa'), mockEmpresas[0]);
  });

  const [setores, setSetores] = useState<Setor[]>(() => {
    return safeJsonParse(localStorage.getItem('sst_setores'), mockSetores);
  });

  const [usuarios, setUsuarios] = useState<Usuario[]>(() => {
    return safeJsonParse(localStorage.getItem('sst_usuarios'), mockUsuarios);
  });

  // Flag de sessão: se sst_is_logged_in == 'true', o usuário continua logado.
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem('sst_is_logged_in') === 'true';
  });

  // Usuário logado. Ao carregar, busca pelo ID salvo no localStorage.
  const [currentUser, setCurrentUser] = useState<Usuario>(() => {
    const savedId = localStorage.getItem('sst_current_user_id');
    if (savedId) {
      const found = usuarios.find(u => u.id === savedId) || mockUsuarios.find(u => u.id === savedId);
      if (found) return found;
    }
    return mockUsuarios.find(u => u.perfil === 'colaborador') || mockUsuarios[0];
  });

  // Helper: calcula o valor atual de uma regra para o usuário, respeitando
  // o modo de contagem (acumulado = total de vida toda; sequencial = sequência).
  const valorRegraParaUsuario = (categoria: string, regra: RegraTrofeu, usuario: Usuario): number => {
    const s = usuario.estatisticas;
    const modo = regra.modoContagem || 'acumulado';

    switch (categoria) {
      case 'vitoriasTotais':
        return modo === 'sequencial' ? (s.sequencia_vitorias || 0) : (s.desafios_vencidos || 0);
      case 'winStreak':
        // Sequencial: streak atual (dias seguidos). Acumulado: usa o streak atual
        // como referência (não existe contador separado de maior streak de dias).
        return (s.streak_dias || 0);
      case 'acertosTotais':
        return modo === 'sequencial' ? (s.sequencia_acertos || 0) : (s.acertos_totais || 0);
      case 'veteranoSST':
        return (s.quizzes_respondidos || 0);
      case 'defesasImbativel': {
        const gatilho = regra.gatilhoDefesa || 'desafiado';
        if (gatilho === 'setor_maior' || gatilho === 'ambos') {
          // Para setor_maior/ambos o valor é calculado com contexto do desafio;
          // aqui (fora de contexto) usamos as defesas vencidas como base.
          return modo === 'sequencial' ? (s.sequencia_defesas || 0) : (s.defesas_vencidas || 0);
        }
        return modo === 'sequencial' ? (s.sequencia_defesas || 0) : (s.defesas_vencidas || 0);
      }
      case 'recuperacoesEpicas':
        return (s.desafios_vencidos || 0);
      default:
        return 0;
    }
  };

  // Helper to check and award trophies based on company rules
  // Função para verificar e entregar troféus com base nas regras da empresa
  // `contexto` é opcional e carrega dados do desafio para regras contextuais
  // (ex.: vitória como desafiado, vitória contra setor maior, desempate).
  const verificarEntregarTrofeus = (usuario: Usuario, contexto?: { desafio?: Desafio1v1; setores?: Setor[] }) => {
    const regras: ConfiguracoesTrofeus | undefined = empresa.configuracoes.regrasTrofeus;
    if (!regras) return usuario;

    const conquistados = usuario.estatisticas.trofeus_conquistados || [];
    const nomesConquistados = new Set(conquistados.map(t => t.nome));
    let ganhouNovoTrofeu = false;
    const novosConquistados = [...conquistados];
    const nomeTemporadaAtual = empresa.configuracoes.nome_temporada_atual || '1ª Temporada';
    const agora = new Date().toISOString();

    // Avalia uma lista de regras de uma categoria.
    const avaliarCategoria = (categoria: keyof ConfiguracoesTrofeus, regrasCat: RegraTrofeu[] | undefined, condicaoAdicional?: boolean) => {
      if (!regrasCat) return;
      regrasCat.forEach(regra => {
        // Regra desativada: não concede novos troféus, mas NÃO remove conquistados.
        if (regra.ativo === false) return;
        if (nomesConquistados.has(regra.nome)) return;
        if (condicaoAdicional === false) return;

        const valor = valorRegraParaUsuario(categoria, regra, usuario);
        if (valor >= regra.meta) {
          novosConquistados.push({
            nome: regra.nome,
            trofeuId: regra.trofeuId,
            imagem: regra.imagem,
            categoria,
            conquistado_em: agora,
            temporada: nomeTemporadaAtual,
          });
          ganhouNovoTrofeu = true;
        }
      });
    };

    avaliarCategoria('vitoriasTotais', regras.vitoriasTotais);
    avaliarCategoria('winStreak', regras.winStreak);
    avaliarCategoria('acertosTotais', regras.acertosTotais);
    avaliarCategoria('veteranoSST', regras.veteranoSST);

    // 5. Defesa Imbatível — depende do contexto do desafio (vitória 1x1).
    if (regras.defesasImbativel && contexto?.desafio) {
      const desf = contexto.desafio;
      const ehVencedorDesafiado = desf.vencedor_id === desf.desafiado_id;

      // Tamanho dinâmico dos setores (corrige campo desatualizado colaboradores_ativos).
      const qtdColaboradoresSetor = (setorId?: string) => {
        if (!setorId) return 1;
        const colabs = usuarios.filter(u => u.setor_id === setorId && u.ativo !== false).length;
        return colabs || contexto?.setores?.find(s => s.id === setorId)?.colaboradores_ativos || 1;
      };
      const setorVencedorId = desf.vencedor_id === desf.desafiante_id ? desf.desafiante_setor_id : desf.desafiado_setor_id;
      const setorOponenteId = desf.vencedor_id === desf.desafiante_id ? desf.desafiado_setor_id : desf.desafiante_setor_id;
      const colabsVencedor = qtdColaboradoresSetor(setorVencedorId);
      const colabsOponente = qtdColaboradoresSetor(setorOponenteId);
      const venceuSetorMaior = colabsVencedor < colabsOponente;

      regras.defesasImbativel.forEach(regra => {
        if (regra.ativo === false) return;
        if (nomesConquistados.has(regra.nome)) return;
        const gatilho = regra.gatilhoDefesa || 'desafiado';
        const atendeGatilho =
          gatilho === 'desafiado' ? ehVencedorDesafiado :
          gatilho === 'setor_maior' ? venceuSetorMaior :
          (ehVencedorDesafiado || venceuSetorMaior);
        if (!atendeGatilho) return;

        const valor = valorRegraParaUsuario('defesasImbativel', regra, usuario);
        if (valor >= regra.meta) {
          novosConquistados.push({
            nome: regra.nome,
            trofeuId: regra.trofeuId,
            imagem: regra.imagem,
            categoria: 'defesasImbativel',
            conquistado_em: agora,
            temporada: nomeTemporadaAtual,
          });
          ganhouNovoTrofeu = true;
        }
      });
    }

    // 6. Recuperação Épica — venceu decidindo no desempate (deathmatch).
    if (regras.recuperacoesEpicas && contexto?.desafio?.decidido_no_desempate) {
      regras.recuperacoesEpicas.forEach(regra => {
        if (regra.ativo === false) return;
        if (nomesConquistados.has(regra.nome)) return;
        const valor = valorRegraParaUsuario('recuperacoesEpicas', regra, usuario);
        if (valor >= regra.meta) {
          novosConquistados.push({
            nome: regra.nome,
            trofeuId: regra.trofeuId,
            imagem: regra.imagem,
            categoria: 'recuperacoesEpicas',
            conquistado_em: agora,
            temporada: nomeTemporadaAtual,
          });
          ganhouNovoTrofeu = true;
        }
      });
    }

    if (ganhouNovoTrofeu) {
      return { ...usuario, estatisticas: { ...usuario.estatisticas, trofeus_conquistados: novosConquistados } };
    }
    return usuario;
  };

  // Login rápido (usado quando o usuário é encontrado): define o usuário atual,
  // marca como logado, seleciona a empresa dele e persiste no localStorage.
  const login = (user: Usuario) => {
    setCurrentUser(user);
    setIsLoggedIn(true);
    // Prefere manter a empresa já carregada (mais recente) quando ela pertence
    // ao usuário; só troca para outra vinda do array se necessário. Isso evita
    // perder configurações editadas (ex.: regras de troféus) num re-login.
    const emp = empresas.find(e => e.id === user.empresa_id) || (empresa.id === user.empresa_id ? empresa : undefined);
    if (emp) setEmpresa(emp);
    localStorage.setItem('sst_current_user_id', user.id);
    localStorage.setItem('sst_is_logged_in', 'true');
  };

  // Login por e-mail + senha (chamado pela tela de Login).
  // Suporta autenticação via Supabase Auth e fallback seguro via validação de senha (SHA-256 / texto puro) na tabela usuarios.
  const loginWithCredentials = async (emailInput: string, passwordInput: string): Promise<{ success: boolean; message: string; user?: Usuario }> => {
    const cleanEmail = emailInput.trim().toLowerCase();

    // Verifica se a conta/empresa está bloqueada antes de permitir o login.
    const checkStatus = (userObj: Usuario) => {
      if (userObj.ativo === false) {
        return { allowed: false, message: 'Esta conta de usuário está inativa. Entre em contato com o administrador do sistema.' };
      }
      // Super Admin pode acessar mesmo que a empresa dele esteja inativa.
      if (userObj.perfil !== 'super_admin') {
        const emp = empresas.find(e => e.id === userObj.empresa_id);
        if (emp && emp.ativa === false) {
          return { allowed: false, message: 'A empresa vinculada a esta conta encontra-se inativa no sistema.' };
        }
      }
      return { allowed: true, message: '' };
    };
    
    if (isSupabaseConfigured()) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // Offline: permite entrar com a credencial já salva no aparelho.
        const foundOff = usuarios.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
        if (!foundOff || !foundOff.senha) {
          return { success: false, message: 'Você está sem internet e essa conta ainda não foi usada neste aparelho. Conecte-se uma vez para liberar o acesso offline.' };
        }
        const inputHashOff = await hashSha256(passwordInput);
        const dbOff = (foundOff.senha || '').trim();
        const okOff = dbOff !== '' && (passwordInput === dbOff || (inputHashOff !== '' && inputHashOff === dbOff));
        if (!okOff) {
          return { success: false, message: 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.' };
        }
        const stOff = checkStatus(foundOff);
        if (!stOff.allowed) return { success: false, message: stOff.message };
        login(foundOff);
        return { success: true, message: 'Entrada offline realizada com os dados salvos no aparelho!', user: foundOff };
      }
      const client = getSupabaseClient();
      if (!client) {
        return { success: false, message: 'Cliente Supabase indisponível.' };
      }
      try {
        // 1. Tenta autenticação nativa via Supabase Auth (se o usuário já existir no auth.users)
        let authResult = await signInWithEmail(cleanEmail, passwordInput);

        if (authResult.success && authResult.authUserId) {
          // 1a. Perfil já vinculado ao auth_uid
          let { data: byAuth, error: authErr } = await client
            .from('usuarios')
            .select('*')
            .eq('auth_uid', authResult.authUserId)
            .maybeSingle();

          if (authErr || !byAuth) {
            const { data: directAuth } = await client
              .from('usuarios')
              .select('*')
              .eq('auth_uid', authResult.authUserId)
              .maybeSingle();
            if (directAuth) byAuth = directAuth;
          }
          const userFromAuth = (byAuth as Usuario) || undefined;

          if (userFromAuth) {
            const statusCheck = checkStatus(userFromAuth);
            if (!statusCheck.allowed) {
              await signOutSupabase();
              return { success: false, message: statusCheck.message };
            }
            setUsuarios(prev => {
              const idx = prev.findIndex(u => u.id === userFromAuth.id);
              if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = userFromAuth;
                return copy;
              }
              return [...prev, userFromAuth];
            });
            login(userFromAuth);
            return { success: true, message: 'Autenticado com sucesso via Supabase Auth!', user: userFromAuth };
          }
        }

        // 2. Se o Supabase Auth falhar ou a conta não estiver no auth.users (ex: usuários da tabela public.usuarios):
        // Busca a conta diretamente no banco public.usuarios ou no estado local
        let targetUser: (Usuario & { senha?: string }) | undefined;
        try {
          const { data: userDb } = await client
            .from('usuarios')
            .select('*')
            .ilike('email', cleanEmail)
            .maybeSingle();
          if (userDb) targetUser = userDb as any;
        } catch (e) {
          console.warn('Busca na tabela usuarios falhou:', e);
        }

        if (!targetUser) {
          targetUser = usuarios.find(u => (u.email || '').trim().toLowerCase() === cleanEmail) as any;
        }

        if (!targetUser) {
          return { success: false, message: 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.' };
        }

        // Valida a senha fornecida comparando com o texto puro ou o hash SHA-256 no banco de dados
        const inputHash = await hashSha256(passwordInput);
        const dbSenha = (targetUser.senha || '').trim();

        let isPasswordValid = false;

        if (dbSenha === '') {
          // Auto-cura: se a conta foi criada e ficou com senha NULL no banco,
          // grava a senha informada no primeiro login e autoriza a entrada.
          isPasswordValid = true;
          targetUser.senha = passwordInput;
          try {
            await client.from('usuarios').update({ senha: passwordInput }).eq('id', targetUser.id);
          } catch (e) {
            console.warn('Auto-gravação de senha no Supabase falhou:', e);
          }
        } else {
          isPasswordValid = 
            passwordInput === dbSenha || 
            (inputHash !== '' && inputHash === dbSenha);
        }

        if (!isPasswordValid) {
          return { success: false, message: 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.' };
        }

        const statusCheck = checkStatus(targetUser);
        if (!statusCheck.allowed) {
          return { success: false, message: statusCheck.message };
        }

        // Auto-sincroniza com Supabase Auth em segundo plano para que as próximas entradas usem o Auth nativo
        try {
          const signUpRes = await signUpWithEmail(cleanEmail, passwordInput, {
            nome: targetUser.nome,
            perfil: targetUser.perfil
          });
          if (signUpRes.success) {
            const secondAuth = await signInWithEmail(cleanEmail, passwordInput);
            if (secondAuth.success && secondAuth.authUserId) {
              await vincularAuthUidAoUsuario(secondAuth.authUserId, cleanEmail);
              targetUser.auth_uid = secondAuth.authUserId;
            }
          }
        } catch (signUpErr) {
          console.warn('Auto-registro no Supabase Auth ignorado:', signUpErr);
        }

        setUsuarios(prev => {
          const idx = prev.findIndex(u => u.id === targetUser!.id);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = targetUser!;
            return copy;
          }
          return [...prev, targetUser!];
        });
        login(targetUser);
        return { success: true, message: 'Login realizado com sucesso!', user: targetUser };

      } catch (err) {
        console.warn('Erro na autenticação Supabase:', err);
        return { success: false, message: 'Erro inesperado na autenticação. Tente novamente.' };
      }
    }

    // Modo offline / local
    const foundLocal = usuarios.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
    if (foundLocal) {
      if (!foundLocal.senha || (foundLocal.senha || '').trim() === '') {
        return { success: false, message: 'Esta conta ainda não possui senha definida. Use a recuperação de senha para criar uma.' };
      }
      const inputHash = await hashSha256(passwordInput);
      const dbSenha = (foundLocal.senha || '').trim();
      const isPasswordValid = dbSenha !== '' && (passwordInput === dbSenha || (inputHash !== '' && inputHash === dbSenha));

      if (!isPasswordValid) {
        return { success: false, message: 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.' };
      }
      const statusCheck = checkStatus(foundLocal);
      if (!statusCheck.allowed) {
        return { success: false, message: statusCheck.message };
      }
      login(foundLocal);
      return { success: true, message: 'Login realizado com sucesso!', user: foundLocal };
    }

    return { success: false, message: 'E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.' };
  };

  // Store verification codes in memory for secure password reset
  // Códigos de verificação de recuperação de senha (guardados em memória).
  // Estrutura: { email -> { code, expiresAt } } com validade de 15 minutos.
  const [resetCodesMap, setResetCodesMap] = useState<Record<string, { code: string; expiresAt: number }>>({});

  // Cadastro de conta (auto-registro). Hoje o formulário não é exibido na
  // tela de login, mas a lógica está pronta para uso futuro.
  const registerAccount = async (dados: { 
    nome: string; 
    email: string; 
    senha: string; 
    cargo: string; 
    empresa_id: string; 
    setor_id: string; 
    perfil?: 'colaborador' | 'admin' | 'super_admin'; 
    avatar?: string 
  }): Promise<{ success: boolean; message: string; user?: Usuario }> => {
    const cleanEmail = dados.email.trim().toLowerCase();

    // Valida se a empresa informada existe.
    const empresaAlvo = dados.empresa_id
      ? empresas.find(e => e.id === dados.empresa_id)
      : undefined;
    if (!dados.empresa_id || !empresaAlvo) {
      return { success: false, message: 'Selecione uma empresa válida para o cadastro.' };
    }
    // Valida se o setor informado existe e pertence à empresa escolhida.
    const setorAlvo = dados.setor_id ? setores.find(s => s.id === dados.setor_id) : undefined;
    if (!dados.setor_id || !setorAlvo || setorAlvo.empresa_id !== empresaAlvo.id) {
      return { success: false, message: 'Selecione um setor válido da empresa escolhida.' };
    }

    // Impede duplicidade de e-mail.
    const exists = usuarios.some(u => (u.email || '').trim().toLowerCase() === cleanEmail);
    if (exists) {
      return { success: false, message: 'Já existe uma conta com este endereço de e-mail.' };
    }

    // REGRA DO PLANO: respeita o limite de colaboradores da empresa também no auto-cadastro.
    const limiteAuto = empresaAlvo.limite_colaboradores ?? 100;
    const totalAuto = usuarios.filter(u => u.empresa_id === empresaAlvo.id).length;
    if (totalAuto >= limiteAuto) {
      return { success: false, message: `Limite de colaboradores atingido! A empresa "${empresaAlvo.nome}" permite ${limiteAuto} colaboradores (Plano ${empresaAlvo.plano || ''}). Fale com o administrador.` };
    }

    // SECURITY RULE: Public self-registration ALWAYS creates 'colaborador' accounts.
    // Admin / Super Admin roles must be granted by an existing Admin in the Admin dashboard.
    // REGRA DE SEGURANÇA: o auto-cadastro público SEMPRE cria contas de
    // "colaborador". Perfis de Admin/Super Admin só podem ser concedidos
    // por um Admin já existente, dentro do painel de gestão.
    const safePerfil: 'colaborador' = 'colaborador';

    // Monta o novo usuário com estatísticas zeradas e medalha de boas-vindas.
    const novoUsuario: Usuario = {
      id: `usr-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      empresa_id: empresaAlvo.id,
      setor_id: setorAlvo.id,
      nome: (dados.nome || '').trim(),
      email: cleanEmail,
      senha: dados.senha,
      avatar: dados.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250',
      perfil: safePerfil,
      cargo: (dados.cargo || '').trim() || 'Colaborador SST',
      estatisticas: {
        pontos_quizzes: 0,
        pontos_desafios: 0,
        pontos_totais: 0,
        streak_dias: 1,
        quizzes_respondidos: 0,
        acertos_totais: 0,
        erros_totais: 0,
        tempo_medio_resposta_seg: 0,
        desafios_vencidos: 0,
        desafios_jogados: 0,
        trofeus_conquistados: [],
        defesas_vencidas: 0,
        sequencia_vitorias: 0,
        maior_sequencia_vitorias: 0,
        sequencia_defesas: 0,
        maior_sequencia_defesas: 0,
        sequencia_acertos: 0,
        maior_sequencia_acertos: 0,
      },
      created_at: new Date().toISOString()
    };

    setUsuarios(prev => [novoUsuario, ...prev]);

    // SECURITY (auditoria V-003/V-017): quando o Supabase está configurado, a
    // conta é criada PRIMEIRO no Supabase Auth (hash Bcrypt no auth.users);
    // o perfil público é gravado na nuvem já com o auth_uid vinculado e SEM
    // senha em texto puro (upsertUsuario remove o campo antes de enviar).
    // A role anon não grava mais nada sem sessão (modo legado desativado).
    if (isSupabaseConfigured()) {
      try {
        const authResult = await signUpWithEmail(dados.email, dados.senha, {
          nome: novoUsuario.nome,
          empresa_id: novoUsuario.empresa_id,
          perfil: novoUsuario.perfil,
        });
        if (authResult.success && authResult.authUserId) {
          novoUsuario.auth_uid = authResult.authUserId;
          await supabaseService.upsertUsuario(novoUsuario);
        } else {
          // CORREÇÃO (auditoria forense AUD-48/A6): com Supabase ativo, se a
          // conta NÃO for criada no Auth, o cadastro NÃO pode "fingir" sucesso —
          // sem a conta Auth o usuário não consegue logar. Removemos o usuário
          // local recém-adicionado e informamos o erro real.
          setUsuarios(prev => prev.filter(u => u.id !== novoUsuario.id));
          return {
            success: false,
            message: authResult.message || 'Não foi possível criar a conta no Supabase Auth. Tente novamente.',
          };
        }
      } catch (err) {
        setUsuarios(prev => prev.filter(u => u.id !== novoUsuario.id));
        console.warn('Não foi possível criar a conta no Supabase Auth:', err);
        return {
          success: false,
          message: 'Não foi possível criar a conta no Supabase Auth. Tente novamente.',
        };
      }
    }

    login(novoUsuario);

    return { success: true, message: 'Conta de Colaborador criada e autenticada com sucesso!', user: novoUsuario };
  };

  // STEP 1 of Password Recovery: Generate and send 6-digit code
  // PASSO 1 da recuperação de senha: gera um código de 6 dígitos,
  // guarda em memória com validade de 15 minutos e notifica o usuário.
  const requestPasswordResetCode = async (emailInput: string): Promise<{ success: boolean; message: string }> => {
    const cleanEmail = (emailInput || '').trim().toLowerCase();
    const target = usuarios.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
    
    if (!target) {
      return { success: false, message: 'Nenhuma conta encontrada com este e-mail cadastrado.' };
    }

    // Generate random 6-digit verification code
    // Gera um código aleatório de 6 dígitos (entre 100000 e 999999).
    const generatedCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes validity // validade de 15 minutos

    // Salva o código vinculado ao e-mail do solicitante.
    setResetCodesMap(prev => ({
      ...prev,
      [cleanEmail]: { code: generatedCode, expiresAt }
    }));

    // Dispatch notification to the target user's account
    // Cria uma notificação avisando sobre a solicitação. IMPORTANTE: o código
    // NÃO é incluído aqui para não persistir o segredo no localStorage
    // (sst_notificacoes). O código é entregue de forma transitória apenas
    // pelo e-mail oficial do Supabase Auth — nunca é retornado ao frontend.
    setNotificacoes(prev => [
      {
        id: `notif-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        usuario_id: target.id,
        titulo: '🔒 Código de Recuperação de Senha',
        mensagem: `Foi solicitada a recuperação de senha para ${cleanEmail}. Use o código enviado por e-mail para concluir. Válido por 15 minutos.`,
        tipo: 'alerta_sst',
        lida: false,
        criada_em: new Date().toISOString(),
        canal: 'email',
      },
      ...prev
    ]);

    // FASE 2: quando o Supabase está configurado, envia o e-mail OFICIAL de
    // redefinição de senha do Supabase Auth (link com token). É o fluxo
    // seguro: o usuário clica no link e define a nova senha (auth.users),
    // sem expor código na tela. O código de 6 dígitos em memória é apenas
    // um fallback para o modo local/LAN sem nuvem.
    if (isSupabaseConfigured()) {
      try {
        const res = await resetPasswordViaEmail(cleanEmail);
        if (res.success) {
          return {
            success: true,
            message: `Enviamos um link de recuperação para ${cleanEmail}. Clique no link recebido por e-mail para redefinir sua senha com segurança.`,
          };
        }
        return { success: false, message: res.message || 'Não foi possível enviar o e-mail de recuperação.' };
      } catch (err) {
        console.warn('Não foi possível enviar o e-mail do Supabase Auth:', err);
        return { success: false, message: 'Não foi possível enviar o e-mail de recuperação. Tente novamente.' };
      }
    }

    // Modo local/LAN (sem Supabase): não há servidor de e-mail para entregar
    // o código. Para o usuário conseguir recuperar a senha, o código é
    // mostrado UMA vez nesta mensagem (a rede é local e não há isolamento
    // multi-tenant a proteger). O código continua válido por 15 minutos e é
    // descartado após o uso.
    return { 
      success: true, 
      message: `Código de recuperação (modo local): ${generatedCode}. Digite este código na próxima tela para redefinir sua senha. Válido por 15 minutos.` 
    };
  };

  // STEP 2 of Password Recovery: Validate 6-digit code and update password
  // PASSO 2 da recuperação: valida o código de 6 dígitos e redefine a senha.
  const resetUserPasswordWithCode = async (emailInput: string, codigoInput: string, novaSenha: string): Promise<{ success: boolean; message: string }> => {
    const cleanEmail = (emailInput || '').trim().toLowerCase();
    const target = usuarios.find(u => (u.email || '').trim().toLowerCase() === cleanEmail);
    
    if (!target) {
      return { success: false, message: 'Nenhuma conta encontrada com este e-mail.' };
    }

    const record = resetCodesMap[cleanEmail];
    if (!record) {
      return { success: false, message: 'Nenhuma solicitação de código ativa encontrada para este e-mail. Solicite um novo código.' };
    }

    if (Date.now() > record.expiresAt) {
      return { success: false, message: 'O código de segurança expirou. Por favor, solicite um novo código.' };
    }

    if ((record.code || '').trim() !== (codigoInput || '').trim()) {
      return { success: false, message: 'Código de verificação incorreto. Verifique o código de 6 dígitos recebido.' };
    }

    // Code is valid: update user password
    // Código válido: atualiza a senha do usuário.
    editarUsuario(target.id, { senha: novaSenha });
    if (isSupabaseConfigured()) {
      supabaseService.upsertUsuario({ ...target, senha: novaSenha }).catch(err => {
        console.warn('Erro ao atualizar senha no Supabase:', err);
      });
    }

    // Invalidate used code
    // Remove o código usado para não poder ser reutilizado.
    setResetCodesMap(prev => {
      const copy = { ...prev };
      delete copy[cleanEmail];
      return copy;
    });

    return { success: true, message: 'Senha redefinida com sucesso! Você já pode entrar com sua nova senha.' };
  };

  // Recuperação SEGURA via link oficial do Supabase Auth: troca o token de
  // recuperação da URL por uma sessão e aplica a nova senha em auth.users
  // (hash Bcrypt). Usada quando o usuário chega pelo link do e-mail.
  const finalizarRecuperacaoViaToken = async (novaSenha: string): Promise<{ success: boolean; message: string }> => {
    const res = await finalizarRecuperacaoViaTokenSupabase(novaSenha);
    return { success: res.success, message: res.message };
  };

  // Indica se a URL atual carrega um token de recuperação do Supabase Auth
  // (o usuário clicou no link do e-mail de recuperação).
  const temTokenRecuperacaoNaUrl = (): boolean => temTokenRecuperacaoNaUrlSupabase();

  // Encerra a sessão: desloga (local + Supabase Auth), limpa a sessão
  // e redireciona de forma segura para a tela de login.
  const logout = async () => {
    try {
      setIsLoggedIn(false);
      localStorage.setItem('sst_is_logged_in', 'false');
      localStorage.removeItem('sst_current_user_id');
      const defaultUser = mockUsuarios.find(u => u.perfil === 'colaborador') || mockUsuarios[0];
      setCurrentUser(defaultUser);
      await signOutSupabase().catch(() => {});
    } catch (e) {
      console.warn('[SSTContext] Aviso durante o logout:', e);
      setIsLoggedIn(false);
    }
  };

  // Banco de perguntas da empresa (inicializado do localStorage ou mock).
  const [perguntas, setPerguntas] = useState<Pergunta[]>(() => {
    return safeJsonParse(localStorage.getItem('sst_perguntas'), mockPerguntas);
  });

  const [campanhas, setCampanhas] = useState<Campanha[]>(() => {
    return safeJsonParse(localStorage.getItem('sst_campanhas'), mockCampanhas);
  });

  const [quizzes, setQuizzes] = useState<QuizSessao[]>(() => {
    return safeJsonParse(localStorage.getItem('sst_quizzes'), mockQuizzesIniciais);
  });

  const [desafios, setDesafios] = useState<Desafio1v1[]>(() => {
    return safeJsonParse(localStorage.getItem('sst_desafios'), mockDesafios);
  });

  const [premiacoes, setPremiacoes] = useState<Premiacao[]>(() => {
    const raw: Premiacao[] = safeJsonParse(localStorage.getItem('sst_premiacoes'), mockPremiacoes);
    // Garante valores padrão para prêmios legados que não têm custo/estoque.
    return raw.map(p => ({
      ...p,
      custo_pontos: (p.custo_pontos && p.custo_pontos > 0) ? p.custo_pontos : 300,
      estoque: p.estoque ?? 10,
      ativo: p.ativo ?? true,
    }));
  });

  const [resgates, setResgates] = useState<ResgatePremio[]>(() => {
    const raw: ResgatePremio[] = safeJsonParse(localStorage.getItem('sst_resgates'), []);
    return raw.map(r => ({
      ...r,
      custo_pontos: (r.custo_pontos && r.custo_pontos > 0) ? r.custo_pontos : 300,
    }));
  });

  // Notifications State
  // Estado das notificações. Se não houver nada salvo, cria notificações
  // de demonstração para o usuário ver o funcionamento logo de cara.
  const [notificacoes, setNotificacoes] = useState<NotificacaoSST[]>(() => {
    const savedRaw = localStorage.getItem('sst_notificacoes');
    if (savedRaw) {
      const parsed = safeJsonParse<NotificacaoSST[] | null>(savedRaw, null);
      if (parsed) return parsed;
    }
    return [
      {
        id: 'notif-1',
        usuario_id: 'todos',
        titulo: '🔔 Quiz Diário Disponível!',
        mensagem: 'Responda ao Quiz de Prevenção NR-35 (Trabalho em Altura) para manter seu Streak de hoje.',
        tipo: 'quiz_diario',
        lida: false,
        criada_em: new Date().toISOString(),
        canal: 'push',
      },
      {
        id: 'notif-2',
        usuario_id: 'usr-colab-2',
        titulo: '⚔️ Desafio 1x1 Recebido',
        mensagem: 'Roberto Almeida te desafiou para uma disputa em Procedimentos Operacionais SST.',
        tipo: 'desafio_1v1',
        lida: false,
        criada_em: new Date(Date.now() - 3600000).toISOString(),
        link_acao: 'des-1',
        canal: 'ambos',
      },
      {
        id: 'notif-3',
        usuario_id: 'usr-colab-1',
        titulo: '⚡ Sua Vez no Desafio 1x1',
        mensagem: 'Roberto Silva respondeu ao desafio em NR-12. É a sua vez de jogar!',
        tipo: 'desafio_1v1',
        lida: false,
        criada_em: new Date(Date.now() - 1800000).toISOString(),
        link_acao: 'des-2',
        canal: 'push',
      }
    ];
  });
  const [showNotificationDrawer, setShowNotificationDrawer] = useState<boolean>(false);

  // Modo offline (sem internet) e fila de ações pendentes de sincronização.
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(false);
  const [itensPendentesSync, setItensPendentesSync] = useState<ItemSincronizacaoOffline[]>(() => {
    // Usa o parser seguro: se o valor salvo estiver corrompido, o app não
    // quebra na inicialização (tela branca) — volta para a lista vazia.
    return safeJsonParse<ItemSincronizacaoOffline[]>(localStorage.getItem('sst_sync_pendentes'), []);
  });

  // Refs to avoid stale closures in event handlers / listeners
  // REFS: mantêm a versão mais recente de alguns estados para uso dentro de
  // callbacks (listeners). Evita "closure desatualizada" (ler valor antigo).
  const itensPendentesSyncRef = useRef(itensPendentesSync);
  useEffect(() => {
    itensPendentesSyncRef.current = itensPendentesSync;
  }, [itensPendentesSync]);
  const usuariosRef = useRef(usuarios);
  useEffect(() => {
    usuariosRef.current = usuarios;
  }, [usuarios]);
  // CORREÇÃO (corrida de hidratação): flag compartilhada entre a hidratação do
  // Supabase (efeito de montagem) e a do IndexedDB. Quando a nuvem entrega dados
  // com sucesso, o IndexedDB NÃO deve sobrescrever com cópia offline antiga.
  const supabaseHidratouRef = useRef(false);
  // CORREÇÃO (reentrância): impede que a sincronização da fila offline rode em
  // paralelo (ex.: evento 'online' + timer de boot) e sobrescreva a fila.
  const syncEmAndamentoRef = useRef(false);
  // CORREÇÃO (loop PERGUNTA↔GABARITO no participante): guarda MONOTÔNICA de
  // revelação POR SESSÃO. Quando duas fontes de verdade (Realtime/Supabase vs
  // polling/Express) divergem — ex.: RPC de apresentação falhou mas o Express
  // recebeu o POST do instrutor — o participante oscilava entre a pergunta e o
  // gabarito a cada evento. Esta guarda registra que a pergunta N de uma sala
  // (na SESSÃO atual) já foi REVELADA e impede que qualquer fonte remota a
  // "des-revele" para o MESMO índice. A troca de sessao_id (reinício da sala)
  // reseta a guarda automaticamente em QUALQUER dispositivo.
  const guardaRevelacaoRef = useRef<Map<string, { sessao: string; idxs: Set<number> }>>(new Map());
  const quizzesRef = useRef(quizzes);
  const currentUserRef = useRef(currentUser);
  // Último reenvio de cada desafio (evita reenviar o mesmo a cada ciclo).
  const repushDesafioRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    quizzesRef.current = quizzes;
  }, [quizzes]);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // PWA & Network Online/Offline Listeners
  // LISTENERS DE CONEXÃO: detecta quando o usuário fica online/offline.
  // Ao voltar a ficar online, dispara a sincronização dos dados pendentes.
  useEffect(() => {
    const handleOnline = () => {
      setIsOfflineMode(false);
      sincronizarDadosPendentes();
    };
    const handleOffline = () => {
      setIsOfflineMode(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // CORREÇÃO (Lacuna 1): ao abrir o app, se houver itens pendentes salvos
  // offline (de uma sessão anterior) e a conexão já estiver online, dispara
  // a sincronização imediatamente — mesmo sem o evento "online" (que só
  // dispara quando a conexão MUDA de estado). Isso garante que quizzes e
  // desafios feitos offline sejam enviados ao banco na próxima abertura.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (navigator.onLine && itensPendentesSyncRef.current.length > 0) {
        sincronizarDadosPendentes();
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  // CORREÇÃO (loop PERGUNTA↔GABARITO): aplica a guarda monotônica de revelação
  // a uma sala recebida de fonte remota (Realtime ou polling Express). Se a
  // pergunta atual (índice N) já foi revelada nesta SESSÃO, uma cópia remota
  // DEFASADA com revelar_resposta_atual=false para o MESMO índice é corrigida
  // para true — impedindo a oscilação entre as duas telas. Também mantém
  // `estado_apresentacao` CONSISTENTE com a revelação (o telão/painel leem
  // esse campo primeiro; sem isso, metade das telas mostrava pergunta e a
  // outra metade gabarito para o mesmo estado).
  const aplicarGuardaRevelacao = (sala: SalaQuizGuiado): SalaQuizGuiado => {
    if (!sala || typeof sala !== 'object') return sala;
    const idx = Number(sala.pergunta_atual_index ?? 0);
    const sessaoAtual = sala.sessao_id || '';
    let entry = guardaRevelacaoRef.current.get(sala.id);
    if (!entry || entry.sessao !== sessaoAtual) {
      // Nova sessão detectada (criação/reinício): reseta a guarda.
      entry = { sessao: sessaoAtual, idxs: new Set<number>() };
      guardaRevelacaoRef.current.set(sala.id, entry);
    }
    if (sala.revelar_resposta_atual === true) {
      entry.idxs.add(idx);
      // NÃO mexe em estado_apresentacao aqui: com revelar=true o estado pode
      // ser legitimamente 'ANSWER_REVEADED' OU 'RANKING_SHOWN'.
      return sala;
    }
    if (entry.idxs.has(idx)) {
      // Regressão detectada: fonte defasada tentou "des-revelar" a pergunta.
      return { ...sala, revelar_resposta_atual: true, estado_apresentacao: 'ANSWER_REVEALED' };
    }
    return sala;
  };

  // Limpa a guarda de revelação de uma sala (usado ao iniciar/reiniciar —
  // nova sessão legítima começa com a pergunta 0 NÃO revelada).
  const limparGuardaRevelacao = (salaId: string) => {
    guardaRevelacaoRef.current.delete(salaId);
  };

  // Supabase Realtime Listener (supabase.channel)
  // LISTENER DO SUPABASE EM TEMPO REAL: quando outro dispositivo altera
  // desafios ou cria notificações, este app recebe a mudança na hora e
  // atualiza a tela automaticamente (sem precisar recarregar).
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const client = getSupabaseClient();
    if (!client) return;

    try {
      const channel = client.channel('public:realtime_sst_channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'salas_quiz_guiado' }, (payload) => {
          if (payload.new) {
            const raw = payload.new as any;
            const updated: SalaQuizGuiado = {
              ...raw,
              status: raw.status === 'finalizada' ? 'concluido' : raw.status
            };
            setSalasQuizGuiado(prev => {
              const idx = prev.findIndex(s => s.id === updated.id);
              if (idx < 0) return [aplicarGuardaRevelacao(updated), ...prev];
              const local = prev[idx];

              // CORREÇÃO (loop PERGUNTA↔GABARITO — causa raiz confirmada nos
              // logs): enquanto o RPC de apresentação falhava, o banco ficava
              // com o sessao_id ANTIGO enquanto Express/local tinham o novo.
              // Cada evento Realtime então parecia "troca de sessão", resetando
              // a guarda e regredindo o participante para a PERGUNTA; o polling
              // seguinte voltava para o GABARITO → oscilação infinita.
              // Regra: evento de SESSÃO ANTIGA (epoch menor) é IGNORADO por
              // completo. Só adotamos eventos da mesma sessão ou de uma nova.
              const sessaoRemotaTs = parseInt(String(updated.sessao_id || '').replace('sess-', ''), 10) || 0;
              const sessaoLocalTs = parseInt(String(local.sessao_id || '').replace('sess-', ''), 10) || 0;
              if (
                updated.sessao_id && local.sessao_id &&
                updated.sessao_id !== local.sessao_id &&
                sessaoRemotaTs < sessaoLocalTs
              ) {
                return prev;
              }

              // CORREÇÃO (regressão crítica: looping/avanço involuntário):
              // a comparação de timestamps causava oscilação entre local e
              // remoto. Solução DETERMINÍSTICA baseada no PAPEL:
              //   - INSTRUTOR (dono da sala): o Realtime NUNCA sobrescreve o
              //     estado de apresentação local (pergunta/status/tempos) —
              //     apenas mescla participantes do remoto.
              //   - PARTICIPANTE: segue o estado remoto (atualizado pelo
              //     instrutor), preservando as próprias respostas.
              // CORREÇÃO (auditoria 2ª sessão — participante travado na tela de
              // espera): apenas o DONO da sala (ou super_admin) é autoridade
              // local; admins participantes seguem o servidor (antes eram
              // tratados como instrutor e não recebiam o `em_andamento`).
              const eInstrutor = currentUser &&
                (local.instrutor_id === currentUser.id || currentUser.perfil === 'super_admin');

              // Mescla participantes (respostas/pontuação) sem perder o local.
              // CORREÇÃO (Problema 2 — participante "fantasma" da sessão
              // anterior): se o remoto veio de uma sessão DIFERENTE (reinício
              // da sala), os participantes locais são da sessão antiga e NÃO
              // podem ser mesclados de volta.
              const sessaoMudou =
                updated.sessao_id && local.sessao_id &&
                updated.sessao_id !== local.sessao_id;

              const participantsMap = new Map<string, ParticipanteSalaQuiz>();
              (updated.participantes || []).forEach(p => participantsMap.set(p.id, p));
              if (!sessaoMudou) {
                (local.participantes || []).forEach(p => {
                  const existing = participantsMap.get(p.id);
                  if (!existing) participantsMap.set(p.id, p);
                  else {
                    // CORREÇÃO (bug: "Você não pontuou" mesmo acertando): prioriza
                    // a correção VALIDADA NO SERVIDOR sobre a local (a local pode
                    // ter `correta: false` do fallback local com sala sanitizada).
                    const respostasMescladas: Record<string, RespostaParticipanteQuiz> = {
                      ...(p.respostas || {}),
                      ...(existing.respostas || {}),
                    };
                    Object.keys(existing.respostas || {}).forEach(k => {
                      const respServer = existing.respostas[k];
                      const respLocal = (p.respostas || {})[k];
                      if (respServer && typeof respServer.correta === 'boolean') {
                        respostasMescladas[k] = respServer;
                      } else if (respLocal && typeof respLocal.correta === 'boolean') {
                        respostasMescladas[k] = respLocal;
                      } else {
                        respostasMescladas[k] = respServer || respLocal;
                      }
                    });
                    participantsMap.set(p.id, {
                      ...existing,
                      ...p,
                      respostas: respostasMescladas,
                      pontuacao_acumulada: Math.max(existing.pontuacao_acumulada || 0, p.pontuacao_acumulada || 0)
                    });
                  }
                });
              }

              const copy = [...prev];
              copy[idx] = aplicarGuardaRevelacao({
                ...(eInstrutor ? local : updated),
                participantes: Array.from(participantsMap.values()),
              });
              return copy;
            });
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'resultados_avaliacao_sst' }, (payload) => {
          if (payload.new) {
            const updated = payload.new as ResultadoAvaliacaoSST;
            setResultadosAvaliacaoSST(prev => {
              const exists = prev.some(r => r.id === updated.id);
              if (exists) return prev.map(r => r.id === updated.id ? { ...r, ...updated } : r);
              return [updated, ...prev];
            });
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'desafios_1v1' }, (payload) => {
          if (payload.new) {
            const updated = payload.new as Desafio1v1;
            // Atualiza a lista local de desafios com o que veio da nuvem.
            setDesafios(prev => {
              const exists = prev.some(d => d.id === updated.id);
              if (exists) return prev.map(d => d.id === updated.id ? { ...d, ...updated } : d);
              return [updated, ...prev];
            });
            // Trigger toast alert if target user
            // Se o desafio envolve o usuário logado, mostra um alerta e insere na lista de notificações
            if (currentUser && (updated.desafiado_id === currentUser.id || updated.desafiante_id === currentUser.id)) {
              const isDesafiado = updated.desafiado_id === currentUser.id;
              const tituloToast = isDesafiado && updated.status === 'pendente' 
                ? '⚔️ Novo Desafio 1x1 Recebido!' 
                : '⚡ Atualização de Desafio 1v1';
              const msgToast = isDesafiado && updated.status === 'pendente'
                ? `Você foi desafiado no tema ${updated.tema_sorteado}! (Aposta: +${updated.aposta_pontos || 50} pts)`
                : `O status do desafio sobre ${updated.tema_sorteado} foi atualizado (${updated.status})!`;

              dispararNotificacaoLembrete({
                titulo: tituloToast,
                mensagem: msgToast,
                tipo: 'desafio_1v1',
                canal: 'push'
              });

              if (isDesafiado && updated.status === 'pendente') {
                const notifId = `notif-desafio-${updated.id}`;
                setNotificacoes(prev => {
                  if (prev.some(n => n.id === notifId || n.link_acao === updated.id)) return prev;
                  return [{
                    id: notifId,
                    usuario_id: currentUser.id,
                    empresa_id: updated.empresa_id,
                    titulo: '⚔️ Novo Desafio 1x1 Recebido!',
                    mensagem: `Você foi desafiado no tema ${updated.tema_sorteado}! (Aposta: +${updated.aposta_pontos || 50} pts)`,
                    tipo: 'desafio_1v1',
                    lida: false,
                    criada_em: updated.data_criacao || new Date().toISOString(),
                    link_acao: updated.id,
                    canal: 'push'
                  }, ...prev];
                });
              }
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'usuarios' }, (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            const updated = payload.new as Usuario;
            setUsuarios(prev => {
              const exists = prev.some(u => u.id === updated.id);
              if (exists) return prev.map(u => u.id === updated.id ? { ...u, ...updated } : u);
              return [updated, ...prev];
            });
            if (currentUserRef.current && currentUserRef.current.id === updated.id) {
              setCurrentUser(prev => ({ ...prev, ...updated }));
            }
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as any).id;
            if (oldId) setUsuarios(prev => prev.filter(u => u.id !== oldId));
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'setores' }, (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            const updated = payload.new as Setor;
            setSetores(prev => {
              const exists = prev.some(s => s.id === updated.id);
              if (exists) return prev.map(s => s.id === updated.id ? { ...s, ...updated } : s);
              return [updated, ...prev];
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as any).id;
            if (oldId) setSetores(prev => prev.filter(s => s.id !== oldId));
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'empresas' }, (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            const updated = payload.new as Empresa;
            setEmpresas(prev => {
              const exists = prev.some(e => e.id === updated.id);
              if (exists) return prev.map(e => e.id === updated.id ? { ...e, ...updated } : e);
              return [updated, ...prev];
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as any).id;
            if (oldId) setEmpresas(prev => prev.filter(e => e.id !== oldId));
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes' }, (payload) => {
          if (payload.new) {
            const notif = payload.new as NotificacaoSST;
            // Nova notificação chegou da nuvem; mostra apenas se é para
            // este usuário ou para todos — e nunca se foi apagada antes.
            if (currentUser && (notif.usuario_id === currentUser.id || notif.usuario_id === 'todos')) {
              try {
                const excluidas = JSON.parse(localStorage.getItem('sst_notificacoes_excluidas') || '[]');
                if (Array.isArray(excluidas) && excluidas.includes(notif.id)) return;
              } catch {
                // Segue o fluxo normal.
              }
              setNotificacoes(prev => [notif, ...prev]);
            }
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'campanhas' }, (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            const updated = payload.new as Campanha;
            setCampanhas(prev => {
              const exists = prev.some(c => c.id === updated.id);
              if (exists) return prev.map(c => c.id === updated.id ? { ...c, ...updated } : c);
              return [updated, ...prev];
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as any).id;
            if (oldId) setCampanhas(prev => prev.filter(c => c.id !== oldId));
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'perguntas' }, (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            const updated = payload.new as Pergunta;
            setPerguntas(prev => {
              const exists = prev.some(p => p.id === updated.id);
              if (exists) return prev.map(p => p.id === updated.id ? { ...p, ...updated } : p);
              return [updated, ...prev];
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as any).id;
            if (oldId) setPerguntas(prev => prev.filter(p => p.id !== oldId));
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'quizzes' }, (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            const updated = payload.new as QuizSessao;
            setQuizzes(prev => {
              const exists = prev.some(q => q.id === updated.id);
              if (exists) return prev.map(q => q.id === updated.id ? { ...q, ...updated } : q);
              return [updated, ...prev];
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as any).id;
            if (oldId) setQuizzes(prev => prev.filter(q => q.id !== oldId));
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'premiacoes' }, (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            const updated = payload.new as Premiacao;
            setPremiacoes(prev => {
              const exists = prev.some(p => p.id === updated.id);
              if (exists) return prev.map(p => p.id === updated.id ? { ...p, ...updated } : p);
              return [updated, ...prev];
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as any).id;
            if (oldId) setPremiacoes(prev => prev.filter(p => p.id !== oldId));
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'resgates_premios' }, (payload) => {
          if (payload.new && Object.keys(payload.new).length > 0) {
            const updated = payload.new as ResgatePremio;
            setResgates(prev => {
              const exists = prev.some(r => r.id === updated.id);
              if (exists) return prev.map(r => r.id === updated.id ? { ...r, ...updated } : r);
              return [updated, ...prev];
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const oldId = (payload.old as any).id;
            if (oldId) setResgates(prev => prev.filter(r => r.id !== oldId));
          }
        })
        .subscribe();

      // CORREÇÃO (QA/estabilidade): removido o polling de 3s do Supabase
      // para salas — o Realtime (acima) + o polling do Express (1,5s) já
      // cobrem as atualizações. Três mecanismos simultâneos causavam
      // re-renders constantes e instabilidade de tela.

      return () => {
        client.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Realtime subscription error:', err);
    }
  }, [currentUser]);

  // Polling em tempo real via Express API local para salas do Quiz Guiado
  useEffect(() => {
    const syncRoomsWithExpress = async () => {
      try {
        const res = await apiFetch('/api/salas_quiz_guiado');
        if (res.ok) {
          const remoteRaw: SalaQuizGuiado[] = await res.json();
          const remoteSalas = Array.isArray(remoteRaw)
            ? remoteRaw
            : [];
          if (Array.isArray(remoteSalas) && remoteSalas.length > 0) {
            setSalasQuizGuiado(prev => {
              if (prev.length === 0) return remoteSalas;
              
              const mergedMap = new Map<string, SalaQuizGuiado>();
              prev.forEach(s => mergedMap.set(s.id, s));

              remoteSalas.forEach(remote => {
                const local = mergedMap.get(remote.id);
                if (!local) {
                  mergedMap.set(remote.id, remote);
                } else {
                  // Se a sessao_id mudou (ex: sala foi reiniciada), a versao mais recente substitui a antiga
                  if (remote.sessao_id && local.sessao_id && remote.sessao_id !== local.sessao_id) {
                    const remoteTime = parseInt((remote.sessao_id || '').replace('sess-', ''), 10) || 0;
                    const localTime = parseInt((local.sessao_id || '').replace('sess-', ''), 10) || 0;
                    if (remoteTime >= localTime) {
                      // CORREÇÃO (loop PERGUNTA↔GABARITO): passa pela guarda —
                      // detecta a troca de sessão e reseta o estado revelado.
                      mergedMap.set(remote.id, aplicarGuardaRevelacao(remote));
                      return;
                    } else {
                      return;
                    }
                  }

                  // Merge participantes e respostas
                  // CORREÇÃO (Problema 2 — participante da sessão anterior
                  // "fantasma"): se o REMOTO veio de uma SESSÃO DIFERENTE
                  // (reinício da sala pelo instrutor), os participantes LOCAIS
                  // são da sessão antiga e NÃO podem ser mesclados — senão o
                  // participante antigo reaparece e é reutilizado por nome na
                  // nova sessão (travando a 1ª pergunta). Só mesclamos quando
                  // a sessão é a mesma.
                  const sessaoMudou =
                    remote.sessao_id && local.sessao_id &&
                    remote.sessao_id !== local.sessao_id;

                  const participantsMap = new Map<string, ParticipanteSalaQuiz>();
                  (remote.participantes || []).forEach(p => participantsMap.set(p.id, p));
                  if (!sessaoMudou) {
                    (local.participantes || []).forEach(p => {
                      const existing = participantsMap.get(p.id);
                      if (!existing) {
                        participantsMap.set(p.id, p);
                      } else {
                        // CORREÇÃO (bug: "Você não pontuou" mesmo acertando): o
                        // merge dava prioridade às respostas LOCAIS
                        // (`...p.respostas` sobrescrevia o servidor). Se o local
                        // tinha `correta: false` (fallback local com sala
                        // sanitizada), ele sobrescrevia o `correta: true` validado
                        // no servidor. Agora, para cada pergunta, a resposta do
                        // SERVIDOR (existing — autoridade da correção) prevalece
                        // quando ela tem `correta` booleano definido.
                        const respostasMescladas: Record<string, RespostaParticipanteQuiz> = {
                          ...(p.respostas || {}),
                          ...(existing.respostas || {}),
                        };
                        Object.keys(existing.respostas || {}).forEach(k => {
                          const respServer = existing.respostas[k];
                          const respLocal = (p.respostas || {})[k];
                          if (respServer && typeof respServer.correta === 'boolean') {
                            respostasMescladas[k] = respServer;
                          } else if (respLocal && typeof respLocal.correta === 'boolean') {
                            respostasMescladas[k] = respLocal;
                          } else {
                            respostasMescladas[k] = respServer || respLocal;
                          }
                        });
                        participantsMap.set(p.id, {
                          ...existing,
                          ...p,
                          respostas: respostasMescladas,
                          pontuacao_acumulada: Math.max(existing.pontuacao_acumulada || 0, p.pontuacao_acumulada || 0)
                        });
                      }
                    });
                  }

                  // CORREÇÃO (regressão crítica: looping/avanço involuntário):
                  // a lógica de comparação de timestamps causava oscilação —
                  // o estado alternava entre local e remoto a cada polling,
                  // revertendo o progresso do instrutor e travando o usuário.
                  // Solução DETERMINÍSTICA baseada no PAPEL:
                  //   - INSTRUTOR (dono da sala): a tela dele é a AUTORIDADE do
                  //     estado de apresentação (pergunta atual, status, tempos,
                  //     gabarito revelado). O polling NUNCA sobrescreve o estado
                  //     local — apenas mescla participantes/respostas do remoto.
                  //   - PARTICIPANTE: segue o estado REMOTO (servidor), que é
                  //     atualizado pelo instrutor; preserva as próprias respostas.
                  // CORREÇÃO (auditoria 2ª sessão — participante travado na tela
                  // de espera): antes, QUALQUER admin da mesma empresa era tratado
                  // como "instrutor" (autoridade local). Isso fazia um participante
                  // que é admin/instrutor NÃO seguir o `em_andamento` enviado pelo
                  // instrutor — ele ficava preso em "aguardando". Agora apenas o
                  // DONO da sala (ou super_admin) é autoridade local; os demais
                  // (inclusive admins participantes) seguem o servidor.
                  const eInstrutor = currentUser &&
                    (local.instrutor_id === currentUser.id || currentUser.perfil === 'super_admin');

                  let base: SalaQuizGuiado;
                  if (eInstrutor) {
                    base = local; // instrutor controla o estado de apresentação
                  } else {
                    // CORREÇÃO (loop PERGUNTA↔GABARITO): o remoto pode estar
                    // defasado (ex.: RPC de apresentação falhou e o Supabase
                    // ainda tem revelar=false enquanto o Express já tem true).
                    // A guarda impede a regressão para o mesmo índice.
                    base = aplicarGuardaRevelacao(remote); // participante segue o servidor
                  }

                  mergedMap.set(remote.id, aplicarGuardaRevelacao({
                    ...base,
                    // Mescla participantes (respostas/pontuação) das duas fontes,
                    // dando prioridade ao mais recente por resposta.
                    participantes: Array.from(participantsMap.values()),
                  }));
                }
              });

              return Array.from(mergedMap.values());
            });
          }
        }
      } catch (e) {
        // Express backend route polling failover
      }
    };

    syncRoomsWithExpress();
    const interval = setInterval(syncRoomsWithExpress, 1500);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Polling automático de Desafios 1x1 via Supabase (sem precisar sair/logar).
  // O Realtime nem sempre chega no celular (rede móvel, app em 2º plano,
  // publicação desativada). Este polling busca os desafios da empresa a cada
  // 4 segundos e mescla com o estado local, adotando sempre a versão mais
  // adiantada (mais respostas / mais perguntas / concluído).
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const empresaId = empresa?.id;
    if (!empresaId) return;

    let parado = false;
    const syncDesafiosComNuvem = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        const client = getSupabaseClient();
        if (!client) return;
        const { data: remotos, error } = await client
          .from('desafios_1v1')
          .select('*')
          .eq('empresa_id', empresaId)
          .order('data_criacao', { ascending: false })
          .limit(50);
        if (error || !Array.isArray(remotos) || remotos.length === 0 || parado) return;
        setDesafios(prev => {
          if (!Array.isArray(prev) || prev.length === 0) return remotos as Desafio1v1[];
          const mapa = new Map<string, Desafio1v1>();
          prev.forEach(d => { if (d && d.id) mapa.set(d.id, d); });
          let mudou = false;
          (remotos as Desafio1v1[]).forEach(remoto => {
            if (!remoto || !remoto.id) return;
            const local = mapa.get(remoto.id);
            if (!local) {
              mapa.set(remoto.id, remoto);
              mudou = true;
              return;
            }
            const respDesafianteLocal = (local.respostas_desafiante || []).length;
            const respDesafianteRemoto = ((remoto as any).respostas_desafiante || []).length;
            const respDesafiadoLocal = (local.respostas_desafiado || []).length;
            const respDesafiadoRemoto = ((remoto as any).respostas_desafiado || []).length;
            const perguntasLocal = (local.perguntas || []).length;
            const perguntasRemoto = ((remoto as any).perguntas || []).length;
            const remotoConcluido = (remoto as any).status === 'concluido';
            const localConcluido = (local as any).status === 'concluido';
            // Adota a nuvem quando ela está mais adiantada (mais respostas,
            // mais perguntas de desempate ou já concluída).
            const remotoMaisAdiantado =
              remotoConcluido && !localConcluido ||
              respDesafianteRemoto > respDesafianteLocal ||
              respDesafiadoRemoto > respDesafiadoLocal ||
              perguntasRemoto > perguntasLocal;
            // Cura de divergência: se o aparelho local está MAIS adiantado
            // (respondeu mas a nuvem não recebeu — ex.: falhou o envio),
            // reenvia o desafio local para a nuvem (no máximo 1x por minuto
            // por desafio). Sem isso os dois lados esperam para sempre.
            const localMaisAdiantado =
              !remotoMaisAdiantado && (
                respDesafianteLocal > respDesafianteRemoto ||
                respDesafiadoLocal > respDesafiadoRemoto ||
                perguntasLocal > perguntasRemoto ||
                (localConcluido && !remotoConcluido)
              );
            if (localMaisAdiantado) {
              const agora = Date.now();
              const ultimo = repushDesafioRef.current.get(local.id) || 0;
              if (agora - ultimo > 60000) {
                repushDesafioRef.current.set(local.id, agora);
                supabaseService.upsertDesafio(local).catch(() => {});
              }
            }
            if (remotoMaisAdiantado) {
              // Mescla sem perder nada: pega o maior array de cada lado.
              const mesclado: Desafio1v1 = {
                ...local,
                ...remoto,
                perguntas: perguntasRemoto >= perguntasLocal ? (remoto as any).perguntas : local.perguntas,
                respostas_desafiante: respDesafianteRemoto >= respDesafianteLocal
                  ? (remoto as any).respostas_desafiante : local.respostas_desafiante,
                respostas_desafiado: respDesafiadoRemoto >= respDesafiadoLocal
                  ? (remoto as any).respostas_desafiado : local.respostas_desafiado,
              } as Desafio1v1;
              mapa.set(remoto.id, mesclado);
              mudou = true;
            }
          });
          if (!mudou) return prev;
          return Array.from(mapa.values());
        });
      } catch (e) {
        // Falha silenciosa: tenta de novo no próximo ciclo.
      }
    };

    syncDesafiosComNuvem();
    const interval = setInterval(syncDesafiosComNuvem, 4000);
    return () => { parado = true; clearInterval(interval); };
  }, [empresa?.id]);

  // Polling geral de reforço (campanhas, pontos, ranks, prêmios, resgates).
  // O Realtime cobre o caminho rápido; este polling a cada 10s garante que
  // nada fique desatualizado no celular mesmo se o Realtime falhar — e sem
  // precisar sair/logar. Ranks são calculados dos dados, então atualizam
  // sozinhos quando usuários/desafios/quizzes chegam.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const empresaId = empresa?.id;
    if (!empresaId) return;

    let parado = false;
    const mergePorId = <T extends { id: string }>(prev: T[], remotos: T[]): { lista: T[]; mudou: boolean } => {
      const mapa = new Map<string, T>();
      prev.forEach(item => { if (item && item.id) mapa.set(item.id, item); });
      let mudou = false;
      remotos.forEach(remoto => {
        if (!remoto || !remoto.id) return;
        const local = mapa.get(remoto.id);
        if (!local) {
          mapa.set(remoto.id, remoto);
          mudou = true;
        } else if (JSON.stringify(local) !== JSON.stringify({ ...local, ...remoto })) {
          mapa.set(remoto.id, { ...local, ...remoto });
          mudou = true;
        }
      });
      return { lista: Array.from(mapa.values()), mudou };
    };

    const syncGeralComNuvem = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        const client = getSupabaseClient();
        if (!client) return;
        const [camp, quiz, prem, resg, users] = await Promise.all([
          client.from('campanhas').select('*').eq('empresa_id', empresaId).limit(50),
          client.from('quizzes').select('*').eq('empresa_id', empresaId).order('data_conclusao', { ascending: false }).limit(50),
          client.from('premiacoes').select('*').eq('empresa_id', empresaId).limit(50),
          client.from('resgates_premios').select('*').eq('empresa_id', empresaId).order('data_solicitacao', { ascending: false }).limit(50),
          client.from('usuarios').select('*').eq('empresa_id', empresaId).limit(200),
        ]);
        if (parado) return;
        if (camp.data && Array.isArray(camp.data)) {
          setCampanhas(prev => {
            const { lista, mudou } = mergePorId(prev || [], camp.data as Campanha[]);
            return mudou ? lista : prev;
          });
        }
        if (quiz.data && Array.isArray(quiz.data)) {
          setQuizzes(prev => {
            const { lista, mudou } = mergePorId(prev || [], quiz.data as QuizSessao[]);
            return mudou ? lista : prev;
          });
        }
        if (prem.data && Array.isArray(prem.data)) {
          setPremiacoes(prev => {
            const { lista, mudou } = mergePorId(prev || [], prem.data as Premiacao[]);
            return mudou ? lista : prev;
          });
        }
        if (resg.data && Array.isArray(resg.data)) {
          setResgates(prev => {
            const { lista, mudou } = mergePorId(prev || [], resg.data as ResgatePremio[]);
            return mudou ? lista : prev;
          });
        }
        if (users.data && Array.isArray(users.data)) {
          // Pontos e ranks vêm dos usuários: adota a nuvem quando ela tem
          // mais pontos (progrediu em outro aparelho).
          setUsuarios(prev => {
            const mapa = new Map<string, Usuario>();
            (prev || []).forEach(u => { if (u && u.id) mapa.set(u.id, u); });
            let mudou = false;
            (users.data as Usuario[]).forEach(remoto => {
              if (!remoto || !remoto.id) return;
              const local = mapa.get(remoto.id);
              if (!local) {
                mapa.set(remoto.id, remoto);
                mudou = true;
              } else {
                const pontosLocal = (local.estatisticas?.pontos_totais || 0);
                const pontosRemotos = ((remoto as any).estatisticas?.pontos_totais || 0);
                if (pontosRemotos >= pontosLocal && JSON.stringify(local) !== JSON.stringify({ ...local, ...remoto })) {
                  mapa.set(remoto.id, { ...local, ...remoto });
                  mudou = true;
                }
              }
            });
            if (!mudou) return prev;
            return Array.from(mapa.values());
          });
        }
      } catch (e) {
        // Falha silenciosa: tenta de novo no próximo ciclo.
      }
    };

    syncGeralComNuvem();
    const interval = setInterval(syncGeralComNuvem, 10000);
    // Quando a internet voltar, atualiza na hora (sem esperar o ciclo).
    const aoVoltarOnline = () => { syncGeralComNuvem(); };
    window.addEventListener('online', aoVoltarOnline);
    return () => { parado = true; clearInterval(interval); window.removeEventListener('online', aoVoltarOnline); };
  }, [empresa?.id]);

  // Safe localStorage helper
  // Ajudante para salvar no localStorage com proteção contra falhas
  // (ex.: navegador em modo privado sem permissão de gravação).
  // FASE 7: além do localStorage (cache síncrono), grava em DUPLICIDADE no
  // IndexedDB (cópia durável, sem limite de 5MB). Falhas silenciosas.
  const safeSetItem = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[Storage Warning] Não foi possível salvar ${key} no localStorage:`, e);
    }
    idbSet(key, value);
  };

  // Persist state updates to localStorage
  // Toda vez que um estado muda, o valor é salvo no localStorage.
  // É assim que os dados "sobrevivem" ao fechar o navegador.
  useEffect(() => {
    safeSetItem('sst_notificacoes', JSON.stringify(notificacoes));
  }, [notificacoes]);

  useEffect(() => {
    safeSetItem('sst_empresa', JSON.stringify(empresa));
  }, [empresa]);

  // CORREÇÃO (persistência): o array completo de empresas também é salvo no
  // localStorage. Antes só o objeto "empresa" (o selecionado) era persistido;
  // após um reload, o array vinha desatualizado do localStorage e o login()
  // reaplicava a configuração antiga (ex.: regras de troféus e imagens perdidas).
  useEffect(() => {
    safeSetItem('sst_empresas', JSON.stringify(empresas));
  }, [empresas]);

  useEffect(() => {
    safeSetItem('sst_setores', JSON.stringify(setores));
  }, [setores]);

  useEffect(() => {
    safeSetItem('sst_usuarios', JSON.stringify(usuarios));
  }, [usuarios]);

  useEffect(() => {
    safeSetItem('sst_current_user_id', currentUser.id);
  }, [currentUser]);

  useEffect(() => {
    safeSetItem('sst_perguntas', JSON.stringify(perguntas));
  }, [perguntas]);

  useEffect(() => {
    safeSetItem('sst_campanhas', JSON.stringify(campanhas));
  }, [campanhas]);

  useEffect(() => {
    safeSetItem('sst_quizzes', JSON.stringify(quizzes));
  }, [quizzes]);

  useEffect(() => {
    safeSetItem('sst_desafios', JSON.stringify(desafios));
  }, [desafios]);

  useEffect(() => {
    safeSetItem('sst_premiacoes', JSON.stringify(premiacoes));
  }, [premiacoes]);

  useEffect(() => {
    safeSetItem('sst_resgates', JSON.stringify(resgates));
  }, [resgates]);

  useEffect(() => {
    safeSetItem('sst_sync_pendentes', JSON.stringify(itensPendentesSync));
  }, [itensPendentesSync]);

  // Notification handlers
  // --- Manipuladores de notificações ---
  // Lista de avisos já apagados pelo usuário (guardada no aparelho). Serve
  // de "lista negra": mesmo se a nuvem ainda tiver o aviso (ex.: falhou ao
  // apagar por falta de internet), ele NÃO volta para a tela.
  const lerNotificacoesExcluidas = (): Set<string> => {
    try {
      const raw = localStorage.getItem('sst_notificacoes_excluidas');
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  };
  const gravarNotificacoesExcluidas = (ids: string[]) => {
    try {
      const atual = lerNotificacoesExcluidas();
      ids.forEach(id => { if (id) atual.add(id); });
      const lista = Array.from(atual).slice(-500);
      localStorage.setItem('sst_notificacoes_excluidas', JSON.stringify(lista));
    } catch {
      // Ignora.
    }
  };
  const marcarNotificacaoComoLida = (id: string) => {
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
    if (isSupabaseConfigured()) {
      supabaseService.marcarNotificacaoLida(id);
    }
  };

  const marcarTodasNotificacoesComoLidas = () => {
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
    if (isSupabaseConfigured()) {
      notificacoes.forEach(n => {
        if (!n.lida) supabaseService.marcarNotificacaoLida(n.id);
      });
    }
  };

  const excluirNotificacao = (id: string) => {
    gravarNotificacoesExcluidas([id]);
    setNotificacoes(prev => prev.filter(n => n.id !== id));
    if (isSupabaseConfigured()) {
      supabaseService.deleteNotificacao(id);
    }
  };

  // Limpa todas as notificações PESSOAIS do usuário logado
  // (mantém as destinadas a outros usuários). Apaga também na nuvem para
  // não voltarem ao reabrir o app, e registra na lista negra local.
  const limparTodasNotificacoes = () => {
    const minhas = notificacoes.filter(n => n.usuario_id === currentUser?.id || n.usuario_id === 'todos');
    gravarNotificacoesExcluidas(minhas.map(n => n.id));
    if (isSupabaseConfigured()) {
      minhas.forEach(n => {
        try {
          supabaseService.deleteNotificacao(n.id);
        } catch {
          // A lista negra local já impede que voltem.
        }
      });
    }
    setNotificacoes(prev => {
      const remaining = prev.filter(n => n.usuario_id !== currentUser?.id && n.usuario_id !== 'todos');
      localStorage.setItem('sst_notificacoes', JSON.stringify(remaining));
      return remaining;
    });
  };

  // Cria uma notificação instantânea (toast) para o usuário logado.
  const dispararNotificacaoLembrete = (dados: { 
    titulo: string; 
    mensagem: string; 
    tipo: NotificacaoSST['tipo']; 
    canal?: 'push' | 'email' | 'ambos' 
  }) => {
    const novaNotif: NotificacaoSST = {
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      usuario_id: currentUser ? currentUser.id : 'todos',
      titulo: dados.titulo,
      mensagem: dados.mensagem,
      tipo: dados.tipo,
      lida: false,
      criada_em: new Date().toISOString(),
      canal: dados.canal || 'push',
    };
    setNotificacoes(prev => [novaNotif, ...prev]);
  };

  // Certificate handlers
  // Offline queue processor when going back online
  // PROCESSADOR DA FILA OFFLINE: executa, na ordem, cada ação que ficou
  // pendente enquanto o usuário estava sem internet. Garante que nenhum
  // dado se perca quando a conexão voltar.
  const sincronizarDadosPendentes = async () => {
    // Guarda de reentrância: se uma sincronização já está em andamento
    // (ex.: disparada pelo evento 'online' e pelo timer de boot ao mesmo
    // tempo), a segunda chamada é ignorada para não corromper a fila.
    if (syncEmAndamentoRef.current) return;
    const pendentes = itensPendentesSyncRef.current;
    if (pendentes.length === 0) return;
    syncEmAndamentoRef.current = true;
    const count = pendentes.length;
    const falharam: ItemSincronizacaoOffline[] = [];

    try {

    for (const item of pendentes) {
      let ok = true;
      try {
        if (item.tipo === 'RESPONDER_QUIZ') {
          const payload = item.payload as {
            quizId: string;
            respostas: DetalheRespostaQuiz[];
            pontosGanhos: number;
            usuarioId: string;
            quizSnapshot?: QuizSessao | null;
            usuarioSnapshot?: Usuario;
          };
          // 1) Sincroniza o quiz concluído (do snapshot; fallback para o estado atual).
          const quizParaEnviar = payload.quizSnapshot || quizzesRef.current.find(q => q.id === payload.quizId);
          if (quizParaEnviar) {
            const qOk = await supabaseService.upsertQuiz(quizParaEnviar);
            if (!qOk) ok = false;
          }
          // 2) Sincroniza o usuário com as estatísticas/troféus atualizados.
          const usuarioParaEnviar = payload.usuarioSnapshot || usuariosRef.current.find(u => u.id === payload.usuarioId);
          if (usuarioParaEnviar) {
            const uOk = await supabaseService.upsertUsuario(usuarioParaEnviar);
            if (!uOk) ok = false;
          }
        } else if (item.tipo === 'CRIAR_DESAFIO') {
          const dOk = await supabaseService.upsertDesafio(item.payload as Desafio1v1);
          if (!dOk) ok = false;
        } else if (item.tipo === 'RESPONDER_DESAFIO') {
          const dOk = await supabaseService.upsertDesafio(item.payload as Desafio1v1);
          if (!dOk) ok = false;
        } else if (item.tipo === 'SOLICITAR_RESGATE') {
          // Resgate feito offline: envia o registro do resgate + o usuário com
          // o saldo descontado + a premiação com o estoque reduzido.
          const payload = item.payload as {
            resgate: ResgatePremio;
            usuarioSnapshot?: Usuario;
            premiacaoSnapshot?: Premiacao;
          };
          const rOk = await supabaseService.upsertResgatePremio(payload.resgate);
          if (!rOk) ok = false;
          if (payload.usuarioSnapshot) {
            const uOk = await supabaseService.upsertUsuario(payload.usuarioSnapshot);
            if (!uOk) ok = false;
          }
          if (payload.premiacaoSnapshot) {
            const pOk = await supabaseService.upsertPremiacao(payload.premiacaoSnapshot);
            if (!pOk) ok = false;
          }
        } else if (item.tipo === 'ATUALIZAR_RESGATE') {
          // Admin aprovou/rejeitou/entregou um resgate offline: envia o status
          // atualizado + usuário (reembolso) + premiação (estoque restaurado).
          const payload = item.payload as {
            resgate: ResgatePremio;
            usuarioSnapshot?: Usuario;
            premiacaoSnapshot?: Premiacao;
          };
          const rOk = await supabaseService.upsertResgatePremio(payload.resgate);
          if (!rOk) ok = false;
          if (payload.usuarioSnapshot) {
            const uOk = await supabaseService.upsertUsuario(payload.usuarioSnapshot);
            if (!uOk) ok = false;
          }
          if (payload.premiacaoSnapshot) {
            const pOk = await supabaseService.upsertPremiacao(payload.premiacaoSnapshot);
            if (!pOk) ok = false;
          }
        } else if (item.tipo === 'EDITAR_PERFIL') {
          // Perfil editado offline: envia o snapshot do usuário atualizado.
          const payload = item.payload as { usuarioSnapshot: Usuario };
          if (payload.usuarioSnapshot) {
            const uOk = await supabaseService.upsertUsuario(payload.usuarioSnapshot);
            if (!uOk) ok = false;
          }
        } else if (item.tipo === 'usuario' || item.tipo === 'CRIAR_USUARIO' || item.tipo === 'EDITAR_USUARIO') {
          const target = (item.payload && (item.payload as any).usuarioSnapshot) ? (item.payload as any).usuarioSnapshot : (item.payload as Usuario);
          if (target) {
            const uOk = await supabaseService.upsertUsuario(target);
            if (!uOk) ok = false;
          }
        } else if (item.tipo === 'EXCLUIR_USUARIO') {
          const userId = typeof item.payload === 'string' ? item.payload : (item.payload as any)?.id;
          if (userId) {
            await supabaseService.deleteUsuario(userId);
          }
        } else if (item.tipo === 'setor' || item.tipo === 'CRIAR_SETOR' || item.tipo === 'EDITAR_SETOR') {
          await supabaseService.upsertSetor(item.payload as Setor);
        } else if (item.tipo === 'EXCLUIR_SETOR') {
          const setorId = typeof item.payload === 'string' ? item.payload : (item.payload as any)?.id;
          if (setorId) {
            await supabaseService.deleteSetor(setorId);
          }
        } else if (item.tipo === 'empresa' || item.tipo === 'CRIAR_EMPRESA' || item.tipo === 'EDITAR_EMPRESA') {
          await supabaseService.upsertEmpresa(item.payload as Empresa);
        } else if (item.tipo === 'EXCLUIR_EMPRESA') {
          const empId = typeof item.payload === 'string' ? item.payload : (item.payload as any)?.id;
          if (empId) {
            await supabaseService.deleteEmpresa(empId);
          }
        } else if (item.tipo === 'pergunta' || item.tipo === 'CRIAR_PERGUNTA' || item.tipo === 'EDITAR_PERGUNTA') {
          await supabaseService.upsertPergunta(item.payload as Pergunta);
        } else if (item.tipo === 'EXCLUIR_PERGUNTA') {
          const pergId = typeof item.payload === 'string' ? item.payload : (item.payload as any)?.id;
          if (pergId) {
            await supabaseService.deletePergunta(pergId);
          }
        } else if (item.tipo === 'campanha' || item.tipo === 'CRIAR_CAMPANHA' || item.tipo === 'EDITAR_CAMPANHA') {
          await supabaseService.upsertCampanha(item.payload as Campanha);
        } else if (item.tipo === 'EXCLUIR_CAMPANHA') {
          const campId = typeof item.payload === 'string' ? item.payload : (item.payload as any)?.id;
          if (campId) {
            await supabaseService.deleteCampanha(campId);
          }
        } else if (item.tipo === 'premiacao' || item.tipo === 'CRIAR_PREMIACAO' || item.tipo === 'EDITAR_PREMIACAO') {
          await supabaseService.upsertPremiacao(item.payload as Premiacao);
        } else if (item.tipo === 'EXCLUIR_PREMIACAO') {
          const premId = typeof item.payload === 'string' ? item.payload : (item.payload as any)?.id;
          if (premId) {
            await supabaseService.deletePremiacao(premId);
          }
        }
      } catch (err) {
        console.warn('Erro ao sincronizar item offline:', err);
        ok = false;
      }
      if (!ok) falharam.push(item);
    }

    // Mantém na fila apenas os itens que falharam, para serem reenviados na
    // próxima reconexão. Itens com sucesso são removidos (sem perda de dados).
    if (falharam.length > 0) {
      setItensPendentesSync(falharam);
    } else {
      setItensPendentesSync([]);
    }

    const sucesso = count - falharam.length;
    if (sucesso > 0) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.7 } });
      dispararNotificacaoLembrete({
        titulo: '⚡ Dados Sincronizados!',
        mensagem: falharam.length > 0
          ? `${sucesso} item(ns) sincronizado(s). ${falharam.length} ainda aguardam nova conexão.`
          : `${count} item(ns) enviado(s) offline foram sincronizados com o banco de dados.`,
        tipo: 'quiz_diario',
        canal: 'push'
      });
    }

    // Busca novidades atualizadas da nuvem caso a sincronização de saída tenha concluído
    if (falharam.length === 0 && isSupabaseConfigured()) {
      supabaseService.fetchAllData().then(data => {
        if (data.usuarios && Array.isArray(data.usuarios)) setUsuarios(data.usuarios);
        if (data.setores && Array.isArray(data.setores)) setSetores(data.setores);
        if (data.empresas && Array.isArray(data.empresas)) setEmpresas(data.empresas);
        if (data.perguntas && Array.isArray(data.perguntas)) setPerguntas(data.perguntas);
        if (data.campanhas && Array.isArray(data.campanhas)) setCampanhas(data.campanhas);
        if (data.quizzes && Array.isArray(data.quizzes)) setQuizzes(data.quizzes);
        if (data.desafios && Array.isArray(data.desafios)) setDesafios(data.desafios);
        if (data.premiacoes && Array.isArray(data.premiacoes)) setPremiacoes(data.premiacoes);
      }).catch(err => console.warn('Erro ao puxar dados da nuvem apos sincronizacao:', err));
    }
    } finally {
      syncEmAndamentoRef.current = false;
    }
  };

  // Fair Sector Ranking calculation based on rule 21-25:
  // Sector Media = (Total Sector Quiz Points + Total Sector Challenge Points) / Active Sector Collaborators.
  // ONLY users with u.perfil === 'colaborador' are included in sector metrics and 50% participation threshold!
  // RANKING DE SETORES "JUSTO":
  // Média do setor = (pontos de quiz + pontos de desafios do setor) / nº de colaboradores ativos.
  // IMPORTANTE: só usuários com perfil 'colaborador' entram no cálculo, e o
  // setor só é elegível se tiver participação mínima (padrão 50%).
  const getRankingsSetores = (): RankingSetorData[] => {
    return setores
      .filter(s => s.empresa_id === empresa.id)
      .map(setor => {
      // Find all active colaboradores in sector (EXCLUDING super_admin, admin and inactive users)
      // Colaboradores ATIVOS do setor (exclui admin, super admin e inativos).
      const colabsSetor = usuarios.filter(u => u.setor_id === setor.id && u.empresa_id === empresa.id && u.perfil === 'colaborador' && u.ativo !== false);
      const totalColaboradoresAtivos = colabsSetor.length || 1;

      // Colaboradores who responded to at least 1 quiz or completed challenge
      // Colaboradores que jogaram pelo menos 1 quiz ou desafio (participantes).
      const colabsParticipantes = colabsSetor.filter(u => 
        u.estatisticas.quizzes_respondidos > 0 || u.estatisticas.desafios_jogados > 0
      ).length;

      const taxaParticipacao = Math.min(
        100, 
        Math.round((colabsParticipantes / totalColaboradoresAtivos) * 100)
      );

      // Check 50% participation eligibility rule
      // Regra de elegibilidade: participação mínima (padrão 50%).
      const elegivel = taxaParticipacao >= (empresa.configuracoes.percentualMinimoParticipacao ?? 50);

      // Sum quiz points for sector (colaboradores only)
      // Soma os pontos de quiz dos colaboradores do setor.
      const totalPontosQuizzes = colabsSetor.reduce((acc, u) => acc + (u.estatisticas.pontos_quizzes || 0), 0);

      // Sum competitive challenge points won by sector
      // Soma os pontos ganhos pelo setor em desafios competitivos concluídos.
      const totalPontosDesafios = desafios
        .filter(d => d.status === 'concluido' && d.vale_ponto && d.vencedor_setor_id === setor.id)
        .reduce((acc, d) => acc + (d.pontuacao_setor || 50), 0);

      const totalPontos = totalPontosQuizzes + totalPontosDesafios;
      
      // Fair Media calculation: total / active collaborators count
      // Média "justa": total de pontos dividido pelo nº de colaboradores ativos.
      const pontuacaoMedia = Number((totalPontos / totalColaboradoresAtivos).toFixed(1));

      return {
        setor_id: setor.id,
        setor_nome: setor.nome,
        total_pontos_quizzes: totalPontosQuizzes,
        total_pontos_desafios: totalPontosDesafios,
        total_pontos: totalPontos,
        total_colaboradores_ativos: totalColaboradoresAtivos,
        colaboradores_participantes: colabsParticipantes,
        taxa_participacao: taxaParticipacao,
        elegivel: elegivel,
        pontuacao_media: pontuacaoMedia,
        posicao: 0,
      };
    })
    // Ordena: setores elegíveis primeiro, depois pela média de pontos (maior → menor).
    .sort((a, b) => {
      if (a.elegivel !== b.elegivel) return a.elegivel ? -1 : 1;
      return b.pontuacao_media - a.pontuacao_media;
    })
    // Atribui a posição (1º, 2º, 3º...) após a ordenação.
    .map((item, idx) => ({ ...item, posicao: idx + 1 }));
  };

  // Ranking of individual collaborators (EXCLUDING super_admin and admin)
  // RANKING INDIVIDUAL: lista os colaboradores da empresa ordenados por
  // pontos totais (maior → menor). Exclui admin e super admin.
  const getRankingsColaboradores = (): Usuario[] => {
    return [...usuarios]
      .filter(u => u.empresa_id === empresa.id && u.perfil === 'colaborador' && u.ativo !== false)
      .sort((a, b) => b.estatisticas.pontos_totais - a.estatisticas.pontos_totais);
  };

  // Global UI Modals state
  // --- Estado dos modais globais (perfil e Supabase) ---
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [isSupabaseActive, setIsSupabaseActive] = useState<boolean>(() => isSupabaseConfigured());

  // Automatic Supabase Data Hydration on mount
  // CARREGAMENTO AUTOMÁTICO DO SUPABASE: ao abrir o app, se o Supabase está
  // configurado, baixa todos os dados da nuvem e atualiza os estados locais.
  // - Se a nuvem está vazia: popula com os dados de demonstração (seed).
  // - Se a nuvem tem dados: mescla com o que existe localmente (sem duplicar).
  useEffect(() => {
    if (isSupabaseConfigured()) {
      setIsSupabaseActive(true);
      let cancelled = false;
      supabaseService.fetchAllData().then(async (data) => {
        if (cancelled) return;
        // A nuvem entregou dados com sucesso: marca que o IndexedDB não deve
        // sobrescrever o estado (evita a corrida de hidratação com cópia offline).
        supabaseHidratouRef.current = true;
        // Only seed if Supabase database has zero companies registered (forceSeed = false to preserve all existing user data)
        // Só popula a nuvem se ela estiver completamente vazia e sem erros de RLS/rede
        if (!data.hasData) {
          // CORREÇÃO: só envia seed se explicitamente solicitado ou se a nuvem estiver de fato vazia sem forçar sobrescrita
          const temDadosLocaisReais =
            empresas.length > 0 &&
            !empresas.every((e: Empresa) => mockEmpresas.some((m: Empresa) => m.id === e.id));
          if (temDadosLocaisReais) {
            console.log('Banco de dados Supabase não retornou dados. Tentando sincronização inicial de dados locais...');
            await supabaseService.seedInitialDataIfEmpty(
              empresas,
              setores,
              usuarios,
              perguntas,
              campanhas,
              quizzes,
              desafios,
              premiacoes,
              false // nunca força com forceSeed=true para respeitar RLS e dados existentes
            );
          } else {
            console.log('Banco de dados Supabase vazio. Inicializando com dados padrão...');
            await supabaseService.seedInitialDataIfEmpty(
              mockEmpresas,
              mockSetores,
              mockUsuarios,
              mockPerguntas,
              mockCampanhas,
              mockQuizzesIniciais,
              mockDesafios,
              mockPremiacoes,
              false // nunca força com forceSeed=true
            );
          }
          const fresh = await supabaseService.fetchAllData();
          if (cancelled) return;
          // Substitui os estados locais pelos dados recém-baixados da nuvem.
          if (fresh.empresas && fresh.empresas.length > 0) setEmpresas(fresh.empresas);
          if (fresh.setores && fresh.setores.length > 0) setSetores(fresh.setores);
          if (fresh.usuarios && fresh.usuarios.length > 0) {
            setUsuarios(fresh.usuarios);
            // Mantém o usuário logado atual (busca pelo mesmo usuário na nuvem).
            const currentInDb = fresh.usuarios.find(u => u.id === currentUser.id) ||
                                fresh.usuarios.find(u => u.email.toLowerCase() === currentUser.email.toLowerCase());
            if (currentInDb) setCurrentUser(currentInDb);
          }
          if (fresh.perguntas && fresh.perguntas.length > 0) setPerguntas(fresh.perguntas);
          if (fresh.campanhas && fresh.campanhas.length > 0) setCampanhas(fresh.campanhas);
          if (fresh.quizzes && fresh.quizzes.length > 0) setQuizzes(fresh.quizzes);
          if (fresh.desafios && fresh.desafios.length > 0) setDesafios(fresh.desafios);
          if (fresh.premiacoes && fresh.premiacoes.length > 0) setPremiacoes(fresh.premiacoes);
          if (fresh.resgates && fresh.resgates.length > 0) setResgates(fresh.resgates);
        } else {
          // Database contains data: THE DATABASE IS THE SOURCE OF TRUTH when connected.
          // O banco de dados é a FONTE OFICIAL quando o Supabase está conectado:
          // substitui os dados locais pelos dados da nuvem. Assim, usuários excluídos
          // no painel do Supabase somem do app e não ficam "fantasmas" no localStorage.
          // (Se o Admin quiser enviar dados locais para a nuvem, usa o botão
          // "Sincronizar dados locais" no modal do Supabase.)

          // EMPRESAS: banco vence (se retornado com sucesso)
          if (data.empresas && Array.isArray(data.empresas) && data.empresas.length > 0) {
            setEmpresas(data.empresas);
          }

          // SETORES: banco vence (se retornado com sucesso)
          if (data.setores && Array.isArray(data.setores)) {
            setSetores(data.setores);
          }

          // USUÁRIOS: banco vence (evita apagar usuários locais se a consulta à nuvem falhou)
          let activeUser = currentUser;
          if (data.usuarios && Array.isArray(data.usuarios)) {
            setUsuarios(data.usuarios);
            const currentInDb = data.usuarios.find(u => u.id === currentUser.id) ||
                                data.usuarios.find(u => u.email.toLowerCase() === currentUser.email.toLowerCase());
            if (currentInDb) {
              setCurrentUser(currentInDb);
              activeUser = currentInDb;
            }
          }

          // SINCRONIA DE EMPRESA ATIVA: Garante que a empresa no estado corresponda à empresa do usuário logado
          if (data.empresas && Array.isArray(data.empresas) && data.empresas.length > 0) {
            const empAlvoId = activeUser?.empresa_id || empresa.id;
            const empresaCorrespondente = data.empresas.find(e => e.id === empAlvoId) ||
                                          data.empresas.find(e => e.id === empresa.id) ||
                                          data.empresas[0];
            if (empresaCorrespondente) setEmpresa(empresaCorrespondente);
          }

          // Atualiza o restante dos estados com os dados vindos da nuvem.
          if (data.perguntas) setPerguntas(data.perguntas);
          if (data.campanhas) setCampanhas(data.campanhas);
          if (data.quizzes) setQuizzes(data.quizzes);
          if (data.desafios) setDesafios(data.desafios);
          if (data.premiacoes) setPremiacoes(data.premiacoes);
          if (data.resgates) setResgates(data.resgates);
          if (data.notificacoes && data.notificacoes.length > 0) {
            setNotificacoes(prev => {
              // Nunca ressuscita aviso já apagado pelo usuário.
              let excluidas: Set<string> = new Set();
              try {
                const raw = localStorage.getItem('sst_notificacoes_excluidas');
                const arr = raw ? JSON.parse(raw) : [];
                if (Array.isArray(arr)) excluidas = new Set(arr);
              } catch {
                // Segue sem a lista.
              }
              const map = new Map<string, NotificacaoSST>();
              data.notificacoes!.forEach(n => { if (n && n.id && !excluidas.has(n.id)) map.set(n.id, n); });
              prev.forEach(n => {
                if (!map.has(n.id)) map.set(n.id, n);
              });
              return Array.from(map.values()).sort((a, b) => new Date(b.criada_em).getTime() - new Date(a.criada_em).getTime());
            });
          }
          if (data.salasQuizGuiado && data.salasQuizGuiado.length > 0) {
            setSalasQuizGuiado(data.salasQuizGuiado as SalaQuizGuiado[]);
          }
          if (data.resultadosAvaliacaoSST && Array.isArray(data.resultadosAvaliacaoSST)) {
            setResultadosAvaliacaoSST(prev => {
              const map = new Map<string, ResultadoAvaliacaoSST>();
              // Preserva primeiro os existentes locais (caso a nuvem tenha latência ou laudos salvos localmente)
              prev.forEach(r => { if (r && r.id) map.set(r.id, r); });
              // Mescla os registros recebidos da nuvem
              data.resultadosAvaliacaoSST!.forEach((r: ResultadoAvaliacaoSST) => { if (r && r.id) map.set(r.id, r); });
              return Array.from(map.values());
            });
          }
          // Converte os backups vindos da nuvem para o formato local.
          if (data.backupsHistorico && data.backupsHistorico.length > 0) {
            const mappedBkp = data.backupsHistorico.map((b: any) => ({
              id: b.id,
              data: b.data,
              tipo: b.tipo as 'manual' | 'automatico',
              tamanhoKb: b.tamanho_kb || 0,
              resumo: b.resumo || '',
              escopo: (b.empresa_id ? 'empresa' : 'global') as 'empresa' | 'global',
              empresaId: b.empresa_id,
              jsonSnapshot: typeof b.dados === 'string' ? b.dados : JSON.stringify(b.dados)
            }));
            // Mescla os backups da nuvem com os locais (sem duplicar por ID).
            setHistoricoBackups(prev => {
              const combined = [...mappedBkp];
              prev.forEach(p => {
                if (!combined.some(c => c.id === p.id)) {
                  combined.push(p);
                }
              });
              return combined;
            });
          }
        }
      }).catch((err) => {
        console.error('Erro ao hidratar dados do Supabase:', err);
      });
      return () => { cancelled = true; };
    }
  }, []);

  // Add Question
  // CRUD DE PERGUNTAS
  // Cria uma nova pergunta com ID único e empresa do usuário logado/alvo,
  // salva no estado local e envia para o Supabase.
  const adicionarPergunta = (nova: Omit<Pergunta, 'id' | 'empresa_id'>, targetEmpresaIdInput?: string) => {
    // Trava dura: barra pergunta quebrada (sem texto, sem alternativas, resposta fora do índice).
    if (!nova.enunciado || !nova.enunciado.trim()) {
      alert('Dê o texto da pergunta antes de salvar.');
      return;
    }
    const alts = Array.isArray(nova.alternativas) ? nova.alternativas.map(a => String(a || '').trim()).filter(a => a !== '') : [];
    if (alts.length < 2) {
      alert('A pergunta precisa de pelo menos 2 alternativas preenchidas.');
      return;
    }
    if (!Number.isInteger(nova.resposta_correta) || nova.resposta_correta < 0 || nova.resposta_correta >= alts.length) {
      alert('Marque qual alternativa é a correta antes de salvar.');
      return;
    }
    const targetEmpresaId = targetEmpresaIdInput || currentUser?.empresa_id || empresa.id;
    const item: Pergunta = {
      ...nova,
      id: `p-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      empresa_id: targetEmpresaId,
    };
    setPerguntas(prev => [item, ...prev]);
    supabaseService.upsertPergunta(item);
  };

  // Add Questions in Batch (Deduplicating by enunciado ISOLATING BY EMPRESA)
  // Adiciona várias perguntas de uma vez (importação CSV), evitando
  // duplicidade comparando o texto do enunciado apenas com perguntas da MESMA empresa.
  const adicionarPerguntasLote = (novas: Omit<Pergunta, 'id' | 'empresa_id'>[], targetEmpresaIdInput?: string): number => {
    const targetEmpresaId = targetEmpresaIdInput || currentUser?.empresa_id || empresa.id;
    
    // FILTRAGEM CORRETA POR EMPRESA: só deduplica em relação às perguntas da MESMA empresa!
    const perguntasDaEmpresa = perguntas.filter(p => p.empresa_id === targetEmpresaId);
    const existentesSet = new Set(perguntasDaEmpresa.map(p => p.enunciado.trim().toLowerCase()));
    
    const itensParaAdicionar: Pergunta[] = [];

    novas.forEach((nova, idx) => {
      const cleanEnunciado = nova.enunciado.trim().toLowerCase();
      // Só adiciona se o enunciado ainda não existe no banco DESTA empresa.
      if (!existentesSet.has(cleanEnunciado)) {
        existentesSet.add(cleanEnunciado);
        const item: Pergunta = {
          ...nova,
          id: `p-${Date.now()}-${idx}-${Math.floor(Math.random()*100000)}`,
          empresa_id: targetEmpresaId,
        };
        itensParaAdicionar.push(item);
      }
    });

    if (itensParaAdicionar.length > 0) {
      setPerguntas(prev => [...itensParaAdicionar, ...prev]);
      supabaseService.upsertPerguntas(itensParaAdicionar);
    }

    return itensParaAdicionar.length;
  };

  // Edit Question
  // Edita os campos de uma pergunta existente e sincroniza com a nuvem.
  const editarPergunta = (id: string, dados: Partial<Pergunta>) => {
    const updated = perguntas.map(p => p.id === id ? { ...p, ...dados } : p);
    const target = updated.find(p => p.id === id);
    setPerguntas(updated);
    if (target) supabaseService.upsertPergunta(target);
  };

  // Delete Question
  // Remove a pergunta do estado local e da nuvem.
  const excluirPergunta = (id: string) => {
    setPerguntas(prev => prev.filter(p => p.id !== id));
    supabaseService.deletePergunta(id);
  };

  // Create Campaign (Support optional target empresa_id and selected pergunta_ids)
  // CRUD DE CAMPANHAS
  // Cria uma campanha e gera AUTOMATICAMENTE um quiz (sessão) para cada
  // colaborador da empresa, com as perguntas escolhidas para a campanha.
  const criarCampanha = async (camp: Omit<Campanha, 'id'> & { empresa_id?: string }) => {
    const targetEmpresaId = camp.empresa_id || empresa.id;
    const item: Campanha = {
      ...camp,
      id: `camp-${Date.now()}`,
      empresa_id: targetEmpresaId,
      pergunta_ids: camp.pergunta_ids || [],
      // CORREÇÃO (auditoria campanhas): garante campos obrigatórios mesmo se
      // algum chamador esquecer de enviá-los (evita horário/setor em branco
      // na UI e payload incompleto no Supabase).
      setores_alvo: camp.setores_alvo && camp.setores_alvo.length > 0 ? camp.setores_alvo : ['todos'],
      horario_disparo: camp.horario_disparo || '08:00',
    };
    setCampanhas(prev => [item, ...prev]);
    await supabaseService.upsertCampanha(item);

    // Automatically generate campaign quiz for target collaborators of that company
    // Pega todos os colaboradores da empresa para gerar o quiz da campanha.
    const colabsAlvo = usuarios.filter(u => u.empresa_id === targetEmpresaId && u.perfil === 'colaborador');
    
    // Get questions for campaign (either specific selected pergunta_ids or filtered by company)
    // Seleciona as perguntas da campanha: as escolhidas manualmente (pergunta_ids)
    // ou, se não houver, as primeiras perguntas da empresa.
    let perguntasCampanha: Pergunta[] = [];
    if (camp.pergunta_ids && camp.pergunta_ids.length > 0) {
      perguntasCampanha = perguntas.filter(p => camp.pergunta_ids?.includes(p.id) && p.empresa_id === targetEmpresaId);
    } else {
      const perguntasDaEmpresa = perguntas.filter(p => p.empresa_id === targetEmpresaId);
      perguntasCampanha = perguntasDaEmpresa.slice(0, Math.min(camp.quantidade_perguntas || 5, perguntasDaEmpresa.length));
    }

    // Cria uma sessão de quiz "pendente" para cada colaborador da empresa.
    if (perguntasCampanha.length > 0) {
      const novosQuizzes: QuizSessao[] = colabsAlvo.map(colab => ({
        id: `quiz-camp-${item.id}-${colab.id}`,
        campanha_id: item.id,
        colaborador_id: colab.id,
        empresa_id: targetEmpresaId,
        titulo: `Campanha: ${item.nome}`,
        categoria: 'SST',
        perguntas: perguntasCampanha,
        status: 'pendente',
        pontuacao_total: 0,
        respostas: [],
        criado_em: new Date().toISOString(),
      }));

      setQuizzes(prev => [...novosQuizzes, ...prev]);
      for (const q of novosQuizzes) {
        await supabaseService.upsertQuiz(q);
      }
    }

    // Notifica cada colaborador alvo (sino interno + nuvem para push no celular).
    // Antes a campanha criava o quiz mas não criava nenhuma notificação — por isso ninguém recebia.
    try {
      const notifs = colabsAlvo.map(colab => ({
        id: `notif-${Date.now()}-${colab.id}-${Math.floor(Math.random() * 100000)}`,
        usuario_id: colab.id,
        empresa_id: targetEmpresaId,
        titulo: '📢 Nova Campanha Disponível!',
        mensagem: `A campanha "${item.nome}" chegou para você com ${perguntasCampanha.length} perguntas!`,
        tipo: 'campanha' as const,
        lida: false,
        criada_em: new Date().toISOString(),
        link_acao: item.id,
        canal: 'push' as const,
      }));
      if (notifs.length > 0) {
        setNotificacoes(prev => [...notifs, ...prev]);
        if (isSupabaseConfigured()) {
          for (const n of notifs) {
            try { await supabaseService.upsertNotificacao(n as any); } catch { /* segue sem quebrar */ }
          }
        }
      }
    } catch {
      // Nunca quebra a criação da campanha por causa do aviso.
    }
  };

  // Edita uma campanha existente.
  const editarCampanha = (id: string, dadosAtualizados: Partial<Campanha>) => {
    const updated = campanhas.map(c => c.id === id ? { ...c, ...dadosAtualizados } : c);
    const target = updated.find(c => c.id === id);
    setCampanhas(updated);
    if (target) supabaseService.upsertCampanha(target);
  };

  // Exclui uma campanha.
  // CORREÇÃO (auditoria campanhas): antes os quizzes PENDENTES gerados
  // automaticamente ficavam ÓRFÃOS para sempre (aparecendo como pendentes no
  // painel do colaborador sem campanha existente). Agora removemos localmente
  // e na nuvem todos os quizzes vinculados à campanha excluída. Quizzes já
  // CONCLUÍDOS (histórico de desempenho) são PRESERVADOS.
  const excluirCampanha = (id: string) => {
    setCampanhas(prev => prev.filter(c => c.id !== id));
    setQuizzes(prev => prev.filter(q => !(q.campanha_id === id && q.status === 'pendente')));
    supabaseService.deleteCampanha(id);
    supabaseService.deleteQuizzesPendentesDaCampanha(id);
  };

  // Create 1v1 Challenge
  // CRIAÇÃO DE DESAFIO 1x1 (o coração da disputa entre colaboradores).
  // Valida: permissões da empresa, cotas semanais (amistoso/competitivo),
  // aposta, sorteio do tema e das 5 perguntas da partida.
  const criarDesafio1v1 = (desafiadoId: string, tipo: 'competitivo' | 'amistoso' = 'competitivo', apostaPontos: number = 100): Desafio1v1 | null => {
    const desafiado = usuarios.find(u => u.id === desafiadoId);
    if (!desafiado) return null;

    // Check weekly limits based on mode
    // Calcula a janela de 7 dias para verificar as cotas semanais.
    const agora = new Date();
    const seteDiasAtras = new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (tipo === 'amistoso') {
      // Impede desafios amistosos se a empresa desabilitou essa opção.
      if (empresa.configuracoes.permitirAmistosos === false) {
        alert('Os desafios no Modo Amistoso foram desabilitados pelo administrador da empresa.');
        return null;
      }

      // Impede desafio entre pessoas do mesmo setor (se configurado).
      if (currentUser.setor_id === desafiado.setor_id && empresa.configuracoes.permitirMesmoSetorAmistoso === false) {
        alert('Desafios Amistosos entre colaboradores do mesmo setor estão desabilitados pela empresa.');
        return null;
      }

      // Cota semanal de desafios amistosos lançados (padrão 4).
      const cotaAmistoso = empresa.configuracoes.cota_desafios_colaborador ?? 4;
      const desafiosAmistososSemana = desafios.filter(d => {
        if (d.desafiante_id !== currentUser?.id || d.tipo !== 'amistoso') return false;
        const dataCriacao = new Date(d.data_criacao);
        return dataCriacao >= seteDiasAtras;
      }).length;

      if (desafiosAmistososSemana >= cotaAmistoso) {
        alert(`Você atingiu o seu limite semanal de ${cotaAmistoso} desafios AMISTOSOS lançados. Aguarde a renovação da cota!`);
        return null;
      }
    } else {
      // Competitive Mode: Equalization formula based on sector population (only sectors of the current company)
      // MODO COMPETITIVO: cota calculada por FÓRMULA DE EQUALIZAÇÃO baseada
      // no tamanho do setor. Setores menores podem lançar mais desafios para
      // equilibrar a competição com setores maiores.
      // CORREÇÃO: calcula o nº real de colaboradores ativos de cada setor
      // (em vez do campo estático colaboradores_ativos, que fica desatualizado
      // em 0 para setores criados pela interface).
      const setoresDaEmpresa = setores.filter(s => s.empresa_id === empresa.id);
      const qtdColabsPorSetor = (setorId: string) => {
        const colabsReais = usuarios.filter(u => u.setor_id === setorId && u.empresa_id === empresa.id && u.ativo !== false).length;
        return colabsReais || setores.find(s => s.id === setorId)?.colaboradores_ativos || 1;
      };
      const maiorNumColabs = Math.max(...setoresDaEmpresa.map(s => qtdColabsPorSetor(s.id)), 1);
      const meuSetorColabs = qtdColabsPorSetor(currentUser.setor_id);
      const cotaCompetitivaSemanal = Math.max(1, Math.round((maiorNumColabs * 2) / meuSetorColabs));

      const desafiosCompetitivosSemana = desafios.filter(d => {
        if (d.desafiante_id !== currentUser?.id || d.tipo === 'amistoso') return false;
        const dataCriacao = new Date(d.data_criacao);
        return dataCriacao >= seteDiasAtras;
      }).length;

      if (desafiosCompetitivosSemana >= cotaCompetitivaSemanal) {
        alert(`Você atingiu o seu limite semanal de ${cotaCompetitivaSemanal} desafios COMPETITIVOS lançados (baseado no cálculo de equalização do setor: ${meuSetorColabs} membros).`);
        return null;
      }
    }

    // Bet points strictly 100 or 200
    // A aposta só pode ser 100 ou 200 pontos (valores fixos).
    const valorAposta = apostaPontos === 200 ? 200 : 100;

    // Random category draw
    // Sorteia o tema (categoria) do desafio entre as categorias padrão.
    const temaSorteado = DEFAULT_CATEGORIES[Math.floor(Math.random() * DEFAULT_CATEGORIES.length)];

    // Draw 5 initial questions for standard match (only from the current company and available for challenges)
    // Sorteia as perguntas da partida: prioriza perguntas do tema sorteado,
    // complementa com outras da empresa se preciso e embaralha.
    const perguntasDaEmpresa = perguntas.filter(p => p.empresa_id === empresa.id && p.disponivel_desafios !== false);
    const perguntasTema = perguntasDaEmpresa.filter(p => p.categoria === temaSorteado);
    let perguntasPartida = [...perguntasTema];
    if (perguntasPartida.length < 5) {
      // fill with other questions from the same company if needed
      // se não houver 5 do tema, completa com perguntas de outros temas.
      perguntasPartida = [...perguntasPartida, ...perguntasDaEmpresa.filter(p => p.categoria !== temaSorteado)];
    }
    // Shuffle and pick 5
    // Embaralha e seleciona as 5 primeiras perguntas.
    const perguntasSorteadas = perguntasPartida
      .sort(() => 0.5 - Math.random())
      .slice(0, Math.min(5, perguntasPartida.length));

    const isAmistoso = tipo === 'amistoso';
    const novoDesafio: Desafio1v1 = {
      id: `des-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      empresa_id: empresa.id,
      desafiante_id: currentUser.id,
      desafiante_setor_id: currentUser.setor_id,
      desafiado_id: desafiado.id,
      desafiado_setor_id: desafiado.setor_id,
      tema_sorteado: temaSorteado,
      status: 'pendente',
      vale_ponto: !isAmistoso, // só o competitivo vale pontos de setor
      tipo: isAmistoso ? 'amistoso' : 'competitivo',
      pontuacao_setor: isAmistoso ? 50 : valorAposta, // pontos em jogo para o setor
      aposta_pontos: isAmistoso ? 50 : valorAposta,
      data_criacao: new Date().toISOString(),
      perguntas: perguntasSorteadas,
    };

    // Se está offline, o desafio entra na fila de sincronização.
    if (isOfflineMode || !navigator.onLine) {
      setItensPendentesSync(prev => [
        ...prev,
        {
          id: `sync-${Date.now()}`,
          tipo: 'CRIAR_DESAFIO',
          payload: novoDesafio,
          criado_em: new Date().toISOString(),
          status: 'pendente',
        },
      ]);
    } else {
      // Online: envia direto para o Supabase.
      supabaseService.upsertDesafio(novoDesafio);
    }

    setDesafios(prev => [novoDesafio, ...prev]);

    // Send notification to the challenged user
    // Notifica o desafiado sobre o novo desafio recebido.
    const notifDesafio: NotificacaoSST = {
      id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      usuario_id: desafiado.id,
      empresa_id: empresa.id,
      titulo: '⚔️ Novo Desafio 1x1 Recebido!',
      mensagem: `${currentUser.nome} desafiou você no tema ${temaSorteado}! (Aposta: +${valorAposta} pts p/ Setor)`,
      tipo: 'desafio_1v1',
      lida: false,
      criada_em: new Date().toISOString(),
      link_acao: novoDesafio.id,
      canal: 'push'
    };
    setNotificacoes(prev => [notifDesafio, ...prev]);
    if (isSupabaseConfigured()) {
      supabaseService.upsertNotificacao(notifDesafio);
    }

    return novoDesafio;
  };

  // O desafiado aceita o desafio (muda o status para 'aceito').
  const aceitarDesafio = async (desafioId: string) => {
    // SERVER-FIRST: registra a aceitação e a reserva da aposta no servidor
    // (RPC idempotente). AGUARDAMOS o RPC ANTES do upsert do status 'aceito':
    // o RPC exige status='pendente' e, se o upsert gravar 'aceito' primeiro,
    // a reserva da aposta e o data_aceite se perdem (auditoria forense
    // AUD-08 — race condition). Em caso de falha, o fluxo local segue normal.
    if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode && currentUser) {
      try {
        await supabaseService.aceitarDesafioRpc(desafioId, currentUser.id);
      } catch (err) {
        console.warn('Falha ao registrar aceitação do desafio no servidor:', err);
      }
    }
    const updated = desafios.map(d => d.id === desafioId ? { ...d, status: 'aceito' as const } : d);
    const target = updated.find(d => d.id === desafioId);
    setDesafios(updated);
    if (target) supabaseService.upsertDesafio(target);
  };

  // O desafiado recusa o desafio (status 'recusado').
  const recusarDesafio = (desafioId: string) => {
    const updated = desafios.map(d => d.id === desafioId ? { ...d, status: 'recusado' as const } : d);
    const target = updated.find(d => d.id === desafioId);
    setDesafios(updated);
    if (target) supabaseService.upsertDesafio(target);
  };

  // Submit responses for a 1v1 challenge match & calculate instant elimination or speed winner!
  // ENVIO DE RESPOSTAS DO DESAFIO + CÁLCULO DO VENCEDOR.
  // Regras: quem acertar mais das 5 perguntas vence; empate gera uma
  // pergunta de desempate extra; acerto duplo no desempate decide por tempo
  // de resposta mais rápido.
  const submeterRespostaDesafio = async (
    desafioId: string,
    userId: string,
    respostas: { pergunta_id: string; alternativa_escolhida: number; correta: boolean; tempo_resposta_segundos: number }[]
  ) => {
    const desafio = desafios.find(d => d.id === desafioId);
    if (!desafio) return;
    // Guard: never re-evaluate / re-award an already concluded match
    // PROTEÇÃO: se o desafio já foi concluído, ignora (evita pontuação dupla).
    if (desafio.status === 'concluido') {
      console.warn('Desafio já concluído. Pontuação ignorada para evitar duplicação.');
      return;
    }

    // SECURITY: quando o Supabase está ativo, o campo "correta" é
    // RECALCULADO no servidor (edge function pontuar-desafio) usando o
    // gabarito do banco — o cliente NÃO decide se acertou ou errou.
    let respostasEfetivas = respostas;
    if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
      try {
        const serverResult = await supabaseService.pontuarDesafio({
          desafio_id: desafioId,
          user_id: userId,
          respostas: respostas.map(r => ({
            pergunta_id: r.pergunta_id,
            alternativa_escolhida: r.alternativa_escolhida,
            tempo_resposta_segundos: r.tempo_resposta_segundos,
          })),
        });
        if (serverResult && serverResult.success && Array.isArray(serverResult.respostasValidadas)) {
          respostasEfetivas = serverResult.respostasValidadas;
        }
      } catch (err) {
        console.warn('Falha na validação server-side do desafio, usando cálculo local:', err);
      }
    }
    respostas = respostasEfetivas;

    const isDesafiante = userId === desafio.desafiante_id;
    // Refactor incremental (Fase 9): a decisão de vencedor (5 perguntas,
    // desempate e regra da empresa) foi extraída para um módulo puro e
    // testável (utils/desafioWinner.ts). Nenhuma regra foi alterada.
    const calculo = calcularResultadoDesafio({
      desafio,
      respostas,
      isDesafiante,
      perguntasDisponiveis: perguntas,
      desempateRule: empresa.configuracoes.desempateRule,
    });

    const novasRespDesafiante = calculo.respostasDesafiante;
    const novasRespDesafiado = calculo.respostasDesafiado;
    const perguntasFinais = calculo.perguntas;
    const statusFinal = calculo.status;
    const vencedorId = calculo.vencedorId;
    const vencedorSetorId = calculo.vencedorSetorId;
    const motivoVitoria = calculo.motivoVitoria;
    const decididoNoDesempate = calculo.decididoNoDesempate;
    const placarFinal = calculo.placarFinal;

    const desafioAtualizado: Desafio1v1 = {
      ...desafio,
      perguntas: perguntasFinais, // inclui a pergunta de desempate (se houver)
      respostas_desafiante: novasRespDesafiante,
      respostas_desafiado: novasRespDesafiado,
      status: statusFinal,
      vencedor_id: vencedorId,
      vencedor_setor_id: vencedorSetorId,
      motivo_vitoria: motivoVitoria,
      decidido_no_desempate: decididoNoDesempate,
      placar_final: placarFinal,
    };

    setDesafios(prev => prev.map(d => d.id === desafioId ? desafioAtualizado : d));

    // PONTUAÇÃO FINAL SERVER-FIRST: quando a partida termina, LIQUIDA o
    // desafio no servidor (RPC registrar_desafio_no_ledger) ANTES de gravar
    // o status 'concluido' via upsert. O RPC bloqueia a liquidação se o
    // status já estiver 'concluido' (idempotência), então inverter a ordem
    // garante que o ledger e o data_conclusao sejam gravados (auditoria
    // forense AUD-08 — antes o upsert corria na frente e o ledger se perdia).
    if (statusFinal === 'concluido' && vencedorId && isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
      const perdedorIdLedger = vencedorId === desafio.desafiante_id ? desafio.desafiado_id : desafio.desafiante_id;
      const isAmistosoLedger = desafio.tipo === 'amistoso';
      const pontosGanhoLedger = isAmistosoLedger
        ? (empresa.configuracoes.pontosVitoriaAmistoso ?? 50)
        : (desafio.pontuacao_setor || desafio.aposta_pontos || 100);
      const pontosPerdaLedger = isAmistosoLedger
        ? (empresa.configuracoes.pontosDerrotaAmistoso ?? 25)
        : 0;
      await supabaseService.registrarDesafioNoLedger({
        desafio_id: desafioId,
        vencedor_id: vencedorId,
        perdedor_id: perdedorIdLedger,
        pontos_ganho: pontosGanhoLedger,
        pontos_perda: isAmistosoLedger ? pontosPerdaLedger : 0,
        motivo: motivoVitoria,
      }).catch(err => console.warn('Falha ao liquidar desafio no servidor:', err));
    }

    // Se offline, guarda na fila de sincronização.
    if (isOfflineMode || !navigator.onLine) {
      setItensPendentesSync(prev => [
        ...prev,
        {
          id: `sync-${Date.now()}`,
          tipo: 'RESPONDER_DESAFIO',
          payload: desafioAtualizado,
          criado_em: new Date().toISOString(),
          status: 'pendente',
        },
      ]);
    } else {
      supabaseService.upsertDesafio(desafioAtualizado);
    }

    // Generate notifications
    // Cria notificações de resultado (vitória/derrota) para os dois jogadores,
    // ou de "sua vez de jogar" para o oponente quando a partida continua.
    const oponenteId = isDesafiante ? desafio.desafiado_id : desafio.desafiante_id;
    if (statusFinal === 'concluido') {
      const isAmistoso = desafio.tipo === 'amistoso';

      // Mensagens personalizadas por jogador e modo (amistoso/competitivo).
      const msgDesafiante = isAmistoso
        ? (vencedorId === desafio.desafiante_id
            ? `🏆 Você VENCEU o Desafio Amistoso (${desafio.tema_sorteado}) e ganhou +${empresa.configuracoes.pontosVitoriaAmistoso ?? 50} pts individuais!`
            : `❌ Você perdeu o Desafio Amistoso (${desafio.tema_sorteado}) e perdeu ${empresa.configuracoes.pontosDerrotaAmistoso ?? 25} pts.`)
        : (vencedorId === desafio.desafiante_id
            ? `🏆 Seu setor VENCEU o Desafio Competitivo (${desafio.tema_sorteado}) e faturou +${desafio.pontuacao_setor || desafio.aposta_pontos || 100} pts!`
            : `❌ Seu setor perdeu o Desafio Competitivo (${desafio.tema_sorteado}).`);

      const msgDesafiado = isAmistoso
        ? (vencedorId === desafio.desafiado_id
            ? `🏆 Você VENCEU o Desafio Amistoso (${desafio.tema_sorteado}) e ganhou +${empresa.configuracoes.pontosVitoriaAmistoso ?? 50} pts individuais!`
            : `❌ Você perdeu o Desafio Amistoso (${desafio.tema_sorteado}) e perdeu ${empresa.configuracoes.pontosDerrotaAmistoso ?? 25} pts.`)
        : (vencedorId === desafio.desafiado_id
            ? `🏆 Seu setor VENCEU o Desafio Competitivo (${desafio.tema_sorteado}) e faturou +${desafio.pontuacao_setor || desafio.aposta_pontos || 100} pts!`
            : `❌ Seu setor perdeu o Desafio Competitivo (${desafio.tema_sorteado}).`);

      const rand1 = Math.floor(Math.random() * 100000);
      const rand2 = Math.floor(Math.random() * 100000);
      const notif1: NotificacaoSST = {
        id: `notif-${Date.now()}-1-${rand1}`,
        usuario_id: desafio.desafiante_id,
        empresa_id: desafio.empresa_id,
        titulo: '🏆 Desafio 1x1 Concluído!',
        mensagem: msgDesafiante,
        tipo: 'desafio_1v1',
        lida: false,
        criada_em: new Date().toISOString(),
        link_acao: desafio.id,
        canal: 'push'
      };
      const notif2: NotificacaoSST = {
        id: `notif-${Date.now()}-2-${rand2}`,
        usuario_id: desafio.desafiado_id,
        empresa_id: desafio.empresa_id,
        titulo: '🏆 Desafio 1x1 Concluído!',
        mensagem: msgDesafiado,
        tipo: 'desafio_1v1',
        lida: false,
        criada_em: new Date().toISOString(),
        link_acao: desafio.id,
        canal: 'push'
      };
      setNotificacoes(prev => [notif1, notif2, ...prev]);
      if (isSupabaseConfigured()) {
        supabaseService.upsertNotificacao(notif1);
        supabaseService.upsertNotificacao(notif2);
      }
    } else {
      // Partida continua: avisa o oponente que é a vez dele responder.
      const notifTurn: NotificacaoSST = {
        id: `notif-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        usuario_id: oponenteId,
        empresa_id: desafio.empresa_id,
        titulo: '⚡ Sua Vez no Desafio 1x1!',
        mensagem: `${currentUser.nome} respondeu ao desafio em ${desafio.tema_sorteado}. É a sua vez de jogar!`,
        tipo: 'desafio_1v1',
        lida: false,
        criada_em: new Date().toISOString(),
        link_acao: desafio.id,
        canal: 'push'
      };
      setNotificacoes(prev => [notifTurn, ...prev]);
      if (isSupabaseConfigured()) {
        supabaseService.upsertNotificacao(notifTurn);
      }
    }

    // Award Points and User Stats if match concluded
    // PONTUAÇÃO FINAL: se a partida terminou, atualiza os pontos do setor
    // vencedor (competitivo) e as estatísticas individuais dos dois jogadores.
    if (statusFinal === 'concluido' && vencedorId && vencedorSetorId) {
      const perdedorId = vencedorId === desafio.desafiante_id ? desafio.desafiado_id : desafio.desafiante_id;
      const isAmistoso = desafio.tipo === 'amistoso';


      // Pontos ganhos na vitória (depende do modo do desafio).
      const pontosGanhoVitoria = isAmistoso
        ? (empresa.configuracoes.pontosVitoriaAmistoso ?? 50)
        : (desafio.pontuacao_setor || desafio.aposta_pontos || 100);

      // Pontos perdidos na derrota (só no amistoso).
      const pontosPerdaDerrota = isAmistoso
        ? (empresa.configuracoes.pontosDerrotaAmistoso ?? 25)
        : 0;

      // SERVER-FIRST: a liquidação no servidor (ledger) já foi feita ANTES do
      // upsert (acima, no bloco "PONTUAÇÃO FINAL SERVER-FIRST") para evitar o
      // race que perdia o ledger quando o status 'concluido' era gravado
      // primeiro. Aqui seguem apenas os ajustes locais de setor/estatísticas.

      // Update winning sector points ONLY if match is competitive (d.tipo !== 'amistoso')
      // Só adiciona pontos ao setor vencedor se o desafio for COMPETITIVO.
      if (!isAmistoso && desafio.vale_ponto !== false) {
        setSetores(prevSetores => {
          const novosSetores = prevSetores.map(s => s.id === vencedorSetorId
            ? { ...s, pontos_totais: (s.pontos_totais || 0) + pontosGanhoVitoria }
            : s);
          const setorAtualizado = novosSetores.find(s => s.id === vencedorSetorId);
          if (setorAtualizado) supabaseService.upsertSetor(setorAtualizado);
          return novosSetores;
        });
      }

      // Update user stats (Winner gains points; Loser in Amistoso loses points; both counted as played)
      // Atualiza estatísticas: vencedor ganha pontos; perdedor (no amistoso)
      // perde pontos; ambos contam como "jogaram" e podem ganhar medalhas.
      setUsuarios(users => users.map(u => {
        if (u.id === vencedorId) {
          const novosVencidos = u.estatisticas.desafios_vencidos + 1;
          const pontosAtuaisResgataveis = (u.estatisticas.pontos_resgataveis ?? u.estatisticas.pontos_totais) || 0;

          const usuarioComVitoria: Usuario = {
            ...u,
            estatisticas: {
              ...u.estatisticas,
              desafios_vencidos: novosVencidos,
              desafios_jogados: u.estatisticas.desafios_jogados + 1,
              pontos_desafios: u.estatisticas.pontos_desafios + pontosGanhoVitoria,
              pontos_totais: u.estatisticas.pontos_totais + pontosGanhoVitoria,
              pontos_resgataveis: pontosAtuaisResgataveis + pontosGanhoVitoria,
              // NOVO: contadores de sequência (modo contagem "sequencial").
              sequencia_vitorias: (u.estatisticas.sequencia_vitorias || 0) + 1,
              maior_sequencia_vitorias: Math.max(
                u.estatisticas.maior_sequencia_vitorias || 0,
                (u.estatisticas.sequencia_vitorias || 0) + 1
              ),
              // NOVO: defesas vencidas (vitória como DESAFIADO).
              defesas_vencidas: (u.estatisticas.defesas_vencidas || 0) + (u.id === desafioAtualizado.desafiado_id ? 1 : 0),
              sequencia_defesas: u.id === desafioAtualizado.desafiado_id
                ? (u.estatisticas.sequencia_defesas || 0) + 1
                : (u.estatisticas.sequencia_defesas || 0),
              maior_sequencia_defesas: Math.max(
                u.estatisticas.maior_sequencia_defesas || 0,
                u.id === desafioAtualizado.desafiado_id
                  ? (u.estatisticas.sequencia_defesas || 0) + 1
                  : (u.estatisticas.sequencia_defesas || 0)
              ),
            },
          };

          // Verifica e concede troféus dinâmicos por níveis (com contexto do desafio)
          const updatedUser = verificarEntregarTrofeus(usuarioComVitoria, { desafio: desafioAtualizado, setores });

          if (currentUser.id === u.id) setCurrentUser(updatedUser);
          // V-018: as estatísticas de pontos/sequência do vencedor são gravadas
          // PELO SERVIDOR (RPC registrar_desafio_no_ledger recalcula tudo), então
          // NÃO enviamos upsertUsuario com estatísticas aqui — o gatilho
          // bloquearia (bypass GUC é exclusivo dos RPCs) e seria duplicado.
          return updatedUser;
        }

        if (u.id === perdedorId) {
          const pontosAtuaisResgataveis = (u.estatisticas.pontos_resgataveis ?? u.estatisticas.pontos_totais) || 0;

          const updatedUser = {
            ...u,
            estatisticas: {
              ...u.estatisticas,
              desafios_jogados: u.estatisticas.desafios_jogados + 1,
              // NOVO: ao perder, zera as sequências (modo contagem "sequencial").
              sequencia_vitorias: 0,
              sequencia_defesas: 0,
              // No amistoso o perdedor perde pontos (nunca abaixo de zero).
              ...(isAmistoso ? {
                pontos_desafios: Math.max(0, u.estatisticas.pontos_desafios - pontosPerdaDerrota),
                pontos_totais: Math.max(0, u.estatisticas.pontos_totais - pontosPerdaDerrota),
                pontos_resgataveis: Math.max(0, pontosAtuaisResgataveis - pontosPerdaDerrota),
              } : {}),
            },
          };
          if (currentUser.id === u.id) setCurrentUser(updatedUser);
          // V-018: estatísticas do perdedor são recalculadas PELO SERVIDOR
          // (RPC registrar_desafio_no_ledger) — sem upsertUsuario duplicado aqui.
          return updatedUser;
        }

        return u;
      }));
    }
  };

  // Revanche / Revenge Challenge
  // REVANCHE: cria um novo desafio de revanche usando os mesmos oponentes e
  // o mesmo tipo (amistoso/competitivo) do desafio original.
  const criarRevanche = (desafioOriginalId: string): Desafio1v1 | null => {
    const original = desafios.find(d => d.id === desafioOriginalId);
    if (!original) return null;

    // The person requesting the rematch (currentUser) is always the new challenger.
    // The opponent must be the OTHER player in the original match — never the
    // requester, otherwise we'd create a self-challenge (e.g. Lucas x Lucas).
    // O desafiante da revanche é o usuário logado; o desafiado deve ser o
    // OUTRO jogador da partida original (nunca ele mesmo, para não criar
    // um desafio de "Lucas x Lucas").
    const novoDesafiadoId = currentUser.id === original.desafiante_id ? original.desafiado_id : original.desafiante_id;

    if (!novoDesafiadoId) return null;

    const desafiadoObj = usuarios.find(u => u.id === novoDesafiadoId);
    if (!desafiadoObj) return null;

    // Reaproveita o tipo e a aposta do desafio original.
    const novoDesafio = criarDesafio1v1(novoDesafiadoId, original.tipo, original.aposta_pontos || 50);
    if (novoDesafio) {
      // Marca no desafio original qual é o ID da revanche.
      setDesafios(prev => prev.map(d => d.id === original.id ? { ...d, revanche_id: novoDesafio.id } : d));
      const notifRevanche: NotificacaoSST = {
        id: `notif-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        usuario_id: novoDesafiadoId,
        titulo: '⚔️ Revanche Solicitada!',
        mensagem: `${currentUser.nome} solicitou uma revanche no desafio 1x1! Aceite e jogue agora.`,
        tipo: 'desafio_1v1',
        lida: false,
        criada_em: new Date().toISOString(),
        link_acao: novoDesafio.id,
        canal: 'push'
      };
      setNotificacoes(prev => [notifRevanche, ...prev]);
    }
    return novoDesafio;
  };

  // Clear 1v1 Challenges Table for company
  // ZERA TODOS OS DESAFIOS 1x1 da empresa (usado pelo Admin para "limpar a
  // tabela" e recomeçar). Mantém os desafios de outras empresas.
  const resetarTabelaDesafios1v1 = (targetEmpresaId?: string) => {
    const empId = targetEmpresaId || empresa.id;

    const restantes = desafios.filter(d => d.status === 'concluido' || (d.empresa_id && d.empresa_id !== empId));
    const desafiosParaRemover = desafios.filter(d => (d.status !== 'concluido') && (!d.empresa_id || d.empresa_id === empId));
    if (isSupabaseActive) {
      desafiosParaRemover.forEach(d => supabaseService.deleteDesafio(d.id));
    }

    setDesafios(restantes);

    dispararNotificacaoLembrete({
      titulo: '🧹 Tabela de Desafios 1x1 Zerada!',
      mensagem: 'O Administrador excluiu e zerou todos os desafios 1x1 da empresa com sucesso.',
      tipo: 'desafio_1v1',
      canal: 'push'
    });
  };

  // Reset/Zero Points and Ranking for Company (Start new Season/Campaign)
  // ZERA TODA A PONTUAÇÃO dos colaboradores da empresa (novo ciclo/ranking).
  // Mantém os pontos resgatáveis acumulados para prêmios.
  const resetarPontuacaoEmpresa = (targetEmpresaId?: string) => {
    const empId = targetEmpresaId || empresa.id;

    setUsuarios(prev => prev.map(u => {
      if (u.empresa_id === empId) {
        const resetUser: Usuario = {
          ...u,
          estatisticas: {
            // Preserva TODOS os dados de carreira (troféus, sequências,
            // contadores de conquista) zerando apenas a pontuação de ranking.
            ...u.estatisticas,
            pontos_quizzes: 0,
            pontos_desafios: 0,
            pontos_totais: 0,
            // Preserva os pontos de premiação acumulados entre temporadas.
            pontos_resgataveis: u.estatisticas.pontos_resgataveis ?? u.estatisticas.pontos_totais ?? 0,
            // DESACOPLAMENTO: contadores de troféus e sequências NÃO são zerados.
            // streak_dias, quizzes_respondidos, acertos_totais, desafios_vencidos,
            // trofeus_conquistados e sequências permanecem (carreira).
          }
        };
        if (currentUser.id === u.id) setCurrentUser(resetUser);
        if (isSupabaseActive) {
          supabaseService.upsertUsuario(resetUser);
        }
        return resetUser;
      }
      return u;
    }));

    dispararNotificacaoLembrete({
      titulo: '🏆 Novo Ciclo de Ranking Iniciado!',
      mensagem: 'A pontuação e o ranking de todos os colaboradores foram zerados pelo Administrador para o início de uma nova temporada. Troféus e conquistas de carreira foram preservados.',
      tipo: 'alerta_sst',
      canal: 'ambos'
    });
  };

  // Reset/Zero Points but PRESERVE accumulated reward points (pontos_resgataveis)
  // ZERA a pontuação de ranking, mas PRESERVA os pontos acumulados de prêmios.
  // Diferença para resetarPontuacaoEmpresa: aqui o streak e medalhas também
  // são zerados e os pontos resgatáveis sempre mantidos.
  const resetarPontuacaoEmpresaPreservarPontos = (targetEmpresaId?: string) => {
    const empId = targetEmpresaId || empresa.id;

    setUsuarios(prev => prev.map(u => {
      if (u.empresa_id === empId) {
        const pontosPreservados = (u.estatisticas.pontos_resgataveis ?? u.estatisticas.pontos_totais) || 0;
        const resetUser: Usuario = {
          ...u,
          estatisticas: {
            ...u.estatisticas,
            pontos_quizzes: 0,
            pontos_desafios: 0,
            pontos_totais: 0,
            // Preserve reward points for prizes
            // preserva os pontos destinados a premiação.
            pontos_resgataveis: pontosPreservados,
            // DESACOPLAMENTO: troféus, sequências e contadores de conquista
            // NÃO são zerados aqui (carreira). Mantém streak_dias, acertos,
            // desafios vencidos, trofeus_conquistados e sequências.
          }
        };
        if (currentUser.id === u.id) setCurrentUser(resetUser);
        if (isSupabaseActive) supabaseService.upsertUsuario(resetUser);
        return resetUser;
      }
      return u;
    }));

    dispararNotificacaoLembrete({
      titulo: '🏁 Ranking reiniciado (pontos preservados)!',
      mensagem: 'O ranking foi zerado para a nova temporada, mas os pontos destinados a premiações foram preservados.',
      tipo: 'alerta_sst',
      canal: 'ambos'
    });
  };

  // Submit Completed Quiz
  // FINALIZA UM QUIZ: registra respostas, pontuação e atualiza as estatísticas
  // do colaborador (streak, pontos, medalhas). Protege contra pontuação dupla.
  const submeterQuizConcluido = async (quizId: string, respostas: any[], pontosGanhos: number) => {
    // Check if quiz is already completed to prevent duplicate scoring
    // PROTEÇÃO: se o quiz já foi concluído, ignora (evita ganhar pontos 2x).
    const existingQuiz = quizzes.find(q => q.id === quizId);
    if (existingQuiz && existingQuiz.status === 'concluido') {
      console.warn('Quiz já concluído previamente. Pontuação ignorada para evitar duplicação.');
      return;
    }

    const respondidoEm = new Date().toISOString();

    // SECURITY: quando o Supabase está ativo, a pontuação e o gabarito são
    // validados no SERVIDOR (edge function pontuar-quiz). O cliente NÃO define
    // os pontos nem o campo "correta" — apenas envia a alternativa escolhida.
    // Se a função não estiver disponível (ex.: não deployed), cai no cálculo local.
    let respostasEfetivas = respostas;
    let pontosEfetivos = pontosGanhos;
    if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
      try {
        const serverResult = await supabaseService.pontuarQuiz({
          quiz_id: quizId,
          respostas: respostas.map(r => ({
            pergunta_id: r.pergunta_id,
            resposta_escolhida: r.resposta_escolhida,
            tempo_gasto_segundos: r.tempo_gasto_segundos,
          })),
        });
        if (serverResult && serverResult.success && Array.isArray(serverResult.detalhesValidados)) {
          respostasEfetivas = serverResult.detalhesValidados;
          pontosEfetivos = serverResult.pontos;
        }
      } catch (err) {
        console.warn('Falha na validação server-side do quiz, usando cálculo local:', err);
      }
    }

    // Marca a sessão do quiz como concluída com a pontuação ganha.
    setQuizzes(prev => prev.map(q =>
      q.id === quizId
        ? { ...q, status: 'concluido' as const, pontuacao_total: pontosEfetivos, respostas: respostasEfetivas, respondido_em: respondidoEm }
        : q
    ));
    const quizConcluido = quizzes.find(q => q.id === quizId);
    if (quizConcluido && isSupabaseActive) {
      supabaseService.upsertQuiz({ ...quizConcluido, status: 'concluido', pontuacao_total: pontosEfetivos, respostas: respostasEfetivas, respondido_em: respondidoEm });
    }

    // Update collaborator statistics (Streak, Points, Badges)
    // Atualiza estatísticas do colaborador: acertos, erros e streak.
    const totalAcertos = respostasEfetivas.filter(r => r.correta).length;
    const totalErros = respostasEfetivas.length - totalAcertos;

    // NOVO: streak diário REAL por data.
    // Se o último quiz foi ontem → +1; se foi hoje → mantém; se foi antes → reinicia.
    // NUNCA pune por dia sem quiz agendado (só conta quando o colaborador responde).
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const ultimaData = currentUser.estatisticas.ultimo_quiz_data ? new Date(currentUser.estatisticas.ultimo_quiz_data) : null;
    const ultimaDataInicioDia = ultimaData ? new Date(ultimaData) : null;
    if (ultimaDataInicioDia) ultimaDataInicioDia.setHours(0, 0, 0, 0);
    let novoStreak = currentUser.estatisticas.streak_dias;
    if (!ultimaDataInicioDia) {
      novoStreak = 1;
    } else {
      const diffDias = Math.round((hoje.getTime() - ultimaDataInicioDia.getTime()) / 86400000);
      if (diffDias === 1) novoStreak = (currentUser.estatisticas.streak_dias || 0) + 1;
      else if (diffDias === 0) novoStreak = currentUser.estatisticas.streak_dias || 1;
      // CORREÇÃO: diffDias negativo (relógio do dispositivo no futuro) NÃO deve
      // zerar o streak — apenas mantém o valor atual.
      else if (diffDias < 0) novoStreak = currentUser.estatisticas.streak_dias || 1;
      else novoStreak = 1;
    }

    // NOVO: sequência de acertos consecutivos (errou zera).
    // Percorre as respostas na ordem e conta quantos acertos consecutivos.
    let seqAcertos = currentUser.estatisticas.sequencia_acertos || 0;
    respostas.forEach((r: any) => {
      if (r.correta) seqAcertos += 1;
      else seqAcertos = 0;
    });

    const pontosAtuaisResgataveis = (currentUser.estatisticas.pontos_resgataveis ?? currentUser.estatisticas.pontos_totais) || 0;

    // Monta o usuário com as estatísticas atualizadas do quiz.
    const currentUserAtualizadoBase: Usuario = {
      ...currentUser,
      estatisticas: {
        ...currentUser.estatisticas,
        pontos_quizzes: currentUser.estatisticas.pontos_quizzes + pontosEfetivos,
        pontos_totais: currentUser.estatisticas.pontos_totais + pontosEfetivos,
        pontos_resgataveis: pontosAtuaisResgataveis + pontosEfetivos,
        streak_dias: novoStreak,
        quizzes_respondidos: currentUser.estatisticas.quizzes_respondidos + 1,
        acertos_totais: currentUser.estatisticas.acertos_totais + totalAcertos,
        erros_totais: currentUser.estatisticas.erros_totais + totalErros,
        sequencia_acertos: seqAcertos,
        maior_sequencia_acertos: Math.max(currentUser.estatisticas.maior_sequencia_acertos || 0, seqAcertos),
        ultimo_quiz_data: respondidoEm,
      },
    };

    // Aplica a verificação de troféus dinâmicos (níveis configurados pela empresa).
    const currentUserAtualizado = verificarEntregarTrofeus(currentUserAtualizadoBase);

    setUsuarios(prev => prev.map(u =>
      u.id === currentUser.id ? currentUserAtualizado : u
    ));
    setCurrentUser(currentUserAtualizado);
    // V-018: com o Supabase ativo, as estatísticas do quiz já foram gravadas
    // PELO SERVIDOR (RPC pontuar_quiz recalcula tudo). O upsertUsuario direto
    // com estatísticas seria bloqueado pelo gatilho (bypass GUC é exclusivo
    // dos RPCs) e duplicaria a gravação — por isso só enviamos no modo local
    // (offline/LAN sem nuvem), onde não há RPC nem gatilho.
    if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode && navigator.onLine) {
      // já persistido via RPC pontuar_quiz
    } else {
      supabaseService.upsertUsuario(currentUserAtualizado);
    }

    // Offline queue check
    // Se offline, adiciona à fila de sincronização pendente.
    // IMPORTANTE: guarda o SNAPSHOT COMPLETO (quiz concluído + usuário
    // atualizado) no payload. Assim, mesmo que o app seja reaberto e a
    // hidratação "banco vence" sobrescreva o estado local, a sincronização
    // usa o snapshot guardado e NÃO perde o progresso offline.
    if (isOfflineMode || !navigator.onLine) {
      const quizAtualizado = quizzes.find(q => q.id === quizId)
        ? {
            ...quizzes.find(q => q.id === quizId)!,
            status: 'concluido' as const,
            pontuacao_total: pontosEfetivos,
            respostas: respostasEfetivas,
            respondido_em: respondidoEm,
          }
        : null;
      const offlineItem: ItemSincronizacaoOffline = {
        id: `sync-${Date.now()}`,
        tipo: 'RESPONDER_QUIZ',
        payload: {
          quizId,
          respostas: respostasEfetivas,
          pontosGanhos: pontosEfetivos,
          usuarioId: currentUser.id,
          // Snapshot dos dados a sincronizar (independe do estado local atual).
          quizSnapshot: quizAtualizado,
          usuarioSnapshot: currentUserAtualizado,
        },
        criado_em: new Date().toISOString(),
        status: 'pendente'
      };
      setItensPendentesSync(prev => [offlineItem, ...prev]);
    }

    // Efeito visual de confete comemorando a conclusão do quiz.
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  };

  // Season System: End Season & Archive Historical Ranks & Start New Season
  // SISTEMA DE TEMPORADAS: encerra a temporada atual, arquiva os rankings
  // no histórico e inicia uma nova temporada (zerando pontos de ranking,
  // mas preservando os pontos de premiação).
  const encerrarEIniciarNovaTemporada = (
    nomeNovaTemporada: string,
    dataInicio: string,
    dataFim: string
  ) => {
    // 1. Generate snapshot of current sector rankings & collaborator rankings
    // 1. Gera o "retrato" (snapshot) dos rankings atuais para arquivar.
    const rankingSetoresAtual = getRankingsSetores();
    const rankingColabsAtual = getRankingsColaboradores();

    const snapshotHistorico = {
      id: `temp-${Date.now()}`,
      empresa_id: empresa.id,
      nome_temporada: empresa.configuracoes.nome_temporada_atual || 'Temporada Anterior',
      data_inicio: empresa.configuracoes.data_inicio_temporada || new Date().toISOString().split('T')[0],
      data_fim: empresa.configuracoes.data_fim_temporada || new Date().toISOString().split('T')[0],
      data_encerramento: new Date().toISOString(),
      rankings_setores: rankingSetoresAtual,
      rankings_colaboradores: rankingColabsAtual.map((u, idx) => {
        const setorObj = setores.find(s => s.id === u.setor_id);
        return {
          usuario_id: u.id,
          nome: u.nome,
          setor_nome: setorObj?.nome || 'Setor Geral',
          cargo: u.cargo,
          avatar: u.avatar,
          pontos_totais: u.estatisticas.pontos_totais || 0,
          posicao: idx + 1,
        };
      }),
    };

    // 2. Add snapshot to historico_temporadas and update current season configs
    // 2. Arquiva o snapshot no histórico e atualiza o nome/datas da nova temporada.
    setEmpresa(prev => ({
      ...prev,
      configuracoes: {
        ...prev.configuracoes,
        nome_temporada_atual: nomeNovaTemporada,
        data_inicio_temporada: dataInicio,
        data_fim_temporada: dataFim,
      },
      historico_temporadas: [snapshotHistorico, ...(prev.historico_temporadas || [])],
    }));

    // 3. Reset active season points for all users, but PRESERVE accumulated reward points (pontos_resgataveis)!
    // 3. Zera os pontos da temporada ativa, preservando os pontos de prêmio.
    // IMPORTANTE (DESACOPLAMENTO DE TROFÉUS):
    // A virada de temporada NÃO zera mais os contadores de troféus
    // (desafios_vencidos, acertos_totais, quizzes_respondidos, sequências e
    // trofeus_conquistados). Eles valem para sempre (carreira). A temporada
    // só afeta pontos de ranking e registra a Linha do Tempo informativa.
    const nomeTemporadaEncerrada = empresa.configuracoes.nome_temporada_atual || 'Temporada Anterior';
    const dataInicioTemporadaEncerrada = empresa.configuracoes.data_inicio_temporada || '';
    const dataFimTemporadaEncerrada = empresa.configuracoes.data_fim_temporada || '';

    setUsuarios(prev => prev.map(u => {
      const acumuladosAntigos = (u.estatisticas.pontos_resgataveis ?? u.estatisticas.pontos_totais) || 0;

      // Linha do Tempo: registra os troféus conquistados DURANTE esta temporada
      // (filtrados pela data de conquista dentro do período). Puramente informativo.
      const conquistados = u.estatisticas.trofeus_conquistados || [];
      // Troféus que já foram arquivados em temporadas anteriores (evita re-arquivar).
      const nomesJaArquivados = new Set(
        (u.trofeus_temporadas || []).flatMap(t => t.trofeus.map(tr => tr.nome))
      );
      const trofeusDaTemporada = conquistados.filter(t => {
        // Não re-arquiva troféus que já constam em temporadas anteriores.
        if (nomesJaArquivados.has(t.nome)) return false;
        // Sem datas configuradas: arquiva todos os ainda não arquivados.
        if (!dataInicioTemporadaEncerrada && !dataFimTemporadaEncerrada) return true;
        const dt = new Date(t.conquistado_em);
        const inicio = dataInicioTemporadaEncerrada ? new Date(dataInicioTemporadaEncerrada) : null;
        const fim = dataFimTemporadaEncerrada ? new Date(dataFimTemporadaEncerrada) : null;
        if (inicio && dt < inicio) return false;
        if (fim && dt > fim) return false;
        return true;
      });

      const galeriaExistente = u.trofeus_temporadas || [];
      const novaGaleria = trofeusDaTemporada.length > 0
        ? [
            {
              temporada: nomeTemporadaEncerrada,
              data_inicio: dataInicioTemporadaEncerrada,
              data_fim: dataFimTemporadaEncerrada,
              trofeus: trofeusDaTemporada,
            },
            ...galeriaExistente,
          ]
        : galeriaExistente;

      const updatedUser = {
        ...u,
        trofeus_temporadas: novaGaleria,
        estatisticas: {
          ...u.estatisticas,
          pontos_quizzes: 0,
          pontos_desafios: 0,
          pontos_totais: 0,
          pontos_resgataveis: acumuladosAntigos, // Preserved for prizes redemption! // preservados para prêmios
          // ATENÇÃO: contadores de troféus NÃO são zerados (desacoplamento).
          // quizzes_respondidos, acertos_totais, desafios_vencidos, sequências e
          // trofeus_conquistados permanecem intactos.
        },
      };
      supabaseService.upsertUsuario(updatedUser);
      if (currentUser.id === u.id) setCurrentUser(updatedUser);
      return updatedUser;
    }));

    // 4. Reset sector points for active season ranking
    // 4. Zera os pontos de ranking dos setores.
    setSetores(prev => prev.map(s => {
      const updated = { ...s, pontos_totais: 0 };
      supabaseService.upsertSetor(updated);
      return updated;
    }));

    dispararNotificacaoLembrete({
      titulo: '🏆 Nova Temporada Iniciada!',
      mensagem: `A ${nomeNovaTemporada} foi iniciada! Os pontos de ranking foram zerados para a nova disputa. Seus pontos acumulados de prêmios continuam salvos!`,
      tipo: 'alerta_sst',
      canal: 'push'
    });
  };

  // CRUD DE PRÊMIOS (Central de Prêmios)
  // Cria uma nova premiação com ID único e empresa do usuário logado.
  const adicionarPremiacao = (premio: Omit<Premiacao, 'id' | 'empresa_id'>) => {
    // Trava dura: barra prêmio sem nome, custo zerado/negativo ou estoque negativo.
    if (!premio.titulo || !premio.titulo.trim()) {
      alert('Dê um nome para o prêmio antes de salvar.');
      return;
    }
    if (!Number.isFinite(Number(premio.custo_pontos)) || Number(premio.custo_pontos) <= 0) {
      alert('O custo em pontos precisa ser maior que zero.');
      return;
    }
    if (!Number.isFinite(Number(premio.estoque)) || Number(premio.estoque) < 0) {
      alert('O estoque não pode ser negativo.');
      return;
    }
    const item: Premiacao = {
      ...premio,
      id: `prem-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      empresa_id: empresa.id,
    };
    setPremiacoes(prev => [item, ...prev]);
    supabaseService.upsertPremiacao(item);
  };

  // Edita uma premiação existente.
  const editarPremiacao = (id: string, dados: Partial<Premiacao>) => {
    if (dados.titulo !== undefined && !dados.titulo.trim()) {
      alert('O nome do prêmio não pode ficar vazio.');
      return;
    }
    if (dados.custo_pontos !== undefined && (!Number.isFinite(Number(dados.custo_pontos)) || Number(dados.custo_pontos) <= 0)) {
      alert('O custo em pontos precisa ser maior que zero.');
      return;
    }
    if (dados.estoque !== undefined && (!Number.isFinite(Number(dados.estoque)) || Number(dados.estoque) < 0)) {
      alert('O estoque não pode ser negativo.');
      return;
    }    const updated = premiacoes.map(p => p.id === id ? { ...p, ...dados } : p);
    const target = updated.find(p => p.id === id);
    setPremiacoes(updated);
    if (target) supabaseService.upsertPremiacao(target);
  };

  // Exclui uma premiação.
  const excluirPremiacao = (id: string) => {
    setPremiacoes(prev => prev.filter(p => p.id !== id));
    supabaseService.deletePremiacao(id);
  };

  // RESGATE DE PRÊMIO: o colaborador troca pontos por um prêmio.
  // Valida estoque e saldo, desconta os pontos, reduz o estoque e cria o
  // registro do resgate com status 'pendente' (aguardando aprovação do Admin).
  //
  // Quando o Supabase está ativo, a confirmação é FEITA NO SERVIDOR numa
  // transação (RPC resgatar_premio: estoque > 0, saldo, débito, ledger) —
  // evita a corrida pelo último item do estoque. Sem Supabase/offline, usa
  // o fluxo local de compatibilidade.
  const aplicarResgateLocal = (
    premio: Premiacao,
    custo: number,
    novoResgate: ResgatePremio
  ) => {
    // Desconta os pontos do usuário (no saldo de prêmios resgatáveis).
    let usuarioSnapshotAtualizado: Usuario | null = null;
    setUsuarios(prev => prev.map(u => {
      if (u.id === currentUser.id) {
        const updatedUser = {
          ...u,
          estatisticas: {
            ...u.estatisticas,
            pontos_resgataveis: (u.estatisticas.pontos_resgataveis ?? (u.estatisticas.pontos_totais || 0)) - custo,
          }
        };
        usuarioSnapshotAtualizado = updatedUser as Usuario;
        if (!isOfflineMode && navigator.onLine) supabaseService.upsertUsuario(updatedUser);
        return updatedUser;
      }
      return u;
    }));

    setCurrentUser(prev => ({
      ...prev,
      estatisticas: {
        ...prev.estatisticas,
        pontos_resgataveis: (prev.estatisticas.pontos_resgataveis ?? (prev.estatisticas.pontos_totais || 0)) - custo,
      }
    }));

    // Diminui o estoque do prêmio (1 unidade), se o estoque for finito.
    let premiacaoSnapshotAtualizada: Premiacao | null = null;
    if (premio.estoque !== undefined && premio.estoque > 0) {
      const novoEstoque = Math.max(0, premio.estoque - 1);
      const premiacaoAtualizada: Premiacao = { ...premio, estoque: novoEstoque };
      premiacaoSnapshotAtualizada = premiacaoAtualizada;
      setPremiacoes(prev => prev.map(p => p.id === premio.id ? premiacaoAtualizada : p));
      if (!isOfflineMode && navigator.onLine) supabaseService.upsertPremiacao(premiacaoAtualizada);
    }

    // Cria o registro do resgate (status inicial: 'pendente').
    setResgates(prev => [novoResgate, ...prev]);
    if (isOfflineMode || !navigator.onLine) {
      // Offline: guarda na fila de sincronização com os snapshots completos.
      setItensPendentesSync(prev => [
        ...prev,
        {
          id: `sync-${Date.now()}`,
          tipo: 'SOLICITAR_RESGATE',
          payload: {
            resgate: novoResgate,
            usuarioSnapshot: usuarioSnapshotAtualizado,
            premiacaoSnapshot: premiacaoSnapshotAtualizada,
          },
          criado_em: new Date().toISOString(),
          status: 'pendente',
        },
      ]);
    } else {
      supabaseService.upsertResgatePremio(novoResgate);
    }
  };

  const solicitarResgatePremio = async (premiacaoId: string): Promise<{ success: boolean; message: string }> => {
    const premio = premiacoes.find(p => p.id === premiacaoId);
    if (!premio) return { success: false, message: 'Prêmio não encontrado.' };

    const custo = (premio.custo_pontos && premio.custo_pontos > 0) ? premio.custo_pontos : 300;
    const estoqueAtual = premio.estoque ?? 999;

    // Prêmio esgotado?
    if (estoqueAtual <= 0) {
      return { success: false, message: 'Este prêmio está temporariamente esgotado!' };
    }

    // Saldo insuficiente?
    const saldoAtual = (currentUser.estatisticas.pontos_resgataveis ?? currentUser.estatisticas.pontos_totais) || 0;
    if (saldoAtual < custo) {
      return { 
        success: false, 
        message: `Saldo insuficiente! Você possui ${saldoAtual} pts resgatáveis e o prêmio custa ${custo} pts.` 
      };
    }

    const sector = setores.find(s => s.id === currentUser.setor_id);

    // Registro do resgate (status inicial: 'pendente').
    const novoResgate: ResgatePremio = {
      id: `resg-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      empresa_id: currentUser.empresa_id || empresa.id,
      usuario_id: currentUser.id,
      usuario_nome: currentUser.nome,
      usuario_email: currentUser.email,
      usuario_setor_nome: sector?.nome || 'Setor Não Definido',
      premiacao_id: premio.id,
      premiacao_titulo: premio.titulo,
      premiacao_imagem: premio.imagem,
      custo_pontos: custo,
      status: 'pendente',
      data_resgate: new Date().toISOString(),
    };

    // SERVER-FIRST: quando o Supabase está ativo, o resgate é confirmado
    // numa transação no servidor (estoque > 0, saldo, ledger). Se o RPC não
    // estiver disponível, cai no fluxo local de compatibilidade.
    if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
      try {
        const rpcRes = await supabaseService.resgatarPremio(premio.id, novoResgate);
        if (rpcRes) {
          if (!rpcRes.success) {
            return { success: false, message: rpcRes.message || 'Não foi possível realizar o resgate.' };
          }
          aplicarResgateLocal(premio, custo, novoResgate);
          dispararNotificacaoLembrete({
            titulo: '🎁 Resgate de Prêmio Solicitado!',
            mensagem: `Você solicitou o resgate de "${premio.titulo}" por ${custo} pontos. A equipe SST/RH analisará seu pedido em breve.`,
            tipo: 'alerta_sst',
            canal: 'push'
          });
          return { success: true, message: `Resgate de "${premio.titulo}" realizado com sucesso!` };
        }
      } catch (err) {
        console.warn('Falha no resgate server-side, usando fallback local:', err);
      }
    }

    // Fallback legado (sem Supabase / RPC indisponível / offline).
    aplicarResgateLocal(premio, custo, novoResgate);

    // Notifica o colaborador sobre o pedido de resgate.
    dispararNotificacaoLembrete({
      titulo: '🎁 Resgate de Prêmio Solicitado!',
      mensagem: `Você solicitou o resgate de "${premio.titulo}" por ${custo} pontos. A equipe SST/RH analisará seu pedido em breve.`,
      tipo: 'alerta_sst',
      canal: 'push'
    });

    return { success: true, message: `Resgate de "${premio.titulo}" realizado com sucesso!` };
  };

  // O ADMIN atualiza o status de um resgate: aprovado, entregue ou rejeitado.
  // Se rejeitado: devolve os pontos e restaura o estoque do usuário.
  const atualizarStatusResgate = async (resgateId: string, novoStatus: 'aprovado' | 'entregue' | 'rejeitado', observacoes?: string): Promise<boolean> => {
    const resgateTarget = resgates.find(r => r.id === resgateId);
    if (!resgateTarget) return false;

    // Snapshots para a fila de sincronização offline.
    let usuarioSnapshotAtualizada: Usuario | null = null;
    let premiacaoSnapshotAtualizada: Premiacao | null = null;

    // SE REJEITADO: devolve os pontos ao colaborador e devolve 1 unidade ao
    // estoque do prêmio (só se ainda não tinha sido rejeitado antes).
    // Quando o Supabase está ativo, o reembolso acontece numa TRANSAÇÃO no
    // servidor (RPC reembolsar_resgate: pontos + estoque + ledger) e o
    // fallback local só roda se o RPC não estiver disponível.
    let reembolsoServerOk = false;
    if (novoStatus === 'rejeitado' && resgateTarget.status !== 'rejeitado') {
      if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
        try {
          const rpcRes = await supabaseService.reembolsarResgate(resgateId);
          if (rpcRes && rpcRes.success) {
            reembolsoServerOk = true;
          } else if (rpcRes && !rpcRes.success) {
            console.warn('Reembolso server-side recusado:', rpcRes.message);
          }
        } catch (err) {
          console.warn('Falha no reembolso server-side, usando fallback local:', err);
        }
      }

      if (!reembolsoServerOk) {
        const uTarget = usuarios.find(u => u.id === resgateTarget.usuario_id);
        if (uTarget) {
          const saldoAtual = (uTarget.estatisticas.pontos_resgataveis ?? uTarget.estatisticas.pontos_totais) || 0;
          const saldoDevolvido = saldoAtual + resgateTarget.custo_pontos;
          
          setUsuarios(prev => prev.map(u => {
            if (u.id === resgateTarget.usuario_id) {
              const updatedUser = {
                ...u,
                estatisticas: {
                  ...u.estatisticas,
                  pontos_resgataveis: saldoDevolvido
                }
              };
              usuarioSnapshotAtualizada = updatedUser as Usuario;
              if (!isOfflineMode && navigator.onLine) supabaseService.upsertUsuario(updatedUser);
              return updatedUser;
            }
            return u;
          }));

          if (currentUser.id === resgateTarget.usuario_id) {
            setCurrentUser(prev => ({
              ...prev,
              estatisticas: {
                ...prev.estatisticas,
                pontos_resgataveis: saldoDevolvido
              }
            }));
          }
        }

        const pTarget = premiacoes.find(p => p.id === resgateTarget.premiacao_id);
        if (pTarget && pTarget.estoque !== undefined) {
          const estoqueRestaurado = pTarget.estoque + 1;
          const premiacaoAtualizada: Premiacao = { ...pTarget, estoque: estoqueRestaurado };
          premiacaoSnapshotAtualizada = premiacaoAtualizada;
          setPremiacoes(prev => prev.map(p => p.id === pTarget.id ? premiacaoAtualizada : p));
          if (!isOfflineMode && navigator.onLine) supabaseService.upsertPremiacao(premiacaoAtualizada);
        }
      }
    }

    const updatedResgate: ResgatePremio = {
      ...resgateTarget,
      status: novoStatus,
      data_atualizacao: new Date().toISOString(),
      observacoes: observacoes !== undefined ? observacoes : resgateTarget.observacoes,
    };

    setResgates(prev => prev.map(r => r.id === resgateId ? updatedResgate : r));
    if (isOfflineMode || !navigator.onLine) {
      // Offline: guarda na fila de sincronização com os snapshots completos.
      setItensPendentesSync(prev => [
        ...prev,
        {
          id: `sync-${Date.now()}`,
          tipo: 'ATUALIZAR_RESGATE',
          payload: {
            resgate: updatedResgate,
            usuarioSnapshot: usuarioSnapshotAtualizada,
            premiacaoSnapshot: premiacaoSnapshotAtualizada,
          },
          criado_em: new Date().toISOString(),
          status: 'pendente',
        },
      ]);
    } else {
      supabaseService.upsertResgatePremio(updatedResgate);
    }

    // Rótulos amigáveis para cada status (exibidos na notificação).
    const statusLabels: Record<string, string> = {
      aprovado: 'Aprovado ✅',
      entregue: 'Entregue / Concluído 🎁',
      rejeitado: 'Recusado e Pontos Reembolsados ❌',
    };

    // Notifica o colaborador sobre a mudança de status do resgate.
    setNotificacoes(prev => [
      {
        id: `notif-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        usuario_id: resgateTarget.usuario_id,
        titulo: `🎁 Status do Resgate: ${statusLabels[novoStatus] || novoStatus}`,
        mensagem: `Seu pedido de resgate de "${resgateTarget.premiacao_titulo}" foi atualizado para: ${statusLabels[novoStatus]}.${observacoes ? ` Obs: ${observacoes}` : ''}`,
        tipo: 'alerta_sst',
        lida: false,
        criada_em: new Date().toISOString(),
        canal: 'push',
      },
      ...prev
    ]);
    return true;
  };

  // CRUD Empresas
  // --- CRUD DE EMPRESAS (exclusivo do Super Admin) ---
  const adicionarEmpresa = (nova: Omit<Empresa, 'id'>) => {
    // Apenas Super Admin pode cadastrar empresas.
    if (currentUser && currentUser.perfil !== 'super_admin') {
      alert('Atenção: Apenas o usuário Super Administração Global tem permissão para cadastrar novas empresas.');
      return;
    }
    const item: Empresa = {
      ...nova,
      id: `emp-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    };
    setEmpresas(prev => [item, ...prev]);
    supabaseService.upsertEmpresa(item);
  };

  // Edita os dados de uma empresa (e a empresa selecionada, se for ela).
  const editarEmpresa = (id: string, dados: Partial<Empresa>) => {
    // Apenas Super Admin pode editar empresas (paridade com adicionar/excluir).
    if (currentUser && currentUser.perfil !== 'super_admin') {
      alert('Atenção: Apenas o usuário Super Administração Global tem permissão para editar empresas.');
      return;
    }
    const updated = empresas.map(e => e.id === id ? { ...e, ...dados } : e);
    const target = updated.find(e => e.id === id);
    setEmpresas(updated);
    if (target) supabaseService.upsertEmpresa(target);
    if (empresa.id === id) {
      setEmpresa(prev => ({ ...prev, ...dados }));
    }
  };

  // Exclui uma empresa com EXCLUSÃO EM CASCATA: remove também todos os
  // registros vinculados (setores, usuários, perguntas, campanhas, quizzes,
  // desafios, prêmios, resgates e notificações daquela empresa).
  const excluirEmpresa = (id: string) => {
    if (currentUser && currentUser.perfil !== 'super_admin') {
      alert('Atenção: Apenas usuários com perfil Super Admin têm permissão para excluir empresas.');
      return;
    }

    // Cascade Delete: find all users belonging to this company and remove all linked records
    // Encontra os usuários da empresa para saber o que excluir em cascata.
    const usersInCompany = usuarios.filter(u => u.empresa_id === id);
    const userCompanyIds = new Set(usersInCompany.map(u => u.id));

    setSetores(prev => prev.filter(s => s.empresa_id !== id));
    setUsuarios(prev => prev.filter(u => u.empresa_id !== id));
    setPerguntas(prev => prev.filter(p => p.empresa_id !== id));
    setCampanhas(prev => prev.filter(c => c.empresa_id !== id));
    // CORREÇÃO (auditoria forense AUD-24): o campo de usuário do quiz é
    // "colaborador_id" (e não "usuario_id", que não existe no tipo QuizSessao).
    // Sem a correção, quizzes da empresa não eram filtrados localmente.
    setQuizzes(prev => prev.filter(q => q.empresa_id !== id && !userCompanyIds.has(q.colaborador_id)));
    setDesafios(prev => prev.filter(d => d.empresa_id !== id && !userCompanyIds.has(d.desafiante_id) && !userCompanyIds.has(d.desafiado_id)));
    setPremiacoes(prev => prev.filter(pr => pr.empresa_id !== id));
    setNotificacoes(prev => prev.filter(n => !userCompanyIds.has(n.usuario_id)));

    setEmpresas(prev => prev.filter(e => e.id !== id));
    supabaseService.deleteEmpresa(id);
  };

  // Custom Categories State
  // CATEGORIAS PERSONALIZADAS: o Admin pode criar categorias de perguntas
  // além das padrão. Ficam salvas no localStorage.
  const DEFAULT_CATEGORIES = [
    'SST',
    'Meio Ambiente',
    'Procedimentos Internos',
    'Procedimentos Operacionais',
    'Normas e Treinamentos'
  ];

  const [categoriasPersonalizadas, setCategoriasPersonalizadas] = useState<string[]>(() => {
    return safeJsonParse(localStorage.getItem('sst_categorias_custom'), []);
  });

  // Salva as categorias personalizadas a cada alteração.
  useEffect(() => {
    localStorage.setItem('sst_categorias_custom', JSON.stringify(categoriasPersonalizadas));
  }, [categoriasPersonalizadas]);

  // Adiciona uma nova categoria personalizada (sem duplicar as padrão).
  const adicionarCategoriaPersonalizada = (nova: string) => {
    const trimmed = nova.trim();
    if (trimmed && !categoriasPersonalizadas.includes(trimmed) && !DEFAULT_CATEGORIES.includes(trimmed)) {
      setCategoriasPersonalizadas(prev => [...prev, trimmed]);
    }
  };

  // Lista final de categorias disponíveis = padrão + personalizadas +
  // categorias já usadas em perguntas existentes (sem repetir).
  const categoriasDisponiveis = Array.from(
    new Set([
      ...DEFAULT_CATEGORIES,
      ...categoriasPersonalizadas,
      ...perguntas.map(p => p.categoria)
    ])
  ).filter(Boolean);

  // CRUD Setores
  // --- CRUD DE SETORES ---
  // Cria um novo setor para a empresa.
  const adicionarSetor = (nome: string, empresaId?: string) => {
    const targetEmpresaId = empresaId || empresa.id;
    const novoSetor: Setor = {
      id: `set-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      empresa_id: targetEmpresaId,
      nome,
      colaboradores_ativos: 0,
    };
    setSetores(prev => [...prev, novoSetor]);
    supabaseService.upsertSetor(novoSetor);
  };

  // Adiciona vários setores de uma vez (importação CSV), sem duplicar.
  const adicionarSetoresLote = (nomesSetores: string[], empresaId?: string) => {
    const targetEmpresaId = empresaId || empresa.id;
    const novos: Setor[] = [];
    
    nomesSetores.forEach((nome, idx) => {
      const cleanNome = nome.trim();
      if (cleanNome) {
        // Verifica se o setor já existe (ignorando maiúsculas/minúsculas).
        const exists = setores.some(s => s.empresa_id === targetEmpresaId && s.nome.toLowerCase() === cleanNome.toLowerCase());
        if (!exists) {
          const item: Setor = {
            id: `set-${Date.now()}-${idx}-${Math.floor(Math.random()*1000)}`,
            empresa_id: targetEmpresaId,
            nome: cleanNome,
            colaboradores_ativos: 0,
          };
          novos.push(item);
        }
      }
    });

    if (novos.length > 0) {
      setSetores(prev => [...prev, ...novos]);
      novos.forEach(s => supabaseService.upsertSetor(s));
    }
  };

  // Renomeia um setor.
  const editarSetor = (id: string, nome: string) => {
    const updated = setores.map(s => s.id === id ? { ...s, nome } : s);
    const target = updated.find(s => s.id === id);
    setSetores(updated);
    if (target) supabaseService.upsertSetor(target);
  };

  // Exclui um setor.
  const excluirSetor = (id: string) => {
    setSetores(prev => prev.filter(s => s.id !== id));
    supabaseService.deleteSetor(id);
  };

  // CRUD Usuarios
  // --- CRUD DE USUÁRIOS ---
  // Cria um novo usuário. REGRA DE SEGURANÇA: apenas um Super Admin pode
  // criar outro Super Admin; senão o perfil é rebaixado para 'admin'.
  const adicionarUsuario = (novoUsuario: {
    nome: string;
    email: string;
    cargo: string;
    setor_id: string;
    empresa_id?: string;
    perfil: 'colaborador' | 'admin' | 'super_admin';
    is_instrutor?: boolean;
    avatar?: string;
    senha?: string;
  }) => {
    // REGRA: respeitar o Limite de Colaboradores da empresa (Plano de Licença).
    // Antes o campo limite_colaboradores era só visual e deixava cadastrar além do contratado.
    const empresaAlvoId = novoUsuario.empresa_id || empresa.id;
    const empresaAlvo = empresas.find(e => e.id === empresaAlvoId) || (empresa.id === empresaAlvoId ? empresa : undefined);
    const limite = empresaAlvo?.limite_colaboradores ?? 100;
    const totalNaEmpresa = usuarios.filter(u => u.empresa_id === empresaAlvoId).length;
    if (totalNaEmpresa >= limite) {
      alert(`Limite de colaboradores atingido! A empresa "${empresaAlvo?.nome || 'selecionada'}" permite ${limite} colaboradores (Plano ${empresaAlvo?.plano || ''}). Não é possível cadastrar "${novoUsuario.nome}".`);
      return false;
    }
    // Security Check: Only super_admin can create super_admin accounts
    // Regra de segurança: só Super Admin cria conta Super Admin.
    let finalPerfil = novoUsuario.perfil;
    if (finalPerfil === 'super_admin' && currentUser?.perfil !== 'super_admin') {
      finalPerfil = 'admin';
    }

    const item: Usuario = {
      id: `usr-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      empresa_id: novoUsuario.empresa_id || empresa.id,
      setor_id: novoUsuario.setor_id,
      nome: novoUsuario.nome,
      email: novoUsuario.email,
      senha: (novoUsuario.senha && novoUsuario.senha.trim() !== '') ? novoUsuario.senha.trim() : '123456',
      cargo: novoUsuario.cargo,
      perfil: finalPerfil,
      is_instrutor: novoUsuario.is_instrutor || false,
      ativo: true,
      avatar: novoUsuario.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250',
      estatisticas: {
        pontos_quizzes: 0,
        pontos_desafios: 0,
        pontos_totais: 0,
        streak_dias: 0,
        quizzes_respondidos: 0,
        acertos_totais: 0,
        erros_totais: 0,
        tempo_medio_resposta_seg: 0,
        desafios_vencidos: 0,
        desafios_jogados: 0,
        trofeus_conquistados: [],
        defesas_vencidas: 0,
        sequencia_vitorias: 0,
        maior_sequencia_vitorias: 0,
        sequencia_defesas: 0,
        maior_sequencia_defesas: 0,
        sequencia_acertos: 0,
        maior_sequencia_acertos: 0,
      },
    };
    setUsuarios(prev => [...prev, item]);

    if (!isOfflineMode && navigator.onLine && isSupabaseActive) {
      supabaseService.upsertUsuario(item).then(ok => {
        if (!ok) {
          setItensPendentesSync(prev => [
            ...prev,
            {
              id: `sync-usr-${Date.now()}`,
              tipo: 'CRIAR_USUARIO',
              payload: item,
              criado_em: new Date().toISOString(),
              status: 'pendente',
            }
          ]);
        }
      }).catch(() => {
        setItensPendentesSync(prev => [
          ...prev,
          {
            id: `sync-usr-${Date.now()}`,
            tipo: 'CRIAR_USUARIO',
            payload: item,
            criado_em: new Date().toISOString(),
            status: 'pendente',
          }
        ]);
      });
    } else {
      setItensPendentesSync(prev => [
        ...prev,
        {
          id: `sync-usr-${Date.now()}`,
          tipo: 'CRIAR_USUARIO',
          payload: item,
          criado_em: new Date().toISOString(),
          status: 'pendente',
        }
      ]);
    }
    return true;
  };

  // Cadastro em lote de usuários (importação CSV).
  // Cria setores automaticamente se o setor informado não existir,
  // atualiza usuários que já existem (por e-mail) e respeita a regra de
  // segurança de perfis.
  const adicionarUsuariosLote = (novosUsuarios: {
    nome: string;
    email: string;
    senha?: string;
    cargo: string;
    setor_nome: string;
    perfil: 'colaborador' | 'admin' | 'super_admin';
    is_instrutor?: boolean;
  }[], targetEmpresaId?: string): { cadastrados: number; atualizados: number; bloqueadosPorLimite: number } => {
    const targetEmpId = targetEmpresaId || empresa.id;
    let cadastrados = 0;
    let atualizados = 0;
    let bloqueadosPorLimite = 0;
    const empresaAlvoLote = empresas.find(e => e.id === targetEmpId) || (empresa.id === targetEmpId ? empresa : undefined);
    const limiteLote = empresaAlvoLote?.limite_colaboradores ?? 100;

    // Cópias de trabalho dos estados (para processar tudo antes de salvar).
    let currentSectors = [...setores];
    let currentUsers = [...usuarios];

    novosUsuarios.forEach((u, idx) => {
      const cleanEmail = (u.email || '').trim().toLowerCase();

      // Find or create sector
      // Procura o setor na empresa alvo; se não existir, cria automaticamente.
      let sector = currentSectors.find(
        s => s.empresa_id === targetEmpId && s.nome.toLowerCase() === (u.setor_nome || '').trim().toLowerCase()
      );

      if (!sector && (u.setor_nome || '').trim()) {
        sector = {
          id: `set-${Date.now()}-${idx}-${Math.floor(Math.random()*1000)}`,
          empresa_id: targetEmpId,
          nome: (u.setor_nome || '').trim(),
          colaboradores_ativos: 0,
        };
        currentSectors.push(sector);
        supabaseService.upsertSetor(sector);
      }

      // Se nenhum setor foi definido, usa o primeiro setor da empresa.
      const defaultSector = currentSectors.find(s => s.empresa_id === targetEmpId);
      const sectorIdToUse = sector ? sector.id : (defaultSector?.id || 'set-1');

      // Security Guard: Prevent non-super_admin from setting super_admin perfil
      // Regra de segurança: impede que não-super-admin cadastre super admin.
      let userPerfil = u.perfil || 'colaborador';
      if (userPerfil === 'super_admin' && currentUser?.perfil !== 'super_admin') {
        userPerfil = 'colaborador';
      }

      // Check if user already exists by email
      // Verifica se o usuário já existe (pelo e-mail).
      const existingIdx = currentUsers.findIndex(ex => (ex.email || '').trim().toLowerCase() === cleanEmail);

      if (existingIdx >= 0) {
        // UPDATE EXISTING USER
        // USUÁRIO JÁ EXISTE → atualiza os dados dele.
        const existing = currentUsers[existingIdx];
        const updatedUser: Usuario = {
          ...existing,
          nome: (u.nome || '').trim() || existing.nome,
          senha: u.senha && (u.senha || '').trim() ? u.senha.trim() : existing.senha,
          cargo: (u.cargo || '').trim() || existing.cargo,
          setor_id: sectorIdToUse,
          perfil: userPerfil,
          is_instrutor: u.is_instrutor !== undefined ? u.is_instrutor : existing.is_instrutor,
        };
        currentUsers[existingIdx] = updatedUser;
        supabaseService.upsertUsuario(updatedUser);
        atualizados++;
      } else {
        // INSERT NEW USER — respeita o limite do plano antes de criar.
        if (currentUsers.filter(u => u.empresa_id === targetEmpId).length >= limiteLote) {
          bloqueadosPorLimite++;
          return;
        }
        // USUÁRIO NOVO → cria com estatísticas zeradas.
        const newUser: Usuario = {
          id: `usr-${Date.now()}-${idx}-${Math.floor(Math.random()*1000)}`,
          empresa_id: targetEmpId,
          setor_id: sectorIdToUse,
          nome: (u.nome || '').trim(),
          email: cleanEmail,
          senha: u.senha && (u.senha || '').trim() ? u.senha.trim() : gerarSenhaPadrao(),
          cargo: (u.cargo || '').trim() || 'Colaborador SST',
          perfil: userPerfil,
          is_instrutor: u.is_instrutor || false,
          ativo: true,
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250',
          estatisticas: {
            pontos_quizzes: 0,
            pontos_desafios: 0,
            pontos_totais: 0,
            streak_dias: 0,
            quizzes_respondidos: 0,
            acertos_totais: 0,
            erros_totais: 0,
            tempo_medio_resposta_seg: 0,
            desafios_vencidos: 0,
            desafios_jogados: 0,
            trofeus_conquistados: [],
            defesas_vencidas: 0,
            sequencia_vitorias: 0,
            maior_sequencia_vitorias: 0,
            sequencia_defesas: 0,
            maior_sequencia_defesas: 0,
            sequencia_acertos: 0,
            maior_sequencia_acertos: 0,
          },
          created_at: new Date().toISOString()
        };
        currentUsers.push(newUser);
        supabaseService.upsertUsuario(newUser);
        cadastrados++;
      }
    });

    setSetores(currentSectors);
    setUsuarios(currentUsers);

    if (bloqueadosPorLimite > 0) {
      alert(`Limite de colaboradores atingido! ${bloqueadosPorLimite} cadastro(s) bloqueado(s). A empresa permite ${limiteLote} colaboradores (Plano ${empresaAlvoLote?.plano || ''}).`);
    }
    return { cadastrados, atualizados, bloqueadosPorLimite };
  };

  // Edita um usuário (e atualiza o currentUser se for ele próprio).
  const editarUsuario = (id: string, dados: Partial<Usuario>) => {
    const updated = usuarios.map(u => u.id === id ? { ...u, ...dados } : u);
    const target = updated.find(u => u.id === id);
    setUsuarios(updated);
    if (target) {
      if (isOfflineMode || !navigator.onLine) {
        // Offline: guarda o snapshot do usuário editado na fila de sincronização.
        setItensPendentesSync(prev => [
          ...prev,
          {
            id: `sync-${Date.now()}`,
            tipo: 'EDITAR_PERFIL',
            payload: { usuarioSnapshot: target },
            criado_em: new Date().toISOString(),
            status: 'pendente',
          },
        ]);
      } else {
        supabaseService.upsertUsuario(target);
      }
    }
    if (currentUser.id === id) {
      setCurrentUser(prev => ({ ...prev, ...dados }));
    }
  };

  // Exclui um usuário.
  const excluirUsuario = (id: string) => {
    // Regra: nunca permitir auto-exclusão (lockout) nem excluir o último admin da empresa.
    if (currentUser && id === currentUser.id) {
      alert('Atenção: Você não pode excluir o próprio usuário logado.');
      return;
    }
    const alvo = usuarios.find(u => u.id === id);
    if (alvo && (alvo.perfil === 'admin' || alvo.perfil === 'super_admin')) {
      const adminsRestantes = usuarios.filter(u => u.empresa_id === alvo.empresa_id && (u.perfil === 'admin' || u.perfil === 'super_admin') && u.id !== id && u.ativo !== false);
      if (adminsRestantes.length === 0 && alvo.perfil === 'admin') {
        alert('Atenção: Não é possível excluir o último administrador da empresa.');
        return;
      }
    }
    setUsuarios(prev => prev.filter(u => u.id !== id));
    supabaseService.deleteUsuario(id);
  };

  // Backup & Restore System State
  // ESTADO DO SISTEMA DE BACKUP/RESTAURAÇÃO: guarda o histórico de backups
  // feitos (manuais e automáticos) com o snapshot completo dos dados.
  const [historicoBackups, setHistoricoBackups] = useState<{
    id: string;
    data: string;
    tipo: 'manual' | 'automatico';
    tamanhoKb: number;
    resumo: string;
    escopo?: 'empresa' | 'global';
    empresaId?: string;
    empresaNome?: string;
    jsonSnapshot?: string;
  }[]>(() => {
    try {
      const saved = localStorage.getItem('sst_backups_history');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return parsed.map((item: any) => {
        // O snapshot (dados completos) fica salvo em uma chave separada.
        const snap = localStorage.getItem(`sst_backup_snap_${item.id}`);
        return {
          ...item,
          jsonSnapshot: snap || item.jsonSnapshot
        };
      });
    } catch {
      return [];
    }
  });

  // Medalhas configuráveis pelo Admin (armazenamento local + opcional Supabase)
  // MEDALHAS PERSONALIZADAS: o Admin pode criar suas próprias medalhas
  // (além das automáticas de streak e vitórias). Ficam no localStorage.
  const [medalhasConfiguraveis, setMedalhasConfiguraveis] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem('sst_medalhas_config');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const adicionarMedalha = (m: any) => {
    const item = { id: `med-${Date.now()}`, ...m };
    setMedalhasConfiguraveis(prev => {
      const updated = [item, ...prev];
      try { localStorage.setItem('sst_medalhas_config', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const editarMedalha = (id: string, m: any) => {
    setMedalhasConfiguraveis(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...m } : p);
      try { localStorage.setItem('sst_medalhas_config', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  const excluirMedalha = (id: string) => {
    setMedalhasConfiguraveis(prev => {
      const updated = prev.filter(p => p.id !== id);
      try { localStorage.setItem('sst_medalhas_config', JSON.stringify(updated)); } catch (e) {}
      return updated;
    });
  };

  // GERA UM BACKUP do sistema. Pode ser:
  //  - 'global': todos os dados de todas as empresas.
  //  - 'empresa' (informando empresaId): apenas os dados de uma empresa.
  // Retorna o JSON e o nome do arquivo; salva no histórico e baixa o arquivo
  // no navegador quando é um backup manual.
  const gerarBackupSistema = (tipo: 'manual' | 'automatico' = 'manual', empresaId?: string) => {
    const isEmpresaEspecifica = Boolean(empresaId && empresaId !== 'todas' && empresaId !== 'global');
    const empresaAlvo = isEmpresaEspecifica ? empresas.find(e => e.id === empresaId) : null;

    // Filtra os dados conforme o escopo do backup (empresa específica ou global).
    const setoresFiltro = isEmpresaEspecifica ? setores.filter(s => s.empresa_id === empresaId) : setores;
    const usuariosFiltro = isEmpresaEspecifica ? usuarios.filter(u => u.empresa_id === empresaId) : usuarios;
    const perguntasFiltro = isEmpresaEspecifica ? perguntas.filter(p => p.empresa_id === empresaId) : perguntas;
    const campanhasFiltro = isEmpresaEspecifica ? campanhas.filter(c => c.empresa_id === empresaId) : campanhas;
    const quizzesFiltro = isEmpresaEspecifica ? quizzes.filter(q => q.empresa_id === empresaId) : quizzes;
    const desafiosFiltro = isEmpresaEspecifica ? desafios.filter(d => d.empresa_id === empresaId) : desafios;
    const premiacoesFiltro = isEmpresaEspecifica ? premiacoes.filter(p => p.empresa_id === empresaId) : premiacoes;
    const resgatesFiltro = isEmpresaEspecifica ? resgates.filter(r => r.empresa_id === empresaId) : resgates;

    // Monta o objeto completo do backup com todos os dados.
    const backupData = {
      versao: '3.1-corporate',
      tipo,
      escopo: isEmpresaEspecifica ? 'empresa' : 'global',
      empresaId: isEmpresaEspecifica ? empresaId : undefined,
      empresaNome: empresaAlvo ? empresaAlvo.nome : undefined,
      dataExportacao: new Date().toISOString(),
      empresas: isEmpresaEspecifica ? (empresaAlvo ? [empresaAlvo] : []) : empresas,
      setores: setoresFiltro,
      usuarios: usuariosFiltro,
      perguntas: perguntasFiltro,
      campanhas: campanhasFiltro,
      quizzes: quizzesFiltro,
      desafios: desafiosFiltro,
      premiacoes: premiacoesFiltro,
      resgates: resgatesFiltro,
      notificacoes: isEmpresaEspecifica ? notificacoes.filter(n => usuariosFiltro.some(u => u.id === n.usuario_id)) : notificacoes,
      categoriasPersonalizadas,
    };

    // Serializa o backup em JSON e gera nome do arquivo + tamanho em KB.
    const jsonString = JSON.stringify(backupData, null, 2);
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const empresaSlug = empresaAlvo ? empresaAlvo.nome.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'global';
    const filename = `sst_backup_${empresaSlug}_${tipo}_${dateStr}.json`;
    const tamanhoKb = Math.round(new Blob([jsonString]).size / 1024);

    // Resumo legível para o histórico de backups.
    const resumo = isEmpresaEspecifica
      ? `Empresa "${empresaAlvo?.nome || empresaId}": ${setoresFiltro.length} setores, ${usuariosFiltro.length} usuários, ${quizzesFiltro.length} quizzes`
      : `Global (${empresas.length} emp): ${usuarios.length} usuários, ${perguntas.length} perguntas, ${quizzes.length} quizzes`;

    // Registra o backup no histórico local (máximo 30 backups, sem duplicar ID).
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const novoRegistro = {
      id: `bkp-${Date.now()}-${randomSuffix}-${empresaId || 'global'}`,
      data: new Date().toISOString(),
      tipo,
      tamanhoKb,
      resumo,
      escopo: (isEmpresaEspecifica ? 'empresa' : 'global') as 'empresa' | 'global',
      empresaId: isEmpresaEspecifica ? empresaId : undefined,
      empresaNome: empresaAlvo?.nome,
      jsonSnapshot: jsonString,
    };

    setHistoricoBackups(prev => {
      // Deduplicate by ID
      // Remove duplicidades pelo ID antes de adicionar o novo registro.
      const filtered = prev.filter(p => p.id !== novoRegistro.id);
      const updated = [novoRegistro, ...filtered].slice(0, 30);
      try {
        // Salva o histórico sem o snapshot (grande) e o snapshot separadamente.
        localStorage.setItem('sst_backups_history', JSON.stringify(updated.map(({ jsonSnapshot, ...rest }) => rest)));
        localStorage.setItem('sst_backup_latest_data', jsonString);
        localStorage.setItem(`sst_backup_snap_${novoRegistro.id}`, jsonString);
      } catch (err) {
        console.warn('Erro ao salvar histórico de backup no localStorage:', err);
      }
      return updated;
    });

    // Save backup record in Supabase backups_historico table if connected
    // Salva também o registro do backup na tabela do Supabase (se conectado).
    supabaseService.upsertBackupHistorico({
      id: novoRegistro.id,
      empresa_id: isEmpresaEspecifica ? empresaId : undefined,
      tipo,
      data: novoRegistro.data,
      tamanho_kb: tamanhoKb,
      resumo,
      dados: backupData
    });

    // FASE 8 — BACKUP SERVER-SIDE: envia a mesma cópia para o servidor local
    // (Express grava no disco em /backups). Não-bloqueante: se o servidor não
    // estiver disponível ou a rota falhar, o backup local/nuvem segue valendo.
    if (tipo === 'automatico' || tipo === 'manual') {
      try {
        apiFetch('/api/backups', {
          method: 'POST',
          headers: apiHeaders(),
          body: JSON.stringify({
            id: novoRegistro.id,
            data: novoRegistro.data,
            tipo,
            tamanhoKb,
            resumo,
            escopo: isEmpresaEspecifica ? 'empresa' : 'global',
            empresaId: isEmpresaEspecifica ? empresaId : undefined,
            jsonSnapshot: jsonString,
          }),
        }).catch(() => {});
      } catch {
        // Falha silenciosa: backup local já garante a durabilidade.
      }
    }

    // Backup manual: baixa o arquivo JSON (Web) ou compartilha nativo (Capacitor).
    // Mantido SÍNCRONO de propósito (assinatura pública não muda): o Share nativo roda fire-and-forget.
    if (tipo === 'manual' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const blob = new Blob([jsonString], { type: 'application/json' });
        // Capacitor: Share sheet no Android/iOS; <a download> na Web (mesmo comportamento).
        void import('../lib/capacitor').then(({ saveOrShareFile }) => saveOrShareFile(blob, filename, 'application/json')).catch(() => {});
      } catch (err) {
        console.error('Erro no download do backup:', err);
      }
    }

    return { jsonString, filename };
  };

  // RESTAURAÇÃO DE BACKUP.
  // Se o backup é de uma empresa específica → restaura apenas os dados da
  // empresa (as outras empresas ficam intactas).
  // Se o backup é global → substitui todos os dados do sistema.
  const restaurarBackupSistema = (jsonContent: string, targetEmpresaId?: string) => {
    try {
      const parsed = JSON.parse(jsonContent);
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, message: 'Arquivo de backup inválido ou corrompido.' };
      }

      // Determina a empresa alvo da restauração (quando o backup é de empresa).
      const empIdAlvo = targetEmpresaId || (parsed.escopo === 'empresa' ? parsed.empresaId : undefined) || (parsed.empresas?.length === 1 ? parsed.empresas[0]?.id : undefined);

      if (empIdAlvo) {
        // --- ISOLATED COMPANY RESTORE (RESTAURAÇÃO ISOLADA POR EMPRESA) ---
        // Restaura apenas os dados da empresa alvo, substituindo os registros
        // dessa empresa e mantendo todas as outras intactas.
        const nomeEmpRestaurada = parsed.empresaNome || parsed.empresas?.find((e: Empresa) => e.id === empIdAlvo)?.nome || empIdAlvo;

        if (parsed.empresas && Array.isArray(parsed.empresas) && parsed.empresas.length > 0) {
          // Substitui apenas a empresa alvo na lista.
          setEmpresas(prev => {
            const updated = prev.filter(e => e.id !== empIdAlvo).concat(parsed.empresas);
            localStorage.setItem('sst_empresas', JSON.stringify(updated));
            return updated;
          });
          // Se a empresa restaurada é a selecionada no momento, atualiza ela.
          const empRest = parsed.empresas.find((e: Empresa) => e.id === empIdAlvo);
          if (empRest && empRest.id === empresa.id) {
            setEmpresa(empRest);
            localStorage.setItem('sst_empresa', JSON.stringify(empRest));
          }
        }

        // Restaura setores da empresa.
        if (parsed.setores && Array.isArray(parsed.setores)) {
          setSetores(prev => {
            const updated = prev.filter(s => s.empresa_id !== empIdAlvo).concat(parsed.setores);
            localStorage.setItem('sst_setores', JSON.stringify(updated));
            return updated;
          });
        }

        // Restaura usuários da empresa.
        if (parsed.usuarios && Array.isArray(parsed.usuarios)) {
          setUsuarios(prev => {
            const updated = prev.filter(u => u.empresa_id !== empIdAlvo).concat(parsed.usuarios);
            localStorage.setItem('sst_usuarios', JSON.stringify(updated));
            // Se o usuário logado está no backup, mantém ele como atual.
            const currentUserInBackup = parsed.usuarios.find((u: Usuario) => u.id === currentUser.id);
            if (currentUserInBackup) {
              setCurrentUser(currentUserInBackup);
              localStorage.setItem('sst_current_user_id', currentUserInBackup.id);
            }
            return updated;
          });
        }

        // Restaura perguntas da empresa.
        if (parsed.perguntas && Array.isArray(parsed.perguntas)) {
          setPerguntas(prev => {
            const updated = prev.filter(p => p.empresa_id !== empIdAlvo).concat(parsed.perguntas);
            localStorage.setItem('sst_perguntas', JSON.stringify(updated));
            return updated;
          });
        }

        // Restaura campanhas da empresa.
        if (parsed.campanhas && Array.isArray(parsed.campanhas)) {
          setCampanhas(prev => {
            const updated = prev.filter(c => c.empresa_id !== empIdAlvo).concat(parsed.campanhas);
            localStorage.setItem('sst_campanhas', JSON.stringify(updated));
            return updated;
          });
        }

        // Restaura quizzes da empresa.
        if (parsed.quizzes && Array.isArray(parsed.quizzes)) {
          setQuizzes(prev => {
            const updated = prev.filter(q => q.empresa_id !== empIdAlvo).concat(parsed.quizzes);
            localStorage.setItem('sst_quizzes', JSON.stringify(updated));
            return updated;
          });
        }

        // Restaura desafios da empresa.
        if (parsed.desafios && Array.isArray(parsed.desafios)) {
          setDesafios(prev => {
            const updated = prev.filter(d => d.empresa_id !== empIdAlvo).concat(parsed.desafios);
            localStorage.setItem('sst_desafios', JSON.stringify(updated));
            return updated;
          });
        }

        // Restaura premiações da empresa.
        if (parsed.premiacoes && Array.isArray(parsed.premiacoes)) {
          setPremiacoes(prev => {
            const updated = prev.filter(p => p.empresa_id !== empIdAlvo).concat(parsed.premiacoes);
            localStorage.setItem('sst_premiacoes', JSON.stringify(updated));
            return updated;
          });
        }

        // Restaura resgates da empresa.
        if (parsed.resgates && Array.isArray(parsed.resgates)) {
          setResgates(prev => {
            const updated = prev.filter(r => r.empresa_id !== empIdAlvo).concat(parsed.resgates);
            localStorage.setItem('sst_resgates', JSON.stringify(updated));
            return updated;
          });
        }

        // Sync company restoration to Supabase if connected
        // Sincroniza a restauração da empresa com o Supabase (se conectado).
        // Usa os dados do backup (parsed.*) em vez do estado do closure (que
        // fica desatualizado logo após o setX* da restauração).
        setTimeout(() => {
          supabaseService.seedInitialDataIfEmpty(
            parsed.empresas || empresas,
            parsed.setores || setores,
            parsed.usuarios || usuarios,
            parsed.perguntas || perguntas,
            parsed.campanhas || campanhas,
            parsed.quizzes || quizzes,
            parsed.desafios || desafios,
            parsed.premiacoes || premiacoes,
            true
          );
        }, 500);

        return {
          success: true,
          message: `Backup da Empresa "${nomeEmpRestaurada}" restaurado com sucesso!`,
          detalhes: `Registros isolados da empresa atualizados. Todas as demais empresas do sistema permaneceram intactas sem qualquer alteração.`
        };

      } else {
        // --- GLOBAL SYSTEM RESTORE (RESTAURAÇÃO GLOBAL) ---
        // Substitui TODOS os dados do sistema pelos dados do backup.
        if (parsed.empresas && Array.isArray(parsed.empresas)) {
          setEmpresas(parsed.empresas);
          localStorage.setItem('sst_empresas', JSON.stringify(parsed.empresas));
          // Mantém a empresa do usuário logado (ou a primeira do backup).
          const foundEmpresa = parsed.empresas.find((e: Empresa) => e.id === currentUser.empresa_id) || parsed.empresas[0];
          if (foundEmpresa) {
            setEmpresa(foundEmpresa);
            localStorage.setItem('sst_empresa', JSON.stringify(foundEmpresa));
          }
        }

        if (parsed.setores && Array.isArray(parsed.setores)) {
          setSetores(parsed.setores);
          localStorage.setItem('sst_setores', JSON.stringify(parsed.setores));
        }

        if (parsed.usuarios && Array.isArray(parsed.usuarios)) {
          setUsuarios(parsed.usuarios);
          localStorage.setItem('sst_usuarios', JSON.stringify(parsed.usuarios));
          const userInBackup = parsed.usuarios.find((u: Usuario) => u.id === currentUser.id);
          if (userInBackup) {
            setCurrentUser(userInBackup);
            localStorage.setItem('sst_current_user_id', userInBackup.id);
          }
        }

        if (parsed.perguntas && Array.isArray(parsed.perguntas)) {
          setPerguntas(parsed.perguntas);
          localStorage.setItem('sst_perguntas', JSON.stringify(parsed.perguntas));
        }

        if (parsed.campanhas && Array.isArray(parsed.campanhas)) {
          setCampanhas(parsed.campanhas);
          localStorage.setItem('sst_campanhas', JSON.stringify(parsed.campanhas));
        }

        if (parsed.quizzes && Array.isArray(parsed.quizzes)) {
          setQuizzes(parsed.quizzes);
          localStorage.setItem('sst_quizzes', JSON.stringify(parsed.quizzes));
        }

        if (parsed.desafios && Array.isArray(parsed.desafios)) {
          setDesafios(parsed.desafios);
          localStorage.setItem('sst_desafios', JSON.stringify(parsed.desafios));
        }

        if (parsed.premiacoes && Array.isArray(parsed.premiacoes)) {
          setPremiacoes(parsed.premiacoes);
          localStorage.setItem('sst_premiacoes', JSON.stringify(parsed.premiacoes));
        }

        if (parsed.resgates && Array.isArray(parsed.resgates)) {
          setResgates(parsed.resgates);
          localStorage.setItem('sst_resgates', JSON.stringify(parsed.resgates));
        }

        if (parsed.notificacoes && Array.isArray(parsed.notificacoes)) {
          setNotificacoes(parsed.notificacoes);
          localStorage.setItem('sst_notificacoes', JSON.stringify(parsed.notificacoes));
        }

        if (parsed.categoriasPersonalizadas && Array.isArray(parsed.categoriasPersonalizadas)) {
          setCategoriasPersonalizadas(parsed.categoriasPersonalizadas);
          localStorage.setItem('sst_categorias_custom', JSON.stringify(parsed.categoriasPersonalizadas));
        }

        // Sync global restoration to Supabase if connected
        // Sincroniza a restauração global com o Supabase (se conectado).
        // CORREÇÃO: limpa as tabelas primeiro para remover registros que não
        // existem no backup (ex.: usuários/perguntas excluídos), garantindo
        // consistência total entre o backup e a nuvem.
        setTimeout(() => {
          supabaseService.limparTodasTabelas().then(() => {
            return supabaseService.seedInitialDataIfEmpty(
              parsed.empresas || empresas,
              parsed.setores || setores,
              parsed.usuarios || usuarios,
              parsed.perguntas || perguntas,
              parsed.campanhas || campanhas,
              parsed.quizzes || quizzes,
              parsed.desafios || desafios,
              parsed.premiacoes || premiacoes,
              true
            );
          }).catch((err) => {
            console.error('Erro ao restaurar global no Supabase:', err);
          });
        }, 500);

        return {
          success: true,
          message: 'Backup global restaurado com sucesso!',
          detalhes: `${parsed.empresas?.length || 0} empresas, ${parsed.usuarios?.length || 0} usuários, ${parsed.perguntas?.length || 0} perguntas atualizadas.`
        };
      }
    } catch (err: any) {
      return { success: false, message: `Erro ao processar backup: ${err?.message || 'Formato JSON inválido'}` };
    }
  };

  // ============================================================================
  // LÓGICA E ESTADOS DO MÓDULO QUIZ GUIADO (TEMPO REAL)
  // ============================================================================
  const [salasQuizGuiado, setSalasQuizGuiado] = useState<SalaQuizGuiado[]>(() => {
    return safeJsonParse(localStorage.getItem('sst_salas_quiz_guiado'), []);
  });

  const [resultadosAvaliacaoSST, setResultadosAvaliacaoSST] = useState<ResultadoAvaliacaoSST[]>(() => {
    return safeJsonParse(localStorage.getItem('sst_resultados_avaliacao_sst'), []);
  });

  useEffect(() => {
    safeSetItem('sst_salas_quiz_guiado', JSON.stringify(salasQuizGuiado));
  }, [salasQuizGuiado]);

  useEffect(() => {
    safeSetItem('sst_resultados_avaliacao_sst', JSON.stringify(resultadosAvaliacaoSST));
  }, [resultadosAvaliacaoSST]);

  // FASE 7 — HIDRATAÇÃO DO INDEXEDDB: no boot, se o IndexedDB tiver uma cópia
  // mais recente/volumosa de uma coleção pesada, promove-a para o estado (e
  // para o cache localStorage). Idempotente: só age quando o IndexedDB difere.
  useEffect(() => {
    const hidratar = async () => {
      // CORREÇÃO (corrida de hidratação): se o Supabase já entregou os dados
      // (nuvem é a fonte oficial), não promova cópias antigas do IndexedDB.
      if (supabaseHidratouRef.current) return;
      const alvo: { chave: string; aplicar: (v: unknown) => void }[] = [
        { chave: 'sst_salas_quiz_guiado', aplicar: v => setSalasQuizGuiado(v as SalaQuizGuiado[]) },
        { chave: 'sst_resultados_avaliacao_sst', aplicar: v => setResultadosAvaliacaoSST(v as ResultadoAvaliacaoSST[]) },
      ];
      for (const { chave, aplicar } of alvo) {
        try {
          const idbValor = await idbGet<string>(chave);
          if (idbValor == null) continue;
          // Re-checa a flag após cada leitura: se a nuvem entregou enquanto a
          // leitura do IndexedDB estava em andamento, aborta a promoção.
          if (supabaseHidratouRef.current) return;
          const lsAtual = localStorage.getItem(chave);
          if (lsAtual === idbValor) continue;
          const parsed = JSON.parse(idbValor);
          localStorage.setItem(chave, idbValor);
          aplicar(parsed);
        } catch {
          // Diferença de conteúdo irrelevante; ignora.
        }
      }
    };
    hidratar();
  }, []);

  // Carrega resultados de avaliações persistidos no Supabase / Servidor local ao iniciar
  useEffect(() => {
    supabaseService.fetchResultadosAvaliacaoSST().then(dados => {
      if (Array.isArray(dados) && dados.length > 0) {
        setResultadosAvaliacaoSST(prev => {
          const map = new Map<string, ResultadoAvaliacaoSST>();
          prev.forEach(r => map.set(r.id, r));
          dados.forEach(r => map.set(r.id, r));
          return Array.from(map.values());
        });
      }
    }).catch(() => {});
  }, []);

  // Função para criar sala
  const criarSalaQuizGuiado = (dados: {
    treinamento_titulo?: string;
    nome?: string;
    modalidade: ModalidadeQuizGuiado;
    estilo?: EstiloQuizGuiado;
    nota_minima?: number;
    nota_minima_aprovacao?: number;
    tempo_por_pergunta_seg?: number;
    tempo_por_pergunta?: number;
    pergunta_ids?: string[];
    perguntas?: Pergunta[];
    mostrar_ranking?: boolean;
    permitir_visitantes?: boolean;
    mostrar_modo_tv?: boolean;
  }): SalaQuizGuiado => {
    // SECURITY — restrição de criação de Quiz Guiado.
    // Somente Instrutor SST, Admin ou Super Admin podem criar salas.
    // Esta validação fica no CONTEXTO (não apenas no botão da UI) para
    // impedir criação via console/devtools ou chamadas alternativas.
    // SECURITY — restrição de criação de Quiz Guiado (REGRA DE NEGÓCIO).
    // Somente usuários com a marcação "Instrutor" (is_instrutor === true)
    // podem criar/conduzir salas de Quiz Guiado — INDEPENDENTE do perfil.
    // Ser Admin ou Super Admin NÃO concede automaticamente essa permissão.
    const podeCriar = currentUser?.is_instrutor === true;
    if (!podeCriar) {
      throw new Error('Acesso negado: somente usuários marcados como Instrutor podem criar salas de Quiz Guiado.');
    }

    let pin = Math.floor(100000 + Math.random() * 900000).toString();
    while (salasQuizGuiado.some(s => s.pin === pin && s.status !== 'concluido')) {
      pin = Math.floor(100000 + Math.random() * 900000).toString();
    }

    let perguntasSelecionadas: Pergunta[] = [];
    if (dados.perguntas && Array.isArray(dados.perguntas) && dados.perguntas.length > 0) {
      perguntasSelecionadas = dados.perguntas;
    } else if (dados.pergunta_ids && Array.isArray(dados.pergunta_ids) && dados.pergunta_ids.length > 0) {
      const ids = dados.pergunta_ids;
      perguntasSelecionadas = perguntas.filter(p => ids.includes(p.id));
    }

    if (perguntasSelecionadas.length === 0) {
      perguntasSelecionadas = perguntas.slice(0, 5);
    }

    const tituloFinal = dados.nome || dados.treinamento_titulo || 'Treinamento SST';
    const tempoFinal = dados.tempo_por_pergunta_seg ?? dados.tempo_por_pergunta ?? 30;
    const notaMinimaFinal = dados.nota_minima ?? dados.nota_minima_aprovacao ?? 70;

    const novaSala: SalaQuizGuiado = {
      id: `sala-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      pin,
      treinamento_titulo: tituloFinal,
      nome: tituloFinal,
      instrutor_id: currentUser?.id || 'usr-instrutor',
      instrutor_nome: currentUser?.nome || 'Instrutor SST',
      empresa_id: currentUser?.empresa_id || empresa.id,
      data_criacao: new Date().toISOString(),
      status: 'aguardando',
      estado_apresentacao: 'AGUARDANDO',
      sessao_id: `sess-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      modalidade: dados.modalidade || 'interativo',
      estilo: dados.estilo || 'educacional',
      nota_minima: notaMinimaFinal,
      nota_minima_aprovacao: notaMinimaFinal,
      tempo_por_pergunta_seg: tempoFinal,
      tempo_por_pergunta: tempoFinal,
      perguntas: perguntasSelecionadas,
      pergunta_atual_index: 0,
      mostrar_ranking: dados.mostrar_ranking !== false,
      permitir_visitantes: dados.permitir_visitantes !== false,
      mostrar_modo_tv: dados.mostrar_modo_tv ?? false,
      participantes: [],
      revelar_resposta_atual: false,
      posicoes_anteriores: {},
      historico_sessoes: [],
    };

    setSalasQuizGuiado(prev => [novaSala, ...prev]);
    if (!isOfflineMode && navigator.onLine) {
      supabaseService.upsertSalaQuizGuiado(novaSala);
    }
    return novaSala;
  };

  const editarSalaQuizGuiado = (salaId: string, dados: Partial<SalaQuizGuiado>) => {
    // SECURITY — só quem pode criar pode editar (instrutor/admin/super_admin).
    const podeGerenciar =
      currentUser?.is_instrutor === true ||
      currentUser?.perfil === 'admin' ||
      currentUser?.perfil === 'super_admin';
    if (!podeGerenciar) {
      throw new Error('Acesso negado: somente Instrutores SST, Administradores ou Super Administradores podem editar salas de Quiz Guiado.');
    }
    setSalasQuizGuiado(prev => prev.map(s => {
      if (s.id !== salaId) return s;
      const updated: SalaQuizGuiado = { ...s, ...dados };
      return updated;
    }));
    if (!isOfflineMode && navigator.onLine) {
      const updated = salasQuizGuiado.find(s => s.id === salaId);
      if (updated) supabaseService.upsertSalaQuizGuiado({ ...updated, ...dados });
    }
  };

  const excluirSalaQuizGuiado = async (salaId: string) => {
    // SECURITY — só quem pode criar pode excluir (instrutor/admin/super_admin).
    const podeGerenciar =
      currentUser?.is_instrutor === true ||
      currentUser?.perfil === 'admin' ||
      currentUser?.perfil === 'super_admin';
    if (!podeGerenciar) {
      throw new Error('Acesso negado: somente Instrutores SST, Administradores ou Super Administradores podem excluir salas de Quiz Guiado.');
    }

    // 1. Identifica a sala que está sendo excluída para coletar seus metadados
    const salaExcluida = salasQuizGuiado.find(s => s.id === salaId);

    // 2. PRESERVAÇÃO INTEGRAL DAS PROVAS E LAUDOS DE AVALIAÇÃO:
    // Assegura que todas as provas vinculadas a essa sala no estado de avaliações SST
    // (resultadosAvaliacaoSST) fiquem com seus metadados 100% autossuficientes
    // (sala_nome, sala_pin, treinamento_titulo, empresa_id, instrutor_id, instrutor_nome).
    // As provas NUNCA são excluídas!
    if (salaExcluida) {
      setResultadosAvaliacaoSST(prev => {
        let mudou = false;
        const atualizados = prev.map(r => {
          if (r.sala_id === salaId) {
            mudou = true;
            return {
              ...r,
              sala_nome: r.sala_nome || salaExcluida.nome || salaExcluida.treinamento_titulo || 'Quiz Guiado SST',
              sala_pin: r.sala_pin || salaExcluida.pin || '',
              treinamento_titulo: r.treinamento_titulo || salaExcluida.treinamento_titulo || salaExcluida.nome || 'Treinamento SST',
              empresa_id: r.empresa_id || salaExcluida.empresa_id,
              instrutor_id: r.instrutor_id || salaExcluida.instrutor_id,
              instrutor_nome: r.instrutor_nome || salaExcluida.instrutor_nome,
            };
          }
          return r;
        });
        if (mudou) {
          safeSetItem('sst_resultados_avaliacao_sst', JSON.stringify(atualizados));
          idbSet('sst_resultados_avaliacao_sst', JSON.stringify(atualizados));
        }
        return atualizados;
      });
    }

    // 3. Remove estritamente a sala de salasQuizGuiado
    setSalasQuizGuiado(prev => prev.filter(s => s.id !== salaId));
    if (!isOfflineMode && navigator.onLine) {
      await supabaseService.deleteSalaQuizGuiado(salaId);
    }
  };

  // Entrar na sala
  const entrarNaSalaQuizGuiado = async (
    pin: string, 
    dadosParticipante: { nome: string; matricula?: string; cpf?: string; cpf_ou_empresa?: string; usuario_id?: string; is_visitante?: boolean }
  ): Promise<{ success: boolean; message: string; sala?: SalaQuizGuiado; participanteId?: string }> => {
    const cleanPin = (pin || '').trim().toUpperCase();
    
    // 1. Tenta buscar no estado local
    let sala = salasQuizGuiado.find(s => (typeof s.pin === 'string' ? s.pin.trim().toUpperCase() : '') === cleanPin && s.status !== 'encerrado' && s.status !== 'concluido');

    // 2. Se não encontrou no estado local (ex: mobile acabou de abrir via QR Code), busca no servidor Express local e no Supabase DB!
    if (!sala) {
      try {
        const fetched = await supabaseService.fetchSalaQuizGuiadoByPin(cleanPin);
        if (fetched && fetched.id) {
          sala = fetched as SalaQuizGuiado;
          if (!Array.isArray(sala.participantes)) sala.participantes = [];
          if (!Array.isArray(sala.perguntas)) sala.perguntas = [];

          // Adiciona a sala encontrada no estado local imediatamente
          setSalasQuizGuiado(prev => {
            const exists = prev.some(s => s.id === sala!.id);
            if (exists) {
              return prev.map(s => s.id === sala!.id ? sala! : s);
            }
            return [sala!, ...prev];
          });
        }
      } catch (err) {
        console.warn('Aviso: Erro ao buscar sala por PIN:', err);
      }
    }

    if (!sala) {
      return { success: false, message: 'Sala não encontrada com este PIN ou já encerrada.' };
    }

    // CORREÇÃO (bug: participante travado na identificação): garante arrays
    // mesmo quando a sala vem do ESTADO LOCAL (antes a garantia só era feita no
    // ramo de fetch). Se `participantes`/`perguntas` forem undefined, o
    // `.find()` abaixo lançava TypeError e a entrada falhava silenciosamente.
    if (!Array.isArray(sala.participantes)) sala.participantes = [];
    if (!Array.isArray(sala.perguntas)) sala.perguntas = [];

    if (!sala.permitir_visitantes && !dadosParticipante.usuario_id) {
      return { success: false, message: 'Esta sala não permite acesso a visitantes não cadastrados.' };
    }

    // Verificar se participante já está na sala
    const existente = sala.participantes.find(
      p => (dadosParticipante.usuario_id && p.usuario_id === dadosParticipante.usuario_id) ||
           (dadosParticipante.nome && typeof p.nome === 'string' && (p.nome || '').trim().toLowerCase() === (dadosParticipante.nome || '').trim().toLowerCase())
    );

    if (existente) {
      if (dadosParticipante.matricula || dadosParticipante.cpf) {
        const participantesAtualizados = sala.participantes.map(p => 
          p.id === existente.id ? { 
            ...p, 
            matricula: dadosParticipante.matricula?.trim() || p.matricula,
            cpf: dadosParticipante.cpf?.trim() || p.cpf,
            cpf_ou_empresa: dadosParticipante.cpf_ou_empresa?.trim() || p.cpf_ou_empresa
          } : p
        );
        const salaAtualizada = { ...sala, participantes: participantesAtualizados };
        setSalasQuizGuiado(prev => prev.map(s => s.id === sala!.id ? salaAtualizada : s));
        // CORREÇÃO (Problema 1): atualização do participante via RPC seguro
        // (Supabase) + somenteExpress (polling) — nunca sobrescrever gabarito.
        if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
          supabaseService.atualizarParticipanteSala({
            sala_id: sala!.id,
            participante_id: existente.id,
            respostas: {
              __nome: existente.nome,
              __matricula: dadosParticipante.matricula?.trim() || existente.matricula || null,
              __cpf: dadosParticipante.cpf?.trim() || existente.cpf || null,
              __cpf_ou_empresa: dadosParticipante.cpf_ou_empresa?.trim() || existente.cpf_ou_empresa || null,
            },
          }).catch(err => console.warn('Falha ao atualizar participante via RPC:', err));
        }
        supabaseService.upsertSalaQuizGuiado({ ...salaAtualizada, __participantUpdate: true } as any, { somenteExpress: true });
        return {
          success: true,
          message: 'Reconectado à sala com sucesso.',
          sala: salaAtualizada,
          participanteId: existente.id,
        };
      }
      return {
        success: true,
        message: 'Reconectado à sala com sucesso.',
        sala,
        participanteId: existente.id,
      };
    }

    // Se o nome não foi informado ou é o placeholder inicial de visitante, autoriza a entrada no painel para que o usuário digite seu nome
    if (!dadosParticipante.nome || dadosParticipante.nome === 'Participante Visitante' || !(dadosParticipante.nome || '').trim()) {
      return {
        success: true,
        message: 'Sala localizada! Por favor, digite seu nome ou apelido para continuar.',
        sala,
      };
    }

    const novoParticipante: ParticipanteSalaQuiz = {
      id: `part-${Date.now()}-${Math.floor(Math.random()*1000)}`,
      usuario_id: dadosParticipante.usuario_id,
      nome: (dadosParticipante.nome || '').trim(),
      matricula: dadosParticipante.matricula?.trim(),
      cpf: dadosParticipante.cpf?.trim(),
      cpf_ou_empresa: dadosParticipante.cpf_ou_empresa?.trim(),
      is_visitante: !dadosParticipante.usuario_id,
      respostas: {},
      pontuacao_acumulada: 0,
    };

    const salaAtualizada = {
      ...sala,
      // CORREÇÃO (bug: participante não entra): garante que participantes é
      // um array — se vier undefined (ex.: payload do Realtime/merge), o
      // spread abaixo lançaria TypeError e a entrada falharia silenciosamente.
      participantes: [...(Array.isArray(sala.participantes) ? sala.participantes : []), novoParticipante],
    };

    setSalasQuizGuiado(prev => prev.map(s => s.id === sala!.id ? salaAtualizada : s));

    // CORREÇÃO (Problema 1): ao adicionar o participante, NÃO sobrescrever o
    // gabarito no Supabase. Atualiza apenas participantes via RPC seguro;
    // envia a sala local completa ao Express (somenteExpress) para o polling.
    if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
      supabaseService.atualizarParticipanteSala({
        sala_id: sala!.id,
        participante_id: novoParticipante.id,
        respostas: {
          ...novoParticipante.respostas,
          // Metadados do participante (usados pelo RPC no upsert da entrada).
          __nome: novoParticipante.nome,
          __matricula: novoParticipante.matricula || null,
          __cpf: novoParticipante.cpf || null,
          __cpf_ou_empresa: novoParticipante.cpf_ou_empresa || null,
        },
        pontuacao_acumulada: 0,
      }).catch(err => console.warn('Falha ao registrar participante via RPC:', err));
    }
    supabaseService.upsertSalaQuizGuiado({ ...salaAtualizada, __participantUpdate: true } as any, { somenteExpress: true });

    return {
      success: true,
      message: 'Inscrição na sala efetuada com sucesso!',
      sala: salaAtualizada,
      participanteId: novoParticipante.id,
    };
  };

  const iniciarQuizGuiado = (salaId: string) => {
    // CORREÇÃO (auditoria reutilização da sala — 2ª sessão): o upsert era
    // disparado DENTRO do updater (efeito colateral em função pura), podendo
    // gerar duplo upsert com `question_started_at`/`sessao_id` divergentes e
    // dessincronizar o participante. Agora o estado é computado UMA vez, fora
    // do updater, e o upsert é feito UMA única vez.
    const sala = salasQuizGuiado.find(s => s.id === salaId);
    if (!sala) return;

    // SERVER-FIRST: registra data_inicio (timestamp server-side).
    if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
      supabaseService.registrarMarcoSalaQuizGuiadoRpc(salaId, 'inicio')
        .catch(err => console.warn('Falha ao registrar início da sala no servidor:', err));
    }

    const now = Date.now();
    const tempoSeg = sala.tempo_por_pergunta_seg !== undefined
      ? Number(sala.tempo_por_pergunta_seg)
      : (sala.tempo_por_pergunta !== undefined ? Number(sala.tempo_por_pergunta) : 30);
    const questionEndsAt = tempoSeg > 0 ? (now + tempoSeg * 1000) : 0;
    // CORREÇÃO (loop PERGUNTA↔GABARITO): nova sessão — limpa a guarda para que
    // a pergunta 0 comece legítimamente NÃO revelada.
    limparGuardaRevelacao(salaId);
    const updated: SalaQuizGuiado = {
      ...sala,
      status: 'em_andamento',
      estado_apresentacao: 'QUESTION_ACTIVE',
      pergunta_atual_index: 0,
      revelar_resposta_atual: false,
      mostrar_ranking: false,
      question_started_at: now,
      question_ends_at: questionEndsAt,
      sessao_id: sala.sessao_id || `sess-${now}`,
    };

    setSalasQuizGuiado(prev => prev.map(s => (s.id === salaId ? updated : s)));
    // CORREÇÃO (loop crítico_quiz_guiado): usa RPC atômico para colunas de
    // apresentação (não sobrescreve participantes no Supabase).
    supabaseService.atualizarEstadoApresentacaoSala(salaId, {
      status: 'em_andamento',
      estado_apresentacao: 'QUESTION_ACTIVE',
      pergunta_atual_index: 0,
      revelar_resposta_atual: false,
      mostrar_ranking: false,
      question_started_at: now,
      question_ends_at: questionEndsAt,
      sessao_id: updated.sessao_id,
    });
    // Express: envia a sala completa (Express merge preserva participantes).
    supabaseService.upsertSalaQuizGuiado(updated, { somenteExpress: true });
  };

  const pausarQuizGuiado = (salaId: string) => {
    const sala = salasQuizGuiado.find(s => s.id === salaId);
    if (!sala) return;
    const updated: SalaQuizGuiado = { ...sala, status: 'pausado' };
    setSalasQuizGuiado(prev => prev.map(s => (s.id === salaId ? updated : s)));
    // CORREÇÃO (loop crítico_quiz_guiado): RPC atômico para colunas de apresentação.
    supabaseService.atualizarEstadoApresentacaoSala(salaId, { status: 'pausado' });
    supabaseService.upsertSalaQuizGuiado(updated, { somenteExpress: true });
  };

  const retomarQuizGuiado = (salaId: string) => {
    const sala = salasQuizGuiado.find(s => s.id === salaId);
    if (!sala) return;
    const updated: SalaQuizGuiado = { ...sala, status: 'em_andamento' };
    setSalasQuizGuiado(prev => prev.map(s => (s.id === salaId ? updated : s)));
    // CORREÇÃO (loop crítico_quiz_guiado): RPC atômico para colunas de apresentação.
    supabaseService.atualizarEstadoApresentacaoSala(salaId, { status: 'em_andamento' });
    supabaseService.upsertSalaQuizGuiado(updated, { somenteExpress: true });
  };

  const revelarRespostaAtualQuizGuiado = (salaId: string) => {
    const sala = salasQuizGuiado.find(s => s.id === salaId);
    if (!sala) return;
    const updated: SalaQuizGuiado = {
      ...sala,
      estado_apresentacao: 'ANSWER_REVEALED',
      revelar_resposta_atual: true,
      mostrar_ranking: false,
    };
    setSalasQuizGuiado(prev => prev.map(s => (s.id === salaId ? updated : s)));
    // CORREÇÃO (loop crítico_quiz_guiado — raiz no Supabase): usa RPC
    // atômico que atualiza SOMENTE colunas de apresentação, NUNCA toca
    // em `participantes`. O upsert da sala inteira sobrescrevia respostas
    // de participantes que o instrutor ainda não tinha no estado local.
    supabaseService.atualizarEstadoApresentacaoSala(salaId, {
      estado_apresentacao: 'ANSWER_REVEALED',
      revelar_resposta_atual: true,
      mostrar_ranking: false,
    });
    // Express: envia a sala completa (Express merge preserva participantes).
    supabaseService.upsertSalaQuizGuiado(updated, { somenteExpress: true });
  };

  const exibirRanqueQuizGuiado = (salaId: string) => {
    const sala = salasQuizGuiado.find(s => s.id === salaId);
    if (!sala) return;

    const ordenados = [...(sala.participantes || [])].sort((a, b) => (b.pontuacao_acumulada || 0) - (a.pontuacao_acumulada || 0));
    const posicoesAtuais: Record<string, number> = {};
    const posAnterioresMap = sala.posicoes_anteriores || {};

    const participantesAtualizados = (sala.participantes || []).map(p => {
      const indexNoRank = ordenados.findIndex(item => item.id === p.id);
      const posNova = indexNoRank >= 0 ? indexNoRank + 1 : 99;
      posicoesAtuais[p.id] = posNova;
      const posAnt = posAnterioresMap[p.id] || posNova;
      return {
        ...p,
        posicao_anterior: posAnt,
        posicao_atual: posNova,
      };
    });

    const updated: SalaQuizGuiado = {
      ...sala,
      participantes: participantesAtualizados,
      posicoes_anteriores: posicoesAtuais,
      estado_apresentacao: 'RANKING_SHOWN',
      mostrar_ranking: true,
    };
    setSalasQuizGuiado(prev => prev.map(s => (s.id === salaId ? updated : s)));
    // CORREÇÃO (loop crítico_quiz_guiado): ranking NÃO faz upsert no Supabase
    // (que sobrescreveria participantes com dados defasados do instrutor).
    // O estado de ranking é sincronizado via Realtime (merge de participantes)
    // e via Express polling.
    supabaseService.upsertSalaQuizGuiado(updated, { somenteExpress: true });
  };

  const reiniciarSalaQuizGuiado = (salaId: string) => {
    // CORREÇÃO (auditoria Problema 2 — sala não reinicia/reutiliza e PIN
    // divergente): o novo PIN/sessao era gerado DENTRO do updater do estado
    // (efeito colateral em função pura), e o upsert também era disparado lá
    // dentro — em StrictMode (dev) o updater roda 2x e gera PINs diferentes,
    // e cliques rápidos geram reinícios concorrentes. Resultado: Express e
    // Supabase terminavam com PIN/sessao_id DIFERENTES para a mesma sala, e o
    // participante que escaneava o QR ficava preso na identificação (o PIN do
    // QR não batia com o do servidor). Agora o PIN/sessao é gerado UMA vez,
    // fora do updater, e o upsert é feito UMA única vez.
    const sala = salasQuizGuiado.find(s => s.id === salaId);
    if (!sala) return;

    const historicoAtual = sala.historico_sessoes || [];
    const ordenados = [...(sala.participantes || [])].sort((a, b) => (b.pontuacao_acumulada || 0) - (a.pontuacao_acumulada || 0));

    if (sala.participantes && sala.participantes.length > 0) {
      const novaSessaoHist = {
        id: `hist-${Date.now()}`,
        sessao_id: sala.sessao_id || `sess-${Date.now()}`,
        data_inicio: sala.data_criacao || new Date().toISOString(),
        data_fim: new Date().toISOString(),
        total_participantes: sala.participantes.length,
        vencedor_nome: ordenados[0]?.nome || 'N/A',
        vencedor_pontos: ordenados[0]?.pontuacao_acumulada || 0,
        participantes_resumo: ordenados.map((p, idx) => ({
          nome: p.nome,
          pontuacao: p.pontuacao_acumulada || 0,
          posicao: idx + 1,
        })),
      };
      historicoAtual.push(novaSessaoHist);

      // Preserva os resultados individuais das provas antes de limpar participantes
      // CORREÇÃO (auditoria Problema 2): passa a sessao_id ATUAL — sem ela, a
      // busca por `sala_id + participante_id` podia retornar a avaliação de uma
      // SESSÃO ANTERIOR (ou null → objeto fallback com acertos:0).
      const resultadosSessaoAnterior: ResultadoAvaliacaoSST[] = sala.participantes.map(p => {
        const resDynamic = obterResultadoAvaliacaoParticipante(sala.id, p.id, sala.sessao_id);
        return resDynamic || {
          id: `res-${sala.id}-${p.id}`,
          sala_id: sala.id,
          participante_nome: p.nome,
          participante_id: p.usuario_id || p.id,
          cpf_ou_empresa: p.cpf_ou_empresa,
          is_visitante: p.is_visitante,
          treinamento_titulo: sala.treinamento_titulo || sala.nome || 'Quiz Guiado SST',
          // REGRA DE NEGÓCIO (autoria da prova): quem REINICIA/aplica é o
          // instrutor da prova — não o criador original da sala.
          instrutor_nome: currentUser?.nome || sala.instrutor_nome,
          data: new Date().toLocaleDateString('pt-BR'),
          total_perguntas: sala.perguntas?.length || 0,
          acertos: 0,
          erros: sala.perguntas?.length || 0,
          nota_final: 0,
          // Preserva a escala original (70 = 0-100). O cálculo converte para 0-10.
          nota_minima: (sala as any).nota_minima_aprovacao ?? (sala as any).nota_minima ?? 70,
          situacao: 'NAO_APROVADO',
          desempenho_por_tema: [],
          respostas_detalhadas: [],
          empresa_id: sala.empresa_id,
          instrutor_id: currentUser?.id || sala.instrutor_id,
          sala_pin: sala.pin,
          sala_nome: sala.nome || sala.treinamento_titulo || 'Quiz Guiado SST',
        };
      });

      const idsSalvos = new Set(resultadosSessaoAnterior.map(r => r.id));
      setResultadosAvaliacaoSST(prevRes => [...resultadosSessaoAnterior, ...prevRes.filter(r => !idsSalvos.has(r.id))]);
    }

    const now = Date.now();
    // PIN único: evita colidir com outra sala ativa (mesma regra do criarSala).
    let novoPin = Math.floor(100000 + Math.random() * 900000).toString();
    while (salasQuizGuiado.some(s => s.pin === novoPin && s.id !== salaId && s.status !== 'concluido' && s.status !== 'encerrado')) {
      novoPin = Math.floor(100000 + Math.random() * 900000).toString();
    }

    const updated: SalaQuizGuiado = {
      ...sala,
      pin: novoPin,
      sessao_id: `sess-${now}`,
      status: 'aguardando',
      estado_apresentacao: 'AGUARDANDO',
      pergunta_atual_index: 0,
      revelar_resposta_atual: false,
      mostrar_ranking: false,
      participantes: [], // Reinicia participantes para nova sessão sem apagar o quiz!
      posicoes_anteriores: {},
      historico_sessoes: historicoAtual,
    };

    // CORREÇÃO (loop PERGUNTA↔GABARITO): nova sessão — limpa a guarda para que
    // a pergunta 0 comece legítimamente NÃO revelada.
    limparGuardaRevelacao(salaId);
    setSalasQuizGuiado(prev => prev.map(s => (s.id === salaId ? updated : s)));
    supabaseService.upsertSalaQuizGuiado(updated);

    // CORREÇÃO (auditoria Problema 2): limpa as chaves locais de participante
    // DESTA sala no reinício (quiz_part_id_* / quiz_participante_nome_*).
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(`quiz_part_id_${sala.id}_`)) localStorage.removeItem(k);
        if (k.startsWith(`quiz_participante_nome_`)) localStorage.removeItem(k);
      });
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith(`quiz_part_id_${sala.id}_`)) sessionStorage.removeItem(k);
      });
    } catch (err) {
      console.warn('Falha ao limpar chaves locais de participante no reinício:', err);
    }
  };

  const encerrarSalaQuizGuiado = async (salaId: string) => {
    // SERVER-FIRST: registra data_encerramento (timestamp server-side).
    if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
      supabaseService.registrarMarcoSalaQuizGuiadoRpc(salaId, 'encerramento')
        .catch(err => console.warn('Falha ao registrar encerramento da sala no servidor:', err));
    }

    const salaTarget = salasQuizGuiado.find(s => s.id === salaId);
    if (!salaTarget) return;

    // REGRA DE NEGÓCIO (autoria da prova): o INSTRUTOR DA PROVA é quem
    // APLICOU (encerrou) a sessão — não quem CRIOU a sala. Se um admin
    // aplica uma sala criada por outro colaborador/admin, os laudos são
    // registrados PARA QUEM APLICOU (e ficam visíveis para ele), respeitando
    // a hierarquia: super_admin > admin > instrutor. A sala continua
    // pertencendo ao criador; apenas a AUTORIA DAS PROVAS segue o aplicador.
    const instrutorAplicadorId = currentUser?.id || salaTarget.instrutor_id;
    const instrutorAplicadorNome = currentUser?.nome || salaTarget.instrutor_nome;

    const isModoAvaliacao = salaTarget.modalidade === 'avaliacao';
    const novosResultados: ResultadoAvaliacaoSST[] = [];
    const participantes = salaTarget.participantes || [];
    const perguntas = salaTarget.perguntas || [];

    const participantesProcessados = participantes.map(p => {
      const total = perguntas.length;
      let acertos = 0;

      // CORREÇÃO (bug: TODAS as respostas erradas mesmo acertando): o
      // encerramento é feito no dispositivo do INSTRUTOR, que tem a sala
      // COMPLETA (gabarito de todas as perguntas). A flag `correta` gravada
      // em tempo de jogo pode estar errada (validador remoto consultou um
      // gabarito defasado no banco). Aqui o GABARITO LOCAL é autoridade:
      // recalculamos cada resposta e REESCREVEMOS as flags incorretas para
      // que ranking, telas e merges fiquem consistentes com o laudo.
      const respostasCorrigidas: Record<string, RespostaParticipanteQuiz> = { ...(p.respostas || {}) };

      const respostasDetalhadas = perguntas.map(perg => {
        const respMap = p.respostas || {};
        const resp = respMap[perg.id];
        const respIndex = resp ? resp.resposta_index : -1;
        const gabaritoNum = typeof perg.resposta_correta === 'number' ? perg.resposta_correta : null;
        const correta = gabaritoNum !== null
          ? respIndex === gabaritoNum
          : (resp && typeof resp.correta === 'boolean' ? resp.correta : false);
        if (correta) acertos++;

        // Reescreve a flag corrigida na cópia das respostas do participante.
        if (resp && resp.correta !== correta) {
          respostasCorrigidas[perg.id] = { ...resp, correta };
        }

        const alts = normalizeAlternativas(perg.alternativas || (perg as any).opcoes);
        const respFornecidaVal = respIndex >= 0 ? alts[respIndex] : undefined;
        const respCorretaVal = alts[perg.resposta_correta];

        return {
          pergunta_id: perg.id,
          enunciado: perg.enunciado,
          norma_relacionada: perg.norma_relacionada,
          alternativas: alts,
          resposta_fornecida_index: respIndex,
          resposta_correta_index: perg.resposta_correta,
          resposta_fornecida: respIndex >= 0 ? (respFornecidaVal ? formatAlternativaText(respFornecidaVal) : 'Não respondida') : 'Sem Resposta',
          resposta_correta: respCorretaVal ? formatAlternativaText(respCorretaVal) : '',
          correta,
          explicacao: perg.explicacao,
        };
      });

      const notaFinal = total > 0 ? parseFloat(((acertos / total) * 10).toFixed(1)) : 0;
      const notaMinimaOriginal = salaTarget.nota_minima_aprovacao ?? salaTarget.nota_minima ?? 70;
      const notaMinimaBase10 = notaMinimaOriginal > 10 ? notaMinimaOriginal / 10 : notaMinimaOriginal;
      const situacao: 'APROVADO' | 'NAO_APROVADO' = notaFinal >= notaMinimaBase10 ? 'APROVADO' : 'NAO_APROVADO';

      const temasMap = new Map<string, { total: number; acertos: number }>();
      respostasDetalhadas.forEach(r => {
        const t = r.norma_relacionada || 'Conhecimentos Gerais SST';
        const curr = temasMap.get(t) || { total: 0, acertos: 0 };
        curr.total += 1;
        if (r.correta) curr.acertos += 1;
        temasMap.set(t, curr);
      });

      const desempenho_por_tema = Array.from(temasMap.entries()).map(([tema, val]) => {
        const pct = val.total > 0 ? Math.round((val.acertos / val.total) * 100) : 0;
        return {
          tema,
          total: val.total,
          acertos: val.acertos,
          percentual: pct,
          porcentagem: pct,
        };
      });

      const pctAcertosGeral = total > 0 ? Math.round((acertos / total) * 100) : 0;
      const sessaoId = salaTarget.sessao_id || `sess-${Date.now()}`;
      const resultado: ResultadoAvaliacaoSST = {
        id: `res-${salaTarget.id}-${sessaoId}-${p.id}`,
        sala_id: salaTarget.id,
        sessao_id: sessaoId,
        participante_nome: p.nome,
        participante_id: p.usuario_id || p.id,
        matricula: p.matricula,
        cpf: p.cpf,
        cpf_ou_empresa: p.cpf_ou_empresa,
        is_visitante: p.is_visitante,
        treinamento_titulo: salaTarget.treinamento_titulo || salaTarget.nome || 'Quiz Guiado SST',
        // REGRA DE NEGÓCIO (autoria da prova): instrutor = quem APLICOU.
        instrutor_nome: instrutorAplicadorNome,
        data: new Date().toLocaleDateString('pt-BR'),
        total_perguntas: total,
        acertos,
        erros: total - acertos,
        nota_final: notaFinal,
        nota_minima: notaMinimaBase10,
        situacao,
        desempenho_por_tema,
        respostas_detalhadas: respostasDetalhadas,
        cargo: p.cpf_ou_empresa || 'Colaborador SST',
        setor_nome: 'Treinamento SST',
        email: p.is_visitante ? 'Visitante' : 'Cadastrado',
        empresa_id: salaTarget.empresa_id,
        // REGRA DE NEGÓCIO (autoria da prova): instrutor = quem APLICOU.
        instrutor_id: instrutorAplicadorId,
        sala_pin: salaTarget.pin,
        sala_nome: salaTarget.nome || salaTarget.treinamento_titulo || 'Quiz Guiado SST',
        data_finalizacao: new Date().toISOString(),
        porcentagem_acertos: pctAcertosGeral,
        questoes_corretas: acertos,
        total_questoes: total,
        nota_minima_aprovacao: Math.round(notaMinimaBase10 * 10),
        codigo_documento: `DOC-SST-${(salaTarget.id || 'SALASST').slice(-4).toUpperCase()}-${sessaoId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}-${(p.id || 'PART').slice(-4).toUpperCase()}`,
        sessao_codigo: `SST-SESSAO-${sessaoId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`,
      };

      if (isModoAvaliacao) {
        // Não salva prova em branco (ninguém respondeu nada) — evita laudo zerado na lista.
        const totalRespondidas = Object.keys(p.respostas || {}).length;
        if (totalRespondidas > 0) {
          novosResultados.push(resultado);
        }
      }

      return {
        ...p,
        // CORREÇÃO (tudo errado mesmo acertando): propaga as flags `correta`
        // RECALCULADAS pelo gabarito do instrutor.
        respostas: respostasCorrigidas,
        nota_final: notaFinal,
        situacao,
        concluido: true,
      };
    });

    const salaEncerrada: SalaQuizGuiado = {
      ...salaTarget,
      status: 'concluido',
      estado_apresentacao: 'CONCLUIDO',
      participantes: participantesProcessados,
    };

    // Atualiza estado local no React de forma síncrona
    setSalasQuizGuiado(prev => prev.map(s => s.id === salaId ? salaEncerrada : s));

    if (isModoAvaliacao && novosResultados.length > 0) {
      const novosIds = new Set(novosResultados.map(r => r.id));
      setResultadosAvaliacaoSST(prev => [...novosResultados, ...prev.filter(r => !novosIds.has(r.id))]);
    }

    // Persistência assíncrona garantida no Supabase (primeiro a sala, depois os laudos associados)
    await supabaseService.upsertSalaQuizGuiado(salaEncerrada);
    if (isModoAvaliacao && novosResultados.length > 0) {
      for (const resItem of novosResultados) {
        await supabaseService.upsertResultadoAvaliacaoSST(resItem);
      }
    }

    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(`quiz_part_id_${salaTarget.id}_`)) localStorage.removeItem(k);
        if (k.startsWith(`quiz_participante_nome_`) && k.includes(salaTarget.sessao_id || 'sess-')) {
          localStorage.removeItem(k);
        }
      });
      Object.keys(sessionStorage).forEach(k => {
        if (k.startsWith(`quiz_part_id_${salaTarget.id}_`)) sessionStorage.removeItem(k);
      });
    } catch (err) {
      console.warn('Falha ao limpar chaves locais de participante da sessão:', err);
    }
  };

  const avancarPerguntaQuizGuiado = (salaId: string) => {
    const sala = salasQuizGuiado.find(s => s.id === salaId);
    if (!sala) return;

    if (sala.pergunta_atual_index < sala.perguntas.length - 1) {
      // CORREÇÃO (auditoria reutilização da sala): computa o novo estado UMA
      // vez, fora do updater, e faz o upsert UMA única vez (antes o efeito
      // colateral rodava dentro do updater, podendo dessincronizar a 2ª sessão).
      const now = Date.now();
      const tempoSeg = sala.tempo_por_pergunta_seg !== undefined
        ? Number(sala.tempo_por_pergunta_seg)
        : (sala.tempo_por_pergunta !== undefined ? Number(sala.tempo_por_pergunta) : 30);
      const questionEndsAt = tempoSeg > 0 ? (now + tempoSeg * 1000) : 0;
      const updated: SalaQuizGuiado = {
        ...sala,
        pergunta_atual_index: sala.pergunta_atual_index + 1,
        revelar_resposta_atual: false,
        mostrar_ranking: false,
        estado_apresentacao: 'QUESTION_ACTIVE',
        question_started_at: now,
        question_ends_at: questionEndsAt,
      };
      setSalasQuizGuiado(prev => prev.map(s => (s.id === salaId ? updated : s)));
      // CORREÇÃO (loop crítico_quiz_guiado): usa RPC atômico para colunas de
      // apresentação (não sobrescreve participantes no Supabase).
      supabaseService.atualizarEstadoApresentacaoSala(salaId, {
        pergunta_atual_index: sala.pergunta_atual_index + 1,
        revelar_resposta_atual: false,
        mostrar_ranking: false,
        estado_apresentacao: 'QUESTION_ACTIVE',
        question_started_at: now,
        question_ends_at: questionEndsAt,
      });
      // Express: envia a sala completa (Express merge preserva participantes).
      supabaseService.upsertSalaQuizGuiado(updated, { somenteExpress: true });
    } else {
      encerrarSalaQuizGuiado(salaId);
    }
  };

  const submeterRespostaQuizGuiado = async (
    salaId: string,
    participanteId: string,
    perguntaId: string,
    respostaIndex: number,
    tempoMs: number
  ) => {
    // SECURITY: quando o Supabase está ativo, a resposta é validada no
    // SERVIDOR (edge function pontuar-quiz-guiado): confere o gabarito no
    // banco, a janela de tempo (question_ends_at) e evita duplicidade.
    // Se a função não estiver disponível, usa o cálculo local de fallback.
    let validacaoServer: { correta: boolean; pontosAdicionais: number; code?: string } | null = null;
    if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
      try {
        const serverResult = await supabaseService.pontuarQuizGuiado({
          sala_id: salaId,
          participante_id: participanteId,
          pergunta_id: perguntaId,
          resposta_index: respostaIndex,
          tempo_ms: tempoMs,
        });
        if (serverResult && typeof serverResult.correta === 'boolean') {
          validacaoServer = {
            correta: serverResult.correta,
            pontosAdicionais: Number(serverResult.pontosAdicionais ?? 0) || 0,
            code: serverResult.code,
          };
        }
      } catch (err) {
        console.warn('Falha na validação server-side do quiz guiado, usando cálculo local:', err);
      }
    }

    // SERVER-FIRST: grava a resposta na tabela IMUTÁVEL (append-only) do
    // servidor. Idempotente (a primeira escrita vence) e não destrutiva:
    // em caso de falha/offline o fluxo local segue normal.
    if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
      const participante = (salasQuizGuiado.find(s => s.id === salaId)?.participantes || [])
        .find(p => p.id === participanteId);

      // CORREÇÃO (Problema 1 — respostas corretas marcadas como erradas):
      // quando a edge function pontuar-quiz-guiado NÃO está disponível (ou
      // falha), o fallback local `respostaIndex === pergunta.resposta_correta`
      // é CORROMPIDO para o participante: ele recebe a sala SANITIZADA (sem
      // resposta_correta), então a comparação é sempre `undefined === índice`
      // → toda resposta vira errada. Usamos então o retorno do RPC
      // registrar_resposta_quiz_guiado (que valida contra o GABARITO do banco)
      // como fonte server-side alternativa da correção.
      if (!validacaoServer && participante) {
        const rpcResult = await supabaseService.registrarRespostaQuizGuiadoRpc({
          sala_id: salaId,
          participante_id: participanteId,
          participante_nome: participante?.nome ?? null,
          pergunta_id: perguntaId,
          resposta_index: respostaIndex,
          tempo_ms: tempoMs,
        });
        if (rpcResult && typeof rpcResult.correta === 'boolean') {
          validacaoServer = {
            correta: rpcResult.correta,
            pontosAdicionais: Number(rpcResult.pontosAdicionais ?? 0) || 0,
            code: rpcResult.code,
          };
        }
      } else if (!validacaoServer) {
        supabaseService.registrarRespostaQuizGuiadoRpc({
          sala_id: salaId,
          participante_id: participanteId,
          participante_nome: null,
          pergunta_id: perguntaId,
          resposta_index: respostaIndex,
          tempo_ms: tempoMs,
        }).catch(err => console.warn('Falha ao gravar resposta imutável do quiz guiado:', err));
      }

      // CORREÇÃO (auditoria Problema 1 — resposta correta marcada como errada):
      // terceira via server-side: valida no EXPRESS (que tem o gabarito da sala).
      // Cobre o participante VISITANTE (LAN) quando a edge (exige Bearer) e o
      // RPC (exige participante no Supabase) falham — o caso mais comum no fluxo
      // Kahoot. Sem isso, o fallback local comparava com resposta_correta
      // inexistente (sala sanitizada) e marcava tudo como errado.
      if (!validacaoServer) {
        const expressResult = await supabaseService.validarRespostaQuizGuiadoExpress({
          sala_id: salaId,
          participante_id: participanteId,
          pergunta_id: perguntaId,
          resposta_index: respostaIndex,
          tempo_ms: tempoMs,
        });
        if (expressResult) {
          validacaoServer = {
            correta: expressResult.correta,
            pontosAdicionais: expressResult.pontosAdicionais,
            code: 'EXPRESS',
          };
        }
      }
    }

    setSalasQuizGuiado(prev => prev.map(s => {
      if (s.id !== salaId) return s;

      const pergunta = s.perguntas.find(p => p.id === perguntaId);
      if (!pergunta) return s;

      // Usa o gabarito validado no servidor quando disponível.
      // CORREÇÃO (bug: "Você não pontuou nesta pergunta" mesmo acertando): o
      // fallback local `respostaIndex === pergunta.resposta_correta` com a sala
      // SANITIZADA (sem resposta_correta) marcava a resposta como ERRADA
      // (`undefined === índice`). Quando não há gabarito local (participante) E
      // a validação server não retornou, NÃO marcamos como errada — deixamos
      // `correta` indefinida para o servidor decidir (e o merge prioriza o
      // servidor quando ele valida).
      //
      // CORREÇÃO 2 (bug: TODAS as respostas erradas mesmo acertando — logs
      // 2026-08): os validadores remotos (edge/RPC) consultam o GABARITO DO
      // BANCO, que pode estar defasado/vazio — e um `false` errado deles
      // VENCE e se propaga para ranking, tela e laudo. Agora o gabarito LOCAL
      // é autoridade quando existe: instrutor tem a sala completa; e o
      // participante tem o gabarito das perguntas JÁ REVELADAS (sanitize
      // preserva a pergunta atual revelada). Só usa validador remoto quando
      // NÃO há gabarito local (participante, pergunta ainda não revelada).
      const gabaritoLocalIdx = typeof pergunta.resposta_correta === 'number'
        ? pergunta.resposta_correta
        : undefined;
      const correta = gabaritoLocalIdx !== undefined
        ? respostaIndex === gabaritoLocalIdx
        : (validacaoServer
            ? validacaoServer.correta
            : undefined);

      // Pontuação: no modo competitivo, quanto mais rápido mais pontos ganha.
      // Refactor incremental (Fase 9): extraída para módulo puro testável.
      // CORREÇÃO 2: pontos do servidor só valem quando a decisão veio dele
      // (sem gabarito local). Se o gabarito local decidiu, calcula aqui —
      // evita herdar 0 pontos de um validador remoto que mentiu.
      const pontosAdicionais = calcularPontosQuizGuiado({
        correta,
        estilo: s.estilo,
        tempoMs,
        tempoPorPerguntaSeg: s.tempo_por_pergunta_seg,
        pontosServer: gabaritoLocalIdx === undefined && validacaoServer
          ? validacaoServer.pontosAdicionais
          : undefined,
      });

      const participantes = s.participantes || [];
      const participantesAtualizados = participantes.map(p => {
        if (p.id !== participanteId) return p;

        const respostasMap = p.respostas || {};
        // Se já respondeu esta pergunta, não sobresscreve
        if (respostasMap[perguntaId]) return p;

        const novasRespostas = {
          ...respostasMap,
          [perguntaId]: {
            resposta_index: respostaIndex,
            tempo_ms: tempoMs,
            timestamp: new Date().toISOString(),
            correta,
          }
        };

        const novaPontuacao = (p.pontuacao_acumulada || 0) + pontosAdicionais;

        return {
          ...p,
          respostas: novasRespostas,
          pontuacao_acumulada: novaPontuacao,
        };
      });

      const salaComResposta: SalaQuizGuiado = {
        ...s,
        participantes: participantesAtualizados,
      };

      // CORREÇÃO (Problema 1 — respostas corretas marcadas como erradas):
      // o upsert da sala inteira no Supabase SOBRESCREVIA o gabarito das
      // perguntas (o participante envia a sala sanitizada sem resposta_correta),
      // fazendo a validação server-side sempre falhar. Agora:
      //   - no SUPABASE, atualizamos APENAS os participantes via RPC seguro
      //     (preserva o gabarito no banco);
      //   - no EXPRESS, enviamos a sala local completa para o polling.
      if (isSupabaseActive && isSupabaseConfigured() && !isOfflineMode) {
        const participanteAtual = participantesAtualizados.find(p => p.id === participanteId);
        if (participanteAtual) {
          supabaseService.atualizarParticipanteSala({
            sala_id: salaId,
            participante_id: participanteId,
            respostas: participanteAtual.respostas,
            pontuacao_acumulada: participanteAtual.pontuacao_acumulada,
          }).catch(err => console.warn('Falha ao atualizar participante via RPC:', err));
        }
      }
      // CORREÇÃO (loop crítico_quiz_guiado): envia APENAS os dados do
      // participante ao Express (não a sala inteira). O endpoint dedicado
      // atualiza somente o array `participantes` sem tocar nos campos de
      // apresentação do instrutor (revelar_resposta_atual, pergunta_atual_index,
      // estado_apresentacao, etc.). Antes, o upsert da sala inteira enviava a
      // versão LOCAL (potencialmente defasada) do participante ao Express, que
      // sobrescrevia o estado do instrutor e causava o loop
      // PERGUNTA→GABARITO→PERGUNTA.
      const partAtual = participantesAtualizados.find(p => p.id === participanteId);
      supabaseService.registrarRespostaParticipanteExpress({
        sala_id: salaId,
        participante_id: participanteId,
        participante_nome: partAtual?.nome,
        pergunta_id: perguntaId,
        resposta_index: respostaIndex,
        tempo_ms: tempoMs,
        respostas: partAtual?.respostas,
        pontuacao_acumulada: partAtual?.pontuacao_acumulada,
      }).catch(err => console.warn('Falha ao registrar resposta do participante no Express:', err));
      return salaComResposta;
    }));
  };

  const obterResultadoAvaliacaoParticipante = (salaId: string, participanteId: string, sessaoId?: string): ResultadoAvaliacaoSST | null => {
    // CORREÇÃO (auditoria Quiz Guiado/Avaliação): a busca considera a SESSÃO
    // (sessao_id) quando informada. Quando a sessão é CONHECIDA (sessaoId
    // informado), resultados antigos SEM sessao_id (gravados antes da correção)
    // NÃO podem ser retornados — evita o PDF/avaliação da sessão anterior
    // aparecer na sessão atual.
    const resSalvo = resultadosAvaliacaoSST.find(r =>
      r.sala_id === salaId &&
      r.participante_id === participanteId &&
      (sessaoId ? r.sessao_id === sessaoId : true)
    );
    if (resSalvo) return resSalvo;

    // CORREÇÃO (bug: PDF aparece sem ter realizado o quiz): o cálculo sob
    // demanda só faz sentido APÓS o encerramento da sala (avaliação concluída)
    // e se o participante tiver respostas. Antes disso NÃO gera resultado —
    // evita PDF/avaliação falsa (0 acertos) para quem ainda não jogou.
    const sala = salasQuizGuiado.find(s => s.id === salaId);
    if (!sala) return null;
    if (sala.status !== 'concluido' && sala.status !== 'encerrado') return null;

    const p = (sala.participantes || []).find(part => part.id === participanteId || part.usuario_id === participanteId);
    if (!p) return null;
    const totalRespostas = p.respostas ? (Array.isArray(p.respostas) ? p.respostas.length : Object.keys(p.respostas).length) : 0;
    if (totalRespostas === 0) return null;

    return calcularResultadoAvaliacaoParticipante(sala, p);
  };

  const excluirResultadoAvaliacaoSST = async (resultadoId: string) => {
    // REGRA DE NEGÓCIO (autoria da prova): somente:
    //   - Super Admin: exclui qualquer laudo;
    //   - Admin da empresa: exclui laudos da PRÓPRIA empresa;
    //   - Instrutor: exclui APENAS provas QUE ELE APLICOU (nunca provas de
    //     salas que apenas criou).
    const alvo = resultadosAvaliacaoSST.find(r => r.id === resultadoId);
    const eSuperAdmin = currentUser?.perfil === 'super_admin';
    const eAdminEmpresa = currentUser?.perfil === 'admin' &&
      (!alvo?.empresa_id || alvo.empresa_id === currentUser.empresa_id);
    const eAplicador = !!alvo && (
      (alvo.instrutor_id && alvo.instrutor_id === currentUser?.id) ||
      (alvo.instrutor_nome && currentUser?.nome &&
        alvo.instrutor_nome.trim().toLowerCase() === currentUser.nome.trim().toLowerCase())
    );
    if (!eSuperAdmin && !eAdminEmpresa && !eAplicador) {
      throw new Error('Acesso negado: somente quem APLICOU a prova (ou Administrador/Super Administrador da empresa) pode excluir este laudo.');
    }
    setResultadosAvaliacaoSST(prev => prev.filter(r => r.id !== resultadoId));
    if (!isOfflineMode && navigator.onLine) {
      await supabaseService.deleteResultadoAvaliacaoSST(resultadoId);
    }
  };

  // RESET DE FÁBRICA (usado na comercialização do produto):
  // limpa todos os dados de demonstração, mantendo apenas a empresa e o
  // usuário Super Admin master. Antes de resetar, faz um backup automático.
  const executarResetFabricaComercial = () => {
    // 1. Automatic safety backup before reset
    // 1. Cria um backup automático de segurança antes de resetar.
    gerarBackupSistema('automatico');

    // 2. Identify SuperAdmin user and their primary enterprise
    // 2. Identifica o usuário Super Admin logado e a empresa dele.
    const superAdminUser = usuarios.find(u => u.perfil === 'super_admin' && u.id === currentUser.id) || currentUser;
    const superAdminEmpresa = empresas.find(e => e.id === superAdminUser.empresa_id) || empresa;

    // Reset user statistics for a clean master start
    // Zera as estatísticas do Super Admin para começar do zero.
    const cleanSuperAdmin: Usuario = {
      ...superAdminUser,
      estatisticas: {
        pontos_quizzes: 0,
        pontos_desafios: 0,
        pontos_totais: 0,
        pontos_resgataveis: 0,
        streak_dias: 0,
        quizzes_respondidos: 0,
        acertos_totais: 0,
        erros_totais: 0,
        tempo_medio_resposta_seg: 0,
        desafios_vencidos: 0,
        desafios_jogados: 0,
        trofeus_conquistados: [],
        defesas_vencidas: 0,
        sequencia_vitorias: 0,
        maior_sequencia_vitorias: 0,
        sequencia_defesas: 0,
        maior_sequencia_defesas: 0,
        sequencia_acertos: 0,
        maior_sequencia_acertos: 0,
      }
    };

    // Filter only master enterprise and master user
    // Mantém somente a empresa master e o usuário master.
    const resetEmpresas = [superAdminEmpresa];
    const resetUsuarios = [cleanSuperAdmin];

    // Keep base/official questions or filter for master enterprise
    // Mantém as perguntas da empresa master (ou as sem empresa vinculada).
    const cleanPerguntas = perguntas.filter(p => p.empresa_id === superAdminEmpresa.id || !p.empresa_id);
    const cleanSetores = setores.filter(s => s.empresa_id === superAdminEmpresa.id);

    // Reset states
    // Aplica o reset em todos os estados.
    setEmpresas(resetEmpresas);
    setEmpresa(superAdminEmpresa);
    setUsuarios(resetUsuarios);
    setCurrentUser(cleanSuperAdmin);
    setSetores(cleanSetores);
    setPerguntas(cleanPerguntas);
    setCampanhas([]);
    setQuizzes([]);
    setDesafios([]);
    setPremiacoes([]);
    setResgates([]);
    setNotificacoes([]);
    // CORREÇÃO: o reset de fábrica também zera as salas de Quiz Guiado e os
    // resultados de avaliação (estado + localStorage + IndexedDB). Antes esses
    // dados "vazavam" pelo reload offline, ressuscitando conteúdo antigo.
    setSalasQuizGuiado([]);
    setResultadosAvaliacaoSST([]);

    // Update localStorage
    // Persiste o reset no localStorage.
    localStorage.setItem('sst_empresas', JSON.stringify(resetEmpresas));
    localStorage.setItem('sst_empresa', JSON.stringify(superAdminEmpresa));
    localStorage.setItem('sst_usuarios', JSON.stringify(resetUsuarios));
    localStorage.setItem('sst_current_user_id', cleanSuperAdmin.id);
    localStorage.setItem('sst_setores', JSON.stringify(cleanSetores));
    localStorage.setItem('sst_perguntas', JSON.stringify(cleanPerguntas));
    localStorage.setItem('sst_campanhas', JSON.stringify([]));
    localStorage.setItem('sst_quizzes', JSON.stringify([]));
    localStorage.setItem('sst_desafios', JSON.stringify([]));
    localStorage.setItem('sst_premiacoes', JSON.stringify([]));
    localStorage.setItem('sst_resgates', JSON.stringify([]));
    localStorage.setItem('sst_notificacoes', JSON.stringify([]));
    // CORREÇÃO: limpa a fila de sincronização offline para que dados antigos
    // não sejam reenviados ao Supabase após o reset de fábrica.
    localStorage.removeItem('sst_sync_pendentes');
    setItensPendentesSync([]);
    // Zera também salas de Quiz Guiado e resultados de avaliação no
    // localStorage e no IndexedDB (a cópia durável não pode ressuscitar conteúdo).
    localStorage.setItem('sst_salas_quiz_guiado', JSON.stringify([]));
    localStorage.setItem('sst_resultados_avaliacao_sst', JSON.stringify([]));
    idbSet('sst_salas_quiz_guiado', JSON.stringify([]));
    idbSet('sst_resultados_avaliacao_sst', JSON.stringify([]));

    // CORREÇÃO IMPORTANTE: se o Supabase está conectado, limpa as tabelas da
    // nuvem e re-popula apenas com os dados do reset (empresa master + usuário
    // master). Sem isso, o "banco vence" na próxima hidratação traria os dados
    // antigos de volta ao app.
    if (isSupabaseActive) {
      // Limpa a nuvem de forma assíncrona e depois re-seeda com o estado limpo.
      supabaseService.limparTodasTabelas().then(() => {
        return supabaseService.seedInitialDataIfEmpty(
          resetEmpresas,
          cleanSetores,
          resetUsuarios,
          cleanPerguntas,
          [],
          [],
          [],
          [],
          true // força o seed com o estado limpo
        );
      }).catch((err) => {
        console.error('Erro ao sincronizar reset de fábrica com o Supabase:', err);
      });
    }

    return {
      success: true,
      message: 'Banco de dados resetado com sucesso para comercialização! Apenas sua empresa e seu usuário master foram mantidos. Um backup de segurança com o estado anterior foi criado automaticamente.',
    };
  };

  // Exclui um backup do histórico (local + Supabase).
  const excluirBackupHistorico = (id: string) => {
    setHistoricoBackups(prev => {
      const updated = prev.filter(b => b.id !== id);
      try {
        localStorage.setItem('sst_backups_history', JSON.stringify(updated.map(({ jsonSnapshot, ...rest }) => rest)));
        localStorage.removeItem(`sst_backup_snap_${id}`);
      } catch (e) {
        console.warn('Erro ao atualizar localStorage na remoção de backup:', e);
      }
      return updated;
    });
    supabaseService.deleteBackupHistorico(id);
  };

  // Trigger automatic periodic backup on app startup (daily per enterprise and global)
  // BACKUP AUTOMÁTICO: ao abrir o app, verifica se passou mais de 1 dia desde
  // o último backup (global e de cada empresa) e, se passou, gera um novo
  // backup automático.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;

        // 1. Check global auto-backup
        // 1. Verifica o backup automático global.
        const lastGlobalAuto = historicoBackups.find(b => b.tipo === 'automatico' && (b.escopo === 'global' || !b.escopo));
        if (!lastGlobalAuto || (now - new Date(lastGlobalAuto.data).getTime() > ONE_DAY)) {
          gerarBackupSistema('automatico');
        }

        // 2. Check individual company auto-backups
        // 2. Verifica o backup automático de cada empresa.
        empresas.forEach(emp => {
          const lastEmpAuto = historicoBackups.find(b => b.tipo === 'automatico' && b.escopo === 'empresa' && b.empresaId === emp.id);
          if (!lastEmpAuto || (now - new Date(lastEmpAuto.data).getTime() > ONE_DAY)) {
            gerarBackupSistema('automatico', emp.id);
          }
        });
      } catch (e) {
        console.warn('Erro ao verificar backup automático diário:', e);
      }
    }, 6000); // executa 6 segundos após abrir o app
    return () => clearTimeout(timer);
  }, [empresas.length]);

  // EXPORTAÇÃO DO CONTEXTO: entrega todos os estados e funções para as telas.
  // Para usar em qualquer componente: `const { ... } = useSST();`
  return (
    <SSTContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        isLoggedIn,
        login,
        loginWithCredentials,
        registerAccount,
        requestPasswordResetCode,
        resetUserPasswordWithCode,
        finalizarRecuperacaoViaToken,
        temTokenRecuperacaoNaUrl,
        logout,
        empresa,
        setEmpresa,
        empresas,
        setEmpresas,
        setores,
        usuarios,
        setUsuarios,
        perguntas,
        campanhas,
        quizzes,
        desafios,
        premiacoes,
        notificacoes,
        marcarNotificacaoComoLida,
        marcarTodasNotificacoesComoLidas,
        excluirNotificacao,
        limparTodasNotificacoes,
        dispararNotificacaoLembrete,
        showNotificationDrawer,
        setShowNotificationDrawer,
        isOfflineMode,
        setIsOfflineMode,
        itensPendentesSync,
        sincronizarDadosPendentes,
        getRankingsSetores,
        getRankingsColaboradores,
        adicionarPergunta,
        adicionarPerguntasLote,
        editarPergunta,
        excluirPergunta,
        showProfileModal,
        setShowProfileModal,
        showSupabaseModal,
        setShowSupabaseModal,
        isSupabaseActive,
        setIsSupabaseActive,
        criarCampanha,
        editarCampanha,
        excluirCampanha,
        criarDesafio1v1,
        aceitarDesafio,
        recusarDesafio,
        submeterRespostaDesafio,
        submeterQuizConcluido,
        criarRevanche,
        resetarTabelaDesafios1v1,
        resetarPontuacaoEmpresa,
        encerrarEIniciarNovaTemporada,
        adicionarPremiacao,
        editarPremiacao,
        excluirPremiacao,
        resgates,
        solicitarResgatePremio,
        atualizarStatusResgate,
        adicionarEmpresa,
        editarEmpresa,
        excluirEmpresa,
        adicionarSetor,
        editarSetor,
        excluirSetor,
        adicionarUsuario,
        adicionarUsuariosLote,
        editarUsuario,
        excluirUsuario,
        adicionarSetoresLote,
        categoriasPersonalizadas,
        adicionarCategoriaPersonalizada,
        categoriasDisponiveis,
        gerarBackupSistema,
        restaurarBackupSistema,
        excluirBackupHistorico,
        executarResetFabricaComercial,
        historicoBackups,
        resetarPontuacaoEmpresaPreservarPontos,
        medalhasConfiguraveis,
        adicionarMedalha,
        editarMedalha,
        excluirMedalha,
        salasQuizGuiado,
        resultadosAvaliacaoSST,
        criarSalaQuizGuiado,
        editarSalaQuizGuiado,
        excluirSalaQuizGuiado,
        entrarNaSalaQuizGuiado,
        iniciarQuizGuiado,
        pausarQuizGuiado,
        retomarQuizGuiado,
        avancarPerguntaQuizGuiado,
        revelarRespostaAtualQuizGuiado,
        exibirRanqueQuizGuiado,
        reiniciarSalaQuizGuiado,
        encerrarSalaQuizGuiado,
        submeterRespostaQuizGuiado,
        obterResultadoAvaliacaoParticipante,
        excluirResultadoAvaliacaoSST,
      }}
    >
      {children}
    </SSTContext.Provider>
  );
};

export const useSST = () => {
  // HOOK DE ACESSO AO CONTEXTO.
  // Uso em qualquer tela: `const { currentUser, criarDesafio1v1 } = useSST();`
  const context = useContext(SSTContext);
  if (!context) {
    // Se um componente usar useSST fora do SSTProvider, mostra erro claro.
    throw new Error('useSST deve ser usado dentro de um SSTProvider');
  }
  return context;
};
