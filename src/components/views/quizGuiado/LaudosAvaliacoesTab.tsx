import React, { useState, useMemo } from 'react';
import { useSST } from '../../../context/SSTContext';
import { ResultadoAvaliacaoSST } from '../../../types';
import { 
  FileText, 
  Search, 
  Printer, 
  Download, 
  Trash2, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Award, 
  AlertTriangle, 
  Calendar, 
  User, 
  Eye, 
  Sparkles,
  Building2,
  Filter,
  Check,
  FileSpreadsheet
} from 'lucide-react';

interface LaudosAvaliacoesTabProps {
  onVisualizarLaudo: (resultado: ResultadoAvaliacaoSST) => void;
  onImprimirLaudo: (resultado: ResultadoAvaliacaoSST) => void;
  onBaixarPdfLaudo: (resultado: ResultadoAvaliacaoSST) => void;
  isGerandoPdfId?: string | null;
}

export const LaudosAvaliacoesTab: React.FC<LaudosAvaliacoesTabProps> = ({
  onVisualizarLaudo,
  onImprimirLaudo,
  onBaixarPdfLaudo,
  isGerandoPdfId = null,
}) => {
  const { 
    currentUser, 
    resultadosAvaliacaoSST, 
    salasQuizGuiado, 
    excluirResultadoAvaliacaoSST 
  } = useSST();

  // Estados de busca, filtros e paginação/ordenação
  const [buscaGeral, setBuscaGeral] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'aprovados' | 'reprovados'>('todos');
  const [ordenacao, setOrdenacao] = useState<'recente' | 'antigo' | 'maior_nota' | 'menor_nota' | 'nome'>('recente');

  // Estado da modal de confirmação de exclusão
  const [laudoParaExcluir, setLaudoParaExcluir] = useState<ResultadoAvaliacaoSST | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [sucessoExclusaoMsg, setSucessoExclusaoMsg] = useState('');

  const isSuperAdmin = currentUser?.perfil === 'super_admin';
  const isAdminEmpresa = currentUser?.perfil === 'admin';
  const isInstrutor = currentUser?.is_instrutor || isAdminEmpresa || isSuperAdmin;

  // REGRAS DE PRIVACIDADE E ESCOPO:
  // Os laudos permanecem armazenados mesmo após a sala ser excluída!
  const laudosVisiveis = useMemo(() => {
    const todos = resultadosAvaliacaoSST || [];
    return todos.filter(r => {
      // 1. Super Admin enxerga tudo
      if (isSuperAdmin) return true;

      // 2. Admin da empresa enxerga da própria empresa
      if (isAdminEmpresa) {
        if (r.empresa_id) return r.empresa_id === currentUser?.empresa_id;
        const sala = (salasQuizGuiado || []).find(s => s.id === r.sala_id);
        if (sala) return sala.empresa_id === currentUser?.empresa_id;
        // Fallback: se não tiver sala_id ou empresa_id definido, assume pertencer à empresa atual se criada por instrutor da empresa
        return true;
      }

      // 3. Instrutor enxerga os treinamentos que ministrou
      if (currentUser?.is_instrutor) {
        if (r.instrutor_id && r.instrutor_id === currentUser.id) return true;
        if (r.instrutor_nome && currentUser?.nome && r.instrutor_nome.trim().toLowerCase() === currentUser.nome.trim().toLowerCase()) return true;
        const sala = (salasQuizGuiado || []).find(s => s.id === r.sala_id);
        if (sala && (sala.instrutor_id === currentUser.id || sala.empresa_id === currentUser.empresa_id)) return true;
        return false;
      }

      // 4. Colaborador/Participante: apenas suas próprias avaliações
      return r.participante_id === currentUser?.id || 
             (r.matricula && currentUser?.matricula && r.matricula === currentUser.matricula) ||
             (r.cpf && currentUser?.cpf && r.cpf === currentUser.cpf);
    });
  }, [resultadosAvaliacaoSST, salasQuizGuiado, currentUser, isSuperAdmin, isAdminEmpresa]);

  // Aplicação da busca geral e filtros
  const laudosFiltrados = useMemo(() => {
    let list = [...laudosVisiveis];

    // Busca geral (nome do usuário, nome da sala, matrícula, CPF, código)
    if (buscaGeral.trim()) {
      const q = buscaGeral.toLowerCase().trim();
      list = list.filter(r => {
        const nomePart = (r.participante_nome || '').toLowerCase();
        const nomeSala = (r.sala_nome || r.treinamento_titulo || '').toLowerCase();
        const mat = (r.matricula || '').toLowerCase();
        const doc = (r.cpf || r.cpf_ou_empresa || '').toLowerCase();
        const cargo = (r.cargo || '').toLowerCase();
        const codDoc = (r.codigo_documento || '').toLowerCase();
        const codSess = (r.sessao_codigo || '').toLowerCase();
        const pin = (r.sala_pin || '').toLowerCase();
        const inst = (r.instrutor_nome || '').toLowerCase();

        return (
          nomePart.includes(q) ||
          nomeSala.includes(q) ||
          mat.includes(q) ||
          doc.includes(q) ||
          cargo.includes(q) ||
          codDoc.includes(q) ||
          codSess.includes(q) ||
          pin.includes(q) ||
          inst.includes(q)
        );
      });
    }

    // Filtro por situação
    if (filtroSituacao === 'aprovados') {
      list = list.filter(r => r.situacao === 'APROVADO');
    } else if (filtroSituacao === 'reprovados') {
      list = list.filter(r => r.situacao === 'NAO_APROVADO');
    }

    // Ordenação
    list.sort((a, b) => {
      if (ordenacao === 'recente') {
        const dataA = a.data_finalizacao || a.data || '';
        const dataB = b.data_finalizacao || b.data || '';
        return dataB.localeCompare(dataA);
      }
      if (ordenacao === 'antigo') {
        const dataA = a.data_finalizacao || a.data || '';
        const dataB = b.data_finalizacao || b.data || '';
        return dataA.localeCompare(dataB);
      }
      if (ordenacao === 'maior_nota') {
        return (b.nota_final || 0) - (a.nota_final || 0);
      }
      if (ordenacao === 'menor_nota') {
        return (a.nota_final || 0) - (b.nota_final || 0);
      }
      if (ordenacao === 'nome') {
        return (a.participante_nome || '').localeCompare(b.participante_nome || '');
      }
      return 0;
    });

    return list;
  }, [laudosVisiveis, buscaGeral, filtroSituacao, ordenacao]);

  // Estatísticas do conjunto visível
  const stats = useMemo(() => {
    const total = laudosVisiveis.length;
    if (total === 0) return { total: 0, aprovados: 0, reprovados: 0, taxaAprovacao: 0, mediaNotas: '0.0' };

    const aprovados = laudosVisiveis.filter(r => r.situacao === 'APROVADO').length;
    const reprovados = total - aprovados;
    const taxaAprovacao = Math.round((aprovados / total) * 100);
    const somaNotas = laudosVisiveis.reduce((acc, cur) => acc + (cur.nota_final || 0), 0);
    const mediaNotas = (somaNotas / total).toFixed(1);

    return { total, aprovados, reprovados, taxaAprovacao, mediaNotas };
  }, [laudosVisiveis]);

  // Confirmação de exclusão individual
  const handleConfirmarExclusao = async () => {
    if (!laudoParaExcluir) return;
    setExcluindo(true);
    try {
      await excluirResultadoAvaliacaoSST(laudoParaExcluir.id);
      const nomeRemovido = laudoParaExcluir.participante_nome;
      setLaudoParaExcluir(null);
      setSucessoExclusaoMsg(`Laudo da avaliação de "${nomeRemovido}" excluído com sucesso.`);
      setTimeout(() => setSucessoExclusaoMsg(''), 4000);
    } catch (err) {
      console.error('Erro ao excluir laudo:', err);
      alert('Não foi possível excluir o laudo. Verifique suas permissões.');
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Banner Informativo & Resumo da Central de Provas */}
      <div className="bg-slate-900/90 border border-emerald-500/30 rounded-3xl p-6 text-white shadow-2xl backdrop-blur-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center space-x-2">
              <span className="bg-emerald-500/20 text-emerald-300 text-xs font-black px-3 py-1 rounded-full border border-emerald-500/40 uppercase tracking-wider flex items-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Arquivo Permanente de Provas e Laudos SST</span>
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Laudos & PDFs de Avaliações Oficiais
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              Todos os laudos e fichas de avaliação teórica gerados permanecem arquivados com validade documental, mesmo após o encerramento ou exclusão das salas de quiz.
            </p>
          </div>

          {/* Cards de Métricas Rápidas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="bg-slate-950/80 border border-white/10 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Laudos</span>
              <span className="text-lg font-black text-white">{stats.total}</span>
            </div>
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold text-emerald-400 uppercase block">Aprovados</span>
              <span className="text-lg font-black text-emerald-300">{stats.aprovados} ({stats.taxaAprovacao}%)</span>
            </div>
            <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold text-rose-400 uppercase block">Não Aprovados</span>
              <span className="text-lg font-black text-rose-300">{stats.reprovados}</span>
            </div>
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-3 text-center">
              <span className="text-[10px] font-bold text-amber-400 uppercase block">Média Geral</span>
              <span className="text-lg font-black text-amber-300">{stats.mediaNotas} <span className="text-[11px] font-normal text-slate-400">/ 10</span></span>
            </div>
          </div>
        </div>
      </div>

      {/* Alerta de Feedback de Exclusão */}
      {sucessoExclusaoMsg && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{sucessoExclusaoMsg}</span>
        </div>
      )}

      {/* BARRA DE CONTROLE: BUSCA GERAL E FILTROS */}
      <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-5 text-white shadow-xl space-y-4 backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Campo de Busca Geral */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={buscaGeral}
              onChange={(e) => setBuscaGeral(e.target.value)}
              placeholder="Buscar por nome do usuário, nome da sala/treinamento, matrícula, CPF, código ou PIN..."
              className="w-full bg-slate-950 border border-white/15 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
            />
            {buscaGeral && (
              <button
                onClick={() => setBuscaGeral('')}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded-lg bg-white/10"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Filtros de Situação e Ordenação */}
          <div className="flex items-center flex-wrap gap-2 shrink-0">
            {/* Filtro Situação */}
            <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-white/10">
              <button
                onClick={() => setFiltroSituacao('todos')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  filtroSituacao === 'todos' 
                    ? 'bg-emerald-500 text-slate-950 shadow-md' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Todos ({laudosVisiveis.length})
              </button>
              <button
                onClick={() => setFiltroSituacao('aprovados')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  filtroSituacao === 'aprovados' 
                    ? 'bg-emerald-500 text-slate-950 shadow-md' 
                    : 'text-slate-400 hover:text-emerald-400'
                }`}
              >
                Aprovados
              </button>
              <button
                onClick={() => setFiltroSituacao('reprovados')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  filtroSituacao === 'reprovados' 
                    ? 'bg-rose-500 text-white shadow-md' 
                    : 'text-slate-400 hover:text-rose-400'
                }`}
              >
                Não Aprovados
              </button>
            </div>

            {/* Ordenação */}
            <select
              value={ordenacao}
              onChange={(e) => setOrdenacao(e.target.value as any)}
              className="bg-slate-950 border border-white/15 rounded-2xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="recente">Mais Recentes Primeiro</option>
              <option value="antigo">Mais Antigos Primeiro</option>
              <option value="maior_nota">Maior Nota</option>
              <option value="menor_nota">Menor Nota</option>
              <option value="nome">Nome do Participante (A-Z)</option>
            </select>
          </div>
        </div>

        {buscaGeral && (
          <div className="text-[11px] text-slate-400 flex items-center space-x-1 pt-1">
            <span>Resultados encontrados para "<strong className="text-white">{buscaGeral}</strong>":</span>
            <span className="font-bold text-emerald-400">{laudosFiltrados.length} laudo(s)</span>
          </div>
        )}
      </div>

      {/* LISTA DE LAUDOS E PROVAS */}
      {laudosFiltrados.length === 0 ? (
        <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-12 text-center text-slate-400 space-y-3">
          <FileText className="w-12 h-12 text-slate-600 mx-auto stroke-1" />
          <h3 className="text-base font-bold text-white">Nenhum laudo de avaliação encontrado</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {buscaGeral || filtroSituacao !== 'todos'
              ? 'Tente alterar ou limpar os termos da busca e filtros acima para localizar o laudo desejado.'
              : 'Assim que avaliações teóricas de SST forem realizadas no Quiz Guiado, os laudos em PDF aparecerão aqui permanentemente.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {laudosFiltrados.map((res) => {
            const aprovado = res.situacao === 'APROVADO';
            const dataFormatada = res.data_finalizacao
              ? new Date(res.data_finalizacao).toLocaleDateString('pt-BR') + ' às ' + new Date(res.data_finalizacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : res.data;
            const isGerandoEste = isGerandoPdfId === res.id;

            return (
              <div
                key={res.id}
                className="bg-slate-900/90 border border-white/10 hover:border-emerald-500/40 rounded-3xl p-5 text-white shadow-xl transition-all backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                {/* Informações Principais do Participante e Treinamento */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="font-black text-sm sm:text-base text-white group-hover:text-emerald-300 transition-colors">
                      {res.participante_nome}
                    </span>

                    <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border uppercase flex items-center space-x-1 ${
                      aprovado
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    }`}>
                      {aprovado ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <XCircle className="w-3 h-3 text-rose-400" />}
                      <span>{res.situacao}</span>
                    </span>

                    {res.codigo_documento && (
                      <span className="font-mono text-[10px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-white/10">
                        {res.codigo_documento}
                      </span>
                    )}
                  </div>

                  {/* Nome da Sala / Treinamento e Detalhes */}
                  <div className="text-xs text-slate-300 font-bold flex items-center space-x-2">
                    <span className="text-amber-400 line-clamp-1">{res.sala_nome || res.treinamento_titulo}</span>
                    {res.sala_pin && (
                      <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                        PIN: {res.sala_pin}
                      </span>
                    )}
                  </div>

                  {/* Metadados: Data, Instrutor, Matrícula / Cargo */}
                  <div className="text-[11px] text-slate-400 flex items-center flex-wrap gap-x-4 gap-y-1">
                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      <span>{dataFormatada}</span>
                    </span>

                    <span className="flex items-center space-x-1">
                      <User className="w-3 h-3 text-slate-500" />
                      <span>Instrutor: <strong className="text-slate-300">{res.instrutor_nome || 'Instrutor SST'}</strong></span>
                    </span>

                    {(res.matricula || res.cpf_ou_empresa || res.cargo) && (
                      <span>
                        Identificação: <strong className="text-slate-300">{res.matricula ? `Mat: ${res.matricula}` : ''} {res.cpf_ou_empresa ? `• ${res.cpf_ou_empresa}` : ''}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* Score & Ações Rápidas do Laudo */}
                <div className="flex items-center justify-between md:justify-end space-x-4 pt-3 md:pt-0 border-t md:border-t-0 border-white/10 shrink-0">
                  {/* Desempenho / Nota */}
                  <div className="text-left md:text-right pr-2">
                    <div className="text-base sm:text-lg font-black text-emerald-400">
                      Nota: {res.nota_final.toFixed(1)} <span className="text-xs font-normal text-slate-400">/ 10.0</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold">
                      {res.acertos} de {res.total_perguntas} questões ({res.porcentagem_acertos ?? Math.round((res.acertos / (res.total_perguntas || 1)) * 100)}%)
                    </div>
                  </div>

                  {/* Botões de Ação: Ver, Baixar PDF, Imprimir, Excluir */}
                  <div className="flex items-center space-x-1.5">
                    {/* Visualizar Ficha / Laudo */}
                    <button
                      onClick={() => onVisualizarLaudo(res)}
                      title="Visualizar Prova / Laudo Completo"
                      className="p-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-2xl transition-all flex items-center space-x-1 text-xs font-bold"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="hidden sm:inline">Visualizar</span>
                    </button>

                    {/* Baixar PDF */}
                    <button
                      onClick={() => onBaixarPdfLaudo(res)}
                      disabled={isGerandoEste}
                      title="Baixar Laudo Oficial em PDF"
                      className="p-2.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-2xl transition-all flex items-center space-x-1 text-xs font-bold disabled:opacity-50"
                    >
                      <Download className="w-4 h-4" />
                      <span className="hidden sm:inline">{isGerandoEste ? 'Gerando...' : 'PDF'}</span>
                    </button>

                    {/* Imprimir */}
                    <button
                      onClick={() => onImprimirLaudo(res)}
                      title="Imprimir Laudo em Formato A4"
                      className="p-2.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded-2xl transition-all"
                    >
                      <Printer className="w-4 h-4" />
                    </button>

                    {/* Excluir (Disponível apenas para Instrutor/Admin/Super Admin) */}
                    {isInstrutor && (
                      <button
                        onClick={() => setLaudoParaExcluir(res)}
                        title="Excluir Laudo Permanentemente"
                        className="p-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 rounded-2xl transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE LAUDO / PROVA DOCUMENTAL */}
      {laudoParaExcluir && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-white">
            <div className="flex items-center space-x-3 text-rose-400">
              <div className="p-3 bg-rose-500/20 rounded-2xl border border-rose-500/40 shrink-0">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">Confirmar Exclusão de Laudo</h3>
                <p className="text-xs text-rose-300/80">Atenção: Esta ação é permanente</p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-4 rounded-2xl border border-white/10">
              <p>
                Tem certeza que deseja excluir o laudo/PDF da avaliação de:
              </p>
              <div className="p-2.5 bg-white/5 rounded-xl border border-white/10 space-y-1">
                <div>Colaborador: <strong className="text-white">{laudoParaExcluir.participante_nome}</strong></div>
                <div>Treinamento: <strong className="text-amber-400">{laudoParaExcluir.sala_nome || laudoParaExcluir.treinamento_titulo}</strong></div>
                <div>Data: <span className="text-slate-300">{laudoParaExcluir.data_finalizacao ? new Date(laudoParaExcluir.data_finalizacao).toLocaleDateString('pt-BR') : laudoParaExcluir.data}</span> • Nota: <strong className="text-emerald-400">{laudoParaExcluir.nota_final.toFixed(1)}/10</strong> ({laudoParaExcluir.situacao})</div>
                {laudoParaExcluir.codigo_documento && (
                  <div className="font-mono text-[10px] text-slate-400">Cód: {laudoParaExcluir.codigo_documento}</div>
                )}
              </div>
              <p className="text-[11px] text-amber-300/90 font-medium pt-1">
                ⚠️ Este laudo serve como comprovação documental de treinamento e avaliação de SST. Ao confirmar, todos os dados da prova deste colaborador serão removidos permanentemente.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setLaudoParaExcluir(null)}
                disabled={excluindo}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-slate-300 font-bold rounded-xl text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarExclusao}
                disabled={excluindo}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs shadow-lg transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{excluindo ? 'Excluindo...' : 'Sim, Excluir Documento'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
