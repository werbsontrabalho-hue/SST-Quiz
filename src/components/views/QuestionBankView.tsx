// =============================================================================
// QuestionBankView — Banco de Perguntas do quiz de SST
// =============================================================================
// Tela responsável pela gestão do acervo de perguntas:
//   - Listar e filtrar perguntas por setor/tema (categoria), dificuldade e busca
//     por enunciado, norma ou categoria;
//   - Criar, editar e excluir perguntas, além de alternar o status ativo/inativo;
//   - Importar perguntas em lote via planilha CSV e exportar / baixar modelo;
//   - Cadastrar categorias personalizadas.
// Conecta-se ao contexto global `useSST` para ler as perguntas e categorias
// disponíveis e para chamar as funções de persistência do banco de dados.
import React, { useState, useRef } from 'react';
import { formatAlternativaText } from '../../utils/questionHelpers';
import { useSST } from '../../context/SSTContext';
import { Pergunta, CategoriaPergunta, DificuldadePergunta, TipoPergunta } from '../../types';
import { SecurityConfirmModal } from '../SecurityConfirmModal';
import { ImportPreviewModal } from '../ImportPreviewModal';
import { 
  triggerDownloadCSV, 
  generateCSVTemplatePerguntas, 
  exportPerguntasToCSV, 
  parsePerguntasCSV 
} from '../../utils/csvHelpers';
import { 
  BookOpen, 
  Plus, 
  FileSpreadsheet, 
  Download,
  Upload,
  Search, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Pencil,
  Trash2,
  X,
  HelpCircle
} from 'lucide-react';

export const QuestionBankView: React.FC = () => {
  // Contexto global do SST: expõe o usuário logado, as perguntas do banco, as
  // categorias disponíveis e as funções para adicionar/editar/excluir perguntas.
  const { 
    currentUser, 
    perguntas, 
    adicionarPergunta, 
    adicionarPerguntasLote, 
    editarPergunta, 
    excluirPergunta,
    categoriasDisponiveis,
    adicionarCategoriaPersonalizada
  } = useSST();

  // ----- Estados de filtro da listagem -----
  // `busca` guarda o texto digitado; os demais filtram por categoria (setor/tema)
  // e por dificuldade da pergunta.
  const [busca, setBusca] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas');
  const [dificuldadeFiltro, setDificuldadeFiltro] = useState<string>('todas');

  // Referência ao input de arquivo oculto usado para carregar a planilha CSV
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ----- Estado do modal de confirmação de segurança -----
  // Exige confirmação do usuário antes de excluir/editar uma pergunta (proteção
  // contra ações acidentais). `onConfirm` é a ação executada ao confirmar.
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

  // ----- Estados de abertura dos modais -----
  // Controlam quais janelas estão abertas: nova pergunta, importação CSV,
  // cadastro de categoria personalizada e edição de pergunta.
  const [showNovaModal, setShowNovaModal] = useState(false);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [showPreviewModalCSV, setShowPreviewModalCSV] = useState(false);
  const [previewDataCSV, setPreviewDataCSV] = useState<{ items: any[]; errors: string[] } | null>(null);
  const [showNovaCategoriaInput, setShowNovaCategoriaInput] = useState(false);
  const [novaCategoriaDigitada, setNovaCategoriaDigitada] = useState('');
  const [perguntaParaEditar, setPerguntaParaEditar] = useState<Pergunta | null>(null);

  // ----- Mensagens de erro e sucesso -----
  // Exibidas nos formulários de pergunta e de importação CSV
  const [perguntaErrorMsg, setPerguntaErrorMsg] = useState('');
  const [csvErrorMsg, setCsvErrorMsg] = useState('');
  const [csvSuccessMsg, setCsvSuccessMsg] = useState('');

  // ----- Estado de controle de normas regulamentadoras disponíveis -----
  const [showNovaNormaInput, setShowNovaNormaInput] = useState(false);
  const [novaNormaDigitada, setNovaNormaDigitada] = useState('');
  const [normasCustomizadas, setNormasCustomizadas] = useState<string[]>([]);

  // ----- Estado do formulário de nova/edição de pergunta -----
  // Campos compartilhados pelos modais "Nova Pergunta" e "Editar Pergunta"
  const [novaCategoria, setNovaCategoria] = useState<string>('SST');
  const [novoTipo, setNovoTipo] = useState<TipoPergunta>('multipla_escolha');
  const [novaDificuldade, setNovaDificuldade] = useState<DificuldadePergunta>('Médio');
  const [novoEnunciado, setNovoEnunciado] = useState('');
  const [novasAlternativas, setNovasAlternativas] = useState<string[]>(['', '', '', '']);
  const [novaRespostaCorreta, setNovaRespostaCorreta] = useState<number>(0);
  const [novaExplicacao, setNovaExplicacao] = useState('');
  const [novoTempoLimite, setNovoTempoLimite] = useState<number>(30);
  const [novaNorma, setNovaNorma] = useState('NR-35');
  const [novoDisponivelDesafios, setNovoDisponivelDesafios] = useState<boolean>(true);

  // Extrai dinamicamente todas as normas existentes no banco de perguntas + normas padrão
  const normasDisponiveis = React.useMemo(() => {
    const padrao = [
      'NR-01', 'NR-05', 'NR-06', 'NR-10', 'NR-11', 'NR-12', 'NR-13',
      'NR-15', 'NR-17', 'NR-18', 'NR-20', 'NR-23', 'NR-33', 'NR-35',
      'CONAMA 275', 'FISPQ / PAE', 'Geral / SST'
    ];
    const setNormas = new Set<string>(padrao);

    perguntas.forEach(p => {
      if (p.norma_relacionada && p.norma_relacionada.trim()) {
        setNormas.add(p.norma_relacionada.trim());
      }
    });

    normasCustomizadas.forEach(n => setNormas.add(n));

    if (novaNorma && novaNorma.trim()) {
      setNormas.add(novaNorma.trim());
    }

    return Array.from(setNormas).sort();
  }, [perguntas, normasCustomizadas, novaNorma]);

  // ----- Estado da importação CSV -----
  // Guarda o conteúdo (colado ou carregado de arquivo) a ser processado
  const [csvText, setCsvText] = useState('');

  // Restaura o formulário de pergunta aos valores padrão (usado ao criar/cancelar)
  const resetFormulario = () => {
    setNovaCategoria('SST');
    setNovoTipo('multipla_escolha');
    setNovaDificuldade('Médio');
    setNovoEnunciado('');
    setNovasAlternativas(['', '', '', '']);
    setNovaRespostaCorreta(0);
    setNovaExplicacao('');
    setNovoTempoLimite(30);
    setNovaNorma('NR-35');
    setNovoDisponivelDesafios(true);
    setPerguntaErrorMsg('');
    setShowNovaCategoriaInput(false);
    setNovaCategoriaDigitada('');
    setShowNovaNormaInput(false);
    setNovaNormaDigitada('');
  };

  // Preenche o formulário com os dados da pergunta selecionada e abre o modal de edição
  const abrirModalEditar = (p: Pergunta) => {
    setPerguntaErrorMsg('');
    setPerguntaParaEditar(p);
    setNovaCategoria(p.categoria);
    setNovoTipo(p.tipo || 'multipla_escolha');
    setNovaDificuldade(p.dificuldade);
    setNovoEnunciado(p.enunciado);
    setNovasAlternativas(p.tipo === 'verdadeiro_falso' ? ['Verdadeiro', 'Falso'] : [...p.alternativas]);
    setNovaRespostaCorreta(p.resposta_correta);
    setNovaExplicacao(p.explicacao || '');
    setNovoTempoLimite(p.tempo_limite_segundos || 30);
    setNovaNorma(p.norma_relacionada || 'NR-35');
    setNovoDisponivelDesafios(p.disponivel_desafios !== false);
    setShowNovaNormaInput(false);
    setNovaNormaDigitada('');
  };

  // Persiste a norma personalizada digitada e a deixa selecionada no formulário
  const handleSalvarNovaNorma = () => {
    if (novaNormaDigitada.trim()) {
      const val = novaNormaDigitada.trim();
      if (!normasCustomizadas.includes(val)) {
        setNormasCustomizadas(prev => [...prev, val]);
      }
      setNovaNorma(val);
      setNovaNormaDigitada('');
      setShowNovaNormaInput(false);
    }
  };

  // Persiste a categoria personalizada digitada e a deixa selecionada no formulário
  const handleSalvarNovaCategoria = () => {
    if (novaCategoriaDigitada.trim()) {
      adicionarCategoriaPersonalizada(novaCategoriaDigitada.trim());
      setNovaCategoria(novaCategoriaDigitada.trim());
      setNovaCategoriaDigitada('');
      setShowNovaCategoriaInput(false);
    }
  };

  // Valida os campos preenchidos e, após confirmação no modal de segurança,
  // salva as alterações da pergunta no banco via `editarPergunta`
  const handleSalvarEdicao = (e: React.FormEvent) => {
    e.preventDefault();
    setPerguntaErrorMsg('');

    if (!perguntaParaEditar) return;

    if (!novoEnunciado.trim()) {
      setPerguntaErrorMsg('Por favor, informe o enunciado da pergunta.');
      return;
    }

    if (novoTipo === 'multipla_escolha' && novasAlternativas.some(a => !a.trim())) {
      setPerguntaErrorMsg('Todas as 4 alternativas de múltipla escolha devem estar preenchidas.');
      return;
    }

    if (!novaExplicacao.trim()) {
      setPerguntaErrorMsg('Por favor, inclua uma explicação educativa.');
      return;
    }

    const altsFinais = novoTipo === 'verdadeiro_falso' ? ['Verdadeiro', 'Falso'] : novasAlternativas.map(a => a.trim());

    setConfirmModal({
      isOpen: true,
      title: 'Confirmar Edição de Pergunta',
      itemName: `Pergunta: "${novoEnunciado.substring(0, 50)}..."`,
      actionType: 'edit',
      onConfirm: () => {
        editarPergunta(perguntaParaEditar.id, {
          categoria: novaCategoria,
          tipo: novoTipo,
          dificuldade: novaDificuldade,
          enunciado: novoEnunciado.trim(),
          alternativas: altsFinais,
          resposta_correta: novaRespostaCorreta,
          explicacao: novaExplicacao.trim(),
          tempo_limite_segundos: novoTempoLimite,
          norma_relacionada: novaNorma.trim(),
          disponivel_desafios: novoDisponivelDesafios,
        });
        setPerguntaParaEditar(null);
        setPerguntaErrorMsg('');
      }
    });
  };

  // =============================================================================
  // Lista de perguntas filtradas (com isolamento por empresa)
  // =============================================================================
  // Usuários comuns (perfil diferente de super_admin) só veem perguntas da própria
  // empresa; super_admins enxergam todo o acervo. Depois aplica a busca por
  // enunciado/norma/categoria e os filtros de categoria e dificuldade selecionados.
  const perguntasFiltradas = perguntas.filter(p => {
    if (currentUser.perfil !== 'super_admin' && p.empresa_id && p.empresa_id !== currentUser.empresa_id) {
      return false;
    }
    const matchBusca = p.enunciado.toLowerCase().includes(busca.toLowerCase()) || 
                       (p.norma_relacionada && p.norma_relacionada.toLowerCase().includes(busca.toLowerCase())) ||
                       p.categoria.toLowerCase().includes(busca.toLowerCase());
    const matchCat = categoriaFiltro === 'todas' || p.categoria === categoriaFiltro;
    const matchDif = dificuldadeFiltro === 'todas' || p.dificuldade === dificuldadeFiltro;
    return matchBusca && matchCat && matchDif;
  });

  // Cria manualmente uma nova pergunta no banco, validando os campos obrigatórios
  const handleCriarPerguntaManual = (e: React.FormEvent) => {
    e.preventDefault();
    setPerguntaErrorMsg('');

    if (!novoEnunciado.trim()) {
      setPerguntaErrorMsg('Por favor, informe o enunciado da pergunta.');
      return;
    }

    if (novoTipo === 'multipla_escolha' && novasAlternativas.some(a => !a.trim())) {
      setPerguntaErrorMsg('Todas as 4 alternativas precisam estar preenchidas.');
      return;
    }

    if (!novaExplicacao.trim()) {
      setPerguntaErrorMsg('Por favor, informe a explicação educativa da questão.');
      return;
    }

    const altsFinais = novoTipo === 'verdadeiro_falso' ? ['Verdadeiro', 'Falso'] : novasAlternativas.map(a => a.trim());

    adicionarPergunta({
      categoria: novaCategoria,
      tipo: novoTipo,
      dificuldade: novaDificuldade,
      enunciado: novoEnunciado.trim(),
      alternativas: altsFinais,
      resposta_correta: novaRespostaCorreta,
      explicacao: novaExplicacao.trim(),
      tempo_limite_segundos: novoTempoLimite,
      norma_relacionada: novaNorma.trim(),
      disponivel_desafios: novoDisponivelDesafios,
    });

    setShowNovaModal(false);
    resetFormulario();
  };

  // Lê o arquivo CSV selecionado e carrega seu conteúdo no estado de importação
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCsvText(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Processa a importação em lote: interpreta o CSV com `parsePerguntasCSV` e,
  // havendo perguntas válidas, salva tudo via `adicionarPerguntasLote`; caso
  // contrário, exibe a mensagem de erro informando o motivo
  const handleImportarCSV = (e: React.FormEvent) => {
    e.preventDefault();
    setCsvErrorMsg('');
    setCsvSuccessMsg('');

    if (!csvText.trim()) {
      setCsvErrorMsg('Cole o conteúdo CSV ou selecione um arquivo válido para importar.');
      return;
    }

    const { items: importadas, errors } = parsePerguntasCSV(csvText);

    if (importadas.length > 0) {
      setPreviewDataCSV({ items: importadas, errors });
      setShowPreviewModalCSV(true);
    } else {
      const errorMsg = errors.length > 0 ? errors.join(' ') : 'Nenhuma pergunta válida foi encontrada no formato especificado. Utilize a opção "Baixar Modelo de Planilha" para verificar a estrutura correta.';
      setCsvErrorMsg(errorMsg);
    }
  };

  const handleConfirmarImportacaoCSV = () => {
    if (!previewDataCSV) return;
    const { items: importadas, errors } = previewDataCSV;
    adicionarPerguntasLote(importadas);
    let msg = `${importadas.length} pergunta(s) importada(s) com sucesso para o banco de dados!`;
    if (errors.length > 0) {
      msg += ` (${errors.length} erro(s) em linhas: ${errors.slice(0, 2).join('; ')})`;
    }
    setCsvSuccessMsg(msg);
    setShowPreviewModalCSV(false);
    setPreviewDataCSV(null);
  };

  // =============================================================================
  // Renderização da interface da tela
  // =============================================================================
  return (
    <div className="space-y-6 pb-12">
      
      {/* Banner de cabeçalho: título da tela e ações de exportação/importação */}
      <div className="bg-gradient-to-r from-blue-950/60 via-indigo-950/40 to-slate-900/80 backdrop-blur-xl border border-blue-500/30 rounded-2xl p-6 text-white shadow-2xl flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-500/40 backdrop-blur-md">
              <BookOpen className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Banco de Perguntas</h1>
              <p className="text-xs text-blue-200/80 mt-0.5">
                Gestão completa do acervo com cadastro manual, suporte a V/F, categorias dinâmicas e importação/exportação via planilha.
              </p>
            </div>
          </div>
        </div>

        {/* Botões de ação: baixar modelo, exportar, importar e criar nova pergunta */}
        <div className="flex items-center space-x-2 flex-wrap gap-2">
          <button
            onClick={() => triggerDownloadCSV('modelo_planilha_perguntas_sst.csv', generateCSVTemplatePerguntas())}
            className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 font-bold text-xs px-3.5 py-2.5 rounded-xl backdrop-blur-md flex items-center space-x-2 transition-all"
            title="Baixar modelo padrão de planilha em formato CSV compatível com o banco"
          >
            <Download className="w-4 h-4 text-purple-400" />
            <span>Baixar Modelo de Planilha</span>
          </button>

          <button
            onClick={() => triggerDownloadCSV('perguntas_sst_exportadas.csv', exportPerguntasToCSV(perguntasFiltradas))}
            className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 font-bold text-xs px-3.5 py-2.5 rounded-xl backdrop-blur-md flex items-center space-x-2 transition-all"
            title="Exportar perguntas filtradas para arquivo CSV"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Exportar Perguntas</span>
          </button>

          <button
            onClick={() => {
              setCsvErrorMsg('');
              setCsvSuccessMsg('');
              setShowCSVModal(true);
            }}
            className="bg-white/10 hover:bg-white/20 text-slate-200 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-white/10 backdrop-blur-md flex items-center space-x-2 transition-all"
          >
            <Upload className="w-4 h-4 text-blue-400" />
            <span>Importar Planilha CSV</span>
          </button>

          <button
            onClick={() => {
              resetFormulario();
              setShowNovaModal(true);
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-md transition-all flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Pergunta</span>
          </button>
        </div>
      </div>

      {/* Barra de busca e filtros por categoria (setor/tema) e dificuldade */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xl">
        {/* Campo de busca por enunciado, norma ou categoria */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por enunciado, norma ou categoria..."
            className="w-full bg-slate-900/80 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center space-x-3 flex-wrap gap-2">
          <select
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
            className="bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="todas">Todas as Categorias</option>
            {categoriasDisponiveis.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={dificuldadeFiltro}
            onChange={(e) => setDificuldadeFiltro(e.target.value)}
            className="bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
          >
            <option value="todas">Todas as Dificuldades</option>
            <option value="Fácil">Fácil</option>
            <option value="Médio">Médio</option>
            <option value="Difícil">Difícil</option>
          </select>
        </div>
      </div>

      {/* =========================================================================
          Lista de perguntas exibida como cards, com categoria, tipo (V/F ou
          múltipla escolha), norma, status ativo/inativo, dificuldade, tempo,
          alternativas, explicação e botões de editar/excluir
          ========================================================================= */}
      <div className="space-y-3">
        {/* Se nenhuma pergunta corresponder aos filtros, exibe o estado vazio */}
        {perguntasFiltradas.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center text-slate-400 space-y-2">
            <HelpCircle className="w-10 h-10 text-slate-500 mx-auto" />
            <p className="font-semibold text-sm text-slate-300">Nenhuma pergunta encontrada para os filtros selecionados.</p>
            <p className="text-xs">Cadastre uma nova pergunta ou ajuste sua busca no campo acima.</p>
          </div>
        ) : (
          perguntasFiltradas.map((perg) => (
            <div key={perg.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-white shadow-xl space-y-3">
              {/* Cabeçalho do card: selos (categoria, tipo, norma), status e dificuldade */}
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="bg-blue-500/20 text-blue-300 font-bold text-[11px] px-2.5 py-0.5 rounded-full border border-blue-500/30">
                    {perg.categoria}
                  </span>
                  
                  {perg.tipo === 'verdadeiro_falso' ? (
                    <span className="bg-amber-500/20 text-amber-300 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-amber-500/40">
                      Verdadeiro ou Falso (V/F)
                    </span>
                  ) : (
                    <span className="bg-purple-500/20 text-purple-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-purple-500/30">
                      Múltipla Escolha
                    </span>
                  )}

                  {perg.norma_relacionada && (
                    <span className="bg-white/10 text-slate-300 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-white/10">
                      {perg.norma_relacionada}
                    </span>
                  )}
                  
                  <button
                    onClick={() => editarPergunta(perg.id, { ativa: perg.ativa === false })}
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border transition-all ${
                      perg.ativa !== false 
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30' 
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                    }`}
                    title="Alternar Status (Ativa/Inativa)"
                  >
                    {perg.ativa !== false ? 'Ativa' : 'Inativa'}
                  </button>

                  <button
                    onClick={() => editarPergunta(perg.id, { disponivel_desafios: perg.disponivel_desafios === false })}
                    className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border transition-all ${
                      perg.disponivel_desafios !== false
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                    }`}
                    title="Disponibilidade em Desafios 1v1"
                  >
                    {perg.disponivel_desafios !== false ? '⚔️ Desafios 1v1 ON' : '🚫 Desafios 1v1 OFF'}
                  </button>

                  <span className="text-slate-400 text-[11px]">
                    • Dificuldade: <strong className="text-slate-200">{perg.dificuldade}</strong>
                  </span>
                </div>

                {/* Lado direito do cabeçalho: tempo limite e ações de editar/excluir */}
                <div className="flex items-center space-x-3 text-xs text-slate-400">
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span>{perg.tempo_limite_segundos}s</span>
                  </div>
                  <div className="flex items-center space-x-1 border-l border-white/10 pl-2">
                    <button
                      onClick={() => abrirModalEditar(perg)}
                      className="p-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded-lg border border-blue-500/40 transition-all"
                      title="Editar Pergunta"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: 'Confirmar Exclusão de Pergunta',
                          itemName: `Pergunta: "${perg.enunciado.substring(0, 40)}..."`,
                          actionType: 'delete',
                          onConfirm: () => excluirPergunta(perg.id),
                        });
                      }}
                      className="p-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg border border-rose-500/40 transition-all"
                      title="Excluir Pergunta"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Enunciado da pergunta */}
              <h3 className="font-bold text-sm text-white leading-relaxed">
                {perg.enunciado}
              </h3>

              {/* Alternativas da pergunta; a correta aparece destacada em verde */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {perg.alternativas.map((alt, altIdx) => (
                  <div 
                    key={altIdx} 
                    className={`p-2.5 rounded-xl border flex items-center space-x-2 backdrop-blur-md ${
                      altIdx === perg.resposta_correta
                        ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300 font-semibold'
                        : 'bg-white/5 border-white/5 text-slate-400'
                    }`}
                  >
                    <span className="font-bold text-[11px]">{String.fromCharCode(65 + altIdx)}.</span>
                    <span className="truncate">{formatAlternativaText(alt)}</span>
                    {altIdx === perg.resposta_correta && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 ml-auto" />}
                  </div>
                ))}
              </div>

              {/* Explicação educativa exibida ao colaborador após responder */}
              <div className="text-xs text-slate-400 bg-slate-950/60 backdrop-blur-md p-3 rounded-xl border border-white/10">
                <strong className="text-slate-300">Explicação:</strong> {perg.explicacao}
              </div>
            </div>
          ))
        )}
      </div>

      {/* =========================================================================
          Modal 1: Cadastro manual de nova pergunta
          ========================================================================= */}
      {showNovaModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900/95 border border-white/15 rounded-2xl max-w-xl w-full p-6 text-white space-y-4 shadow-2xl my-auto backdrop-blur-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-lg text-white">
                Cadastrar Nova Pergunta no Banco
              </h3>
              <button onClick={() => setShowNovaModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagem de erro de validação do formulário, se houver */}
            {perguntaErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{perguntaErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCriarPerguntaManual} className="space-y-4 text-xs">
              
              {/* Seleção do tipo de pergunta: múltipla escolha ou verdadeiro/falso */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Tipo de Pergunta</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNovoTipo('multipla_escolha');
                      setNovasAlternativas(['', '', '', '']);
                      setNovaRespostaCorreta(0);
                    }}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                      novoTipo === 'multipla_escolha'
                        ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    Múltipla Escolha (4 opções)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNovoTipo('verdadeiro_falso');
                      setNovasAlternativas(['Verdadeiro', 'Falso']);
                      setNovaRespostaCorreta(0);
                    }}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                      novoTipo === 'verdadeiro_falso'
                        ? 'bg-amber-600 border-amber-400 text-white shadow-md'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    Verdadeiro ou Falso (V/F)
                  </button>
                </div>
              </div>

              {/* Categoria (com opção de criar nova) e dificuldade da pergunta */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-300">Categoria</label>
                    <button
                      type="button"
                      onClick={() => setShowNovaCategoriaInput(!showNovaCategoriaInput)}
                      className="text-[11px] text-blue-400 hover:underline flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Nova Categoria</span>
                    </button>
                  </div>

                  {showNovaCategoriaInput ? (
                    <div className="flex space-x-1">
                      <input
                        type="text"
                        value={novaCategoriaDigitada}
                        onChange={(e) => setNovaCategoriaDigitada(e.target.value)}
                        placeholder="Nome da categoria..."
                        className="flex-1 bg-slate-950/80 border border-blue-500/50 rounded-xl p-2 text-slate-200 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleSalvarNovaCategoria}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <select
                      value={novaCategoria}
                      onChange={(e) => setNovaCategoria(e.target.value)}
                      className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                    >
                      {categoriasDisponiveis.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Dificuldade</label>
                  <select
                    value={novaDificuldade}
                    onChange={(e) => setNovaDificuldade(e.target.value as DificuldadePergunta)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="Fácil">Fácil</option>
                    <option value="Médio">Médio</option>
                    <option value="Difícil">Difícil</option>
                  </select>
                </div>
              </div>

              {/* Enunciado da pergunta (campo obrigatório) */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Enunciado da Pergunta</label>
                <textarea
                  value={novoEnunciado}
                  onChange={(e) => setNovoEnunciado(e.target.value)}
                  placeholder="Escreva a pergunta claramente..."
                  rows={3}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-200"
                  required
                />
              </div>

              {/* Seleção das alternativas e marcação da resposta correta */}
              {novoTipo === 'verdadeiro_falso' ? (
                <div className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-white/10">
                  <label className="block font-semibold text-slate-300">Selecione a resposta correta:</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`p-3 rounded-xl border flex items-center space-x-3 cursor-pointer transition-all ${
                      novaRespostaCorreta === 0 ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}>
                      <input
                        type="radio"
                        name="vf-correta"
                        checked={novaRespostaCorreta === 0}
                        onChange={() => setNovaRespostaCorreta(0)}
                        className="accent-emerald-500"
                      />
                      <span className="font-bold">Verdadeiro</span>
                    </label>

                    <label className={`p-3 rounded-xl border flex items-center space-x-3 cursor-pointer transition-all ${
                      novaRespostaCorreta === 1 ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}>
                      <input
                        type="radio"
                        name="vf-correta"
                        checked={novaRespostaCorreta === 1}
                        onChange={() => setNovaRespostaCorreta(1)}
                        className="accent-emerald-500"
                      />
                      <span className="font-bold">Falso</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block font-semibold text-slate-300">Alternativas de Resposta (Marque a correta)</label>
                  {novasAlternativas.map((alt, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="correta"
                        checked={novaRespostaCorreta === idx}
                        onChange={() => setNovaRespostaCorreta(idx)}
                        className="accent-emerald-500"
                      />
                      <input
                        type="text"
                        value={alt}
                        onChange={(e) => {
                          const copy = [...novasAlternativas];
                          copy[idx] = e.target.value;
                          setNovasAlternativas(copy);
                        }}
                        placeholder={`Alternativa ${String.fromCharCode(65 + idx)}`}
                        className="flex-1 bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                        required
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Tempo limite de resposta (em segundos) e norma regulamentadora relacionada */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Tempo Limite (segundos)</label>
                  <select
                    value={novoTempoLimite}
                    onChange={(e) => setNovoTempoLimite(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value={15}>15 segundos</option>
                    <option value={30}>30 segundos</option>
                    <option value={45}>45 segundos</option>
                    <option value={60}>60 segundos</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-300">Norma Relacionada</label>
                    <button
                      type="button"
                      onClick={() => setShowNovaNormaInput(!showNovaNormaInput)}
                      className="text-[11px] text-blue-400 hover:underline flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Nova Norma</span>
                    </button>
                  </div>

                  {showNovaNormaInput ? (
                    <div className="flex space-x-1">
                      <input
                        type="text"
                        value={novaNormaDigitada}
                        onChange={(e) => setNovaNormaDigitada(e.target.value)}
                        placeholder="Ex: NR-35, NR-10..."
                        className="flex-1 bg-slate-950/80 border border-blue-500/50 rounded-xl p-2 text-slate-200 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleSalvarNovaNorma}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <select
                      value={novaNorma}
                      onChange={(e) => setNovaNorma(e.target.value)}
                      className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                    >
                      {normasDisponiveis.map(norma => (
                        <option key={norma} value={norma}>{norma}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Explicação técnica/fundamentação exibida após a resposta */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Explicação Técnica / Fundamentação</label>
                <textarea
                  value={novaExplicacao}
                  onChange={(e) => setNovaExplicacao(e.target.value)}
                  placeholder="Explicação exibida após o colaborador responder..."
                  rows={2}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              {/* Seletor de disponibilidade para Desafios 1v1 */}
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={novoDisponivelDesafios}
                    onChange={(e) => setNovoDisponivelDesafios(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400 h-4 w-4 bg-slate-950 border-white/20"
                  />
                  <span className="text-xs font-bold text-amber-200">
                    Disponível para Desafios 1v1 entre Colaboradores
                  </span>
                </label>
                <p className="text-[10px] text-amber-300/70 ml-6 mt-0.5">
                  Desmarque para restringir esta pergunta apenas a Campanhas e Quiz Guiado com Instrutor.
                </p>
              </div>

              {/* Rodapé do formulário: cancelar ou salvar a nova pergunta */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowNovaModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Salvar Pergunta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          Modal 2: Importação de perguntas em lote via planilha CSV
          ========================================================================= */}
      {showCSVModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900/95 border border-white/15 rounded-2xl max-w-xl w-full p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <span>Importação de Perguntas via Planilha CSV</span>
              </h3>
              <button onClick={() => setShowCSVModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagem de erro da importação CSV, se houver */}
            {csvErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{csvErrorMsg}</span>
              </div>
            )}

            {/* Resumo de sucesso da importação, se houver */}
            {csvSuccessMsg && (
              <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold space-y-3 animate-fadeIn">
                <div className="flex items-start space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">{csvSuccessMsg}</div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCSVModal(false);
                      setCsvText('');
                      setCsvSuccessMsg('');
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-2 rounded-xl shadow-lg transition-all text-xs"
                  >
                    Confirmar e Fechar Resumo
                  </button>
                </div>
              </div>
            )}

            {/* Área de instruções: carregar arquivo .csv ou baixar o modelo padrão */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-slate-300 space-y-2">
              <p>
                Selecione um arquivo <strong>.csv</strong> do seu computador ou cole o conteúdo no campo abaixo.
              </p>
              <div className="flex items-center space-x-2">
                <input
                  type="file"
                  accept=".csv,.txt"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/40 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all text-xs"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Carregar Arquivo CSV</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerDownloadCSV('modelo_planilha_perguntas_sst.csv', generateCSVTemplatePerguntas())}
                  className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 transition-all text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Baixar Modelo Padrão</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleImportarCSV} className="space-y-3 text-xs">
              {/* Campo para colar o conteúdo CSV manualmente */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Conteúdo CSV (delimitado por ponto e vírgula ;):</label>
                <textarea
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  placeholder="categoria;tipo;dificuldade;enunciado;alternativa_a;alternativa_b;alternativa_c;alternativa_d;resposta_correta;explicacao;tempo_limite_segundos;norma_relacionada"
                  rows={8}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-200 font-mono text-[11px]"
                  required
                />
              </div>

              {/* Rodapé do formulário: cancelar ou processar a importação */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCSVModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Processar Importação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          Modal 3: Edição de pergunta existente
          ========================================================================= */}
      {perguntaParaEditar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
          <div className="relative my-auto w-full max-w-xl bg-slate-900/95 border border-white/15 rounded-2xl p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white flex items-center space-x-2">
                <Pencil className="w-4 h-4 text-blue-400" />
                <span>Editar Pergunta do Banco</span>
              </h3>
              <button onClick={() => setPerguntaParaEditar(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mensagem de erro de validação do formulário, se houver */}
            {perguntaErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{perguntaErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSalvarEdicao} className="space-y-4 text-xs">
              
              {/* Seleção do tipo de pergunta: múltipla escolha ou verdadeiro/falso */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Tipo de Pergunta</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNovoTipo('multipla_escolha');
                      if (novasAlternativas.length < 4) setNovasAlternativas(['', '', '', '']);
                    }}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                      novoTipo === 'multipla_escolha'
                        ? 'bg-blue-600 border-blue-400 text-white shadow-md'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    Múltipla Escolha (4 opções)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNovoTipo('verdadeiro_falso');
                      setNovasAlternativas(['Verdadeiro', 'Falso']);
                      if (novaRespostaCorreta > 1) setNovaRespostaCorreta(0);
                    }}
                    className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                      novoTipo === 'verdadeiro_falso'
                        ? 'bg-amber-600 border-amber-400 text-white shadow-md'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    Verdadeiro ou Falso (V/F)
                  </button>
                </div>
              </div>

              {/* Categoria e dificuldade da pergunta em edição */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Categoria</label>
                  <select
                    value={novaCategoria}
                    onChange={(e) => setNovaCategoria(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    {categoriasDisponiveis.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Dificuldade</label>
                  <select
                    value={novaDificuldade}
                    onChange={(e) => setNovaDificuldade(e.target.value as DificuldadePergunta)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="Fácil">Fácil</option>
                    <option value="Médio">Médio</option>
                    <option value="Difícil">Difícil</option>
                  </select>
                </div>
              </div>

              {/* Enunciado da pergunta (campo obrigatório) */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Enunciado da Pergunta</label>
                <textarea
                  value={novoEnunciado}
                  onChange={(e) => setNovoEnunciado(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-200"
                  required
                />
              </div>

              {/* Seleção das alternativas e marcação da resposta correta */}
              {novoTipo === 'verdadeiro_falso' ? (
                <div className="space-y-2 bg-slate-950/60 p-3 rounded-xl border border-white/10">
                  <label className="block font-semibold text-slate-300">Selecione a resposta correta:</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`p-3 rounded-xl border flex items-center space-x-3 cursor-pointer transition-all ${
                      novaRespostaCorreta === 0 ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}>
                      <input
                        type="radio"
                        name="vf-correta-edit"
                        checked={novaRespostaCorreta === 0}
                        onChange={() => setNovaRespostaCorreta(0)}
                        className="accent-emerald-500"
                      />
                      <span className="font-bold">Verdadeiro</span>
                    </label>

                    <label className={`p-3 rounded-xl border flex items-center space-x-3 cursor-pointer transition-all ${
                      novaRespostaCorreta === 1 ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-white/5 border-white/10 text-slate-400'
                    }`}>
                      <input
                        type="radio"
                        name="vf-correta-edit"
                        checked={novaRespostaCorreta === 1}
                        onChange={() => setNovaRespostaCorreta(1)}
                        className="accent-emerald-500"
                      />
                      <span className="font-bold">Falso</span>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block font-semibold text-slate-300">Alternativas (Marque a opção correta)</label>
                  {novasAlternativas.map((alt, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="correta-edit"
                        checked={novaRespostaCorreta === idx}
                        onChange={() => setNovaRespostaCorreta(idx)}
                        className="accent-emerald-500"
                      />
                      <input
                        type="text"
                        value={alt}
                        onChange={(e) => {
                          const copy = [...novasAlternativas];
                          copy[idx] = e.target.value;
                          setNovasAlternativas(copy);
                        }}
                        placeholder={`Alternativa ${String.fromCharCode(65 + idx)}`}
                        className="flex-1 bg-slate-950/80 border border-white/10 rounded-xl p-2 text-slate-200"
                        required
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Norma relacionada e tempo limite (em segundos) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-300">Norma Relacionada</label>
                    <button
                      type="button"
                      onClick={() => setShowNovaNormaInput(!showNovaNormaInput)}
                      className="text-[11px] text-blue-400 hover:underline flex items-center space-x-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Nova Norma</span>
                    </button>
                  </div>

                  {showNovaNormaInput ? (
                    <div className="flex space-x-1">
                      <input
                        type="text"
                        value={novaNormaDigitada}
                        onChange={(e) => setNovaNormaDigitada(e.target.value)}
                        placeholder="Ex: NR-35, NR-10..."
                        className="flex-1 bg-slate-950/80 border border-blue-500/50 rounded-xl p-2 text-slate-200 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleSalvarNovaNorma}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs"
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <select
                      value={novaNorma}
                      onChange={(e) => setNovaNorma(e.target.value)}
                      className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                    >
                      {normasDisponiveis.map(norma => (
                        <option key={norma} value={norma}>{norma}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Tempo Limite (s)</label>
                  <input
                    type="number"
                    min={10}
                    max={180}
                    value={Number.isNaN(Number(novoTempoLimite)) ? '' : novoTempoLimite}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      setNovoTempoLimite(isNaN(v) ? ('' as unknown as number) : v);
                    }}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  />
                </div>
              </div>

              {/* Explicação educativa da questão */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Explicação Educativa</label>
                <textarea
                  value={novaExplicacao}
                  onChange={(e) => setNovaExplicacao(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              {/* Seletor de disponibilidade para Desafios 1v1 */}
              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={novoDisponivelDesafios}
                    onChange={(e) => setNovoDisponivelDesafios(e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400 h-4 w-4 bg-slate-950 border-white/20"
                  />
                  <span className="text-xs font-bold text-amber-200">
                    Disponível para Desafios 1v1 entre Colaboradores
                  </span>
                </label>
                <p className="text-[10px] text-amber-300/70 ml-6 mt-0.5">
                  Desmarque para restringir esta pergunta apenas a Campanhas e Quiz Guiado com Instrutor.
                </p>
              </div>

              {/* Rodapé do formulário: cancelar ou salvar as alterações */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setPerguntaParaEditar(null)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal global de confirmação de segurança para exclusão/edição */}
      <SecurityConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        itemName={confirmModal.itemName}
        actionType={confirmModal.actionType}
      />

      {/* Modal de Pré-visualização de Importação em Lote de Perguntas */}
      <ImportPreviewModal
        isOpen={showPreviewModalCSV}
        onClose={() => {
          setShowPreviewModalCSV(false);
          setPreviewDataCSV(null);
        }}
        onConfirm={handleConfirmarImportacaoCSV}
        title="Pré-visualização da Importação de Perguntas"
        totalCount={previewDataCSV?.items.length || 0}
        errorsCount={previewDataCSV?.errors.length || 0}
        type="perguntas"
        previewItems={previewDataCSV?.items || []}
      />

    </div>
  );
};
