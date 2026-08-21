// ======================================================================
// QuizPlayerView.tsx — Tela do Jogador de Quiz (Colaborador)
// ----------------------------------------------------------------------
// Roda o quiz do colaborador conectado ao contexto useSST:
//   • Tela de preparação antes de iniciar (com cronômetro por pergunta);
//   • Timer regressivo por pergunta com resposta automática ao estourar;
//   • Seleção e confirmação de alternativas com feedback pedagógico;
//   • Pontuação com bônus de velocidade e de ofensiva (streak);
//   • Progresso persistido em localStorage (retomar sessão interrompida);
//   • Ao concluir, envia via submeterQuizConcluido, dispara confetes e
//     exibe o resumo final (pontos, acertos e ofensiva).
// Admins/super-admins possuem acesso restrito a essa tela.
// ======================================================================
import React, { useState, useEffect, useRef } from 'react';
import { formatAlternativaText } from '../../utils/questionHelpers';
import { useSST } from '../../context/SSTContext';
import { QuizSessao, DetalheRespostaQuiz } from '../../types';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Award, 
  Flame, 
  ArrowRight, 
  RotateCcw,
  BookOpen,
  Zap,
  ShieldCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface QuizPlayerViewProps {
  quizId?: string;
  onVoltar: () => void;
}

export const QuizPlayerView: React.FC<QuizPlayerViewProps> = ({ quizId, onVoltar }) => {
  // Contexto useSST: quizzes, usuário logado, configurações da empresa e
  // função de envio do quiz concluído (atualiza estatísticas e ranking).
  const { quizzes, currentUser, empresa, submeterQuizConcluido } = useSST();

  // ======================================================================
  // Estados do jogo (declarados SEMPRE no topo — regra dos hooks): se o quiz
  // foi iniciado, índice da pergunta atual, opção selecionada, resposta já
  // confirmada, timer da pergunta, respostas já registradas, pontos acumulados
  // e flag de finalização (com ref para evitar envio duplo do resultado).
  // ======================================================================
  const [quizIniciado, setQuizIniciado] = useState(false);
  const [indicePerguntaAtual, setIndicePerguntaAtual] = useState(0);
  const [opcaoSelecionada, setOpcaoSelecionada] = useState<number | null>(null);
  const [respostaConfirmada, setRespostaConfirmada] = useState(false);
  const [tempoRestanteSeg, setTempoRestanteSeg] = useState(30);
  const [tempoGastoPergunta, setTempoGastoPergunta] = useState(0);

  const [respostasAnteriores, setRespostasAnteriores] = useState<DetalheRespostaQuiz[]>([]);
  const [pontosTotaisQuiz, setPontosTotaisQuiz] = useState(0);
  const [quizFinalizado, setQuizFinalizado] = useState(false);
  const quizFinalizadoRef = useRef(false); // Ref de guarda contra duplo envio

  // Regra de negócio: admins/super-admins não jogam quizzes para não
  // pontuarem no ranking e assim preservar a igualdade entre colaboradores.
  if (currentUser.perfil === 'admin' || currentUser.perfil === 'super_admin') {
    return (
      <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-8 text-center text-white space-y-4 max-w-xl mx-auto my-12 shadow-2xl backdrop-blur-xl">
        <div className="p-4 bg-amber-500/20 text-amber-400 rounded-2xl w-16 h-16 mx-auto flex items-center justify-center border border-amber-500/40">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-white">Perfil com Acesso Restrito a Quizzes</h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Você está logado como <strong className="text-amber-300">{currentUser.nome}</strong> ({currentUser.perfil === 'super_admin' ? 'Super Administrador' : 'Administrador da Empresa'}). Administradores e gerentes gerenciam a plataforma e <strong className="text-amber-300">não participam de quizzes nem pontuam no ranking</strong> para preservar a igualdade entre colaboradores.
        </p>
        <button
          onClick={onVoltar}
          className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-6 py-2.5 rounded-xl border border-white/10 transition-all"
        >
          Voltar ao Painel Administrativo
        </button>
      </div>
    );
  }

  // Encontra o quiz ativo: prioriza o quizId recebido, depois o primeiro quiz
  // pendente do colaborador e, por fim, qualquer quiz já associado a ele.
  const quizAtivo = quizzes.find(q => q.id === quizId) || quizzes.find(q => q.colaborador_id === currentUser.id && q.status === 'pendente') || quizzes.find(q => q.colaborador_id === currentUser.id);

  // Se o quiz já estava concluído (de uma sessão/anterior) exibe a tela de
  // "Quiz Já Concluído" com a pontuação obtida. Se acabou de concluir nesta
  // sessão (quizFinalizado), deixa o resumo final aparecer normalmente.
  if (quizAtivo && quizAtivo.status === 'concluido' && !quizFinalizado) {
    return (
      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-8 text-center text-white space-y-4 max-w-xl mx-auto my-12 shadow-2xl backdrop-blur-xl">
        <div className="p-4 bg-emerald-500/20 text-emerald-400 rounded-2xl w-16 h-16 mx-auto flex items-center justify-center border border-emerald-500/40">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-white">Quiz Já Concluído</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Você já respondeu a este conjunto de perguntas da campanha <strong className="text-emerald-400">{quizAtivo.titulo}</strong>. A liberação de cada quiz de campanha ocorre uma única vez por colaborador.
        </p>
        <div className="p-4 bg-white/5 rounded-xl border border-white/10 text-xs text-slate-300 flex items-center justify-between">
          <span>Pontuação obtida:</span>
          <strong className="text-emerald-400 text-sm font-black">{quizAtivo.pontuacao_total} pts</strong>
        </div>
        <button
          onClick={onVoltar}
          className="bg-emerald-500 text-slate-950 font-black text-xs px-6 py-2.5 rounded-xl hover:bg-emerald-400 transition-all shadow-lg"
        >
          Voltar ao Meu Painel
        </button>
      </div>
    );
  }

  const perguntaAtual = quizAtivo?.perguntas[indicePerguntaAtual];
  const totalPerguntas = quizAtivo?.perguntas.length || 0;

  // Chave usada para persistir/restaurar a sessão do quiz no localStorage
  const storageKey = quizAtivo ? `sst_quiz_session_${currentUser.id}_${quizAtivo.id}` : null;

  // ======================================================================
  // Efeitos do Quiz
  // ======================================================================

  // Sincroniza/bloqueia o estado da resposta sempre que a pergunta atual
  // ou as respostas anteriores mudam (ex.: ao retomar uma sessão salva).
  useEffect(() => {
    if (!perguntaAtual) return;
    const jaRespondeu = respostasAnteriores.find(r => r.pergunta_id === perguntaAtual.id);
    if (jaRespondeu) {
      setRespostaConfirmada(true);
      setOpcaoSelecionada(jaRespondeu.resposta_escolhida >= 0 ? jaRespondeu.resposta_escolhida : null);
    }
  }, [perguntaAtual?.id, respostasAnteriores]);

  // Restaura a sessão de quiz salva no localStorage, se existir
  useEffect(() => {
    if (!storageKey) return;
    try {
      const savedRaw = localStorage.getItem(storageKey);
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (saved && saved.quizIniciado && typeof saved.indicePerguntaAtual === 'number') {
          setQuizIniciado(true);
          setIndicePerguntaAtual(saved.indicePerguntaAtual);
          setRespostasAnteriores(saved.respostasAnteriores || []);
          setPontosTotaisQuiz(saved.pontosTotaisQuiz || 0);
          if (typeof saved.opcaoSelecionada === 'number') {
            setOpcaoSelecionada(saved.opcaoSelecionada);
          }
          if (saved.respostaConfirmada === true) {
            setRespostaConfirmada(true);
          }
        }
      }
    } catch (err) {
      console.warn('Erro ao restaurar sessão de quiz:', err);
    }
  }, [storageKey]);

  // Salva o estado da sessão do quiz no localStorage a cada progresso,
  // para permitir retomada em caso de recarregamento da página.
  useEffect(() => {
    if (!storageKey || !quizIniciado || quizFinalizado) return;
    try {
      const sessionData = {
        quizId: quizAtivo.id,
        quizIniciado: true,
        indicePerguntaAtual,
        respostasAnteriores,
        pontosTotaisQuiz,
        respostaConfirmada,
        opcaoSelecionada,
      };
      localStorage.setItem(storageKey, JSON.stringify(sessionData));
    } catch (err) {
      console.warn('Erro ao salvar sessão de quiz:', err);
    }
  }, [storageKey, quizIniciado, indicePerguntaAtual, respostasAnteriores, pontosTotaisQuiz, quizFinalizado, respostaConfirmada, opcaoSelecionada]);

  // Cronômetro regressivo da pergunta - só inicia quando quizIniciado é true!
  useEffect(() => {
    if (!quizIniciado || !perguntaAtual || respostaConfirmada || quizFinalizado) return;

    const tempoLimite = perguntaAtual.tempo_limite_segundos || 30;
    setTempoRestanteSeg(tempoLimite);
    setTempoGastoPergunta(0);

    let expired = false;

    const timer = setInterval(() => {
      setTempoGastoPergunta(t => t + 1);
      setTempoRestanteSeg(prev => Math.max(0, prev - 1));
    }, 1000);

    // Timeout separado: o callback de confirmação roda FORA do updater de estado,
    // evitando problemas de closure/estado obsoleto
    const autoTimeout = setTimeout(() => {
      if (expired) return;
      expired = true;
      clearInterval(timer);
      confirmarRespostaAutomaticamente(null, tempoLimite);
    }, tempoLimite * 1000);

    return () => {
      expired = true;
      clearInterval(timer);
      clearTimeout(autoTimeout);
    };
  }, [quizIniciado, indicePerguntaAtual, respostaConfirmada, quizFinalizado]);

  if (!quizAtivo || !perguntaAtual) {
    return (
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-center text-white space-y-4 shadow-2xl">
        <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto" />
        <h2 className="text-xl font-bold">Nenhum quiz pendente no momento</h2>
        <p className="text-sm text-slate-400">Você já respondeu todos os quizzes agendados para hoje!</p>
        <button
          onClick={onVoltar}
          className="bg-emerald-500 text-slate-950 font-bold px-5 py-2 rounded-xl text-sm hover:bg-emerald-400 transition-colors shadow-lg"
        >
          Voltar ao Painel
        </button>
      </div>
    );
  }

  // ======================================================================
  // Lógica de pontuação e avanço do quiz
  // ======================================================================

  // Confirma a resposta (manualmente ou automaticamente quando o tempo
  // expira), calcula os pontos ganhos e registra o detalhe da resposta.
  const confirmarRespostaAutomaticamente = (escolhaIndex: number | null, tempoTotalUsado: number) => {
    // Guarda contra resposta duplicada (já confirmada ou já respondida)
    if (respostaConfirmada || respostasAnteriores.some(r => r.pergunta_id === perguntaAtual.id)) return;

    const eCorreta = escolhaIndex === perguntaAtual.resposta_correta;
    let pontosGanhos = 0;

    if (eCorreta) {
      // Pontuação base configurada pelo admin (padrão: 10 pts por acerto)
      const baseScore = empresa?.configuracoes?.pontosPorAcertoQuiz ?? 10;
      pontosGanhos += baseScore;

      // Bônus de velocidade (máx. configurado pelo admin, padrão 3; 0 = desativado)
      const maxBonusVel = empresa?.configuracoes?.bonusVelocidadeMax ?? 3;
      if (maxBonusVel > 0) {
        const pctTempoSobra = (tempoRestanteSeg / (perguntaAtual.tempo_limite_segundos || 30));
        if (pctTempoSobra >= 0.75) pontosGanhos += Math.round(maxBonusVel);
        else if (pctTempoSobra >= 0.50) pontosGanhos += Math.max(1, Math.round(maxBonusVel * 0.66));
        else if (pctTempoSobra >= 0.25) pontosGanhos += Math.max(1, Math.round(maxBonusVel * 0.33));
      }

      // Bônus de ofensiva/streak (máx. configurado pelo admin, padrão 10; 0 = desativado)
      const maxBonusStreak = empresa?.configuracoes?.bonusStreakMax ?? 10;
      if (maxBonusStreak > 0) {
        const streak = currentUser.estatisticas?.streak_dias ?? 0;
        if (streak >= 15) pontosGanhos += Math.round(maxBonusStreak);
        else if (streak >= 7) pontosGanhos += Math.max(1, Math.round(maxBonusStreak * 0.5));
        else if (streak >= 3) pontosGanhos += Math.max(1, Math.round(maxBonusStreak * 0.2));
      }
    }

    // Monta o detalhe da resposta (pergunta, escolha, acerto, tempo e pontos)
    const detalhe: DetalheRespostaQuiz = {
      pergunta_id: perguntaAtual.id,
      resposta_escolhida: escolhaIndex ?? -1,
      correta: eCorreta,
      tempo_gasto_segundos: tempoTotalUsado,
      pontos_ganhos: pontosGanhos,
    };

    // Atualiza o estado do jogo com a resposta confirmada
    setOpcaoSelecionada(escolhaIndex);
    setRespostaConfirmada(true);
    setRespostasAnteriores(prev => [...prev, detalhe]);
    setPontosTotaisQuiz(prev => prev + pontosGanhos);
  };

  // Handler do botão "Confirmar Resposta": valida a seleção e confirma
  const handleConfirmarResposta = () => {
    if (opcaoSelecionada === null) return;
    confirmarRespostaAutomaticamente(opcaoSelecionada, tempoGastoPergunta);
  };

  // Handler "Próxima Pergunta": avança para a próxima pergunta ou, na última,
  // finaliza o quiz (envia o resultado ao contexto, limpa a sessão salva e
  // dispara os confetes de comemoração).
  const handleProximaPergunta = () => {
    if (quizFinalizadoRef.current) return; // Guarda contra duplo clique/envio
    if (indicePerguntaAtual + 1 < totalPerguntas) {
      setIndicePerguntaAtual(prev => prev + 1);
      setOpcaoSelecionada(null);
      setRespostaConfirmada(false);
    } else {
      // Quiz finalizado - guarda contra duplo clique com envio duplicado
      quizFinalizadoRef.current = true;
      setQuizFinalizado(true);
      if (storageKey) {
        try {
          localStorage.removeItem(storageKey); // Limpa a sessão persistida
        } catch (e) {
          console.warn(e);
        }
      }
      submeterQuizConcluido(quizAtivo.id, respostasAnteriores, pontosTotaisQuiz);
      // Confete já é disparado dentro de submeterQuizConcluido (contexto).
    }
  };

  // Tempo limite da pergunta atual e percentual restante para a barra de progresso
  const tempoLimiteMax = perguntaAtual.tempo_limite_segundos || 30;
  const pctTimer = (tempoRestanteSeg / tempoLimiteMax) * 100;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      
      {/* Tela de preparação - início manual do quiz */}
      {!quizIniciado ? (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-white shadow-2xl space-y-6 text-center">
          <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/40">
            <BookOpen className="w-8 h-8" />
          </div>

          <div>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/30 uppercase tracking-wide">
              {quizAtivo.categoria || 'Treinamento SST'}
            </span>
            <h2 className="text-2xl font-black text-white mt-3">
              {quizAtivo.titulo || 'Quiz Diário de Segurança do Trabalho'}
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Teste seus conhecimentos em Normas Regulamentadoras e procedimentos operacionais. O cronômetro iniciará assim que você clicar em "COMEÇAR".
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto my-4 text-xs">
            <div className="bg-slate-900/80 p-3 rounded-xl border border-white/10">
              <div className="text-lg font-black text-white">{totalPerguntas}</div>
              <div className="text-slate-400 font-medium text-[11px]">Questões</div>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-xl border border-white/10">
              <div className="text-lg font-black text-amber-400">
                {perguntaAtual?.tempo_limite_segundos || quizAtivo?.perguntas[0]?.tempo_limite_segundos || 30}s
              </div>
              <div className="text-slate-400 font-medium text-[11px]">Por Pergunta</div>
            </div>

            <div className="bg-slate-900/80 p-3 rounded-xl border border-white/10">
              <div className="text-lg font-black text-emerald-400">
                {empresa?.configuracoes?.pontosPorAcertoQuiz ?? 10} pts
              </div>
              <div className="text-slate-400 font-medium text-[11px]">Base por Acerto</div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 flex justify-center space-x-3">
            <button
              onClick={onVoltar}
              className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold px-5 py-3 rounded-xl transition-all border border-white/10 text-xs"
            >
              Cancelar
            </button>
            <button
              onClick={() => setQuizIniciado(true)}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black px-8 py-3 rounded-xl transition-all shadow-xl text-sm flex items-center space-x-2"
            >
              <span>COMEÇAR QUIZ</span>
              <Zap className="w-4 h-4 fill-slate-950" />
            </button>
          </div>
        </div>
      ) : quizFinalizado ? (
        /* Visão de Quiz Finalizado (resumo com pontos, acertos e ofensiva) */
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 text-white shadow-2xl space-y-6 text-center">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/40 animate-bounce">
            <Award className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-2xl font-black text-white">Quiz Concluído com Sucesso!</h2>
            <p className="text-sm text-slate-400 mt-1">Sua pontuação e estatísticas foram registradas no sistema.</p>
          </div>

          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto my-6">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
              <div className="text-2xl font-black text-emerald-400">+{pontosTotaisQuiz}</div>
              <div className="text-xs text-slate-400 font-medium">Pontos Ganhos</div>
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
              <div className="text-2xl font-black text-white">
                {respostasAnteriores.filter(r => r.correta).length} / {totalPerguntas}
              </div>
              <div className="text-xs text-slate-400 font-medium">Acertos</div>
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4">
              <div className="text-2xl font-black text-orange-400 flex items-center justify-center space-x-1">
                <Flame className="w-5 h-5 fill-orange-500/30 text-orange-500" />
                <span>{currentUser.estatisticas?.streak_dias ?? 0}d</span>
              </div>
              <div className="text-xs text-slate-400 font-medium">Ofensiva</div>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 flex justify-center">
            <button
              onClick={onVoltar}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-3 rounded-xl transition-all shadow-lg text-sm"
            >
              Voltar ao Painel Principal
            </button>
          </div>
        </div>
      ) : (
        /* Cartão da Pergunta Ativa */
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl text-white shadow-2xl overflow-hidden">
          
          {/* Cabeçalho com categoria, norma, dificuldade e barra de progresso */}
          <div className="p-5 border-b border-white/10 bg-white/5 backdrop-blur-md flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                  {perguntaAtual.categoria}
                </span>
                {perguntaAtual.norma_relacionada && (
                  <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/30">
                    {perguntaAtual.norma_relacionada}
                  </span>
                )}
                <span className="text-xs text-slate-400 font-medium">
                  • Dificuldade {perguntaAtual.dificuldade}
                </span>
              </div>
              <h2 className="text-sm font-bold text-slate-300 mt-1">
                Pergunta {indicePerguntaAtual + 1} de {totalPerguntas}
              </h2>
            </div>

            {/* Exibição do cronômetro regressivo */}
            <div className="flex items-center space-x-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
              <Clock className={`w-4 h-4 ${tempoRestanteSeg <= 10 ? 'text-rose-400 animate-ping' : 'text-slate-300'}`} />
              <span className={`text-sm font-black ${tempoRestanteSeg <= 10 ? 'text-rose-400' : 'text-slate-100'}`}>
                {tempoRestanteSeg}s
              </span>
            </div>
          </div>

          {/* Barra visual de progresso do tempo */}
          <div className="w-full bg-white/10 h-1.5 overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ${
                pctTimer > 50 ? 'bg-emerald-500' : pctTimer > 25 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${pctTimer}%` }}
            />
          </div>

          {/* Corpo: enunciado da pergunta */}
          <div className="p-6 space-y-6">
            <h3 className="text-lg font-extrabold text-white leading-relaxed">
              {perguntaAtual.enunciado}
            </h3>

            {/* Lista de alternativas (opções A, B, C, D...) */}
            <div className="space-y-3">
              {perguntaAtual.alternativas.map((altText, idx) => {
                const eSelecionada = opcaoSelecionada === idx;
                const eCorreta = idx === perguntaAtual.resposta_correta;

                let styleClasse = 'bg-white/5 backdrop-blur-md border-white/10 text-slate-200 hover:bg-white/10 hover:border-white/20';

                if (respostaConfirmada) {
                  if (eCorreta) {
                    styleClasse = 'bg-emerald-950/80 border-emerald-500 text-emerald-200 font-semibold shadow-md';
                  } else if (eSelecionada && !eCorreta) {
                    styleClasse = 'bg-rose-950/80 border-rose-500 text-rose-200 font-semibold';
                  } else {
                    styleClasse = 'bg-white/5 border-white/5 text-slate-500 opacity-40';
                  }
                } else if (eSelecionada) {
                  styleClasse = 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-semibold shadow-inner';
                }

                return (
                  <button
                    key={idx}
                    disabled={respostaConfirmada}
                    onClick={() => setOpcaoSelecionada(idx)}
                    className={`w-full text-left p-4 rounded-xl border text-sm transition-all flex items-center justify-between gap-3 ${styleClasse}`}
                  >
                    <div className="flex items-center space-x-3">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                        respostaConfirmada && eCorreta ? 'bg-emerald-500 text-slate-950' :
                        respostaConfirmada && eSelecionada && !eCorreta ? 'bg-rose-500 text-white' :
                        eSelecionada ? 'bg-emerald-500/30 text-emerald-300' : 'bg-white/10 text-slate-300'
                      }`}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span>{formatAlternativaText(altText)}</span>
                    </div>

                    {respostaConfirmada && eCorreta && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                    {respostaConfirmada && eSelecionada && !eCorreta && <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Feedback pedagógico após confirmar a resposta */}
            {respostaConfirmada && (
              <div className={`p-4 rounded-xl border space-y-2 animate-fadeIn backdrop-blur-md ${
                opcaoSelecionada === perguntaAtual.resposta_correta
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                  : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
              }`}>
                <div className="flex items-center space-x-2 font-extrabold text-sm">
                  {opcaoSelecionada === perguntaAtual.resposta_correta ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span>
                        Resposta Correta! (+{respostasAnteriores[respostasAnteriores.length - 1]?.pontos_ganhos ?? (empresa?.configuracoes?.pontosPorAcertoQuiz ?? 10)} pts)
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-rose-400" />
                      <span>Incorreto! Veja a fundamentação abaixo:</span>
                    </>
                  )}
                </div>

                <p className="text-xs text-slate-300 leading-relaxed pt-1">
                  {perguntaAtual.explicacao}
                </p>
              </div>
            )}

            {/* Barra de ações: confirmar resposta ou avançar para a próxima pergunta */}
            <div className="pt-4 border-t border-white/10 flex justify-end">
              {!respostaConfirmada ? (
                <button
                  disabled={opcaoSelecionada === null}
                  onClick={handleConfirmarResposta}
                  className="bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-emerald-400 text-slate-950 font-black px-6 py-2.5 rounded-xl text-sm transition-all shadow-md"
                >
                  Confirmar Resposta
                </button>
              ) : (
                <button
                  onClick={handleProximaPergunta}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-2.5 rounded-xl text-sm transition-all shadow-md flex items-center space-x-2"
                >
                  <span>{indicePerguntaAtual + 1 < totalPerguntas ? 'Próxima Pergunta' : 'Ver Resultado do Quiz'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
