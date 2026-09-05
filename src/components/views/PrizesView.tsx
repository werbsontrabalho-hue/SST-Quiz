// ============================================================
// VIEW DE PRÊMIOS E LOJA DE RESGATE (PrizesView)
// ============================================================
// Responsável pelo catálogo de prêmios da empresa: listar,
// filtrar, criar, editar e excluir prêmios, além de gerenciar
// o resgate de pontos (solicitação, aprovação, entrega e
// rejeição) e o vínculo dos prêmios à campanha vigente.
// ============================================================

import React, { useState, useRef } from 'react';
import { useSST } from '../../context/SSTContext';
import { Premiacao, ResgatePremio } from '../../types';
import { CameraCaptureModal } from '../CameraCaptureModal';
import { compressImageFile } from '../../utils/imageCompressor';
import { 
  Gift, Plus, Award, CheckCircle2, Pencil, Trash2, X, Upload, Camera,
  Coins, PackageCheck, Clock, AlertCircle, Check, XCircle, ShoppingBag, 
  ShieldCheck
} from 'lucide-react';

// ============================================================
// Componente principal: PrizesView
// Consome o contexto global useSST (estado e ações de prêmios
// e resgates compartilhados com toda a aplicação).
// ============================================================
export const PrizesView: React.FC = () => {
  // Ações e dados obtidos do contexto SST:
  // - premiacoes: lista de prêmios cadastrados
  // - adicionarPremiacao / editarPremiacao / excluirPremiacao: CRUD de prêmios
  // - resgates: solicitações de resgate feitas pelos usuários
  // - solicitarResgatePremio: consome pontos e cria uma solicitação
  // - atualizarStatusResgate: aprova / entrega / rejeita uma solicitação
  // - currentUser / empresa: identificam o usuário logado e sua empresa
  const { 
    premiacoes, 
    adicionarPremiacao, 
    editarPremiacao, 
    excluirPremiacao, 
    resgates,
    solicitarResgatePremio,
    atualizarStatusResgate,
    currentUser, 
    empresa
  } = useSST();

  // ==========================================================
  // Abas da tela: catálogo de prêmios, resgates do usuário e
  // gestão administrativa das solicitações.
  // ==========================================================
  const [activeTab, setActiveTab] = useState<'catalogo' | 'meus_resgates' | 'gestao_admin'>('catalogo');
  // Filtro de status aplicado na gestão administrativa de resgates
  const [filterStatusResgate, setFilterStatusResgate] = useState<'todos' | 'pendente' | 'aprovado' | 'entregue' | 'rejeitado'>('todos');

  // ==========================================================
  // Estados de modais (janelas de confirmação e edição)
  // ==========================================================
  // Modals
  const [showNovoModal, setShowNovoModal] = useState(false);
  // Prêmio selecionado para edição (null = criando um novo)
  const [premioParaEditar, setPremioParaEditar] = useState<Premiacao | null>(null);
  // Prêmio aguardando confirmação de exclusão
  const [premioParaExcluir, setPremioParaExcluir] = useState<Premiacao | null>(null);
  // Prêmio aguardando confirmação de resgate pelo usuário
  const [premioParaResgatar, setPremioParaResgatar] = useState<Premiacao | null>(null);
  // Resgate aguardando processamento pelo admin (novo status a aplicar)
  const [resgateParaProcessar, setResgateParaProcessar] = useState<{ id: string; novoStatus: 'aprovado' | 'entregue' | 'rejeitado' } | null>(null);
  // Observações digitadas pelo admin ao processar um resgate
  const [obsProcessamento, setObsProcessamento] = useState('');
  // Mensagem temporária de feedback (sucesso ou erro) exibida ao usuário
  const [mensagemFeedback, setMensagemFeedback] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  // ==========================================================
  // Estado do formulário de cadastro/edição de prêmio
  // ==========================================================
  // Form State
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState<'vale_presente' | 'brinde' | 'folga' | 'outro'>('vale_presente');
  const [mesRef, setMesRef] = useState(() => {
    // Mês de referência padrão = mês/ano ATUAL (evita data fixa de staging).
    const agora = new Date();
    const nomeMes = agora.toLocaleDateString('pt-BR', { month: 'long' });
    return `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} / ${agora.getFullYear()}`;
  });
  const [requisito, setRequisito] = useState('');
  // URL/DataURL da imagem do prêmio (galeria, câmera, URL ou padrão)
  const [imagemUrl, setImagemUrl] = useState('');
  const [custoPontos, setCustoPontos] = useState<number>(300);
  const [estoque, setEstoque] = useState<number>(10);
  const [ativo, setAtivo] = useState<boolean>(true);
  // Controla a abertura do modal de captura pela câmera
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);

  // Referência para disparar o input file de upload oculto
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Usuário tem permissão de gestão (admin ou super_admin)
  const isAdminOrSuper = currentUser.perfil === 'admin' || currentUser.perfil === 'super_admin';
  // Imagem padrão usada quando o prêmio não tem imagem definida
  const UNIVERSAL_PRIZE_IMAGE = 'https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&q=80&w=400';

  // Prêmios visíveis para a empresa do usuário logado
  const minhasPremiacoes = premiacoes.filter(p => p.empresa_id === empresa.id || !p.empresa_id);
  // Resgates feitos pelo usuário logado
  const meusResgates = resgates.filter(r => r.usuario_id === currentUser.id);
  // Resgates da empresa (admin vê os da sua empresa; super_admin vê todos)
  const resgatesEmpresa = resgates.filter(r => r.empresa_id === empresa.id || currentUser.perfil === 'super_admin');
  // Contador de solicitações pendentes (badge na aba de gestão)
  const resgatesPendentesCount = resgatesEmpresa.filter(r => r.status === 'pendente').length;

  // Saldo de pontos resgatáveis do usuário (com fallback para pontos totais)
  const saldoUsuario = currentUser?.estatisticas?.pontos_resgataveis ?? currentUser?.estatisticas?.pontos_totais ?? 0;

  // ==========================================================
  // Upload de imagem: valida tamanho, comprime e salva como
  // DataURL para ser exibida no prêmio.
  // ==========================================================
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Limite máximo de 10MB antes da compressão
      if (file.size > 10 * 1024 * 1024) {
        alert('A imagem deve ter no máximo 10MB.');
        return;
      }
      try {
        // Comprime a imagem para no máximo 600x600 e 82% de qualidade,
        // evitando DataURLs muito pesados no banco
        const compressed = await compressImageFile(file, 600, 600, 0.82);
        setImagemUrl(compressed);
      } catch (err: any) {
        alert('Erro ao processar imagem da galeria.');
      }
    }
    // Reseta o input para permitir selecionar o mesmo arquivo novamente
    e.target.value = '';
  };

  // ==========================================================
  // Salva (cria ou atualiza) o prêmio a partir do formulário.
  // Se não houver imagem, usa a imagem padrão universal.
  // ==========================================================
  const handleSalvarPremio = (e: React.FormEvent) => {
    e.preventDefault();
    // Exige um título preenchido para continuar
    if (!titulo || !(titulo || '').trim()) return;

    const imgToSave = (imagemUrl || '').trim() || UNIVERSAL_PRIZE_IMAGE;

    if (premioParaEditar) {
      // Modo edição: atualiza o prêmio existente pelo id
      editarPremiacao(premioParaEditar.id, {
        titulo,
        descricao,
        tipo,
        mes_referencia: mesRef,
        requisito,
        imagem: imgToSave,
        custo_pontos: custoPontos,
        estoque,
        ativo,
      });
    } else {
      // Modo criação: adiciona um novo prêmio
      adicionarPremiacao({
        titulo,
        descricao,
        tipo,
        mes_referencia: mesRef,
        requisito,
        imagem: imgToSave,
        custo_pontos: custoPontos,
        estoque,
        ativo,
      });
    }

    setShowNovoModal(false);
    resetForm();
  };

  // ==========================================================
  // Abre o modal de edição preenchendo o formulário com os
  // dados do prêmio selecionado.
  // ==========================================================
  const abrirEdicao = (premio: Premiacao) => {
    setPremioParaEditar(premio);
    setTitulo(premio.titulo || '');
    setDescricao(premio.descricao || '');
    setTipo(premio.tipo || 'vale_presente');
    setMesRef(premio.mes_referencia || '');
    setRequisito(premio.requisito || '');
    setImagemUrl(premio.imagem || '');
    setCustoPontos(premio.custo_pontos ?? 300);
    setEstoque(premio.estoque ?? 10);
    setAtivo(premio.ativo ?? true);
    setShowNovoModal(true);
  };

  // Limpa todos os campos do formulário e volta ao modo criação
  const resetForm = () => {
    setPremioParaEditar(null);
    setTitulo('');
    setDescricao('');
    setRequisito('');
    setImagemUrl('');
    // Mês de referência padrão = mês/ano atuais (sem data fixa de staging).
    const agora = new Date();
    const nomeMes = agora.toLocaleDateString('pt-BR', { month: 'long' });
    setMesRef(`${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} / ${agora.getFullYear()}`);
    setTipo('vale_presente');
    setCustoPontos(300);
    setEstoque(10);
    setAtivo(true);
  };

  // ==========================================================
  // Confirma o resgate: chama a ação do contexto e exibe o
  // feedback (sucesso ou erro) por alguns segundos.
  // ==========================================================
  const handleConfirmarResgate = async () => {
    if (!premioParaResgatar) return;

    const res = await solicitarResgatePremio(premioParaResgatar.id);
    if (res.success) {
      setMensagemFeedback({ tipo: 'sucesso', texto: res.message });
      setPremioParaResgatar(null);
    } else {
      setMensagemFeedback({ tipo: 'erro', texto: res.message });
      setPremioParaResgatar(null);
    }

    // Feedback some automaticamente após 5 segundos
    setTimeout(() => setMensagemFeedback(null), 5000);
  };

  // ==========================================================
  // Confirma o processamento administrativo: aplica o novo
  // status ao resgate (aprovado/entregue/rejeitado) com a
  // observação informada, se houver.
  // ==========================================================
  const handleConfirmarProcessamentoResgate = async () => {
    if (!resgateParaProcessar) return;
    const ok = await atualizarStatusResgate(resgateParaProcessar.id, resgateParaProcessar.novoStatus, obsProcessamento.trim() || undefined);
    setResgateParaProcessar(null);
    setObsProcessamento('');
    // Só informa sucesso se a operação realmente foi aplicada (o resgate
    // existia). Caso contrário, mostra erro para não enganar o admin.
    setMensagemFeedback(ok
      ? { tipo: 'sucesso', texto: 'Status do resgate atualizado com sucesso!' }
      : { tipo: 'erro', texto: 'Não foi possível atualizar o resgate. O registro não foi encontrado ou a operação falhou.' });
    setTimeout(() => setMensagemFeedback(null), 4000);
  };

  // Lista de resgates já filtrada pelo status escolhido na gestão admin
  // Lista de resgates já filtrada pelo status escolhido na gestão admin
  const resgatesFiltradosAdmin = resgatesEmpresa.filter(r => {
    if (filterStatusResgate === 'todos') return true;
    return r.status === filterStatusResgate;
  });

  return (
    <div className="space-y-6 pb-12">
      
      {/* ============================================================
          BANNER DO TOPO: título da seção, saldo resgatável do usuário
          e botão para cadastrar prêmio (visível apenas para admin).
          ============================================================ */}
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-pink-950/70 via-purple-950/60 to-slate-900/90 backdrop-blur-xl border border-pink-500/30 rounded-2xl p-6 text-white shadow-2xl flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-pink-500/20 text-pink-300 rounded-xl border border-pink-500/40 backdrop-blur-md">
              <Gift className="w-6 h-6 text-pink-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white flex items-center gap-2">
                Premiações & Loja de Resgate
              </h1>
              <p className="text-xs text-pink-200/80">
                Troque seus pontos acumulados em quizzes e desafios por prêmios reais configurados pela sua empresa!
              </p>
            </div>
          </div>
        </div>

        {/* User Balance Badge & Admin Add Button */}
        {/* Selo com o saldo resgatável do usuário + botão "Cadastrar Prêmio" (apenas admin) */}
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          <div className="bg-slate-950/80 border border-amber-500/40 px-4 py-2 rounded-xl flex items-center space-x-2 shadow-lg">
            <Coins className="w-5 h-5 text-amber-400 fill-amber-400 animate-pulse" />
            <div>
              <div className="text-[10px] uppercase font-extrabold text-amber-400/80 tracking-wider">Seu Saldo Resgatável</div>
              <div className="text-lg font-black text-amber-300">{saldoUsuario} <span className="text-xs font-semibold text-amber-400/80">pts</span></div>
            </div>
          </div>

          {isAdminOrSuper && (
            <button
              // Abre o modal de cadastro com o formulário limpo
              onClick={() => {
                resetForm();
                setShowNovoModal(true);
              }}
              className="bg-pink-600 hover:bg-pink-500 text-white font-black text-xs px-4 py-3 rounded-xl shadow-md transition-all flex items-center space-x-2 border border-pink-400/30"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Prêmio</span>
            </button>
          )}
        </div>
      </div>

      {/* Alert / Feedback Notification */}
      {/* Notificação temporária de sucesso ou erro (ex.: resultado de um resgate) */}
      {mensagemFeedback && (
        <div className={`p-4 rounded-xl border text-xs font-bold flex items-center justify-between shadow-lg transition-all ${
          mensagemFeedback.tipo === 'sucesso' 
            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200' 
            : 'bg-rose-500/20 border-rose-500/40 text-rose-200'
        }`}>
          <div className="flex items-center space-x-2">
            {mensagemFeedback.tipo === 'sucesso' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
            <span>{mensagemFeedback.texto}</span>
          </div>
          {/* Botão "X" fecha a notificação manualmente */}
          <button onClick={() => setMensagemFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      {/* ============================================================
          ABAS DE NAVEGAÇÃO: Catálogo, Meus Resgates e Gestão (admin)
          ============================================================ */}
      <div className="flex items-center space-x-2 border-b border-white/10 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('catalogo')}
          className={`px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center space-x-2 transition-all shrink-0 ${
            activeTab === 'catalogo'
              ? 'bg-pink-600/30 border border-pink-500/50 text-pink-300 shadow-md'
              : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>Catálogo de Prêmios</span>
        </button>

        {/* Aba "Meus Resgates": histórico de solicitações do usuário logado */}
        <button
          onClick={() => setActiveTab('meus_resgates')}
          className={`px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center space-x-2 transition-all shrink-0 ${
            activeTab === 'meus_resgates'
              ? 'bg-pink-600/30 border border-pink-500/50 text-pink-300 shadow-md'
              : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'
          }`}
        >
          <Gift className="w-4 h-4" />
          <span>Meus Resgates ({meusResgates.length})</span>
        </button>

        {/* Aba de gestão: visível apenas para admin/super_admin, com
            badge animado mostrando quantas solicitações estão pendentes */}
        {isAdminOrSuper && (
          <button
            onClick={() => setActiveTab('gestao_admin')}
            className={`px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center space-x-2 transition-all shrink-0 relative ${
              activeTab === 'gestao_admin'
                ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300 shadow-md'
                : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>Solicitações de Resgate (Gestão)</span>
            {resgatesPendentesCount > 0 && (
              <span className="bg-rose-500 text-white font-black text-[10px] px-2 py-0.5 rounded-full animate-bounce">
                {resgatesPendentesCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* --- TAB 1: CATÁLOGO DE PRÊMIOS --- */}
      {/* ============================================================
          GRID DE CARDS DOS PRÊMIOS: lista os prêmios da empresa com
          imagem, badges de tipo/estoque, custo em pontos, requisito
          e botão de resgate (ou ações de editar/excluir para admin).
          ============================================================ */}
      {activeTab === 'catalogo' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {minhasPremiacoes.map((premio) => {
            const custo = premio.custo_pontos ?? 300;
            const estoqueAtual = premio.estoque ?? 10;
            // Prêmio disponível apenas se ativo e com estoque positivo
            const disponivel = (premio.ativo ?? true) && estoqueAtual > 0;
            // Usuário só pode resgatar se tiver saldo suficiente
            const temSaldo = saldoUsuario >= custo;

            return (
              <div 
                key={premio.id} 
                className={`bg-white/5 backdrop-blur-xl border rounded-2xl overflow-hidden text-white shadow-xl flex flex-col justify-between transition-all ${
                  !disponivel ? 'opacity-60 border-white/5' : 'border-white/10 hover:border-pink-500/30'
                }`}
              >
                {premio.imagem && (
                  <div className="relative">
                    <img src={premio.imagem} alt={premio.titulo} className="w-full h-44 object-cover border-b border-white/10" />
                    
                    {/* Status Badge Overlay */}
                    {/* Badge do tipo de prêmio sobreposto no canto superior esquerdo */}
                    <div className="absolute top-3 left-3 flex items-center gap-2">
                      <span className="bg-pink-950/80 backdrop-blur-md text-pink-300 font-extrabold text-[10px] px-2.5 py-1 rounded-full border border-pink-500/40 uppercase tracking-wider">
                        {premio.tipo.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Badge de estoque (esgotado ou quantidade disponível) no canto superior direito */}
                    <div className="absolute top-3 right-3">
                      {estoqueAtual <= 0 ? (
                        <span className="bg-rose-950/90 text-rose-300 font-extrabold text-[10px] px-2.5 py-1 rounded-full border border-rose-500/40">
                          Esgotado
                        </span>
                      ) : (
                        <span className="bg-emerald-950/90 text-emerald-300 font-extrabold text-[10px] px-2.5 py-1 rounded-full border border-emerald-500/40 flex items-center gap-1">
                          <PackageCheck className="w-3 h-3" />
                          {estoqueAtual} em estoque
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      {/* Mês de referência do prêmio (vínculo com a campanha) */}
                      <span className="text-xs text-slate-400 font-medium">
                        {premio.mes_referencia}
                      </span>

                      {/* Ações de edição/exclusão do prêmio (somente admin) */}
                      {isAdminOrSuper && (
                        <div className="flex items-center space-x-1 border-l border-white/10 pl-2">
                          {/* Botão editar: abre o modal com os dados do prêmio preenchidos */}
                          <button
                            onClick={() => abrirEdicao(premio)}
                            className="p-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg border border-purple-500/40"
                            title="Editar Prêmio"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {/* Botão excluir: abre o modal de confirmação de exclusão */}
                          <button
                            onClick={() => setPremioParaExcluir(premio)}
                            className="p-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg border border-rose-500/40"
                            title="Excluir Prêmio"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <h3 className="font-black text-lg text-white">{premio.titulo}</h3>
                    <p className="text-xs text-slate-300 mt-1 line-clamp-3">{premio.descricao}</p>
                  </div>

                  <div className="space-y-3">
                    {/* Cost & Requirement box */}
                    {/* Caixa com o valor do resgate em pontos e o requisito informativo */}
                    <div className="bg-slate-950/70 backdrop-blur-md p-3 rounded-xl border border-white/10 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-semibold">Valor do Resgate:</span>
                        <span className="font-black text-amber-300 text-sm flex items-center space-x-1">
                          <Coins className="w-4 h-4 text-amber-400 fill-amber-400" />
                          <span>{custo} pts</span>
                        </span>
                      </div>

                      {premio.requisito && (
                        <div className="pt-1.5 border-t border-white/10 flex items-center justify-between text-[11px]">
                          <span className="text-slate-400">Requisito:</span>
                          <span className="font-bold text-pink-300 truncate max-w-[180px]">{premio.requisito}</span>
                        </div>
                      )}
                    </div>

                    {/* Redemption Action Button */}
                    {/* Botão principal de resgate: desabilitado quando o prêmio
                        está indisponível ou o saldo é insuficiente; texto muda
                        conforme a situação. Ao clicar, abre o modal de confirmação. */}
                    <button
                      disabled={!disponivel || !temSaldo}
                      onClick={() => setPremioParaResgatar(premio)}
                      className={`w-full py-3 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-2 shadow-lg ${
                        !disponivel
                          ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                          : !temSaldo
                          ? 'bg-slate-800/80 text-amber-400/70 border border-amber-500/20 cursor-not-allowed'
                          : 'bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white border border-pink-400/30 shadow-pink-900/30'
                      }`}
                    >
                      <Gift className="w-4 h-4" />
                      <span>
                        {!disponivel 
                          ? 'Indisponível no Momento' 
                          : !temSaldo 
                          ? `Saldo Insuficiente (${saldoUsuario}/${custo} pts)` 
                          : `Resgatar por ${custo} Pts`}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- TAB 2: MEUS RESGATES --- */}
      {/* ============================================================
          HISTÓRICO DE RESGATES DO USUÁRIO: cards com imagem, custo,
          data da solicitação, badge de status (análise/aprovado/
          entregue/recusado) e observações de RH/SST.
          ============================================================ */}
      {activeTab === 'meus_resgates' && (
        <div className="space-y-4">
          {meusResgates.length === 0 ? (
            // Estado vazio: orienta o usuário a acumular pontos e resgatar
            <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center text-slate-400 space-y-3">
              <Gift className="w-12 h-12 text-pink-400/40 mx-auto" />
              <h3 className="text-base font-black text-white">Nenhum resgate efetuado ainda</h3>
              <p className="text-xs max-w-sm mx-auto">
                Acumule pontos respondendo quizzes diários e vencendo desafios 1x1 para resgatar prêmios no catálogo!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {meusResgates.map((resg) => (
                <div key={resg.id} className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 text-white shadow-xl space-y-3">
                  <div className="flex items-center space-x-3">
                    {/* Miniatura do prêmio (ou ícone de presente caso não tenha imagem) */}
                    {resg.premiacao_imagem ? (
                      <img src={resg.premiacao_imagem} alt={resg.premiacao_titulo} className="w-16 h-16 rounded-xl object-cover border border-white/10 shrink-0" />
                    ) : (
                      <div className="w-16 h-16 rounded-xl bg-pink-500/20 flex items-center justify-center shrink-0">
                        <Gift className="w-8 h-8 text-pink-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-sm text-white truncate">{resg.premiacao_titulo}</h4>
                      <div className="text-xs text-amber-300 font-bold flex items-center space-x-1 mt-0.5">
                        <Coins className="w-3.5 h-3.5 fill-amber-400" />
                        <span>{resg.custo_pontos} pts resgatados</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Solicitado em: {new Date(resg.data_resgate).toLocaleDateString('pt-BR')} às {new Date(resg.data_resgate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  {/* Badge de status da entrega do resgate */}
                  <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs text-slate-400">Status da Entrega:</span>
                    {resg.status === 'pendente' && (
                      <span className="bg-amber-500/20 text-amber-300 font-bold text-xs px-3 py-1 rounded-full border border-amber-500/40 flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Em Análise</span>
                      </span>
                    )}
                    {resg.status === 'aprovado' && (
                      <span className="bg-blue-500/20 text-blue-300 font-bold text-xs px-3 py-1 rounded-full border border-blue-500/40 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Aprovado - Aguardando Retirada</span>
                      </span>
                    )}
                    {resg.status === 'entregue' && (
                      <span className="bg-emerald-500/20 text-emerald-300 font-bold text-xs px-3 py-1 rounded-full border border-emerald-500/40 flex items-center space-x-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>Entregue Concluído</span>
                      </span>
                    )}
                    {resg.status === 'rejeitado' && (
                      <span className="bg-rose-500/20 text-rose-300 font-bold text-xs px-3 py-1 rounded-full border border-rose-500/40 flex items-center space-x-1">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Recusado (Pontos Devolvidos)</span>
                      </span>
                    )}
                  </div>

                  {/* Observações enviadas pela equipe de SST/RH sobre o resgate */}
                  {resg.observacoes && (
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-white/10 text-[11px] text-slate-300">
                      <strong className="text-pink-300">Obs SST/RH:</strong> {resg.observacoes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- TAB 3: GESTÃO ADMIN DE RESGATES --- */}
      {/* ============================================================
          GESTÃO ADMINISTRATIVA: filtros por status e tabela com as
          solicitações da empresa, permitindo aprovar, recusar ou
          marcar como entregue cada resgate.
          ============================================================ */}
      {activeTab === 'gestao_admin' && isAdminOrSuper && (
        <div className="space-y-4">
          {/* Status Filters */}
          {/* Filtro por status da solicitação, com contador de cada situação */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1">
            {(['todos', 'pendente', 'aprovado', 'entregue', 'rejeitado'] as const).map((st) => {
              const count = resgatesEmpresa.filter(r => st === 'todos' ? true : r.status === st).length;
              return (
                <button
                  key={st}
                  onClick={() => setFilterStatusResgate(st)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all capitalize shrink-0 ${
                    filterStatusResgate === st
                      ? 'bg-amber-500/20 border border-amber-500 text-amber-300'
                      : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {st === 'todos' ? 'Todos' : st} ({count})
                </button>
              );
            })}
          </div>

          {resgatesFiltradosAdmin.length === 0 ? (
            // Mensagem exibida quando nenhuma solicitação atende ao filtro
            <div className="bg-white/5 border border-white/10 rounded-2xl p-12 text-center text-slate-400">
              Nenhuma solicitação de resgate encontrada para este filtro.
            </div>
          ) : (
            <div className="bg-slate-900/80 border border-white/10 rounded-2xl overflow-hidden shadow-xl">
              {/* Tabela de solicitações com as colunas: colaborador,
                  prêmio, custo, data, status atual e ações de gestão */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950/80 text-slate-400 font-extrabold uppercase border-b border-white/10 text-[10px]">
                    <tr>
                      <th className="p-3.5">Colaborador / Setor</th>
                      <th className="p-3.5">Prêmio Solicitado</th>
                      <th className="p-3.5">Custo Pts</th>
                      <th className="p-3.5">Data Resgate</th>
                      <th className="p-3.5">Status Atual</th>
                      <th className="p-3.5 text-right">Ações de Gestão</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {resgatesFiltradosAdmin.map((rsg) => (
                      <tr key={rsg.id} className="hover:bg-white/5 transition-colors">
                        <td className="p-3.5">
                          <div className="font-extrabold text-white">{rsg.usuario_nome}</div>
                          <div className="text-[10px] text-pink-300">{rsg.usuario_setor_nome}</div>
                          <div className="text-[10px] text-slate-400">{rsg.usuario_email}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-bold text-white flex items-center space-x-2">
                            {rsg.premiacao_imagem && (
                              <img src={rsg.premiacao_imagem} alt="" className="w-8 h-8 rounded object-cover border border-white/10" />
                            )}
                            <span>{rsg.premiacao_titulo}</span>
                          </div>
                        </td>
                        <td className="p-3.5 font-black text-amber-300">
                          {rsg.custo_pontos} pts
                        </td>
                        <td className="p-3.5 text-slate-400 text-[11px]">
                          {new Date(rsg.data_resgate).toLocaleDateString('pt-BR')} às {new Date(rsg.data_resgate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-3.5">
                          {rsg.status === 'pendente' && (
                            <span className="bg-amber-500/20 text-amber-300 text-[11px] font-bold px-2.5 py-1 rounded-full border border-amber-500/30">
                              Pendente
                            </span>
                          )}
                          {rsg.status === 'aprovado' && (
                            <span className="bg-blue-500/20 text-blue-300 text-[11px] font-bold px-2.5 py-1 rounded-full border border-blue-500/30">
                              Aprovado
                            </span>
                          )}
                          {rsg.status === 'entregue' && (
                            <span className="bg-emerald-500/20 text-emerald-300 text-[11px] font-bold px-2.5 py-1 rounded-full border border-emerald-500/30">
                              Entregue
                            </span>
                          )}
                          {rsg.status === 'rejeitado' && (
                            <span className="bg-rose-500/20 text-rose-300 text-[11px] font-bold px-2.5 py-1 rounded-full border border-rose-500/30">
                              Rejeitado
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-right space-x-1">
                          {/* Ações de gestão: aprovar/recusar quando pendente e
                              marcar como entregue quando já aprovado */}
                          {rsg.status === 'pendente' && (
                            <>
                              <button
                                onClick={() => {
                                  setResgateParaProcessar({ id: rsg.id, novoStatus: 'aprovado' });
                                  setObsProcessamento('');
                                }}
                                className="bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 px-2.5 py-1 rounded-lg text-[11px] font-extrabold"
                              >
                                Aprovar
                              </button>
                              <button
                                onClick={() => {
                                  setResgateParaProcessar({ id: rsg.id, novoStatus: 'rejeitado' });
                                  setObsProcessamento('');
                                }}
                                className="bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40 px-2.5 py-1 rounded-lg text-[11px] font-extrabold"
                              >
                                Recusar
                              </button>
                            </>
                          )}
                          {rsg.status === 'aprovado' && (
                            <button
                              onClick={() => {
                                setResgateParaProcessar({ id: rsg.id, novoStatus: 'entregue' });
                                setObsProcessamento('');
                              }}
                              className="bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 px-2.5 py-1 rounded-lg text-[11px] font-extrabold"
                            >
                              Marcar Entregue
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL CONFIRMAÇÃO DE RESGATE (USUÁRIO) */}
      {/* ============================================================
          MODAL DO USUÁRIO: confirma o resgate de um prêmio, mostrando
          custo, saldo atual e saldo após o resgate.
          ============================================================ */}
      {premioParaResgatar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-pink-500/30 rounded-2xl max-w-sm w-full p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <div className="w-12 h-12 bg-pink-500/20 text-pink-300 rounded-2xl mx-auto flex items-center justify-center border border-pink-500/40">
              <Gift className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-black text-lg text-white">Confirmar Resgate de Prêmio</h3>
              <p className="text-xs text-slate-300">
                Você está prestes a resgatar o prêmio <strong className="text-pink-300">"{premioParaResgatar.titulo}"</strong>.
              </p>
            </div>

            {/* Resumo financeiro da operação: custo, saldo e projeção pós-resgate */}
            <div className="bg-slate-950/80 p-3 rounded-xl border border-white/10 text-xs space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>Custo do Prêmio:</span>
                <span className="font-extrabold text-amber-300">{premioParaResgatar.custo_pontos ?? 300} pts</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Seu Saldo Atual:</span>
                <span className="font-extrabold text-white">{saldoUsuario} pts</span>
              </div>
              <div className="pt-2 border-t border-white/10 flex justify-between font-extrabold text-emerald-400">
                <span>Saldo Após Resgate:</span>
                <span>{saldoUsuario - (premioParaResgatar.custo_pontos ?? 300)} pts</span>
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setPremioParaResgatar(null)}
                className="w-1/2 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs py-2.5 rounded-xl border border-white/10"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarResgate}
                className="w-1/2 bg-pink-600 hover:bg-pink-500 text-white font-black text-xs py-2.5 rounded-xl shadow-lg"
              >
                Confirmar Resgate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PROCESSAR STATUS RESGATE (ADMIN) */}
      {/* ============================================================
          MODAL DO ADMIN: ao aprovar, recusar ou entregar um resgate,
          permite informar uma observação para o colaborador.
          ============================================================ */}
      {resgateParaProcessar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-sm w-full p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl">
            <h3 className="font-black text-base text-white">
              {resgateParaProcessar.novoStatus === 'aprovado' && 'Aprovar Solicitação de Resgate'}
              {resgateParaProcessar.novoStatus === 'entregue' && 'Confirmar Entrega do Prêmio'}
              {resgateParaProcessar.novoStatus === 'rejeitado' && 'Recusar Resgate e Reembolsar Pontos'}
            </h3>

            {/* Aviso especial quando o resgate será recusado (pontos devolvidos) */}
            {resgateParaProcessar.novoStatus === 'rejeitado' && (
              <p className="text-xs text-rose-300 bg-rose-950/40 p-2.5 rounded-xl border border-rose-500/30">
                Ao recusar o resgate, a pontuação consumida será estornada imediatamente para a conta do colaborador!
              </p>
            )}

            {/* Campo opcional de observações enviadas ao colaborador */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Observações / Instruções para o Usuário (Opcional)
              </label>
              <textarea
                value={obsProcessamento}
                onChange={(e) => setObsProcessamento(e.target.value)}
                placeholder="Ex: Retire seu voucher com a equipe de RH na sala 302."
                rows={3}
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-2.5 text-xs text-slate-200"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setResgateParaProcessar(null)}
                className="w-1/2 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs py-2.5 rounded-xl border border-white/10"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarProcessamentoResgate}
                className={`w-1/2 font-black text-xs py-2.5 rounded-xl shadow-lg text-white ${
                  resgateParaProcessar.novoStatus === 'rejeitado' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CADASTRAR / EDITAR PRÊMIO (ADMIN) */}
      {/* ============================================================
          FORMULÁRIO DO PRÊMIO: usado tanto para cadastrar quanto para
          editar. Contém título, descrição, custo, estoque, seleção de
          imagem (galeria/câmera/URL/padrão), tipo, mês de referência,
          requisito e flag de ativação no catálogo.
          ============================================================ */}
      {showNovoModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900/95 border border-white/15 rounded-2xl max-w-md w-full p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-base text-white">
                {premioParaEditar ? 'Editar Premiação' : 'Cadastrar Nova Premiação'}
              </h3>
              <button onClick={() => setShowNovoModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarPremio} className="space-y-3 text-xs">
              {/* Campo obrigatório: título do prêmio */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Título do Prêmio</label>
                <input
                  type="text"
                  value={titulo || ''}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Vale-Presente R$ 300"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  required
                />
              </div>

              {/* Descrição / regras de entrega do prêmio */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Descrição</label>
                <textarea
                  value={descricao || ''}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Regras de entrega do prêmio..."
                  rows={2}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              {/* Custos e estoque lado a lado: pontos necessários e unidades disponíveis */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-amber-300 mb-1">Custo em Pontos Resgatáveis</label>
                  <input
                    type="number"
                    min={1}
                    value={custoPontos}
                    onChange={(e) => setCustoPontos(Number(e.target.value))}
                    className="w-full bg-slate-950/80 border border-amber-500/30 rounded-xl p-2.5 text-amber-200 font-extrabold"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-emerald-300 mb-1">Quantidade em Estoque</label>
                  <input
                    type="number"
                    min={0}
                    value={estoque}
                    onChange={(e) => setEstoque(Number(e.target.value))}
                    className="w-full bg-slate-950/80 border border-emerald-500/30 rounded-xl p-2.5 text-emerald-200 font-extrabold"
                    required
                  />
                </div>
              </div>

              {/* Image Selection */}
              {/* ============================================================
                  SELEÇÃO DE IMAGEM DO PRÊMIO: três origens (galeria com
                  upload+compressão, câmera e imagem padrão), campo para
                  colar uma URL e preview da imagem escolhida.
                  ============================================================ */}
              <div className="space-y-2.5 bg-white/5 p-3 rounded-xl border border-white/10">
                <label className="block font-semibold text-pink-300">
                  Imagem do Prêmio
                </label>

                {/* Input de arquivo oculto, acionado pelo botão "Galeria" */}
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div className="flex items-center space-x-2 flex-wrap gap-1.5">
                  {/* Botão abre o seletor de arquivos do dispositivo */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-pink-600/30 hover:bg-pink-600/40 text-pink-200 border border-pink-500/40 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 text-xs transition-all"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Galeria</span>
                  </button>

                  {/* Botão abre o modal de captura pela câmera */}
                  <button
                    type="button"
                    onClick={() => setShowCameraModal(true)}
                    className="bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 text-xs transition-all"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Câmera</span>
                  </button>

                  {/* Botão aplica a imagem padrão (destacado quando ativo) */}
                  <button
                    type="button"
                    onClick={() => setImagemUrl(UNIVERSAL_PRIZE_IMAGE)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-bold transition-all flex items-center space-x-1 ${
                      imagemUrl === UNIVERSAL_PRIZE_IMAGE || !imagemUrl
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>Imagem Padrão</span>
                  </button>
                </div>

                {/* Campo alternativo para colar a URL de uma imagem externa */}
                <input
                  type="url"
                  value={imagemUrl}
                  onChange={(e) => setImagemUrl(e.target.value)}
                  placeholder="Ou cole a URL da imagem..."
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2 text-slate-200 font-mono text-[11px]"
                />

                {/* Preview da imagem escolhida (ou da padrão) */}
                {(imagemUrl || UNIVERSAL_PRIZE_IMAGE) && (
                  <div className="relative rounded-xl overflow-hidden border border-white/10 h-24 bg-slate-950">
                    <img src={imagemUrl || UNIVERSAL_PRIZE_IMAGE} alt="Preview do Prêmio" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              {/* Tipo de prêmio e mês de referência (vínculo com a campanha) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Tipo de Prêmio</label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as any)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  >
                    <option value="vale_presente">Vale-Presente</option>
                    <option value="brinde">Brinde Físico</option>
                    <option value="folga">Folga Remunerada</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Mês Referência</label>
                  <input
                    type="text"
                    value={mesRef}
                    onChange={(e) => setMesRef(e.target.value)}
                    className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                  />
                </div>
              </div>

              {/* Requisito informativo exibido no card do catálogo */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Requisito Informativo (Opcional)</label>
                <input
                  type="text"
                  value={requisito}
                  onChange={(e) => setRequisito(e.target.value)}
                  placeholder="Ex: Aberto a todos os colaboradores com pontos resgatáveis"
                  className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-slate-200"
                />
              </div>

              {/* Flag para exibir ou ocultar o prêmio no catálogo */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="chkAtivo"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="w-4 h-4 rounded text-pink-600 focus:ring-pink-500"
                />
                <label htmlFor="chkAtivo" className="text-xs text-slate-300 font-semibold cursor-pointer">
                  Premiação Ativa no Catálogo
                </label>
              </div>

              {/* Botões de ação do formulário: cancelar ou salvar/atualizar */}
              <div className="flex justify-end space-x-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowNovoModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-4 py-2 rounded-xl border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-pink-600 hover:bg-pink-500 text-white font-black px-5 py-2 rounded-xl shadow-lg"
                >
                  {premioParaEditar ? 'Atualizar Prêmio' : 'Salvar Prêmio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {/* ============================================================
          MODAL DE EXCLUSÃO: pede confirmação antes de remover um
          prêmio do catálogo.
          ============================================================ */}
      {premioParaExcluir && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl max-w-sm w-full p-6 text-white space-y-4 shadow-2xl backdrop-blur-xl text-center">
            <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-2xl mx-auto flex items-center justify-center border border-rose-500/40">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">Excluir Premiação</h3>
              <p className="text-xs text-slate-300 mt-1">
                Tem certeza que deseja remover o prêmio <strong className="text-rose-300">"{premioParaExcluir.titulo}"</strong>?
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setPremioParaExcluir(null)}
                className="w-1/2 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs py-2.5 rounded-xl border border-white/10"
              >
                Cancelar
              </button>
              {/* Confirma e chama a exclusão do prêmio no contexto */}
              <button
                onClick={() => {
                  excluirPremiacao(premioParaExcluir.id);
                  setPremioParaExcluir(null);
                }}
                className="w-1/2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs py-2.5 rounded-xl shadow-lg"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Capture Modal */}
      {/* Modal de captura de imagem pela câmera; o resultado (DataURL)
          é salvo diretamente como imagem do prêmio */}
      <CameraCaptureModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={(dataUrl) => setImagemUrl(dataUrl)}
      />

    </div>
  );
};
