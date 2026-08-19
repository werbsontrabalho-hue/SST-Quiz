// ====================================================================
// DADOS MOCK (fake data) DO APP
// --------------------------------------------------------------------
// Este arquivo concentra os dados de demonstração usados na primeira
// execução do sistema, quando ainda não há nada persistido no
// localStorage. O SSTContext (src/context/SSTContext.tsx) consome
// estas constantes para "semear" o estado inicial da aplicação.
// Cada bloco abaixo reflete uma entidade do domínio (tipos em ../types).
// ====================================================================
import { 
  Empresa, 
  Setor, 
  Usuario, 
  Pergunta, 
  Campanha, 
  QuizSessao, 
  Desafio1v1, 
  Premiacao 
} from '../types';

// ====================================================================
// EMPRESAS
// --------------------------------------------------------------------
// Registros de empresas clientes do app. As "configuracoes" definem as
// regras de gamificação (limite de desafios, pontos por vitória, etc.)
// que são aplicadas no ranking e nos desafios 1v1. Ex.: emp-1 tem plano
// Enterprise com mais desafios semanais do que emp-2 (plano Pro).
// ====================================================================
export const mockEmpresas: Empresa[] = [
  {
    id: 'emp-1',
    nome: 'TecnoSafety Industrial S.A.',
    cnpj: '12.345.678/0001-90',
    plano: 'Enterprise',
    configuracoes: {
      limiteDesafiosSemana: 5,
      pontosVitoriaDesafio: 50,
      perguntasPorDesafio: 5,
      desempateRule: 'desafiante',
      tempoLimiteAceiteHoras: 24,
      permitirAmistosos: true,
      permitirMesmoSetorAmistoso: true,
      percentualMinimoParticipacao: 50,
      pontosVitoriaAmistoso: 50,
      pontosDerrotaAmistoso: 25,
      nome_temporada_atual: '1ª Temporada Oficial SST',
      regrasTrofeus: {
        vitoriasTotais: [
          { meta: 10, trofeuId: 't-bronze', imagem: 'medalha_bronze', nome: 'Bronze', ativo: true, modoContagem: 'acumulado', mostrarProgresso: true, limiteProximidade: 3 },
          { meta: 30, trofeuId: 't-prata', imagem: 'medalha_prata', nome: 'Prata', ativo: true, modoContagem: 'acumulado', mostrarProgresso: true, limiteProximidade: 5 },
          { meta: 50, trofeuId: 't-ouro', imagem: 'medalha_ouro', nome: 'Ouro', ativo: true, modoContagem: 'acumulado', mostrarProgresso: true, limiteProximidade: 5 },
        ],
        winStreak: [
          { meta: 3, trofeuId: 's-bronze', imagem: 'streak_3', nome: 'Em Forma', ativo: true, modoContagem: 'sequencial', mostrarProgresso: true, limiteProximidade: 2 },
          { meta: 7, trofeuId: 's-prata', imagem: 'streak_7', nome: 'Consistente', ativo: true, modoContagem: 'sequencial', mostrarProgresso: true, limiteProximidade: 2 },
          { meta: 15, trofeuId: 's-ouro', imagem: 'streak_15', nome: 'Imbatível', ativo: true, modoContagem: 'sequencial', mostrarProgresso: true, limiteProximidade: 3 },
        ],
        acertosTotais: [
          { meta: 100, trofeuId: 'a-bronze', imagem: 'acertos_100', nome: 'Estudioso', ativo: true, modoContagem: 'acumulado', mostrarProgresso: true, limiteProximidade: 20 },
        ],
        defesasImbativel: [
          { meta: 5, trofeuId: 'd-bronze', imagem: 'defesa_1', nome: 'Defesa Sólida', ativo: true, modoContagem: 'acumulado', mostrarProgresso: true, limiteProximidade: 2, gatilhoDefesa: 'desafiado' },
        ],
        recuperacoesEpicas: [
          { meta: 1, trofeuId: 'r-bronze', imagem: 'recuperacao_1', nome: 'Recuperação Épica', ativo: true, modoContagem: 'acumulado', mostrarProgresso: true, limiteProximidade: 1, gatilhoDefesa: 'ambos' },
        ],
        veteranoSST: [
          { meta: 10, trofeuId: 'v-bronze', imagem: 'veterano_10', nome: 'Veterano SST', ativo: true, modoContagem: 'acumulado', mostrarProgresso: true, limiteProximidade: 2 },
        ],
      },
    },
  },
  {
    id: 'emp-2',
    nome: 'Logística & Transportes Brasil',
    cnpj: '98.765.432/0001-10',
    plano: 'Pro',
    configuracoes: {
      limiteDesafiosSemana: 3,
      pontosVitoriaDesafio: 40,
      perguntasPorDesafio: 5,
      desempateRule: 'desafiante',
      tempoLimiteAceiteHoras: 48,
      permitirAmistosos: true,
      permitirMesmoSetorAmistoso: false,
      percentualMinimoParticipacao: 50,
    },
  },
];

// ====================================================================
// SETORES
// --------------------------------------------------------------------
// Departamentos/unidades das empresas. São usados para agrupar
// colaboradores, filtrar campanhas por setores alvo e alimentar o
// ranking por setor. Todos os setores abaixo pertencem a emp-1.
// ====================================================================
export const mockSetores: Setor[] = [
  { id: 'set-1', empresa_id: 'emp-1', nome: 'Operações & Produção', colaboradores_ativos: 8 },
  { id: 'set-2', empresa_id: 'emp-1', nome: 'Manutenção Industrial', colaboradores_ativos: 6 },
  { id: 'set-3', empresa_id: 'emp-1', nome: 'Logística & Frota', colaboradores_ativos: 5 },
  { id: 'set-4', empresa_id: 'emp-1', nome: 'SST & Meio Ambiente', colaboradores_ativos: 4 },
  { id: 'set-5', empresa_id: 'emp-1', nome: 'Administrativo & RH', colaboradores_ativos: 4 },
];

// ====================================================================
// USUÁRIOS
// --------------------------------------------------------------------
// Colaboradores cadastrados na plataforma. Cada usuário possui perfil
// (super_admin / admin / colaborador), setor de vínculo e um objeto de
// "estatisticas" com pontuações, streak e medalhas — dados exibidos nos
// rankings, perfil e conquistas. Servem de base para os desafios 1v1.
// ====================================================================
export const mockUsuarios: Usuario[] = [
  {
    id: 'usr-super',
    empresa_id: 'emp-1',
    setor_id: 'set-4',
    nome: 'Carlos Eduardo (Super Admin)',
    email: 'superadmin@sstquiz.com.br',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
    perfil: 'super_admin',
    cargo: 'Engenheiro Chefe de Segurança Global',
    estatisticas: {
      pontos_quizzes: 450,
      pontos_desafios: 200,
      pontos_totais: 650,
      streak_dias: 18,
      quizzes_respondidos: 35,
      acertos_totais: 32,
      erros_totais: 3,
      tempo_medio_resposta_seg: 14.2,
      desafios_vencidos: 12,
      desafios_jogados: 14,
      defesas_vencidas: 4,
      sequencia_vitorias: 3,
      maior_sequencia_vitorias: 6,
      sequencia_acertos: 5,
      maior_sequencia_acertos: 9,
      trofeus_conquistados: [
        { nome: 'Bronze', categoria: 'vitoriasTotais', conquistado_em: '2026-03-10T10:00:00.000Z' },
        { nome: 'Em Forma', categoria: 'winStreak', conquistado_em: '2026-04-02T09:30:00.000Z' },
      ],
    },
  },
  {
    id: 'usr-admin',
    empresa_id: 'emp-1',
    setor_id: 'set-4',
    nome: 'Mariana Santos (Gerente SST)',
    email: 'mariana.santos@tecnosafety.com',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=250',
    perfil: 'admin',
    cargo: 'Gerente EHS & SST',
    estatisticas: {
      pontos_quizzes: 380,
      pontos_desafios: 150,
      pontos_totais: 530,
      streak_dias: 12,
      quizzes_respondidos: 28,
      acertos_totais: 25,
      erros_totais: 3,
      tempo_medio_resposta_seg: 18.5,
      desafios_vencidos: 7,
      desafios_jogados: 9,
      defesas_vencidas: 2,
      sequencia_vitorias: 1,
      maior_sequencia_vitorias: 4,
      trofeus_conquistados: [
        { nome: 'Bronze', categoria: 'vitoriasTotais', conquistado_em: '2026-03-15T10:00:00.000Z' },
      ],
    },
  },
  {
    id: 'usr-colab-1',
    empresa_id: 'emp-1',
    setor_id: 'set-1', // Operações
    nome: 'Lucas Oliveira',
    email: 'lucas.oliveira@tecnosafety.com',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=250',
    perfil: 'colaborador',
    cargo: 'Técnico de Operações I',
    estatisticas: {
      pontos_quizzes: 320,
      pontos_desafios: 180,
      pontos_totais: 500,
      streak_dias: 16,
      quizzes_respondidos: 24,
      acertos_totais: 22,
      erros_totais: 2,
      tempo_medio_resposta_seg: 12.1,
      desafios_vencidos: 8,
      desafios_jogados: 10,
      defesas_vencidas: 3,
      sequencia_vitorias: 2,
      maior_sequencia_vitorias: 5,
      trofeus_conquistados: [
        { nome: 'Bronze', categoria: 'vitoriasTotais', conquistado_em: '2026-02-20T10:00:00.000Z' },
        { nome: 'Em Forma', categoria: 'winStreak', conquistado_em: '2026-03-05T09:30:00.000Z' },
      ],
    },
  },
  {
    id: 'usr-colab-2',
    empresa_id: 'emp-1',
    setor_id: 'set-2', // Manutenção
    nome: 'Roberto Almeida',
    email: 'roberto.almeida@tecnosafety.com',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=250',
    perfil: 'colaborador',
    cargo: 'Mecânico de Manutenção Senior',
    estatisticas: {
      pontos_quizzes: 290,
      pontos_desafios: 160,
      pontos_totais: 450,
      streak_dias: 9,
      quizzes_respondidos: 21,
      acertos_totais: 19,
      erros_totais: 2,
      tempo_medio_resposta_seg: 15.3,
      desafios_vencidos: 6,
      desafios_jogados: 8,
      defesas_vencidas: 1,
      trofeus_conquistados: [
        { nome: 'Bronze', categoria: 'vitoriasTotais', conquistado_em: '2026-04-01T10:00:00.000Z' },
      ],
    },
  },
  {
    id: 'usr-colab-3',
    empresa_id: 'emp-1',
    setor_id: 'set-3', // Logística
    nome: 'Ana Beatris Silva',
    email: 'ana.silva@tecnosafety.com',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=250',
    perfil: 'colaborador',
    cargo: 'Operadora de Empilhadeira',
    estatisticas: {
      pontos_quizzes: 210,
      pontos_desafios: 90,
      pontos_totais: 300,
      streak_dias: 5,
      quizzes_respondidos: 16,
      acertos_totais: 14,
      erros_totais: 2,
      tempo_medio_resposta_seg: 20.0,
      desafios_vencidos: 3,
      desafios_jogados: 5,
      trofeus_conquistados: [],
    },
  },
  {
    id: 'usr-colab-4',
    empresa_id: 'emp-1',
    setor_id: 'set-1', // Operações
    nome: 'Fernanda Lima',
    email: 'fernanda.lima@tecnosafety.com',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=250',
    perfil: 'colaborador',
    cargo: 'Auxiliar de Produção',
    estatisticas: {
      pontos_quizzes: 180,
      pontos_desafios: 50,
      pontos_totais: 230,
      streak_dias: 4,
      quizzes_respondidos: 14,
      acertos_totais: 12,
      erros_totais: 2,
      tempo_medio_resposta_seg: 22.4,
      desafios_vencidos: 1,
      desafios_jogados: 3,
      trofeus_conquistados: [],
    },
  },
  {
    id: 'usr-colab-5',
    empresa_id: 'emp-1',
    setor_id: 'set-5', // Adm
    nome: 'Gustavo Mendonça',
    email: 'gustavo.mendonca@tecnosafety.com',
    avatar: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&q=80&w=250',
    perfil: 'colaborador',
    cargo: 'Analista Financeiro',
    estatisticas: {
      pontos_quizzes: 110,
      pontos_desafios: 0,
      pontos_totais: 110,
      streak_dias: 2,
      quizzes_respondidos: 8,
      acertos_totais: 7,
      erros_totais: 1,
      tempo_medio_resposta_seg: 25.1,
      desafios_vencidos: 0,
      desafios_jogados: 1,
      trofeus_conquistados: [],
    },
  },
];

// ====================================================================
// PERGUNTAS
// --------------------------------------------------------------------
// Banco de perguntas do quiz, todas vinculadas à emp-1 e classificadas
// por categoria, dificuldade e norma relacionada (NR-06, NR-10, etc.).
// As alternativas e a "resposta_correta" (índice) são usadas para
// corrigir respostas, e "explicacao" é exibida ao colaborador após
// responder. Estes objetos também são reaproveitados na montagem dos
// quizzes diários e desafios 1v1.
// ====================================================================
export const mockPerguntas: Pergunta[] = [
  {
    id: 'p-1',
    empresa_id: 'emp-1',
    categoria: 'SST',
    tipo: 'multipla_escolha',
    dificuldade: 'Fácil',
    enunciado: 'Segundo a NR-35, a partir de qual altura a trabalho é considerado "Trabalho em Altura" e exige cinto de segurança do tipo paraquedista?',
    alternativas: ['Acima de 1,50 metros', 'Acima de 2,00 metros', 'Acima de 2,50 metros', 'Acima de 3,00 metros'],
    resposta_correta: 1,
    explicacao: 'A NR-35 considera trabalho em altura toda atividade executada acima de 2,00m do nível inferior, onde haja risco de queda.',
    tempo_limite_segundos: 30,
    norma_relacionada: 'NR-35',
  },
  {
    id: 'p-2',
    empresa_id: 'emp-1',
    categoria: 'Normas e Treinamentos',
    tipo: 'verdadeiro_falso',
    dificuldade: 'Fácil',
    enunciado: 'O Equipamento de Proteção Individual (EPI) deve ser fornecido gratuitamente pelo empregador e possui uso obrigatório por parte do trabalhador.',
    alternativas: ['Verdadeiro', 'Falso'],
    resposta_correta: 0,
    explicacao: 'Conforme a NR-06, a empresa é obrigada a fornecer gratuitamente aos empregados EPI adequado ao risco, e o trabalhador deve usá-lo apenas para a finalidade a que se destina.',
    tempo_limite_segundos: 30,
    norma_relacionada: 'NR-06',
  },
  {
    id: 'p-3',
    empresa_id: 'emp-1',
    categoria: 'Procedimentos Operacionais',
    tipo: 'multipla_escolha',
    dificuldade: 'Médio',
    enunciado: 'Qual é a sequência correta de procedimentos antes de efetuar a manutenção em um equipamento elétrico industrial energizado?',
    alternativas: [
      'Iniciar a manutenção e desligar o disjuntor caso perceba faíscas.',
      'Desenergizar, bloquear com cadeado/etiqueta (LOTO), testar ausência de tensão e aterrar.',
      'Apenas colocar uma placa de aviso "Em Manutenção" sem desligar a chave.',
      'Solicitar autorização verbal do operador do turno.',
    ],
    resposta_correta: 1,
    explicacao: 'A NR-10 e as normas de Lockout/Tagout exigem o seccionamento, impedimento de reenergização (bloqueio), constatação de ausência de tensão e instalação de aterramento temporário.',
    tempo_limite_segundos: 45,
    norma_relacionada: 'NR-10',
  },
  {
    id: 'p-4',
    empresa_id: 'emp-1',
    categoria: 'Meio Ambiente',
    tipo: 'multipla_escolha',
    dificuldade: 'Fácil',
    enunciado: 'Na coleta seletiva padronizada no Brasil (Resolução CONAMA nº 275), qual cor de lixeira é destinada exclusivamente para descarte de PAPEL e PAPELÃO?',
    alternativas: ['Lixeira Vermelha', 'Lixeira Azul', 'Lixeira Amarela', 'Lixeira Verde'],
    resposta_correta: 1,
    explicacao: 'Azul = Papel/Papelão; Vermelho = Plástico; Amarelo = Metal; Verde = Vidro.',
    tempo_limite_segundos: 30,
    norma_relacionada: 'CONAMA 275',
  },
  {
    id: 'p-5',
    empresa_id: 'emp-1',
    categoria: 'Procedimentos Internos',
    tipo: 'multipla_escolha',
    dificuldade: 'Médio',
    enunciado: 'Em caso de derramamento acidental de produto químico inflamável no galpão, qual deve ser a PRIMEIRA atitude do colaborador?',
    alternativas: [
      'Tentar limpar sozinho com pano seco.',
      'Isolar a área imediata, acionar a brigada/alarme de emergência e desligar fontes de ignição.',
      'Jogar água pressurizada diretamente sobre o produto.',
      'Ignorar se a quantidade for pequena.',
    ],
    resposta_correta: 1,
    explicacao: 'A primeira ação prioritária é afastar fontes de ignição, isolar a área para proteger vidas e comunicar a brigada de emergência especializada.',
    tempo_limite_segundos: 45,
    norma_relacionada: 'FISPQ / PAE',
  },
  {
    id: 'p-6',
    empresa_id: 'emp-1',
    categoria: 'SST',
    tipo: 'multipla_escolha',
    dificuldade: 'Difícil',
    enunciado: 'O que caracteriza um Espaço Confinado segundo a NR-33 e qual documento é OBRIGATÓRIO emitir antes de qualquer entrada?',
    alternativas: [
      'Qualquer sala sem janelas; exige Atestado Médico de Saúde Ocupacional.',
      'Área não projetada para ocupação humana contínua com ventilação deficiente; exige Permissão de Entrada e Trabalho (PET).',
      'Galpão industrial com porta fechada; exige Ordem de Serviço Simples.',
      'Subsolo com ar condicionado; exige licença ambiental.',
    ],
    resposta_correta: 1,
    explicacao: 'Segundo a NR-33, espaço confinado é qualquer área não projetada para ocupação humana contínua, com meios limitados de entrada/saída e ventilação deficiente. Exige a emissão da PET.',
    tempo_limite_segundos: 60,
    norma_relacionada: 'NR-33',
  },
  {
    id: 'p-7',
    empresa_id: 'emp-1',
    categoria: 'Normas e Treinamentos',
    tipo: 'verdadeiro_falso',
    dificuldade: 'Médio',
    enunciado: 'A CIPA (Comissão Interna de Prevenção de Acidentes e Assédio) deve ser constituída apenas por indicação da diretoria da empresa, sem eleição de trabalhadores.',
    alternativas: ['Verdadeiro', 'Falso'],
    resposta_correta: 1,
    explicacao: 'Falso. Conforme a NR-05, a CIPA é composta por representantes do empregador (indicados) e dos empregados (eleitos em votação secreta).',
    tempo_limite_segundos: 30,
    norma_relacionada: 'NR-05',
  },
  {
    id: 'p-8',
    empresa_id: 'emp-1',
    categoria: 'Procedimentos Operacionais',
    tipo: 'multipla_escolha',
    dificuldade: 'Médio',
    enunciado: 'Para operar uma empilhadeira de combustão dentro de galpão fechado, quais cuidados com a saúde são imprescindíveis?',
    alternativas: [
      'Protetor auricular e monitoramento de Monóxido de Carbono (CO) na exaustão.',
      'Capacete com viseira espelhada e luvas isolantes de 10kV.',
      'Nenhum cuidado especial, empilhadeiras não emitem gases.',
      'Uso exclusivo de máscara de solda.',
    ],
    resposta_correta: 0,
    explicacao: 'A exaustão de motores a combustão libera monóxido de carbono em ambientes fechados (NR-11/NR-15) e a operação gera ruído contínuo.',
    tempo_limite_segundos: 45,
    norma_relacionada: 'NR-11',
  },
];

// ====================================================================
// CAMPANHAS
// --------------------------------------------------------------------
// Campanhas de engajamento disparadas aos colaboradores (diária ou
// semanalmente). Definem o período de vigência, horário de disparo,
// quantidade de perguntas e os setores-alvo ("todos" ou lista de ids).
// A campanha camp-1 alimenta o quiz diário inicial abaixo.
// ====================================================================
export const mockCampanhas: Campanha[] = [
  {
    id: 'camp-1',
    empresa_id: 'emp-1',
    nome: 'Maratona Zero Acidentes 2026',
    descricao: 'Campanha mensal focada em procedimentos operacionais, NR-35 e NR-10 para reforço do uso correto de EPIs.',
    frequencia: 'diaria',
    setores_alvo: ['todos'],
    quantidade_perguntas: 5,
    data_inicio: '2026-02-01',
    data_fim: '2026-02-28',
    horario_disparo: '08:00',
    ativa: true,
  },
  {
    id: 'camp-2',
    empresa_id: 'emp-1',
    nome: 'Mês do Meio Ambiente e Sustentabilidade',
    descricao: 'Quiz semanal sobre gerenciamento de resíduos perigosos, economia de recursos e certificação ISO 14001.',
    frequencia: 'semanal',
    setores_alvo: ['set-1', 'set-2', 'set-3'],
    quantidade_perguntas: 3,
    data_inicio: '2026-02-05',
    data_fim: '2026-03-05',
    horario_disparo: '09:30',
    ativa: true,
  },
];

// ====================================================================
// QUIZZES INICIAIS
// --------------------------------------------------------------------
// Sessão de quiz pré-preenchida para o colaborador usr-colab-1 no dia
// de estreia do app. Reaproveita as perguntas do mockPerguntas e nasce
// com status "pendente" (aguardando o usuário responder). A data é
// gerada dinamicamente no momento em que o mock é carregado.
// ====================================================================
export const mockQuizzesIniciais: QuizSessao[] = [
  {
    id: 'quiz-today-1',
    campanha_id: 'camp-1',
    colaborador_id: 'usr-colab-1',
    empresa_id: 'emp-1',
    titulo: 'Quiz Diário - Maratona Zero Acidentes',
    categoria: 'SST',
    perguntas: [mockPerguntas[0], mockPerguntas[1], mockPerguntas[2], mockPerguntas[3], mockPerguntas[4]],
    status: 'pendente',
    pontuacao_total: 0,
    respostas: [],
    criado_em: new Date().toISOString(),
  },
];

// ====================================================================
// DESAFIOS 1v1
// --------------------------------------------------------------------
// Disputas entre dois colaboradores de setores distintos. Possuem tema
// sorteado, valor de pontuação para o setor vencedor e as respostas de
// ambos os lados (usadas para apurar o vencedor). des-1 já está
// "concluido" com placar completo; des-2 está "pendente" (aguardando
// a resposta do desafiado).
// ====================================================================
export const mockDesafios: Desafio1v1[] = [
  {
    id: 'des-1',
    empresa_id: 'emp-1',
    desafiante_id: 'usr-colab-1', // Lucas (Operações)
    desafiante_setor_id: 'set-1',
    desafiado_id: 'usr-colab-2', // Roberto (Manutenção)
    desafiado_setor_id: 'set-2',
    tema_sorteado: 'SST',
    status: 'concluido',
    vale_ponto: true,
    tipo: 'competitivo',
    pontuacao_setor: 50,
    vencedor_id: 'usr-colab-1',
    vencedor_setor_id: 'set-1',
    data_criacao: '2026-02-06T14:30:00Z',
    perguntas: [mockPerguntas[0], mockPerguntas[1], mockPerguntas[2], mockPerguntas[3], mockPerguntas[5]],
    respostas_desafiante: [
      { pergunta_id: 'p-1', alternativa_escolhida: 1, correta: true, tempo_resposta_segundos: 8.5 },
      { pergunta_id: 'p-2', alternativa_escolhida: 0, correta: true, tempo_resposta_segundos: 5.2 },
      { pergunta_id: 'p-3', alternativa_escolhida: 1, correta: true, tempo_resposta_segundos: 12.0 },
      { pergunta_id: 'p-4', alternativa_escolhida: 1, correta: true, tempo_resposta_segundos: 6.4 },
      { pergunta_id: 'p-6', alternativa_escolhida: 1, correta: true, tempo_resposta_segundos: 18.2 },
    ],
    respostas_desafiado: [
      { pergunta_id: 'p-1', alternativa_escolhida: 1, correta: true, tempo_resposta_segundos: 11.2 },
      { pergunta_id: 'p-2', alternativa_escolhida: 0, correta: true, tempo_resposta_segundos: 7.0 },
      { pergunta_id: 'p-3', alternativa_escolhida: 1, correta: true, tempo_resposta_segundos: 15.1 },
      { pergunta_id: 'p-4', alternativa_escolhida: 1, correta: true, tempo_resposta_segundos: 9.8 },
      { pergunta_id: 'p-6', alternativa_escolhida: 0, correta: false, tempo_resposta_segundos: 22.0 },
    ],
  },
  {
    id: 'des-2',
    empresa_id: 'emp-1',
    desafiante_id: 'usr-colab-2', // Roberto (Manutenção)
    desafiante_setor_id: 'set-2',
    desafiado_id: 'usr-colab-3', // Ana Beatris (Logística)
    desafiado_setor_id: 'set-3',
    tema_sorteado: 'Procedimentos Operacionais',
    status: 'pendente',
    vale_ponto: true,
    tipo: 'competitivo',
    pontuacao_setor: 50,
    data_criacao: '2026-02-07T10:00:00Z',
    perguntas: [mockPerguntas[2], mockPerguntas[7], mockPerguntas[4], mockPerguntas[1], mockPerguntas[0]],
  },
];

// ====================================================================
// PRÊMIOS
// --------------------------------------------------------------------
// Catálogo de premiações da empresa (vale-presente, folga remunerada,
// brinde) que os colaboradores podem resgatar/ganhar. "requisito"
// descreve a condição de conquista, "custo_pontos" o preço de troca e
// "estoque" quantas unidades estão disponíveis no mês de referência.
// ====================================================================
export const mockPremiacoes: Premiacao[] = [
  {
    id: 'prem-1',
    empresa_id: 'emp-1',
    titulo: 'Vale-Presente R$ 300 + Troféu SST',
    descricao: 'Premiado para o colaborador com maior pontuação geral no mês de Fevereiro.',
    tipo: 'vale_presente',
    mes_referencia: 'Fevereiro / 2026',
    requisito: '1º Lugar Geral no Ranking de Colaboradores',
    custo_pontos: 300,
    estoque: 10,
    ativo: true,
    imagem: 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&q=80&w=400',
  },
  {
    id: 'prem-2',
    empresa_id: 'emp-1',
    titulo: 'Dia de Folga Remunerada para o Setor Campeão',
    descricao: 'Todos os colaboradores do setor com maior média ponderada no mês ganham 1 dia de folga bônus.',
    tipo: 'folga',
    mes_referencia: 'Fevereiro / 2026',
    requisito: 'Setor 1º Colocado no Ranking de Setores (com Média > 50% de participação)',
    custo_pontos: 300,
    estoque: 10,
    ativo: true,
    imagem: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=400',
  },
  {
    id: 'prem-3',
    empresa_id: 'emp-1',
    titulo: 'Kit Brindes Exclusivo SST Master',
    descricao: 'Mochila térmica + garrafa térmica inox + fone bluetooth para quem mantiver Streak de 30 dias.',
    tipo: 'brinde',
    mes_referencia: 'Fevereiro / 2026',
    requisito: 'Conquistar Medalha Ouro (Streak 30 dias)',
    custo_pontos: 300,
    estoque: 10,
    ativo: true,
    imagem: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&q=80&w=400',
  },
];
