// ======================================================================
// CollaboratorDashboardView.tsx — Painel do Colaborador (Home)
// ----------------------------------------------------------------------
// Exibe o resumo diário do colaborador autenticado via contexto useSST:
//   • Quiz agendado do dia (pendente ou concluído) com atalho para iniciar;
//   • Convites de Desafios 1x1 pendentes (aceitar/recusar);
//   • Medalhas e conquistas do colaborador;
//   • Média justa por setor (pontos ÷ colaboradores ativos);
//   • Ranking geral Top 3 com regra de privacidade (colaborador só vê o Top 3
//     e, se estiver fora dele, a própria posição).
// Navega para outras abas via setActiveTab e inicia quizzes/desafios via
// onIniciarQuiz / onIniciarDesafio.
// ======================================================================
import React from 'react';
import { useSST } from '../../context/SSTContext';
import { 
  Flame, 
  Award, 
  CheckCircle2, 
  Swords, 
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Clock,
  Trophy
} from 'lucide-react';
// Utilitários de troféus: monta a vitrine da temporada atual e dá o emoji de cada troféu
import { getTrofeusTemporadaAtual, emojiTrofeu, eImagemRealTrofeu } from '../../utils/trofeusHelpers';

interface CollaboratorDashboardViewProps {
  setActiveTab: (tab: string) => void;
  onIniciarQuiz: (quizId: string) => void;
  onIniciarDesafio: (desafioId: string) => void;
}

export const CollaboratorDashboardView: React.FC<CollaboratorDashboardViewProps> = ({ 
  setActiveTab, 
  onIniciarQuiz, 
  onIniciarDesafio 
}) => {
  // ======================================================================
  // Contexto useSST: destrutura os dados do usuário logado, da empresa,
  // quizzes/desafios do colaborador, funções de ranking e ações para
  // aceitar/recusar convites de desafio 1x1.
  // ======================================================================
  const { 
    currentUser, 
    empresa,
    quizzes, 
    desafios, 
    getRankingsSetores, 
    getRankingsColaboradores,
    setores,
    aceitarDesafio,
    recusarDesafio
  } = useSST();

  // Quiz pendente (agendado para o colaborador) e convites de desafios ainda não respondidos
  const pendenteQuiz = quizzes.find(q => q.colaborador_id === currentUser.id && q.status === 'pendente');
  const desafiosPendentes = desafios.filter(d => d.desafiado_id === currentUser.id && d.status === 'pendente');

  // Rankings calculados pelo contexto: setores (com regra de elegibilidade) e colaboradores
  const rankingsSetores = getRankingsSetores();
  const rankingsSetoresExibicao = rankingsSetores.filter(s => s.elegivel || s.setor_id === currentUser.setor_id);
  const rankingsColaboradores = getRankingsColaboradores();

  // Localiza as informações do setor do usuário e o ranking do próprio setor
  const meuSetorInfo = setores.find(s => s.id === currentUser.setor_id);
  const meuSetorRanking = rankingsSetores.find(r => r.setor_id === currentUser.setor_id);

  // Regra de Privacidade: o colaborador vê apenas o Top 3. Se estiver fora
  // do Top 3, exibe o Top 3 + a posição do próprio usuário.
  const userRankIndex = rankingsColaboradores.findIndex(u => u.id === currentUser.id);
  const isUserInTop3 = userRankIndex >= 0 && userRankIndex < 3;
  const top3Colaboradores = rankingsColaboradores.slice(0, 3);

  // ======================================================================
  // TROFÉUS DA TEMPORADA ATUAL + GALERIA DE TEMPORADAS ANTERIORES
  // ----------------------------------------------------------------------
  // A vitrine "Minhas Medalhas & Conquistas" é montada dinamicamente a
  // partir das regras de troféus configuradas pela empresa (regrasTrofeus).
  // Os troféus conquistados aparecem coloridos; os não conquistados ficam
  // esmaecidos. As temporadas anteriores são exibidas numa galeria nomeada
  // com a informação de cada temporada.
  // ======================================================================
  const regrasTrofeus = (empresa as any).configuracoes?.regrasTrofeus;
  const trofeusTemporadaAtual = getTrofeusTemporadaAtual(regrasTrofeus, currentUser);
  // Conquistados: vindos de trofeus_conquistados (fonte de verdade), ordenados
  // por data (mais recentes primeiro), independente de a regra estar ativa.
  const conquistadosOrdenados = [...(currentUser.estatisticas?.trofeus_conquistados || [])]
    .sort((a, b) => new Date(b.conquistado_em).getTime() - new Date(a.conquistado_em).getTime());
  // Próximos: troféus de regras ATIVAS não conquistados, filtrados pela proximidade configurada.
  const proximosTrofeus = trofeusTemporadaAtual
    .filter(t => t.ativo && !t.obtida && t.meta !== undefined)
    .filter(t => {
      const limite = t.limiteProximidade ?? 0;
      if (!limite || limite <= 0) return true; // 0 = mostra todos
      return (t.meta! - (t.progresso || 0)) <= limite;
    });
  const galeriaTemporadas = currentUser.trofeus_temporadas || [];
  const [filtroBuscaTrofeu, setFiltroBuscaTrofeu] = React.useState('');

  return (
    <div className="space-y-6 pb-12">
      
      {/* Banner de boas-vindas com avatar, nome, cargo e setor do colaborador */}
      <div className="bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-900/80 backdrop-blur-xl border border-white/15 rounded-2xl p-6 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-10 text-emerald-400 pointer-events-none">
          <ShieldCheck className="w-80 h-80" />
        </div>

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center space-x-4">
            <img 
              src={currentUser.avatar} 
              alt={currentUser.nome} 
              className="w-16 h-16 rounded-2xl object-cover ring-4 ring-emerald-500/30 shadow-lg"
            />
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-2xl font-black text-white">{currentUser.nome}</h1>
                <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/40 backdrop-blur-md">
                  {meuSetorInfo?.nome || 'Setor'}
                </span>
              </div>
              <p className="text-sm text-slate-400 mt-0.5">{currentUser.cargo}</p>
            </div>
          </div>

          {/* Widgets de estatísticas rápidas (ofensiva, pontos totais e vitórias 1x1) */}
          <div className="grid grid-cols-3 gap-3 w-full md:w-auto">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-center hover:bg-white/10 transition-all">
              <div className="flex items-center justify-center space-x-1 text-orange-400 font-bold text-lg">
                <Flame className="w-5 h-5 fill-orange-500/30 text-orange-500" />
                <span>{currentUser.estatisticas?.streak_dias ?? 0}d</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">Ofensiva</div>
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-center hover:bg-white/10 transition-all">
              <div className="flex items-center justify-center space-x-1 text-emerald-400 font-bold text-lg">
                <Award className="w-5 h-5 text-emerald-400" />
                <span>{currentUser.estatisticas?.pontos_totais ?? 0}</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">Pontos Totais</div>
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 text-center hover:bg-white/10 transition-all">
              <div className="flex items-center justify-center space-x-1 text-purple-400 font-bold text-lg">
                <Swords className="w-5 h-5 text-purple-400" />
                <span>{currentUser.estatisticas?.desafios_vencidos ?? 0}</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">Vitórias 1x1</div>
            </div>
          </div>
        </div>
      </div>



      {/* Alerta de convites de Desafio 1x1 pendentes (aceitar e jogar / recusar) */}
      {desafiosPendentes.length > 0 && (
        <div className="bg-gradient-to-r from-purple-950/50 via-purple-900/30 to-slate-900/80 backdrop-blur-xl border border-purple-500/40 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-purple-500/20 text-purple-300 rounded-xl border border-purple-500/40 animate-pulse">
                <Swords className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Você recebeu um convite para Desafio 1x1!</h3>
                <p className="text-xs text-purple-200/80">Um colaborador de outro setor te desafiou. O tema será sorteado pelo sistema!</p>
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            {desafiosPendentes.map(des => (
              <div key={des.id} className="bg-white/5 backdrop-blur-md border border-purple-500/30 rounded-xl p-3.5 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-300 font-black text-sm">
                    1x1
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Desafio de {des.tema_sorteado}</div>
                    <div className="text-[11px] text-slate-400">
                      Vale <span className="text-emerald-400 font-bold">
                        {des.tipo === 'amistoso' 
                          ? `+${empresa?.configuracoes?.pontosVitoriaAmistoso ?? 50} pts individuais` 
                          : `+${des.pontuacao_setor || des.aposta_pontos || empresa?.configuracoes?.pontosVitoriaDesafio || 50} pts p/ o setor`}
                      </span> • {des.tipo === 'amistoso' ? 'Amistoso' : 'Competitivo'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      aceitarDesafio(des.id);
                      onIniciarDesafio(des.id);
                    }}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors shadow-md"
                  >
                    Aceitar & Jogar
                  </button>
                  <button
                    onClick={() => recusarDesafio(des.id)}
                    className="bg-white/5 hover:bg-white/10 text-slate-300 text-xs px-3 py-2 rounded-lg border border-white/10"
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grade principal: Quiz do dia + medalhas (coluna esquerda) e rankings (coluna direita) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Coluna Esquerda (2 cols): Quiz do Dia & Medalhas */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Cartão do Quiz Ativo (agendado): botão para iniciar ou estado concluído */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <Clock className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-extrabold text-white">Quiz Diário Agendado</h2>
              </div>
              <span className="text-xs bg-white/5 backdrop-blur-md text-slate-300 px-3 py-1 rounded-full border border-white/10 font-medium">
                Maratona SST 2026
              </span>
            </div>

            {pendenteQuiz ? (
              <div className="bg-white/5 backdrop-blur-md border border-emerald-500/30 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="font-bold text-base text-white">{pendenteQuiz.titulo}</h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Contém {pendenteQuiz.perguntas.length} perguntas objetivas sobre {pendenteQuiz.categoria}. Responda para manter sua ofensiva!
                  </p>
                </div>

                <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-white/10">
                  <div className="text-xs text-slate-400 flex items-center space-x-3">
                    <span>⏱ Tempo limite por pergunta</span>
                    <span className="text-emerald-400 font-bold">+{empresa?.configuracoes?.pontosPorAcertoQuiz || 10} pts por acerto</span>
                  </div>

                  <button
                    onClick={() => onIniciarQuiz(pendenteQuiz.id)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm px-5 py-2.5 rounded-xl transition-all shadow-lg flex items-center space-x-2"
                  >
                    <span>Iniciar Quiz Agora</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                <h3 className="font-bold text-slate-200">Você já concluiu todos os quizzes de hoje!</h3>
                <p className="text-xs text-slate-400">Excelente trabalho mantendo os treinamentos em dia. Que tal desafiar um colega de outro setor?</p>
                <button
                  onClick={() => setActiveTab('desafios')}
                  className="mt-3 inline-flex items-center space-x-2 bg-purple-600/20 text-purple-300 border border-purple-500/40 hover:bg-purple-600/30 font-bold text-xs px-4 py-2 rounded-xl transition-all"
                >
                  <Swords className="w-4 h-4" />
                  <span>Ir para Desafios 1x1</span>
                </button>
              </div>
            )}
          </div>

          {/* Vitrine de Medalhas e Conquistas do colaborador */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl">
            <h2 className="text-lg font-extrabold text-white mb-1 flex items-center space-x-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span>Minhas Medalhas & Conquistas</span>
            </h2>
            <p className="text-[11px] text-slate-400 mb-3">
              Temporada atual: <strong className="text-amber-300">{empresa.configuracoes.nome_temporada_atual || '1ª Temporada'}</strong>
              {' · '}{conquistadosOrdenados.length} conquistado(s) de carreira
            </p>

            {/* Busca/filtro de troféus */}
            <div className="relative mb-4">
              <input
                type="text"
                value={filtroBuscaTrofeu}
                onChange={(e) => setFiltroBuscaTrofeu(e.target.value)}
                placeholder="🔍 Buscar troféu pelo nome ou categoria..."
                className="w-full bg-slate-950/80 border border-white/10 rounded-xl p-2.5 pl-8 text-xs text-slate-200"
              />
            </div>

            {trofeusTemporadaAtual.length === 0 && conquistadosOrdenados.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-950/40 rounded-xl border border-white/5">
                Nenhum troféu configurado ainda. Fale com o administrador da empresa para definir as regras de troféus.
              </p>
            ) : (
              <>
                {/* VISÃO 1: Conquistados (com data, mais recentes primeiro) */}
                <h3 className="text-xs font-extrabold text-emerald-300 uppercase tracking-wider mb-2 flex items-center space-x-2">
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Conquistados ({conquistadosOrdenados.length})</span>
                </h3>

                {conquistadosOrdenados.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic mb-4">Você ainda não conquistou troféus. Continue jogando para desbloquear os próximos!</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    {conquistadosOrdenados
                      .filter(t => !filtroBuscaTrofeu || t.nome.toLowerCase().includes(filtroBuscaTrofeu.toLowerCase()) || t.categoria.toLowerCase().includes(filtroBuscaTrofeu.toLowerCase()))
                      .map((trofeu, i) => {
                        // Busca a regra correspondente para obter imagem/emoji (mesmo se a regra foi desativada depois).
                        const regraCorrespondente = trofeusTemporadaAtual.find(t => t.nome === trofeu.nome);
                        const icone = regraCorrespondente?.icone || emojiTrofeu(undefined);
                        const imagemPersonalizada = eImagemRealTrofeu(regraCorrespondente?.imagem || trofeu.imagem)
                          ? (regraCorrespondente?.imagem || trofeu.imagem)
                          : null;
                        return (
                          <div
                            key={`${trofeu.nome}-${trofeu.conquistado_em}`}
                            title={`Conquistado em ${new Date(trofeu.conquistado_em).toLocaleDateString('pt-BR')}${trofeu.temporada ? ` • ${trofeu.temporada}` : ''}`}
                            className="p-3.5 rounded-xl border transition-all text-center backdrop-blur-md bg-white/10 border-emerald-500/40 text-slate-100 shadow-md"
                          >
                            <div className="text-2xl mb-1 flex items-center justify-center">
                              {imagemPersonalizada ? (
                                <img src={imagemPersonalizada} alt={trofeu.nome} className="w-8 h-8 object-cover rounded-full" />
                              ) : (
                                <span>{icone}</span>
                              )}
                            </div>
                            <div className="text-xs font-bold line-clamp-1">{trofeu.nome}</div>
                            <div className="text-[10px] text-emerald-400 mt-0.5">
                              🏅 {new Date(trofeu.conquistado_em).toLocaleDateString('pt-BR')}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* VISÃO 2: Próximos de conquistar (com contador/progresso) */}
                <h3 className="text-xs font-extrabold text-amber-300 uppercase tracking-wider mb-2 flex items-center space-x-2">
                  <Award className="w-3.5 h-3.5" />
                  <span>Próximos de Conquistar ({proximosTrofeus.length})</span>
                </h3>

                {proximosTrofeus.length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic">Nenhum troféu próximo no momento. Continue evoluindo!</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {proximosTrofeus
                      .filter(t => !filtroBuscaTrofeu || t.nome.toLowerCase().includes(filtroBuscaTrofeu.toLowerCase()) || t.categoria.toLowerCase().includes(filtroBuscaTrofeu.toLowerCase()))
                      .map((trofeu, i) => {
                        const imagemPersonalizada = eImagemRealTrofeu(trofeu.imagem)
                          ? trofeu.imagem
                          : null;
                        const progresso = trofeu.progresso || 0;
                        const meta = trofeu.meta || 1;
                        const pct = Math.min(100, Math.round((progresso / meta) * 100));
                        const contador = trofeu.modoContagem === 'sequencial'
                          ? `${progresso} seguido(s)`
                          : `${progresso}/${meta}`;
                        return (
                          <div
                            key={i}
                            title={`${trofeu.categoria} — ${contador}`}
                            className="p-3.5 rounded-xl border transition-all text-center backdrop-blur-md bg-white/5 border-white/5 text-slate-300"
                          >
                            <div className="text-2xl mb-1 flex items-center justify-center">
                              {imagemPersonalizada ? (
                                <img src={imagemPersonalizada} alt={trofeu.nome} className="w-8 h-8 object-cover rounded-full opacity-80" />
                              ) : (
                                <span className="opacity-80">{trofeu.icone}</span>
                              )}
                            </div>
                            <div className="text-xs font-bold line-clamp-1">{trofeu.nome}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{trofeu.categoria}</div>
                            {/* Barra de progresso */}
                            <div className="w-full h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="text-[10px] font-bold text-amber-300 mt-1">{contador}</div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </>
            )}

            {/* Galeria de Troféus de Temporadas Anteriores (Linha do Tempo) */}
            {galeriaTemporadas.length > 0 && (
              <div className="mt-5 pt-4 border-t border-white/10 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-200 flex items-center space-x-2">
                  <Award className="w-4 h-4 text-emerald-400" />
                  <span>Linha do Tempo — Troféus por Temporada</span>
                </h3>

                {galeriaTemporadas.map((temporada, i) => (
                  <div key={i} className="bg-slate-950/50 rounded-xl border border-white/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="font-bold text-emerald-300 text-xs">
                        🏆 {temporada.temporada}
                        {(temporada.data_inicio || temporada.data_fim) && (
                          <span className="text-slate-400 font-normal ml-2">
                            {temporada.data_inicio || '—'} até {temporada.data_fim || '—'}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">{temporada.trofeus.length} troféu(s)</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {temporada.trofeus.map((trofeu, j) => {
                        // trofeus pode ser string (legado) ou objeto TrofeuConquistado.
                        const nomeTrofeu = typeof trofeu === 'string' ? trofeu : trofeu.nome;
                        const dataTrofeu = typeof trofeu === 'string' ? '' : trofeu.conquistado_em;
                        const regraCorrespondente = trofeusTemporadaAtual.find(t => t.nome === nomeTrofeu);
                        const imagemPersonalizada = eImagemRealTrofeu(regraCorrespondente?.imagem || (typeof trofeu !== 'string' ? trofeu.imagem : ''))
                          ? (regraCorrespondente?.imagem || (typeof trofeu !== 'string' ? trofeu.imagem : '') || '')
                          : null;
                        return (
                          <span
                            key={j}
                            title={dataTrofeu ? `Conquistado em ${new Date(dataTrofeu).toLocaleDateString('pt-BR')}` : nomeTrofeu}
                            className="inline-flex items-center space-x-1.5 bg-white/5 border border-emerald-500/20 rounded-full px-2.5 py-1 text-[11px] text-slate-200"
                          >
                            {imagemPersonalizada ? (
                              <img src={imagemPersonalizada} alt={nomeTrofeu} className="w-4 h-4 object-cover rounded-full" />
                            ) : (
                              <span>{regraCorrespondente ? regraCorrespondente.icone : emojiTrofeu(undefined)}</span>
                            )}
                            <span>{nomeTrofeu}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Coluna Direita (1 col): Média Justa por Setor & Ranking Top 3 com regra de privacidade */}
        <div className="space-y-6">
          
          {/* Cartão do Ranking Justo por Setor (média ÷ colaboradores ativos) */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-extrabold text-white flex items-center space-x-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  <span>Média Justa por Setor</span>
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Pontos divididos pelo nº de colaboradores ativos</p>
              </div>
            </div>

            {meuSetorRanking && (
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-3.5 mb-4 text-xs backdrop-blur-md">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold text-emerald-300">Meu Setor: {meuSetorRanking.setor_nome}</span>
                  <span className="font-extrabold text-emerald-400 text-sm">{meuSetorRanking.pontuacao_media} pts/membro</span>
                </div>
                <div className="text-slate-300 text-[11px]">
                  Taxa de participação: <span className="font-bold text-white">{meuSetorRanking.taxa_participacao}%</span> 
                  {meuSetorRanking.elegivel ? (
                    <span className="ml-2 text-emerald-400 font-bold">✓ Elegível (≥50%)</span>
                  ) : (
                    <span className="ml-2 text-rose-400 font-bold">⚠ Inelegível (&lt;50%)</span>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              {rankingsSetoresExibicao.slice(0, 5).map(setorRank => (
                <div 
                  key={setorRank.setor_id}
                  className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-colors backdrop-blur-md ${
                    setorRank.setor_id === currentUser.setor_id
                      ? 'bg-white/15 border-emerald-500/50 text-emerald-300 font-semibold'
                      : 'bg-white/5 border-white/10 text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center font-black text-[11px] ${
                      setorRank.posicao === 1 ? 'bg-amber-400 text-slate-950' :
                      setorRank.posicao === 2 ? 'bg-slate-300 text-slate-950' :
                      setorRank.posicao === 3 ? 'bg-amber-700 text-white' : 'bg-white/10 text-slate-400'
                    }`}>
                      {setorRank.posicao}
                    </span>
                    <span className="truncate">{setorRank.setor_nome}</span>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-bold text-slate-100">{setorRank.pontuacao_media} pts</div>
                    {!setorRank.elegivel && (
                      <div className="text-[10px] text-rose-400 font-medium">Inelegível (&lt;50%)</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setActiveTab('rankings')}
              className="w-full mt-4 text-center text-xs text-emerald-400 hover:text-emerald-300 font-bold py-1.5"
            >
              Ver Detalhes do Ranking de Setores →
            </button>
          </div>

          {/* Ranking Geral Top 3 (Regra de Privacidade do PDF) */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl">
            <h2 className="text-base font-extrabold text-white mb-2 flex items-center space-x-2">
              <Award className="w-5 h-5 text-amber-400" />
              <span>Ranking Geral (Top 3)</span>
            </h2>
            <p className="text-[11px] text-slate-400 mb-4">
              Por regra de privacidade, apenas o Top 3 é exibido publicamente.
            </p>

            <div className="space-y-3">
              {top3Colaboradores.map((colab, idx) => (
                <div key={colab.id} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-3 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-xs ${
                      idx === 0 ? 'bg-amber-400 text-slate-950' :
                      idx === 1 ? 'bg-slate-300 text-slate-950' : 'bg-amber-700 text-white'
                    }`}>
                      {idx + 1}
                    </div>
                    <img src={colab.avatar} alt={colab.nome} className="w-8 h-8 rounded-full object-cover" />
                    <div>
                      <div className="font-bold text-slate-200">{colab.nome}</div>
                      <div className="text-[10px] text-slate-400">{colab.cargo}</div>
                    </div>
                  </div>

                  <div className="font-black text-emerald-400 text-sm">
                    {colab.estatisticas?.pontos_totais ?? 0} pts
                  </div>
                </div>
              ))}

              {/* Se o usuário NÃO estiver no Top 3, mostra a própria posição abaixo */}
              {!isUserInTop3 && (
                <div className="pt-3 border-t border-white/10">
                  <div className="text-[11px] text-slate-400 mb-1 font-medium">Sua Posição Atual:</div>
                  <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between text-xs backdrop-blur-md">
                    <div className="flex items-center space-x-3">
                      <div className="w-6 h-6 rounded-full bg-white/10 border border-emerald-500 text-emerald-300 flex items-center justify-center font-black text-xs">
                        #{userRankIndex + 1}
                      </div>
                      <img src={currentUser.avatar} alt={currentUser.nome} className="w-8 h-8 rounded-full object-cover" />
                      <div>
                        <div className="font-bold text-emerald-300">{currentUser.nome}</div>
                        <div className="text-[10px] text-slate-300">Você</div>
                      </div>
                    </div>

                    <div className="font-black text-emerald-400 text-sm">
                      {currentUser.estatisticas?.pontos_totais ?? 0} pts
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
