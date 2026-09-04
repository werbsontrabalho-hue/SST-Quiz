import React, { useState, useEffect, useRef } from 'react';
import { formatAlternativaText } from '../../../utils/questionHelpers';
import { useSST } from '../../../context/SSTContext';
import { sanitizeSalaParaParticipante } from '../../../utils/salaSanitize';
import { SalaQuizGuiado, ResultadoAvaliacaoSST } from '../../../types';
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Award, 
  ShieldCheck, 
  QrCode, 
  Sparkles, 
  FileText, 
  ArrowLeft,
  AlertTriangle,
  RotateCcw,
  Wifi,
  WifiOff,
  Trophy,
  Users,
  Check,
  UserCheck
} from 'lucide-react';

interface PainelParticipanteProps {
  sala: SalaQuizGuiado;
  onVoltar: () => void;
  // Recebe o id do participante da sessão (part-...), pois o participante
  // entra como temporário e não tem currentUser.id vinculado ao resultado.
  onVerFichaCompleta?: (participanteId: string) => void;
}

export const PainelParticipante: React.FC<PainelParticipanteProps> = ({
  sala,
  onVoltar,
  onVerFichaCompleta
}) => {
  const { currentUser, entrarNaSalaQuizGuiado, submeterRespostaQuizGuiado, obterResultadoAvaliacaoParticipante } = useSST();

  // O estado global mantém a sala COMPLETA (com gabarito) para que a
  // pontuação e o resultado da avaliação sejam calculados corretamente.
  // Aqui sanitizamos apenas a exibição (anti-cola): o participante não vê
  // resposta_correta/explicacao de perguntas ainda não reveladas.
  const salaExibicao = sanitizeSalaParaParticipante(sala);

  // ID e Nome armazenados localmente para reconexão/identificação da sessão
  const partIdStorageKey = `quiz_part_id_${sala.id}_${sala.sessao_id}`;
  const storageKey = `quiz_participante_nome_${sala.pin}_${sala.sessao_id}`;
  
  const [nomeIdentificacao, setNomeIdentificacao] = useState<string>(() => {
    const salvo = localStorage.getItem(storageKey);
    if (salvo) return salvo;
    return '';
  });
  const [inputNome, setInputNome] = useState<string>(nomeIdentificacao);
  const [inputMatricula, setInputMatricula] = useState<string>('');
  const [inputCpf, setInputCpf] = useState<string>('');
  const [isSubmittingNome, setIsSubmittingNome] = useState<boolean>(false);

  // Status de conexão de rede
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [mostrarBadgeReconectado, setMostrarBadgeReconectado] = useState<boolean>(false);

  // Monitora online / offline
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setMostrarBadgeReconectado(true);
      setTimeout(() => setMostrarBadgeReconectado(false), 3000);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Arrays e objetos com fallbacks seguros
  const participantes = salaExibicao.participantes || [];
  const perguntas = salaExibicao.perguntas || [];

  const salvoPartId = typeof window !== 'undefined' ? (sessionStorage.getItem(partIdStorageKey) || localStorage.getItem(partIdStorageKey)) : null;

  // Encontrar estado do participante logado na sala de forma isolada sem vazamento de usuario
  const participante = participantes.find(
    p => (salvoPartId && p.id === salvoPartId) ||
         (p.nome && nomeIdentificacao && (p.nome || '').trim().toLowerCase() === (nomeIdentificacao || '').trim().toLowerCase())
  );

  const tempoLimiteSeg = sala.tempo_por_pergunta_seg !== undefined
    ? Number(sala.tempo_por_pergunta_seg)
    : (sala.tempo_por_pergunta !== undefined ? Number(sala.tempo_por_pergunta) : 30);
  const [opcaoSelecionada, setOpcaoSelecionada] = useState<number | null>(null);
  const [respostaConfirmada, setRespostaConfirmada] = useState<boolean>(false);
  const [tempoRestante, setTempoRestante] = useState<number>(tempoLimiteSeg);

  const opcaoSelecionadaRef = useRef<number | null>(null);
  const respostaConfirmadaRef = useRef<boolean>(false);

  useEffect(() => {
    opcaoSelecionadaRef.current = opcaoSelecionada;
  }, [opcaoSelecionada]);

  useEffect(() => {
    respostaConfirmadaRef.current = respostaConfirmada;
  }, [respostaConfirmada]);

  // Pergunta atual da sala
  const perguntaAtual = perguntas[sala.pergunta_atual_index];
  const totalPerguntas = perguntas.length;
  const opcoesPerguntaAtual = perguntaAtual ? ((perguntaAtual as any).opcoes || perguntaAtual.alternativas || []) : [];

  // Verifica se o participante já respondeu a esta pergunta
  const respostaExistente = (participante?.respostas && perguntaAtual)
    ? (Array.isArray(participante.respostas)
        ? participante.respostas.find((r: any) => r.pergunta_id === perguntaAtual.id)
        : participante.respostas[perguntaAtual.id])
    : undefined;

  // CORREÇÃO (bug: todas as respostas apareciam erradas mesmo acertando):
  // quando a pergunta está REVELADA, o sanitize preserva o `resposta_correta`
  // dela. Esse gabarito local é autoridade para EXIBIÇÃO — a flag gravada em
  // tempo de jogo pode ter vindo de um validador remoto com gabarito defasado.
  const gabaritoPerguntaAtual = perguntaAtual && typeof (perguntaAtual as any).resposta_correta === 'number'
    ? (perguntaAtual as any).resposta_correta as number
    : undefined;
  const corretaEfetiva = respostaExistente
    ? (gabaritoPerguntaAtual !== undefined
        ? respostaExistente.resposta_index === gabaritoPerguntaAtual
        : (respostaExistente as any).correta)
    : undefined;

  useEffect(() => {
    if (respostaExistente) {
      setOpcaoSelecionada(respostaExistente.resposta_index);
      setRespostaConfirmada(true);
    } else {
      setOpcaoSelecionada(null);
      setRespostaConfirmada(false);
    }
  }, [sala.pergunta_atual_index, respostaExistente]);

  // Temporizador sincronizado com timestamps de referência do servidor
  useEffect(() => {
    if (sala.status !== 'em_andamento' || tempoLimiteSeg === 0) {
      setTempoRestante(tempoLimiteSeg);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const startedAt = sala.question_started_at || now;
      const endsAt = sala.question_ends_at || (startedAt + tempoLimiteSeg * 1000);

      const remSecs = Math.max(0, Math.ceil((endsAt - now) / 1000));
      setTempoRestante(prev => (prev !== remSecs ? remSecs : prev));

      // Se o tempo zerar e o aluno tiver deixado uma opção selecionada sem confirmar, auto-submete
      if (remSecs === 0 && opcaoSelecionadaRef.current !== null && !respostaConfirmadaRef.current) {
        if (perguntaAtual && participante) {
          const opt = opcaoSelecionadaRef.current;
          setRespostaConfirmada(true);
          const tempoGasto = tempoLimiteSeg > 0 ? (tempoLimiteSeg * 1000) : 10000;
          submeterRespostaQuizGuiado(sala.id, participante.id, perguntaAtual.id, opt, tempoGasto);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [sala.status, sala.question_started_at, sala.question_ends_at, tempoLimiteSeg, sala.pergunta_atual_index]);

  // Função para cadastrar/entrar pelo nome
  const [erroEntrada, setErroEntrada] = useState<string>('');
  const handleEntrarComNome = async (e: React.FormEvent) => {
    e.preventDefault();
    const nomeLimpo = (inputNome || '').trim();
    if (!nomeLimpo) return;

    setIsSubmittingNome(true);
    setErroEntrada('');
    localStorage.setItem(storageKey, nomeLimpo);
    setNomeIdentificacao(nomeLimpo);

    try {
      const res = await entrarNaSalaQuizGuiado(sala.pin, {
        nome: nomeLimpo,
        matricula: (inputMatricula || '').trim(),
        cpf: (inputCpf || '').trim(),
        usuario_id: undefined, // Participante temporário da sessão
        cpf_ou_empresa: `${(inputMatricula || '').trim()} - ${(inputCpf || '').trim()}`
      });
      if (res.success && res.participanteId) {
        sessionStorage.setItem(partIdStorageKey, res.participanteId);
        localStorage.setItem(partIdStorageKey, res.participanteId);
      } else {
        // CORREÇÃO (Problema 2 — participante travado na tela "Iniciar"): antes
        // a falha era SILENCIOSA — o participante clicava em "CONFIRMAR E ENTRAR"
        // e nada acontecia (ex.: PIN novo não encontrado no servidor após o
        // reinício da sala). Agora exibimos o motivo real para ele corrigir.
        setErroEntrada(res.message || 'Não foi possível entrar na sala. Verifique o PIN e tente novamente.');
      }
    } catch (err) {
      console.warn('Erro ao entrar na sala:', err);
      setErroEntrada('Erro ao entrar na sala. Verifique sua conexão e tente novamente.');
    } finally {
      setIsSubmittingNome(false);
    }
  };

  // Função para submeter opção selecionada de forma definitiva
  const submeterOpcaoEfetiva = (opcaoIdx: number) => {
    if (respostaConfirmadaRef.current || sala.status !== 'em_andamento' || !perguntaAtual || !participante) return;

    setOpcaoSelecionada(opcaoIdx);
    setRespostaConfirmada(true);

    const tempoGasto = tempoLimiteSeg > 0 ? ((tempoLimiteSeg - tempoRestante) * 1000) : 10000;
    submeterRespostaQuizGuiado(sala.id, participante.id, perguntaAtual.id, opcaoIdx, tempoGasto);
  };

  // Clique na alternativa: primeiro clique seleciona sem bloquear o scroll nem a tela;
  // segundo clique na mesma alternativa (ou confirmação pelo botão no rodapé) confirma e envia!
  const handleSelecionarOpcao = (opcaoIdx: number) => {
    if (respostaConfirmada || sala.status !== 'em_andamento' || !perguntaAtual || !participante || (tempoLimiteSeg > 0 && tempoRestante === 0)) return;

    if (opcaoSelecionada === opcaoIdx) {
      submeterOpcaoEfetiva(opcaoIdx);
      return;
    }

    setOpcaoSelecionada(opcaoIdx);
  };

  // Ranking ordenado da sala
  const rankingParticipantes = [...participantes].sort((a, b) => (b.pontuacao_acumulada || 0) - (a.pontuacao_acumulada || 0));
  const posicaoUsuario = participante ? rankingParticipantes.findIndex(p => p.id === participante.id) + 1 : 0;

  // Se a sala encerrou, busca o resultado do participante
  // CORREÇÃO (auditoria Quiz Guiado/Avaliação): passa a sessao_id para a
  // busca — garante que retorne a avaliação DESTA sessão, não a de uma
  // sessão anterior do mesmo Quiz.
  const resultadoAvaliacao = (sala.status === 'encerrado' || sala.status === 'concluido') && participante
    ? obterResultadoAvaliacaoParticipante(sala.id, participante.id, sala.sessao_id)
    : null;

  // -------------------------------------------------------------
  // PASSO 1: SE O PARTICIPANTE AINDA NÃO SE IDENTIFICOU/CADASTROU
  // -------------------------------------------------------------
  if (!participante) {
    return (
      <div className="max-w-md mx-auto space-y-6">
        <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 sm:p-8 text-white space-y-6 text-center shadow-2xl backdrop-blur-xl">
          <div className="w-16 h-16 bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
            <ShieldCheck className="w-9 h-9" />
          </div>

          <div>
            <span className="text-[10px] font-black uppercase text-emerald-400 tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30">
              PIN da Sala: {sala.pin}
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white mt-3">
              {sala.nome || sala.treinamento_titulo}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Instrutor: <strong>{sala.instrutor_nome}</strong>
            </p>
          </div>

          <form onSubmit={handleEntrarComNome} className="space-y-3.5 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Nome Completo *:
              </label>
              <input
                type="text"
                value={inputNome}
                onChange={(e) => setInputNome(e.target.value)}
                placeholder="Ex: Carlos Eduardo Silva"
                className="w-full bg-slate-950 border border-white/20 rounded-2xl px-4 py-2.5 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500 transition-all font-semibold"
                required
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Matrícula *:
                </label>
                <input
                  type="text"
                  value={inputMatricula}
                  onChange={(e) => setInputMatricula(e.target.value)}
                  placeholder="Ex: MAT-10492"
                  className="w-full bg-slate-950 border border-white/20 rounded-2xl px-3.5 py-2.5 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  CPF *:
                </label>
                <input
                  type="text"
                  value={inputCpf}
                  onChange={(e) => setInputCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full bg-slate-950 border border-white/20 rounded-2xl px-3.5 py-2.5 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!(inputNome || '').trim() || !(inputMatricula || '').trim() || !(inputCpf || '').trim() || isSubmittingNome}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black py-3.5 rounded-2xl text-xs uppercase tracking-wider shadow-lg transition-transform transform active:scale-98 flex items-center justify-center space-x-2 mt-2"
            >
              <UserCheck className="w-4 h-4" />
              <span>{isSubmittingNome ? 'ENTRANDO...' : 'CONFIRMAR E ENTRAR NO QUIZ'}</span>
            </button>
          </form>

          {erroEntrada && (
            <div className="flex items-start space-x-2 bg-rose-500/15 border border-rose-500/40 text-rose-300 p-3 rounded-2xl text-xs font-bold animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{erroEntrada}</span>
            </div>
          )}

          <button
            onClick={onVoltar}
            className="text-xs text-slate-400 hover:text-white font-bold transition-colors flex items-center justify-center space-x-1 mx-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Menu Principal</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* BANNER DE RECONEXÃO OU CONEXÃO PERDIDA */}
      {!isOnline && (
        <div className="bg-rose-500/20 border border-rose-500/40 text-rose-300 p-3 rounded-2xl text-xs font-bold flex items-center justify-center space-x-2 animate-pulse">
          <WifiOff className="w-4 h-4 text-rose-400" />
          <span>⚠️ Conexão perdida. Tentando reconectar...</span>
        </div>
      )}

      {mostrarBadgeReconectado && isOnline && (
        <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-3 rounded-2xl text-xs font-bold flex items-center justify-center space-x-2 animate-fadeIn">
          <Wifi className="w-4 h-4 text-emerald-400" />
          <span>🟢 Conectado novamente</span>
        </div>
      )}

      {/* CABEÇALHO SUPERIOR DA SESSÃO */}
      <div className="bg-slate-900 border border-white/15 rounded-3xl p-5 text-white shadow-xl flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-3">
          <button
            onClick={onVoltar}
            className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl border border-white/10 transition-all text-xs font-bold flex items-center space-x-1"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Sair</span>
          </button>
          <div>
            <h3 className="font-extrabold text-sm text-white">{sala.nome || sala.treinamento_titulo}</h3>
            <p className="text-[11px] text-slate-400 flex items-center space-x-1">
              <span>Instrutor: {sala.instrutor_nome}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-xs font-bold text-slate-300 flex items-center space-x-1 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{participante.nome}</span>
          </span>
          <span className="text-[10px] font-mono font-bold text-emerald-400 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-emerald-500/30">
            PIN: {sala.pin}
          </span>
        </div>
      </div>

      {/* -------------------------------------------------------------
          PASSO 2: SALA DE ESPERA (CONFIRMAÇÃO DE ENTRADA)
      ------------------------------------------------------------- */}
      {sala.status === 'aguardando' && (
        <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-8 text-center space-y-6 backdrop-blur-xl shadow-2xl">
          <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/40 animate-pulse shadow-lg">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <h2 className="text-2xl font-black text-white">Você está dentro!</h2>
            <div className="text-lg font-bold text-emerald-400 mt-1 flex items-center justify-center space-x-2">
              <span>👤 {participante.nome}</span>
            </div>
            <p className="text-xs text-slate-300 max-w-md mx-auto mt-2 leading-relaxed">
              Aguarde o professor iniciar o quiz. A tela atualizará automaticamente.
            </p>
          </div>

          <div className="bg-slate-950 p-4 rounded-2xl border border-white/10 flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center space-x-2 font-bold">
              <Users className="w-4 h-4 text-amber-400" />
              <span>Participantes conectados:</span>
            </span>
            <span className="text-lg font-black text-emerald-400">{sala.participantes.length}</span>
          </div>

          <div className="inline-flex items-center space-x-2 bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 rounded-full text-xs font-bold text-emerald-300">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <span>🟢 Conectado em tempo real</span>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------
          PASSO 4 & 5: PERGUNTA ATIVA E SELEÇÃO DE RESPOSTA
      ------------------------------------------------------------- */}
      {sala.status === 'em_andamento' && perguntaAtual && !sala.revelar_resposta_atual && (
        <div className="bg-slate-900/90 border border-white/15 rounded-3xl text-white shadow-2xl backdrop-blur-xl relative">
          
          {/* Cabeçalho Sticky: Pergunta X de Y e Timer sempre visíveis ao rolar no celular */}
          <div className="sticky top-0 z-20 backdrop-blur-xl bg-slate-900/95 border-b border-white/15 rounded-t-3xl p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-400 uppercase tracking-wider">
                Pergunta {sala.pergunta_atual_index + 1} de {totalPerguntas}
              </span>

              {tempoLimiteSeg > 0 ? (
                <div className={`text-xs font-black px-3 py-1 rounded-xl border flex items-center space-x-1 shrink-0 ${
                  tempoRestante <= 5 ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  <Clock className="w-3.5 h-3.5" />
                  <span>⏱️ {tempoRestante}s</span>
                </div>
              ) : (
                <div className="text-[11px] font-bold px-2.5 py-1 rounded-xl border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 flex items-center space-x-1 shrink-0">
                  <Clock className="w-3 h-3 text-indigo-400" />
                  <span>Avanço Manual</span>
                </div>
              )}
            </div>

            {/* Barra visual de progresso do timer */}
            {tempoLimiteSeg > 0 && (
              <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden mt-3">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    tempoRestante > tempoLimiteSeg * 0.5 ? 'bg-emerald-500' : tempoRestante > tempoLimiteSeg * 0.25 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, (tempoRestante / tempoLimiteSeg) * 100)}%` }}
                />
              </div>
            )}
          </div>

          {/* Enunciado e Alternativas */}
          <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
            <h2 className="text-sm sm:text-base md:text-lg font-black text-white leading-relaxed break-words hyphens-auto">
              {perguntaAtual.enunciado}
            </h2>

            {/* Alternativas de Resposta (A, B, C, D) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {opcoesPerguntaAtual.map((opcao, idx) => {
                const cores = [
                  'from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white border-rose-400/40',
                  'from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white border-blue-400/40',
                  'from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 border-amber-300/40',
                  'from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white border-emerald-400/40'
                ];

                const letras = ['A', 'B', 'C', 'D'];
                const selecionado = opcaoSelecionada === idx;

                return (
                  <button
                    key={idx}
                    disabled={respostaConfirmada || tempoRestante === 0}
                    onClick={() => handleSelecionarOpcao(idx)}
                    className={`p-3.5 sm:p-4 rounded-2xl border text-left flex items-start space-x-3 transition-all transform active:scale-[0.98] bg-gradient-to-br shadow-lg min-h-[52px] touch-manipulation select-none cursor-pointer ${cores[idx]} ${
                      selecionado ? 'ring-4 ring-white scale-[1.01] font-extrabold shadow-2xl' : ''
                    } ${respostaConfirmada && !selecionado ? 'opacity-30' : ''}`}
                  >
                    <span className="w-7 h-7 rounded-xl bg-slate-950/40 font-black text-sm flex items-center justify-center shrink-0 border border-white/20 mt-0.5">
                      {letras[idx]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs sm:text-sm font-bold leading-snug block break-words hyphens-auto">
                        {formatAlternativaText(opcao)}
                      </span>
                      {selecionado && !respostaConfirmada && (
                        <span className="text-[10px] font-extrabold block mt-1.5 opacity-95">
                          ✓ Toque novamente para confirmar
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* PASSO 5: FEEDBACK APÓS SELEÇÃO */}
            {respostaConfirmada && (
              <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold space-y-1 animate-fadeIn">
                <div className="flex items-center space-x-2 text-sm font-extrabold text-emerald-400">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>Resposta registrada com sucesso!</span>
                </div>
                <p className="text-emerald-200">
                  ✅ Sua resposta foi enviada. Aguarde o encerramento da pergunta pelo instrutor.
                </p>
              </div>
            )}

            {/* PASSO 6: CASO O CRONÔMETRO CHEGUE A ZERO SEM MENSAGEM */}
            {tempoRestante === 0 && !respostaConfirmada && (
              <div className="p-4 bg-amber-500/20 border border-amber-500/40 rounded-2xl text-amber-300 text-xs font-bold space-y-1 animate-fadeIn">
                <div className="flex items-center space-x-2 text-sm font-extrabold text-amber-400">
                  <Clock className="w-5 h-5 shrink-0" />
                  <span>Tempo encerrado!</span>
                </div>
                <p className="text-amber-200">
                  Você não respondeu esta pergunta a tempo. Aguarde o resultado do instrutor.
                </p>
              </div>
            )}
          </div>

          {/* Barra de ação sticky no rodapé para confirmação no celular */}
          {!respostaConfirmada && tempoRestante > 0 && opcaoSelecionada !== null && (
            <div className="sticky bottom-3 z-30 m-3 sm:m-4 p-3 sm:p-4 bg-slate-950/95 border-2 border-emerald-500/80 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center justify-between gap-3 animate-fadeIn">
              <div className="min-w-0 flex-1">
                <span className="text-[10px] sm:text-xs text-slate-400 block font-semibold uppercase tracking-wider">
                  Opção selecionada:
                </span>
                <span className="font-extrabold text-white text-xs sm:text-sm truncate block">
                  {['A', 'B', 'C', 'D'][opcaoSelecionada]}) {formatAlternativaText(opcoesPerguntaAtual[opcaoSelecionada])}
                </span>
              </div>
              <button
                onClick={() => submeterOpcaoEfetiva(opcaoSelecionada)}
                className="bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-black px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm transition-all shadow-lg flex items-center space-x-1.5 shrink-0 touch-manipulation cursor-pointer"
              >
                <span>Confirmar</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>
      )}

      {/* -------------------------------------------------------------
          PASSO 7, 8 & 9: ENCERRAMENTO DA PERGUNTA, RESULTADO E RANKING
      ------------------------------------------------------------- */}
      {sala.status === 'em_andamento' && perguntaAtual && sala.revelar_resposta_atual && (
        <div className="space-y-6 animate-fadeIn">
          
          {/* Card de Resultado da Pergunta */}
          <div className="bg-slate-900/90 border border-white/15 rounded-3xl p-6 text-white shadow-2xl backdrop-blur-xl space-y-5">
            <h3 className="text-xs font-black uppercase text-amber-400 tracking-wider flex items-center space-x-1.5">
              <Sparkles className="w-4 h-4" />
              <span>Resultado da Pergunta {sala.pergunta_atual_index + 1}</span>
            </h3>

            {/* Resposta Correta x Resposta do Aluno */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 space-y-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Resposta Correta:</span>
                <span className="font-extrabold text-emerald-400 text-sm flex items-center space-x-1.5 mt-0.5">
                  <span>🟢 {opcoesPerguntaAtual[perguntaAtual.resposta_correta] || 'Opção Correta'}</span>
                </span>
              </div>

              {respostaExistente ? (
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Sua Resposta:</span>
                  <span className={`font-extrabold text-sm flex items-center space-x-1.5 mt-0.5 ${
                    corretaEfetiva === true ? 'text-emerald-400' : corretaEfetiva === undefined ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    <span>{corretaEfetiva === true ? '🟢' : corretaEfetiva === undefined ? '⏳' : '🔴'} {opcoesPerguntaAtual[respostaExistente.resposta_index] ?? 'Sua Resposta'}</span>
                  </span>
                </div>
              ) : (
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Sua Resposta:</span>
                  <span className="font-extrabold text-amber-400 text-sm flex items-center space-x-1 mt-0.5">
                    <span>⚠️ Não respondeu</span>
                  </span>
                </div>
              )}
            </div>

            {/* Badge de Pontuação da Pergunta */}
            {corretaEfetiva === true ? (
              <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-center space-y-1">
                <span className="text-2xl font-black text-emerald-400 block">ACERTOU! 🎉</span>
                <span className="text-xs font-bold text-emerald-200">
                  Pontuação total acumulada: <strong className="text-white">{participante?.pontuacao_acumulada || 0} pontos</strong>
                </span>
              </div>
            ) : corretaEfetiva === undefined ? (
              <div className="p-4 bg-amber-500/20 border border-amber-500/40 rounded-2xl text-center space-y-1">
                <span className="text-lg font-black text-amber-300 block">Resposta registrada — aguardando validação do professor.</span>
              </div>
            ) : (
              <div className="p-4 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-center space-y-1">
                <span className="text-lg font-black text-rose-300 block">Você não pontuou nesta pergunta.</span>
              </div>
            )}

            {/* Distribuição percentual das respostas da turma */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 space-y-3 text-xs">
              <span className="text-xs font-extrabold text-amber-400 block border-b border-white/10 pb-1.5">
                📊 Distribuição das Respostas da Turma:
              </span>
              <div className="space-y-2">
                {opcoesPerguntaAtual.map((opcaoTexto, idx) => {
                  const totalRespostas = (sala.participantes || []).filter(p => p.respostas && p.respostas[perguntaAtual.id] !== undefined).length;
                  const qtd = (sala.participantes || []).filter(p => p.respostas && p.respostas[perguntaAtual.id]?.resposta_index === idx).length;
                  const pct = totalRespostas > 0 ? Math.round((qtd / totalRespostas) * 100) : 0;
                  const eCorreta = idx === perguntaAtual.resposta_correta;
                  const letras = ['A', 'B', 'C', 'D'];

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className={`flex items-center space-x-1 ${eCorreta ? 'text-emerald-400 font-extrabold' : 'text-slate-300'}`}>
                          <span>{letras[idx]}. {opcaoTexto}</span>
                          {eCorreta && <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/40">Gabarito</span>}
                        </span>
                        <span className="font-mono text-white">{pct}% ({qtd})</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${eCorreta ? 'bg-emerald-500' : 'bg-blue-500/60'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Explicação da Norma se houver */}
            {perguntaAtual.explicacao && (
              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-2xl text-xs text-purple-200 space-y-1">
                <strong className="block text-purple-300 font-extrabold">Fundamentação Técnica SST:</strong>
                <p className="leading-relaxed text-purple-100">{perguntaAtual.explicacao}</p>
              </div>
            )}
          </div>

          {/* PASSO 9: RANKING INTERMEDIÁRIO */}
          <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-black text-sm text-amber-400 flex items-center space-x-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Ranking Parcial da Turma</span>
              </h3>
              <span className="text-xs font-extrabold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                Sua posição: {posicaoUsuario}º lugar
              </span>
            </div>

            {/* Top 3 + Posição Atual */}
            <div className="space-y-2">
              {rankingParticipantes.slice(0, 3).map((p, idx) => {
                const medalhas = ['🥇', '🥈', '🥉'];
                const eVoce = participante ? p.id === participante.id : false;

                return (
                  <div
                    key={p.id}
                    className={`p-3 rounded-2xl border text-xs flex items-center justify-between transition-all ${
                      eVoce 
                        ? 'bg-amber-500/20 border-amber-500/50 font-black ring-2 ring-amber-400' 
                        : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className="text-base">{medalhas[idx]}</span>
                      <span className="font-bold">{p.nome} {eVoce && '(Você)'}</span>
                    </div>

                    <span className="font-mono font-black text-amber-400">
                      {p.pontuacao_acumulada || 0} pts
                    </span>
                  </div>
                );
              })}
            </div>

            {/* PASSO 10: ESPERA PELA PRÓXIMA PERGUNTA */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-white/10 text-center space-y-1">
              <span className="text-xs font-bold text-slate-300 block">
                Aguarde. O professor está preparando a próxima pergunta...
              </span>
              <span className="text-[11px] text-slate-500 font-bold block">
                Pergunta {sala.pergunta_atual_index + 1} de {totalPerguntas}
              </span>
            </div>
          </div>

        </div>
      )}

      {/* -------------------------------------------------------------
          PASSO 12: INTERAÇÃO QUANDO O PROFESSOR PAUSA
      ------------------------------------------------------------- */}
      {sala.status === 'pausado' && (
        <div className="bg-slate-900/90 border border-purple-500/30 rounded-3xl p-8 text-center space-y-3 backdrop-blur-xl">
          <div className="w-14 h-14 bg-purple-500/20 text-purple-300 rounded-full flex items-center justify-center mx-auto border border-purple-500/40">
            <Clock className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-black text-white">⏸️ Quiz Pausado</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Aguarde o professor continuar. Nenhuma pergunta nova será liberada enquanto a sessão estiver pausada.
          </p>
        </div>
      )}

      {/* -------------------------------------------------------------
          PASSO 14 & 15: FINAL DO QUIZ & RANKING FINAL
      ------------------------------------------------------------- */}
      {(sala.status === 'encerrado' || sala.status === 'concluido') && (
        <div className="bg-slate-900/90 border border-white/15 rounded-3xl p-6 sm:p-8 text-white text-center space-y-6 shadow-2xl backdrop-blur-xl animate-fadeIn">
          
          <div className="w-20 h-20 bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 rounded-3xl flex items-center justify-center mx-auto shadow-2xl border-2 border-amber-300">
            <Trophy className="w-10 h-10" />
          </div>

          <div>
            <h2 className="text-2xl font-black text-white">Quiz Encerrado!</h2>
            <p className="text-xs text-slate-300 mt-1">Você terminou todas as perguntas do treinamento.</p>
          </div>

          {/* Resumo Individual de Desempenho */}
          {resultadoAvaliacao ? (
            <div className="space-y-4 text-left">
              <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Pontuação</span>
                  <span className="text-lg font-black text-amber-400">🏆 {participante?.pontuacao_acumulada || 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Acertos</span>
                  <span className="text-lg font-black text-emerald-400">{resultadoAvaliacao.acertos} / {resultadoAvaliacao.total_perguntas}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Aproveitamento</span>
                  <span className="text-lg font-black text-blue-400">{((resultadoAvaliacao.acertos / (resultadoAvaliacao.total_perguntas || 1))*100).toFixed(0)}%</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Posição</span>
                  <span className="text-lg font-black text-purple-400">{posicaoUsuario}º Lugar</span>
                </div>
              </div>

              {onVerFichaCompleta && (
                <button
                  onClick={() => participante && onVerFichaCompleta(participante.id)}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 rounded-2xl text-xs flex items-center justify-center space-x-2 shadow-lg transition-transform transform active:scale-98"
                >
                  <FileText className="w-4 h-4" />
                  <span>Ver Ficha Oficial de Avaliação & Imprimir Certificado</span>
                </button>
              )}
            </div>
          ) : (
            <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 text-xs font-bold text-slate-300">
              Sua pontuação total acumulada: <strong className="text-amber-400">{participante?.pontuacao_acumulada || 0} pontos</strong> ({posicaoUsuario}º lugar na turma)
            </div>
          )}

          {/* Ranking Final da Turma */}
          <div className="space-y-3 text-left border-t border-white/10 pt-4">
            <h3 className="font-extrabold text-sm text-white flex items-center space-x-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Resultado Final da Turma</span>
            </h3>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {rankingParticipantes.map((p, idx) => {
                const medalhas = ['🥇', '🥈', '🥉'];
                const eVoce = participante ? p.id === participante.id : false;

                return (
                  <div
                    key={p.id}
                    className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
                      eVoce ? 'bg-amber-500/20 border-amber-500/50 font-black' : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-slate-400 w-5">
                        {idx < 3 ? medalhas[idx] : `${idx + 1}º`}
                      </span>
                      <span className="font-bold">{p.nome} {eVoce && '(Você)'}</span>
                    </div>

                    <span className="font-mono font-black text-amber-400">
                      {p.pontuacao_acumulada || 0} pts
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};
