import React, { useState, useEffect } from 'react';
import { formatAlternativaText } from '../../../utils/questionHelpers';
import { SalaQuizGuiado, EstadoApresentacaoQuiz } from '../../../types';
import { QRCodeSvg } from './QRCodeSvg';
import { 
  Trophy, 
  Users, 
  Sparkles, 
  Clock, 
  CheckCircle2, 
  QrCode, 
  Flame,
  ArrowUp,
  Award,
  Zap,
  Volume2,
  VolumeX,
  Maximize2,
  Play,
  Pause,
  SkipForward,
  Eye,
  Square,
  RotateCcw,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';

interface TelaApresentacaoViewProps {
  sala: SalaQuizGuiado;
  onFechar?: () => void;
  onIniciarQuiz?: () => void;
  onPausarQuiz?: () => void;
  onRetomarQuiz?: () => void;
  onRevelarResposta?: () => void;
  onExibirRanking?: () => void;
  onProximaPergunta?: () => void;
  onEncerrarQuiz?: () => void;
  onReiniciarSala?: () => void;
}

export const TelaApresentacaoView: React.FC<TelaApresentacaoViewProps> = ({ 
  sala, 
  onFechar,
  onIniciarQuiz,
  onPausarQuiz,
  onRetomarQuiz,
  onRevelarResposta,
  onExibirRanking,
  onProximaPergunta,
  onEncerrarQuiz,
  onReiniciarSala
}) => {
  const tempoLimiteSeg = sala.tempo_por_pergunta_seg !== undefined
    ? Number(sala.tempo_por_pergunta_seg)
    : (sala.tempo_por_pergunta !== undefined ? Number(sala.tempo_por_pergunta) : 30);
  const [tempoRestante, setTempoRestante] = useState<number>(tempoLimiteSeg);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [showConfirmReset, setShowConfirmReset] = useState<boolean>(false);

  // Pergunta e opções atuais
  const perguntaAtual = sala.perguntas[sala.pergunta_atual_index];
  const opcoesAtual = perguntaAtual
    ? (perguntaAtual.alternativas || (perguntaAtual as any).opcoes || [])
    : [];

  const estadoApresentacao: EstadoApresentacaoQuiz = sala.estado_apresentacao || 
    (sala.status === 'aguardando' ? 'AGUARDANDO' : 
     sala.status === 'concluido' ? 'CONCLUIDO' : 
     sala.revelar_resposta_atual ? 'ANSWER_REVEALED' : 
     sala.mostrar_ranking ? 'RANKING_SHOWN' : 'QUESTION_ACTIVE');

  // Timer de pergunta sincronizado com o servidor com auto-revelação (apenas se houver limite de tempo)
  useEffect(() => {
    if (estadoApresentacao !== 'QUESTION_ACTIVE' || tempoLimiteSeg === 0) {
      setTempoRestante(tempoLimiteSeg);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const startedAt = sala.question_started_at || now;
      const endsAt = sala.question_ends_at || (startedAt + tempoLimiteSeg * 1000);

      const remSecs = Math.max(0, Math.ceil((endsAt - now) / 1000));
      setTempoRestante(remSecs);

      if (remSecs <= 0) {
        clearInterval(interval);
        if (onRevelarResposta) {
          onRevelarResposta();
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [estadoApresentacao, sala.question_started_at, sala.question_ends_at, tempoLimiteSeg, onRevelarResposta]);

  // Atalhos de teclado para o instrutor comandar a apresentação sem mouse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (estadoApresentacao === 'AGUARDANDO' && onIniciarQuiz) onIniciarQuiz();
        else if (estadoApresentacao === 'QUESTION_ACTIVE' && onRevelarResposta) onRevelarResposta();
        else if (estadoApresentacao === 'ANSWER_REVEALED' && onExibirRanking) onExibirRanking();
        else if (estadoApresentacao === 'RANKING_SHOWN' && onProximaPergunta) onProximaPergunta();
      } else if (e.key === 'r' || e.key === 'R') {
        if (onRevelarResposta) onRevelarResposta();
      } else if (e.key === 'p' || e.key === 'P') {
        if (onExibirRanking) onExibirRanking();
      } else if (e.key === 'n' || e.key === 'N') {
        if (onProximaPergunta) onProximaPergunta();
      } else if (e.key === 'Escape') {
        if (onFechar) onFechar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [estadoApresentacao, onIniciarQuiz, onRevelarResposta, onExibirRanking, onProximaPergunta, onFechar]);

  // Contadores de respostas da pergunta atual
  const totalParticipantes = (sala.participantes || []).length;
  const responderamCount = (sala.participantes || []).filter(
    p => p.respostas && perguntaAtual && p.respostas[perguntaAtual.id] !== undefined
  ).length;

  // Ranking ordenado
  const ranking = [...(sala.participantes || [])].sort(
    (a, b) => (b.pontuacao_acumulada || 0) - (a.pontuacao_acumulada || 0)
  );

  // Detecta ultrapassagens recentes (subiu de posição)
  const ultrapassagens = (sala.participantes || [])
    .filter(p => p.posicao_anterior && p.posicao_atual && p.posicao_atual < p.posicao_anterior)
    .map(p => ({
      nome: p.nome,
      anterior: p.posicao_anterior!,
      atual: p.posicao_atual!,
      ganho: p.posicao_anterior! - p.posicao_atual!,
    }))
    .sort((a, b) => b.ganho - a.ganho);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.log(err));
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.log(err));
      }
    }
  };

  return (
    <div id="tela-apresentacao-container" className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between p-6 sm:p-10 select-none overflow-hidden font-sans">
      
      {/* BACKGROUND EFFECTS */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-64 bg-cyan-500/10 blur-[140px] pointer-events-none rounded-full" />

      {/* HEADER DA TRANSMISSÃO */}
      <header className="relative z-10 flex items-center justify-between border-b border-white/10 pb-4">
        <div className="flex items-center space-x-4">
          <div className="bg-gradient-to-tr from-amber-500 to-amber-300 p-3 rounded-2xl shadow-lg text-slate-950 font-black flex items-center justify-center border border-amber-200">
            <Zap className="w-6 h-6 text-slate-950 fill-slate-950" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-black text-amber-400 tracking-tight">SST QUIZ LIVE</span>
              <span className="bg-emerald-500/20 text-emerald-400 text-xs font-black px-2.5 py-0.5 rounded-full border border-emerald-500/40 flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>AO VIVO</span>
              </span>
            </div>
            <h1 className="text-sm font-bold text-slate-300 line-clamp-1">{sala.treinamento_titulo || sala.nome}</h1>
          </div>
        </div>

        {/* CONTROLES DE MÍDIA / TELA CHEIA */}
        <div className="flex items-center space-x-3">
          <div className="hidden sm:flex items-center space-x-2 bg-slate-900/80 px-4 py-2 rounded-2xl border border-white/10 text-xs font-bold text-slate-300">
            <Users className="w-4 h-4 text-cyan-400" />
            <span>{totalParticipantes} Participante{totalParticipantes !== 1 ? 's' : ''}</span>
          </div>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-3 bg-slate-900/80 hover:bg-slate-800 border border-white/10 rounded-2xl text-slate-300 transition-colors"
            title="Alternar áudio da apresentação"
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 text-amber-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
          </button>

          <button
            onClick={toggleFullScreen}
            className="p-3 bg-slate-900/80 hover:bg-slate-800 border border-white/10 rounded-2xl text-slate-300 transition-colors"
            title="Tela Cheia (Datashow/TV)"
          >
            <Maximize2 className="w-5 h-5 text-cyan-400" />
          </button>

          {onFechar && (
            <button
              onClick={onFechar}
              className="px-4 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 rounded-2xl text-xs font-bold transition-all"
            >
              Sair da Apresentação
            </button>
          )}
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL VARYING BY STATE */}
      <main className="relative z-10 my-auto py-6 flex-1 flex flex-col justify-center">

        {/* -------------------------------------------------------------
            ESTADO 1: AGUARDANDO PARTICIPANTES (LOBBY DE ENTRADA)
        ------------------------------------------------------------- */}
        {estadoApresentacao === 'AGUARDANDO' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center max-w-7xl mx-auto w-full">
            {/* Bloco de Entrada QR Code + PIN */}
            <div className="lg:col-span-6 bg-slate-900/80 border border-white/15 rounded-3xl p-8 text-center space-y-6 shadow-2xl backdrop-blur-xl">
              <div>
                <span className="text-xs font-black uppercase text-amber-400 tracking-widest block mb-1">
                  ENTRE NO QUIZ COMPETITIVO SST
                </span>
                <h2 className="text-3xl font-black text-white">Escaneie o QR Code ou digite o PIN</h2>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                {/* QR Code */}
                <div className="flex flex-col items-center">
                  <QRCodeSvg 
                    value={sala.pin} 
                    size={200} 
                    showPinLabel={false}
                    className="border-4 border-amber-400"
                  />
                  <span className="text-[10px] font-black text-amber-400 block mt-2 uppercase tracking-wider bg-slate-950/80 px-3 py-1 rounded-full border border-amber-400/40">
                    Aponte a Câmera
                  </span>
                </div>

                {/* PIN em destaque */}
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block">Código PIN da Sala</span>
                  <div className="bg-slate-950 border-2 border-amber-400/80 rounded-2xl px-6 py-4 text-4xl sm:text-5xl font-black font-mono text-amber-400 tracking-widest shadow-inner">
                    {sala.pin}
                  </div>
                  <p className="text-xs text-slate-400 max-w-xs">
                    Acesse o app SST Quiz ou leia o código QR ao lado para participar instantaneamente.
                  </p>
                </div>
              </div>
            </div>

            {/* Painel de Participantes Conectados em Tempo Real */}
            <div className="lg:col-span-6 bg-slate-900/80 border border-white/15 rounded-3xl p-8 space-y-5 shadow-2xl backdrop-blur-xl max-h-[500px] flex flex-col">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-extrabold text-lg text-white flex items-center space-x-2">
                  <Users className="w-5 h-5 text-emerald-400" />
                  <span>Participantes Conectados</span>
                </h3>
                <span className="text-sm font-black text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-xl border border-emerald-500/30">
                  {totalParticipantes} Conectado{totalParticipantes !== 1 ? 's' : ''}
                </span>
              </div>

              {totalParticipantes ===0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3 text-slate-400">
                  <Sparkles className="w-10 h-10 text-amber-400/60 animate-pulse" />
                  <p className="text-sm font-semibold">Aguardando participantes lerem o QR Code ou digitarem o PIN...</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto pr-2 flex flex-wrap gap-2.5 content-start">
                  {sala.participantes.map((p) => (
                    <div
                      key={p.id}
                      className="bg-slate-950/80 border border-emerald-500/30 text-emerald-200 px-4 py-2 rounded-2xl text-sm font-bold flex items-center space-x-2 shadow-md animate-fadeIn"
                    >
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>{p.nome}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            ESTADO 2 & 3: PERGUNTA ATIVA OU TEMPO ENCERRADO
        ------------------------------------------------------------- */}
        {(estadoApresentacao === 'QUESTION_ACTIVE' || estadoApresentacao === 'QUESTION_ENDED') && perguntaAtual && (
          <div className="relative max-w-6xl mx-auto w-full space-y-8 animate-fadeIn">
            
            {/* Top Bar da Pergunta + Contador de Tempo */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black px-4 py-1.5 rounded-2xl uppercase tracking-wider">
                  Pergunta {sala.pergunta_atual_index + 1} de {sala.perguntas.length}
                </span>
                {perguntaAtual.norma_relacionada && (
                  <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-black px-3 py-1.5 rounded-2xl">
                    {perguntaAtual.norma_relacionada}
                  </span>
                )}
              </div>

              {/* CLOCK TIMER OU BADGE DE AVANÇO MANUAL */}
              {tempoLimiteSeg > 0 ? (
                <div className={`flex items-center space-x-3 px-6 py-2.5 rounded-2xl border transition-all ${
                  tempoRestante <= 5 
                    ? 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-pulse scale-105' 
                    : 'bg-slate-900/90 border-white/15 text-amber-400'
                }`}>
                  <Clock className="w-6 h-6" />
                  <span className="text-3xl font-black font-mono tracking-widest">{tempoRestante}s</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2.5 px-5 py-2.5 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 font-bold text-sm shadow-lg">
                  <Clock className="w-5 h-5 text-indigo-400" />
                  <span>Avanço Manual (Sem Limite de Tempo)</span>
                </div>
              )}
            </div>

            {/* ENUNCIADO EM TAMANHO GRANDE DE DATASHOW */}
            <div className="bg-slate-900/90 border border-white/15 rounded-3xl p-8 sm:p-10 shadow-2xl backdrop-blur-xl text-center space-y-4">
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight">
                {perguntaAtual.enunciado}
              </h2>
              {perguntaAtual.imagem_url && (
                <img src={perguntaAtual.imagem_url} alt="Imagem da pergunta" className="max-h-64 mx-auto rounded-2xl border border-white/20 object-contain shadow-lg" />
              )}
            </div>

            {/* OPCÕES A, B, C, D (Sem revelar gabarito nesta fase) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {opcoesAtual.map((opcaoTexto, idx) => {
                const letras = ['A', 'B', 'C', 'D'];
                const cores = [
                  'from-rose-500/20 to-rose-600/10 border-rose-500/30 text-rose-200',
                  'from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-200',
                  'from-amber-500/20 to-amber-600/10 border-amber-500/30 text-amber-200',
                  'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-200',
                ];

                return (
                  <div
                    key={idx}
                    className={`bg-gradient-to-br ${cores[idx % 4]} border-2 rounded-3xl p-6 flex items-center space-x-4 shadow-xl text-left transition-all`}
                  >
                    <span className="w-12 h-12 rounded-2xl bg-white/10 border border-white/20 font-black text-xl flex items-center justify-center shrink-0 text-white">
                      {letras[idx]}
                    </span>
                    <span className="text-base sm:text-lg font-extrabold leading-snug">{formatAlternativaText(opcaoTexto)}</span>
                  </div>
                );
              })}
            </div>

            {/* STATUS DE RESPOSTAS RECEBIDAS EM TEMPO REAL */}
            <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-4 flex items-center justify-between text-xs sm:text-sm font-bold text-slate-300">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <span>Respostas enviadas: <strong className="text-white font-mono text-base">{responderamCount} / {totalParticipantes}</strong></span>
              </div>
              <div className="w-48 bg-slate-800 rounded-full h-3 overflow-hidden border border-white/10">
                <div 
                  className="bg-emerald-400 h-full transition-all duration-300" 
                  style={{ width: `${totalParticipantes > 0 ? (responderamCount / totalParticipantes) * 100 : 0}%` }}
                />
              </div>
            </div>

            {estadoApresentacao === 'QUESTION_ENDED' && (
              <div className="bg-rose-500/20 border border-rose-500/40 p-4 rounded-2xl text-center text-rose-200 font-black text-base animate-pulse">
                ⏱️ TEMPO ENCERRADO! Aguarde o instrutor revelar a resposta oficial.
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------------------
            ESTADO 4: ANSWER_REVEALED (GABARITO + DISTRIBUIÇÃO DAS RESPOSTAS)
        ------------------------------------------------------------- */}
        {estadoApresentacao === 'ANSWER_REVEALED' && perguntaAtual && (
          <div className="max-w-6xl mx-auto w-full space-y-6 animate-fadeIn">
            
            <div className="text-center space-y-2">
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black px-4 py-1 rounded-full uppercase tracking-wider">
                GABARITO OFICIAL REVELADO
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white">{perguntaAtual.enunciado}</h2>
            </div>

            {/* BARRAS PERCENTUAIS DAS RESPOSTAS DA TURMA */}
            <div className="space-y-3 bg-slate-900/90 border border-white/15 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-400 mb-2">
                📊 Respostas da Turma
              </h3>

              {opcoesAtual.map((opcaoTexto, idx) => {
                const totalRespostas = (sala.participantes || []).filter(
                  p => p.respostas && p.respostas[perguntaAtual.id] !== undefined
                ).length;
                const qtd = (sala.participantes || []).filter(
                  p => p.respostas && p.respostas[perguntaAtual.id]?.resposta_index === idx
                ).length;
                const pct = totalRespostas > 0 ? Math.round((qtd / totalRespostas) * 100) : 0;
                const eCorreta = idx === perguntaAtual.resposta_correta;
                const letras = ['A', 'B', 'C', 'D'];

                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border-2 transition-all space-y-2 ${
                      eCorreta
                        ? 'bg-emerald-500/20 border-emerald-500/80 ring-2 ring-emerald-400'
                        : 'bg-slate-950/60 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between text-sm sm:text-base font-bold">
                      <div className="flex items-center space-x-3">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center font-black ${
                          eCorreta ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {letras[idx]}
                        </span>
                        <span className={eCorreta ? 'text-emerald-300 font-black' : 'text-slate-200'}>
                          {opcaoTexto}
                        </span>
                        {eCorreta && (
                          <span className="bg-emerald-500 text-slate-950 text-xs font-black px-2.5 py-0.5 rounded-lg flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>CORRETA</span>
                          </span>
                        )}
                      </div>

                      <span className="font-mono text-base font-black text-white">{pct}% ({qtd})</span>
                    </div>

                    <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-white/10">
                      <div
                        className={`h-full transition-all duration-700 ${eCorreta ? 'bg-emerald-400' : 'bg-blue-500/60'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* FUNDAMENTAÇÃO TÉCNICA SST */}
            {perguntaAtual.explicacao && (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-3xl p-6 text-sm text-purple-200 space-y-2 backdrop-blur-xl">
                <strong className="text-purple-300 font-extrabold flex items-center space-x-2 text-base">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                  <span>Fundamentação Técnica SST / Norma Regulamentadora:</span>
                </strong>
                <p className="leading-relaxed text-purple-100 font-medium">{perguntaAtual.explicacao}</p>
              </div>
            )}
          </div>
        )}

        {/* -------------------------------------------------------------
            ESTADO 5: RANKING_SHOWN (TOP 10 LEADERBOARD + ULTRAPASSAGENS)
        ------------------------------------------------------------- */}
        {estadoApresentacao === 'RANKING_SHOWN' && (
          <div className="max-w-5xl mx-auto w-full space-y-6 animate-fadeIn">
            
            <div className="text-center space-y-1">
              <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black px-4 py-1 rounded-full uppercase tracking-wider flex items-center justify-center space-x-1.5 w-fit mx-auto">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>RANKING PARCIAL DA COMPETIÇÃO</span>
              </span>
              <h2 className="text-3xl font-black text-white">Top 10 Participantes</h2>
            </div>

            {/* ALERTA DE ULTRAPASSAGENS RECENTES */}
            {ultrapassagens.length > 0 && (
              <div className="bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 border-2 border-amber-500/50 p-4 rounded-3xl space-y-2 animate-bounce shadow-xl">
                <div className="flex items-center space-x-2 text-amber-300 font-black text-sm">
                  <Flame className="w-5 h-5 text-amber-400 fill-amber-400" />
                  <span>🔥 DESTAQUES DA RODADA: ULTRAPASSAGENS!</span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-extrabold">
                  {ultrapassagens.slice(0, 3).map((u, i) => (
                    <span key={i} className="bg-slate-950/80 px-3 py-1 rounded-xl text-white border border-amber-400/40 flex items-center space-x-1">
                      <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                      <strong className="text-amber-400">{u.nome}</strong>
                      <span>subiu para <strong className="text-emerald-300">{u.atual}º lugar</strong> (+{u.ganho})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* LISTA TOP 10 LEADERBOARD */}
            <div className="bg-slate-900/90 border border-white/15 rounded-3xl p-6 shadow-2xl backdrop-blur-xl space-y-3 max-h-[500px] overflow-y-auto">
              {ranking.slice(0, 10).map((p, idx) => {
                const medalhas = ['🥇', '🥈', '🥉'];
                const coresRank = [
                  'bg-gradient-to-r from-amber-500/30 to-amber-600/10 border-amber-500/60 ring-2 ring-amber-400 text-amber-200',
                  'bg-gradient-to-r from-slate-300/20 to-slate-400/10 border-slate-300/40 text-slate-200',
                  'bg-gradient-to-r from-amber-700/20 to-amber-800/10 border-amber-700/40 text-amber-300',
                  'bg-slate-950/60 border-white/10 text-slate-200',
                ];

                const posAnterior = p.posicao_anterior || (idx + 1);
                const subiu = posAnterior > (idx + 1);

                return (
                  <div
                    key={p.id}
                    className={`p-4 rounded-2xl border-2 flex items-center justify-between text-base font-bold shadow-md transition-all ${
                      idx < 3 ? coresRank[idx] : coresRank[3]
                    }`}
                  >
                    <div className="flex items-center space-x-4">
                      <span className="w-10 text-center font-mono text-2xl font-black">
                        {idx < 3 ? medalhas[idx] : `${idx + 1}º`}
                      </span>
                      <div>
                        <span className="text-lg font-extrabold text-white">{p.nome}</span>
                        {p.cpf_ou_empresa && (
                          <span className="text-xs text-slate-400 block">{p.cpf_ou_empresa}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      {subiu && (
                        <span className="text-xs font-black text-emerald-400 bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/40 flex items-center space-x-1">
                          <ArrowUp className="w-3.5 h-3.5" />
                          <span>Subiu!</span>
                        </span>
                      )}
                      <span className="font-mono font-black text-2xl text-amber-400">
                        {p.pontuacao_acumulada || 0} <span className="text-xs text-slate-400 font-bold">pts</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------
            ESTADO 6: CONCLUIDO (PÓDIO FINAL + FESTA DOS VENCEDORES)
        ------------------------------------------------------------- */}
        {estadoApresentacao === 'CONCLUIDO' && (
          <div className="max-w-5xl mx-auto w-full space-y-8 text-center animate-fadeIn">
            
            <div className="space-y-2">
              <div className="w-24 h-24 bg-gradient-to-tr from-amber-500 to-amber-300 rounded-3xl flex items-center justify-center mx-auto shadow-2xl border-4 border-amber-200 text-slate-950">
                <Trophy className="w-12 h-12" />
              </div>
              <h2 className="text-4xl font-black text-white">Grande Final do Quiz SST!</h2>
              <p className="text-sm font-semibold text-amber-400">Parabéns aos vencedores da competição!</p>
            </div>

            {/* PÓDIO DOS 3 PRIMEIRA COLOCADOS */}
            <div className="grid grid-cols-3 gap-4 items-end max-w-2xl mx-auto pt-6">
              {/* 2º LUGAR */}
              {ranking[1] && (
                <div className="bg-slate-900/90 border border-slate-400/40 rounded-3xl p-6 text-center space-y-2 h-48 flex flex-col justify-end shadow-xl">
                  <span className="text-3xl">🥈</span>
                  <span className="text-xs font-black uppercase text-slate-300 block">2º Lugar</span>
                  <strong className="text-sm font-extrabold text-white block line-clamp-1">{ranking[1].nome}</strong>
                  <span className="font-mono text-amber-400 font-black text-sm">{ranking[1].pontuacao_acumulada || 0} pts</span>
                </div>
              )}

              {/* 1º LUGAR (MAIOR) */}
              {ranking[0] && (
                <div className="bg-gradient-to-b from-amber-500/30 to-amber-600/10 border-2 border-amber-400 rounded-3xl p-6 text-center space-y-2 h-60 flex flex-col justify-end shadow-2xl ring-4 ring-amber-400/50">
                  <span className="text-5xl">🥇</span>
                  <span className="text-xs font-black uppercase text-amber-300 block">CAMPEÃO</span>
                  <strong className="text-base font-black text-white block line-clamp-1">{ranking[0].nome}</strong>
                  <span className="font-mono text-amber-300 font-black text-lg">{ranking[0].pontuacao_acumulada || 0} pts</span>
                </div>
              )}

              {/* 3º LUGAR */}
              {ranking[2] && (
                <div className="bg-slate-900/90 border border-amber-700/40 rounded-3xl p-6 text-center space-y-2 h-40 flex flex-col justify-end shadow-xl">
                  <span className="text-3xl">🥉</span>
                  <span className="text-xs font-black uppercase text-amber-600 block">3º Lugar</span>
                  <strong className="text-xs font-extrabold text-white block line-clamp-1">{ranking[2].nome}</strong>
                  <span className="font-mono text-amber-400 font-black text-xs">{ranking[2].pontuacao_acumulada || 0} pts</span>
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* BARRA FLUTUANTE DE COMANDOS DO INSTRUTOR NO MODO APRESENTAÇÃO */}
      <div className="relative z-20 my-2 flex justify-center">
        <div className="bg-slate-900/95 border border-white/20 p-2.5 rounded-3xl shadow-2xl backdrop-blur-2xl flex items-center space-x-3 max-w-full overflow-x-auto">
          
          {/* BOTÃO INICIAR QUIZ (LOBBY) */}
          {estadoApresentacao === 'AGUARDANDO' && onIniciarQuiz && (
            <button
              onClick={onIniciarQuiz}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-6 py-2.5 rounded-2xl font-black text-sm flex items-center space-x-2 shadow-lg transition-all animate-pulse"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>INICIAR QUIZ AGORA (Barra Espaço)</span>
            </button>
          )}

          {/* BOTÃO REVELAR RESPOSTA */}
          {(estadoApresentacao === 'QUESTION_ACTIVE' || estadoApresentacao === 'QUESTION_ENDED') && onRevelarResposta && (
            <button
              onClick={onRevelarResposta}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 px-5 py-2 rounded-2xl font-black text-xs sm:text-sm flex items-center space-x-2 shadow-lg transition-all"
            >
              <Eye className="w-4 h-4" />
              <span>Revelar Gabarito [Espaço / R]</span>
            </button>
          )}

          {/* BOTÃO EXIBIR RANKING TOP 10 */}
          {estadoApresentacao === 'ANSWER_REVEALED' && onExibirRanking && (
            <button
              onClick={onExibirRanking}
              className="bg-indigo-500 hover:bg-indigo-400 text-white px-5 py-2 rounded-2xl font-black text-xs sm:text-sm flex items-center space-x-2 shadow-lg transition-all"
            >
              <Trophy className="w-4 h-4 text-amber-300" />
              <span>Ver Ranking Top 10 [Espaço / P]</span>
            </button>
          )}

          {/* BOTÃO PRÓXIMA PERGUNTA OU ENCERRAR */}
          {(estadoApresentacao === 'RANKING_SHOWN' || estadoApresentacao === 'ANSWER_REVEALED') && (
            sala.pergunta_atual_index < (sala.perguntas?.length || 0) - 1 ? (
              onProximaPergunta && (
                <button
                  onClick={onProximaPergunta}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-5 py-2 rounded-2xl font-black text-xs sm:text-sm flex items-center space-x-2 shadow-lg transition-all"
                >
                  <SkipForward className="w-4 h-4 fill-slate-950" />
                  <span>Próxima Pergunta [Espaço / N]</span>
                </button>
              )
            ) : (
              onEncerrarQuiz && (
                <button
                  onClick={onEncerrarQuiz}
                  className="bg-rose-500 hover:bg-rose-400 text-white px-5 py-2 rounded-2xl font-black text-xs sm:text-sm flex items-center space-x-2 shadow-lg transition-all"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Encerrar Quiz & Ver Campeão</span>
                </button>
              )
            )
          )}

          {/* PAUSAR / RETOMAR */}
          {sala.status === 'em_andamento' && onPausarQuiz && (
            <button
              onClick={onPausarQuiz}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-2xl font-bold text-xs flex items-center space-x-1.5 border border-white/10"
              title="Pausar Temporizador"
            >
              <Pause className="w-4 h-4 text-amber-400" />
              <span className="hidden md:inline">Pausar</span>
            </button>
          )}

          {sala.status === 'pausado' && onRetomarQuiz && (
            <button
              onClick={onRetomarQuiz}
              className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-3 py-2 rounded-2xl font-bold text-xs flex items-center space-x-1.5 border border-emerald-500/40"
              title="Retomar Quiz"
            >
              <Play className="w-4 h-4 text-emerald-400" />
              <span className="hidden md:inline">Retomar</span>
            </button>
          )}

          {/* BOTÃO REINICIAR SALA COM NOVO PIN */}
          {onReiniciarSala && (
            <button
              onClick={() => setShowConfirmReset(true)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-2xl font-bold text-xs flex items-center space-x-1.5 border border-white/10"
              title="Reiniciar Sala (Gera Novo PIN & Zera Participantes)"
            >
              <RotateCcw className="w-4 h-4 text-cyan-400" />
              <span className="hidden md:inline">Reiniciar Sala</span>
            </button>
          )}

        </div>
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE REINÍCIO DA SALA DENTRO DA APRESENTAÇÃO */}
      {showConfirmReset && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-amber-400/80 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-black text-white">Reiniciar Sala do Quiz?</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              O histórico atual será preservado e um <strong>NOVO PIN / QR CODE</strong> será gerado. A lista de participantes ativos será limpa para uma nova turma.
            </p>
            <div className="flex items-center justify-center space-x-3 pt-2">
              <button
                onClick={() => setShowConfirmReset(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowConfirmReset(false);
                  if (onReiniciarSala) onReiniciarSala();
                }}
                className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-black rounded-xl shadow-lg"
              >
                Sim, Gerar Novo PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER TRANSMISSÃO DA SALA */}
      <footer className="relative z-10 flex items-center justify-between border-t border-white/10 pt-4 text-xs font-bold text-slate-400">
        <div>
          <span>Instrutor: <strong className="text-white">{sala.instrutor_nome}</strong></span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-[11px] text-slate-500 hidden sm:inline">Teclas: [Espaço] Avançar • [P] Ranking • [Esc] Sair</span>
          <span>PIN: <strong className="text-amber-400 font-mono text-sm">{sala.pin}</strong></span>
        </div>
      </footer>

    </div>
  );
};
