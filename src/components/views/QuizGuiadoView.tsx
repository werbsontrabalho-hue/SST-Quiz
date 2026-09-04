import React, { useState, useMemo } from 'react';
import { useSST } from '../../context/SSTContext';
import { CriarSalaModal } from './quizGuiado/CriarSalaModal';
import { PainelInstrutor } from './quizGuiado/PainelInstrutor';
import { PainelParticipante } from './quizGuiado/PainelParticipante';
import { RelatorioAvaliacaoModal } from './quizGuiado/RelatorioAvaliacaoModal';
import { QRCodeScannerModal } from './quizGuiado/QRCodeScannerModal';
import { IdentificacaoParticipanteModal } from './quizGuiado/IdentificacaoParticipanteModal';
import { LaudosAvaliacoesTab } from './quizGuiado/LaudosAvaliacoesTab';
import { ResultadoAvaliacaoSST, SalaQuizGuiado } from '../../types';
import { supabaseService } from '../../services/supabaseService';
import { 
  Sparkles, 
  Users, 
  Plus, 
  QrCode, 
  Play, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  FileText, 
  Award, 
  Search, 
  Tv, 
  Building2, 
  Calendar, 
  AlertTriangle,
  RotateCcw,
  Pencil,
  Trash2,
  Camera,
  History
} from 'lucide-react';

export const QuizGuiadoView: React.FC = () => {
  const { 
    currentUser, 
    salasQuizGuiado, 
    entrarNaSalaQuizGuiado, 
    excluirSalaQuizGuiado,
    resultadosAvaliacaoSST,
    obterResultadoAvaliacaoParticipante,
    usuarios
  } = useSST();

  // Estados locais da view
  const [showCriarModal, setShowCriarModal] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [showIdentificacaoModal, setShowIdentificacaoModal] = useState(false);
  const [pinParaEntrada, setPinParaEntrada] = useState('');
  const [salaEncontrada, setSalaEncontrada] = useState<SalaQuizGuiado | null>(null);

  const [salaParaEditar, setSalaParaEditar] = useState<SalaQuizGuiado | null>(null);
  const [salaParaDeletar, setSalaParaDeletar] = useState<SalaQuizGuiado | null>(null);
  const [salaAtivaId, setSalaAtivaId] = useState<string | null>(null);
  const [modoAtivo, setModoAtivo] = useState<'instrutor' | 'participante' | 'lista'>('lista');
  const [abaAtiva, setAbaAtiva] = useState<'salas' | 'laudos'>('salas');
  const [pinEntradaInput, setPinEntradaInput] = useState('');
  const [pinErrorMsg, setPinErrorMsg] = useState('');
  const [buscaSala, setBuscaSala] = useState('');
  
  // Estado para visualização de relatório/ficha individual SST
  const [resultadoParaFicha, setResultadoParaFicha] = useState<ResultadoAvaliacaoSST | null>(null);
  const [modoAcaoModal, setModoAcaoModal] = useState<'visualizar' | 'imprimir' | 'baixar_pdf'>('visualizar');

  // Verifica se o usuário atual é instrutor ou admin criador
  const isInstrutor = currentUser?.is_instrutor || currentUser?.perfil === 'admin' || currentUser?.perfil === 'super_admin';

  // Objeto da sala selecionada no modo instrutor ou participante
  const salaSelecionada = (salasQuizGuiado || []).find(s => s.id === salaAtivaId);

  const isSuperAdmin = currentUser?.perfil === 'super_admin';
  const isAdminEmpresa = currentUser?.perfil === 'admin';

  // REGRA DE PRIVACIDADE E ACESSO:
  // 1) Super Admin global: enxerga TODAS as salas (todas as empresas).
  // 2) Admin da empresa: enxerga TODAS as salas da PRÓPRIA empresa
  //    (inclusive as criadas por colaboradores/instrutores).
  // 3) Instrutor/Colaborador: enxerga SOMENTE as salas que ELE criou.
  // 4) Proteção entre empresas: ninguém vê salas de OUTRA empresa.
  const salasVisiveis = (salasQuizGuiado || []).filter(s => {
    if (isSuperAdmin) return true; // Super Admin enxerga tudo (proteção entre empresas não se aplica)

    // Admin: só salas da PRÓPRIA empresa
    if (isAdminEmpresa) {
      return s.empresa_id === currentUser?.empresa_id;
    }

    // Demais usuários: só as salas criadas por ELE MESMO (e da própria empresa)
    const mesmaEmpresa = !s.empresa_id || s.empresa_id === currentUser?.empresa_id;
    const eCriador = (s.instrutor_id && currentUser?.id && s.instrutor_id === currentUser.id) ||
                     (s.instrutor_nome && currentUser?.nome && s.instrutor_nome.trim().toLowerCase() === currentUser.nome.trim().toLowerCase());
    return mesmaEmpresa && eCriador;
  });

  // Filtragem por busca
  const salasFiltradas = salasVisiveis.filter(s => {
    const nome = s.nome || s.treinamento_titulo || '';
    const pin = s.pin || '';
    return !buscaSala || 
      nome.toLowerCase().includes(buscaSala.toLowerCase()) || 
      pin.includes(buscaSala);
  });

  // Meus resultados de avaliação teórica SST
  const meusResultadosSST = (resultadosAvaliacaoSST || []).filter(r =>
    r.participante_id === currentUser?.id ||
    (r.matricula && currentUser?.matricula && r.matricula === currentUser.matricula) ||
    (r.cpf && currentUser?.cpf && r.cpf === currentUser.cpf) ||
    (r.participante_nome && currentUser?.nome && r.participante_nome.trim().toLowerCase() === currentUser.nome.trim().toLowerCase()) ||
    (salaAtivaId && r.sala_id === salaAtivaId)
  );

  // Contagem estritamente filtrada por empresa e permissões para o badge da aba Laudos & PDFs
  const laudosVisiveisCount = useMemo(() => {
    const todos = resultadosAvaliacaoSST || [];
    return todos.filter(r => {
      if (isSuperAdmin) return true;
      if (r.empresa_id && currentUser?.empresa_id && r.empresa_id !== currentUser.empresa_id) return false;
      if (isAdminEmpresa) {
        if (r.empresa_id) return r.empresa_id === currentUser?.empresa_id;
        const sala = (salasQuizGuiado || []).find(s => s.id === r.sala_id);
        if (sala) return sala.empresa_id === currentUser?.empresa_id;
        if (r.participante_id) {
          const userPart = (usuarios || []).find(u => u.id === r.participante_id);
          if (userPart) return userPart.empresa_id === currentUser?.empresa_id;
        }
        // Se a prova não tem empresa_id associado ou a sala foi excluída, mantém visível ao admin da empresa
        return true;
      }
      if (currentUser?.is_instrutor) {
        if (r.instrutor_id && r.instrutor_id === currentUser.id) return true;
        if (r.instrutor_nome && currentUser?.nome && r.instrutor_nome.trim().toLowerCase() === currentUser.nome.trim().toLowerCase()) return true;
        if (r.sala_id) {
          const salaLegado = (salasQuizGuiado || []).find(s => s.id === r.sala_id);
          if (salaLegado && salaLegado.instrutor_id === currentUser.id) return true;
        }
        if (r.empresa_id && currentUser?.empresa_id && r.empresa_id === currentUser.empresa_id && !r.instrutor_id) {
          return true;
        }
        return false;
      }
      const isDoUsuario = r.participante_id === currentUser?.id || 
             (r.matricula && currentUser?.matricula && r.matricula === currentUser.matricula) ||
             (r.cpf && currentUser?.cpf && r.cpf === currentUser.cpf) ||
             (r.participante_nome && currentUser?.nome && r.participante_nome.trim().toLowerCase() === currentUser.nome.trim().toLowerCase());
      if (!isDoUsuario) return false;
      if (r.empresa_id && currentUser?.empresa_id) return r.empresa_id === currentUser.empresa_id;
      return true;
    }).length;
  }, [resultadosAvaliacaoSST, salasQuizGuiado, usuarios, currentUser, isSuperAdmin, isAdminEmpresa]);

  // Auto-preenche e abre fluxo de entrada se vier com URL parameter ?pin=XXXXXX
  // CORREÇÃO (auditoria Problema 2): reage a mudanças do parâmetro (popstate),
  // não apenas no mount — permite que um participante já aberto escaneie o QR
  // de uma nova sessão (novo PIN) e entre novamente.
  React.useEffect(() => {
    const processarPinUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const pinFromUrl = params.get('pin');
      if (pinFromUrl) {
        const cleanPin = pinFromUrl.trim().toUpperCase();
        setPinEntradaInput(cleanPin);
        iniciarFluxoIdentificacao(cleanPin);
      }
    };

    processarPinUrl();
    window.addEventListener('popstate', processarPinUrl);
    return () => window.removeEventListener('popstate', processarPinUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Procura a sala pelo PIN e abre a modal de identificação temporária
  // CORREÇÃO (bug: participante travado na entrada via PIN/QR): quando o
  // participante abre o app direto pela URL ?pin= (QR), a sala ainda NÃO está
  // no estado local — por isso buscamos no servidor (Express/Supabase) antes
  // de abrir a modal de identificação.
  const iniciarFluxoIdentificacao = async (pin: string) => {
    setPinErrorMsg('');
    const cleanPin = pin.trim().toUpperCase();
    if (!cleanPin) {
      setPinErrorMsg('Digite ou escaneie o PIN da sala.');
      return;
    }

    let salaObj = (salasQuizGuiado || []).find(s => s.pin === cleanPin && s.status !== 'encerrado' && s.status !== 'concluido');

    if (!salaObj) {
      // Busca no servidor (Express local primeiro, Supabase como fallback).
      try {
        const fetched = await supabaseService.fetchSalaQuizGuiadoByPin(cleanPin);
        if (fetched && fetched.id) {
          salaObj = fetched as any;
        }
      } catch (err) {
        console.warn('Aviso: Erro ao buscar sala por PIN no servidor:', err);
      }
    }

    if (!salaObj) {
      setPinErrorMsg('Sala não encontrada com este PIN ou a sessão já foi encerrada.');
      return;
    }

    setPinParaEntrada(cleanPin);
    setSalaEncontrada(salaObj);
    setShowIdentificacaoModal(true);
  };

  // Manipulador para submissão do formulário do PIN
  const handleEntrarViaPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    iniciarFluxoIdentificacao(pinEntradaInput);
  };

  // Executa a entrada após o participante preencher a identificação
  const handleConfirmarIdentificacao = async (dados: { nome: string; matricula: string; cpf_ou_empresa: string }) => {
    setShowIdentificacaoModal(false);

    // Entra sempre como participante temporário vinculado à sessão da sala
    try {
      const res = await entrarNaSalaQuizGuiado(pinParaEntrada, {
        nome: dados.nome,
        matricula: dados.matricula,
        cpf_ou_empresa: dados.cpf_ou_empresa,
        usuario_id: undefined, // Garante participante temporário isolado por sessão
        is_visitante: true,
      });

      if (res.success && res.sala) {
        if (res.participanteId) {
          const partKey = `quiz_part_id_${res.sala.id}_${res.sala.sessao_id}`;
          sessionStorage.setItem(partKey, res.participanteId);
          localStorage.setItem(partKey, res.participanteId);
        }
        setSalaAtivaId(res.sala.id);
        setModoAtivo('participante');
        setPinEntradaInput('');
        setPinErrorMsg('');
      } else {
        // CORREÇÃO (bug: participante não entra): reabre a modal para o
        // usuário ver o motivo e corrigir.
        setPinErrorMsg(res.message || 'Não foi possível entrar na sala. Tente novamente.');
        setShowIdentificacaoModal(true);
      }
    } catch (err) {
      console.warn('Erro ao entrar na sala:', err);
      const msg = err instanceof Error ? err.message : '';
      setPinErrorMsg(msg ? `Erro ao entrar na sala: ${msg}` : 'Erro ao entrar na sala. Verifique o PIN e tente novamente.');
      setShowIdentificacaoModal(true);
    }
  };

  // Se o usuário está dentro de uma sala no modo Instrutor:
  if (modoAtivo === 'instrutor' && salaSelecionada) {
    return (
      <>
        <PainelInstrutor
          sala={salaSelecionada}
          onVoltar={() => {
            setModoAtivo('lista');
            setSalaAtivaId(null);
          }}
          onVerRelatorio={(participanteId) => {
            const res = obterResultadoAvaliacaoParticipante(
              salaSelecionada.id,
              participanteId,
              salaSelecionada.sessao_id
            );
            if (res) {
              setModoAcaoModal('visualizar');
              setResultadoParaFicha(res);
            }
          }}
        />

        <RelatorioAvaliacaoModal
          resultado={resultadoParaFicha}
          isOpen={resultadoParaFicha !== null}
          onClose={() => setResultadoParaFicha(null)}
          modoInicial={modoAcaoModal}
        />
      </>
    );
  }

  // Se o usuário está dentro de uma sala no modo Participante:
  if (modoAtivo === 'participante' && salaSelecionada) {
    return (
      <>
        <PainelParticipante
          sala={salaSelecionada}
          onVoltar={() => {
            setModoAtivo('lista');
            setSalaAtivaId(null);
          }}
          onVerFichaCompleta={(participanteId) => {
            const res = obterResultadoAvaliacaoParticipante(
              salaSelecionada.id,
              participanteId || currentUser?.id || ''
            );
            if (res) {
              setModoAcaoModal('visualizar');
              setResultadoParaFicha(res);
            }
          }}
        />

        <RelatorioAvaliacaoModal
          resultado={resultadoParaFicha}
          isOpen={resultadoParaFicha !== null}
          onClose={() => setResultadoParaFicha(null)}
          modoInicial={modoAcaoModal}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Banner de Destaque Módulo Quiz Guiado */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-white/15 rounded-3xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center space-x-2">
              <span className="bg-amber-500/20 text-amber-300 text-xs font-black px-3 py-1 rounded-full border border-amber-500/40 uppercase tracking-wider flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Interativo & Avaliações SST</span>
              </span>
              {isInstrutor && (
                <span className="bg-emerald-500/20 text-emerald-300 text-xs font-black px-3 py-1 rounded-full border border-emerald-500/40">
                  {currentUser?.perfil === 'super_admin' ? 'Acesso Super Administrador SST' : 'Acesso Instrutor / Criador'}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Quiz Guiado SST em Tempo Real
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Plataforma para aplicação de quizzes presenciais, dinâmicas interativas e avaliações de Saúde e Segurança do Trabalho com controle em tempo real e emissão de laudos oficiais.
            </p>
          </div>

          {/* Botão de Criação de Sala para Criadores/Instrutores */}
          {isInstrutor && (
            <button
              onClick={() => {
                setSalaParaEditar(null);
                setShowCriarModal(true);
              }}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black px-6 py-3.5 rounded-2xl shadow-xl flex items-center justify-center space-x-2 transition-all transform hover:scale-102 shrink-0"
            >
              <Plus className="w-5 h-5 stroke-[3]" />
              <span>Criar Nova Sala de Quiz</span>
            </button>
          )}
        </div>
      </div>

      {/* NAVEGAÇÃO DE ABAS: SALAS vs LAUDOS & PDFS */}
      <div className="flex items-center space-x-2 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 w-fit backdrop-blur-md">
        <button
          onClick={() => setAbaAtiva('salas')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center space-x-2 transition-all ${
            abaAtiva === 'salas'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span>Salas de Quiz Guiado</span>
          {salasFiltradas.length > 0 && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
              abaAtiva === 'salas' ? 'bg-slate-950/30 text-slate-950' : 'bg-white/10 text-slate-300'
            }`}>
              {salasFiltradas.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setAbaAtiva('laudos')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center space-x-2 transition-all ${
            abaAtiva === 'laudos'
              ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Laudos & PDFs de Avaliações</span>
          {laudosVisiveisCount > 0 && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
              abaAtiva === 'laudos' ? 'bg-slate-950/30 text-slate-950' : 'bg-emerald-500/20 text-emerald-300'
            }`}>
              {laudosVisiveisCount}
            </span>
          )}
        </button>
      </div>

      {/* CONTEÚDO DA ABA SELECIONADA */}
      {abaAtiva === 'laudos' ? (
        <LaudosAvaliacoesTab
          onVisualizarLaudo={(res) => {
            setModoAcaoModal('visualizar');
            setResultadoParaFicha(res);
          }}
          onImprimirLaudo={(res) => {
            setModoAcaoModal('imprimir');
            setResultadoParaFicha(res);
          }}
          onBaixarPdfLaudo={(res) => {
            setModoAcaoModal('baixar_pdf');
            setResultadoParaFicha(res);
          }}
        />
      ) : (
        <div className="space-y-6">
          {/* QUADRO ÚNICO DE ENTRADA DO PARTICIPANTE: PIN OU QR CODE */}
          <div className="bg-slate-900/90 border border-emerald-500/40 rounded-3xl p-6 text-white shadow-2xl backdrop-blur-xl space-y-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/40">
                <QrCode className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">Entrar no Quiz via PIN ou QR Code</h3>
                <p className="text-xs text-slate-400">Escaneie o QR Code fornecido pelo criador do quiz ou digite o código PIN</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Botão de Escanear QR Code */}
              <button
                onClick={() => setShowQrScanner(true)}
                className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black px-5 py-3.5 rounded-2xl text-xs flex items-center justify-center space-x-2 shadow-lg transition-all shrink-0"
              >
                <Camera className="w-4 h-4" />
                <span>Escanear QR Code com a Câmera</span>
              </button>

              <span className="text-xs text-slate-400 font-bold text-center sm:text-left self-center">OU</span>

              {/* Form de Entrada por PIN */}
              <form onSubmit={handleEntrarViaPinSubmit} className="flex items-center space-x-2 flex-1">
                <input
                  type="text"
                  value={pinEntradaInput}
                  onChange={(e) => setPinEntradaInput(e.target.value.toUpperCase())}
                  placeholder="Digite o PIN (ex: 849201)"
                  maxLength={6}
                  className="bg-slate-950 border border-white/20 rounded-2xl px-4 py-3 text-slate-100 font-mono text-center font-bold text-sm uppercase tracking-widest focus:border-emerald-500 focus:outline-none flex-1"
                />
                <button
                  type="submit"
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-3 rounded-2xl text-xs flex items-center space-x-1.5 shadow-lg transition-all shrink-0"
                >
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>Entrar</span>
                </button>
              </form>
            </div>

            {pinErrorMsg && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-rose-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{pinErrorMsg}</span>
              </div>
            )}
          </div>

          {/* SEÇÃO: MINHAS SALAS CRIADAS (VISÍVEL APENAS PARA INSTRUTORES/CRIADORES DA SALA) */}
          {isInstrutor && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-lg font-black text-white flex items-center space-x-2">
                  <Tv className="w-5 h-5 text-amber-400" />
                  <span>Minhas Salas Criadas ({salasFiltradas.length})</span>
                </h2>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={buscaSala}
                    onChange={(e) => setBuscaSala(e.target.value)}
                    placeholder="Buscar minhas salas por nome ou PIN..."
                    className="w-full bg-slate-900 border border-white/10 rounded-2xl pl-9 pr-4 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {salasFiltradas.length === 0 ? (
                <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-8 text-center text-slate-400 text-xs space-y-2">
                  <Sparkles className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>Você ainda não criou nenhuma sala de quiz guiado.</p>
                  <button
                    onClick={() => setShowCriarModal(true)}
                    className="text-amber-400 hover:text-amber-300 font-bold underline"
                  >
                    Clique aqui para criar sua primeira sala!
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {salasFiltradas.map(sala => (
                    <div 
                      key={sala.id}
                      className="bg-slate-900/80 border border-white/10 rounded-3xl p-5 text-white shadow-xl flex flex-col justify-between space-y-4 hover:border-amber-500/40 transition-all backdrop-blur-md"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-black text-emerald-400 bg-slate-950 px-2.5 py-1 rounded-xl border border-emerald-500/30">
                            PIN: {sala.pin}
                          </span>

                          <div className="flex items-center space-x-1.5">
                            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border uppercase ${
                              sala.status === 'aguardando' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse' :
                              sala.status === 'em_andamento' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                              sala.status === 'pausado' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                              'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            }`}>
                              {sala.status === 'aguardando' ? 'Aguardando' :
                               sala.status === 'em_andamento' ? 'Em Andamento' :
                               sala.status === 'pausado' ? 'Pausado' : 'Encerrado'}
                            </span>

                            <div className="flex items-center space-x-1 ml-1">
                              <button
                                onClick={() => {
                                  setSalaParaEditar(sala);
                                  setShowCriarModal(true);
                                }}
                                title="Editar Sala"
                                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-xl transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setSalaParaDeletar(sala)}
                                title="Excluir Sala"
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <h3 className="font-extrabold text-base text-white line-clamp-1">{sala.nome}</h3>

                        <div className="text-[11px] text-slate-400 space-y-1">
                          <div className="flex items-center justify-between">
                            <span>Modalidade: <strong className="text-slate-200 capitalize">{sala.modalidade}</strong></span>
                            <span>Instrutor: <strong className="text-slate-200">{sala.instrutor_nome}</strong></span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>Perguntas: {sala.perguntas.length}</span>
                            <span>Participantes: <strong className="text-amber-400">{sala.participantes.length}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* Ações do Criador */}
                      <div className="space-y-2 pt-2 border-t border-white/10">
                        <button
                          onClick={() => {
                            setSalaAtivaId(sala.id);
                            setModoAtivo('instrutor');
                          }}
                          className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-2.5 rounded-2xl text-xs flex items-center justify-center space-x-1.5 shadow-md transition-all"
                        >
                          <Tv className="w-4 h-4" />
                          <span>Gerenciar Mesa de Controle</span>
                        </button>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SEÇÃO: MINHAS FICHAS DE AVALIAÇÃO SST DO PARTICIPANTE */}
          {meusResultadosSST.length > 0 && (
            <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-6 text-white shadow-xl space-y-4 backdrop-blur-md">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="text-base font-extrabold text-white flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>Minhas Fichas de Avaliação Teórica SST ({meusResultadosSST.length})</span>
                </h2>
              </div>

              <div className="space-y-3">
                {meusResultadosSST.map(res => (
                  <div 
                    key={res.id}
                    className="p-4 rounded-2xl border bg-white/5 border-white/10 flex items-center justify-between flex-wrap gap-3 text-xs"
                  >
                    <div>
                      <div className="font-extrabold text-sm text-white">{res.sala_nome || res.treinamento_titulo}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Data: {res.data_finalizacao ? new Date(res.data_finalizacao).toLocaleDateString('pt-BR') : res.data} • Instrutor: {res.instrutor_nome}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <span className="font-black text-emerald-400 text-sm block">
                          Nota: {res.nota_final.toFixed(1)} / 10.0 ({res.porcentagem_acertos}% acertos)
                        </span>
                        <span className={`text-[10px] font-black uppercase ${
                          (res.situacao === 'APROVADO' || res.situacao === 'Aprovado') ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {res.situacao}
                        </span>
                      </div>

                      <button
                        onClick={() => setResultadoParaFicha(res)}
                        className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-extrabold px-3.5 py-1.5 rounded-xl flex items-center space-x-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Gerar PDF / Ficha</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAIS */}
      <CriarSalaModal
        isOpen={showCriarModal}
        onClose={() => {
          setShowCriarModal(false);
          setSalaParaEditar(null);
        }}
        salaParaEditar={salaParaEditar}
        onSalaCriada={(novaSalaId) => {
          setShowCriarModal(false);
          setSalaParaEditar(null);
          setSalaAtivaId(novaSalaId);
          setModoAtivo('instrutor');
        }}
      />

      <QRCodeScannerModal
        isOpen={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScanSuccess={(pin) => {
          setPinEntradaInput(pin);
          iniciarFluxoIdentificacao(pin);
        }}
      />

      <IdentificacaoParticipanteModal
        isOpen={showIdentificacaoModal}
        pinSala={pinParaEntrada}
        nomeSala={salaEncontrada?.nome}
        modalidade={salaEncontrada?.modalidade}
        erroExterno={pinErrorMsg}
        onClose={() => setShowIdentificacaoModal(false)}
        onConfirmar={handleConfirmarIdentificacao}
      />

      <RelatorioAvaliacaoModal
        resultado={resultadoParaFicha}
        isOpen={resultadoParaFicha !== null}
        onClose={() => setResultadoParaFicha(null)}
        modoInicial={modoAcaoModal}
      />

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE SALA */}
      {salaParaDeletar && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-white">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/20 rounded-2xl border border-rose-500/30">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">Excluir Sala de Quiz Guiado</h3>
                <p className="text-xs text-slate-400">Esta ação excluirá permanentemente a sala</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tem certeza que deseja excluir a sala <strong className="text-white">"{salaParaDeletar.nome || salaParaDeletar.treinamento_titulo}"</strong> (PIN: {salaParaDeletar.pin})? Todos os participantes conectados e dados de progresso nesta sala serão removidos.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setSalaParaDeletar(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-slate-300 font-bold rounded-xl text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  excluirSalaQuizGuiado(salaParaDeletar.id);
                  setSalaParaDeletar(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs shadow-lg transition-colors flex items-center space-x-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sim, Excluir Sala</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
