// =====================================================================
// SuperAdminView.tsx — Painel do Super Admin (visão multi-empresas)
// Tela de administração global que gerencia empresas, setores,
// colaboradores, campanhas, banco de perguntas, backups em JSON e
// reset comercial. Todos os dados vêm do contexto useSST.
// =====================================================================
import React, { useState, useRef } from 'react';
// Contexto global da aplicação (dados e ações CRUD centralizados)
import { useSST } from '../../context/SSTContext';
// Tipos das entidades manipuladas nesta tela
import { Empresa, Setor, Usuario, Campanha, Pergunta } from '../../types';
// Modais reutilizáveis de confirmação de segurança e captura de câmera
import { SecurityConfirmModal } from '../SecurityConfirmModal';
import { CameraCaptureModal } from '../CameraCaptureModal';
import { ImportPreviewModal } from '../ImportPreviewModal';
// Utilitários de validação (CNPJ, e-mail) e formatação
import { validarCNPJ, formatarCNPJ, validarEmail } from '../../utils/validators';
// Compressor de imagem para fotos de perfil (mantém até 400x400px)
import { compressImageFile } from '../../utils/imageCompressor';
import { 
  triggerDownloadCSV,
  generateCSVTemplateUsuarios,
  parseUsuariosCSV
} from '../../utils/csvHelpers';
// Ícones da biblioteca lucide-react usados em toda a interface
import { 
  Building2, 
  Layers, 
  Users, 
  Plus, 
  ShieldCheck, 
  CheckCircle2, 
  Globe, 
  FolderPlus,
  UserPlus,
  Trash2,
  Edit2,
  Target,
  CheckSquare,
  Square,
  Filter,
  X,
  AlertTriangle,
  Camera,
  Image as ImageIcon,
  FileSpreadsheet,
  Upload,
  Download,
  Database,
  RotateCcw,
  GraduationCap
} from 'lucide-react';

const PRESET_AVATARS = [
  { label: 'Avatar Homem', gender: 'Homem', url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=250' },
  { label: 'Avatar Mulher', gender: 'Mulher', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250' },
];

// =====================================================================
// Componente principal do painel do Super Admin
// =====================================================================
export const SuperAdminView: React.FC = () => {
  // =====================================================================
  // Desestruturação do contexto useSST: dados globais e funções de CRUD
  // =====================================================================
  const { 
    // --- Empresas: lista global e CRUD ---
    empresas, 
    adicionarEmpresa, 
    editarEmpresa, 
    excluirEmpresa,
    // --- Setores: lista global e CRUD ---
    setores, 
    adicionarSetor, 
    editarSetor, 
    excluirSetor,
    // --- Usuários: lista global, CRUD e importação em lote (CSV) ---
    usuarios, 
    adicionarUsuario, 
    adicionarUsuariosLote,
    editarUsuario, 
    excluirUsuario,
    // --- Campanhas: CRUD e seleção de perguntas do acervo ---
    campanhas, 
    criarCampanha, 
    editarCampanha, 
    excluirCampanha,
    // --- Banco de perguntas e quizzes do sistema ---
    perguntas,
    quizzes,
    // --- Empresa atual do contexto (usada no reset comercial) ---
    empresa,
    setEmpresa,
    // --- Usuário logado (Super Admin) ---
    currentUser,
    // --- Ações de backup, restauração e reset de fábrica ---
    gerarBackupSistema,
    restaurarBackupSistema,
    excluirBackupHistorico,
    executarResetFabricaComercial,
    historicoBackups
  } = useSST();

  // Estados de mensagens de erro de validação dos formulários
  const [empresaErrorMsg, setEmpresaErrorMsg] = useState('');
  const [setorErrorMsg, setSetorErrorMsg] = useState('');
  const [userErrorMsg, setUserErrorMsg] = useState('');
  const [campanhaErrorMsg, setCampanhaErrorMsg] = useState('');

  // Estados da interface de Reset Comercial e Backup
  const [showResetModal, setShowResetModal] = useState(false);
  const [showPreviewModalUsuarios, setShowPreviewModalUsuarios] = useState(false);
  const [previewDataUsuarios, setPreviewDataUsuarios] = useState<{ items: any[]; errors: string[] } | null>(null);
  const [confirmResetText, setConfirmResetText] = useState('');
  const [backupNotice, setBackupNotice] = useState<{ type: 'success' | 'error'; msg: string; details?: string } | null>(null);
  const [empresaFiltroBackup, setEmpresaFiltroBackup] = useState<string>('todas');
  const [empresaDestinoRestaurar, setEmpresaDestinoRestaurar] = useState<string>('auto');
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  // Filtros do histórico de backups (empresa, data, tipo e busca)
  const [filtroEmpresaHistorico, setFiltroEmpresaHistorico] = useState<string>('todas');
  const [filtroDataHistorico, setFiltroDataHistorico] = useState<string>('');
  const [filtroTipoHistorico, setFiltroTipoHistorico] = useState<string>('todos');
  const [buscaHistorico, setBuscaHistorico] = useState<string>('');

  // Estado do modal de confirmação de restauração de backup
  const [restoreModalData, setRestoreModalData] = useState<{
    isOpen: boolean;
    jsonContent: string;
    targetEmpresaId?: string;
    resumo: string;
    tipo: string;
    dataStr: string;
    escopo: string;
    empresaNome?: string;
  } | null>(null);

  // Estado do modal genérico de confirmação de segurança (excluir/editar)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description?: string;
    itemName: string;
    actionType: 'delete' | 'edit';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: undefined,
    itemName: '',
    actionType: 'delete',
    onConfirm: () => {},
  });

  // Aba ativa do painel (Empresas / Setores / Usuários / Campanhas / Backup)
  const [activeSubTab, setActiveSubTab] = useState<'empresas' | 'setores' | 'usuarios' | 'campanhas' | 'backup'>('empresas');

  // Filtro de empresa selecionada usado nas abas de Setores/Usuários/Campanhas
  const [selectedEmpresaFilter, setSelectedEmpresaFilter] = useState<string>(empresas[0]?.id || 'emp-1');

  // Visibilidade dos modais de criação
  const [showNovaEmpresaModal, setShowNovaEmpresaModal] = useState(false);
  const [showNovoSetorModal, setShowNovoSetorModal] = useState(false);
  const [showNovoUsuarioModal, setShowNovoUsuarioModal] = useState(false);
  const [showNovaCampanhaModal, setShowNovaCampanhaModal] = useState(false);

  // Entidades em modo de edição (abre os modais de edição)
  const [empresaParaEditar, setEmpresaParaEditar] = useState<Empresa | null>(null);
  const [setorParaEditar, setSetorParaEditar] = useState<Setor | null>(null);
  const [usuarioParaEditar, setUsuarioParaEditar] = useState<Usuario | null>(null);

  // Estados do formulário de Empresa
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [cnpjEmpresa, setCnpjEmpresa] = useState('');
  const [planoEmpresa, setPlanoEmpresa] = useState<'Basic' | 'Pro' | 'Enterprise'>('Pro');
  const [limiteColabs, setLimiteColabs] = useState(150);

  // Estados do formulário de Setor
  const [nomeSetor, setNomeSetor] = useState('');
  const [targetEmpresaSetor, setTargetEmpresaSetor] = useState(selectedEmpresaFilter);

  // Estados do formulário de Usuário
  const [nomeUser, setNomeUser] = useState('');
  const [emailUser, setEmailUser] = useState('');
  const [senhaUser, setSenhaUser] = useState('');
  const [confirmSenhaUser, setConfirmSenhaUser] = useState('');
  const [cargoUser, setCargoUser] = useState('');
  const [targetEmpresaUser, setTargetEmpresaUser] = useState(selectedEmpresaFilter);
  const [targetSetorUser, setTargetSetorUser] = useState(setores[0]?.id || '');
  const [perfilUser, setPerfilUser] = useState<'colaborador' | 'admin' | 'super_admin'>('colaborador');
  const [isInstrutorUser, setIsInstrutorUser] = useState(false);
  const [avatarUser, setAvatarUser] = useState('');
  const [showCameraModal, setShowCameraModal] = useState(false);

  // Estados da importação em lote de usuários via CSV
  const [showCSVUsuariosModal, setShowCSVUsuariosModal] = useState(false);
  const [csvTextUsuarios, setCsvTextUsuarios] = useState('');
  const [csvErrorMsgUsuarios, setCsvErrorMsgUsuarios] = useState('');
  const [csvSuccessMsgUsuarios, setCsvSuccessMsgUsuarios] = useState('');
  const csvUsuariosFileInputRef = useRef<HTMLInputElement>(null);

  // Referências dos inputs ocultos de upload de imagem (criar e editar usuário)
  const galleryInputRefUser = useRef<HTMLInputElement>(null);
  const editGalleryInputRefUser = useRef<HTMLInputElement>(null);

  // Faz upload de foto do usuário: valida tamanho (máx. 10MB) e comprime para base64
  const handleFileUploadUser = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('A foto deve ter no máximo 10MB.');
        return;
      }
      try {
        const compressed = await compressImageFile(file, 400, 400, 0.82);
        setAvatarUser(compressed);
      } catch (err: any) {
        alert('Erro ao processar a imagem da galeria.');
      }
    }
    e.target.value = '';
  };

  // Estados do formulário de Campanha
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [descCampanha, setDescCampanha] = useState('');
  const [freqCampanha, setFreqCampanha] = useState<'diaria' | 'semanal' | 'personalizada'>('diaria');
  const [targetEmpresaCampanha, setTargetEmpresaCampanha] = useState(selectedEmpresaFilter);
  const [dataInicio, setDataInicio] = useState(new Date().toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(new Date(Date.now() + 30*86400000).toISOString().split('T')[0]);
  const [horarioDisparo, setHorarioDisparo] = useState('08:00');
  const [selectedPerguntaIds, setSelectedPerguntaIds] = useState<string[]>([]);

  // Estatísticas globais exibidas nos cartões de KPI
  const totalEmpresas = empresas.length;
  const totalUsuariosGlobal = usuarios.length;
  const empresasAtivas = empresas.filter(e => e.ativa).length;

  // =====================================================================
  // Handlers (funções de envio dos formulários e ações da interface)
  // =====================================================================
  // Cria uma nova empresa validando nome, CNPJ e limite de colaboradores
  const handleCriarEmpresa = (e: React.FormEvent) => {
    e.preventDefault();
    setEmpresaErrorMsg('');

    if (!nomeEmpresa.trim()) {
      setEmpresaErrorMsg('Por favor, informe o Nome da Empresa.');
      return;
    }

    if (!cnpjEmpresa.trim() || !validarCNPJ(cnpjEmpresa)) {
      setEmpresaErrorMsg('CNPJ inválido! Digite um CNPJ válido com 14 dígitos.');
      return;
    }

    if (!limiteColabs || limiteColabs <= 0) {
      setEmpresaErrorMsg('O limite de colaboradores deve ser um valor maior que zero.');
      return;
    }

    adicionarEmpresa({
      nome: nomeEmpresa.trim(),
      cnpj: formatarCNPJ(cnpjEmpresa),
      plano: planoEmpresa,
      ativa: true,
      data_contratacao: new Date().toISOString().split('T')[0],
      limite_colaboradores: limiteColabs,
      configuracoes: {
        limiteDesafiosSemana: 5,
        pontosVitoriaDesafio: 50,
        perguntasPorDesafio: 5,
        desempateRule: 'desafiante',
        tempoLimiteAceiteHoras: 24,
        permitirAmistosos: true,
        permitirMesmoSetorAmistoso: true,
        percentualMinimoParticipacao: 50,
      },
    });

    setShowNovaEmpresaModal(false);
    setNomeEmpresa('');
    setCnpjEmpresa('');
    setEmpresaErrorMsg('');
  };

  // Cria um novo setor vinculado à empresa de destino selecionada
  const handleCriarSetor = (e: React.FormEvent) => {
    e.preventDefault();
    setSetorErrorMsg('');

    if (!nomeSetor.trim()) {
      setSetorErrorMsg('Por favor, digite o nome do setor.');
      return;
    }

    if (!targetEmpresaSetor) {
      setSetorErrorMsg('Selecione uma empresa de destino para o setor.');
      return;
    }

    adicionarSetor(nomeSetor.trim(), targetEmpresaSetor);
    setShowNovoSetorModal(false);
    setNomeSetor('');
    setSetorErrorMsg('');
  };

  // Cria um novo usuário validando nome, e-mail e senha (com setor vinculado à empresa)
  const handleCriarUsuario = (e: React.FormEvent) => {
    e.preventDefault();
    setUserErrorMsg('');

    if (!nomeUser.trim()) {
      setUserErrorMsg('Por favor, digite o nome completo do usuário.');
      return;
    }

    if (!emailUser.trim() || !validarEmail(emailUser)) {
      setUserErrorMsg('E-mail inválido! Digite um endereço de e-mail corporativo válido (ex: nome@empresa.com.br).');
      return;
    }

    if ((senhaUser || confirmSenhaUser) && senhaUser !== confirmSenhaUser) {
      setUserErrorMsg('As senhas digitadas não coincidem! Verifique e repita a senha corretamente.');
      return;
    }

    if (senhaUser && senhaUser.trim().length < 6) {
      setUserErrorMsg('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    // Garante que o setor escolhido pertença à empresa de destino
    let validSetorId = targetSetorUser;
    const companySetors = setores.filter(s => s.empresa_id === targetEmpresaUser);
    if (!companySetors.some(s => s.id === validSetorId)) {
      validSetorId = companySetors[0]?.id || '';
    }

    adicionarUsuario({
      nome: nomeUser.trim(),
      email: emailUser.trim(),
      senha: senhaUser.trim() || undefined,
      cargo: cargoUser.trim() || 'Colaborador SST',
      empresa_id: targetEmpresaUser,
      setor_id: validSetorId,
      perfil: perfilUser,
      is_instrutor: isInstrutorUser,
      avatar: avatarUser || PRESET_AVATARS[0].url,
    });

    setShowNovoUsuarioModal(false);
    setNomeUser('');
    setEmailUser('');
    setSenhaUser('');
    setConfirmSenhaUser('');
    setCargoUser('');
    setIsInstrutorUser(false);
    setAvatarUser('');
    setUserErrorMsg('');
  };

  // Importação em lote de usuários via CSV (Super Admin)
  const handleImportarCSVUsuarios = (e: React.FormEvent) => {
    e.preventDefault();
    setCsvErrorMsgUsuarios('');
    setCsvSuccessMsgUsuarios('');

    if (!csvTextUsuarios.trim()) {
      setCsvErrorMsgUsuarios('Cole o conteúdo CSV para importar.');
      return;
    }

    // Faz o parsing do texto CSV e adiciona os usuários na empresa selecionada
    const importados = parseUsuariosCSV(csvTextUsuarios);

    if (importados.items && importados.items.length > 0) {
      setPreviewDataUsuarios({ items: importados.items, errors: importados.errors || [] });
      setShowPreviewModalUsuarios(true);
    } else {
      setCsvErrorMsgUsuarios('Nenhum usuário válido encontrado no CSV. Verifique a formatação do cabeçalho.');
    }
  };

  const handleConfirmarImportacaoUsuarios = () => {
    if (!previewDataUsuarios) return;
    const { items } = previewDataUsuarios;
    adicionarUsuariosLote(items, selectedEmpresaFilter);
    setCsvSuccessMsgUsuarios(`${items.length} usuários foram importados com sucesso para a empresa selecionada!`);
    setShowPreviewModalUsuarios(false);
    setPreviewDataUsuarios(null);
    setTimeout(() => {
      setShowCSVUsuariosModal(false);
      setCsvTextUsuarios('');
      setCsvSuccessMsgUsuarios('');
    }, 1500);
  };

  // Cria uma campanha global para a empresa alvo com perguntas selecionadas do acervo
  const handleCriarCampanhaGlobal = (e: React.FormEvent) => {
    e.preventDefault();
    setCampanhaErrorMsg('');

    if (!nomeCampanha.trim()) {
      setCampanhaErrorMsg('Por favor, digite o nome da campanha.');
      return;
    }

    if (!targetEmpresaCampanha) {
      setCampanhaErrorMsg('Selecione uma empresa alvo para a campanha.');
      return;
    }

    if (dataFim && dataInicio && dataFim < dataInicio) {
      setCampanhaErrorMsg('A data de término não pode ser anterior à data de início.');
      return;
    }

    criarCampanha({
      empresa_id: targetEmpresaCampanha,
      nome: nomeCampanha.trim(),
      descricao: descCampanha.trim() || 'Campanha de Conscientização de Segurança',
      frequencia: freqCampanha,
      setores_alvo: ['todos'],
      quantidade_perguntas: selectedPerguntaIds.length || 5,
      pergunta_ids: selectedPerguntaIds,
      data_inicio: dataInicio,
      data_fim: dataFim,
      horario_disparo: horarioDisparo,
      ativa: true,
    });

    setShowNovaCampanhaModal(false);
    setNomeCampanha('');
    setDescCampanha('');
    setSelectedPerguntaIds([]);
    setCampanhaErrorMsg('');
  };

  // Marca/desmarca uma pergunta na seleção do banco de questões
  const toggleSelectPergunta = (id: string) => {
    if (selectedPerguntaIds.includes(id)) {
      setSelectedPerguntaIds(prev => prev.filter(pId => pId !== id));
    } else {
      setSelectedPerguntaIds(prev => [...prev, id]);
    }
  };

  // =====================================================================
  // Handlers de abertura de modais de CADASTRO (limpam o formulário antes)
  // =====================================================================
  // CORREÇÃO: evita que, ao abrir "Cadastrar Empresa/Setor/Usuário", o formulário
  // fique pré-preenchido com os dados da última edição realizada.
  const handleAbrirNovaEmpresa = () => {
    setEmpresaParaEditar(null);
    setNomeEmpresa('');
    setCnpjEmpresa('');
    setPlanoEmpresa('Basic');
    setLimiteColabs(50);
    setShowNovaEmpresaModal(true);
  };

  const handleAbrirNovoSetor = () => {
    setSetorParaEditar(null);
    setNomeSetor('');
    setShowNovoSetorModal(true);
  };

  const handleAbrirNovoUsuario = () => {
    setUsuarioParaEditar(null);
    setNomeUser('');
    setEmailUser('');
    setSenhaUser('');
    setConfirmSenhaUser('');
    setCargoUser('');
    setPerfilUser('colaborador');
    setIsInstrutorUser(false);
    setAvatarUser('');
    setUserErrorMsg('');
    setShowNovoUsuarioModal(true);
  };

  // =====================================================================
  // Renderização da interface (JSX)
  // =====================================================================
  return (
    <div className="space-y-6 pb-12">
      
      {/* Banner do cabeçalho — exclusivo do Super Admin (multi-empresas) */}
      <div className="bg-gradient-to-r from-slate-950 via-indigo-950/80 to-purple-950 border border-purple-500/30 rounded-2xl p-6 text-white shadow-2xl flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-500/40 backdrop-blur-md">
            <Globe className="w-7 h-7 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-black text-white">Super Administração Global</h1>
              <span className="bg-purple-500/20 text-purple-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-purple-500/40 uppercase">
                Multi-Empresas
              </span>
            </div>
            <p className="text-xs text-purple-200/80 mt-0.5">
              Gestão completa de Empresas, Setores, Usuários e Campanhas com seleção de questões do banco.
            </p>
          </div>
        </div>

        {/* Botão de ação principal que muda conforme a aba ativa */}
        <div className="flex items-center space-x-2">
          {activeSubTab === 'empresas' && (
            <button
              onClick={handleAbrirNovaEmpresa}
              className="bg-purple-600 hover:bg-purple-500 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Empresa</span>
            </button>
          )}

          {activeSubTab === 'setores' && (
            <button
              onClick={handleAbrirNovoSetor}
              className="bg-purple-600 hover:bg-purple-500 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center space-x-2"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Cadastrar Setor</span>
            </button>
          )}

          {activeSubTab === 'usuarios' && (
            <button
              onClick={handleAbrirNovoUsuario}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center space-x-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Cadastrar Usuário</span>
            </button>
          )}

          {activeSubTab === 'campanhas' && (
            <button
              onClick={() => setShowNovaCampanhaModal(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-lg transition-all flex items-center space-x-2"
            >
              <Target className="w-4 h-4" />
              <span>Criar Campanha Global</span>
            </button>
          )}
        </div>
      </div>

      {/* Indicadores globais (KPIs): empresas, usuários, perguntas e campanhas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-white shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Empresas Cadastradas</span>
            <Building2 className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-black text-white">{totalEmpresas}</div>
          <div className="text-[11px] text-emerald-400 font-bold">{empresasAtivas} empresas ativas</div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-white shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Usuários Totais</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-black text-white">{totalUsuariosGlobal}</div>
          <div className="text-[11px] text-slate-400">Em todas as empresas</div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-white shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Banco de Perguntas</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-white">{perguntas.length}</div>
          <div className="text-[11px] text-slate-400">Perguntas cadastradas no acervo</div>
        </div>

        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-white shadow-xl space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Campanhas Ativas</span>
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{campanhas.filter(c => c.ativa).length}</div>
          <div className="text-[11px] text-emerald-300 font-bold">Disparos automáticos ativados</div>
        </div>
      </div>

      {/* Barra de navegação por abas (Empresas / Setores / Usuários / Campanhas / Backup) */}
      <div className="flex items-center space-x-2 border-b border-white/10 pb-3">
        <button
          onClick={() => setActiveSubTab('empresas')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeSubTab === 'empresas' 
              ? 'bg-purple-600 text-white shadow-lg' 
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Empresas ({empresas.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('setores')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeSubTab === 'setores' 
              ? 'bg-purple-600 text-white shadow-lg' 
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <FolderPlus className="w-4 h-4" />
          <span>Setores por Empresa</span>
        </button>

        <button
          onClick={() => setActiveSubTab('usuarios')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeSubTab === 'usuarios' 
              ? 'bg-purple-600 text-white shadow-lg' 
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Usuários ({usuarios.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('campanhas')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeSubTab === 'campanhas' 
              ? 'bg-purple-600 text-white shadow-lg' 
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>Campanhas & Questões ({campanhas.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('backup')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeSubTab === 'backup' 
              ? 'bg-amber-500 text-slate-950 font-black shadow-lg' 
              : 'bg-white/5 text-slate-300 hover:bg-white/10'
          }`}
        >
          <Database className="w-4 h-4 text-amber-400" />
          <span>Backup & Reset Comercial</span>
        </button>
      </div>

      {/* =====================================================================
          ABA 1: EMPRESAS — tabela de clientes com CNPJ, plano, usuários,
          status e ações (editar, acessar e excluir com cascade delete)
          ===================================================================== */}
      {activeSubTab === 'empresas' && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-base font-extrabold text-white flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-purple-400" />
              <span>Gerenciamento de Clientes & Licenças Corporativas</span>
            </h2>
            <button
              onClick={handleAbrirNovaEmpresa}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Empresa</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px] border-b border-white/10">
                <tr>
                  <th className="p-3">Empresa</th>
                  <th className="p-3">CNPJ</th>
                  <th className="p-3">Plano</th>
                  <th className="p-3">Usuários</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {empresas.map(e => {
                  const numUsers = usuarios.filter(u => u.empresa_id === e.id).length;
                  return (
                    <tr key={e.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-3 font-bold text-white flex items-center space-x-2">
                        <Building2 className="w-4 h-4 text-purple-400" />
                        <span>{e.nome}</span>
                      </td>
                      <td className="p-3 text-slate-400">{e.cnpj}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          e.plano === 'Enterprise' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40' : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        }`}>
                          {e.plano}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300">{numUsers} / {e.limite_colaboradores || 100}</td>
                      <td className="p-3">
                        <button
                          onClick={() => editarEmpresa(e.id, { ativa: !e.ativa })}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            e.ativa !== false ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          }`}
                        >
                          {e.ativa !== false ? 'Ativa' : 'Inativa'}
                        </button>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEmpresaParaEditar(e);
                            setNomeEmpresa(e.nome);
                            setCnpjEmpresa(e.cnpj);
                            setPlanoEmpresa(e.plano as any);
                            setLimiteColabs(e.limite_colaboradores || 150);
                          }}
                          className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 p-1.5 rounded-lg border border-blue-500/40"
                          title="Editar Empresa"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setEmpresa(e);
                            alert(`Empresa selecionada: ${e.nome}. Use o menu "Empresas" para alternar o status ativo ou navegar entre empresas.`);
                          }}
                          className="bg-white/5 hover:bg-white/10 text-slate-200 text-[10px] font-bold px-2 py-1 rounded-lg border border-white/10"
                        >
                          Acessar
                        </button>
                        <button
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: 'Confirmar Exclusão de Empresa (Cascade Delete)',
                              itemName: `Empresa: ${e.nome} (CNPJ: ${e.cnpj}). ATENÇÃO: Todos os usuários, setores, campanhas e cadastros vinculados serão excluídos permanentemente!`,
                              actionType: 'delete',
                              onConfirm: () => excluirEmpresa(e.id),
                            });
                          }}
                          className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 p-1.5 rounded-lg border border-rose-500/40"
                          title="Excluir Empresa e Todos os Registros Vinculados"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 2: SETORES — cards de departamentos filtrados por empresa,
          com opções de editar e excluir
          ===================================================================== */}
      {activeSubTab === 'setores' && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3 border-b border-white/10 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center space-x-2">
                <FolderPlus className="w-5 h-5 text-purple-400" />
                <span>Gestão Global de Setores por Empresa</span>
              </h2>
              <p className="text-xs text-slate-400">Selecione uma empresa para cadastrar ou gerenciar seus departamentos.</p>
            </div>

            <div className="flex items-center space-x-3">
              <select
                value={selectedEmpresaFilter}
                onChange={(e) => {
                  setSelectedEmpresaFilter(e.target.value);
                  setTargetEmpresaSetor(e.target.value);
                }}
                className="bg-slate-900 border border-white/15 rounded-xl text-xs px-3 py-2 text-white"
              >
                {empresas.map(e => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>

              <button
                onClick={() => {
                  setTargetEmpresaSetor(selectedEmpresaFilter);
                  handleAbrirNovoSetor();
                }}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Novo Setor</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {setores.filter(s => s.empresa_id === selectedEmpresaFilter).map(s => {
              const numColabs = usuarios.filter(u => u.setor_id === s.id).length;
              return (
                <div key={s.id} className="bg-slate-900/60 border border-white/10 rounded-xl p-4 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-extrabold text-white text-sm">{s.nome}</div>
                    <div className="text-slate-400 text-[11px] mt-0.5">{numColabs} colaboradores cadastrados</div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => {
                        setSetorParaEditar(s);
                        setNomeSetor(s.nome);
                        setTargetEmpresaSetor(s.empresa_id);
                      }}
                      className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 p-1.5 rounded-lg border border-blue-500/40"
                      title="Editar Setor"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Confirmar Exclusão de Setor',
                          itemName: `Setor: ${s.nome}`,
                          actionType: 'delete',
                          onConfirm: () => excluirSetor(s.id),
                        });
                      }}
                      className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 p-1.5 rounded-lg border border-rose-500/40"
                      title="Excluir Setor"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 3: USUÁRIOS — cards de colaboradores/administradores da
          empresa selecionada, com status, edição e exclusão
          ===================================================================== */}
      {activeSubTab === 'usuarios' && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3 border-b border-white/10 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center space-x-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <span>Gestão Global de Usuários e Administradores</span>
              </h2>
              <p className="text-xs text-slate-400">Cadastre colaboradores ou gerentes para qualquer empresa cadastrada na plataforma.</p>
            </div>

            <div className="flex items-center space-x-3">
              <select
                value={selectedEmpresaFilter}
                onChange={(e) => {
                  setSelectedEmpresaFilter(e.target.value);
                  setTargetEmpresaUser(e.target.value);
                }}
                className="bg-slate-900 border border-white/15 rounded-xl text-xs px-3 py-2 text-white"
              >
                {empresas.map(e => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>

              <button
                onClick={() => {
                  setTargetEmpresaUser(selectedEmpresaFilter);
                  handleAbrirNovoUsuario();
                }}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold px-3 py-2 rounded-xl flex items-center space-x-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Novo Usuário</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {usuarios.filter(u => u.empresa_id === selectedEmpresaFilter).map(u => {
              const setorObj = setores.find(s => s.id === u.setor_id);
              return (
                <div key={u.id} className="bg-slate-900/60 border border-white/10 rounded-xl p-3.5 flex items-center justify-between space-x-3">
                  <img src={u.avatar} alt={u.nome} className="w-10 h-10 rounded-full object-cover border border-emerald-500/30 shrink-0" />
                  <div className="flex-1 min-w-0 space-y-0.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-white truncate">{u.nome}</div>
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
                    <div className="text-[11px] text-slate-300 truncate">{u.cargo}</div>
                    <div className="text-[10px] text-slate-400 truncate">{setorObj?.nome || 'Geral'} • {u.email}</div>
                  </div>
                  <div className="flex items-center space-x-1 shrink-0">
                    <button
                      onClick={() => {
                        setUsuarioParaEditar(u);
                        setNomeUser(u.nome || '');
                        setEmailUser(u.email || '');
                        setCargoUser(u.cargo || '');
                        setTargetEmpresaUser(u.empresa_id || '');
                        setTargetSetorUser(u.setor_id || '');
                        setPerfilUser(u.perfil || 'colaborador');
                        setIsInstrutorUser(u.is_instrutor === true);
                        setAvatarUser(u.avatar || PRESET_AVATARS[0].url);
                        // CORREÇÃO: limpa os campos de senha na edição para não
                        // vazar a senha digitada em um cadastro anterior para outro usuário.
                        setSenhaUser('');
                        setConfirmSenhaUser('');
                      }}
                      className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 p-1.5 rounded-lg border border-blue-500/40"
                      title="Editar Usuário"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
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
                      className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 p-1.5 rounded-lg border border-rose-500/40"
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
      )}

      {/* =====================================================================
          ABA 4: CAMPANHAS & PERGUNTAS — lista de campanhas da empresa
          selecionada com status, frequência, período e horário de disparo
          ===================================================================== */}
      {activeSubTab === 'campanhas' && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3 border-b border-white/10 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center space-x-2">
                <Target className="w-5 h-5 text-blue-400" />
                <span>Campanhas Globais & Escolha do Banco de Questões</span>
              </h2>
              <p className="text-xs text-slate-400">Monte campanhas personalizadas selecionando perguntas específicas do acervo.</p>
            </div>

            <div className="flex items-center space-x-3">
              <select
                value={selectedEmpresaFilter}
                onChange={(e) => {
                  setSelectedEmpresaFilter(e.target.value);
                  setTargetEmpresaCampanha(e.target.value);
                }}
                className="bg-slate-900 border border-white/15 rounded-xl text-xs px-3 py-2 text-white"
              >
                {empresas.map(e => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </select>

              <button
                onClick={() => {
                  setTargetEmpresaCampanha(selectedEmpresaFilter);
                  setShowNovaCampanhaModal(true);
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Criar Campanha</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {campanhas.filter(c => c.empresa_id === selectedEmpresaFilter).map(c => (
              <div key={c.id} className="bg-slate-900/60 border border-white/10 rounded-xl p-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-extrabold text-white text-sm flex items-center space-x-2">
                    <Target className="w-4 h-4 text-blue-400" />
                    <span>{c.nome}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => editarCampanha(c.id, { ativa: !c.ativa })}
                      className={`text-[10px] px-2 py-0.5 rounded-full border font-bold transition-all ${
                        c.ativa ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border-rose-500/30 hover:bg-rose-500/30'
                      }`}
                      title="Alternar Status (Ativa/Inativa)"
                    >
                      {c.ativa ? 'Ativa' : 'Inativa'}
                    </button>
                    <span className="bg-blue-500/20 text-blue-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-blue-500/40">
                      Frequência: {c.frequencia}
                    </span>
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Confirmar Exclusão de Campanha',
                          itemName: `Campanha: ${c.nome}`,
                          actionType: 'delete',
                          onConfirm: () => excluirCampanha(c.id),
                        });
                      }}
                      className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 p-1.5 rounded-lg border border-rose-500/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-slate-300">{c.descricao}</p>
                <div className="text-[11px] text-slate-400 flex items-center space-x-4">
                  <span>Perguntas selecionadas: <strong className="text-white">{c.pergunta_ids?.length || c.quantidade_perguntas}</strong></span>
                  <span>Período: <strong className="text-slate-200">{c.data_inicio} até {c.data_fim}</strong></span>
                  <span>Disparo: <strong className="text-slate-200">{c.horario_disparo}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 5: BACKUP & RESET COMERCIAL — central de backup/restauração
          JSON, histórico sincronizado com o Supabase e reset de fábrica
          ===================================================================== */}
      {activeSubTab === 'backup' && (
        <div className="space-y-6">
          
          {/* Banner do cabeçalho da central de backup */}
          <div className="bg-gradient-to-r from-amber-950/40 via-purple-950/40 to-slate-900/80 backdrop-blur-xl border border-amber-500/30 rounded-2xl p-6 text-white shadow-xl space-y-3">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/40">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white">Central de Backup, Restauração e Reset do Banco de Dados</h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Proteção de dados completa, restauração preventiva por arquivos JSON e comando de limpeza para lançamento comercial do app.
                </p>
              </div>
            </div>
          </div>

          {/* Aviso de feedback (sucesso/erro) das operações de backup */}
          {backupNotice && (
            <div className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
              backupNotice.type === 'success' 
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200' 
                : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
            }`}>
              <div>
                <div className="font-extrabold text-sm">{backupNotice.msg}</div>
                {backupNotice.details && <div className="text-[11px] opacity-90 mt-0.5">{backupNotice.details}</div>}
              </div>
              <button onClick={() => setBackupNotice(null)} className="text-white/60 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Grade de cartões de ação (Backup manual e Restauração) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Cartão 1: Backup Manual em JSON */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Backup Manual em JSON (Isolado)</h3>
                  <p className="text-xs text-slate-400">Gere backup de todas as empresas ou selecione uma específica.</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Escopo do Backup / Empresa Alvo:</label>
                <select
                  value={empresaFiltroBackup}
                  onChange={(e) => setEmpresaFiltroBackup(e.target.value)}
                  className="w-full bg-slate-900/80 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="todas">🌐 TODAS AS EMPRESAS (Backup Global do Sistema)</option>
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      🏢 {emp.nome} ({emp.cnpj || 'Sem CNPJ'})
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {empresaFiltroBackup === 'todas'
                  ? 'Exporta a estrutura completa de todas as empresas, setores, colaboradores, perguntas e campanhas do banco de dados.'
                  : `Exporta EXCLUSIVAMENTE os registros isolados da empresa selecionada (${empresas.find(e => e.id === empresaFiltroBackup)?.nome || ''}), garantindo total privacidade e facilidade para restauração dedicada.`}
              </p>

              <button
                onClick={() => {
                  const res = gerarBackupSistema('manual', empresaFiltroBackup);
                  setBackupNotice({
                    type: 'success',
                    msg: 'Backup manual gerado com sucesso!',
                    details: `Arquivo ${res.filename} gerado e salvo no histórico.`
                  });
                }}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-xs py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>GERAR & BAIXAR BACKUP AGORA</span>
              </button>
            </div>

            {/* Cartão 2: Restaurar Backup via arquivo JSON */}
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-white">Restaurar Dados via Backup JSON</h3>
                  <p className="text-xs text-slate-400">Recupere informações globais ou de uma empresa individual.</p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Empresa de Destino da Restauração:</label>
                <select
                  value={empresaDestinoRestaurar}
                  onChange={(e) => setEmpresaDestinoRestaurar(e.target.value)}
                  className="w-full bg-slate-900/80 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="auto">⚡ Automático (Detectar do arquivo JSON enviado)</option>
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      🎯 Forçar em: {emp.nome}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Ao restaurar um arquivo de empresa específica, <strong>somente os dados daquela empresa são sobrescritos</strong>, sem afetar ou alterar o cadastro das outras empresas presentes no sistema!
              </p>

              {/* Input de arquivo oculto: lê o JSON do backup, valida o formato
                  e abre o modal de confirmação de restauração */}
              <input 
                type="file"
                ref={jsonFileInputRef}
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const content = event.target?.result as string;
                      if (content) {
                        try {
                          // Analisa o JSON enviado e detecta se é escopo empresa ou global
                          const parsed = JSON.parse(content);
                          const isEmp = parsed.escopo === 'empresa' || (parsed.empresas && parsed.empresas.length === 1);
                          const targetEmpId = empresaDestinoRestaurar === 'auto' ? (parsed.empresaId || parsed.empresas?.[0]?.id) : empresaDestinoRestaurar;
                          const targetEmpObj = empresas.find(e => e.id === targetEmpId);

                          setRestoreModalData({
                            isOpen: true,
                            jsonContent: content,
                            targetEmpresaId: targetEmpId,
                            resumo: `Arquivo enviado: ${file.name} (${Math.round(file.size / 1024)} KB)`,
                            tipo: parsed.tipo || 'manual',
                            dataStr: parsed.dataExportacao ? new Date(parsed.dataExportacao).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR'),
                            escopo: isEmp ? 'empresa' : 'global',
                            empresaNome: targetEmpObj?.nome || parsed.empresaNome || (isEmp ? targetEmpId : 'Global')
                          });
                        } catch (err: any) {
                          setBackupNotice({
                            type: 'error',
                            msg: 'Arquivo JSON inválido ou corrompido.',
                            details: `Erro na leitura: ${err?.message || 'Formato incompatível'}`
                          });
                        }
                      }
                    };
                    reader.readAsText(file);
                  }
                  e.target.value = '';
                }}
              />

              <button
                onClick={() => jsonFileInputRef.current?.click()}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs py-3 px-4 rounded-xl shadow-lg transition-all flex items-center justify-center space-x-2"
              >
                <Upload className="w-4 h-4 fill-slate-950" />
                <span>SELECIONAR ARQUIVO JSON PARA RESTAURAR</span>
              </button>
            </div>

          </div>

          {/* Tabela do histórico de backups com filtros (empresa, tipo, data, busca) */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <RotateCcw className="w-5 h-5 text-amber-400" />
                <span>Histórico de Backups Automáticos & Snapshots</span>
              </h3>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-full border border-emerald-500/30 font-bold">
                  Auto-Backup em Nuvem e Local: Ativo
                </span>
                {historicoBackups.length > 0 && (
                  <button
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        title: 'Confirmar Limpeza do Histórico de Backups',
                        description: 'Esta ação irá excluir todos os registros do histórico de backups. Os arquivos não poderão ser recuperados após a confirmação.',
                        itemName: `Todos os backups (${historicoBackups.length} registros)`,
                        actionType: 'delete',
                        onConfirm: () => {
                          historicoBackups.forEach(b => excluirBackupHistorico(b.id));
                          setBackupNotice({
                            type: 'success',
                            msg: 'Histórico de backups totalmente limpo com sucesso!',
                            details: 'Espaço de armazenamento liberado no banco de dados.'
                          });
                        }
                      });
                    }}
                    className="text-[11px] bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 font-bold px-2.5 py-1 rounded-full border border-rose-500/30 transition-all flex items-center space-x-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Limpar Histórico</span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-3 bg-slate-900/60 border border-white/10 rounded-xl text-xs text-slate-300 space-y-1">
              <p className="font-bold text-amber-300 flex items-center space-x-1">
                <span>📍 Onde ficam armazenados os backups automáticos?</span>
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Os backups automáticos são salvos no <strong>Armazenamento Seguro do Navegador (LocalStorage/IndexedDB)</strong> e sincronizados instantaneamente na tabela <strong><code className="text-emerald-400 bg-slate-950 px-1 py-0.5 rounded">public.backups_historico</code></strong> no banco de dados Supabase/PostgreSQL. Você pode restaurar qualquer snapshot histórico com confirmação de segurança ou excluí-lo para liberar espaço!
              </p>
            </div>

            {/* BARRA DE FILTROS DO HISTÓRICO */}
            <div className="p-3 bg-slate-900/80 border border-white/10 rounded-xl space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-bold text-slate-300">
                <span className="flex items-center space-x-1 text-amber-300">
                  <span>🔍 Filtros de Busca no Histórico:</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  Exibindo {
                    historicoBackups.filter((bkp) => {
                      if (filtroEmpresaHistorico !== 'todas') {
                        if (filtroEmpresaHistorico === 'global') {
                          if (bkp.escopo !== 'global') return false;
                        } else {
                          if (bkp.empresaId !== filtroEmpresaHistorico) return false;
                        }
                      }
                      if (filtroTipoHistorico !== 'todos' && bkp.tipo !== filtroTipoHistorico) return false;
                      if (filtroDataHistorico) {
                        const isoDate = bkp.data.slice(0, 10);
                        const brDate = new Date(bkp.data).toLocaleDateString('pt-BR');
                        if (!isoDate.includes(filtroDataHistorico) && !brDate.includes(filtroDataHistorico)) return false;
                      }
                      if (buscaHistorico.trim()) {
                        const term = buscaHistorico.toLowerCase().trim();
                        const resumoMatch = (bkp.resumo || '').toLowerCase().includes(term);
                        const empresaMatch = (bkp.empresaNome || '').toLowerCase().includes(term);
                        if (!resumoMatch && !empresaMatch) return false;
                      }
                      return true;
                    }).length
                  } de {historicoBackups.length} registros
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                {/* Filtro Empresa */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Empresa / Escopo:</label>
                  <select
                    value={filtroEmpresaHistorico}
                    onChange={(e) => setFiltroEmpresaHistorico(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="todas">🌐 Todas as Empresas / Escopos</option>
                    <option value="global">🌐 Apenas Globais (Sistema)</option>
                    {empresas.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        🏢 {emp.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro Tipo */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Tipo do Backup:</label>
                  <select
                    value={filtroTipoHistorico}
                    onChange={(e) => setFiltroTipoHistorico(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="todos">Todos os Tipos</option>
                    <option value="automatico">⚡ Automático</option>
                    <option value="manual">📥 Manual</option>
                  </select>
                </div>

                {/* Filtro Data */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Data do Backup:</label>
                  <input
                    type="date"
                    value={filtroDataHistorico}
                    onChange={(e) => setFiltroDataHistorico(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Busca Palavra */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Palavra-Chave / Resumo:</label>
                  <input
                    type="text"
                    placeholder="Buscar no resumo..."
                    value={buscaHistorico}
                    onChange={(e) => setBuscaHistorico(e.target.value)}
                    className="w-full bg-slate-950 border border-white/15 rounded-lg px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {(filtroEmpresaHistorico !== 'todas' || filtroTipoHistorico !== 'todos' || filtroDataHistorico !== '' || buscaHistorico !== '') && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => {
                      setFiltroEmpresaHistorico('todas');
                      setFiltroTipoHistorico('todos');
                      setFiltroDataHistorico('');
                      setBuscaHistorico('');
                    }}
                    className="text-[10px] text-amber-300 hover:underline font-bold"
                  >
                    Limpar Filtros
                  </button>
                </div>
              )}
            </div>

            {historicoBackups.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-900/50 rounded-xl border border-white/10">
                Nenhum backup registrado no histórico local ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-white/5 text-slate-200 uppercase font-black text-[10px] border-b border-white/10">
                    <tr>
                      <th className="p-3">Data e Hora</th>
                      <th className="p-3">Escopo / Tipo</th>
                      <th className="p-3">Tamanho</th>
                      <th className="p-3">Resumo dos Dados</th>
                      <th className="p-3 text-right">Ações de Restauração e Exclusão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {historicoBackups
                      .filter((bkp) => {
                        if (filtroEmpresaHistorico !== 'todas') {
                          if (filtroEmpresaHistorico === 'global') {
                            if (bkp.escopo !== 'global') return false;
                          } else {
                            if (bkp.empresaId !== filtroEmpresaHistorico) return false;
                          }
                        }
                        if (filtroTipoHistorico !== 'todos' && bkp.tipo !== filtroTipoHistorico) return false;
                        if (filtroDataHistorico) {
                          const isoDate = bkp.data.slice(0, 10);
                          const brDate = new Date(bkp.data).toLocaleDateString('pt-BR');
                          if (!isoDate.includes(filtroDataHistorico) && !brDate.includes(filtroDataHistorico)) return false;
                        }
                        if (buscaHistorico.trim()) {
                          const term = buscaHistorico.toLowerCase().trim();
                          const resumoMatch = (bkp.resumo || '').toLowerCase().includes(term);
                          const empresaMatch = (bkp.empresaNome || '').toLowerCase().includes(term);
                          if (!resumoMatch && !empresaMatch) return false;
                        }
                        return true;
                      })
                      .map((bkp, idx) => {
                        let snapshotJson = bkp.jsonSnapshot || localStorage.getItem(`sst_backup_snap_${bkp.id}`) || localStorage.getItem('sst_backup_latest_data') || '';
                        if (!snapshotJson) {
                          // Fallback: monta o JSON do snapshot atual se ele estiver ausente
                          const isEmp = bkp.escopo === 'empresa' && bkp.empresaId;
                          const backupDataFallback = {
                            versao: '3.1-corporate',
                            tipo: bkp.tipo,
                            escopo: bkp.escopo || 'global',
                            empresaId: bkp.empresaId,
                            empresaNome: bkp.empresaNome,
                            dataExportacao: bkp.data,
                            empresas: isEmp ? empresas.filter(e => e.id === bkp.empresaId) : empresas,
                            setores: isEmp ? setores.filter(s => s.empresa_id === bkp.empresaId) : setores,
                            usuarios: isEmp ? usuarios.filter(u => u.empresa_id === bkp.empresaId) : usuarios,
                            perguntas: isEmp ? perguntas.filter(p => p.empresa_id === bkp.empresaId) : perguntas,
                            campanhas: isEmp ? campanhas.filter(c => c.empresa_id === bkp.empresaId) : campanhas,
                            quizzes: isEmp ? quizzes.filter(q => q.empresa_id === bkp.empresaId) : quizzes,
                          };
                          snapshotJson = JSON.stringify(backupDataFallback, null, 2);
                        }

                        return (
                          <tr key={`${bkp.id}-${idx}`} className="hover:bg-white/5 transition-colors">
                            <td className="p-3 font-semibold text-white whitespace-nowrap">
                              {new Date(bkp.data).toLocaleString('pt-BR')}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <div className="flex items-center space-x-1">
                                <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] uppercase ${
                                  bkp.escopo === 'empresa'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                }`}>
                                  {bkp.escopo === 'empresa' ? (bkp.empresaNome ? `🏢 ${bkp.empresaNome}` : 'Empresa') : '🌐 Global'}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded-md font-bold text-[9px] uppercase ${
                                  bkp.tipo === 'automatico' 
                                    ? 'bg-purple-500/20 text-purple-300' 
                                    : 'bg-emerald-500/20 text-emerald-300'
                                }`}>
                                  {bkp.tipo}
                                </span>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-slate-400 whitespace-nowrap">{bkp.tamanhoKb} KB</td>
                            <td className="p-3 text-slate-300">{bkp.resumo}</td>
                            <td className="p-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => {
                                    setRestoreModalData({
                                      isOpen: true,
                                      jsonContent: snapshotJson,
                                      targetEmpresaId: bkp.empresaId,
                                      resumo: bkp.resumo,
                                      tipo: bkp.tipo,
                                      dataStr: new Date(bkp.data).toLocaleString('pt-BR'),
                                      escopo: bkp.escopo || 'global',
                                      empresaNome: bkp.empresaNome
                                    });
                                  }}
                                  className="bg-emerald-500/20 hover:bg-emerald-500/40 text-emerald-300 font-bold text-[10px] px-2.5 py-1.5 rounded-lg border border-emerald-500/30 transition-all flex items-center space-x-1 shadow-sm"
                                  title="Restaurar este backup"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                  <span>Restaurar</span>
                                </button>

                                <button
                                  onClick={() => {
                                    if (!snapshotJson) return;
                                    const blob = new Blob([snapshotJson], { type: 'application/json' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `sst_snapshot_${bkp.id}.json`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                  }}
                                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px] px-2.5 py-1.5 rounded-lg border border-white/10 transition-all flex items-center space-x-1"
                                  title="Baixar cópia em JSON"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Baixar JSON</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setConfirmModal({
                                      isOpen: true,
                                      title: 'Confirmar Exclusão de Backup',
                                      description: 'Esta ação irá remover permanentemente este backup do histórico. Certifique-se de que esta cópia não será mais necessária.',
                                      itemName: bkp.resumo || `Backup ${bkp.id}`,
                                      actionType: 'delete',
                                      onConfirm: () => {
                                        excluirBackupHistorico(bkp.id);
                                        setBackupNotice({
                                          type: 'success',
                                          msg: 'Backup removido com sucesso!',
                                          details: 'O registro foi excluído do histórico e do banco de dados, liberando espaço de armazenamento.'
                                        });
                                      }
                                    });
                                  }}
                                  className="bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 font-bold text-[10px] px-2 py-1.5 rounded-lg border border-rose-500/30 transition-all flex items-center space-x-1"
                                  title="Excluir Backup para liberar espaço no banco de dados"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Excluir</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* =====================================================================
              SEÇÃO B: RESET DE FÁBRICA PARA COMERCIALIZAÇÃO
              Limpa os dados de teste mantendo apenas a empresa master e o
              usuário Super Admin (com backup de segurança automático)
              ===================================================================== */}
          <div className="bg-gradient-to-r from-rose-950/40 via-red-950/30 to-slate-950 border-2 border-rose-500/50 rounded-2xl p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/20 rounded-xl border border-rose-500/40">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-white">Reset de Banco de Dados para Comercialização</h3>
                <p className="text-xs text-rose-200/80">Limpeza completa de cadastros e dados de teste antes da entrega/venda comercial.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Utilize esta opção ao finalizar o desenvolvimento ou testes do aplicativo. O sistema apaga todas as empresas de teste, colaboradores fictícios, pontuações e históricos, <strong>MANTENDO exclusivamente a sua empresa master e o seu usuário Super Admin</strong> para que você possa comercializar o sistema do zero.
            </p>

            <div className="p-3 bg-rose-950/60 border border-rose-500/30 rounded-xl text-[11px] text-rose-300 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>
                <strong>Garantia de Segurança:</strong> Antes de executar o reset, um backup completo de segurança será gerado automaticamente no histórico!
              </span>
            </div>

            <button
              onClick={() => {
                setConfirmResetText('');
                setShowResetModal(true);
              }}
              className="bg-rose-600 hover:bg-rose-500 text-white font-black text-xs px-6 py-3 rounded-xl shadow-xl transition-all flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>RESETAR BANCO DE DADOS PARA COMERCIALIZAÇÃO</span>
            </button>
          </div>

        </div>
      )}

      {/* =====================================================================
          MODAL 1: Cadastro de Nova Empresa (nome, CNPJ, plano e limite)
          ===================================================================== */}
      {showNovaEmpresaModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-md bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <h3 className="font-extrabold text-base text-white border-b border-white/10 pb-3 flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-purple-400" />
              <span>Cadastrar Nova Empresa Cliente</span>
            </h3>

            {empresaErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{empresaErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCriarEmpresa} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Razão Social / Nome Fantasia</label>
                <input
                  type="text"
                  value={nomeEmpresa}
                  onChange={(e) => setNomeEmpresa(e.target.value)}
                  placeholder="Ex: Indústria Metais S.A."
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">CNPJ</label>
                <input
                  type="text"
                  value={cnpjEmpresa}
                  onChange={(e) => setCnpjEmpresa(formatarCNPJ(e.target.value))}
                  placeholder="00.000.000/0001-00"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Plano de Licença</label>
                  <select
                    value={planoEmpresa}
                    onChange={(e) => setPlanoEmpresa(e.target.value as any)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="Basic">Basic (Até 50 colabs)</option>
                    <option value="Pro">Pro (Até 250 colabs)</option>
                    <option value="Enterprise">Enterprise (Ilimitado)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Limite de Colaboradores</label>
                  <input
                    type="number"
                    value={Number.isNaN(Number(limiteColabs)) ? '' : limiteColabs}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setLimiteColabs(isNaN(v) ? ('' as unknown as number) : v);
                    }}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowNovaEmpresaModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Cadastrar Empresa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: Cadastro de Novo Setor (empresa destino + nome)
          ===================================================================== */}
      {showNovoSetorModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-md bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <h3 className="font-extrabold text-base text-white border-b border-white/10 pb-3 flex items-center space-x-2">
              <FolderPlus className="w-5 h-5 text-purple-400" />
              <span>Cadastrar Novo Setor</span>
            </h3>

            {setorErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{setorErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCriarSetor} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Empresa Destino</label>
                <select
                  value={targetEmpresaSetor}
                  onChange={(e) => setTargetEmpresaSetor(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                >
                  {empresas.map(e => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nome do Setor</label>
                <input
                  type="text"
                  value={nomeSetor}
                  onChange={(e) => setNomeSetor(e.target.value)}
                  placeholder="Ex: Engenharia de Campo"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

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

      {/* =====================================================================
          MODAL 3: Cadastro de Novo Usuário multitenant (empresa, setor,
          perfil de acesso, senha e foto/avatar)
          ===================================================================== */}
      {showNovoUsuarioModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-md bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <h3 className="font-extrabold text-base text-white border-b border-white/10 pb-3 flex items-center space-x-2">
              <UserPlus className="w-5 h-5 text-emerald-400" />
              <span>Cadastrar Novo Usuário Multitenant</span>
            </h3>

            {userErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{userErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCriarUsuario} className="space-y-3 text-xs">
              
              {/* Seção de Upload da Foto / Avatar do Usuário (criação) */}
              <div className="bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-2">
                <label className="block font-bold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>Foto de Perfil / Avatar do Usuário</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Galeria, Câmera ou Presets</span>
                </label>

                <div className="flex items-center gap-3">
                  <img 
                    src={avatarUser || PRESET_AVATARS[0].url} 
                    alt="Preview" 
                    className="w-12 h-12 rounded-xl object-cover ring-2 ring-emerald-500/50 shadow-md shrink-0" 
                  />

                  <div className="flex-1 space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        ref={galleryInputRefUser} 
                        type="file" 
                        accept="image/*" 
                        onChange={handleFileUploadUser} 
                        className="hidden" 
                      />
                      <button
                        type="button"
                        onClick={() => galleryInputRefUser.current?.click()}
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
                      placeholder="Ou cole a URL da imagem aqui..." 
                      className="w-full bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-[11px] text-slate-300 placeholder-slate-500" 
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <span className="block text-[10px] text-slate-400 mb-1 font-semibold">Fotos Padrão Disponíveis:</span>
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

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Empresa Destino</label>
                <select
                  value={targetEmpresaUser}
                  onChange={(e) => {
                    setTargetEmpresaUser(e.target.value);
                    const firstSetor = setores.find(s => s.empresa_id === e.target.value);
                    if (firstSetor) setTargetSetorUser(firstSetor.id);
                  }}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                >
                  {empresas.map(e => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={nomeUser}
                  onChange={(e) => setNomeUser(e.target.value)}
                  placeholder="Ex: Carlos Mendes"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">E-mail Corporativo</label>
                <input
                  type="email"
                  value={emailUser}
                  onChange={(e) => setEmailUser(e.target.value)}
                  placeholder="carlos@empresa.com.br"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Senha Inicial</label>
                  <input
                    type="password"
                    value={senhaUser}
                    onChange={(e) => setSenhaUser(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Confirmar Senha</label>
                  <input
                    type="password"
                    value={confirmSenhaUser}
                    onChange={(e) => setConfirmSenhaUser(e.target.value)}
                    placeholder="Repita a mesma senha"
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Setor</label>
                  <select
                    value={targetSetorUser}
                    onChange={(e) => setTargetSetorUser(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    {setores.filter(s => s.empresa_id === targetEmpresaUser).map(s => (
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
                    <option value="colaborador">Colaborador</option>
                    <option value="admin">Admin de Empresa</option>
                    <option value="super_admin">Super Admin Global</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Cargo</label>
                <input
                  type="text"
                  value={cargoUser}
                  onChange={(e) => setCargoUser(e.target.value)}
                  placeholder="Ex: Inspetor de Segurança"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              {/* Marcação de Instrutor SST */}
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInstrutorUser}
                    onChange={(e) => setIsInstrutorUser(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400 h-4 w-4 bg-slate-950 border-white/20"
                  />
                  <span className="text-xs font-bold text-amber-200 flex items-center space-x-1.5">
                    <GraduationCap className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Habilitar como Instrutor SST (Permite criar e gerenciar Quiz Guiado)</span>
                  </span>
                </label>
              </div>

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
                  Cadastrar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: Nova Campanha com seleção de perguntas do acervo
          (empresa alvo, descrição, frequência, período e horário de disparo)
          ===================================================================== */}
      {showNovaCampanhaModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-2xl bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <h3 className="font-extrabold text-base text-white border-b border-white/10 pb-3 flex items-center space-x-2">
              <Target className="w-5 h-5 text-blue-400" />
              <span>Criar Campanha e Selecionar Perguntas do Acervo</span>
            </h3>

            {campanhaErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{campanhaErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCriarCampanhaGlobal} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Empresa Alvo</label>
                  <select
                    value={targetEmpresaCampanha}
                    onChange={(e) => setTargetEmpresaCampanha(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    {empresas.map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Nome da Campanha</label>
                  <input
                    type="text"
                    value={nomeCampanha}
                    onChange={(e) => setNomeCampanha(e.target.value)}
                    placeholder="Ex: Campanha Abril Verde - Trabalho Seguro"
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Descrição / Instrução aos Colaboradores</label>
                <textarea
                  value={descCampanha}
                  onChange={(e) => setDescCampanha(e.target.value)}
                  placeholder="Descreva o objetivo educativo desta campanha..."
                  rows={2}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200 resize-none"
                />
              </div>

              {/* Seleção das Perguntas do Banco de Questões */}
              <div className="bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-slate-200 flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-amber-400" />
                    <span>Escolha das Perguntas do Banco ({selectedPerguntaIds.length} selecionadas)</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Marque as perguntas que farão parte do quiz desta campanha</span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2">
                  {perguntas.map(p => {
                    const selected = selectedPerguntaIds.includes(p.id);
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleSelectPergunta(p.id)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start space-x-2 text-xs ${
                          selected 
                            ? 'bg-blue-500/20 border-blue-500/50 text-white' 
                            : 'bg-slate-950/60 border-white/5 text-slate-400 hover:bg-white/5'
                        }`}
                      >
                        {selected ? <CheckSquare className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" /> : <Square className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold">{p.enunciado}</div>
                          <div className="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
                            <span className="bg-white/10 px-1.5 py-0.2 rounded text-slate-300">{p.categoria}</span>
                            <span>• {p.dificuldade}</span>
                            <span>• {p.norma_relacionada || 'Norma SST'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Frequência</label>
                  <select
                    value={freqCampanha}
                    onChange={(e) => setFreqCampanha(e.target.value as any)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="diaria">Diária</option>
                    <option value="semanal">Semanal</option>
                    <option value="personalizada">Personalizada</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Data de Início</label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Data de Término</label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  />
                </div>
              </div>

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
                  className="bg-blue-600 hover:bg-blue-500 text-white font-black px-6 py-2 rounded-xl shadow-lg"
                >
                  Disparar Campanha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: Edição de Empresa (com confirmação de segurança)
          ===================================================================== */}
      {empresaParaEditar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-md bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <Building2 className="w-4 h-4 text-purple-400" />
                <span>Editar Empresa</span>
              </h3>
              <button onClick={() => setEmpresaParaEditar(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              setEmpresaErrorMsg('');
              if (!empresaParaEditar || !nomeEmpresa.trim()) {
                setEmpresaErrorMsg('O nome da empresa é obrigatório.');
                return;
              }
              if (!validarCNPJ(cnpjEmpresa)) {
                setEmpresaErrorMsg('CNPJ inválido! Digite um CNPJ válido com 14 dígitos.');
                return;
              }
              if (!limiteColabs || limiteColabs <= 0) {
                setEmpresaErrorMsg('O limite de colaboradores deve ser maior que 0.');
                return;
              }
              setConfirmModal({
                isOpen: true,
                title: 'Confirmar Alteração de Empresa',
                itemName: `Empresa: ${empresaParaEditar.nome}`,
                actionType: 'edit',
                onConfirm: () => {
                  editarEmpresa(empresaParaEditar.id, {
                    nome: nomeEmpresa.trim(),
                    cnpj: formatarCNPJ(cnpjEmpresa),
                    plano: planoEmpresa,
                    limite_colaboradores: limiteColabs
                  });
                  setEmpresaParaEditar(null);
                  setEmpresaErrorMsg('');
                }
              });
            }} className="space-y-3 text-xs">
              {empresaErrorMsg && (
                <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{empresaErrorMsg}</span>
                </div>
              )}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nome da Empresa</label>
                <input
                  type="text"
                  value={nomeEmpresa}
                  onChange={(e) => setNomeEmpresa(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">CNPJ</label>
                <input
                  type="text"
                  value={cnpjEmpresa}
                  onChange={(e) => setCnpjEmpresa(formatarCNPJ(e.target.value))}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Plano de Licença</label>
                  <select
                    value={planoEmpresa}
                    onChange={(e) => setPlanoEmpresa(e.target.value as any)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="Basic">Basic</option>
                    <option value="Pro">Pro</option>
                    <option value="Enterprise">Enterprise</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Limite Colaboradores</label>
                  <input
                    type="number"
                    value={Number.isNaN(Number(limiteColabs)) ? '' : limiteColabs}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setLimiteColabs(isNaN(v) ? ('' as unknown as number) : v);
                    }}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEmpresaParaEditar(null)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 6: Edição de Setor (nome do departamento)
          ===================================================================== */}
      {setorParaEditar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-sm bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <FolderPlus className="w-4 h-4 text-purple-400" />
                <span>Editar Setor</span>
              </h3>
              <button onClick={() => setSetorParaEditar(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              setSetorErrorMsg('');
              if (!setorParaEditar || !nomeSetor.trim()) {
                setSetorErrorMsg('O nome do setor é obrigatório.');
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
              {setorErrorMsg && (
                <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{setorErrorMsg}</span>
                </div>
              )}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Nome do Setor</label>
                <input
                  type="text"
                  value={nomeSetor}
                  onChange={(e) => setNomeSetor(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

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

      {/* =====================================================================
          MODAL 7: Edição de Usuário (empresa, setor, perfil, senha e avatar)
          ===================================================================== */}
      {usuarioParaEditar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-md bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>Editar Usuário (Super Admin)</span>
              </h3>
              <button onClick={() => setUsuarioParaEditar(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              setUserErrorMsg('');
              if (!usuarioParaEditar || !nomeUser.trim()) {
                setUserErrorMsg('O nome do usuário é obrigatório.');
                return;
              }
              if (!validarEmail(emailUser)) {
                setUserErrorMsg('E-mail inválido! Digite um endereço de e-mail corporativo válido.');
                return;
              }
              if (senhaUser && senhaUser.trim().length < 6) {
                setUserErrorMsg('A nova senha deve ter no mínimo 6 caracteres.');
                return;
              }
              setConfirmModal({
                isOpen: true,
                title: 'Confirmar Alteração de Usuário',
                itemName: `Usuário: ${usuarioParaEditar.nome}`,
                actionType: 'edit',
                onConfirm: () => {
                  let validSetorId = targetSetorUser;
                  const companySetors = setores.filter(s => s.empresa_id === targetEmpresaUser);
                  if (!companySetors.some(s => s.id === validSetorId)) {
                    validSetorId = companySetors[0]?.id || '';
                  }

                  editarUsuario(usuarioParaEditar.id, {
                    nome: nomeUser.trim(),
                    email: emailUser.trim(),
                    cargo: cargoUser.trim(),
                    empresa_id: targetEmpresaUser,
                    setor_id: validSetorId,
                    perfil: perfilUser,
                    is_instrutor: isInstrutorUser,
                    avatar: avatarUser || PRESET_AVATARS[0].url,
                    ...(senhaUser.trim() ? { senha: senhaUser.trim() } : {})
                  });
                  setUsuarioParaEditar(null);
                  setUserErrorMsg('');
                }
              });
            }} className="space-y-3 text-xs">
              {userErrorMsg && (
                <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{userErrorMsg}</span>
                </div>
              )}

              {/* Empresa Destino & Setor */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Empresa Destino</label>
                  <select
                    value={targetEmpresaUser}
                    onChange={(e) => {
                      const empId = e.target.value;
                      setTargetEmpresaUser(empId);
                      const firstSetor = setores.find(s => s.empresa_id === empId);
                      setTargetSetorUser(firstSetor?.id || '');
                    }}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    {empresas.map(e => (
                      <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Setor</label>
                  <select
                    value={targetSetorUser}
                    onChange={(e) => setTargetSetorUser(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    {setores.filter(s => s.empresa_id === targetEmpresaUser).map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Seção de Upload da Foto / Avatar do Usuário (edição) */}
              <div className="bg-white/5 p-3.5 rounded-xl border border-white/10 space-y-2">
                <label className="block font-bold text-slate-200 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    <span>Foto de Perfil / Avatar</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Galeria, Câmera ou Presets</span>
                </label>

                <div className="flex items-center gap-3">
                  <img 
                    src={avatarUser || PRESET_AVATARS[0].url} 
                    alt="Preview" 
                    className="w-12 h-12 rounded-xl object-cover ring-2 ring-emerald-500/50 shadow-md shrink-0" 
                  />

                  <div className="flex-1 space-y-1.5">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        ref={editGalleryInputRefUser}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUploadUser}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => editGalleryInputRefUser.current?.click()}
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
                      placeholder="Ou cole a URL da imagem aqui..." 
                      className="w-full bg-slate-950/80 border border-white/10 rounded-lg p-1.5 text-[11px] text-slate-300 placeholder-slate-500" 
                    />
                  </div>
                </div>

                <div className="pt-1">
                  <span className="block text-[10px] text-slate-400 mb-1">Ou escolha um avatar predefinido:</span>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    {PRESET_AVATARS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setAvatarUser(preset.url)}
                        className={`relative rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                          avatarUser === preset.url ? 'border-emerald-400 scale-105 ring-2 ring-emerald-500/30' : 'border-transparent opacity-70 hover:opacity-100'
                        }`}
                      >
                        <img src={preset.url} alt={preset.label} className="w-8 h-8 object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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

              <div>
                <label className="block font-semibold text-slate-300 mb-1">E-mail</label>
                <input
                  type="email"
                  value={emailUser}
                  onChange={(e) => setEmailUser(e.target.value)}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

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
                  <label className="block font-semibold text-slate-300 mb-1">Nível de Acesso</label>
                  <select
                    value={perfilUser}
                    onChange={(e) => setPerfilUser(e.target.value as any)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="colaborador">Colaborador</option>
                    <option value="admin">Administrador / Gerente</option>
                    <option value="super_admin">Super Admin Global</option>
                  </select>
                </div>
              </div>

              {/* Marcação de Instrutor SST */}
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInstrutorUser}
                    onChange={(e) => setIsInstrutorUser(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400 h-4 w-4 bg-slate-950 border-white/20"
                  />
                  <span className="text-xs font-bold text-amber-200 flex items-center space-x-1.5">
                    <GraduationCap className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Habilitar como Instrutor SST (Permite criar e gerenciar Quiz Guiado)</span>
                  </span>
                </label>
              </div>

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
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 8: Importação em lote de Usuários via CSV (Super Admin)
          ===================================================================== */}
      {showCSVUsuariosModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900/95 border border-white/15 rounded-2xl max-w-lg w-full p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <span>Importação em Lote de Usuários via CSV (Super Admin)</span>
              </h3>
              <button onClick={() => setShowCSVUsuariosModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {csvErrorMsgUsuarios && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{csvErrorMsgUsuarios}</span>
              </div>
            )}

            {csvSuccessMsgUsuarios && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{csvSuccessMsgUsuarios}</span>
              </div>
            )}

            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-slate-300 space-y-2">
              <p>
                Empresa Destino da Importação: <strong>{empresas.find(e => e.id === selectedEmpresaFilter)?.nome || 'Empresa Selecionada'}</strong>
              </p>
              <p>
                Carregue um arquivo <strong>.csv</strong> de colaboradores ou cole a estrutura abaixo.
              </p>
              <div className="flex items-center space-x-2">
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

      {/* Modal global de confirmação de segurança (excluir/editar) */}
      <SecurityConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
        itemName={confirmModal.itemName}
        actionType={confirmModal.actionType}
      />

      {/* Modal de captura de foto pela câmera (define o avatar do usuário) */}
      <CameraCaptureModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={(dataUrl) => setAvatarUser(dataUrl)}
      />

      {/* Modal de confirmação do Reset Comercial (exige digitar "RESETAR") */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4">
          <div className="w-full max-w-xl overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/95 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-rose-500/20 bg-rose-950/80 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-3xl border border-rose-500/30 bg-rose-500/15 text-rose-300">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">Confirmar Reset do Banco de Dados</h3>
                  <p className="text-xs uppercase tracking-[0.24em] text-rose-300">Ação irreversível de preparação para comercialização</p>
                </div>
              </div>
              <button onClick={() => setShowResetModal(false)} className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-6 text-slate-300">
              <div className="space-y-3 text-sm leading-6">
                <p>Esta ação irá apagar todas as empresas de teste, colaboradores fictícios, pontuações e históricos do sistema.</p>
                <p className="font-semibold text-emerald-400">✓ Apenas o seu Usuário Super Admin ({currentUser?.nome}) e a sua Empresa Master ({empresa?.nome}) serão mantidos intactos.</p>
                <p className="text-slate-400">Digite <strong className="text-white">RESETAR</strong> no campo abaixo para autorizar o procedimento.</p>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/90 p-4">
                <label className="block text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500 mb-3">Confirmação de segurança</label>
                <input
                  type="text"
                  value={confirmResetText}
                  onChange={(e) => setConfirmResetText(e.target.value)}
                  placeholder="Digite RESETAR"
                  className="w-full rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-3 text-center text-sm font-bold text-white placeholder:text-slate-500 focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-white/10 bg-slate-950/90 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                onClick={() => setShowResetModal(false)}
                className="w-full rounded-3xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/10 sm:w-auto"
              >
                Cancelar
              </button>
              <button
                disabled={confirmResetText.trim().toUpperCase() !== 'RESETAR'}
                onClick={() => {
                  setShowResetModal(false);
                  const res = executarResetFabricaComercial();
                  setBackupNotice({
                    type: 'success',
                    msg: 'Banco de Dados Resetado com Sucesso!',
                    details: res.message
                  });
                }}
                className={`w-full rounded-3xl px-5 py-3 text-sm font-black transition sm:w-auto ${
                  confirmResetText.trim().toUpperCase() === 'RESETAR'
                    ? 'bg-rose-600 text-white hover:bg-rose-500 shadow-rose-500/30'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/10'
                }`}
              >
                SIM, RESETAR PARA COMERCIALIZAÇÃO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de alerta de segurança antes de confirmar a restauração de backup */}
      {restoreModalData?.isOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/50 rounded-3xl max-w-lg w-full p-6 text-white space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center space-x-3 border-b border-white/10 pb-4">
              <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl flex items-center justify-center text-emerald-400 shrink-0">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-white">Confirmar Restauração de Backup</h3>
                <p className="text-xs text-slate-400">Verifique os detalhes e o escopo da restauração antes de prosseguir</p>
              </div>
            </div>

            <div className="space-y-2.5 bg-slate-950/80 p-4 rounded-2xl border border-white/10 text-xs">
              <div className="flex justify-between py-1 border-b border-white/10">
                <span className="text-slate-400 font-medium">Escopo da Restauração:</span>
                <span className="font-bold text-amber-300 uppercase">
                  {restoreModalData.escopo === 'empresa'
                    ? `🏢 Empresa Isolada (${restoreModalData.empresaNome || restoreModalData.targetEmpresaId || 'Selecionada'})`
                    : '🌐 ESTRUTURA GLOBAL (TODAS AS EMPRESAS)'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/10">
                <span className="text-slate-400 font-medium">Data / Origem:</span>
                <span className="font-bold text-white">{restoreModalData.dataStr}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/10">
                <span className="text-slate-400 font-medium">Tipo do Snapshot:</span>
                <span className="font-bold text-purple-300 uppercase">{restoreModalData.tipo}</span>
              </div>
              <div className="pt-1">
                <span className="text-slate-400 font-medium block mb-1">Resumo dos Dados:</span>
                <p className="p-2.5 bg-white/5 rounded-xl text-slate-300 font-mono text-[11px] leading-relaxed">
                  {restoreModalData.resumo}
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-200 space-y-1">
              <p className="font-bold flex items-center space-x-1 text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>ALERTA DE SOBRESCRIÇÃO DE DADOS:</span>
              </p>
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                {restoreModalData.escopo === 'empresa'
                  ? 'Esta operação substituirá os dados atuais da empresa selecionada pelo estado salvo no backup. As demais empresas continuarão 100% intocadas!'
                  : 'Esta operação substituirá o estado atual de todo o sistema pelos registros contidos neste snapshot global.'}
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setRestoreModalData(null)}
                className="px-4 py-2.5 rounded-xl border border-white/10 text-slate-300 hover:bg-white/5 text-xs font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const res = restaurarBackupSistema(restoreModalData.jsonContent, restoreModalData.targetEmpresaId);
                  setBackupNotice({
                    type: res.success ? 'success' : 'error',
                    msg: res.message,
                    details: res.detalhes
                  });
                  setRestoreModalData(null);
                }}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all flex items-center space-x-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>SIM, DESEJO RESTAURAR AGORA</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal de Pré-visualização de Importação CSV de Usuários (Super Admin) ===== */}
      <ImportPreviewModal
        isOpen={showPreviewModalUsuarios}
        onClose={() => {
          setShowPreviewModalUsuarios(false);
          setPreviewDataUsuarios(null);
        }}
        onConfirm={handleConfirmarImportacaoUsuarios}
        title="Pré-visualização da Importação de Usuários (Super Admin)"
        totalCount={previewDataUsuarios?.items.length || 0}
        errorsCount={previewDataUsuarios?.errors.length || 0}
        type="usuarios"
        previewItems={previewDataUsuarios?.items || []}
        setoresLista={setores}
      />

    </div>
  );
};
