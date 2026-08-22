import React, { useState, useEffect } from 'react';
import { useSST } from '../../../context/SSTContext';
import { ModalidadeQuizGuiado, EstiloQuizGuiado, Pergunta, TipoPergunta, DificuldadePergunta, SalaQuizGuiado } from '../../../types';
import { 
  X, 
  HelpCircle, 
  Clock, 
  Award, 
  Sliders, 
  Tv, 
  ShieldCheck, 
  CheckCircle2, 
  Sparkles,
  Play,
  CheckSquare,
  Square,
  Search,
  Plus,
  Trash2,
  FileText,
  Save,
  ListChecks,
  Pencil
} from 'lucide-react';

interface CriarSalaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSalaCriada: (salaId: string) => void;
  salaParaEditar?: SalaQuizGuiado | null;
}

export const CriarSalaModal: React.FC<CriarSalaModalProps> = ({ isOpen, onClose, onSalaCriada, salaParaEditar }) => {
  const { currentUser, perguntas, criarSalaQuizGuiado, editarSalaQuizGuiado, adicionarPergunta, empresa } = useSST();

  // Obter lista de categorias/normas disponíveis
  const categoriasDisponiveis = Array.from(new Set((perguntas || []).map(p => p.categoria)));

  // Estados do formulário de criação da sala
  const [nomeSala, setNomeSala] = useState('');
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string>('todas');
  const [modalidade, setModalidade] = useState<ModalidadeQuizGuiado>('interativo');
  const [estilo, setEstilo] = useState<EstiloQuizGuiado>('competitivo');
  const [qtdPerguntas, setQtdPerguntas] = useState<number>(10);
  const [tempoPorPergunta, setTempoPorPergunta] = useState<number>(30); // 30s padrão
  const [notaMinimaAprovacao, setNotaMinimaAprovacao] = useState<number>(70); // 70% padrão
  const [modoTVPadrao, setModoTVPadrao] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Modo de seleção de perguntas pelo Instrutor:
  // 'auto' = Sorteio automático por categoria
  // 'banco' = Escolher manualmente quais perguntas do banco incluir
  // 'custom' = Criar perguntas próprias pelo próprio instrutor
  const [modoSelecaoPerguntas, setModoSelecaoPerguntas] = useState<'auto' | 'banco' | 'custom'>('auto');

  // Seleção manual de IDs de perguntas do banco
  const [perguntaIdsSelecionadas, setPerguntaIdsSelecionadas] = useState<string[]>([]);
  const [buscaPerguntaBanco, setBuscaPerguntaBanco] = useState('');

  // Perguntas customizadas criadas diretamente nesta sessão pelo instrutor
  const [perguntasInstrutor, setPerguntasInstrutor] = useState<Pergunta[]>([]);

  // Preenche o formulário ao abrir em modo de edição
  useEffect(() => {
    if (salaParaEditar && isOpen) {
      setNomeSala(salaParaEditar.nome || salaParaEditar.treinamento_titulo || '');
      setModalidade(salaParaEditar.modalidade || 'interativo');
      setEstilo(salaParaEditar.estilo || 'competitivo');
      setTempoPorPergunta(salaParaEditar.tempo_por_pergunta_seg ?? salaParaEditar.tempo_por_pergunta ?? 30);
      setNotaMinimaAprovacao(salaParaEditar.nota_minima_aprovacao ?? salaParaEditar.nota_minima ?? 70);
      setModoTVPadrao(salaParaEditar.mostrar_modo_tv ?? true);
      setPerguntasInstrutor(salaParaEditar.perguntas || []);
      setModoSelecaoPerguntas('custom');
      setErrorMsg('');
    } else if (isOpen && !salaParaEditar) {
      setNomeSala('');
      setModalidade('interativo');
      setEstilo('competitivo');
      setQtdPerguntas(10);
      setTempoPorPergunta(30);
      setNotaMinimaAprovacao(70);
      setModoTVPadrao(true);
      setPerguntaIdsSelecionadas([]);
      setPerguntasInstrutor([]);
      setModoSelecaoPerguntas('auto');
      setErrorMsg('');
    }
  }, [isOpen, salaParaEditar]);
  const [showFormNovaPergunta, setShowFormNovaPergunta] = useState(false);
  const [novoEnunciado, setNovoEnunciado] = useState('');
  const [novoTipo, setNovoTipo] = useState<TipoPergunta>('multipla_escolha');
  const [novaDificuldade, setNovaDificuldade] = useState<DificuldadePergunta>('Médio');
  const [novaCategoria, setNovaCategoria] = useState<string>('SST');
  const [novaNorma, setNovaNorma] = useState('NR-35');
  const [novasAlternativas, setNovasAlternativas] = useState<string[]>(['', '', '', '']);
  const [novaRespostaCorreta, setNovaRespostaCorreta] = useState<number>(0);
  const [novaExplicacao, setNovaExplicacao] = useState('');
  const [salvarTambemNoBanco, setSalvarTambemNoBanco] = useState<boolean>(true);
  const [formPerguntaError, setFormPerguntaError] = useState('');

  if (!isOpen) return null;

  // Toggle de seleção manual no banco
  const togglePerguntaBanco = (id: string) => {
    setPerguntaIdsSelecionadas(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Handler para adicionar pergunta customizada do instrutor
  const handleAdicionarPerguntaInstrutor = (e: React.FormEvent) => {
    e.preventDefault();
    setFormPerguntaError('');

    if (!novoEnunciado.trim()) {
      setFormPerguntaError('Por favor, informe o enunciado da questão.');
      return;
    }

    if (novoTipo === 'multipla_escolha' && novasAlternativas.some(a => !a.trim())) {
      setFormPerguntaError('Preencha todas as 4 alternativas.');
      return;
    }

    if (!novaExplicacao.trim()) {
      setFormPerguntaError('Por favor, inclua a explicação educativa.');
      return;
    }

    const altsFinais = novoTipo === 'verdadeiro_falso' ? ['Verdadeiro', 'Falso'] : novasAlternativas.map(a => a.trim());

    const novaP: Pergunta = {
      id: `p-inst-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      empresa_id: empresa.id,
      categoria: novaCategoria || 'SST',
      tipo: novoTipo,
      dificuldade: novaDificuldade,
      enunciado: novoEnunciado.trim(),
      alternativas: altsFinais,
      resposta_correta: novaRespostaCorreta,
      explicacao: novaExplicacao.trim(),
      norma_relacionada: novaNorma.trim() || 'NR-35',
      tempo_limite_segundos: tempoPorPergunta || 30,
      disponivel_desafios: false,
      ativa: true
    };

    // Se o instrutor optar por salvar no banco de dados global da empresa
    if (salvarTambemNoBanco) {
      adicionarPergunta({
        categoria: novaP.categoria,
        tipo: novaP.tipo,
        dificuldade: novaP.dificuldade,
        enunciado: novaP.enunciado,
        alternativas: novaP.alternativas,
        resposta_correta: novaP.resposta_correta,
        explicacao: novaP.explicacao,
        norma_relacionada: novaP.norma_relacionada,
        tempo_limite_segundos: novaP.tempo_limite_segundos,
        disponivel_desafios: false,
      });
    }

    setPerguntasInstrutor(prev => [...prev, novaP]);

    // Reseta form da questão
    setNovoEnunciado('');
    setNovasAlternativas(['', '', '', '']);
    setNovaRespostaCorreta(0);
    setNovaExplicacao('');
    setShowFormNovaPergunta(false);
    setFormPerguntaError('');
  };

  // Remover pergunta customizada criada nesta sessão
  const handleRemoverPerguntaInstrutor = (id: string) => {
    setPerguntasInstrutor(prev => prev.filter(p => p.id !== id));
  };

  // Perguntas do banco filtradas
  const perguntasFiltradasBanco = perguntas.filter(p => {
    const matchCat = categoriaSelecionada === 'todas' || p.categoria === categoriaSelecionada;
    const busca = (buscaPerguntaBanco || '').toLowerCase();
    const matchBusca = !busca || 
      (p.enunciado && p.enunciado.toLowerCase().includes(busca)) ||
      (p.norma_relacionada && p.norma_relacionada.toLowerCase().includes(busca)) ||
      (p.categoria && p.categoria.toLowerCase().includes(busca));
    return matchCat && matchBusca;
  });

  // Handler final para submeter a criação da sala
  const handleCriar = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // SECURITY (defesa em profundidade, REGRA DE NEGÓCIO): somente usuários
    // marcados como "Instrutor" (is_instrutor === true) podem criar salas de
    // Quiz Guiado, INDEPENDENTE do perfil. Admin/Super Admin sem a marcação
    // de Instrutor NÃO podem. O contexto também valida em criarSalaQuizGuiado.
    const podeCriar = currentUser?.is_instrutor === true;
    if (!podeCriar) {
      setErrorMsg('Acesso negado: somente usuários marcados como Instrutor podem criar salas de Quiz Guiado.');
      return;
    }

    if (!nomeSala.trim()) {
      setErrorMsg('Por favor, informe o nome ou identificação da sala.');
      return;
    }

    let perguntasFinais: Pergunta[] = [];

    if (modoSelecaoPerguntas === 'auto') {
      const disponiveis = categoriaSelecionada === 'todas'
        ? perguntas
        : perguntas.filter(p => p.categoria === categoriaSelecionada);

      if (disponiveis.length === 0) {
        setErrorMsg('Nenhuma pergunta encontrada para esta categoria.');
        return;
      }

      const embaralhadas = [...disponiveis].sort(() => Math.random() - 0.5);
      perguntasFinais = embaralhadas.slice(0, Math.min(qtdPerguntas, disponiveis.length));
    } 
    else if (modoSelecaoPerguntas === 'banco') {
      if (perguntaIdsSelecionadas.length === 0) {
        setErrorMsg('Por favor, selecione ao menos uma pergunta do banco de dados.');
        return;
      }
      const doBanco = perguntas.filter(p => perguntaIdsSelecionadas.includes(p.id));
      perguntasFinais = [...doBanco, ...perguntasInstrutor];
    }
    else {
      // Modo custom / perguntas do instrutor
      const doBanco = perguntas.filter(p => perguntaIdsSelecionadas.includes(p.id));
      perguntasFinais = [...doBanco, ...perguntasInstrutor];

      if (perguntasFinais.length === 0) {
        setErrorMsg('Adicione ao menos uma pergunta própria ou selecione perguntas do banco.');
        return;
      }
    }

    try {
      if (salaParaEditar) {
        editarSalaQuizGuiado(salaParaEditar.id, {
          nome: nomeSala.trim(),
          treinamento_titulo: nomeSala.trim(),
          modalidade,
          estilo,
          tempo_por_pergunta_seg: tempoPorPergunta,
          tempo_por_pergunta: tempoPorPergunta,
          nota_minima_aprovacao: notaMinimaAprovacao,
          nota_minima: notaMinimaAprovacao,
          perguntas: perguntasFinais,
          mostrar_modo_tv: modoTVPadrao,
        });
        onSalaCriada(salaParaEditar.id);
        onClose();
        return;
      }

      const novaSala = criarSalaQuizGuiado({
        nome: nomeSala.trim(),
        modalidade,
        estilo,
        tempo_por_pergunta: tempoPorPergunta,
        nota_minima_aprovacao: notaMinimaAprovacao,
        perguntas: perguntasFinais,
        mostrar_modo_tv: modoTVPadrao,
      });

      onSalaCriada(novaSala.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar a sala.');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 overflow-y-auto p-4 sm:p-6 flex min-h-full items-center justify-center">
      <div className="relative my-auto w-full max-w-3xl bg-slate-900/95 border border-white/15 rounded-3xl p-6 text-white space-y-5 shadow-2xl backdrop-blur-xl max-h-[90vh] overflow-y-auto">
        
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gradient-to-tr from-amber-500 to-orange-500 rounded-2xl text-slate-950 font-black shadow-lg">
              <Sparkles className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-white">
                {salaParaEditar ? 'Editar Sala de Quiz Guiado' : 'Criar Nova Sala de Quiz Guiado'}
              </h3>
              <p className="text-xs text-slate-400">
                {salaParaEditar ? 'Altere as configurações e perguntas desta sala' : 'Configure a sessão de treinamento e defina as perguntas do Instrutor'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
            <X className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleCriar} className="space-y-4 text-xs">
          
          {/* Nome da Sala / Turma */}
          <div>
            <label className="block font-extrabold text-slate-200 mb-1">
              Nome da Sala / Turma de Treinamento *
            </label>
            <input
              type="text"
              value={nomeSala}
              onChange={(e) => setNomeSala(e.target.value)}
              placeholder="Ex: Treinamento Presencial NR-10 (Turma Operacional A)"
              className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-3 text-slate-100 font-medium focus:border-emerald-500 focus:outline-none"
              required
            />
          </div>

          {/* Modalidade: Interativo vs Avaliação Formal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div 
              onClick={() => setModalidade('interativo')}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                modalidade === 'interativo'
                  ? 'bg-amber-500/20 border-amber-500/60 ring-2 ring-amber-500/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center space-x-2 font-black text-amber-300 text-sm mb-1">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Modo Interativo (Gamificado)</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Foco em engajamento e dinâmicas de conscientização. Mostra ranking e gabarito em tempo real.
              </p>
            </div>

            <div 
              onClick={() => setModalidade('avaliacao')}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                modalidade === 'avaliacao'
                  ? 'bg-blue-500/20 border-blue-500/60 ring-2 ring-blue-500/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="flex items-center space-x-2 font-black text-blue-300 text-sm mb-1">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span>Modo Avaliação Teórica SST</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Foco em prova formal com nota individual (0-10), aprovação por nota mínima e emissão de ficha.
              </p>
            </div>
          </div>

          {/* Se Modo Interativo, Escolher Estilo */}
          {modalidade === 'interativo' && (
            <div className="bg-white/5 p-3 rounded-2xl border border-white/10 space-y-2">
              <label className="block font-bold text-slate-200">Estilo de Pontuação Gamificada</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEstilo('competitivo')}
                  className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center space-x-2 transition-all ${
                    estilo === 'competitivo'
                      ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                      : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>Competitivo (Velocidade + Bônus)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEstilo('educacional')}
                  className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center space-x-2 transition-all ${
                    estilo === 'educacional'
                      ? 'bg-purple-500/30 border-purple-400 text-purple-200'
                      : 'bg-slate-950/60 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-purple-400" />
                  <span>Educacional (Pontos Fixos + Explicação)</span>
                </button>
              </div>
            </div>
          )}

          {/* ABA / MODOS DE SELEÇÃO E CRIAÇÃO DE PERGUNTAS */}
          <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/10 pb-3">
              <label className="font-extrabold text-amber-300 text-xs flex items-center space-x-2">
                <ListChecks className="w-4 h-4 text-amber-400" />
                <span>Definição das Perguntas do Treinamento</span>
              </label>

              <div className="flex items-center space-x-1 bg-white/5 p-1 rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => setModoSelecaoPerguntas('auto')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all ${
                    modoSelecaoPerguntas === 'auto'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🎲 Sorteio Automático
                </button>
                <button
                  type="button"
                  onClick={() => setModoSelecaoPerguntas('banco')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all ${
                    modoSelecaoPerguntas === 'banco'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🎯 Selecionar do Banco ({perguntaIdsSelecionadas.length})
                </button>
                <button
                  type="button"
                  onClick={() => setModoSelecaoPerguntas('custom')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition-all ${
                    modoSelecaoPerguntas === 'custom'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ✏️ Criar / Próprias ({perguntasInstrutor.length})
                </button>
              </div>
            </div>

            {/* MODO 1: SORTEIO AUTOMÁTICO */}
            {modoSelecaoPerguntas === 'auto' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-bold text-slate-200 mb-1">Treinamento / Categoria SST</label>
                  <select
                    value={categoriaSelecionada}
                    onChange={(e) => setCategoriaSelecionada(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="todas">Todas as Normas e Temas ({perguntas.length} questões)</option>
                    {categoriasDisponiveis.map(cat => {
                      const count = perguntas.filter(p => p.categoria === cat).length;
                      return <option key={cat} value={cat}>{cat} ({count} questões)</option>;
                    })}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-200 mb-1">Qtd. de Perguntas na Sessão</label>
                  <select
                    value={qtdPerguntas}
                    onChange={(e) => setQtdPerguntas(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value={5}>5 Perguntas (Quiz Rápido)</option>
                    <option value={10}>10 Perguntas (Padrão Treinamento)</option>
                    <option value={15}>15 Perguntas (Completo)</option>
                    <option value={20}>20 Perguntas (Extensivo)</option>
                  </select>
                </div>
              </div>
            )}

            {/* MODO 2: SELEÇÃO MANUAL DO BANCO DE DADOS */}
            {modoSelecaoPerguntas === 'banco' && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={buscaPerguntaBanco}
                      onChange={(e) => setBuscaPerguntaBanco(e.target.value)}
                      placeholder="Buscar por enunciado ou norma..."
                      className="w-full bg-slate-900 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-slate-200 text-xs"
                    />
                  </div>
                  <select
                    value={categoriaSelecionada}
                    onChange={(e) => setCategoriaSelecionada(e.target.value)}
                    className="bg-slate-900 border border-white/10 rounded-xl p-2 text-slate-200 text-xs"
                  >
                    <option value="todas">Todas as Categorias</option>
                    {categoriasDisponiveis.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                  {perguntasFiltradasBanco.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      Nenhuma pergunta encontrada com o filtro atual.
                    </div>
                  ) : (
                    perguntasFiltradasBanco.map(p => {
                      const selected = perguntaIdsSelecionadas.includes(p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => togglePerguntaBanco(p.id)}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start space-x-2 text-xs ${
                            selected
                              ? 'bg-emerald-500/20 border-emerald-500/60 text-white'
                              : 'bg-slate-900/60 border-white/5 text-slate-400 hover:bg-white/5'
                          }`}
                        >
                          {selected ? (
                            <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold leading-snug">{p.enunciado}</div>
                            <div className="text-[10px] text-slate-400 flex items-center space-x-2 mt-1">
                              <span className="bg-white/10 px-1.5 py-0.2 rounded text-slate-300">{p.categoria}</span>
                              <span>• {p.norma_relacionada || 'SST'}</span>
                              <span>• {p.dificuldade}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="text-[11px] text-amber-300 font-bold text-right">
                  {perguntaIdsSelecionadas.length} pergunta(s) selecionada(s) manualmente
                </div>
              </div>
            )}

            {/* MODO 3: CRIAR / GERENCIAR PERGUNTAS DO INSTRUTOR */}
            {modoSelecaoPerguntas === 'custom' && (
              <div className="space-y-3 pt-1">
                {/* Lista de perguntas já criadas pelo instrutor nesta sessão */}
                {perguntasInstrutor.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-300">
                      Perguntas Próprias Adicionadas ({perguntasInstrutor.length}):
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {perguntasInstrutor.map((p, idx) => (
                        <div key={p.id} className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-amber-200 text-xs">{idx + 1}. {p.enunciado}</div>
                            <div className="text-[10px] text-slate-400 flex items-center space-x-2 mt-0.5">
                              <span>Norma: {p.norma_relacionada}</span>
                              <span>• {p.alternativas.length} alternativas</span>
                              <span className="text-emerald-400 font-bold">• Resp. Correta: {p.alternativas[p.resposta_correta]}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoverPerguntaInstrutor(p.id)}
                            className="p-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg border border-rose-500/40 shrink-0"
                            title="Remover Pergunta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Formulário para adicionar nova pergunta customizada */}
                {!showFormNovaPergunta ? (
                  <button
                    type="button"
                    onClick={() => setShowFormNovaPergunta(true)}
                    className="w-full py-3 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold rounded-2xl flex items-center justify-center space-x-2 transition-all text-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Criar Nova Pergunta do Instrutor</span>
                  </button>
                ) : (
                  <div className="bg-slate-900 p-4 rounded-2xl border border-amber-500/40 space-y-3">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <h4 className="font-extrabold text-amber-300 text-xs flex items-center space-x-2">
                        <Pencil className="w-4 h-4 text-amber-400" />
                        <span>Formulário de Pergunta do Instrutor</span>
                      </h4>
                      <button
                        type="button"
                        onClick={() => setShowFormNovaPergunta(false)}
                        className="text-slate-400 hover:text-white text-xs"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {formPerguntaError && (
                      <div className="p-2 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-[11px] font-bold">
                        {formPerguntaError}
                      </div>
                    )}

                    <div>
                      <label className="block font-bold text-slate-300 mb-1">Enunciado da Questão *</label>
                      <textarea
                        value={novoEnunciado}
                        onChange={(e) => setNovoEnunciado(e.target.value)}
                        placeholder="Ex: Qual o equipamento mínimo obrigatório para trabalho em altura acima de 2 metros?"
                        rows={2}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-slate-200 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block font-bold text-slate-300 mb-1">Tipo</label>
                        <select
                          value={novoTipo}
                          onChange={(e) => setNovoTipo(e.target.value as TipoPergunta)}
                          className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-slate-200 text-xs"
                        >
                          <option value="multipla_escolha">Múltipla Escolha</option>
                          <option value="verdadeiro_falso">Verdadeiro ou Falso</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-300 mb-1">Dificuldade</label>
                        <select
                          value={novaDificuldade}
                          onChange={(e) => setNovaDificuldade(e.target.value as DificuldadePergunta)}
                          className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-slate-200 text-xs"
                        >
                          <option value="Fácil">Fácil</option>
                          <option value="Médio">Médio</option>
                          <option value="Difícil">Difícil</option>
                        </select>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-300 mb-1">Norma Relacionada</label>
                        <input
                          type="text"
                          value={novaNorma}
                          onChange={(e) => setNovaNorma(e.target.value)}
                          placeholder="Ex: NR-35"
                          className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-slate-200 text-xs"
                        />
                      </div>
                    </div>

                    {/* Alternativas */}
                    {novoTipo === 'multipla_escolha' ? (
                      <div className="space-y-1.5">
                        <label className="block font-bold text-slate-300">Alternativas (Marque a correta)</label>
                        {novasAlternativas.map((alt, idx) => (
                          <div key={idx} className="flex items-center space-x-2">
                            <input
                              type="radio"
                              name="rad-correta-inst"
                              checked={novaRespostaCorreta === idx}
                              onChange={() => setNovaRespostaCorreta(idx)}
                              className="accent-amber-500"
                            />
                            <input
                              type="text"
                              value={typeof alt === 'string' ? alt : (alt ? String(alt) : '')}
                              onChange={(e) => {
                                const copy = [...novasAlternativas];
                                copy[idx] = e.target.value;
                                setNovasAlternativas(copy);
                              }}
                              placeholder={`Alternativa ${String.fromCharCode(65 + idx)}`}
                              className="flex-1 bg-slate-950 border border-white/10 rounded-xl p-2 text-slate-200 text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <label className="block font-bold text-slate-300">Resposta Correta</label>
                        <div className="flex space-x-3">
                          <label className="flex items-center space-x-2 cursor-pointer text-xs">
                            <input
                              type="radio"
                              name="rad-vf-inst"
                              checked={novaRespostaCorreta === 0}
                              onChange={() => setNovaRespostaCorreta(0)}
                              className="accent-amber-500"
                            />
                            <span>Verdadeiro</span>
                          </label>
                          <label className="flex items-center space-x-2 cursor-pointer text-xs">
                            <input
                              type="radio"
                              name="rad-vf-inst"
                              checked={novaRespostaCorreta === 1}
                              onChange={() => setNovaRespostaCorreta(1)}
                              className="accent-amber-500"
                            />
                            <span>Falso</span>
                          </label>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block font-bold text-slate-300 mb-1">Explicação Educativa *</label>
                      <textarea
                        value={novaExplicacao}
                        onChange={(e) => setNovaExplicacao(e.target.value)}
                        placeholder="Explicação exibida para os participantes após responderem..."
                        rows={2}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl p-2 text-slate-200 text-xs"
                      />
                    </div>

                    <label className="flex items-center space-x-2 cursor-pointer text-amber-200 text-xs pt-1">
                      <input
                        type="checkbox"
                        checked={salvarTambemNoBanco}
                        onChange={(e) => setSalvarTambemNoBanco(e.target.checked)}
                        className="rounded text-amber-500 focus:ring-amber-400 h-4 w-4 bg-slate-950"
                      />
                      <span>Salvar esta pergunta também no Banco de Dados Global da Empresa</span>
                    </label>

                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowFormNovaPergunta(false)}
                        className="bg-white/10 hover:bg-white/20 text-slate-300 font-bold px-3 py-1.5 rounded-xl text-xs"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleAdicionarPerguntaInstrutor}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-1.5 rounded-xl shadow-lg flex items-center space-x-1 text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Adicionar Pergunta à Sala</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tempo por Pergunta e Nota Mínima */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-200 mb-1 flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>Tempo Limite por Questão</span>
              </label>
              <select
                value={tempoPorPergunta}
                onChange={(e) => setTempoPorPergunta(Number(e.target.value))}
                className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
              >
                <option value={15}>15 segundos (Dinâmico e Rápido)</option>
                <option value={30}>30 segundos (Recomendado)</option>
                <option value={45}>45 segundos (Moderado)</option>
                <option value={60}>60 segundos (Reflexivo)</option>
                <option value={0}>Sem Tempo Limite (Avanço Manual)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-200 mb-1 flex items-center space-x-1.5">
                <Award className="w-4 h-4 text-emerald-400" />
                <span>Nota Mínima para Aprovação</span>
              </label>
              <select
                value={notaMinimaAprovacao}
                onChange={(e) => setNotaMinimaAprovacao(Number(e.target.value))}
                className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
              >
                <option value={50}>50% (Nota 5.0)</option>
                <option value={60}>60% (Nota 6.0)</option>
                <option value={70}>70% (Nota 7.0 - Padrão SST)</option>
                <option value={80}>80% (Nota 8.0 - Exigente)</option>
                <option value={90}>90% (Nota 9.0 - Rigoroso)</option>
              </select>
            </div>
          </div>

          {/* Opção Modo Datashow/TV */}
          <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/10 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Tv className="w-5 h-5 text-purple-400 shrink-0" />
              <div>
                <span className="font-bold text-slate-200 text-xs block">Otimizado para Projeção (Modo TV/Datashow)</span>
                <span className="text-[10px] text-slate-400 block">Exibe visual em alta definição com timer gigante e QR Code para retroprojetor</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={modoTVPadrao}
              onChange={(e) => setModoTVPadrao(e.target.checked)}
              className="rounded text-purple-500 focus:ring-purple-400 h-5 w-5 bg-slate-900 border-white/20"
            />
          </div>

          {/* Rodapé: Botão Criar Sala */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2.5 rounded-xl border border-white/10 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black px-6 py-2.5 rounded-xl shadow-lg flex items-center space-x-2 transition-all transform hover:scale-102"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>Gerar PIN e Abrir Sala</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
