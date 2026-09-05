// ======================================================================
// RankingsView.tsx — Tela de Rankings de Engajamento & SST
// ----------------------------------------------------------------------
// Conecta-se ao contexto useSST para exibir, a partir do usuário logado:
//   • Ranking de Setores por média justa (pontos ÷ colaboradores ativos),
//     com regra de elegibilidade mínima de participação (percentual config);
//   • Ranking Individual de Colaboradores com regra de privacidade
//     (não-admin vê apenas o Top 3 + a própria posição se estiver fora);
//   • Histórico de temporadas encerradas (pódios de setores e colaboradores).
// Admins/super-admins visualizam rankings completos; colaboradores vêem
// versões filtradas pelas regras de elegibilidade e privacidade.
// ======================================================================
import React, { useState } from 'react';
import { useSST } from '../../context/SSTContext';
import { 
  Award, 
  TrendingUp, 
  ShieldAlert, 
  CheckCircle2, 
  HelpCircle,
  Trophy,
  Flame,
  Calendar,
  History,
  Coins
} from 'lucide-react';

export const RankingsView: React.FC = () => {
  // Contexto useSST: usuário logado, funções de ranking (setores e
  // colaboradores) e configurações da empresa (temporada, percentual, prêmios).
  const { 
    currentUser, 
    getRankingsSetores, 
    getRankingsColaboradores, 
    empresa 
  } = useSST();

  // Estado da aba ativa e da temporada histórica selecionada no snapshot
  const [activeSubTab, setActiveSubTab] = useState<'setores' | 'colaboradores' | 'historico'>('setores');
  const [selectedHistoricoId, setSelectedHistoricoId] = useState<string | null>(null);

  // Rankings calculados pelo contexto (setores e colaboradores)
  const rankingsSetores = getRankingsSetores();
  const rankingsColaboradores = getRankingsColaboradores();

  // Admins/super-admins possuem visão completa dos rankings
  const isAdminOrSuper = currentUser.perfil === 'admin' || currentUser.perfil === 'super_admin';

  // Regra de visibilidade de setores: colaboradores só vêem setores elegíveis
  // e o próprio setor (para acompanhar a posição mesmo se inelegível).
  const rankingsSetoresExibicao = isAdminOrSuper 
    ? rankingsSetores 
    : rankingsSetores.filter(s => s.elegivel || s.setor_id === currentUser.setor_id);

  // Regra de privacidade: colaborador vê apenas o Top 3. Se estiver fora do
  // Top 3, mostra o Top 3 + a posição do próprio usuário.
  const userRankIndex = rankingsColaboradores.findIndex(u => u.id === currentUser.id);
  const isUserInTop3 = userRankIndex >= 0 && userRankIndex < 3;
  
  const exibicaoColaboradores = isAdminOrSuper 
    ? rankingsColaboradores 
    : rankingsColaboradores.slice(0, 3);

  // Histórico de temporadas: seleciona a temporada escolhida ou a primeira disponível
  const historicos = empresa.historico_temporadas || [];
  const historicoSelecionado = historicos.find(h => h.id === selectedHistoricoId) || historicos[0] || null;

  return (
    <div className="space-y-6 pb-12">
      
      {/* Cabeçalho com banner e selo da temporada ativa */}
      <div className="bg-gradient-to-r from-slate-950/80 via-indigo-950/40 to-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-2xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-500/20 text-amber-300 rounded-xl border border-amber-500/40 backdrop-blur-md">
                <Award className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white">Rankings de Engajamento & SST</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Pontuação unificada de Quizzes + Desafios 1x1 ponderada por temporada
                </p>
              </div>
            </div>
          </div>

          {/* Alternador de abas (Média por Setor / Ranking Colaboradores / Histórico) */}
          <div className="flex bg-slate-950/60 p-1 rounded-xl border border-white/10 text-xs font-bold backdrop-blur-md flex-wrap gap-1">
            <button
              onClick={() => setActiveSubTab('setores')}
              className={`px-3.5 py-2 rounded-lg transition-all ${
                activeSubTab === 'setores'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Média por Setor
            </button>
            <button
              onClick={() => setActiveSubTab('colaboradores')}
              className={`px-3.5 py-2 rounded-lg transition-all ${
                activeSubTab === 'colaboradores'
                  ? 'bg-emerald-500 text-slate-950 font-black shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ranking Colaboradores
            </button>
            <button
              onClick={() => setActiveSubTab('historico')}
              className={`px-3.5 py-2 rounded-lg transition-all flex items-center space-x-1.5 ${
                activeSubTab === 'historico'
                  ? 'bg-purple-600 text-white font-black shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Histórico de Temporadas ({historicos.length})</span>
            </button>
          </div>
        </div>

        {/* Cartão com informações da temporada ativa (período e pontos de prêmios) */}
        <div className="p-3 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between flex-wrap gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-extrabold text-white">
              Temporada Ativa: <span className="text-emerald-300">{empresa.configuracoes.nome_temporada_atual || '1ª Temporada Oficial'}</span>
            </span>
          </div>

          <div className="flex items-center space-x-4 text-slate-300 text-[11px]">
            <div className="flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Período: <strong>{empresa.configuracoes.data_inicio_temporada || 'Hoje'}</strong> até <strong>{empresa.configuracoes.data_fim_temporada || 'Em andamento'}</strong>
              </span>
            </div>

            <div className="flex items-center space-x-1 text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/30 font-semibold">
              <Coins className="w-3 h-3 text-amber-400" />
              <span>Seus Pontos de Prêmios: {currentUser.estatisticas.pontos_resgataveis ?? currentUser.estatisticas.pontos_totais ?? 0} pts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Aba 1: Ranking Justo de Setores (média por colaborador) */}
      {activeSubTab === 'setores' && (
        <div className="space-y-6">
          
          {/* Caixa explicativa sobre a fórmula e a regra dos 50% */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5 text-white text-xs leading-relaxed space-y-2 shadow-xl">
            <div className="flex items-center space-x-2 text-emerald-400 font-extrabold text-sm">
              <HelpCircle className="w-4 h-4" />
              <span>Como funciona o cálculo do Ranking de Setores?</span>
            </div>
            <p className="text-slate-300">
              Para garantir total justiça entre departamentos pequenos e grandes, o ranking de setores <strong>NÃO utiliza a soma bruta de pontos</strong>. O resultado é calculated dividindo os pontos totais pelo número de colaboradores ativos do setor:
            </p>
            <div className="bg-slate-950/60 backdrop-blur-md border border-white/10 rounded-xl p-3 font-mono text-[11px] text-emerald-300">
              Média do Setor = (Pontos de Quizzes + Pontos de Desafios 1x1 Vencidos) ÷ (Nº de Colaboradores Ativos do Setor)
            </div>
            <p className="text-slate-400 text-[11px]">
              * <strong>Regra de Participação Mínima:</strong> É obrigatório que pelo menos <span className="text-amber-400 font-bold">{empresa.configuracoes.percentualMinimoParticipacao}% dos colaboradores ativos</span> do setor respondam a ao menos um quiz ou desafio no período. Setores abaixo do mínimo ficam inelegíveis para o ranking do período!
            </p>
          </div>

          {/* Lista de cartões do ranking de setores */}
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
            <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              <span>Classificação Geral dos Setores</span>
            </h2>

            <div className="space-y-3">
              {rankingsSetoresExibicao.map((setorRank) => (
                <div 
                  key={setorRank.setor_id}
                  className={`p-4 rounded-xl border transition-all backdrop-blur-md ${
                    !setorRank.elegivel
                      ? 'bg-rose-950/30 border-rose-500/40 text-slate-300'
                      : setorRank.posicao === 1
                      ? 'bg-amber-950/30 border-amber-500/50 text-slate-100 shadow-lg'
                      : 'bg-white/5 border-white/10 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    
                    {/* Número da posição e nome do setor */}
                    <div className="flex items-center space-x-3.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shadow-md ${
                        !setorRank.elegivel ? 'bg-rose-900/60 text-rose-300 border border-rose-500/40' :
                        setorRank.posicao === 1 ? 'bg-amber-400 text-slate-950' :
                        setorRank.posicao === 2 ? 'bg-slate-300 text-slate-950' :
                        setorRank.posicao === 3 ? 'bg-amber-700 text-white' : 'bg-white/10 text-slate-300'
                      }`}>
                        {setorRank.elegivel ? `#${setorRank.posicao}` : '!'}
                      </div>

                      <div>
                        <div className="flex items-center space-x-2">
                          <h3 className="font-extrabold text-base text-white">{setorRank.setor_nome}</h3>
                          {setorRank.setor_id === currentUser.setor_id && (
                            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/40">
                              Meu Setor
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {setorRank.colaboradores_participantes} de {setorRank.total_colaboradores_ativos} colaboradores ativos participaram ({setorRank.taxa_participacao}%)
                        </div>
                      </div>
                    </div>

                    {/* Estatísticas e média por membro */}
                    <div className="flex items-center space-x-6">
                      <div className="text-right hidden sm:block">
                        <div className="text-xs text-slate-400">Pontos de Quizzes: <span className="font-bold text-slate-200">{setorRank.total_pontos_quizzes}</span></div>
                        <div className="text-xs text-slate-400">Pontos de Desafios: <span className="font-bold text-purple-400">{setorRank.total_pontos_desafios}</span></div>
                      </div>

                      <div className="text-right">
                        <div className="text-xl font-black text-emerald-400">
                          {setorRank.pontuacao_media} <span className="text-xs text-slate-400 font-normal">pts/membro</span>
                        </div>

                        {setorRank.elegivel ? (
                          <div className="text-[11px] text-emerald-400 font-bold flex items-center justify-end space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Elegível (≥{empresa.configuracoes.percentualMinimoParticipacao ?? 50}%)</span>
                          </div>
                        ) : (
                          <div className="text-[11px] text-rose-400 font-bold flex items-center justify-end space-x-1">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>Inelegível (&lt;{empresa.configuracoes.percentualMinimoParticipacao ?? 50}% de adesão)</span>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Barra de alerta para setor inelegível */}
                  {!setorRank.elegivel && (
                    <div className="mt-3 pt-2 border-t border-rose-500/20 text-[11px] text-rose-300/90 flex items-center space-x-1.5">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>
                        Atenção: Este setor possui apenas {setorRank.taxa_participacao}% de participação. É necessário engajar mais {Math.max(0, Math.ceil(setorRank.total_colaboradores_ativos * ((empresa.configuracoes.percentualMinimoParticipacao ?? 50) / 100)) - setorRank.colaboradores_participantes)} colaboradores para voltar ao ranking!
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* Aba 2: Ranking Individual de Colaboradores */}
      {activeSubTab === 'colaboradores' && (
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 text-white shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-white flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <span>Ranking Individual dos Colaboradores</span>
              </h2>
              {!isAdminOrSuper && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Regra de Privacidade: Apenas o Top 3 é exibido publicamente.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {exibicaoColaboradores.map((colab, idx) => (
              <div 
                key={colab.id}
                className={`p-4 rounded-xl border flex items-center justify-between flex-wrap gap-3 text-xs transition-all backdrop-blur-md ${
                  colab.id === currentUser.id
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-white font-semibold shadow-lg'
                    : 'bg-white/5 border-white/10 text-slate-300'
                }`}
              >
                <div className="flex items-center space-x-3.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${
                    idx === 0 ? 'bg-amber-400 text-slate-950' :
                    idx === 1 ? 'bg-slate-300 text-slate-950' :
                    idx === 2 ? 'bg-amber-700 text-white' : 'bg-white/10 text-slate-300'
                  }`}>
                    #{idx + 1}
                  </div>

                  <img src={colab.avatar} alt={colab.nome} className="w-9 h-9 rounded-full object-cover border border-white/10" />

                  <div>
                    <div className="font-extrabold text-sm text-white flex items-center space-x-2">
                      <span>{colab.nome}</span>
                      {colab.id === currentUser.id && (
                        <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.2 rounded-full border border-emerald-500/40">
                          Você
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">{colab.cargo}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-1 text-orange-400 font-bold">
                    <Flame className="w-4 h-4 fill-orange-500/30 text-orange-500" />
                    <span>{colab.estatisticas?.streak_dias ?? 0}d</span>
                  </div>

                  <div className="text-right font-black text-emerald-400 text-base">
                    {colab.estatisticas?.pontos_totais ?? 0} pts
                  </div>
                </div>
              </div>
            ))}

            {/* Se o usuário não for admin, estiver fora do Top 3 E presente no ranking,
                mostra a própria posição abaixo (evita renderizar #0 quando não ranqueado) */}
            {!isAdminOrSuper && !isUserInTop3 && userRankIndex >= 0 && (
              <div className="pt-4 border-t border-white/10">
                <div className="text-xs text-slate-400 mb-2 font-semibold">Sua Posição Individual:</div>
                <div className="bg-emerald-950/50 backdrop-blur-md border border-emerald-500/50 rounded-xl p-4 flex items-center justify-between text-xs shadow-lg">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-8 h-8 rounded-full bg-white/10 border border-emerald-500 text-emerald-300 flex items-center justify-center font-black text-xs">
                      #{userRankIndex + 1}
                    </div>
                    <img src={currentUser.avatar} alt={currentUser.nome} className="w-9 h-9 rounded-full object-cover border border-white/10" />
                    <div>
                      <div className="font-extrabold text-sm text-emerald-300">{currentUser.nome}</div>
                      <div className="text-[11px] text-slate-300">{currentUser.cargo}</div>
                    </div>
                  </div>

                  <div className="font-black text-emerald-400 text-base">
                    {currentUser.estatisticas?.pontos_totais ?? 0} pts
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Aba 3: Snapshot do Histórico de Temporadas */}
      {activeSubTab === 'historico' && (
        <div className="space-y-6">
          {historicos.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center space-y-3">
              <History className="w-12 h-12 text-slate-500 mx-auto" />
              <h3 className="text-base font-bold text-white">Nenhum histórico de temporada arquivado ainda</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Assim que o administrador encerrar a temporada atual em vigor, os pódios de setores e colaboradores desta temporada serão salvos aqui para consulta permanente!
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Cartões seletores de temporadas arquivadas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {historicos.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setSelectedHistoricoId(h.id)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      (historicoSelecionado?.id === h.id)
                        ? 'bg-purple-950/60 border-purple-500/60 shadow-xl ring-2 ring-purple-500/40 text-white'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-extrabold text-sm">{h.nome_temporada}</span>
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30">
                        Arquivada
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>Encerrada em: {h.data_encerramento}</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Detalhes históricos da temporada selecionada */}
              {historicoSelecionado && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 text-white space-y-6 shadow-xl">
                  <div className="border-b border-white/10 pb-4 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h3 className="text-lg font-black text-purple-300 flex items-center space-x-2">
                        <Trophy className="w-5 h-5 text-amber-400" />
                        <span>{historicoSelecionado.nome_temporada} — Pódio Histórico</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Registrado oficialmente em {historicoSelecionado.data_encerramento}
                      </p>
                    </div>
                  </div>

                  {/* Pódio histórico de setores da temporada (Top 3 + meu setor) */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span>Ranking de Setores da Temporada</span>
                    </h4>

                    {/* Top 3 setores */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {historicoSelecionado.rankings_setores.slice(0, 3).map((sRank) => (
                        <div 
                          key={sRank.setor_id}
                          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                            sRank.posicao === 1 
                              ? 'bg-amber-950/40 border-amber-500/50 text-amber-200' 
                              : 'bg-slate-950/60 border-white/10 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs ${
                              sRank.posicao === 1 ? 'bg-amber-400 text-slate-950' :
                              sRank.posicao === 2 ? 'bg-slate-300 text-slate-950' :
                              'bg-amber-700 text-white'
                            }`}>
                              #{sRank.posicao}
                            </span>
                            <div>
                              <div className="font-bold text-white">{sRank.setor_nome}</div>
                              <div className="text-[10px] text-slate-400">{sRank.total_colaboradores_ativos ?? 0} colaboradores</div>
                            </div>
                          </div>
                          <div className="text-right font-black text-emerald-400 text-sm">
                            {sRank.pontuacao_media ?? 0} pts/membro
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Posição do próprio setor do colaborador (se fora do Top 3) */}
                    {(() => {
                      const meuSetorHistorico = historicoSelecionado.rankings_setores.find(s => s.setor_id === currentUser.setor_id);
                      if (meuSetorHistorico && meuSetorHistorico.posicao > 3) {
                        return (
                          <div className="p-3.5 rounded-xl border border-indigo-500/40 bg-indigo-950/30 flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-3">
                              <span className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center font-black text-xs text-white">
                                #{meuSetorHistorico.posicao}
                              </span>
                              <div>
                                <div className="font-bold text-white">📌 Meu Setor: {meuSetorHistorico.setor_nome}</div>
                                <div className="text-[10px] text-slate-400">Sua posição no pódio da temporada</div>
                              </div>
                            </div>
                            <div className="text-right font-black text-emerald-400 text-sm">
                              {meuSetorHistorico.pontuacao_media ?? 0} pts/membro
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* Pódio histórico de colaboradores da temporada (Top 3 + minha posição) */}
                  <div className="space-y-3 pt-4 border-t border-white/10">
                    <h4 className="text-xs font-extrabold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
                      <Award className="w-4 h-4 text-amber-400" />
                      <span>Ranking de Colaboradores da Temporada</span>
                    </h4>

                    {/* Top 3 colaboradores */}
                    <div className="space-y-2">
                      {historicoSelecionado.rankings_colaboradores.slice(0, 3).map((cRank) => (
                        <div 
                          key={cRank.usuario_id}
                          className="p-3 rounded-xl bg-slate-950/60 border border-white/10 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center space-x-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[11px] ${
                              cRank.posicao === 1 ? 'bg-amber-400 text-slate-950' :
                              cRank.posicao === 2 ? 'bg-slate-300 text-slate-950' :
                              'bg-amber-700 text-white'
                            }`}>
                              #{cRank.posicao}
                            </span>
                            <img src={cRank.avatar} alt={cRank.nome} className="w-8 h-8 rounded-full object-cover" />
                            <div>
                              <div className="font-bold text-white">{cRank.nome}</div>
                              <div className="text-[10px] text-slate-400">{cRank.setor_nome} • {cRank.cargo}</div>
                            </div>
                          </div>
                          <div className="font-black text-emerald-400">
                            {cRank.pontos_totais} pts
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Posição do próprio colaborador (se fora do Top 3) */}
                    {(() => {
                      const meuRankHistorico = historicoSelecionado.rankings_colaboradores.find(c => c.usuario_id === currentUser.id);
                      if (meuRankHistorico && meuRankHistorico.posicao > 3) {
                        return (
                          <div className="p-3 rounded-xl border border-indigo-500/40 bg-indigo-950/30 flex items-center justify-between text-xs">
                            <div className="flex items-center space-x-3">
                              <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-black text-[11px] text-white">
                                #{meuRankHistorico.posicao}
                              </span>
                              <img src={meuRankHistorico.avatar} alt={meuRankHistorico.nome} className="w-8 h-8 rounded-full object-cover" />
                              <div>
                                <div className="font-bold text-white">📌 {meuRankHistorico.nome} (Você)</div>
                                <div className="text-[10px] text-slate-400">Sua posição no pódio da temporada</div>
                              </div>
                            </div>
                            <div className="font-black text-emerald-400">
                              {meuRankHistorico.pontos_totais} pts
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
};
