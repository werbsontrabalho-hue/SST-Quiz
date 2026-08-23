// =====================================================================================
// VIEW: ChallengeDisputeView
// Tela de Disputas de Desafios 1x1 (colaborador x colaborador) entre setores.
// Fluxo da tela:
//   1. Lançar um novo desafio (competitivo ou amistoso) contra um colaborador de outro setor;
//   2. Jogar a partida pergunta a pergunta (5 perguntas + desempate contínuo por tempo);
//   3. Registrar respostas, exibir a explicação técnica das NRs e aguardar o oponente;
//   4. Conferir placar/vitória no histórico e solicitar revanche instantânea.
// Integração: consome o contexto useSST (empresa, usuários, setores, desafios, perguntas)
// e aciona os handlers criarDesafio1v1, submeterRespostaDesafio e criarRevanche.
// =====================================================================================
import React, { useState, useEffect, useRef } from 'react';
import { formatAlternativaText } from '../../utils/questionHelpers';
import { useSST } from '../../context/SSTContext';
import { Desafio1v1 } from '../../types';
import { 
  Swords, 
  Trophy, 
  Clock, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Zap, 
  Send,
  AlertTriangle,
  Play,
  BookOpen,
  Flame
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playAudioEffect } from '../../utils/audioUtils';
import { ConfirmActionModal } from '../ConfirmActionModal';

interface ChallengeDisputeViewProps {
  activeDesafioId?: string;
  onVoltar: () => void;
}

export const ChallengeDisputeView: React.FC<ChallengeDisputeViewProps> = ({ activeDesafioId, onVoltar }) => {
  // =====================================================================================
  // CONTEXTO useSST: dados globais do app (usuário atual, empresa, usuários, setores,
  // desafios e perguntas) e ações de negócio usadas nesta tela:
  //   - criarDesafio1v1: lança um novo desafio contra outro colaborador;
  //   - submeterRespostaDesafio: grava as respostas completas de um jogador;
  //   - criarRevanche: gera um novo desafio em cima de uma disputa encerrada.
  // =====================================================================================
  const { 
    currentUser, 
    empresa,
    empresas,
    usuarios, 
    setores, 
    desafios, 
    perguntas,
    criarDesafio1v1, 
    submeterRespostaDesafio,
    criarRevanche
  } = useSST();

  // Estados do formulário de lançamento: oponente selecionado, modo do desafio
  // (competitivo/amistoso), valor da aposta e aba ativa do histórico.
  const [selectedOpponentId, setSelectedOpponentId] = useState<string>('');
  const [tipoDesafioNovo, setTipoDesafioNovo] = useState<'competitivo' | 'amistoso'>('competitivo');
  const [apostaPontos, setApostaPontos] = useState<number>(50);
  const [filterTab, setFilterTab] = useState<'sua_vez' | 'aguardando' | 'concluidos' | 'todos'>('sua_vez');

  // Estado do desafio atualmente em jogo (reativo ao contexto global, aberto por id)
  const [desafioEmJogoId, setDesafioEmJogoId] = useState<string | null>(activeDesafioId || null);
  const desafioEmJogo = desafios.find(d => d.id === desafioEmJogoId) || null;

  // =====================================================================================
  // LÓGICA DE COTA DINÂMICA DE DESAFIOS
  // Calcula a cota semanal de lançamentos competitivos por colaborador, baseada na
  // equalização dos setores: quanto maior o meu setor, menor a minha cota individual.
  // =====================================================================================
  const empresaUsuarios = usuarios.filter(u => 
    (u.empresa_id === currentUser.empresa_id || u.empresa_id === empresa.id || (!u.empresa_id && empresas.length <= 1)) && 
    u.perfil === 'colaborador' && 
    u.ativo !== false
  );
  const setoresEmpresa = setores.filter(s => s.empresa_id === currentUser.empresa_id || s.empresa_id === empresa.id);
  const tamanhoPorSetor = setoresEmpresa.map(s => empresaUsuarios.filter(u => u.setor_id === s.id).length);
  const maxSetorTamanho = Math.max(...tamanhoPorSetor, 1);
  const totalSetorPermitido = maxSetorTamanho * 2;
  const meuSetorTamanho = empresaUsuarios.filter(u => u.setor_id === currentUser.setor_id).length || 1;
  // CORREÇÃO: usa Math.round para coincidir EXATAMENTE com a cota aplicada no
  // contexto (SSTContext.criarDesafio1v1), evitando divergência entre o que a
  // UI exibe e o que o app efetivamente bloqueia ao lançar o desafio.
  const cotaCompetitiva = Math.max(1, Math.round(totalSetorPermitido / meuSetorTamanho));

  // Pontos e limites configurados pela empresa (cota amistosa e pontos de vitória/derrota)
  const cotaAmistoso = empresa?.configuracoes?.cota_desafios_colaborador ?? 4;
  const pontosVitoriaAmistoso = empresa?.configuracoes?.pontosVitoriaAmistoso ?? 50;
  const pontosDerrotaAmistoso = empresa?.configuracoes?.pontosDerrotaAmistoso ?? 25;
  const pontosVitoriaDesafio = empresa?.configuracoes?.pontosVitoriaDesafio ?? 50;

  // Sincroniza o valor padrão da aposta com os pontos de vitória configurados pela empresa
  useEffect(() => {
    if (pontosVitoriaDesafio) {
      setApostaPontos(pontosVitoriaDesafio);
    }
  }, [pontosVitoriaDesafio]);

  // Conta quantos desafios (competitivos e amistosos) foram lançados nos últimos 7 dias,
  // para validar a cota semanal do colaborador na hora de lançar um novo desafio.
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const desafiosCompetitivosLancados = desafios.filter(d => 
    d.empresa_id === currentUser.empresa_id && 
    d.desafiante_id === currentUser.id && 
    d.tipo !== 'amistoso' && 
    new Date(d.data_criacao) >= seteDiasAtras
  ).length;

  const desafiosAmistososLancados = desafios.filter(d => 
    d.empresa_id === currentUser.empresa_id && 
    d.desafiante_id === currentUser.id && 
    d.tipo === 'amistoso' && 
    new Date(d.data_criacao) >= seteDiasAtras
  ).length;

  // Cota vigente conforme o modo selecionado no formulário; define se o usuário pode desafiar
  const cotaAtual = tipoDesafioNovo === 'amistoso' ? cotaAmistoso : cotaCompetitiva;
  const desafiosLancados = tipoDesafioNovo === 'amistoso' ? desafiosAmistososLancados : desafiosCompetitivosLancados;
  const podeDesafiar = desafiosLancados < cotaAtual;

  // Reage a mudanças da prop activeDesafioId (ex.: vindo de notificações ou painel),
  // abrindo automaticamente o desafio correspondente.
  useEffect(() => {
    if (activeDesafioId) {
      const target = desafios.find(d => d.id === activeDesafioId);
      if (target) {
        handleAbrirDesafio(target);
      }
    }
  }, [activeDesafioId]);

  // Estados da partida em andamento: pronto para começar, modo desempate, confirmação de
  // revanche, índice da pergunta atual, respostas dadas, opção selecionada e tempo restante.
  const [preparadoParaComecar, setPreparadoParaComecar] = useState(false);
  const [preparadoParaDesempate, setPreparadoParaDesempate] = useState(false);
  const [confirmarRevancheAberta, setConfirmarRevancheAberta] = useState(false);
  const [indicePerguntaAtual, setIndicePerguntaAtual] = useState(0);
  const [respostasMinhas, setRespostasMinhas] = useState<{ pergunta_id: string; alternativa_escolhida: number; correta: boolean; tempo_resposta_segundos: number }[]>([]);
  const [opcaoSelecionada, setOpcaoSelecionada] = useState<number | null>(null);
  const [perguntaConfirmada, setPerguntaConfirmada] = useState(false);
  const [tempoRestanteSeg, setTempoRestanteSeg] = useState(20);

  // Ref com as respostas mais recentes para que handlers assíncronos/timer nunca leiam estado desatualizado
  const respostasMinhasRef = useRef(respostasMinhas);
  respostasMinhasRef.current = respostasMinhas;

  // Filtra oponentes disponíveis, restringindo estritamente aos colaboradores ativos da
  // mesma empresa (e de setor diferente, exceto quando o modo amistoso permite mesmo setor)
  const meusSetoresComp = usuarios.filter(u => 
    u.empresa_id === currentUser.empresa_id && 
    u.id !== currentUser.id && 
    u.perfil === 'colaborador' && 
    u.ativo !== false && 
    (tipoDesafioNovo === 'amistoso' 
      ? (empresa?.configuracoes?.permitirMesmoSetorAmistoso !== false || u.setor_id !== currentUser.setor_id)
      : u.setor_id !== currentUser.setor_id)
  );

  // Abre um desafio específico: carrega perguntas válidas, detecta se já respondi tudo,
  // restaura sessão parcial (anti-cheat) ou inicia uma nova partida.
  const handleAbrirDesafio = (des: Desafio1v1) => {
    setDesafioEmJogoId(des.id);

    // Garante que o desafio tenha um array válido de perguntas (cópia não mutável)
    const desafioEfetivo: Desafio1v1 = (!des.perguntas || des.perguntas.length === 0)
      ? { ...des, perguntas: perguntas.slice(0, 5) }
      : des;

    const isDesafiante = currentUser.id === desafioEfetivo.desafiante_id;
    const isDesafiado = currentUser.id === desafioEfetivo.desafiado_id;

    // Busca especificamente as respostas do usuário atual (desafiante ou desafiado)
    const minhasResps = isDesafiante 
      ? (desafioEfetivo.respostas_desafiante || []) 
      : isDesafiado 
        ? (desafioEfetivo.respostas_desafiado || [])
        : [];

    const totalP = desafioEfetivo.perguntas.length;
    const jaRespondiTudo = totalP > 0 && minhasResps.length >= totalP;

    // Anti-cheat (mesma regra do Quiz): restaura uma sessão parcial salva no
    // localStorage para que o usuário não saia da partida e re-responda uma pergunta
    // que já errou.
    let sessaoSalva: {
      indicePerguntaAtual: number;
      respostasMinhas: { pergunta_id: string; alternativa_escolhida: number; correta: boolean; tempo_resposta_segundos: number }[];
      preparadoParaDesempate?: boolean;
    } | null = null;
    try {
      const raw = localStorage.getItem(`sst_desafio_sessao_${currentUser.id}_${des.id}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.indicePerguntaAtual === 'number' && Array.isArray(parsed.respostasMinhas)) {
          sessaoSalva = parsed;
        }
      }
    } catch (err) {
      console.warn('Erro ao restaurar sessão de desafio:', err);
    }

    if (jaRespondiTudo) {
      // Usuário já jogou esta partida -> mostra o resumo/status diretamente
      setPreparadoParaComecar(true);
      setPreparadoParaDesempate(true);
      setIndicePerguntaAtual(totalP);
      setRespostasMinhas(minhasResps);
    } else if (sessaoSalva && sessaoSalva.respostasMinhas.length > minhasResps.length) {
      // Existe progresso parcial salvo -> retoma na última pergunta visualizada com a
      // resposta travada na tela (mesmo comportamento do Quiz), impedindo re-responder.
      let indiceRestaurado = Math.min(sessaoSalva.indicePerguntaAtual, totalP);
      if (indiceRestaurado < 0) indiceRestaurado = 0;
      const perguntaRestaurada = desafioEfetivo.perguntas[indiceRestaurado];
      const respostaAnterior = perguntaRestaurada
        ? sessaoSalva.respostasMinhas.find(r => r.pergunta_id === perguntaRestaurada.id)
        : undefined;

      setPreparadoParaComecar(true);
      setPreparadoParaDesempate(Boolean(sessaoSalva.preparadoParaDesempate));
      setIndicePerguntaAtual(indiceRestaurado);
      setRespostasMinhas(sessaoSalva.respostasMinhas);
      setOpcaoSelecionada(respostaAnterior && respostaAnterior.alternativa_escolhida >= 0 ? respostaAnterior.alternativa_escolhida : null);
      setPerguntaConfirmada(Boolean(respostaAnterior));
    } else {
      // Usuário precisa jogar: inicia a partida do zero
      setPreparadoParaComecar(false);
      setPreparadoParaDesempate(false);
      setIndicePerguntaAtual(minhasResps.length);
      setRespostasMinhas(minhasResps);
      setOpcaoSelecionada(null);
      setPerguntaConfirmada(false);
    }
  };

  // Cronômetro regressivo de cada pergunta: inicia o timer e, ao esgotar o tempo,
  // marca a pergunta como incorreta automaticamente (timeout).
  useEffect(() => {
    if (!desafioEmJogo || !preparadoParaComecar || perguntaConfirmada) return;
    if (indicePerguntaAtual === 5 && !preparadoParaDesempate) return;

    const pergunta = desafioEmJogo.perguntas[indicePerguntaAtual];
    if (!pergunta) return;

    const tempoLimite = pergunta.tempo_limite_segundos || 20;
    setTempoRestanteSeg(tempoLimite);

    const timer = setInterval(() => {
      setTempoRestanteSeg(prev => Math.max(0, prev - 1));
    }, 1000);

    const autoTimeout = setTimeout(() => {
      clearInterval(timer);
      // Tempo esgotado -> confirma a resposta como incorreta (sem efeitos colaterais, fora do updater)
      handleConfirmarOpcao1v1(-1, pergunta.id, false, true);
    }, tempoLimite * 1000);

    return () => {
      clearInterval(timer);
      clearTimeout(autoTimeout);
    };
  }, [desafioEmJogoId, preparadoParaComecar, indicePerguntaAtual, perguntaConfirmada, preparadoParaDesempate]);

  // Anti-cheat (mesma regra do Quiz): persiste o progresso parcial no localStorage para
  // que o usuário não saia da partida e re-responda uma pergunta já respondida/errada.
  useEffect(() => {
    if (!desafioEmJogo || !preparadoParaComecar) return;
    const totalP = desafioEmJogo.perguntas.length;
    if (totalP === 0) return;

    // Se o usuário respondeu todas as perguntas (partida submetida), limpa a sessão salva
    if (respostasMinhas.length >= totalP) {
      try {
        localStorage.removeItem(`sst_desafio_sessao_${currentUser.id}_${desafioEmJogo.id}`);
      } catch (err) {
        console.warn('Erro ao limpar sessão de desafio:', err);
      }
      return;
    }

    try {
      localStorage.setItem(`sst_desafio_sessao_${currentUser.id}_${desafioEmJogo.id}`, JSON.stringify({
        indicePerguntaAtual,
        respostasMinhas,
        preparadoParaDesempate,
      }));
    } catch (err) {
      console.warn('Erro ao salvar sessão de desafio:', err);
    }
  }, [desafioEmJogo, preparadoParaComecar, indicePerguntaAtual, respostasMinhas, preparadoParaDesempate, currentUser.id]);

  // Guarda de acesso (executada APÓS todos os hooks): administradores e super
  // administradores NÃO participam das disputas 1x1, então recebem uma tela de bloqueio.
  if (currentUser.perfil === 'admin' || currentUser.perfil === 'super_admin') {
    return (
      <div className="bg-slate-900/90 border border-purple-500/30 rounded-2xl p-8 text-center text-white space-y-4 max-w-xl mx-auto my-12 shadow-2xl backdrop-blur-xl">
        <div className="p-4 bg-purple-500/20 text-purple-400 rounded-2xl w-16 h-16 mx-auto flex items-center justify-center border border-purple-500/40">
          <Swords className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-white">Perfil com Acesso Restrito a Desafios 1x1</h2>
        <p className="text-xs text-slate-300 leading-relaxed">
          Você está logado como <strong className="text-purple-300">{currentUser.nome}</strong> ({currentUser.perfil === 'super_admin' ? 'Super Administrador' : 'Administrador da Empresa'}). Administradores e gerentes <strong className="text-purple-300">não participam de disputas 1x1 nem aparecem nos rankings</strong>.
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

  // Handler: Lança um novo desafio, validando a cota semanal e o oponente selecionado.
  // Define a aposta (amistosa = pontos de vitória configurados; competitiva = valor
  // escolhido) e inicia a partida com feedback sonoro + confete.
  const handleLancarDesafio = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpponentId) return;

    if (!podeDesafiar) {
      alert(`Você atingiu sua cota de ${cotaAtual} desafios no modo ${tipoDesafioNovo === 'amistoso' ? 'Amistoso' : 'Competitivo'}. Você ainda pode aceitar convites recebidos normalmente!`);
      return;
    }

    const valorApostaEfetiva = tipoDesafioNovo === 'amistoso' ? pontosVitoriaAmistoso : apostaPontos;
    const novo = criarDesafio1v1(selectedOpponentId, tipoDesafioNovo, valorApostaEfetiva);
    if (novo) {
      setDesafioEmJogoId(novo.id);
      setPreparadoParaComecar(false);
      setIndicePerguntaAtual(0);
      setRespostasMinhas([]);
      playAudioEffect('challenge_alert');
      confetti({ particleCount: 60, spread: 50, origin: { y: 0.7 } });
    }
  };

  // Handler: Inicia a contagem do cronômetro ao clicar no botão "COMEÇAR"
  const handleIniciarPartida = () => {
    setPreparadoParaComecar(true);
  };

  // Handler: Confirma a alternativa escolhida na partida 1x1 + feedback de áudio.
  // Calcula o tempo gasto, grava a resposta, verifica o fim das perguntas e submete
  // as respostas completas ao contexto (sem simular o oponente).
  const handleConfirmarOpcao1v1 = (idx: number, perguntaId: string, eCorreta: boolean, isTimeout: boolean = false) => {
    if (perguntaConfirmada) return;

    // Anti-cheat (mesma regra do Quiz): impede re-responder pergunta já respondida/errada nesta sessão
    if (respostasMinhasRef.current.some(r => r.pergunta_id === perguntaId)) return;

    const pergunta = desafioEmJogo?.perguntas[indicePerguntaAtual];
    const tempoLimite = pergunta?.tempo_limite_segundos || 20;
    const tempoGasto = isTimeout ? tempoLimite : Math.max(1, tempoLimite - tempoRestanteSeg);

    const novaResp = {
      pergunta_id: perguntaId,
      alternativa_escolhida: idx,
      correta: eCorreta,
      tempo_resposta_segundos: tempoGasto,
    };

    setOpcaoSelecionada(idx);
    setPerguntaConfirmada(true);

    // Feedback sonoro conforme o acerto/erro da resposta
    if (eCorreta) {
      playAudioEffect('correct');
    } else {
      playAudioEffect('wrong');
    }

    const proximaLista = [...respostasMinhasRef.current, novaResp];
    setRespostasMinhas(proximaLista);

    // Se o jogador respondeu TODAS as perguntas do desafio
    if (desafioEmJogo && proximaLista.length === desafioEmJogo.perguntas.length) {
      // Submete as respostas completas do usuário atual, sem simular automaticamente o oponente
      submeterRespostaDesafio(desafioEmJogo.id, currentUser.id, proximaLista);
    }
  };

  // Avança para a próxima pergunta ou, ao final, exibe o resultado (com confete e som de vitória)
  const handleProximaPergunta1v1 = () => {
    if (!desafioEmJogo) return;
    if (indicePerguntaAtual + 1 < desafioEmJogo.perguntas.length) {
      setIndicePerguntaAtual(prev => prev + 1);
      setOpcaoSelecionada(null);
      setPerguntaConfirmada(false);
    } else {
      // Todas as perguntas foram respondidas -> mostra o resultado final da disputa
      setIndicePerguntaAtual(desafioEmJogo.perguntas.length);
      const eVencedor = desafioEmJogo.vencedor_id === currentUser.id;
      if (eVencedor) {
        playAudioEffect('victory');
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      }
    }
  };

  // Handler: Botão de revanche instantânea — valida a cota usando o modo real do
  // desafio (não a aba do formulário) e abre o modal de confirmação.
  const handleAcionarRevanche = () => {
    if (!desafioEmJogo) return;

    // Valida a cota usando o modo REAL do desafio a ser revanchado (não a aba do formulário)
    const modoRevanche = desafioEmJogo.tipo;
    const cotaRevanche = modoRevanche === 'amistoso' ? cotaAmistoso : cotaCompetitiva;
    const lancadosRevanche = modoRevanche === 'amistoso' ? desafiosAmistososLancados : desafiosCompetitivosLancados;
    if (lancadosRevanche >= cotaRevanche) {
      alert(`Você atingiu sua cota de ${cotaRevanche} desafios lançados neste modo. Você não pode solicitar mais revanches, mas ainda pode aceitar convites de outros colaboradores!`);
      return;
    }

    // Abre o modal de confirmação para evitar cliques acidentais na revanche
    setConfirmarRevancheAberta(true);
  };

  // Confirma a revanche: cria o novo desafio via contexto e reinicia o estado da partida
  const confirmarRevanche = () => {
    if (!desafioEmJogo) return;

    const revanche = criarRevanche(desafioEmJogo.id);
    if (revanche) {
      setDesafioEmJogoId(revanche.id);
      setPreparadoParaComecar(false);
      setIndicePerguntaAtual(0);
      setRespostasMinhas([]);
      setOpcaoSelecionada(null);
      setPerguntaConfirmada(false);
      playAudioEffect('challenge_alert');
    }
  };

  // Lista de desafios em que o usuário atual participa (como desafiante ou desafiado)
  const minhasDisputas = desafios.filter(d => d.desafiante_id === currentUser.id || d.desafiado_id === currentUser.id);

  // Classifica o desafio em uma das abas: 'sua_vez' (eu preciso responder),
  // 'aguardando' (já respondi, falta o oponente) ou 'concluidos'.
  const getStatusCategoria = (des: Desafio1v1) => {
    const isDesafiante = currentUser.id === des.desafiante_id;
    const isDesafiado = currentUser.id === des.desafiado_id;
    const totalP = (des.perguntas && des.perguntas.length > 0) ? des.perguntas.length : 5;

    const respMinhas = isDesafiante 
      ? (des.respostas_desafiante || []) 
      : isDesafiado 
        ? (des.respostas_desafiado || [])
        : [];

    const respOponente = isDesafiante 
      ? (des.respostas_desafiado || []) 
      : (des.respostas_desafiante || []);

    const euRespondi = respMinhas.length >= totalP && totalP > 0;
    const oponenteRespondeu = respOponente.length >= totalP && totalP > 0;

    if (des.status === 'concluido' || (euRespondi && oponenteRespondeu)) return 'concluidos';
    if (euRespondi && !oponenteRespondeu) return 'aguardando';
    return 'sua_vez';
  };

  // Contadores de cada categoria (para os badges das abas) e lista filtrada pela aba ativa
  const countSuaVez = minhasDisputas.filter(d => getStatusCategoria(d) === 'sua_vez').length;
  const countAguardando = minhasDisputas.filter(d => getStatusCategoria(d) === 'aguardando').length;
  const countConcluidos = minhasDisputas.filter(d => getStatusCategoria(d) === 'concluidos').length;

  const disputasFiltradas = minhasDisputas.filter(d => {
    if (filterTab === 'todos') return true;
    return getStatusCategoria(d) === filterTab;
  });

  return (
    <div className="space-y-6 pb-12">
      
      {/* ============================================================
          BANNER DO CABEÇALHO: título da seção, descrição e botão de
          voltar à lista quando houver um desafio em jogo.
      ============================================================ */}
      <div className="bg-gradient-to-r from-purple-950/60 via-indigo-950/40 to-slate-900/80 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-6 text-white shadow-2xl flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-500/40 backdrop-blur-md">
              <Swords className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black text-white">Desafios 1x1 entre Setores</h1>
          </div>
          <p className="text-xs text-purple-200/80 mt-1">
            Disputas diretas pergunta a pergunta com timer, apostas de setor e explicação técnica das respostas!
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {desafioEmJogo && (
            <button
              onClick={() => setDesafioEmJogoId(null)}
              className="bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs px-4 py-2 rounded-xl border border-white/10 backdrop-blur-md transition-all"
            >
              ← Voltar à Lista de Desafios
            </button>
          )}
        </div>
      </div>

      {/* ============================================================
          MODO DE PARTIDA (jogo ativo): quando um desafio está aberto,
          exibe o cabeçalho do duelo e a tela de jogo pergunta a pergunta.
      ============================================================ */}
      {desafioEmJogo ? (
        <div className="bg-white/5 backdrop-blur-xl border border-purple-500/30 rounded-2xl p-6 text-white shadow-2xl space-y-6">
          
          {/* Cabeçalho do status da partida: tema sorteado, aposta e modalidade */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4 flex-wrap gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-full border border-purple-500/30 backdrop-blur-md">
                  Tema Sorteado: {desafioEmJogo.tema_sorteado}
                </span>
                {desafioEmJogo.vale_ponto && (
                  <span className="text-xs font-black text-amber-300 bg-amber-500/20 px-2.5 py-1 rounded-full border border-amber-500/40 flex items-center space-x-1">
                    <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span>Aposta: +{desafioEmJogo.pontuacao_setor} pts p/ Setor</span>
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400">
                Modalidade: <span className="text-emerald-400 font-bold">{desafioEmJogo.vale_ponto ? 'Competitivo (SST Intersetorial)' : 'Amistoso (Treino)'}</span>
              </div>
            </div>

            {/* Exibição dos competidores: desafiante VS desafiado */}
            <div className="flex items-center space-x-4 bg-white/5 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10">
              <div className="text-right">
                <div className="text-xs font-bold text-slate-200">
                  {usuarios.find(u => u.id === desafioEmJogo.desafiante_id)?.nome}
                </div>
                <div className="text-[10px] text-slate-400">Desafiante</div>
              </div>
              <div className="text-purple-400 font-black text-sm">VS</div>
              <div>
                <div className="text-xs font-bold text-slate-200">
                  {usuarios.find(u => u.id === desafioEmJogo.desafiado_id)?.nome}
                </div>
                <div className="text-[10px] text-slate-400">Desafiado</div>
              </div>
            </div>
          </div>

          {/* Etapa de preparação: botão "COMEÇAR" antes de iniciar o cronômetro */}
          {!preparadoParaComecar ? (
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-8 text-center space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 bg-purple-500/20 text-purple-300 rounded-full flex items-center justify-center mx-auto border border-purple-500/40">
                <Play className="w-7 h-7 fill-purple-400" />
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-white">Pronto para a Disputa?</h3>
                <p className="text-xs text-slate-300 mt-1">
                  O tempo limite de 20s por pergunta começará assim que você clicar em "COMEÇAR". Cada resposta exibe a explicação técnica da NR!
                </p>
              </div>

              <button
                onClick={handleIniciarPartida}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black py-3 rounded-xl shadow-lg transition-all text-sm flex items-center justify-center space-x-2"
              >
                <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                <span>COMEÇAR DESAFIO</span>
              </button>
            </div>
          ) : (
            // Pergunta ativa durante a partida
            <div className="space-y-6">
              
              {/* Renderização da pergunta atual (IIFE para calcular o estado por pergunta) */}
              {(() => {
                const pergunta = desafioEmJogo.perguntas[indicePerguntaAtual];
                if (!pergunta) {
                  // Partida concluída / tela de resumo aguardando o oponente
                  const desafianteRespondeu = Boolean(desafioEmJogo.respostas_desafiante?.length && desafioEmJogo.respostas_desafiante.length >= desafioEmJogo.perguntas.length);
                  const desafiadoRespondeu = Boolean(desafioEmJogo.respostas_desafiado?.length && desafioEmJogo.respostas_desafiado.length >= desafioEmJogo.perguntas.length);
                  const ambosResponderam = desafianteRespondeu && desafiadoRespondeu;
                  const eVencedor = desafioEmJogo.vencedor_id === currentUser.id;

                  // Desafio finalizado mas empatado -> tela da rodada de desempate
                  if (indicePerguntaAtual >= 5 && !preparadoParaDesempate) {
                  return (
                    <div className="bg-gradient-to-br from-amber-950/90 via-purple-950/90 to-slate-900 border border-amber-500/50 rounded-2xl p-6 text-center space-y-5 shadow-2xl animate-fadeIn">
                      <div className="w-16 h-16 bg-amber-500/20 text-amber-300 rounded-2xl border border-amber-500/40 flex items-center justify-center mx-auto shadow-lg">
                        <Flame className="w-9 h-9 text-amber-400 animate-pulse" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-black text-amber-300">🔥 RODADA DE DESEMPATE ({indicePerguntaAtual + 1}ª PERGUNTA)</h3>
                        <p className="text-xs text-slate-200 leading-relaxed max-w-md mx-auto">
                          A disputa continua empatada! A {indicePerguntaAtual + 1}ª pergunta de desempate decidirá o vencedor.
                        </p>
                        <p className="text-[11px] text-amber-200/80 bg-amber-500/10 border border-amber-500/20 p-2 rounded-xl max-w-sm mx-auto">
                          ⚡ <strong>Regra de Desempate:</strong> Quem acertar garante a vitória! Se ambos acertarem, vence o menor tempo no cronômetro.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setPreparadoParaDesempate(true);
                          setTempoRestanteSeg(20);
                          setOpcaoSelecionada(null);
                          setPerguntaConfirmada(false);
                        }}
                        className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs px-8 py-3.5 rounded-xl shadow-2xl transition-all transform hover:scale-105 active:scale-95"
                      >
                        ⚡ PRONTO! INICIAR {indicePerguntaAtual + 1}ª PERGUNTA AGORA
                      </button>
                    </div>
                  );
                }

                // Tela de resumo: aguardando o oponente responder ou resultado final (vitória/derrota)
                return (
                    <div className="bg-white/5 backdrop-blur-md border border-purple-500/40 rounded-xl p-8 text-center space-y-6">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto border ${
                        !ambosResponderam 
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' 
                          : eVencedor 
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/40' 
                            : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      }`}>
                        {!ambosResponderam ? <Clock className="w-8 h-8 animate-spin text-amber-300" /> : <Trophy className="w-8 h-8" />}
                      </div>

                      {/* Área central da tela de resumo: aguardando oponente ou resultado final */}
                      <div>
                        {!ambosResponderam ? (
                          <>
                            <h3 className="text-2xl font-black text-white">
                              ⏳ Suas Respostas Foram Registradas!
                            </h3>
                            <p className="text-xs text-slate-300 mt-2 max-w-md mx-auto leading-relaxed">
                              Você concluiu sua rodada. O desafio está aguardando o oponente responder. Assim que ele concluir, o vencedor será definido automaticamente!
                            </p>
                          </>
                        ) : (
                          <div className="space-y-3">
                            <h3 className="text-2xl font-black text-white">
                              {eVencedor ? '🏆 VOCÊ VENCEU A DISPUTA 1x1!' : ' DERROTA NA DISPUTA'}
                            </h3>

                            {desafioEmJogo.placar_final && (
                              <div className="inline-block bg-purple-500/20 text-purple-200 border border-purple-500/40 px-4 py-1.5 rounded-full text-sm font-extrabold">
                                Placar: {desafioEmJogo.placar_final}
                              </div>
                            )}

                            {desafioEmJogo.motivo_vitoria && (
                              <div className="text-xs text-amber-300 font-semibold bg-amber-500/10 p-3 rounded-xl border border-amber-500/30 max-w-md mx-auto">
                                ⚡ {desafioEmJogo.motivo_vitoria}
                              </div>
                            )}

                            <p className="text-xs text-slate-300 mt-1">
                              {eVencedor 
                                ? `Parabéns! +${desafioEmJogo.pontuacao_setor || 100} pontos de aposta creditados ao seu SETOR no ranking!` 
                                : 'Foi por pouco! Que tal pedir revanche imediata para reverter o resultado?'}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Botões de Ação */}
                      <div className="flex items-center justify-center space-x-3 pt-4 border-t border-white/10">
                        {ambosResponderam && (
                          <button
                            onClick={handleAcionarRevanche}
                            className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs px-6 py-3 rounded-xl shadow-xl flex items-center space-x-2 border border-purple-400/30 transition-all transform hover:scale-105"
                          >
                            <RotateCcw className="w-4 h-4" />
                            <span>SOLICITAR REVANCHE INSTANTÂNEA</span>
                          </button>
                        )}

                        <button
                          onClick={() => setDesafioEmJogoId(null)}
                          className="bg-white/5 hover:bg-white/10 text-slate-200 font-bold text-xs px-5 py-3 rounded-xl border border-white/10"
                        >
                          Voltar ao Menu
                        </button>
                      </div>
                    </div>
                  );
                }

                // Tela de transição para a rodada de desempate (6ª pergunta)
                if (indicePerguntaAtual === 5 && !preparadoParaDesempate) {
                  return (
                    <div className="bg-gradient-to-br from-amber-950/90 via-purple-950/90 to-slate-900 border border-amber-500/50 rounded-2xl p-6 text-center space-y-5 shadow-2xl animate-fadeIn">
                      <div className="w-16 h-16 bg-amber-500/20 text-amber-300 rounded-2xl border border-amber-500/40 flex items-center justify-center mx-auto shadow-lg">
                        <Flame className="w-9 h-9 text-amber-400 animate-pulse" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-black text-amber-300">🔥 RODADA DE DESEMPATE (6ª PERGUNTA)</h3>
                        <p className="text-xs text-slate-200 leading-relaxed max-w-md mx-auto">
                          Você concluiu as 5 perguntas e revisou a explicação da 5ª questão. Como a disputa terminou empatada, a 6ª pergunta decidirá quem vence!
                        </p>
                        <p className="text-[11px] text-amber-200/80 bg-amber-500/10 border border-amber-500/20 p-2 rounded-xl max-w-sm mx-auto">
                          ⚡ <strong>Regra de Desempate:</strong> Quem acertar com o menor tempo no cronômetro garante a vitória!
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setPreparadoParaDesempate(true);
                          setTempoRestanteSeg(20);
                          setOpcaoSelecionada(null);
                          setPerguntaConfirmada(false);
                        }}
                        className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xs px-8 py-3.5 rounded-xl shadow-2xl transition-all transform hover:scale-105 active:scale-95"
                      >
                        ⚡ PRONTO! INICIAR 6ª PERGUNTA AGORA
                      </button>
                    </div>
                  );
                }

                return (
                  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 space-y-4">
                    
                    {/* Aviso especial da rodada de desempate (6ª pergunta) */}
                    {indicePerguntaAtual === 5 && (
                      <div className="bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-purple-500/20 border border-amber-500/40 p-3 rounded-xl text-center space-y-1 animate-pulse">
                        <span className="text-xs font-black text-amber-300 uppercase tracking-wide flex items-center justify-center space-x-1">
                          <Zap className="w-4 h-4 text-amber-400 fill-amber-400" />
                          <span>🔥 PERGUNTA DE DESEMPATE!</span>
                        </span>
                        <p className="text-[11px] text-slate-200">
                          Houve empate nas 5 primeiras perguntas. <strong>Quem responder correto com o menor tempo no cronômetro vence a disputa!</strong>
                        </p>
                      </div>
                    )}

                    {/* Barra superior: índice da pergunta e cronômetro */}
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-bold">
                        Pergunta {indicePerguntaAtual + 1} de {desafioEmJogo.perguntas.length}
                      </span>

                      {/* Barra do cronômetro da pergunta (alerta quando faltam ≤5s) */}
                      <div className="flex items-center space-x-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-purple-500/30 font-mono text-xs shadow-inner">
                        <Clock className="w-4 h-4 text-amber-400" />
                        <span className={`font-black ${tempoRestanteSeg <= 5 ? 'text-rose-400 animate-pulse' : 'text-amber-300'}`}>
                          {tempoRestanteSeg}s
                        </span>
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-white leading-relaxed">
                      {pergunta.enunciado}
                    </h3>

                    {/* Lista de alternativas: estilo muda após confirmar (verde = correta, vermelho = errada) */}
                    <div className="space-y-2.5">
                      {pergunta.alternativas.map((altText, altIdx) => {
                        const eCorreta = altIdx === pergunta.resposta_correta;
                        const eSelecionada = opcaoSelecionada === altIdx;

                        let styleOption = 'bg-white/5 backdrop-blur-md border-white/10 text-slate-200 hover:bg-white/10';

                        if (perguntaConfirmada) {
                          if (eCorreta) styleOption = 'bg-emerald-950/80 border-emerald-500 text-emerald-200 font-bold';
                          else if (eSelecionada && !eCorreta) styleOption = 'bg-rose-950/80 border-rose-500 text-rose-200';
                          else styleOption = 'bg-white/5 border-white/5 text-slate-600 opacity-40';
                        }

                        return (
                          <button
                            key={altIdx}
                            disabled={perguntaConfirmada}
                            onClick={() => handleConfirmarOpcao1v1(altIdx, pergunta.id, eCorreta)}
                            className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all flex items-center justify-between ${styleOption}`}
                          >
                            <div className="flex items-center space-x-3">
                              <span className="font-bold text-purple-400">{String.fromCharCode(65 + altIdx)}.</span>
                              <span>{formatAlternativaText(altText)}</span>
                            </div>
                            {perguntaConfirmada && eCorreta && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                            {perguntaConfirmada && eSelecionada && !eCorreta && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Explicação Técnica da Resposta */}
                    {perguntaConfirmada && (
                      <div className="p-4 rounded-xl bg-purple-950/60 border border-purple-500/40 text-xs text-purple-100 space-y-2 animate-fadeIn shadow-lg">
                        <div className="font-bold flex items-center space-x-2 text-amber-300">
                          <BookOpen className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Explicação Técnica da Resposta (Norma Regulamentadora):</span>
                        </div>
                        <p className="leading-relaxed text-slate-200 text-[11px]">
                          {pergunta.explicacao || 'Procedimento em conformidade com as diretrizes de Segurança e Saúde no Trabalho.'}
                        </p>
                      </div>
                    )}

                    {/* Rodapé de ação após confirmar: avançar para a próxima pergunta ou ver o resultado */}
                    {perguntaConfirmada && (
                      <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                        <div className="text-xs text-emerald-300 font-medium">
                          ✓ Resposta registrada.
                        </div>
                        <button
                          onClick={handleProximaPergunta1v1}
                          className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md"
                        >
                          {indicePerguntaAtual + 1 < desafioEmJogo.perguntas.length 
                            ? (indicePerguntaAtual === 4 ? 'Ir para Rodada de Desempate (6ª Pergunta) ⚡' : 'Próxima Pergunta →') 
                            : 'Ver Resultado Final →'}
                        </button>
                      </div>
                    )}

                  </div>
                );
              })()}

            </div>
          )}

        </div>
      ) : (
        // ============================================================
        //   LISTA DE DESAFIOS: formulário de novo desafio (coluna 1) e
        //   histórico de disputas do perfil (colunas 2 e 3).
        // ============================================================
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Coluna esquerda (1 col): card de lançar novo desafio 1x1 */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
            <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
              <Send className="w-5 h-5 text-purple-400" />
              <span>Lançar Novo Desafio 1x1</span>
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Escolha um colaborador de OUTRO setor. O tema é sorteado e a aposta pontua no ranking setorial!
            </p>

            {/* Abas de seleção do modo: Competitivo (vale ponto de setor) ou Amistoso (treino) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Selecione o Modo de Desafio:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTipoDesafioNovo('competitivo');
                    setSelectedOpponentId('');
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5 ${
                    tipoDesafioNovo === 'competitivo'
                      ? 'bg-purple-600 border-purple-400 text-white shadow-lg'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <Swords className="w-4 h-4 text-amber-400" />
                  <span>Competitivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTipoDesafioNovo('amistoso');
                    setSelectedOpponentId('');
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-extrabold transition-all flex items-center justify-center space-x-1.5 ${
                    tipoDesafioNovo === 'amistoso'
                      ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <Zap className="w-4 h-4 text-blue-300" />
                  <span>Amistoso</span>
                </button>
              </div>
            </div>

            {/* Box da cota do modo: mostra lançamentos da semana e se ainda pode desafiar */}
            <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 space-y-1.5 text-xs backdrop-blur-md">
              <div className="flex items-center justify-between font-bold">
                <span className="text-purple-200">
                  Cota Semanal ({tipoDesafioNovo === 'amistoso' ? 'Amistosos' : 'Competitivos'}):
                </span>
                <span className={`px-2 py-0.5 rounded text-[11px] font-extrabold border ${
                  podeDesafiar
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {desafiosLancados} / {cotaAtual} Lançados
                </span>
              </div>
              <p className="text-[10px] text-slate-300 leading-relaxed">
                {tipoDesafioNovo === 'competitivo'
                  ? `Equalização de Setores: ${cotaCompetitiva} desafios competitivos por colaborador nesta semana.`
                  : `Cota configurada pela empresa: ${cotaAmistoso} desafios amistosos por semana.`}
              </p>
              {!podeDesafiar && (
                <div className="text-[11px] text-amber-300 font-bold pt-1 border-t border-purple-500/20 flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Cota deste modo atingida! Você ainda pode aceitar desafios recebidos normalmente.</span>
                </div>
              )}
            </div>

            <form onSubmit={handleLancarDesafio} className="space-y-4 pt-1">
              {tipoDesafioNovo === 'competitivo' ? (
                // Aposta de pontos para o setor (ex.: 100 ou 200 pts, conforme configurado)
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-amber-300 flex items-center space-x-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Aposta de Pontos no Desafio (Setor + Individual):</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[pontosVitoriaDesafio, pontosVitoriaDesafio * 2].filter((v, i, a) => a.indexOf(v) === i).map(val => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setApostaPontos(val)}
                        className={`py-2 rounded-xl border text-xs font-extrabold transition-all ${
                          apostaPontos === val
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        +{val} pts
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-blue-950/40 border border-blue-500/30 rounded-xl p-3 text-[11px] text-blue-200/90 space-y-1">
                  <div className="font-bold flex items-center space-x-1 text-blue-300">
                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                    <span>Recompensa no Modo Amistoso: +{pontosVitoriaAmistoso} Pontos Pessoais</span>
                  </div>
                  <p className="text-[10px] text-slate-300 leading-relaxed">
                    A vitória no Modo Amistoso pontua <strong>exclusivamente para o seu Ranking Pessoal e Saldo de Resgate de Prêmios (+{pontosVitoriaAmistoso} pts na vitória / -{pontosDerrotaAmistoso} pts na derrota)</strong>, sem alterar os pontos do Setor.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Selecione o Oponente
                </label>
                <select
                  value={selectedOpponentId}
                  onChange={(e) => setSelectedOpponentId(e.target.value)}
                  className="w-full bg-slate-900/90 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-500"
                  required
                >
                  <option value="">-- Escolher Colaborador --</option>
                  {meusSetoresComp.map(u => {
                    const sNome = setores.find(s => s.id === u.setor_id)?.nome;
                    return (
                      <option key={u.id} value={u.id}>
                        {u.nome} ({sNome})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 text-[11px] text-purple-200/90 flex items-start space-x-2 backdrop-blur-md">
                <AlertTriangle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <span>
                  {tipoDesafioNovo === 'competitivo'
                    ? `Mesmas regras de jogabilidade (5 perguntas + desempate contínuo por tempo). O SETOR e você ganham +${apostaPontos} pts!`
                    : `Mesmas regras de jogabilidade (5 perguntas + desempate contínuo por tempo). Apenas o seu ranking INDIVIDUAL ganha +${pontosVitoriaAmistoso} pts!`}
                </span>
              </div>

              <button
                type="submit"
                disabled={!selectedOpponentId || !podeDesafiar}
                className="w-full bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-purple-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-md transition-all flex items-center justify-center space-x-2"
              >
                <Swords className="w-4 h-4" />
                <span>
                  {!podeDesafiar 
                    ? 'Cota de Lançamento Atingida' 
                    : 'Enviar Convite de Desafio'}
                </span>
              </button>
            </form>
          </div>

          {/* Coluna direita (2 cols): histórico de disputas do meu perfil */}
          <div className="lg:col-span-2 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <span>Histórico de Disputas do Meu Perfil</span>
              </h2>

              {/* Abas de filtro por status: Sua Vez, Aguardando, Concluídos e Todos */}
              <div className="flex items-center space-x-1 bg-slate-900/80 p-1 rounded-xl border border-white/10 text-[11px]">
                <button
                  onClick={() => setFilterTab('sua_vez')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center space-x-1 ${
                    filterTab === 'sua_vez' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>⚡ Sua Vez</span>
                  {countSuaVez > 0 && (
                    <span className="bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded-full text-[9px] font-black animate-pulse">
                      {countSuaVez}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setFilterTab('aguardando')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    filterTab === 'aguardando' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ⏳ Aguardando ({countAguardando})
                </button>
                <button
                  onClick={() => setFilterTab('concluidos')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    filterTab === 'concluidos' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  🏆 Concluídos ({countConcluidos})
                </button>
                <button
                  onClick={() => setFilterTab('todos')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    filterTab === 'todos' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Todos ({minhasDisputas.length})
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {disputasFiltradas.length === 0 ? (
                <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-8 text-center text-slate-400 text-xs">
                  {filterTab === 'todos' 
                    ? 'Nenhum desafio registrado até o momento. Que tal enviar um convite ao lado?' 
                    : 'Nenhum desafio encontrado nesta categoria.'}
                </div>
              ) : (
                disputasFiltradas.map(des => {
                  const eDesafiante = des.desafiante_id === currentUser.id;
                  const desafianteObj = usuarios.find(u => u.id === des.desafiante_id);
                  const desafiadoObj = usuarios.find(u => u.id === des.desafiado_id);
                  const oponenteObj = eDesafiante ? desafiadoObj : desafianteObj;

                  const totalP = (des.perguntas && des.perguntas.length > 0) ? des.perguntas.length : 5;
                  const respMinhasList = eDesafiante 
                    ? (des.respostas_desafiante || []) 
                    : (des.respostas_desafiado || []);
                  const respOponenteList = eDesafiante 
                    ? (des.respostas_desafiado || []) 
                    : (des.respostas_desafiante || []);

                  const euRespondi = respMinhasList.length >= totalP && totalP > 0;
                  const oponenteRespondeu = respOponenteList.length >= totalP && totalP > 0;

                  const eConcluido = des.status === 'concluido' || (euRespondi && oponenteRespondeu);
                  const eVencedor = des.vencedor_id === currentUser.id;

                  return (
                    <div 
                      key={des.id} 
                      className={`backdrop-blur-md rounded-xl p-4 flex items-center justify-between flex-wrap gap-3 text-xs border transition-all ${
                        !euRespondi && !eConcluido
                          ? 'bg-purple-950/40 border-purple-500/50 shadow-lg shadow-purple-900/20'
                          : euRespondi && !eConcluido
                            ? 'bg-amber-950/20 border-amber-500/30'
                            : eVencedor
                              ? 'bg-emerald-950/20 border-emerald-500/30'
                              : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`p-2.5 rounded-xl font-bold ${
                          eConcluido
                            ? (eVencedor ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300')
                            : (euRespondi ? 'bg-amber-500/20 text-amber-300' : 'bg-purple-500/20 text-purple-300 animate-pulse')
                        }`}>
                          <Swords className="w-5 h-5" />
                        </div>

                        <div>
                          <div className="font-bold text-white text-sm flex items-center space-x-2">
                            <span>{desafianteObj?.nome} vs {desafiadoObj?.nome}</span>
                          </div>
                          
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center space-x-2 flex-wrap">
                            <span>Tema: <strong className="text-slate-200">{des.tema_sorteado}</strong></span>
                            <span>•</span>
                            <span>Aposta: <strong className="text-amber-300">+{des.pontuacao_setor || 100} pts</strong></span>
                            {des.placar_final && (
                              <>
                                <span>•</span>
                                <span className="text-purple-300 font-bold">Placar: {des.placar_final}</span>
                              </>
                            )}
                          </div>
                          {des.motivo_vitoria && (
                            <div className="text-[10px] text-amber-300 font-medium mt-0.5">
                              ⚡ {des.motivo_vitoria}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Selos de status e botão de ação conforme o estado do desafio */}
                      <div className="flex items-center space-x-3">
                        {eConcluido ? (
                          <div className="flex items-center space-x-2">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                              eVencedor ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            }`}>
                              {eVencedor ? `VITÓRIA (+${des.pontuacao_setor || 50} pts)` : 'DERROTA'}
                            </span>
                            <button
                              onClick={() => handleAbrirDesafio(des)}
                              className="bg-white/10 hover:bg-white/20 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] border border-white/10 transition-all"
                            >
                              Ver Placar
                            </button>
                          </div>
                        ) : euRespondi && !oponenteRespondeu ? (
                          <div className="flex items-center space-x-2">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center space-x-1">
                              <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                              <span>Aguardando {oponenteObj?.nome?.split(' ')[0] || 'Oponente'}</span>
                            </span>
                            <button
                              onClick={() => handleAbrirDesafio(des)}
                              className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold px-3 py-1.5 rounded-lg text-[11px] border border-amber-500/30 transition-all"
                            >
                              Ver Status
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-500/30 text-purple-200 border border-purple-400/50 animate-pulse">
                              ⚡ SUA VEZ DE JOGAR!
                            </span>
                            <button
                              onClick={() => handleAbrirDesafio(des)}
                              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black px-4 py-1.5 rounded-lg text-[11px] shadow-lg border border-purple-400/30 transition-all transform hover:scale-105"
                            >
                              JOGAR AGORA
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      )}

      {/* Modal de confirmação da revanche (evita cliques acidentais) */}
      {desafioEmJogo && (
        <ConfirmActionModal
          isOpen={confirmarRevancheAberta}
          onClose={() => setConfirmarRevancheAberta(false)}
          onConfirm={confirmarRevanche}
          title="Solicitar Revanche"
          message="Confirme para enviar um novo desafio ao seu oponente."
          itemName={`Revanche contra ${(() => {
            const oponenteRevanche = usuarios.find(u => u.id === (currentUser.id === desafioEmJogo.desafiante_id ? desafioEmJogo.desafiado_id : desafioEmJogo.desafiante_id));
            return oponenteRevanche?.nome || 'seu oponente';
          })()} • Modo ${desafioEmJogo.tipo === 'amistoso' ? 'Amistoso' : 'Competitivo'}`}
          confirmLabel="Sim, quero a revanche"
          cancelLabel="Cancelar"
          tone="purple"
        />
      )}

    </div>
  );
};
