import fs from 'fs';
import path from 'path';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType, AlignmentType, ShadingType } from 'docx';

const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

console.log('Gerando documentos .docx em', publicDir);

// Helpers para estilo no docx
const primaryColor = "0F172A"; // Slate 900
const accentColor = "10B981";  // Emerald 500
const subColor = "334155";     // Slate 700

function createTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 300 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 52, // 26pt
        color: primaryColor,
        font: "Arial"
      })
    ]
  });
}

function createSubtitle(text) {
  return new Paragraph({
    heading: HeadingLevel.SUBTITLE,
    alignment: AlignmentType.CENTER,
    spacing: { before: 100, after: 400 },
    children: [
      new TextRun({
        text: text,
        italic: true,
        size: 28, // 14pt
        color: accentColor,
        font: "Arial"
      })
    ]
  });
}

function createHeading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 36, // 18pt
        color: primaryColor,
        font: "Arial"
      })
    ]
  });
}

function createHeading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 28, // 14pt
        color: accentColor,
        font: "Arial"
      })
    ]
  });
}

function createHeading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 24, // 12pt
        color: subColor,
        font: "Arial"
      })
    ]
  });
}

function createParagraph(text, boldPrefix = "") {
  const children = [];
  if (boldPrefix) {
    children.push(new TextRun({
      text: boldPrefix,
      bold: true,
      size: 22,
      font: "Arial"
    }));
  }
  children.push(new TextRun({
    text: text,
    size: 22,
    font: "Arial"
  }));

  return new Paragraph({
    spacing: { before: 100, after: 100 },
    children
  });
}

function createBullet(text, boldPrefix = "") {
  const children = [];
  if (boldPrefix) {
    children.push(new TextRun({
      text: boldPrefix + " ",
      bold: true,
      size: 22,
      font: "Arial"
    }));
  }
  children.push(new TextRun({
    text: text,
    size: 22,
    font: "Arial"
  }));

  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 60, after: 60 },
    children
  });
}

// --------------------------------------------------------------------------
// 1. GERAR MANUAL DO USUÁRIO
// --------------------------------------------------------------------------
const userDoc = new Document({
  sections: [{
    properties: {},
    children: [
      createTitle("MANUAL COMPLETO DO USUÁRIO"),
      createSubtitle("Plataforma SST Quiz Corporate — Gestão de Treinamentos e Avaliações de Saúde e Segurança"),
      
      createHeading1("1. VISÃO GERAL E OBJETIVO DA APLICAÇÃO"),
      createParagraph("O SST Quiz Corporate é uma plataforma web para aplicação de treinamentos interativos de Saúde e Segurança do Trabalho (SST), gamificação corporativa e emissão oficial de laudos e certificados em conformidade com as Normas Regulamentadoras (NR-01 a NR-38 do MTE)."),
      createParagraph("A aplicação atende desde pequenas empresas até grandes corporações com filiais e múltiplos setores, permitindo a condução de exames e quizzes presenciais em tempo real com projeção em TV e relatórios auditáveis."),

      createHeading1("2. HIERARQUIA DE USUÁRIOS E PERMISSÕES DE ACESSO"),
      createParagraph("O sistema implementa isolamento rigoroso por empresa com 5 níveis de acesso distintos:"),
      
      createHeading2("2.1 Super Administrador (super_admin)"),
      createBullet("Acesso irrestrito a todas as empresas cadastradas no ecossistema.", "Escopo:"),
      createBullet("Criar, editar e suspender empresas, visualizar dados consolidados globais.", "Funcionalidades Principais:"),
      createBullet("Acesso exclusivo ao Modal de Configuração do Supabase, gerenciamento de banco de dados e restauração de dados.", "Configurações Técnicas:"),

      createHeading2("2.2 Administrador de Empresa (admin)"),
      createBullet("Gerenciamento completo da empresa específica à qual está vinculado.", "Escopo:"),
      createBullet("Cadastro e edição de Setores (Operacional, Administrativo, SESMT, Manutenção, etc.).", "Setores:"),
      createBullet("Cadastro, edição, ativação/desativação e redefinição de senhas de colaboradores.", "Usuários:"),
      createBullet("Gerenciamento da Loja de Prêmios (cadastro de produtos, estoque e entrega de resgates).", "Gamificação:"),
      createBullet("Relatórios executivos e gráficos de engajamento do SESMT.", "Relatórios:"),

      createHeading2("2.3 Instrutor SST (is_instrutor = true)"),
      createBullet("Condução de exames e treinamentos oficiais de SST.", "Escopo:"),
      createBullet("Criar e configurar Salas de Quiz Guiado em Tempo Real.", "Salas de Quiz:"),
      createBullet("Mesa de Controle do Instrutor (iniciar prova, avançar questões, liberar cronômetro, revelar respostas e rankings).", "Mesa de Operação:"),
      createBullet("Acesso ao histórico de avaliações, visualização de gabaritos e emissão de Laudos Oficiais em PDF com QR Code de autenticidade.", "Certificação:"),

      createHeading2("2.4 Colaborador / Aluno (colaborador)"),
      createBullet("Acesso ao seu Painel Pessoal com contador de Pontos, XP, Nível e Medalhas.", "Painel Pessoal:"),
      createBullet("Participação em quizzes individuais e exames guiados ao vivo via PIN ou QR Code.", "Treinamentos:"),
      createBullet("Solicitação de resgate de prêmios na loja corporativa com seus pontos acumulados.", "Premiações:"),
      createBullet("Criação e aceite de Desafios 1v1 com colegas de trabalho para acúmulo de bônus.", "Desafios PvP:"),

      createHeading2("2.5 Visitante / Participante Temporário (is_visitante = true)"),
      createBullet("Acesso simplificado sem necessidade de conta prévia na plataforma.", "Conceito:"),
      createBullet("Entrada direta no Quiz Guiado informando apenas PIN da Sala, Nome e CPF/Matrícula.", "Requisitos:"),
      createBullet("Emissão de laudo técnico individual e certificado oficial após a conclusão.", "Resultado:"),

      createHeading1("3. DETALHAMENTO DE TODAS AS JANELAS, MODAIS E BOTÕES"),

      createHeading2("3.1 Tela de Acesso e Autenticação (LoginView)"),
      createParagraph("Janela inicial do sistema responsável pelo controle de entrada e atalhos rápidos."),
      createBullet("Campo de E-mail e Senha para autenticação corporativa de usuários cadastrados.", "Formulário de Login:"),
      createBullet("Valida credenciais no Supabase/servidor e direciona para a visualização correspondente ao perfil.", "Botão 'Entrar no Sistema':"),
      createBullet("Campo dedicado para digitação de PIN numérico de 6 dígitos para entrada direta no Quiz Guiado sem login.", "Acesso Rápido por PIN:"),
      createBullet("Abre a câmera do dispositivo móvel para escaneamento do QR Code da sala.", "Botão 'Escanear QR Code':"),
      createBullet("Abre um modal solicitando o e-mail cadastrado para envio de instruções de redefinição de senha via SMTP.", "Link 'Esqueceu a senha?':"),

      createHeading2("3.2 Módulo Quiz Guiado SST (QuizGuiadoView)"),
      createParagraph("Módulo central para condução de avaliações presenciais e remotas em tempo real."),
      
      createHeading3("3.2.1 Aba 'Salas & Provas Ao Vivo'"),
      createBullet("Abre o modal de criação de uma nova sala de prova.", "Botão '+ Criar Nova Sala de Quiz':"),
      createBullet("Exibe cards com o PIN, título, instrutor e número de participantes das salas ativas.", "Cards de Salas:"),
      createBullet("Abre a Mesa de Controle do Instrutor para conduzir a prova.", "Botão 'Gerenciar Mesa de Controle':"),
      createBullet("Abre a janela de Projeção em TV (`TelaApresentacaoView`) com contador e ranking gigante.", "Botão 'Modo TV / Projetor':"),
      createBullet("Dispara a exclusão da sala do banco de dados (preservando o histórico de avaliações).", "Ícone de Lixeira (Excluir Sala):"),

      createHeading3("3.2.2 Modal 'Criar Nova Sala de Quiz' (CriarSalaModal)"),
      createBullet("Informe o nome do treinamento (ex: 'Treinamento NR-35 - Trabalho em Altura').", "Campo 'Título do Treinamento':"),
      createBullet("Selecione quais perguntas farão parte da avaliação a partir do banco de questões por NR.", "Seleção de Perguntas:"),
      createBullet("Defina a nota de corte para aprovação (ex: 7.0 / 10.0).", "Campo 'Nota Mínima de Aprovação':"),
      createBullet("Defina quantos segundos os alunos terão para responder cada questão (ex: 30 seg).", "Campo 'Tempo por Pergunta':"),

      createHeading3("3.2.3 Mesa de Controle do Instrutor (PainelInstrutor)"),
      createBullet("Liberar a entrada dos alunos na sala de espera.", "Botão 'Iniciar Prova':"),
      createBullet("Avança para a próxima questão e inicia o cronômetro regressivo.", "Botão 'Próxima Pergunta':"),
      createBullet("Encerra a contagem de tempo da pergunta atual e exibe qual era a alternativa correta e a justificativa da NR.", "Botão 'Revelar Resposta Correta':"),
      createBullet("Alterna a exibição do ranking parcial com os primeiros colocados.", "Botão 'Mostrar Ranking':"),
      createBullet("Finaliza a avaliação, calcula a nota de todos os participantes e gera os laudos no histórico.", "Botão 'Encerrar Prova':"),

      createHeading3("3.2.4 Aba 'Histórico de Avaliações SST'"),
      createParagraph("Janela de auditoria onde ficam armazenados permanentemente todos os laudos e resultados."),
      createBullet("Permite filtrar laudos por Nome do Aluno, CPF, Matrícula, Título do Treinamento ou Código de Documento.", "Barra de Pesquisa Geral:"),
      createBullet("Filtro por situação ('Todos', 'Aprovados', 'Reprovados').", "Botões de Filtro:"),
      createBullet("Abre o relatório visual com o gráfico de acertos por norma regulamentadora.", "Botão 'Ver Ficha / Detalhes':"),
      createBullet("Abre a pré-visualização e gera o PDF oficial do Laudo SST assinado digitalmente com QR Code de validação.", "Botão 'Ver Ficha / PDF':"),

      createHeading2("3.3 Módulo Banco de Perguntas (QuestionBankView)"),
      createParagraph("Repositório central de questões normativas e pedagógicas."),
      createBullet("Selecione a NR aplicável (NR-01, NR-06, NR-10, NR-12, NR-18, NR-33, NR-35, etc.).", "Filtro por Norma Regulamentadora:"),
      createBullet("Busque por palavras-chave no enunciado da questão.", "Campo de Busca de Questões:"),
      createBullet("Abre o formulário de inclusão com opções A, B, C, D, gabarito e explicação normativa.", "Botão '+ Nova Pergunta':"),
      createBullet("Permite carregar uma planilha de perguntas em massa.", "Botão 'Importar CSV':"),
      createBullet("Exporta todas as perguntas cadastradas para arquivo Excel/CSV.", "Botão 'Exportar CSV':"),

      createHeading2("3.4 Módulo Loja de Prêmios (PrizesView)"),
      createParagraph("Módulo de incentivo e engajamento dos colaboradores."),
      createBullet("Mostra os itens disponíveis, custo em pontos e quantidade restante.", "Vitrine de Prêmios:"),
      createBullet("Permite ao colaborador trocar seus pontos acumulados pelo item.", "Botão 'Resgatar Prêmio':"),
      createBullet("Exibe aba para cadastrar novos produtos, ajustar quantidade e aprovar entregas.", "Painel Administrativo da Loja:"),

      createHeading2("3.5 Módulo de Gestão de Empresas e Setores (AdminManagementView e SuperAdminView)"),
      createParagraph("Janela de controle estrutural e permissões corporativas."),
      createBullet("Crie setores da empresa e defina metas de treinamento.", "Aba Setores:"),
      createBullet("Cadastre funcionários, defina perfis de acesso e imprima credenciais com QR Code.", "Aba Usuários:"),
      createBullet("Abre o painel técnico de sincronização do Supabase, estatísticas de tabelas e políticas RLS.", "Modal Supabase (Super Admin):")
    ]
  }]
});

// --------------------------------------------------------------------------
// 2. GERAR GUIA TÉCNICO PARA DESENVOLVEDORES
// --------------------------------------------------------------------------
const devDoc = new Document({
  sections: [{
    properties: {},
    children: [
      createTitle("GUIA TÉCNICO E MANUAL DO DESENVOLVEDOR"),
      createSubtitle("Documentação de Arquitetura, Manutenção e Engenharia de Código — SST Quiz Corporate"),

      createHeading1("1. ARQUITETURA GERAL DA APLICAÇÃO"),
      createParagraph("O aplicativo é construído no modelo Full-Stack Híbrido com execução em contêiner Cloud Run na porta 3000."),
      createBullet("React 18 + TypeScript em conjunto com Vite 6.0.", "Frontend Framework:"),
      createBullet("Tailwind CSS v4 + Lucide React (sem CSS-in-JS legado).", "Estilização:"),
      createBullet("Node.js com Express e tsx para execução em tempo real.", "Servidor Backend:"),
      createBullet("Sincronização em nuvem via Supabase (PostgreSQL 15) com fallback para armazenamento local via IndexedDB / LocalStorage.", "Camada de Dados:"),
      createBullet("WebSockets via Supabase Realtime (Canais postgres_changes no schema public).", "Comunicação em Tempo Real:"),

      createHeading1("2. ESTRUTURA COMPLETA DE ARQUIVOS E DIRETÓRIOS"),
      createParagraph("O projeto adota uma estrutura modular focada em separação de responsabilidades:"),

      createHeading2("2.1 Arquivos Raiz"),
      createBullet("Servidor Express. Gerencia o proxy de desenvolvimento Vite, rotas de API REST (`/api/*`), envio de e-mail SMTP e tratamento de erros.", "server.ts:"),
      createBullet("Configurações de compilação, scripts de build (`npm run build`), start e dependências npm.", "package.json:"),
      createBullet("Declaração das variáveis de ambiente necessárias (GEMINI_API_KEY, APP_URL, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SMTP_*).", ".env.example:"),

      createHeading2("2.2 Módulo de Estado Global (`src/context/SSTContext.tsx`)"),
      createParagraph("O `SSTContext.tsx` é o coração da aplicação no frontend. Ele gerencia o estado reativo de todas as entidades e provê métodos de negócio:"),
      createBullet("Lista reativa de empresas e suas configurações de personalização.", "empresas:"),
      createBullet("Setores pertencentes às empresas.", "setores:"),
      createBullet("Usuários autenticados, colaboradores e perfis de instrutor.", "usuarios:"),
      createBullet("Banco de questões divididas por NR e categoria.", "perguntas:"),
      createBullet("Salas ativas de Quiz Guiado em tempo real.", "salasQuizGuiado:"),
      createBullet("Resultados das avaliações SST e histórico de laudos.", "resultadosAvaliacaoSST:"),
      createBullet("Lista de prêmios cadastrados na loja corporativa.", "premios:"),
      createBullet("Notificações internas e registros de auditoria.", "notificacoes e logs:"),

      createHeading2("2.3 Módulo de Comunicação com Banco (`src/services/`)"),
      createBullet("Instância única Singleton do cliente Supabase. Contém o validador `isSecretKey` que previne a injeção acidental de chaves `service_role` no navegador.", "src/lib/supabase.ts:"),
      createBullet("Funções CRUD para todas as entidades no Supabase com suporte a sincronização incremental.", "src/services/supabaseService.ts:"),
      createBullet("Driver de acesso ao IndexedDB para armazenamento assíncrono e suporte offline completo.", "src/services/idb.ts:"),
      createBullet("Métodos de autenticação, cadastro e recuperação de sessão via Supabase Auth.", "src/services/supabaseAuth.ts:"),

      createHeading1("3. ESQUEMA DAS TABELAS NO BANCO DE DADOS (POSTGRESQL / SUPABASE)"),

      createHeading2("3.1 Tabela `empresas`"),
      createParagraph("Armazena as organizações cadastradas no sistema."),
      createBullet("VARCHAR(50) - Chave Primária", "id:"),
      createBullet("VARCHAR(150) NOT NULL", "nome:"),
      createBullet("VARCHAR(20)", "cnpj:"),
      createBullet("VARCHAR(50)", "plano:"),
      createBullet("VARCHAR(20)", "cor_primaria:"),
      createBullet("TEXT", "logo_url:"),
      createBullet("BOOLEAN DEFAULT TRUE", "ativo:"),

      createHeading2("3.2 Tabela `salas_quiz_guiado`"),
      createParagraph("Controla as salas de prova criadas pelos instrutores."),
      createBullet("VARCHAR(50) - Chave Primária", "id:"),
      createBullet("VARCHAR(10) NOT NULL - Código de 6 dígitos", "pin:"),
      createBullet("VARCHAR(255) NOT NULL", "treinamento_titulo:"),
      createBullet("VARCHAR(50) REFERENCES empresas(id)", "empresa_id:"),
      createBullet("VARCHAR(50)", "instrutor_id:"),
      createBullet("VARCHAR(20) - 'aguardando', 'em_andamento', 'encerrado'", "status:"),
      createBullet("NUMERIC DEFAULT 7.0", "nota_minima_aprovacao:"),
      createBullet("INT DEFAULT 30", "tempo_por_pergunta:"),
      createBullet("JSONB DEFAULT '[]'", "perguntas:"),
      createBullet("JSONB DEFAULT '[]'", "participantes:"),

      createHeading2("3.3 Tabela `resultados_avaliacao_sst` (Desacoplada)"),
      createParagraph("Armazena o histórico permanente de laudos e notas dos participantes."),
      createBullet("VARCHAR(50) - Chave Primária", "id:"),
      createBullet("VARCHAR(50) REFERENCES salas_quiz_guiado(id) ON DELETE SET NULL", "sala_id:"),
      createBullet("TEXT - ID da empresa para isolamento autônomo RLS", "empresa_id:"),
      createBullet("TEXT - ID do instrutor responsável pelo laudo", "instrutor_id:"),
      createBullet("VARCHAR(150) NOT NULL", "participante_nome:"),
      createBullet("VARCHAR(50)", "matricula:"),
      createBullet("VARCHAR(50)", "cpf:"),
      createBullet("VARCHAR(255) NOT NULL", "treinamento_titulo:"),
      createBullet("NUMERIC NOT NULL", "nota_final:"),
      createBullet("VARCHAR(20) NOT NULL - 'APROVADO' / 'REPROVADO'", "situacao:"),
      createBullet("JSONB DEFAULT '[]'", "desempenho_por_tema:"),
      createBullet("JSONB DEFAULT '[]'", "respostas_detalhadas:"),
      createBullet("VARCHAR(100)", "codigo_documento:"),

      createHeading1("4. ROTAS DE API REST NO SERVIDOR EXPRESS (`server.ts`)"),
      createBullet("Verificação do estado de execução da aplicação e conectividade.", "GET /api/health:"),
      createBullet("Retorna a lista de salas ativas de quiz guiado.", "GET /api/salas_quiz_guiado:"),
      createBullet("Busca os detalhes de uma sala específica filtrada pelo PIN de 6 dígitos.", "GET /api/salas_quiz_guiado/pin/:pin:"),
      createBullet("Recebe a resposta enviada por um participante e atualiza seu estado no quiz em tempo real.", "POST /api/salas_quiz_guiado/responder:"),
      createBullet("Salva ou atualiza um laudo de avaliação no histórico.", "POST /api/resultados_avaliacao_sst:"),
      createBullet("Envio de laudos ou instruções por e-mail via transporte Nodemailer SMTP.", "POST /api/enviar-email:"),

      createHeading1("5. GUIA DE SOLUÇÃO DE PROBLEMAS E MANUTENÇÃO"),
      createHeading2("5.1 Erro: 'Forbidden use of secret API key in browser'"),
      createParagraph("Causa: A chave `service_role` do Supabase foi configurada por engano no navegador. O módulo `src/lib/supabase.ts` intercepta e limpa essa chave automaticamente. Solução: Certifique-se de usar apenas a chave `anon (public)` no frontend."),

      createHeading2("5.2 Preservação do Histórico na Exclusão de Salas"),
      createParagraph("As avaliações em `resultados_avaliacao_sst` são totalmente desacopladas. Ao excluir uma sala da tabela `salas_quiz_guiado`, o campo `sala_id` torna-se `NULL`, mas os registros de laudo, notas e PDFs permanecem preservados graças aos campos autônomos `empresa_id` e `instrutor_id`."),

      createHeading2("5.3 Procedimento para Adicionar uma Nova Norma Regulamentadora (NR)"),
      createParagraph("1. Adicione a nova constante na lista de NRs em `src/types.ts`.\n2. Atualize os componentes de filtro em `QuestionBankView.tsx` e `CriarSalaModal.tsx`.\n3. Nenhuma alteração no banco de dados é necessária, pois a coluna `norma_regulamentadora` é do tipo texto.")
    ]
  }]
});

// Salva os documentos
Promise.all([
  Packer.toBuffer(userDoc).then(buffer => {
    const userPath = path.join(publicDir, 'Manual_do_Usuario_SST_Quiz_Corporate.docx');
    fs.writeFileSync(userPath, buffer);
    console.log('✅ Manual do Usuário salvo em:', userPath);
  }),
  Packer.toBuffer(devDoc).then(buffer => {
    const devPath = path.join(publicDir, 'Guia_Tecnico_Programador_SST_Quiz_Corporate.docx');
    fs.writeFileSync(devPath, buffer);
    console.log('✅ Guia Técnico salvo em:', devPath);
  })
]).then(() => {
  console.log('🎉 Todos os documentos Word foram gerados com sucesso!');
}).catch(err => {
  console.error('❌ Erro ao gerar documentos Word:', err);
});
