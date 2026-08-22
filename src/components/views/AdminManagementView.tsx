// ============================================================
// AdminManagementView - Painel de Gestão Administrativa SST
// ============================================================
// Tela destinada ao administrador/gestor da empresa. Permite:
// gerenciar colaboradores/usuários (CRUD, ativação, senhas),
// setores (CRUD e importação em lote), campanhas de quizzes,
// regras de gamificação, resets de ranking/temporadas e
// importação/exportação de dados via CSV.
// ============================================================

// Importações do React: hooks para estado, efeitos e refs
import React, { useState, useEffect, useRef } from 'react';
// Contexto global SST: fornece os dados e ações de negócio (usuários, setores, campanhas, etc.)
import { useSST } from '../../context/SSTContext';
// Tipagens usadas nos formulários e estados de edição
import { Usuario, Setor, Campanha, ConfiguracoesTrofeus, RegraTrofeu } from '../../types';
// Utilitários compartilhados de troféus (galeria, dicas e categorias)
import { TROFEU_GALERIA, emojiTrofeu, eImagemRealTrofeu, DICAS_TROFEUS, CATEGORIAS_TROFEUS } from '../../utils/trofeusHelpers';
// Tela de relatórios de participação, conformidade e conhecimento
import { RelatoriosView } from './RelatoriosView';
import { SecurityConfirmModal } from '../SecurityConfirmModal';
import { CameraCaptureModal } from '../CameraCaptureModal';
import { ImportPreviewModal } from '../ImportPreviewModal';
// Utilitários: validação de e-mail e compactação de imagem (upload de avatar)
import { validarEmail } from '../../utils/validators';
import { compressImageFile } from '../../utils/imageCompressor';
// Utilitários de CSV: geração de modelos, exportação e importação de usuários/setores
import { 
  triggerDownloadCSV,
  generateCSVTemplateUsuarios,
  exportUsuariosToCSV,
  parseUsuariosCSV,
  generateCSVTemplateSetores,
  exportSetoresToCSV,
  parseSetoresCSV
} from '../../utils/csvHelpers';
// Ícones da biblioteca lucide-react usados em botões e cabeçalhos da interface
import { 
  Calendar, 
  Plus, 
  Users, 
  AlertTriangle, 
  Settings, 
  CheckCircle2,
  UserPlus,
  FolderPlus,
  Building2,
  Mail,
  CheckSquare,
  Square,
  Trash2,
  Pencil,
  X,
  Camera,
  Image as ImageIcon,
  Upload,
  Download,
  FileSpreadsheet,
  Swords,
  Trophy,
  RotateCcw,
  Layers,
  BarChart3
} from 'lucide-react';

// Avatares padrão (presets) oferecidos no cadastro/edição de usuário
const PRESET_AVATARS = [
  { label: 'Avatar Homem', gender: 'Homem', url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250' },
  { label: 'Avatar Mulher', gender: 'Mulher', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250' },
];

// Componente principal da tela de administração
export const AdminManagementView: React.FC = () => {
  // Desestruturação do contexto useSST: estado global (empresa, setores, usuários, campanhas)
  // e ações de negócio que alimentam toda a gestão administrativa desta tela
  const { 
    currentUser,
    empresa, 
    empresas,
    setEmpresa, 
    setores, 
    usuarios, 
    campanhas, 
    criarCampanha, 
    editarCampanha,
    excluirCampanha,
    getRankingsSetores,
    adicionarUsuario,
    adicionarUsuariosLote,
    editarUsuario,
    excluirUsuario,
    adicionarSetor,
    adicionarSetoresLote,
    editarSetor,
    excluirSetor,
    editarEmpresa,
    perguntas,
    quizzes,
    desafios,
    resetarTabelaDesafios1v1,
    resetarPontuacaoEmpresa,
    resetarPontuacaoEmpresaPreservarPontos,
    encerrarEIniciarNovaTemporada
  } = useSST();

  // Estado do modal de confirmação de segurança (exclusão/edição de itens)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    itemName: string;
    actionType: 'delete' | 'edit';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    itemName: '',
    actionType: 'delete',
    onConfirm: () => {},
  });

  // Estados de pré-visualização de importação CSV
  const [showPreviewModalUsuarios, setShowPreviewModalUsuarios] = useState(false);
  const [previewDataUsuarios, setPreviewDataUsuarios] = useState<{ items: any[]; errors: string[] } | null>(null);

  const [showPreviewModalSetores, setShowPreviewModalSetores] = useState(false);
  const [previewDataSetores, setPreviewDataSetores] = useState<{ items: any[]; errors: string[] } | null>(null);

  // Flags de controle dos modais de criação (campanha, config, usuário e setor)
  const [showNovaCampanhaModal, setShowNovaCampanhaModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showRelatoriosModal, setShowRelatoriosModal] = useState(false);
  const [showNovoUsuarioModal, setShowNovoUsuarioModal] = useState(false);
  const [showNovoSetorModal, setShowNovoSetorModal] = useState(false);
  
  // Estados dos modais e dados de importação CSV em lote (texto, erros e sucessos)
  const [showCSVUsuariosModal, setShowCSVUsuariosModal] = useState(false);
  const [showCSVSetoresModal, setShowCSVSetoresModal] = useState(false);
  const [csvTextUsuarios, setCsvTextUsuarios] = useState('');
  const [csvTextSetores, setCsvTextSetores] = useState('');
  const [csvErrorMsgUsuarios, setCsvErrorMsgUsuarios] = useState('');
  const [csvSuccessMsgUsuarios, setCsvSuccessMsgUsuarios] = useState('');
  const [csvErrorMsgSetores, setCsvErrorMsgSetores] = useState('');
  const [csvSuccessMsgSetores, setCsvSuccessMsgSetores] = useState('');

  // Mensagem de feedback exibida após ações de reset (tabela 1x1, pontuação, ranking)
  const [resetFeedbackMsg, setResetFeedbackMsg] = useState('');

  // Registro que está sendo editado atualmente (abre o modal de edição)
  const [usuarioParaEditar, setUsuarioParaEditar] = useState<Usuario | null>(null);
  const [setorParaEditar, setSetorParaEditar] = useState<Setor | null>(null);

  // Campos do formulário de cadastro/edição de usuário
  const [nomeUser, setNomeUser] = useState('');
  const [emailUser, setEmailUser] = useState('');
  const [senhaUser, setSenhaUser] = useState('');
  const [confirmSenhaUser, setConfirmSenhaUser] = useState('');
  const [avatarUser, setAvatarUser] = useState('');
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [userErrorMsg, setUserErrorMsg] = useState('');
  const [cargoUser, setCargoUser] = useState('');
  const [setorIdUser, setSetorIdUser] = useState(setores[0]?.id || '');
  const [perfilUser, setPerfilUser] = useState<'colaborador' | 'admin' | 'super_admin'>('colaborador');
  const [isInstrutorUser, setIsInstrutorUser] = useState(false);

  // Refs para inputs de arquivo (galeria de avatar e uploads de CSV)
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const editGalleryInputRef = useRef<HTMLInputElement>(null);
  const csvUsuariosFileInputRef = useRef<HTMLInputElement>(null);
  const csvSetoresFileInputRef = useRef<HTMLInputElement>(null);

  // Handler de upload da foto do usuário: valida tamanho (máx. 10MB),
  // compacta a imagem e armazena como dataURL no estado avatarUser
  const handleFileUploadUser = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setUserErrorMsg('A imagem deve ter no máximo 10MB.');
        return;
      }
      try {
        const compressed = await compressImageFile(file, 400, 400, 0.82);
        setAvatarUser(compressed);
        setUserErrorMsg('');
      } catch (err: any) {
        setUserErrorMsg('Erro ao processar imagem da galeria.');
      }
    }
    e.target.value = '';
  };

  // Campos do formulário de cadastro/edição de setor
  const [nomeSetor, setNomeSetor] = useState('');
  const [setorErrorMsg, setSetorErrorMsg] = useState('');

  // Campos do formulário de criação de campanha
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [descCampanha, setDescCampanha] = useState('');
  const [freqCampanha, setFreqCampanha] = useState<'diaria' | 'semanal' | 'personalizada'>('diaria');
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [horarioInicio, setHorarioInicio] = useState('08:00');
  const [dataFim, setDataFim] = useState(new Date(Date.now() + 30*86400000).toISOString().split('T')[0]);
  const [selectedPerguntaIds, setSelectedPerguntaIds] = useState<string[]>([]);
  const [campanhaErrorMsg, setCampanhaErrorMsg] = useState('');

  // Filtros de busca/categoria/dificuldade aplicados ao banco de perguntas do modal de campanha
  const [campPerguntaBusca, setCampPerguntaBusca] = useState('');
  const [campCategoriaFiltro, setCampCategoriaFiltro] = useState('todas');
  const [campDificuldadeFiltro, setCampDificuldadeFiltro] = useState('todas');

  // Alterna a seleção de uma pergunta na lista do modal de campanha (marca/desmarca)
  const toggleSelectPergunta = (id: string) => {
    if (selectedPerguntaIds.includes(id)) {
      setSelectedPerguntaIds(prev => prev.filter(pId => pId !== id));
    } else {
      setSelectedPerguntaIds(prev => [...prev, id]);
    }
  };

  // ============================================================
  // Formulário de Configurações / Regras Globais de Gamificação
  // ============================================================
  // Estados espelhados das configurações da empresa (temporada, pontos,
  // bônus, cotas amistosas, elegibilidade) usados no modal "Regras de Gamificação"
  const [limiteDesafios, setLimiteDesafios] = useState(empresa.configuracoes.limiteDesafiosSemana || 5);
  const [pontosDesafio, setPontosDesafio] = useState(empresa.configuracoes.pontosVitoriaDesafio || 50);
  const [pctMinimo, setPctMinimo] = useState(empresa.configuracoes.percentualMinimoParticipacao || 50);
  const [nomeTemporadaConfig, setNomeTemporadaConfig] = useState(empresa.configuracoes.nome_temporada_atual || '1ª Temporada Oficial SST');
  const [dataInicioTemporada, setDataInicioTemporada] = useState(empresa.configuracoes.data_inicio_temporada || new Date().toISOString().split('T')[0]);
  const [dataFimTemporada, setDataFimTemporada] = useState(empresa.configuracoes.data_fim_temporada || new Date(Date.now() + 90*86400000).toISOString().split('T')[0]);
  const [cotaColabConfig, setCotaColabConfig] = useState(empresa.configuracoes.cota_desafios_colaborador || 4);
  const [pontosVitoriaAmistosoConfig, setPontosVitoriaAmistosoConfig] = useState(empresa.configuracoes.pontosVitoriaAmistoso ?? 50);
  const [pontosDerrotaAmistosoConfig, setPontosDerrotaAmistosoConfig] = useState(empresa.configuracoes.pontosDerrotaAmistoso ?? 25);
  const [pontosPorAcertoQuizConfig, setPontosPorAcertoQuizConfig] = useState(empresa.configuracoes.pontosPorAcertoQuiz ?? 10);
  const [bonusVelocidadeMaxConfig, setBonusVelocidadeMaxConfig] = useState(empresa.configuracoes.bonusVelocidadeMax ?? 3);
  const [bonusStreakMaxConfig, setBonusStreakMaxConfig] = useState(empresa.configuracoes.bonusStreakMax ?? 10);
  const [permitirAmistososConfig, setPermitirAmistososConfig] = useState(empresa.configuracoes.permitirAmistosos ?? true);
  const [permitirMesmoSetorAmistosoConfig, setPermitirMesmoSetorAmistosoConfig] = useState(empresa.configuracoes.permitirMesmoSetorAmistoso ?? true);
  // Flag de confirmação do rollover de temporada e mensagem de erro do formulário
  const [confirmarRolloverTemp, setConfirmarRolloverTemp] = useState(false);
  const [configErrorMsg, setConfigErrorMsg] = useState('');

  // ============================================================
  // Regras de Troféus (niveis/tiers configuráveis pelo Admin)
  // ============================================================
  // Estado espelhado das regras de troféus da empresa. Cada regra
  // (vitoriasTotais, winStreak, etc.) guarda uma LISTA de níveis:
  // [{ meta, trofeuId, imagem, nome }]. O Admin pode adicionar,
  // editar e remover quantos degraus quiser (10, 30, 50 vitórias...).
  const [regrasTrofeusState, setRegrasTrofeusState] = useState<ConfiguracoesTrofeus>(() => ({
    vitoriasTotais: (empresa.configuracoes as any).regrasTrofeus?.vitoriasTotais || [],
    winStreak: (empresa.configuracoes as any).regrasTrofeus?.winStreak || [],
    acertosTotais: (empresa.configuracoes as any).regrasTrofeus?.acertosTotais || [],
    defesasImbativel: (empresa.configuracoes as any).regrasTrofeus?.defesasImbativel || [],
    recuperacoesEpicas: (empresa.configuracoes as any).regrasTrofeus?.recuperacoesEpicas || [],
    veteranoSST: (empresa.configuracoes as any).regrasTrofeus?.veteranoSST || [],
  }));

  // Atualiza um campo específico de um nível de troféu
  const atualizarNivelTrofeu = (categoria: keyof ConfiguracoesTrofeus, index: number, campo: Partial<RegraTrofeu>) => {
    setRegrasTrofeusState(prev => {
      const lista = (prev[categoria] || []) as RegraTrofeu[];
      const novaLista = lista.map((nivel, i) => i === index ? { ...nivel, ...campo } : nivel);
      return { ...prev, [categoria]: novaLista };
    });
  };

  // Adiciona um novo nível (degrau) de troféu na categoria
  const adicionarNivelTrofeu = (categoria: keyof ConfiguracoesTrofeus) => {
    setRegrasTrofeusState(prev => {
      const lista = (prev[categoria] || []) as RegraTrofeu[];
      return {
        ...prev,
        [categoria]: [
          ...lista,
          {
            meta: 0,
            trofeuId: `trofeu-${categoria}-${Date.now()}-${lista.length}`,
            imagem: 'medalha_bronze',
            nome: '',
            ativo: true,
            modoContagem: categoria === 'winStreak' ? 'sequencial' : 'acumulado',
            mostrarProgresso: true,
            limiteProximidade: 3,
            ...(categoria === 'defesasImbativel' ? { gatilhoDefesa: 'desafiado' as const } : {}),
          },
        ],
      };
    });
  };

  // Remove um nível de troféu da categoria
  const removerNivelTrofeu = (categoria: keyof ConfiguracoesTrofeus, index: number) => {
    setRegrasTrofeusState(prev => {
      const lista = (prev[categoria] || []) as RegraTrofeu[];
      return { ...prev, [categoria]: lista.filter((_, i) => i !== index) };
    });
  };

  // Sincroniza as regras de troféus quando a empresa muda no contexto
  useEffect(() => {
    if (empresa && empresa.configuracoes) {
      const rt = (empresa.configuracoes as any).regrasTrofeus || {};
      setRegrasTrofeusState({
        vitoriasTotais: rt.vitoriasTotais || [],
        winStreak: rt.winStreak || [],
        acertosTotais: rt.acertosTotais || [],
        defesasImbativel: rt.defesasImbativel || [],
        recuperacoesEpicas: rt.recuperacoesEpicas || [],
        veteranoSST: rt.veteranoSST || [],
      });
    }
  }, [empresa]);

  // Sincroniza os campos do formulário de configurações sempre que o objeto
  // "empresa" muda no contexto (mantém os valores exibidos atualizados)
  useEffect(() => {
    if (empresa && empresa.configuracoes) {
      setLimiteDesafios(empresa.configuracoes.limiteDesafiosSemana || 5);
      setPontosDesafio(empresa.configuracoes.pontosVitoriaDesafio || 50);
      setPctMinimo(empresa.configuracoes.percentualMinimoParticipacao || 50);
      setNomeTemporadaConfig(empresa.configuracoes.nome_temporada_atual || '1ª Temporada Oficial SST');
      setDataInicioTemporada(empresa.configuracoes.data_inicio_temporada || new Date().toISOString().split('T')[0]);
      setDataFimTemporada(empresa.configuracoes.data_fim_temporada || new Date(Date.now() + 90*86400000).toISOString().split('T')[0]);
      setCotaColabConfig(empresa.configuracoes.cota_desafios_colaborador || 4);
      setPontosVitoriaAmistosoConfig(empresa.configuracoes.pontosVitoriaAmistoso ?? 50);
      setPontosDerrotaAmistosoConfig(empresa.configuracoes.pontosDerrotaAmistoso ?? 25);
      setPontosPorAcertoQuizConfig(empresa.configuracoes.pontosPorAcertoQuiz ?? 10);
      setBonusVelocidadeMaxConfig(empresa.configuracoes.bonusVelocidadeMax ?? 3);
      setBonusStreakMaxConfig(empresa.configuracoes.bonusStreakMax ?? 10);
      setPermitirAmistososConfig(empresa.configuracoes.permitirAmistosos ?? true);
      setPermitirMesmoSetorAmistosoConfig(empresa.configuracoes.permitirMesmoSetorAmistoso ?? true);
    }
  }, [empresa]);

  // Rankings calculados por setor (via contexto) usados na seção de participação setorial
  const rankingsSetores = getRankingsSetores();

  // ============================================================
  // Handler de Criação de Usuário
  // ============================================================
  // Valida nome, e-mail corporativo, confirmação e tamanho mínimo de senha
  // antes de chamar adicionarUsuario do contexto e resetar o formulário
  const handleSalvarUsuario = (e: React.FormEvent) => {
    e.preventDefault();
    setUserErrorMsg('');

    if (!nomeUser.trim()) {
      setUserErrorMsg('Por favor, informe o nome completo do usuário.');
      return;
    }

    if (!emailUser.trim() || !validarEmail(emailUser)) {
      setUserErrorMsg('E-mail inválido! Digite um endereço de e-mail corporativo válido (ex: nome@empresa.com.br).');
      return;
    }

    if (senhaUser && confirmSenhaUser && senhaUser !== confirmSenhaUser) {
      setUserErrorMsg('As senhas digitadas não coincidem! Verifique e repita a senha corretamente.');
      return;
    }

    if (senhaUser && senhaUser.trim().length < 6) {
      setUserErrorMsg('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    adicionarUsuario({
      nome: nomeUser.trim(),
      email: emailUser.trim(),
      senha: senhaUser.trim() || undefined,
      cargo: cargoUser.trim() || 'Colaborador SST',
      empresa_id: empresa.id,
      setor_id: setorIdUser || setores[0]?.id || 'set-1',
      perfil: perfilUser,
      is_instrutor: isInstrutorUser,
      avatar: avatarUser || PRESET_AVATARS[0].url,
    });

    setShowNovoUsuarioModal(false);
    setNomeUser('');
    setEmailUser('');
    setSenhaUser('');
    setConfirmSenhaUser('');
    setAvatarUser('');
    setCargoUser('');
    setUserErrorMsg('');
  };

  // ============================================================
  // Handler de Importação em Lote de Usuários via CSV
  // ============================================================
  // Faz o parse do texto CSV (parseUsuariosCSV) e chama adicionarUsuariosLote
  // para cadastrar/atualizar vários usuários de uma vez; exibe resumo de sucesso
  const handleImportarCSVUsuarios = (e: React.FormEvent) => {
    e.preventDefault();
    setCsvErrorMsgUsuarios('');
    setCsvSuccessMsgUsuarios('');

    if (!csvTextUsuarios.trim()) {
      setCsvErrorMsgUsuarios('Cole o conteúdo CSV para importar.');
      return;
    }

    const { items: importados, errors } = parseUsuariosCSV(csvTextUsuarios);

    if (importados.length > 0) {
      setPreviewDataUsuarios({ items: importados, errors });
      setShowPreviewModalUsuarios(true);
    } else {
      const errorDetail = errors.length > 0 ? errors.join(' ') : 'Nenhum usuário válido encontrado. Verifique se o formato do CSV está correto.';
      setCsvErrorMsgUsuarios(errorDetail);
    }
  };

  const handleConfirmarImportacaoUsuarios = () => {
    if (!previewDataUsuarios) return;
    const { items: importados, errors } = previewDataUsuarios;
    const { cadastrados, atualizados } = adicionarUsuariosLote(importados);
    let successMsg = `Processamento concluído com sucesso! ${cadastrados} novo(s) usuário(s) cadastrado(s) e ${atualizados} usuário(s) existente(s) atualizado(s).`;
    if (errors.length > 0) {
      successMsg += ` (${errors.length} linha(s) ignoradas por erro de formato: ${errors.slice(0, 3).join('; ')})`;
    }
    setCsvSuccessMsgUsuarios(successMsg);
    setShowPreviewModalUsuarios(false);
    setPreviewDataUsuarios(null);
  };

  // ============================================================
  // Handler de Importação em Lote de Setores via CSV
  // ============================================================
  // Faz o parse do texto CSV (parseSetoresCSV) e chama adicionarSetoresLote,
  // cadastrando vários setores de uma só vez
  const handleImportarCSVSetores = (e: React.FormEvent) => {
    e.preventDefault();
    setCsvErrorMsgSetores('');
    setCsvSuccessMsgSetores('');

    if (!csvTextSetores.trim()) {
      setCsvErrorMsgSetores('Cole o conteúdo CSV para importar.');
      return;
    }

    const { items: setoresImportados, errors } = parseSetoresCSV(csvTextSetores);

    if (setoresImportados.length > 0) {
      setPreviewDataSetores({ items: setoresImportados, errors });
      setShowPreviewModalSetores(true);
    } else {
      const errorDetail = errors.length > 0 ? errors.join(' ') : 'Nenhum setor válido foi encontrado no CSV.';
      setCsvErrorMsgSetores(errorDetail);
    }
  };

  const handleConfirmarImportacaoSetores = () => {
    if (!previewDataSetores) return;
    const { items: setoresImportados, errors } = previewDataSetores;
    adicionarSetoresLote(setoresImportados);
    let successMsg = `${setoresImportados.length} setor(es) importado(s) com sucesso!`;
    if (errors.length > 0) {
      successMsg += ` (${errors.length} linha(s) ignoradas: ${errors.slice(0, 3).join('; ')})`;
    }
    setCsvSuccessMsgSetores(successMsg);
    setShowPreviewModalSetores(false);
    setPreviewDataSetores(null);
  };

  // ============================================================
  // Handler de Criação de Setor
  // ============================================================
  // Valida o nome informado e chama adicionarSetor do contexto
  const handleSalvarSetor = (e: React.FormEvent) => {
    e.preventDefault();
    setSetorErrorMsg('');

    if (!nomeSetor.trim()) {
      setSetorErrorMsg('Por favor, informe o nome do setor.');
      return;
    }

    adicionarSetor(nomeSetor.trim());
    setShowNovoSetorModal(false);
    setNomeSetor('');
    setSetorErrorMsg('');
  };

  // ============================================================
  // Handler de Criação de Campanha
  // ============================================================
  // Monta a data/hora de início, seleciona as perguntas da empresa
  // (escolhidas ou as 5 primeiras por padrão) e chama criarCampanha
  const handleSalvarCampanha = (e: React.FormEvent) => {
    e.preventDefault();
    setCampanhaErrorMsg('');

    if (!nomeCampanha.trim()) {
      setCampanhaErrorMsg('Por favor, informe o nome da campanha.');
      return;
    }

    const fullDataInicio = horarioInicio ? `${dataInicio}T${horarioInicio}` : dataInicio;

    const perguntasDaEmpresa = perguntas.filter(p => p.empresa_id === empresa.id);

    criarCampanha({
      nome: nomeCampanha.trim(),
      descricao: descCampanha.trim(),
      empresa_id: empresa.id,
      frequencia: freqCampanha,
      data_inicio: fullDataInicio,
      data_fim: dataFim,
      ativa: true,
      pergunta_ids: selectedPerguntaIds.length > 0 ? selectedPerguntaIds : perguntasDaEmpresa.slice(0, 5).map(p => p.id),
      quantidade_perguntas: selectedPerguntaIds.length > 0 ? selectedPerguntaIds.length : 5,
    });

    setShowNovaCampanhaModal(false);
    setNomeCampanha('');
    setDescCampanha('');
    setSelectedPerguntaIds([]);
    setCampanhaErrorMsg('');
  };

  // ============================================================
  // Handler de Salvamento das Configurações da Empresa
  // ============================================================
  // Valida temporada, datas, cotas e pontos antes de persistir o objeto
  // novaConfig através de editarEmpresa (atualiza regras de gamificação)
  const handleSalvarConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigErrorMsg('');

    if (!nomeTemporadaConfig.trim()) {
      setConfigErrorMsg('Por favor, informe o nome da temporada vigente.');
      return;
    }

    if (!dataInicioTemporada || !dataFimTemporada) {
      setConfigErrorMsg('As datas de início e término da temporada são obrigatórias.');
      return;
    }

    if (new Date(dataInicioTemporada) > new Date(dataFimTemporada)) {
      setConfigErrorMsg('A data de início da temporada não pode ser posterior à data de término.');
      return;
    }

    if (isNaN(cotaColabConfig) || cotaColabConfig < 1) {
      setConfigErrorMsg('A cota de desafios amistosos deve ser um número maior ou igual a 1.');
      return;
    }

    if (isNaN(pontosVitoriaAmistosoConfig) || pontosVitoriaAmistosoConfig < 0) {
      setConfigErrorMsg('Os pontos de vitória no Modo Amistoso devem ser um número maior ou igual a 0.');
      return;
    }

    if (isNaN(pontosDerrotaAmistosoConfig) || pontosDerrotaAmistosoConfig < 0) {
      setConfigErrorMsg('Os pontos perdidos por derrota no Modo Amistoso devem ser um número maior ou igual a 0.');
      return;
    }

    if (isNaN(pontosDesafio) || pontosDesafio < 1) {
      setConfigErrorMsg('Os pontos de vitória em desafio devem ser um número maior que 0.');
      return;
    }

    if (isNaN(pctMinimo) || pctMinimo < 1 || pctMinimo > 100) {
      setConfigErrorMsg('O percentual mínimo de participação deve ser um valor entre 1% e 100%.');
      return;
    }

    const novaConfig = {
      ...empresa.configuracoes,
      limiteDesafiosSemana: limiteDesafios,
      pontosVitoriaDesafio: pontosDesafio,
      percentualMinimoParticipacao: pctMinimo,
      nome_temporada_atual: nomeTemporadaConfig.trim(),
      data_inicio_temporada: dataInicioTemporada,
      data_fim_temporada: dataFimTemporada,
      cota_desafios_colaborador: cotaColabConfig,
      pontosVitoriaAmistoso: pontosVitoriaAmistosoConfig,
      pontosDerrotaAmistoso: pontosDerrotaAmistosoConfig,
      pontosPorAcertoQuiz: pontosPorAcertoQuizConfig,
      bonusVelocidadeMax: bonusVelocidadeMaxConfig,
      bonusStreakMax: bonusStreakMaxConfig,
      permitirAmistosos: permitirAmistososConfig,
      permitirMesmoSetorAmistoso: permitirMesmoSetorAmistosoConfig,
      // Regras de Troféus configuráveis (níveis/tiers)
      regrasTrofeus: regrasTrofeusState,
    };

    // REATIVAÇÃO DE REGRAS DE TROFÉU:
    // Se uma regra estava desativada (ativo:false) e foi reativada agora,
    // quem JÁ tem o troféu continua com ele; quem NÃO tem começa a sequência
    // do zero (modo sequencial). Isso evita que alguém reative uma regra e já
    // receba troféus por progresso de uma época em que a regra estava "desligada".
    const regrasAntigas = (empresa as any).configuracoes?.regrasTrofeus || {};
    const regrasNovas = regrasTrofeusState || {};
    const nomesTrofeusNovos = new Set<string>();
    (Object.values(regrasNovas) as RegraTrofeu[][]).forEach((lista: RegraTrofeu[]) =>
      lista.forEach((r: RegraTrofeu) => nomesTrofeusNovos.add(r.nome))
    );

    let regraReativada = false;
    (Object.keys(regrasAntigas) as (keyof ConfiguracoesTrofeus)[]).forEach(cat => {
      const antigaLista = (regrasAntigas[cat] || []) as RegraTrofeu[];
      const novaLista = (regrasNovas[cat] || []) as RegraTrofeu[];
      antigaLista.forEach((regraAntiga, idx) => {
        const regraNova = novaLista.find(r => r.nome === regraAntiga.nome);
        if (regraAntiga.ativo === false && regraNova && regraNova.ativo !== false) {
          regraReativada = true;
          // Zera a sequência de todos os usuários que ainda não conquistaram este troféu.
          usuarios.forEach(u => {
            const jaTem = (u.estatisticas.trofeus_conquistados || []).some(t => t.nome === regraAntiga.nome);
            if (jaTem) return;
            let novoUser: Usuario | null = null;
            if (cat === 'winStreak') {
              novoUser = { ...u, estatisticas: { ...u.estatisticas, streak_dias: 0 } };
            } else if (cat === 'acertosTotais') {
              novoUser = { ...u, estatisticas: { ...u.estatisticas, sequencia_acertos: 0 } };
            } else if (cat === 'defesasImbativel') {
              novoUser = { ...u, estatisticas: { ...u.estatisticas, sequencia_defesas: 0 } };
            } else if (cat === 'vitoriasTotais') {
              novoUser = { ...u, estatisticas: { ...u.estatisticas, sequencia_vitorias: 0 } };
            }
            if (novoUser) editarUsuario(u.id, novoUser);
          });
        }
      });
    });

    editarEmpresa(empresa.id, { configuracoes: novaConfig });
    setShowConfigModal(false);
    if (regraReativada) {
      setResetFeedbackMsg('Regras de troféus salvas! Troféus de regras reativadas foram reiniciados para colaboradores que ainda não os conquistaram.');
    }
  };

  // Lista de usuários exibida na tela, filtrada pela empresa atual.
  // Para super_admin, inclui também os outros super admins globais.
  // Permite vinculação robusta por empresa.id, currentUser.empresa_id ou fallback quando há 1 empresa.
  const usuariosEmpresa = usuarios.filter(u => {
    const pertencaEmpresa = 
      u.empresa_id === empresa.id || 
      u.empresa_id === currentUser.empresa_id || 
      (!u.empresa_id && empresas.length <= 1);

    if (currentUser.perfil === 'super_admin') {
      return u.perfil === 'super_admin' || pertencaEmpresa;
    }
    return pertencaEmpresa && u.perfil !== 'super_admin';
  });

  // ============================================================
  // Renderização da interface (JSX)
  // ============================================================
  return (
    <div className="space-y-6 pb-12">
      
      {/* ===== Cabeçalho (Banner) do Painel ===== */}
      {/* Mostra o nome da empresa e o título da tela de gestão */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-blue-950/80 backdrop-blur-xl border border-indigo-500/30 rounded-2xl p-6 text-white shadow-2xl flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-300 rounded-xl border border-indigo-500/40 backdrop-blur-md">
              <Building2 className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">{empresa.nome}</h1>
              <p className="text-xs text-indigo-200/80 mt-0.5">
                Painel do Administrador • Gestão de Usuários, Setores, Campanhas e Importação/Exportação CSV
              </p>
            </div>
          </div>
        </div>

        {/* Botões de ação do cabeçalho: abrir regras de gamificação e nova campanha */}
        <div className="flex items-center space-x-2 flex-wrap gap-2">
          <button
            onClick={() => setShowConfigModal(true)}
            className="bg-white/5 hover:bg-white/10 text-slate-200 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-white/10 backdrop-blur-md flex items-center space-x-2 transition-all"
          >
            <Settings className="w-4 h-4 text-indigo-400" />
            <span>Regras de Gamificação</span>
          </button>

          <button
            onClick={() => setShowRelatoriosModal(true)}
            className="bg-white/5 hover:bg-white/10 text-slate-200 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-white/10 backdrop-blur-md flex items-center space-x-2 transition-all"
            title="Ver relatórios de participação, conformidade e conhecimento"
          >
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>Relatórios</span>
          </button>

          <button
            onClick={() => setShowNovaCampanhaModal(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Campanha</span>
          </button>
        </div>
      </div>

      {/* ===== Seção: Gestão de Colaboradores (Usuários) ===== */}
      {/* Lista os colaboradores da empresa com botões de CSV (modelo, exportar, importar) e novo usuário */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
              <Users className="w-5 h-5 text-emerald-400" />
              <span>Colaboradores Cadastrados ({usuariosEmpresa.length})</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Gestão de perfil, e-mail, foto, redefinição de senhas e importação/exportação em lote
            </p>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-2">
            {/* Baixa o modelo de planilha CSV de usuários */}
            <button
              onClick={() => triggerDownloadCSV('modelo_usuarios_sst.csv', generateCSVTemplateUsuarios())}
              className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition-all"
              title="Baixar modelo de planilha de usuários em CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Modelo CSV</span>
            </button>

            {/* Exporta os colaboradores da empresa para arquivo CSV */}
            <button
              onClick={() => triggerDownloadCSV('usuarios_empresa_sst.csv', exportUsuariosToCSV(usuariosEmpresa, setores))}
              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition-all"
              title="Exportar colaboradores para planilha CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>

            {/* Abre o modal de importação em lote de usuários via CSV */}
            <button
              onClick={() => {
                setCsvErrorMsgUsuarios('');
                setCsvSuccessMsgUsuarios('');
                setShowCSVUsuariosModal(true);
              }}
              className="bg-white/10 hover:bg-white/20 text-slate-200 border border-white/10 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition-all"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>Importar CSV</span>
            </button>

            {/* Abre o modal de cadastro de novo usuário com formulário limpo */}
            <button
              onClick={() => {
                setNomeUser('');
                setEmailUser('');
                setSenhaUser('');
                setConfirmSenhaUser('');
                setAvatarUser('');
                setCargoUser('');
                setPerfilUser('colaborador');
                setIsInstrutorUser(false);
                setUserErrorMsg('');
                setShowNovoUsuarioModal(true);
              }}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black px-3.5 py-1.5 rounded-xl shadow-md flex items-center space-x-1.5 transition-all"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Novo Usuário</span>
            </button>
          </div>
        </div>

        {/* Grade de cards com os colaboradores cadastrados */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {usuariosEmpresa.map((u) => {
            // Localiza o objeto do setor do usuário para exibir o nome
            const setorObj = setores.find(s => s.id === u.setor_id);
            return (
              <div 
                key={u.id}
                className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-xl p-3.5 flex items-center space-x-3 hover:border-emerald-500/40 transition-all"
              >
                {/* Avatar do colaborador */}
                <img 
                  src={u.avatar} 
                  alt={u.nome} 
                  className="w-10 h-10 rounded-full object-cover border border-emerald-500/30 shrink-0" 
                />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <div className="font-bold text-white text-xs truncate">{u.nome}</div>
                    <div className="flex items-center space-x-1 shrink-0">
                      {/* Badge de Instrutor SST */}
                      {u.is_instrutor && (
                        <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full border bg-amber-500/20 text-amber-300 border-amber-500/40">
                          Instrutor SST
                        </span>
                      )}
                      {/* Selo de perfil: Gerente (admin) ou Colaborador */}
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full border ${
                        u.perfil === 'admin'
                          ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}>
                        {u.perfil === 'admin' ? 'Gerente' : 'Colaborador'}
                      </span>
                      {/* Botão que alterna o status ativo/inativo do usuário */}
                      <button
                        onClick={() => editarUsuario(u.id, { ativo: u.ativo === false })}
                        className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-full border transition-all ${
                          u.ativo !== false ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                        }`}
                        title="Alternar Status Ativo/Inativo"
                      >
                        {u.ativo !== false ? 'Ativo' : 'Inativo'}
                      </button>
                    </div>
                  </div>
                  {/* Cargo e informações do usuário (setor, e-mail) */}
                  <div className="text-[11px] text-slate-300 truncate">{u.cargo}</div>
                  <div className="text-[10px] text-slate-400 flex items-center space-x-2">
                    <span>{setorObj?.nome || 'Setor Geral'}</span>
                    <span>•</span>
                    <span className="truncate">{u.email}</span>
                  </div>
                </div>

                {/* Ações do card: editar e excluir usuário */}
                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    onClick={() => {
                      // Preenche o formulário com os dados do usuário para edição
                      setUsuarioParaEditar(u);
                      setNomeUser(u.nome || '');
                      setEmailUser(u.email || '');
                      setCargoUser(u.cargo || '');
                      setAvatarUser(u.avatar || '');
                      setSenhaUser('');
                      setConfirmSenhaUser('');
                      setUserErrorMsg('');
                      setSetorIdUser(u.setor_id || '');
                      setPerfilUser(u.perfil || 'colaborador');
                      setIsInstrutorUser(u.is_instrutor || false);
                    }}
                    className="p-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg border border-blue-500/40"
                    title="Editar Usuário"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {/* Botão que abre o modal de confirmação de exclusão do usuário */}
                  <button
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        title: 'Confirmar Exclusão de Usuário',
                        itemName: `Usuário: ${u.nome} (${u.email})`,
                        actionType: 'delete',
                        onConfirm: () => excluirUsuario(u.id),
                      });
                    }}
                    className="p-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg border border-rose-500/40"
                    title="Excluir Usuário"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== Grid: Participação Setorial & Campanhas ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Coluna esquerda (2/3): participação por setor e regra dos 50% */}
        <div className="lg:col-span-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <span>Taxa de Participação Setorial & Regra dos 50%</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Setores destacados em vermelho estão abaixo do limite mínimo de adesão do período.
              </p>
            </div>
            
            {/* Botão que abre o modal de cadastro de novo setor */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowNovoSetorModal(true)}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition-all shadow-md"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Novo Setor</span>
              </button>
            </div>
          </div>

          {/* Lista de rankings por setor: destaca em vermelho setores abaixo de 50% */}
          <div className="space-y-3">
            {rankingsSetores.map(setor => (
              <div 
                key={setor.setor_id}
                className={`p-4 rounded-xl border flex items-center justify-between flex-wrap gap-3 text-xs backdrop-blur-md ${
                  !setor.elegivel 
                    ? 'bg-rose-950/30 border-rose-500/40 text-rose-200' 
                    : 'bg-white/5 border-white/10 text-slate-200'
                }`}
              >
                <div>
                  <div className="font-extrabold text-sm text-white flex items-center space-x-2">
                    <span>{setor.setor_nome}</span>
                    {!setor.elegivel && (
                      <span className="bg-rose-500/20 text-rose-300 text-[10px] px-2 py-0.2 rounded-full border border-rose-500/40 font-bold">
                        Abaixo de 50%
                      </span>
                    )}
                  </div>
                  {/* Métricas de participação do setor no período */}
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {setor.colaboradores_participantes} de {setor.total_colaboradores_ativos} membros ativos participaram ({setor.taxa_participacao}%)
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    {/* Pontuação média e total por setor (quizzes + desafios 1x1) */}
                    <div className="font-black text-emerald-400 text-sm">
                      {setor.pontuacao_media} pts/membro
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Total: {setor.total_pontos} pts ({setor.total_pontos_quizzes} quiz / {setor.total_pontos_desafios} 1x1)
                    </div>
                  </div>

                  {/* Ações do setor: editar e excluir */}
                  <div className="flex items-center space-x-1 border-l border-white/10 pl-2">
                    <button
                      onClick={() => {
                        // Preenche o formulário com os dados do setor para edição
                        const targetSetor = setores.find(s => s.id === setor.setor_id);
                        if (targetSetor) {
                          setSetorParaEditar(targetSetor);
                          setNomeSetor(targetSetor.nome);
                          setSetorErrorMsg('');
                        }
                      }}
                      className="p-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg border border-purple-500/40"
                      title="Editar Setor"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {/* Abre o modal de confirmação de exclusão do setor */}
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Confirmar Exclusão de Setor',
                          itemName: `Setor: ${setor.setor_nome}`,
                          actionType: 'delete',
                          onConfirm: () => excluirSetor(setor.setor_id),
                        });
                      }}
                      className="p-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg border border-rose-500/40"
                      title="Excluir Setor"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Coluna direita (1/3): campanhas programadas da empresa */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-blue-400" />
              <span>Campanhas Programadas</span>
            </h2>
          </div>

          {/* Lista de campanhas da empresa com status e ações */}
          <div className="space-y-3">
            {campanhas.filter(c => c.empresa_id === empresa.id).map(camp => (
              <div key={camp.id} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm">{camp.nome}</h3>
                  <div className="flex items-center space-x-2">
                    {/* Alterna o status ativa/inativa da campanha */}
                    <button
                      onClick={() => editarCampanha(camp.id, { ativa: !camp.ativa })}
                      className={`text-[10px] px-2 py-0.5 rounded-full border font-bold transition-all ${
                        camp.ativa ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/30 hover:bg-rose-500/30'
                      }`}
                      title="Alternar Status (Ativa/Inativa)"
                    >
                      {camp.ativa ? 'Ativa' : 'Inativa'}
                    </button>
                    {/* Abre o modal de confirmação de exclusão da campanha */}
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Confirmar Exclusão de Campanha',
                          itemName: `Campanha: ${camp.nome}`,
                          actionType: 'delete',
                          onConfirm: () => excluirCampanha(camp.id),
                        });
                      }}
                      className="p-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded border border-rose-500/40"
                      title="Excluir Campanha"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {/* Descrição da campanha */}
                <p className="text-[11px] text-slate-300 line-clamp-2">{camp.descricao}</p>
                {/* Frequência e quantidade de perguntas por quiz */}
                <div className="text-[10px] text-slate-400 flex items-center justify-between pt-1 border-t border-white/10">
                  <span>Freq: {camp.frequencia}</span>
                  <span>{camp.quantidade_perguntas} q/quiz</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ===== Seção: Gestão de Ciclos, Ranking e Resets de Dados SST ===== */}
      {/* Controles para zerar desafios 1x1, resetar pontuação/ranking e nova temporada */}
      <div className="bg-gradient-to-r from-slate-900 via-rose-950/20 to-slate-900 border border-rose-500/30 rounded-2xl p-6 text-white shadow-xl space-y-4">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
            <RotateCcw className="w-5 h-5 text-rose-400" />
            <span>Gestão de Ciclos, Ranking & Resets de Dados SST</span>
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Controles administrativos para encerramento e reinício de temporadas (mensais, trimestrais, semestrais ou anuais) e gerenciamento de disputas.
          </p>
        </div>

        {/* Banner de feedback exibido após uma ação de reset concluída */}
        {resetFeedbackMsg && (
          <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-2xl p-4 text-emerald-200 text-xs flex items-center justify-between shadow-xl backdrop-blur-md animate-fadeIn">
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <strong className="block text-sm font-extrabold text-emerald-300">Ação Concluída com Sucesso!</strong>
                <p className="text-emerald-200/90 mt-0.5">{resetFeedbackMsg}</p>
              </div>
            </div>
            <button
              onClick={() => setResetFeedbackMsg('')}
              className="ml-4 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 font-bold px-4 py-2 rounded-xl border border-emerald-500/40 transition-all shrink-0"
            >
              Confirmar e Fechar
            </button>
          </div>
        )}

        {/* Grid com os controles de reset (desafios 1x1 e pontuação/ranking) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card: zerar tabela de desafios 1x1 */}
          <div className="bg-slate-900/80 border border-amber-500/30 rounded-xl p-4 space-y-3 flex flex-col justify-between backdrop-blur-md">
            <div>
              <div className="flex items-center space-x-2 text-amber-300 font-bold text-sm">
                <Swords className="w-4 h-4 text-amber-400" />
                <span>Zerar Tabela de Desafios 1x1</span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Limpa e exclui permanentemente todo o histórico de duelos e partidas 1x1 da empresa. Ideal para zerar a tabela e iniciar um novo ciclo de disputas.
              </p>
            </div>

            {/* Botão que solicita confirmação e chama resetarTabelaDesafios1v1 */}
            <button
              onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  title: 'Confirmar Zeramento de Desafios 1x1',
                  itemName: `TODOS os desafios 1x1 da empresa "${empresa.nome}"`,
                  actionType: 'delete',
                  onConfirm: () => {
                    resetarTabelaDesafios1v1(empresa.id);
                    setResetFeedbackMsg(`Tabela de Desafios 1x1 da empresa "${empresa.nome}" foi limpa e zerada com sucesso!`);
                  },
                });
              }}
              className="w-full bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-sm"
            >
              <Trash2 className="w-4 h-4 text-amber-400" />
              <span>Limpar & Zerar Tabela 1x1</span>
            </button>
          </div>

          {/* Card: zerar pontuação/ranking dos colaboradores */}
          <div className="bg-slate-900/80 border border-rose-500/30 rounded-xl p-4 space-y-3 flex flex-col justify-between backdrop-blur-md">
            <div>
              <div className="flex items-center space-x-2 text-rose-300 font-bold text-sm">
                <Trophy className="w-4 h-4 text-rose-400" />
                <span>Zerar Pontuação & Ranking dos Colaboradores</span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                Zera os pontos totais, mensais, sequências (streaks) e estatísticas de todos os colaboradores. Permite que todos os usuários entrem em pé de igualdade na próxima campanha.
              </p>
            </div>

            {/* Reset total da pontuação (zera tudo para nova temporada) */}
            <button
              onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  title: 'Confirmar Zeramento de Pontuações e Ranking',
                  itemName: `A pontuação de TODOS os colaboradores da empresa "${empresa.nome}"`,
                  actionType: 'delete',
                  onConfirm: () => {
                    resetarPontuacaoEmpresa(empresa.id);
                    setResetFeedbackMsg(`Pontuações e estatísticas do ranking da empresa "${empresa.nome}" foram zeradas com sucesso para a nova temporada!`);
                  },
                });
              }}
              className="w-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-sm"
            >
              <RotateCcw className="w-4 h-4 text-rose-400" />
              <span>Resetar Pontuação para Nova Temporada</span>
            </button>
            {/* Reset do ranking preservando os pontos de premiação dos colaboradores */}
            <button
              onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  title: 'Confirmar Reset de Ranking (Preservar Pontos de Prêmio)',
                  itemName: `Zerar ranking mantendo pontos para premiações da empresa "${empresa.nome}"`,
                  actionType: 'delete',
                  onConfirm: () => {
                    resetarPontuacaoEmpresaPreservarPontos(empresa.id);
                    setResetFeedbackMsg(`Ranking reiniciado para a empresa "${empresa.nome}". Pontos para premiações preservados.`);
                  },
                });
              }}
              className="w-full mt-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 text-xs font-bold py-2.5 px-3 rounded-xl flex items-center justify-center space-x-2 transition-all shadow-sm"
            >
              <Trophy className="w-4 h-4 text-emerald-400" />
              <span>Zerar Ranking (Preservar Pontos para Premiações)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ===== Modal: Cadastro de Novo Usuário ===== */}
      {showNovoUsuarioModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-lg bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <span>Cadastrar Novo Usuário</span>
              </h3>
              {/* Botão de fechar o modal */}
              <button 
                onClick={() => {
                  setShowNovoUsuarioModal(false);
                  setUserErrorMsg('');
                }} 
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagem de erro de validação do formulário */}
            {userErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{userErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSalvarUsuario} className="space-y-3.5 text-xs">
              
              {/* Seção de foto/avatar: galeria, câmera ou presets */}
              <div className="bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-2">
                <label className="block font-bold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>Foto de Perfil do Usuário</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Galeria, Câmera ou Presets</span>
                </label>

                <div className="flex items-center gap-3">
                  <img 
                    src={avatarUser || PRESET_AVATARS[0].url} 
                    alt="Preview" 
                    className="w-14 h-14 rounded-xl object-cover ring-2 ring-emerald-500/50 shadow-md shrink-0" 
                  />

                  <div className="flex-1 space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        ref={galleryInputRef} 
                        type="file" 
                        accept="image/*" 
                        onChange={handleFileUploadUser} 
                        className="hidden" 
                      />
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold p-2 rounded-lg border border-emerald-500/40 flex items-center justify-center space-x-1 transition-all text-[11px]"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Galeria</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowCameraModal(true)}
                        className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-bold p-2 rounded-lg border border-purple-500/40 flex items-center justify-center space-x-1 transition-all text-[11px]"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Câmera</span>
                      </button>
                    </div>

                    <input 
                      type="text" 
                      value={avatarUser} 
                      onChange={(e) => setAvatarUser(e.target.value)} 
                      placeholder="Ou informe a URL da foto..." 
                      className="w-full bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-slate-200 text-[10px]"
                    />
                  </div>
                </div>

                {/* Presets de avatar padrão (Homem e Mulher) para seleção rápida */}
                <div className="pt-1">
                  <div className="text-[10px] text-slate-400 mb-1 font-semibold">Fotos Padrão Disponíveis:</div>
                  <div className="flex items-center space-x-2">
                    {PRESET_AVATARS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAvatarUser(preset.url)}
                        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold transition-all ${
                          avatarUser === preset.url ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 scale-105' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        <img src={preset.url} alt={preset.label} className="w-6 h-6 rounded-full object-cover border border-white/20" />
                        <span>{preset.gender}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Campo de nome completo do usuário */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={nomeUser}
                  onChange={(e) => setNomeUser(e.target.value)}
                  placeholder="Ex: Roberto Alves"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              {/* Campo de e-mail corporativo */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">E-mail Corporativo</label>
                <input
                  type="email"
                  value={emailUser}
                  onChange={(e) => setEmailUser(e.target.value)}
                  placeholder="roberto.alves@empresa.com.br"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              {/* Bloco de senha e confirmação de senha */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white/5 p-3 rounded-xl border border-white/10">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Senha de Acesso</label>
                  <input
                    type="password"
                    value={senhaUser}
                    onChange={(e) => setSenhaUser(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Confirmar Senha (Repita)</label>
                  <input
                    type="password"
                    value={confirmSenhaUser}
                    onChange={(e) => setConfirmSenhaUser(e.target.value)}
                    placeholder="Repita a mesma senha"
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                    required
                  />
                </div>
              </div>

              {/* Campo de cargo/função */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Cargo / Função</label>
                <input
                  type="text"
                  value={cargoUser}
                  onChange={(e) => setCargoUser(e.target.value)}
                  placeholder="Ex: Téc. de Manutenção / Operador"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              {/* Seleção de setor e perfil de acesso do novo usuário */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Setor</label>
                  <select
                    value={setorIdUser}
                    onChange={(e) => setSetorIdUser(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    {setores.map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Perfil de Acesso</label>
                  <select
                    value={perfilUser}
                    onChange={(e) => setPerfilUser(e.target.value as any)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="colaborador">Colaborador (Responde Quizzes)</option>
                    <option value="admin">Administrador (Gestão de Empresa)</option>
                  </select>
                </div>
              </div>

              {/* Marcação/Flag de Instrutor SST */}
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInstrutorUser}
                    onChange={(e) => setIsInstrutorUser(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400 h-4 w-4 bg-slate-950 border-white/20"
                  />
                  <span className="text-xs font-bold text-amber-200">
                    Habilitar como Instrutor SST (Permite criar e gerenciar Quiz Guiado)
                  </span>
                </label>
              </div>

              {/* Rodapé do formulário: cancelar e cadastrar */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowNovoUsuarioModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Cadastrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal: Importação em Lote de Usuários via CSV ===== */}
      {showCSVUsuariosModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900/95 border border-white/15 rounded-2xl max-w-lg w-full p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <span>Importação em Lote de Usuários via CSV</span>
              </h3>
              {/* Botão de fechar o modal */}
              <button onClick={() => setShowCSVUsuariosModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagens de erro do processamento CSV */}
            {csvErrorMsgUsuarios && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{csvErrorMsgUsuarios}</span>
              </div>
            )}

            {/* Mensagem de sucesso com resumo do processamento */}
            {csvSuccessMsgUsuarios && (
              <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold space-y-3 animate-fadeIn">
                <div className="flex items-start space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{csvSuccessMsgUsuarios}</div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCSVUsuariosModal(false);
                      setCsvTextUsuarios('');
                      setCsvSuccessMsgUsuarios('');
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-2 rounded-xl shadow-lg transition-all text-xs"
                  >
                    Confirmar e Fechar Resumo
                  </button>
                </div>
              </div>
            )}

            {/* Área de carregamento do arquivo CSV ou uso do modelo */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-slate-300 space-y-2">
              <p>
                Carregue um arquivo <strong>.csv</strong> de colaboradores ou cole a estrutura abaixo.
              </p>
              <div className="flex items-center space-x-2">
                {/* Input oculto que lê o conteúdo do arquivo via FileReader */}
                <input
                  type="file"
                  accept=".csv,.txt"
                  ref={csvUsuariosFileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (evt) => setCsvTextUsuarios(evt.target?.result as string || '');
                      reader.readAsText(file);
                    }
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => csvUsuariosFileInputRef.current?.click()}
                  className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all text-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Carregar Arquivo</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerDownloadCSV('modelo_usuarios_sst.csv', generateCSVTemplateUsuarios())}
                  className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Modelo</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleImportarCSVUsuarios} className="space-y-3 text-xs">
              {/* Área de texto para colar o conteúdo CSV manualmente */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Formato: <code>nome;email;senha;cargo;nome_setor;perfil</code></label>
                <textarea
                  value={csvTextUsuarios}
                  onChange={(e) => setCsvTextUsuarios(e.target.value)}
                  placeholder="nome;email;senha;cargo;setor;perfil&#10;Carlos Silva;carlos@empresa.com;123456;Operador;Manutenção;colaborador"
                  rows={6}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-200 font-mono text-[11px]"
                  required
                />
              </div>

              {/* Rodapé: cancelar e importar usuários */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCSVUsuariosModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Importar Usuários
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal: Importação em Lote de Setores via CSV ===== */}
      {showCSVSetoresModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900/95 border border-white/15 rounded-2xl max-w-lg w-full p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <FolderPlus className="w-5 h-5 text-purple-400" />
                <span>Importação em Lote de Setores via CSV</span>
              </h3>
              {/* Botão de fechar o modal */}
              <button onClick={() => setShowCSVSetoresModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagens de erro do processamento CSV */}
            {csvErrorMsgSetores && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{csvErrorMsgSetores}</span>
              </div>
            )}

            {/* Mensagem de sucesso com resumo do processamento */}
            {csvSuccessMsgSetores && (
              <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold space-y-3 animate-fadeIn">
                <div className="flex items-start space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{csvSuccessMsgSetores}</div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCSVSetoresModal(false);
                      setCsvTextSetores('');
                      setCsvSuccessMsgSetores('');
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-2 rounded-xl shadow-lg transition-all text-xs"
                  >
                    Confirmar e Fechar Resumo
                  </button>
                </div>
              </div>
            )}

            {/* Área de carregamento do arquivo CSV de setores */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-slate-300 space-y-2">
              <p>
                Carregue um arquivo <strong>.csv</strong> com a lista de setores da empresa.
              </p>
              <div className="flex items-center space-x-2">
                {/* Input oculto que lê o conteúdo do arquivo via FileReader */}
                <input
                  type="file"
                  accept=".csv,.txt"
                  ref={csvSetoresFileInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (evt) => setCsvTextSetores(evt.target?.result as string || '');
                      reader.readAsText(file);
                    }
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => csvSetoresFileInputRef.current?.click()}
                  className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all text-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Carregar Arquivo</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerDownloadCSV('modelo_setores_sst.csv', generateCSVTemplateSetores())}
                  className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Modelo</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleImportarCSVSetores} className="space-y-3 text-xs">
              {/* Área de texto para colar o conteúdo CSV manualmente */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Formato: <code>nome_setor</code> (uma linha por setor)</label>
                <textarea
                  value={csvTextSetores}
                  onChange={(e) => setCsvTextSetores(e.target.value)}
                  placeholder="nome_setor&#10;Manutenção Industrial&#10;Logística & Expedição&#10;Qualidade"
                  rows={6}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-200 font-mono text-[11px]"
                  required
                />
              </div>

              {/* Rodapé: cancelar e importar setores */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCSVSetoresModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Importar Setores
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal: Cadastro de Novo Setor ===== */}
      {showNovoSetorModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-md bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <h3 className="font-extrabold text-base text-white border-b border-white/10 pb-3 flex items-center space-x-2">
              <FolderPlus className="w-5 h-5 text-purple-400" />
              <span>Cadastrar Novo Setor</span>
            </h3>

            {/* Mensagem de erro de validação do formulário */}
            {setorErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{setorErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSalvarSetor} className="space-y-3 text-xs">
              {/* Campo de nome do setor */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nome do Setor / Departamento</label>
                <input
                  type="text"
                  value={nomeSetor}
                  onChange={(e) => setNomeSetor(e.target.value)}
                  placeholder="Ex: Qualidade & Auditoria"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              {/* Rodapé: cancelar e salvar setor */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowNovoSetorModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Salvar Setor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal: Criação de Nova Campanha de Quizzes ===== */}
      {showNovaCampanhaModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-lg bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <h3 className="font-extrabold text-base text-white border-b border-white/10 pb-3">
              Criar Nova Campanha de Quizzes
            </h3>

            {/* Mensagem de erro de validação do formulário */}
            {campanhaErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{campanhaErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSalvarCampanha} className="space-y-3 text-xs">
              {/* Campo de nome da campanha */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nome da Campanha</label>
                <input
                  type="text"
                  value={nomeCampanha}
                  onChange={(e) => setNomeCampanha(e.target.value)}
                  placeholder="Ex: Maratona Treinamento NR-10"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              {/* Campo de descrição da campanha */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Descrição</label>
                <textarea
                  value={descCampanha}
                  onChange={(e) => setDescCampanha(e.target.value)}
                  placeholder="Objetivos e normas abordadas na campanha..."
                  rows={2}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              {/* Seleção de perguntas do banco com filtros (busca, categoria, dificuldade) */}
              <div className="bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="font-extrabold text-slate-200 flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>Banco de Perguntas ({selectedPerguntaIds.length} selecionadas)</span>
                  </label>
                  <div className="flex items-center space-x-1">
                    {/* Marca todas as perguntas visíveis conforme os filtros atuais */}
                    <button
                      type="button"
                      onClick={() => {
                        const filteredIds = perguntas
                          .filter(p => {
                            const matchSearch = !campPerguntaBusca || p.enunciado.toLowerCase().includes(campPerguntaBusca.toLowerCase());
                            const matchCat = campCategoriaFiltro === 'todas' || p.categoria === campCategoriaFiltro;
                            const matchDif = campDificuldadeFiltro === 'todas' || p.dificuldade === campDificuldadeFiltro;
                            return matchSearch && matchCat && matchDif;
                          })
                          .map(p => p.id);
                        setSelectedPerguntaIds(Array.from(new Set([...selectedPerguntaIds, ...filteredIds])));
                      }}
                      className="text-[10px] bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 px-2 py-0.5 rounded border border-blue-500/30 font-bold"
                    >
                      Marcar Visíveis
                    </button>
                    {/* Limpa toda a seleção de perguntas */}
                    <button
                      type="button"
                      onClick={() => setSelectedPerguntaIds([])}
                      className="text-[10px] bg-slate-800 text-slate-400 hover:text-white px-2 py-0.5 rounded border border-white/10 font-bold"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                {/* Controles de filtro: busca por texto, categoria e dificuldade */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <input
                    type="text"
                    value={campPerguntaBusca}
                    onChange={(e) => setCampPerguntaBusca(e.target.value)}
                    placeholder="Buscar questão..."
                    className="bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-[11px] text-slate-200"
                  />
                  <select
                    value={campCategoriaFiltro}
                    onChange={(e) => setCampCategoriaFiltro(e.target.value)}
                    className="bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-[11px] text-slate-200"
                  >
                    <option value="todas">Todas as Categorias</option>
                    {Array.from(new Set(perguntas.map(p => p.categoria))).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <select
                    value={campDificuldadeFiltro}
                    onChange={(e) => setCampDificuldadeFiltro(e.target.value)}
                    className="bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-[11px] text-slate-200"
                  >
                    <option value="todas">Todas Dificuldades</option>
                    <option value="facil">Fácil</option>
                    <option value="medio">Médio</option>
                    <option value="dificil">Difícil</option>
                  </select>
                </div>

                {/* Lista clicável de perguntas filtradas (marca/desmarca a seleção) */}
                <div className="max-h-44 overflow-y-auto space-y-1.5 pr-2 pt-1">
                  {perguntas
                    .filter(p => {
                      const matchSearch = !campPerguntaBusca || p.enunciado.toLowerCase().includes(campPerguntaBusca.toLowerCase());
                      const matchCat = campCategoriaFiltro === 'todas' || p.categoria === campCategoriaFiltro;
                      const matchDif = campDificuldadeFiltro === 'todas' || p.dificuldade === campDificuldadeFiltro;
                      return matchSearch && matchCat && matchDif;
                    })
                    .map(p => {
                      const selected = selectedPerguntaIds.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => toggleSelectPergunta(p.id)}
                          className={`p-2 rounded-xl border transition-all cursor-pointer flex items-start space-x-2 text-xs ${
                            selected 
                              ? 'bg-blue-500/20 border-blue-500/50 text-white' 
                              : 'bg-slate-950/60 border-white/5 text-slate-400 hover:bg-white/5'
                          }`}
                        >
                          {selected ? <CheckSquare className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" /> : <Square className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold leading-snug">{p.enunciado}</div>
                            <div className="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
                              <span className="bg-white/10 px-1.5 py-0.2 rounded text-slate-300">{p.categoria}</span>
                              <span>• {p.dificuldade}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Datas e horário específico de início da campanha */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Data Início</label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2 text-slate-200"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Horário Início</label>
                  <input
                    type="time"
                    value={horarioInicio}
                    onChange={(e) => setHorarioInicio(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2 text-slate-200"
                    required
                  />
                </div>
                {/* Campo de data de término da campanha */}
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Data Fim</label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2 text-slate-200"
                    required
                  />
                </div>
              </div>

              {/* Rodapé: cancelar e criar campanha */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowNovaCampanhaModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Criar Campanha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal: Configurações & Regras Globais de Gamificação ===== */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-3xl bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <h3 className="font-extrabold text-base text-white border-b border-white/10 pb-3 flex items-center justify-between">
              <span>Configurações & Regras Globais do SST Quiz</span>
              <button onClick={() => setShowConfigModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </h3>

            <form onSubmit={handleSalvarConfig} className="space-y-3.5 text-xs max-h-[75vh] overflow-y-auto pr-1">
              {/* Mensagem de erro de validação das configurações */}
              {configErrorMsg && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-2.5 rounded-xl font-semibold text-xs">
                  {configErrorMsg}
                </div>
              )}

              {/* Campo do nome da temporada vigente */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Nome da Temporada Vigente
                </label>
                <input
                  type="text"
                  value={nomeTemporadaConfig}
                  onChange={(e) => setNomeTemporadaConfig(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  placeholder="Ex: 1ª Temporada SST 2026"
                />
              </div>

              {/* Datas de início e fim da temporada */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Início da Temporada
                  </label>
                  <input
                    type="date"
                    value={dataInicioTemporada}
                    onChange={(e) => setDataInicioTemporada(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Fim da Temporada
                  </label>
                  <input
                    type="date"
                    value={dataFimTemporada}
                    onChange={(e) => setDataFimTemporada(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  />
                </div>
              </div>

              {/* Configurações do Modo Amistoso (permissões, cota e pontos) */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/10 space-y-2.5">
                <div className="font-extrabold text-blue-300 text-xs">⚡ Configurações do Modo Amistoso</div>

                {/* Checkbox que libera desafios amistosos */}
                <label className="flex items-center space-x-2.5 cursor-pointer text-slate-200">
                  <input
                    type="checkbox"
                    checked={permitirAmistososConfig}
                    onChange={(e) => setPermitirAmistososConfig(e.target.checked)}
                    className="w-4 h-4 accent-blue-500 rounded"
                  />
                  <span>Permitir Desafios no Modo Amistoso</span>
                </label>

                {/* Checkbox (visível apenas se amistosos ativos) que permite amistosos entre o mesmo setor */}
                {permitirAmistososConfig && (
                  <label className="flex items-center space-x-2.5 cursor-pointer text-slate-300 pl-6">
                    <input
                      type="checkbox"
                      checked={permitirMesmoSetorAmistosoConfig}
                      onChange={(e) => setPermitirMesmoSetorAmistosoConfig(e.target.checked)}
                      className="w-4 h-4 accent-blue-500 rounded"
                    />
                    <span>Permitir Amistosos no mesmo setor</span>
                  </label>
                )}

                {/* Cota semanal de desafios amistosos lançados por colaborador */}
                <div>
                  <label className="block font-semibold text-slate-300 mb-1 mt-1">
                    Cota de Desafios AMISTOSOS Lançados por Colaborador/Semana
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={Number.isNaN(Number(cotaColabConfig)) ? '' : cotaColabConfig}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setCotaColabConfig(isNaN(v) ? ('' as unknown as number) : v);
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-slate-200"
                  />
                </div>

                {/* Pontos ganhos/perdidos em vitória e derrota no amistoso */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block font-semibold text-emerald-300 mb-1">
                      Pontos p/ Vitória (Individual)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={Number.isNaN(Number(pontosVitoriaAmistosoConfig)) ? '' : pontosVitoriaAmistosoConfig}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setPontosVitoriaAmistosoConfig(isNaN(v) ? ('' as unknown as number) : v);
                      }}
                      className="w-full bg-slate-900 border border-emerald-500/30 rounded-xl p-2 text-emerald-200 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-rose-300 mb-1">
                      Pontos Perdidos na Derrota (Individual)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={Number.isNaN(Number(pontosDerrotaAmistosoConfig)) ? '' : pontosDerrotaAmistosoConfig}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setPontosDerrotaAmistosoConfig(isNaN(v) ? ('' as unknown as number) : v);
                      }}
                      className="w-full bg-slate-900 border border-rose-500/30 rounded-xl p-2 text-rose-200 font-bold"
                    />
                  </div>
                </div>
              </div>

              {/* Nota explicativa sobre a cota do Modo Competitivo (equalização de setores) */}
              <div className="bg-indigo-950/40 border border-indigo-500/30 p-2.5 rounded-xl text-[11px] text-indigo-200 leading-relaxed">
                💡 <strong>Nota de Regra:</strong> A cota do <em>Modo Competitivo</em> é calculada automaticamente pela fórmula de equalização de setores (membros do maior setor × 2 ÷ membros do seu setor). O campo acima define a cota semanal para o <em>Modo Amistoso</em>.
              </div>

              {/* Pontos base por acerto em quizzes agendados */}
              <div>
                <label className="block font-semibold text-emerald-300 mb-1">
                  Pontos Base por Acerto em Quizzes Agendados (por Pergunta)
                </label>
                <input
                  type="number"
                  min="1"
                  value={Number.isNaN(Number(pontosPorAcertoQuizConfig)) ? '' : pontosPorAcertoQuizConfig}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setPontosPorAcertoQuizConfig(isNaN(v) ? ('' as unknown as number) : v);
                  }}
                  className="w-full bg-slate-950/80 border border-emerald-500/30 rounded-xl p-2.5 text-emerald-200 font-bold"
                />
              </div>

              {/* Bloco de bônus máximos: velocidade de resposta e streak/ofensiva */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/40 p-3 rounded-xl border border-white/10">
                <div>
                  <label className="block font-semibold text-amber-300 text-xs mb-1">
                    Bônus Máx. Velocidade (0 = Desativado)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={Number.isNaN(Number(bonusVelocidadeMaxConfig)) ? '' : bonusVelocidadeMaxConfig}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setBonusVelocidadeMaxConfig(isNaN(v) ? 0 : v);
                    }}
                    className="w-full bg-slate-950/80 border border-amber-500/30 rounded-xl p-2.5 text-amber-200 font-bold text-xs"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Concedido ao responder rapidamente (ex: 3 pts extra).</p>
                </div>

                <div>
                  <label className="block font-semibold text-orange-400 text-xs mb-1">
                    Bônus Máx. Ofensiva / Streak (0 = Desativado)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={Number.isNaN(Number(bonusStreakMaxConfig)) ? '' : bonusStreakMaxConfig}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setBonusStreakMaxConfig(isNaN(v) ? 0 : v);
                    }}
                    className="w-full bg-slate-950/80 border border-orange-500/30 rounded-xl p-2.5 text-orange-300 font-bold text-xs"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Concedido por sequência diária de acessos (ex: 10 pts extra).</p>
                </div>
              </div>

              {/* Limite semanal de desafios competitivos por colaborador */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Limite de Desafios Competitivos por Semana (por colaborador)
                </label>
                <input
                  type="number"
                  min="1"
                  value={Number.isNaN(Number(limiteDesafios)) ? '' : limiteDesafios}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setLimiteDesafios(isNaN(v) ? ('' as unknown as number) : v);
                  }}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              {/* Pontos creditados ao setor por vitória em desafio competitivo */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Pontos Creditados ao Setor por Vitória em Desafio Competitivo
                </label>
                <input
                  type="number"
                  min="1"
                  value={Number.isNaN(Number(pontosDesafio)) ? '' : pontosDesafio}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setPontosDesafio(isNaN(v) ? ('' as unknown as number) : v);
                  }}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              {/* Percentual mínimo de participação para o setor ser elegível no ranking */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Percentual Mínimo de Participação para Elegibilidade no Ranking (%)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={Number.isNaN(Number(pctMinimo)) ? '' : pctMinimo}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    setPctMinimo(isNaN(v) ? ('' as unknown as number) : v);
                  }}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              {/* ================================================================
                  REGRAS DE TROFÉUS (NÍVEIS CONFIGURÁVEIS + GALERIA + DICAS)
                  ================================================================ */}
              <div className="p-3 bg-amber-950/20 rounded-xl border border-amber-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span className="font-extrabold text-amber-300 text-xs">🏆 Regras de Troféus (Níveis)</span>
                  </div>
                  <span className="text-[10px] text-slate-400">Defina quantos degraus quiser por regra</span>
                </div>

                <p className="text-[11px] text-slate-300 leading-relaxed bg-slate-950/40 p-2.5 rounded-lg border border-white/5">
                  💡 <strong>Como funciona:</strong> cada regra aceita <strong>vários níveis</strong>. Ex.: na regra
                  "Vitórias Totais", você pode criar um troféu para 10 vitórias, outro para 30, outro para 50, e assim
                  por diante. Passe o mouse no <strong>(?)</strong> para ver a dica de cada troféu e escolha a imagem na
                  galeria ou envie a imagem personalizada da sua empresa.
                </p>

                {CATEGORIAS_TROFEUS.map(cat => {
                  const lista = (regrasTrofeusState[cat.chave] || []) as RegraTrofeu[];
                  const dica = DICAS_TROFEUS[cat.chave];
                  return (
                    <div key={cat.chave} className="p-2.5 bg-slate-950/50 rounded-xl border border-white/10 space-y-2">
                      {/* Cabeçalho da categoria + dica/tooltip */}
                      <div className="flex items-center justify-between gap-2">
                        <label className="font-bold text-slate-200 flex items-center space-x-2">
                          <span>{dica?.titulo || cat.titulo}</span>
                          {/* Tooltip com a explicação do troféu */}
                          <span className="relative group inline-flex">
                            <span className="w-4 h-4 rounded-full bg-white/10 border border-white/20 text-slate-300 flex items-center justify-center text-[10px] font-bold cursor-help">?</span>
                            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 w-56 hidden group-hover:block bg-slate-800 border border-white/20 text-slate-200 text-[10px] leading-relaxed p-2.5 rounded-lg shadow-xl z-20 pointer-events-none">
                              {dica?.dica}
                            </span>
                          </span>
                        </label>

                        <div className="flex items-center space-x-2">
                          {/* Toggle Ativar/Desativar toda a categoria */}
                          <label className="flex items-center space-x-1.5 cursor-pointer">
                            <span className={`text-[10px] font-bold ${lista.every(n => n.ativo !== false) ? 'text-emerald-400' : 'text-slate-500'}`}>
                              {lista.every(n => n.ativo !== false) ? 'Ativa' : 'Inativa'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                // Ativa/inativa todos os níveis da categoria de uma vez.
                                const novoEstado = !(lista.every(n => n.ativo !== false));
                                setRegrasTrofeusState(prev => ({
                                  ...prev,
                                  [cat.chave]: lista.map(n => ({ ...n, ativo: novoEstado })),
                                }));
                              }}
                              className={`w-9 h-5 rounded-full transition-colors ${lista.every(n => n.ativo !== false) ? 'bg-emerald-500/60' : 'bg-white/15'}`}
                            >
                              <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform ${lista.every(n => n.ativo !== false) ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                          </label>

                          <button
                            type="button"
                            onClick={() => adicionarNivelTrofeu(cat.chave)}
                            className="flex items-center space-x-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold px-2.5 py-1 rounded-lg border border-emerald-500/40 transition-all text-[11px]"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Adicionar Nível</span>
                          </button>
                        </div>
                      </div>

                      {lista.length === 0 && (
                        <p className="text-[11px] text-slate-500 italic">
                          Nenhum nível configurado. Clique em "Adicionar Nível" para criar o primeiro troféu desta regra.
                        </p>
                      )}

                      {/* Lista de níveis da categoria */}
                      {lista.map((nivel, idx) => (
                        <div key={nivel.trofeuId || idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end bg-white/5 p-2 rounded-lg border border-white/5">
                          {/* Toggle ativo do nível */}
                          <div className="sm:col-span-1 flex items-end justify-center">
                            <button
                              type="button"
                              onClick={() => atualizarNivelTrofeu(cat.chave, idx, { ativo: !(nivel.ativo !== false) })}
                              title={nivel.ativo === false ? 'Desativado (troféus já ganhos são mantidos)' : 'Ativado'}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all ${
                                nivel.ativo === false
                                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                                  : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              }`}
                            >
                              {nivel.ativo === false ? <X className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                            </button>
                          </div>

                          {/* Meta (número) */}
                          <div className="sm:col-span-2">
                            <label className="block font-semibold text-slate-400 text-[10px] mb-1">Meta (nº)</label>
                            <input
                              type="number"
                              min="0"
                              value={Number.isNaN(Number(nivel.meta)) ? '' : nivel.meta}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                atualizarNivelTrofeu(cat.chave, idx, { meta: isNaN(v) ? 0 : v });
                              }}
                              className="w-full bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-amber-200 font-bold"
                              placeholder="Ex: 10"
                            />
                          </div>

                          {/* Nome do troféu */}
                          <div className="sm:col-span-3">
                            <label className="block font-semibold text-slate-400 text-[10px] mb-1">Nome do Troféu</label>
                            <input
                              type="text"
                              value={nivel.nome}
                              onChange={(e) => atualizarNivelTrofeu(cat.chave, idx, { nome: e.target.value })}
                              className="w-full bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-slate-200"
                              placeholder="Ex: Bronze"
                            />
                          </div>

                          {/* Seleção de imagem: galeria interna + upload personalizado */}
                          <div className="sm:col-span-4">
                            <label className="block font-semibold text-slate-400 text-[10px] mb-1">Imagem do Troféu</label>
                            <div className="flex items-center gap-2">
                              {/* Preview da imagem escolhida */}
                              <div className="w-9 h-9 rounded-lg bg-slate-950/80 border border-white/15 flex items-center justify-center text-lg shrink-0 overflow-hidden">
                                {eImagemRealTrofeu(nivel.imagem) ? (
                                  <img src={nivel.imagem} alt="Troféu" className="w-full h-full object-cover" />
                                ) : (
                                  <span>{emojiTrofeu(nivel.imagem)}</span>
                                )}
                              </div>

                              {/* Dropdown da galeria interna */}
                              <select
                                value={TROFEU_GALERIA.some(g => g.chave === nivel.imagem) ? nivel.imagem : ''}
                                onChange={(e) => atualizarNivelTrofeu(cat.chave, idx, { imagem: e.target.value })}
                                className="flex-1 bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-slate-300 text-[11px]"
                              >
                                <option value="">Escolher da galeria...</option>
                                {TROFEU_GALERIA.map(g => (
                                  <option key={g.chave} value={g.chave}>{g.emoji} {g.nome}</option>
                                ))}
                              </select>

                              {/* Upload de imagem personalizada da empresa */}
                              <label className="shrink-0 cursor-pointer bg-white/5 hover:bg-white/10 border border-white/15 rounded-lg p-1.5 text-slate-300 transition-all" title="Enviar imagem personalizada">
                                <Upload className="w-4 h-4" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      const dataUrl = reader.result as string;
                                      // Comprime a imagem para não sobrecarregar o localStorage/Supabase
                                      compressImageFile(file).then((compressed) => {
                                        atualizarNivelTrofeu(cat.chave, idx, { imagem: compressed || dataUrl });
                                      }).catch(() => {
                                        atualizarNivelTrofeu(cat.chave, idx, { imagem: dataUrl });
                                      });
                                    };
                                    reader.readAsDataURL(file);
                                  }}
                                />
                              </label>
                            </div>
                          </div>

                          {/* Botão remover nível */}
                          <div className="sm:col-span-2 flex sm:justify-end">
                            <button
                              type="button"
                              onClick={() => removerNivelTrofeu(cat.chave, idx)}
                              className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold p-1.5 rounded-lg border border-rose-500/40 transition-all"
                              title="Remover este nível"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          {/* NOVO: modo de contagem + gatilho + proximidade + mostrar progresso */}
                          <div className="sm:col-span-12 grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 border-t border-white/5">
                            {/* Modo de contagem */}
                            <div>
                              <label className="block font-semibold text-slate-400 text-[10px] mb-1">Contagem</label>
                              <select
                                value={nivel.modoContagem || 'acumulado'}
                                onChange={(e) => atualizarNivelTrofeu(cat.chave, idx, { modoContagem: e.target.value as 'acumulado' | 'sequencial' })}
                                className="w-full bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-slate-300 text-[11px]"
                              >
                                <option value="acumulado">Acumulada (vida toda)</option>
                                <option value="sequencial">Sequencial (zera ao perder)</option>
                              </select>
                              <p className="text-[9px] text-slate-500 mt-0.5">Acumulada nunca zera; Sequencial zera se perder/errar.</p>
                            </div>

                            {/* Gatilho (só Defesa Imbatível) */}
                            {cat.chave === 'defesasImbativel' ? (
                              <div>
                                <label className="block font-semibold text-slate-400 text-[10px] mb-1">Gatilho da Defesa</label>
                                <select
                                  value={nivel.gatilhoDefesa || 'desafiado'}
                                  onChange={(e) => atualizarNivelTrofeu(cat.chave, idx, { gatilhoDefesa: e.target.value as 'desafiado' | 'setor_maior' | 'ambos' })}
                                  className="w-full bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-slate-300 text-[11px]"
                                >
                                  <option value="desafiado">Venceu como desafiado</option>
                                  <option value="setor_maior">Venceu setor maior</option>
                                  <option value="ambos">Qualquer um dos dois</option>
                                </select>
                                <p className="text-[9px] text-slate-500 mt-0.5">"Desafiado" = alguém o desafiou e você venceu.</p>
                              </div>
                            ) : (
                              <div />
                            )}

                            {/* Limite de proximidade */}
                            <div>
                              <label className="block font-semibold text-slate-400 text-[10px] mb-1">Proximidade (nº)</label>
                              <input
                                type="number"
                                min="0"
                                value={Number.isNaN(Number(nivel.limiteProximidade)) ? '' : (nivel.limiteProximidade ?? 0)}
                                onChange={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  atualizarNivelTrofeu(cat.chave, idx, { limiteProximidade: isNaN(v) ? 0 : v });
                                }}
                                className="w-full bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-slate-300"
                                placeholder="Ex: 3"
                              />
                              <p className="text-[9px] text-slate-500 mt-0.5">0 = mostra todos. Ex.: 3 = aparece quando faltam 3.</p>
                            </div>

                            {/* Mostrar progresso */}
                            <div className="flex items-end pb-1">
                              <label className="flex items-center space-x-1.5 cursor-pointer text-slate-300 text-[11px]">
                                <input
                                  type="checkbox"
                                  checked={nivel.mostrarProgresso !== false}
                                  onChange={(e) => atualizarNivelTrofeu(cat.chave, idx, { mostrarProgresso: e.target.checked })}
                                  className="w-3.5 h-3.5 accent-emerald-500 rounded"
                                />
                                <span>Mostrar progresso</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Bloco de rollover de temporada: arquiva ranking e inicia nova temporada */}
              <div className="pt-3 border-t border-purple-500/30 space-y-2 bg-purple-950/30 p-3 rounded-xl border">
                <div className="font-extrabold text-purple-300 text-xs flex items-center justify-between">
                  <span>🏆 Rollover de Temporada</span>
                  <span className="text-[10px] text-slate-400 font-normal">Arquiva o ranking atual e inicia nova temporada</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  Ao encerrar a temporada, o pódio final será salvo no histórico para consulta e a pontuação do ranking zerará para a próxima temporada, <strong>preservando os pontos de prêmio dos colaboradores</strong>.
                </p>
                
                {/* Etapa 1: botão para solicitar o encerramento da temporada */}
                {!confirmarRolloverTemp ? (
                  <button
                    type="button"
                    onClick={() => setConfirmarRolloverTemp(true)}
                    className="w-full bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 font-bold py-2 px-3 rounded-xl transition-all text-xs"
                  >
                    🚀 Encerrar Temporada & Iniciar Nova
                  </button>
                ) : (
                  // Etapa 2: confirmação final que chama encerrarEIniciarNovaTemporada
                  <div className="bg-purple-950 p-2.5 rounded-xl border border-purple-500/60 space-y-2">
                    <p className="text-[11px] text-amber-300 font-bold">
                      Confirma o encerramento da {empresa.configuracoes.nome_temporada_atual || 'temporada atual'}?
                    </p>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          encerrarEIniciarNovaTemporada(
                            nomeTemporadaConfig || 'Nova Temporada',
                            dataInicioTemporada,
                            dataFimTemporada
                          );
                          setConfirmarRolloverTemp(false);
                          setShowConfigModal(false);
                        }}
                        className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-black py-1.5 rounded-lg text-xs"
                      >
                        Sim, Confirmar Encerrar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmarRolloverTemp(false)}
                        className="bg-white/10 hover:bg-white/20 text-slate-300 font-bold px-3 py-1.5 rounded-lg text-xs"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Rodapé: cancelar e salvar regras */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Salvar Regras
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal: Edição de Usuário / Colaborador ===== */}
      {usuarioParaEditar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-md bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <Pencil className="w-4 h-4 text-emerald-400" />
                <span>Editar Usuário / Colaborador</span>
              </h3>
              {/* Botão de fechar o modal */}
              <button onClick={() => setUsuarioParaEditar(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagem de erro de validação do formulário */}
            {userErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{userErrorMsg}</span>
              </div>
            )}

            {/* Formulário de edição: valida nome/e-mail e, ao confirmar, chama editarUsuario */}
            <form onSubmit={(e) => {
              e.preventDefault();
              setUserErrorMsg('');
              if (!usuarioParaEditar) return;
              if (!nomeUser.trim()) {
                setUserErrorMsg('Por favor, informe o nome completo do usuário.');
                return;
              }
              if (!emailUser.trim() || !validarEmail(emailUser)) {
                setUserErrorMsg('E-mail inválido! Digite um endereço de e-mail corporativo válido (ex: nome@empresa.com.br).');
                return;
              }
              setConfirmModal({
                isOpen: true,
                title: 'Confirmar Alteração de Usuário',
                itemName: `Usuário: ${usuarioParaEditar.nome}`,
                actionType: 'edit',
                onConfirm: () => {
                  editarUsuario(usuarioParaEditar.id, {
                    nome: nomeUser.trim(),
                    email: emailUser.trim(),
                    cargo: cargoUser.trim(),
                    setor_id: setorIdUser,
                    perfil: perfilUser,
                    is_instrutor: isInstrutorUser,
                    avatar: avatarUser || usuarioParaEditar.avatar,
                    ...(senhaUser.trim() ? { senha: senhaUser.trim() } : {})
                  });
                  setUsuarioParaEditar(null);
                  setUserErrorMsg('');
                }
              });
            }} className="space-y-3 text-xs">

              {/* Seção de foto/avatar: galeria, câmera ou presets */}
              <div className="bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-2">
                <label className="block font-bold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>Foto de Perfil do Usuário</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Galeria, Câmera ou Presets</span>
                </label>

                <div className="flex items-center gap-3">
                  <img 
                    src={avatarUser || usuarioParaEditar.avatar} 
                    alt="Preview" 
                    className="w-14 h-14 rounded-xl object-cover ring-2 ring-emerald-500/50 shadow-md shrink-0" 
                  />

                  <div className="flex-1 space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        ref={editGalleryInputRef} 
                        type="file" 
                        accept="image/*" 
                        onChange={handleFileUploadUser} 
                        className="hidden" 
                      />
                      <button
                        type="button"
                        onClick={() => editGalleryInputRef.current?.click()}
                        className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold p-2 rounded-lg border border-emerald-500/40 flex items-center justify-center space-x-1 transition-all text-[11px]"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        <span>Galeria</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowCameraModal(true)}
                        className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-bold p-2 rounded-lg border border-purple-500/40 flex items-center justify-center space-x-1 transition-all text-[11px]"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Câmera</span>
                      </button>
                    </div>

                    <input 
                      type="text" 
                      value={avatarUser} 
                      onChange={(e) => setAvatarUser(e.target.value)} 
                      placeholder="Ou informe a URL da foto..." 
                      className="w-full bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-slate-200 text-[10px]"
                    />
                  </div>
                </div>

                {/* Presets de avatar padrão para seleção rápida */}
                <div className="pt-1">
                  <div className="text-[10px] text-slate-400 mb-1">Escolher foto padrão:</div>
                  <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {PRESET_AVATARS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAvatarUser(preset.url)}
                        className={`rounded-lg overflow-hidden border-2 transition-all p-0.5 shrink-0 ${
                          avatarUser === preset.url ? 'border-emerald-400 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={preset.url} alt={preset.label} className="w-7 h-7 rounded object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Campo de nome completo */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={nomeUser}
                  onChange={(e) => setNomeUser(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              {/* Campo de e-mail corporativo */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">E-mail Corporativo</label>
                <input
                  type="email"
                  value={emailUser}
                  onChange={(e) => setEmailUser(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              {/* Campo de nova senha (vazio mantém a senha atual) */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nova Senha (deixe em branco para manter a atual)</label>
                <input
                  type="password"
                  value={senhaUser}
                  onChange={(e) => setSenhaUser(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              {/* Campos de cargo e setor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Cargo</label>
                  <input
                    type="text"
                    value={cargoUser}
                    onChange={(e) => setCargoUser(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Setor</label>
                  <select
                    value={setorIdUser}
                    onChange={(e) => setSetorIdUser(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    {setores.map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Nível de acesso: colaborador, admin ou super admin (apenas para super_admin) */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nível de Acesso</label>
                <select
                  value={perfilUser}
                  onChange={(e) => setPerfilUser(e.target.value as 'colaborador' | 'admin' | 'super_admin')}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                >
                  <option value="colaborador">Colaborador (Participa de Quizzes & Desafios)</option>
                  <option value="admin">Administrador / Gerente</option>
                  {currentUser.perfil === 'super_admin' && (
                    <option value="super_admin">Super Admin Global</option>
                  )}
                </select>
              </div>

              {/* Marcação/Flag de Instrutor SST */}
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInstrutorUser}
                    onChange={(e) => setIsInstrutorUser(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400 h-4 w-4 bg-slate-950 border-white/20"
                  />
                  <span className="text-xs font-bold text-amber-200">
                    Habilitar como Instrutor SST (Permite criar e gerenciar Quiz Guiado)
                  </span>
                </label>
              </div>

              {/* Rodapé: cancelar e salvar alterações */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setUsuarioParaEditar(null)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal: Edição de Setor ===== */}
      {setorParaEditar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-sm bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <Pencil className="w-4 h-4 text-purple-400" />
                <span>Editar Setor</span>
              </h3>
              {/* Botão de fechar o modal */}
              <button onClick={() => setSetorParaEditar(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagem de erro de validação do formulário */}
            {setorErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{setorErrorMsg}</span>
              </div>
            )}

            {/* Formulário de edição: valida o nome e, ao confirmar, chama editarSetor */}
            <form onSubmit={(e) => {
              e.preventDefault();
              setSetorErrorMsg('');
              if (!setorParaEditar) return;
              if (!nomeSetor.trim()) {
                setSetorErrorMsg('Por favor, informe o nome do setor.');
                return;
              }
              setConfirmModal({
                isOpen: true,
                title: 'Confirmar Alteração de Setor',
                itemName: `Setor: ${setorParaEditar.nome}`,
                actionType: 'edit',
                onConfirm: () => {
                  editarSetor(setorParaEditar.id, nomeSetor.trim());
                  setSetorParaEditar(null);
                  setSetorErrorMsg('');
                }
              });
            }} className="space-y-3 text-xs">
              {/* Campo de nome do setor */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nome do Setor / Departamento</label>
                <input
                  type="text"
                  value={nomeSetor}
                  onChange={(e) => setNomeSetor(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              {/* Rodapé: cancelar e salvar */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setSetorParaEditar(null)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Modal de Relatórios (participação, conformidade, conhecimento) ===== */}
      {showRelatoriosModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-5xl bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                <span>Relatórios de Participação & Conhecimento</span>
              </h3>
              <button onClick={() => setShowRelatoriosModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <RelatoriosView
              empresaId={empresa.id}
              usuarios={usuarios}
              setores={setores}
              quizzes={quizzes}
              desafios={desafios}
              perguntas={perguntas}
              percentualMinimo={empresa.configuracoes.percentualMinimoParticipacao ?? 50}
            />
          </div>
        </div>
      )}

      {/* ===== Modal global de confirmação de segurança (exclusão/edição) ===== */}
      <SecurityConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        itemName={confirmModal.itemName}
        actionType={confirmModal.actionType}
      />

      {/* ===== Modal de captura de foto via câmera ===== */}
      <CameraCaptureModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={(dataUrl) => setAvatarUser(dataUrl)}
      />

      {/* ===== Modal de Pré-visualização de Importação CSV de Usuários ===== */}
      <ImportPreviewModal
        isOpen={showPreviewModalUsuarios}
        onClose={() => {
          setShowPreviewModalUsuarios(false);
          setPreviewDataUsuarios(null);
        }}
        onConfirm={handleConfirmarImportacaoUsuarios}
        title="Pré-visualização da Importação de Usuários"
        totalCount={previewDataUsuarios?.items.length || 0}
        errorsCount={previewDataUsuarios?.errors.length || 0}
        type="usuarios"
        previewItems={previewDataUsuarios?.items || []}
        setoresLista={setores}
      />

      {/* ===== Modal de Pré-visualização de Importação CSV de Setores ===== */}
      <ImportPreviewModal
        isOpen={showPreviewModalSetores}
        onClose={() => {
          setShowPreviewModalSetores(false);
          setPreviewDataSetores(null);
        }}
        onConfirm={handleConfirmarImportacaoSetores}
        title="Pré-visualização da Importação de Setores"
        totalCount={previewDataSetores?.items.length || 0}
        errorsCount={previewDataSetores?.errors.length || 0}
        type="setores"
        previewItems={previewDataSetores?.items || []}
      />

    </div>
  );
};
