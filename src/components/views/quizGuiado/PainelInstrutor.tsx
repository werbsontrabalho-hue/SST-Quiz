import React, { useState, useEffect } from 'react';
import { formatAlternativaText } from '../../../utils/questionHelpers';
import { useSST } from '../../../context/SSTContext';
import { SalaQuizGuiado, EstadoApresentacaoQuiz } from '../../../types';
import { getPublicBaseUrl } from '../../../lib/publicBaseUrl';
import { QRCodeSvg } from './QRCodeSvg';
import { TelaApresentacaoView } from './TelaApresentacaoView';
import { 
  Play, 
  Pause, 
  SkipForward, 
  Square, 
  Tv, 
  Users, 
  Clock, 
  Award, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Copy, 
  Check, 
  QrCode, 
  Maximize2, 
  Minimize2, 
  Trophy, 
  BarChart2, 
  Sparkles, 
  ArrowLeft,
  FileText,
  RotateCcw,
  Link as LinkIcon
} from 'lucide-react';

interface PainelInstrutorProps {
  sala: SalaQuizGuiado;
  onVoltar: () => void;
  onVerRelatorio?: (participanteId: string) => void;
}

export const PainelInstrutor: React.FC<PainelInstrutorProps> = ({
  sala,
  onVoltar,
  onVerRelatorio
}) => {
  const {
    iniciarQuizGuiado,
    pausarQuizGuiado,
    retomarQuizGuiado,
    encerrarSalaQuizGuiado,
    revelarRespostaAtualQuizGuiado,
    exibirRanqueQuizGuiado,
    avancarPerguntaQuizGuiado,
    reiniciarSalaQuizGuiado,
    resultadosAvaliacaoSST
  } = useSST();

  const [showApresentacao, setShowApresentacao] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showConfirmEncerrar, setShowConfirmEncerrar] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const tempoLimiteSeg = sala.tempo_por_pergunta_seg !== undefined
    ? Number(sala.tempo_por_pergunta_seg)
    : (sala.tempo_por_pergunta !== undefined ? Number(sala.tempo_por_pergunta) : 30);
  const [tempoRestante, setTempoRestante] = useState<number>(tempoLimiteSeg);

  const estadoApresentacao: EstadoApresentacaoQuiz = sala.estado_apresentacao || 
    (sala.status === 'aguardando' ? 'AGUARDANDO' : 
     sala.status === 'concluido' ? 'CONCLUIDO' : 
     sala.revelar_resposta_atual ? 'ANSWER_REVEALED' : 
     sala.mostrar_ranking ? 'RANKING_SHOWN' : 'QUESTION_ACTIVE');

  // Arrays com fallbacks seguros
  const participantes = sala.participantes || [];
  const perguntas = sala.perguntas || [];

  // Pergunta atual
  const perguntaAtual = perguntas[sala.pergunta_atual_index];
  const totalPerguntas = perguntas.length;
  const opcoesPerguntaAtual = perguntaAtual ? (perguntaAtual.alternativas || (perguntaAtual as any).opcoes || []) : [];

  // Respostas da pergunta atual
  const respostasPerguntaAtual = participantes.map(p => {
    let resp: any = undefined;
    if (p.respostas && perguntaAtual) {
      if (Array.isArray(p.respostas)) {
        resp = p.respostas.find((r: any) => r.pergunta_id === perguntaAtual.id);
      } else {
        resp = p.respostas[perguntaAtual.id];
      }
    }
    return { participante: p, resposta: resp };
  });

  const totalRespondidos = respostasPerguntaAtual.filter(r => r.resposta !== undefined).length;
  const totalParticipantes = participantes.length;

  // Distribuição de respostas por opção para todas as alternativas da pergunta
  const distribuicaoRespostas = opcoesPerguntaAtual.map((_, optIdx) => {
    const count = respostasPerguntaAtual.filter(r => r.resposta?.resposta_index === optIdx).length;
    const pct = totalRespondidos > 0 ? Math.round((count / totalRespondidos) * 100) : 0;
    return { optIdx, count, pct };
  });

  // Temporizador em tempo real sincronizado com o carimbo de data/hora da sala (Server Timestamps)
  useEffect(() => {
    if (sala.status !== 'em_andamento' || tempoLimiteSeg === 0) {
      setTempoRestante(tempoLimiteSeg);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const startedAt = sala.question_started_at || now;
      const endsAt = sala.question_ends_at || (startedAt + tempoLimiteSeg * 1000);

      const remSecs = Math.max(0, Math.ceil((endsAt - now) / 1000));
      setTempoRestante(remSecs);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 100);

    return () => clearInterval(interval);
  }, [sala.status, sala.question_started_at, sala.question_ends_at, tempoLimiteSeg, sala.pergunta_atual_index]);

  // Copia o PIN para a área de transferência
  const handleCopyPin = () => {
    navigator.clipboard.writeText(sala.pin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 2000);
  };

  // Copia o link direto de entrada para a área de transferência
  const handleCopyLink = async () => {
    try {
      const baseUrl = await getPublicBaseUrl();
      const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
      const cleanOrigin = origin.replace(/\/+$/, '');
      const link = `${cleanOrigin}/?pin=${sala.pin}`;
      await navigator.clipboard.writeText(link);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.warn('Erro ao copiar link:', err);
    }
  };

  // Ranking ordenado de participantes
  const rankingParticipantes = [...sala.participantes].sort((a, b) => (b.pontuacao_acumulada || 0) - (a.pontuacao_acumulada || 0));

  // Resultados das avaliações gerados após encerramento
  // CORREÇÃO (auditoria Quiz Guiado/Avaliação): filtra pela SESSÃO atual
  // (sessao_id) para não misturar avaliações de sessões anteriores da mesma
  // sala (reinício mantém o mesmo sala.id). Resultados antigos sem sessao_id
  // só aparecem se a sala não tiver sessão ativa definida.
  const resultadosDaSala = resultadosAvaliacaoSST.filter(r =>
    r.sala_id === sala.id &&
    (!sala.sessao_id || !r.sessao_id || r.sessao_id === sala.sessao_id)
  );

  if (showApresentacao) {
    return (
      <TelaApresentacaoView 
        sala={sala} 
        onFechar={() => setShowApresentacao(false)} 
        onIniciarQuiz={() => iniciarQuizGuiado(sala.id)}
        onPausarQuiz={() => pausarQuizGuiado(sala.id)}
        onRetomarQuiz={() => retomarQuizGuiado(sala.id)}
        onRevelarResposta={() => revelarRespostaAtualQuizGuiado(sala.id)}
        onExibirRanking={() => exibirRanqueQuizGuiado(sala.id)}
        onProximaPergunta={() => avancarPerguntaQuizGuiado(sala.id)}
        onEncerrarQuiz={() => encerrarSalaQuizGuiado(sala.id)}
        onReiniciarSala={() => reiniciarSalaQuizGuiado(sala.id)}
      />
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Barra de Controle Superior do Instrutor */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-white/15 rounded-3xl p-5 text-white shadow-2xl flex items-center justify-between flex-wrap gap-4">
        
        {/* Lado Esquerdo: Título e Status */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onVoltar}
            className="p-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-2xl border border-white/10 transition-all flex items-center space-x-1 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Voltar às Salas</span>
          </button>

          <div>
            <div className="flex items-center space-x-2">
              <span className="font-black text-base text-white">{sala.nome || sala.treinamento_titulo}</span>
              <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase ${
                sala.status === 'aguardando' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse' :
                sala.status === 'em_andamento' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                sala.status === 'pausado' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' :
                'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}>
                {sala.status === 'aguardando' ? 'Aguardando Participantes' :
                 sala.status === 'em_andamento' ? `Em Andamento (${estadoApresentacao})` :
                 sala.status === 'pausado' ? 'Pausado' : 'Encerrado'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Sessão: <strong className="text-amber-400 font-mono">{sala.sessao_id || 'Ativa'}</strong> • PIN: <strong className="text-emerald-400 font-mono">{sala.pin}</strong>
            </p>
          </div>
        </div>

        {/* Lado Direito: Ações em Tempo Real do Estado do Quiz */}
        <div className="flex items-center space-x-2 flex-wrap gap-1.5">
          
          {sala.status === 'aguardando' && (
            <button
              onClick={() => iniciarQuizGuiado(sala.id)}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-2.5 rounded-2xl text-xs flex items-center space-x-2 shadow-lg transition-transform transform hover:scale-105"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>Iniciar Quiz Guiado</span>
            </button>
          )}

          {sala.status === 'em_andamento' && (
            <>
              {(estadoApresentacao === 'QUESTION_ACTIVE' || estadoApresentacao === 'QUESTION_ENDED') && (
                <button
                  onClick={() => revelarRespostaAtualQuizGuiado(sala.id)}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2.5 rounded-2xl text-xs flex items-center space-x-1.5 shadow-md transition-all animate-pulse"
                >
                  <Sparkles className="w-4 h-4 fill-slate-950" />
                  <span>1. Revelar Gabarito</span>
                </button>
              )}

              {estadoApresentacao === 'ANSWER_REVEALED' && (
                <button
                  onClick={() => exibirRanqueQuizGuiado(sala.id)}
                  className="bg-purple-500 hover:bg-purple-400 text-white font-black px-4 py-2.5 rounded-2xl text-xs flex items-center space-x-1.5 shadow-md transition-all animate-pulse"
                >
                  <Trophy className="w-4 h-4 text-white" />
                  <span>2. Exibir Ranking Top 10</span>
                </button>
              )}

              {estadoApresentacao === 'RANKING_SHOWN' && (
                <button
                  onClick={() => avancarPerguntaQuizGuiado(sala.id)}
                  className="bg-blue-500 hover:bg-blue-400 text-slate-950 font-extrabold px-4 py-2.5 rounded-2xl text-xs flex items-center space-x-1.5 shadow-md transition-all animate-pulse"
                >
                  <SkipForward className="w-4 h-4" />
                  <span>3. Próxima Pergunta ({sala.pergunta_atual_index + 1}/{totalPerguntas})</span>
                </button>
              )}

              <button
                onClick={() => pausarQuizGuiado(sala.id)}
                className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold px-3 py-2 rounded-2xl text-xs flex items-center space-x-1 transition-all"
              >
                <Pause className="w-4 h-4 text-amber-400" />
                <span>Pausar</span>
              </button>
            </>
          )}

          {sala.status === 'pausado' && (
            <button
              onClick={() => retomarQuizGuiado(sala.id)}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-2 rounded-2xl text-xs flex items-center space-x-1.5 shadow-md transition-all"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>Retomar</span>
            </button>
          )}

          {/* Botão de Tela de Apresentação (Datashow/TV) */}
          <button
            onClick={() => setShowApresentacao(true)}
            className="bg-gradient-to-tr from-purple-600 to-indigo-500 hover:from-purple-500 hover:to-indigo-400 text-white font-black px-4 py-2.5 rounded-2xl text-xs flex items-center space-x-2 shadow-lg transition-all"
            title="Abrir Tela de Apresentação para Datashow ou TV"
          >
            <Tv className="w-4 h-4 text-amber-300" />
            <span>Tela de Apresentação</span>
          </button>

          {/* Botão para Reiniciar a Sala (Nova Sessão sem Apagar Quiz) */}
          <button
            onClick={() => setShowConfirmReset(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/20 font-bold px-3.5 py-2.5 rounded-2xl text-xs flex items-center space-x-1.5 transition-all"
            title="Reiniciar Sala para Novo Grupo de Alunos"
          >
            <RotateCcw className="w-4 h-4 text-cyan-400" />
            <span>Reiniciar Sala</span>
          </button>

          {sala.status !== 'encerrado' && sala.status !== 'concluido' && (
            <button
              onClick={() => setShowConfirmEncerrar(true)}
              className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold px-3 py-2.5 rounded-2xl text-xs flex items-center space-x-1.5 transition-all"
              title="Encerrar Sala e Gerar Relatórios Finais"
            >
              <Square className="w-4 h-4 text-rose-400" />
              <span>Encerrar</span>
            </button>
          )}

        </div>

      </div>

      {/* MODAL DE CONFIRMAÇÃO DE ENCERRAMENTO DA SALA */}
      {showConfirmEncerrar && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-white">
            <div className="flex items-center space-x-3 text-rose-400">
              <Square className="w-6 h-6" />
              <h3 className="text-lg font-black">Encerrar Sala de Quiz</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Encerrar a sala agora?
              <br /><br />
              • Os participantes não poderão mais responder.
              <br />
              • Os laudos finais serão gerados. Provas em branco não são salvas.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowConfirmEncerrar(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  encerrarSalaQuizGuiado(sala.id);
                  setShowConfirmEncerrar(false);
                }}
                className="px-5 py-2 bg-rose-500 hover:bg-rose-400 text-white rounded-xl text-xs font-black shadow-lg"
              >
                Sim, Encerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE REINÍCIO DA SALA */}
      {showConfirmReset && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-white">
            <div className="flex items-center space-x-3 text-amber-400">
              <RotateCcw className="w-6 h-6" />
              <h3 className="text-lg font-black">Reiniciar Sala de Quiz</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Tem certeza de que deseja reiniciar esta sala?
              <br /><br />
              • <strong className="text-white">O quiz e todas as perguntas permanecerão salvos intactos.</strong>
              <br />
              • A sessão atual será arquivada no histórico e os participantes serão limpos para a entrada de uma nova turma.
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowConfirmReset(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  reiniciarSalaQuizGuiado(sala.id);
                  setShowConfirmReset(false);
                }}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-lg"
              >
                Sim, Reiniciar Sala
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BANNER DE ACESSO À SALA: PIN & QR CODE */}
      {sala.status !== 'encerrado' && sala.status !== 'concluido' && (
        <div className="bg-slate-900/90 border-2 border-emerald-500/40 rounded-3xl p-6 text-white shadow-2xl backdrop-blur-xl grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          
          <div className="space-y-2 text-center md:text-left">
            <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider flex items-center justify-center md:justify-start space-x-1.5">
              <QrCode className="w-4 h-4" />
              <span>Código de Entrada na Sala</span>
            </span>
            
            <div className="flex items-center justify-center md:justify-start space-x-2">
              <span className="text-3xl sm:text-4xl font-black tracking-widest text-white bg-slate-950 px-4 py-2 rounded-2xl border border-emerald-500/50 shadow-inner font-mono">
                {sala.pin}
              </span>
              <button
                onClick={handleCopyPin}
                className="p-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-2xl transition-all"
                title="Copiar Código PIN"
              >
                {copiedPin ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-emerald-400" />}
              </button>
              <button
                onClick={handleCopyLink}
                className="p-2.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-2xl transition-all flex items-center space-x-1"
                title="Copiar Link Direto com PIN"
              >
                {copiedLink ? <Check className="w-5 h-5 text-cyan-400" /> : <LinkIcon className="w-5 h-5 text-cyan-400" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Instrua os participantes a digitar este PIN no aplicativo ou escanearem o QR Code ao lado.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center space-y-2">
            <QRCodeSvg 
              value={sala.pin} 
              size={150} 
            />
            <span className="text-[10px] font-bold text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-white/10">
              Aponte a câmera do celular
            </span>
          </div>

          <div className="bg-slate-950/80 p-5 rounded-2xl border border-white/10 space-y-3 text-center md:text-left">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-300 flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-amber-400" />
                <span>Participantes em Sala</span>
              </span>
              <span className="text-2xl font-black text-emerald-400">
                {totalParticipantes}
              </span>
            </div>

            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pt-1">
              {participantes.length === 0 ? (
                <span className="text-xs text-slate-500 italic">Nenhum participante conectado ainda...</span>
              ) : (
                participantes.map(p => (
                  <div 
                    key={p.id}
                    className="bg-white/10 text-slate-200 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-white/10 flex items-center space-x-2"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{p.nome}</span>
                    {/* "Prova PDF" só faz sentido APÓS o encerramento da sala
                        (avaliação concluída). Antes disso o participante ainda
                        não tem resultado — geraria um PDF inválido. */}
                    {(sala.status === 'encerrado' || sala.status === 'concluido') && onVerRelatorio && (
                      <button
                        onClick={() => onVerRelatorio(p.id)}
                        className="bg-emerald-500/30 hover:bg-emerald-500/50 text-emerald-300 text-[10px] font-black px-1.5 py-0.5 rounded transition-all flex items-center space-x-1"
                        title={`Gerar Prova em PDF de ${p.nome}`}
                      >
                        <FileText className="w-3 h-3" />
                        <span>Prova PDF</span>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* ÁREA PRINCIPAL DA PERGUNTA ATUAL & QUADRO DE RESPOSTAS EM TEMPO REAL */}
      {sala.status === 'em_andamento' && perguntaAtual && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <div className="lg:col-span-2 bg-slate-900/90 border border-white/15 rounded-3xl p-6 text-white shadow-2xl backdrop-blur-xl space-y-6">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-xs font-black text-amber-400 uppercase tracking-widest">
                  Pergunta {sala.pergunta_atual_index + 1} de {totalPerguntas}
                </span>
                <span className="text-xs text-slate-400 block">
                  Norma: {perguntaAtual.norma_relacionada || 'SST General'} ({perguntaAtual.dificuldade})
                </span>
              </div>

              {tempoLimiteSeg > 0 ? (
                <div className={`flex items-center space-x-2 px-4 py-2 rounded-2xl border font-black text-lg ${
                  tempoRestante <= 5 
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse' 
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  <Clock className="w-5 h-5 text-amber-400" />
                  <span>{tempoRestante}s</span>
                </div>
              ) : (
                <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-bold">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  <span>Avanço Manual (Sem Limite)</span>
                </div>
              )}
            </div>

            <h2 className="text-lg sm:text-xl font-black text-white leading-relaxed">
              {perguntaAtual.enunciado}
            </h2>

            {estadoApresentacao === 'ANSWER_REVEALED' && (
              <div className="bg-emerald-500/20 border-2 border-emerald-500/50 rounded-2xl p-4 text-emerald-300 text-xs font-bold space-y-1.5 animate-fadeIn flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2 text-sm font-black text-emerald-400">
                  <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Gabarito Oficial Revelado aos Participantes!</span>
                </div>
                <span className="text-[10px] font-black uppercase px-3 py-1 bg-emerald-500/30 text-emerald-200 rounded-full border border-emerald-400/60 shadow">
                  🟢 Gabarito em Exibição
                </span>
              </div>
            )}

            <div className="space-y-3">
              {opcoesPerguntaAtual.map((opcao, idx) => {
                const dist = distribuicaoRespostas[idx] || { optIdx: idx, count: 0, pct: 0 };
                const eCorreta = idx === perguntaAtual.resposta_correta;
                const letras = ['A', 'B', 'C', 'D'];
                const coresLetras = [
                  'bg-rose-500 text-white',
                  'bg-blue-500 text-white',
                  'bg-amber-500 text-slate-950',
                  'bg-emerald-500 text-slate-950'
                ];

                return (
                  <div 
                    key={idx}
                    className={`p-3.5 rounded-2xl border space-y-2 relative overflow-hidden transition-all ${
                      estadoApresentacao === 'ANSWER_REVEALED' && eCorreta
                        ? 'border-2 border-emerald-400 bg-emerald-950/60 shadow-lg shadow-emerald-500/10'
                        : 'border-white/10 bg-slate-950/80'
                    }`}
                  >
                    <div 
                      className={`absolute left-0 top-0 bottom-0 transition-all duration-500 ${
                        estadoApresentacao === 'ANSWER_REVEALED' && eCorreta ? 'bg-emerald-500/30' : 'bg-emerald-500/15'
                      }`}
                      style={{ width: `${dist.pct}%` }}
                    />

                    <div className="relative z-10 flex items-start justify-between gap-3 text-xs">
                      <div className="flex items-start space-x-3">
                        <span className={`w-6 h-6 rounded-lg font-black text-xs flex items-center justify-center shrink-0 ${coresLetras[idx]}`}>
                          {letras[idx]}
                        </span>
                        <div>
                          <span className="font-semibold text-slate-200 pt-0.5 block">{formatAlternativaText(opcao)}</span>
                          {estadoApresentacao === 'ANSWER_REVEALED' && eCorreta && (
                            <span className="inline-flex items-center space-x-1 text-[10px] font-black text-emerald-400 uppercase tracking-wider mt-1 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/40">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              <span>Gabarito Correto</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-black text-emerald-400 text-sm">{dist.pct}%</span>
                        <span className="text-[10px] text-slate-400 block">({dist.count} respostas)</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {perguntaAtual.explicacao && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200 space-y-1">
                <strong className="block font-extrabold text-amber-300">Fundamentação Técnica / Norma SST:</strong>
                <p className="text-amber-100/90 leading-relaxed">{perguntaAtual.explicacao}</p>
              </div>
            )}

          </div>

          <div className="bg-slate-900/90 border border-white/15 rounded-3xl p-6 text-white shadow-2xl backdrop-blur-xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-extrabold text-sm text-white flex items-center space-x-2">
                <BarChart2 className="w-4 h-4 text-emerald-400" />
                <span>Respostas da Turma</span>
              </h3>
              <span className="text-xs font-bold text-amber-400">
                {totalRespondidos} / {totalParticipantes}
              </span>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {participantes.map(p => {
                let jaRespondeu = false;
                if (p.respostas && perguntaAtual) {
                  if (Array.isArray(p.respostas)) {
                    jaRespondeu = p.respostas.some((r: any) => r.pergunta_id === perguntaAtual.id);
                  } else {
                    jaRespondeu = p.respostas[perguntaAtual.id] !== undefined;
                  }
                }

                return (
                  <div 
                    key={p.id}
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between transition-all ${
                      jaRespondeu
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                        : 'bg-white/5 border-white/10 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${jaRespondeu ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      <span className="font-bold">{p.nome}</span>
                    </div>

                    <span className="text-[10px] font-extrabold">
                      {jaRespondeu ? 'RESPONDIDO' : 'PENSANDO...'}
                    </span>
                  </div>
                );
              })}
            </div>

          </div>

        </div>
      )}

      {/* RESULTADOS FINAIS QUANDO A SALA FOR ENCERRADA/CONCLUÍDA */}
      {/* O app grava status 'concluido' ao encerrar (SSTContext.encerrarSalaQuizGuiado),
          então aceitamos também 'encerrado' por compatibilidade com dados antigos. */}
      {(sala.status === 'encerrado' || sala.status === 'concluido') && (
        <div className="bg-slate-900/90 border border-white/15 rounded-3xl p-6 sm:p-8 text-white shadow-2xl space-y-6">
          
          <div className="border-b border-white/10 pb-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-black text-white flex items-center space-x-2">
                <Trophy className="w-6 h-6 text-amber-400" />
                <span>Sessão Encerrada — Relatório e Fichas SST</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Relatório consolidado de participação e desempenho em SST
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {resultadosDaSala.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                Nenhum resultado registrado ainda.
              </div>
            ) : (
              resultadosDaSala.map(res => {
                const aprovado = res.situacao === 'APROVADO' || res.situacao === 'Aprovado';
                return (
                  <div 
                    key={res.id}
                    className="p-4 rounded-2xl border bg-white/5 border-white/10 flex items-center justify-between flex-wrap gap-4 text-xs"
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-2.5 rounded-2xl border ${
                        aprovado ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}>
                        {aprovado ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <XCircle className="w-5 h-5 text-rose-400" />}
                      </div>

                      <div>
                        <div className="font-extrabold text-sm text-white">{res.participante_nome}</div>
                        <div className="text-[11px] text-slate-400">
                          {res.cargo || res.cpf_ou_empresa || 'Colaborador SST'} • {res.setor_nome || 'Treinamento SST'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="font-black text-emerald-400 text-sm">
                          Nota: {res.nota_final.toFixed(1)} ({res.porcentagem_acertos ?? (res.total_perguntas > 0 ? Math.round((res.acertos / res.total_perguntas) * 100) : 0)}%)
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {res.questoes_corretas ?? res.acertos} de {res.total_questoes ?? res.total_perguntas} corretas
                        </div>
                      </div>

                      <span className={`px-3 py-1 rounded-full text-[10px] font-black border uppercase ${
                        aprovado ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}>
                        {res.situacao}
                      </span>

                      {onVerRelatorio && (
                        <button
                          onClick={() => onVerRelatorio(res.participante_id)}
                          className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-3.5 py-1.5 rounded-xl text-xs flex items-center space-x-1 transition-all"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Ver Ficha SST</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}

    </div>
  );
};
