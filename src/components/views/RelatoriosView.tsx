// ======================================================================
// RelatoriosView.tsx — Módulo de Relatórios do Admin
// ----------------------------------------------------------------------
// Exibe relatórios de participação, conformidade dos setores, desempenho
// por norma/categoria, desempenho dos desafios 1x1, ranking individual e
// relatório individual do colaborador (quizzes + desafios).
// SOMENTE LEITURA: não altera nenhum dado. Todos os agregados vêm de
// relatoriosHelpers.ts. Permite filtros (origem, período, setor, norma,
// categoria, modo do desafio) e exportação CSV conforme o filtro.
// ======================================================================
import React, { useState, useMemo } from 'react';
import { Usuario, Setor, QuizSessao, Desafio1v1, Pergunta } from '../../types';
import {
  FiltroRelatorio,
  OrigemRelatorio,
  normalizarTexto,
  calcularResumoGeral,
  calcularConformidadeSetores,
  calcularDesempenhoNormas,
  calcularDesempenhoDesafios,
  calcularRankingColaboradores,
  montarRelatorioIndividual,
} from '../../utils/relatoriosHelpers';
import { triggerDownloadCSV } from '../../utils/csvHelpers';
import {
  BarChart3,
  CheckCircle2,
  ShieldAlert,
  Award,
  Swords,
  TrendingUp,
  Users,
  Search,
  Download,
  X,
  FileSpreadsheet,
  Building,
  User,
} from 'lucide-react';

interface RelatoriosViewProps {
  empresaId: string;
  usuarios: Usuario[];
  setores: Setor[];
  quizzes: QuizSessao[];
  desafios: Desafio1v1[];
  perguntas: Pergunta[];
  percentualMinimo: number;
}

type SecaoRelatorio = 'resumo' | 'conformidade' | 'normas' | 'desafios' | 'ranking' | 'individual';

export const RelatoriosView: React.FC<RelatoriosViewProps> = ({
  empresaId,
  usuarios,
  setores,
  quizzes,
  desafios,
  perguntas,
  percentualMinimo,
}) => {
  // Filtros globais
  const [origem, setOrigem] = useState<OrigemRelatorio>('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [setorId, setSetorId] = useState('');
  const [modoDesafio, setModoDesafio] = useState('');
  const [normaFiltro, setNormaFiltro] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [colaboradorId, setColaboradorId] = useState('');
  const [buscaColaborador, setBuscaColaborador] = useState('');
  const [colabDropdownAberto, setColabDropdownAberto] = useState(false);
  // Filtro de status da conformidade: todos / 100% / elegível / não atingiu.
  const [statusConformidade, setStatusConformidade] = useState<'todos' | 'cem' | 'elegivel' | 'nao'>('todos');
  const [busca, setBusca] = useState('');
  const [autocompleteAberto, setAutocompleteAberto] = useState(false);
  const [situacao, setSituacao] = useState<'todas' | 'corretas' | 'erradas'>('todas');
  const [secao, setSecao] = useState<SecaoRelatorio>('resumo');
  // A2: ordenação clicável no ranking (coluna + direção).
  const [ordenacaoChave, setOrdenacaoChave] = useState<
    | 'nome'
    | 'setor_nome'
    | 'quizzesRespondidos'
    | 'acertos'
    | 'erros'
    | 'taxaAcerto'
    | 'desafiosJogados'
    | 'desafiosVencidos'
    | 'taxaVitoria'
    | 'acertosDesafios'
    | 'errosDesafios'
    | 'pontosTotais'
  >('pontosTotais');
  const [ordenacaoDir, setOrdenacaoDir] = useState<'asc' | 'desc'>('desc');
  // C1: filtro por faixa de taxa de acerto no ranking.
  const [faixaTaxa, setFaixaTaxa] = useState<'todas' | 'baixo' | 'medio' | 'alto'>('todas');
  // C5: norma selecionada para drill-down (mostrar perguntas e quem errou).
  const [normaDetalhe, setNormaDetalhe] = useState<string | null>(null);

  const filtro: FiltroRelatorio = {
    origem,
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
    setorId: setorId || undefined,
    modoDesafio: (modoDesafio as 'competitivo' | 'amistoso') || undefined,
    norma: normaFiltro || undefined,
    categoria: categoriaFiltro || undefined,
    colaboradorId: colaboradorId || undefined,
    situacao,
  };

  // Dados da empresa filtrados por empresa (segurança multi-empresa)
  const usuariosEmpresa = useMemo(() => usuarios.filter(u => u.empresa_id === empresaId), [usuarios, empresaId]);
  const setoresEmpresa = useMemo(() => setores.filter(s => s.empresa_id === empresaId), [setores, empresaId]);
  const quizzesEmpresa = useMemo(() => quizzes.filter(q => q.empresa_id === empresaId), [quizzes, empresaId]);
  const desafiosEmpresa = useMemo(() => desafios.filter(d => d.empresa_id === empresaId), [desafios, empresaId]);

  const resumo = useMemo(() => calcularResumoGeral(usuariosEmpresa, quizzesEmpresa, desafiosEmpresa, filtro), [usuariosEmpresa, quizzesEmpresa, desafiosEmpresa, filtro]);
  const conformidade = useMemo(() => calcularConformidadeSetores(usuariosEmpresa, setoresEmpresa, quizzesEmpresa, percentualMinimo, filtro), [usuariosEmpresa, setoresEmpresa, quizzesEmpresa, percentualMinimo, filtro]);

  // Sugestões para autocomplete na busca rápida
  const sugestoesAutocomplete = useMemo(() => {
    if (!busca.trim() || busca.trim().length < 2) return { colaboradores: [], setores: [] };
    const q = busca.toLowerCase().trim();
    const colabs = usuariosEmpresa
      .filter(u => u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 4);
    const sets = setoresEmpresa
      .filter(s => s.nome.toLowerCase().includes(q))
      .slice(0, 3);
    return { colaboradores: colabs, setores: sets };
  }, [busca, usuariosEmpresa, setoresEmpresa]);

  // Filtra os setores pelo status de conformidade e busca rápida por colaborador/setor
  const conformidadeFiltrada = useMemo(() => {
    let lista = conformidade;
    if (statusConformidade === 'cem') lista = lista.filter(s => s.taxaParticipacao >= 100);
    else if (statusConformidade === 'elegivel') lista = lista.filter(s => s.elegivel);
    else if (statusConformidade === 'nao') lista = lista.filter(s => !s.elegivel);

    if (busca.trim()) {
      const q = busca.toLowerCase().trim();
      lista = lista.filter(s => {
        const nomeSetorMatch = s.setor_nome.toLowerCase().includes(q);
        if (nomeSetorMatch) return true;
        return usuariosEmpresa.some(u => u.setor_id === s.setor_id && (u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
      });
    }
    return lista;
  }, [conformidade, statusConformidade, busca, usuariosEmpresa]);

  const desempenhoNormas = useMemo(() => calcularDesempenhoNormas(quizzesEmpresa, perguntas, filtro), [quizzesEmpresa, perguntas, filtro]);
  const desempenhoDesafios = useMemo(() => calcularDesempenhoDesafios(desafiosEmpresa, setoresEmpresa, filtro), [desafiosEmpresa, setoresEmpresa, filtro]);

  // Filtra desempenho dos setores em desafios por palavra-chave da busca rápida
  const desafiosSetoresFiltrados = useMemo(() => {
    if (!busca.trim()) return desempenhoDesafios.porSetor;
    const q = busca.toLowerCase().trim();
    return desempenhoDesafios.porSetor.filter(s => {
      const nomeSetorMatch = s.setor_nome.toLowerCase().includes(q);
      if (nomeSetorMatch) return true;
      return usuariosEmpresa.some(u => u.setor_id === s.setor_id && (u.nome.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
    });
  }, [desempenhoDesafios.porSetor, busca, usuariosEmpresa]);
  const ranking = useMemo(() => calcularRankingColaboradores(usuariosEmpresa, setoresEmpresa, quizzesEmpresa, desafiosEmpresa, filtro), [usuariosEmpresa, setoresEmpresa, quizzesEmpresa, desafiosEmpresa, filtro]);

  // Filtro de busca por nome no ranking
  const rankingFiltrado = useMemo(() => {
    let lista = ranking;
    // Busca por nome/setor
    if (busca.trim()) {
      lista = lista.filter(r => r.nome.toLowerCase().includes(busca.toLowerCase()) || r.setor_nome.toLowerCase().includes(busca.toLowerCase()));
    }
    // C1: filtra por faixa de taxa de acerto
    if (faixaTaxa === 'baixo') lista = lista.filter(r => r.taxaAcerto > 0 && r.taxaAcerto < 60);
    else if (faixaTaxa === 'medio') lista = lista.filter(r => r.taxaAcerto >= 60 && r.taxaAcerto < 85);
    else if (faixaTaxa === 'alto') lista = lista.filter(r => r.taxaAcerto >= 85);
    // A2: ordenação clicável
    return [...lista].sort((a, b) => {
      let va: string | number;
      let vb: string | number;
      if (ordenacaoChave === 'nome' || ordenacaoChave === 'setor_nome') {
        va = (a[ordenacaoChave] || '').toLowerCase();
        vb = (b[ordenacaoChave] || '').toLowerCase();
      } else {
        va = a[ordenacaoChave] ?? 0;
        vb = b[ordenacaoChave] ?? 0;
      }
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return ordenacaoDir === 'asc' ? cmp : -cmp;
    });
  }, [ranking, busca, faixaTaxa, ordenacaoChave, ordenacaoDir]);

  // Função para trocar a ordenação ao clicar numa coluna.
  const trocarOrdenacao = (chave: typeof ordenacaoChave) => {
    if (ordenacaoChave === chave) {
      setOrdenacaoDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrdenacaoChave(chave);
      setOrdenacaoDir(chave === 'nome' || chave === 'setor_nome' ? 'asc' : 'desc');
    }
  };

  const relatorioIndividual = useMemo(() => {
    if (!colaboradorId) return null;
    return montarRelatorioIndividual(colaboradorId, usuariosEmpresa, quizzesEmpresa, desafiosEmpresa, perguntas, filtro);
  }, [colaboradorId, usuariosEmpresa, quizzesEmpresa, desafiosEmpresa, perguntas, filtro]);

  // C5: Drill-down de uma norma — lista as perguntas dessa norma e, para cada
  // uma, quem errou (para decidir treinamentos específicos).
  const detalheNorma = useMemo(() => {
    if (!normaDetalhe) return null;
    const mapa = new Map<string, { enunciado: string; categoria: string; erros: { nome: string; setor: string }[]; acertos: { nome: string }[]; total: number }>();
    quizzesEmpresa
      .filter(q => q.status === 'concluido')
      .forEach(q => {
        (q.respostas || []).forEach(r => {
          const pergunta = q.perguntas.find(p => p.id === r.pergunta_id) || perguntas.find(p => p.id === r.pergunta_id);
          if (!pergunta || normalizarTexto(pergunta.norma_relacionada || 'Geral') !== normalizarTexto(normaDetalhe)) return;
          const u = usuariosEmpresa.find(x => x.id === q.colaborador_id);
          if (!u) return;
          const item = mapa.get(pergunta.id) || { enunciado: pergunta.enunciado, categoria: pergunta.categoria, erros: [], acertos: [], total: 0 };
          item.total += 1;
          if (r.correta) item.acertos.push({ nome: u.nome });
          else item.erros.push({ nome: u.nome, setor: setoresEmpresa.find(s => s.id === u.setor_id)?.nome || 'Setor' });
          mapa.set(pergunta.id, item);
        });
      });
    return Array.from(mapa.entries())
      .map(([pergunta_id, v]) => ({ pergunta_id, ...v }))
      .sort((a, b) => b.erros.length - a.erros.length);
  }, [normaDetalhe, quizzesEmpresa, perguntas, usuariosEmpresa, setoresEmpresa]);

  // Listas de normas e categorias disponíveis (das perguntas da empresa + das
  // normas já registradas nas respostas). Usadas no filtro para garantir que a
  // digitação/ seleção sempre corresponda a um valor real.
  const normasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    perguntas.filter(p => p.empresa_id === empresaId).forEach(p => { if (p.norma_relacionada) set.add(p.norma_relacionada); });
    quizzesEmpresa.forEach(q => (q.perguntas || []).forEach(p => { if (p.norma_relacionada) set.add(p.norma_relacionada); }));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [perguntas, quizzesEmpresa, empresaId]);

  const categoriasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    perguntas.filter(p => p.empresa_id === empresaId).forEach(p => { if (p.categoria) set.add(p.categoria); });
    quizzesEmpresa.forEach(q => (q.perguntas || []).forEach(p => { if (p.categoria) set.add(p.categoria); }));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [perguntas, quizzesEmpresa, empresaId]);

  // Colaboradores da empresa ordenados por NOME (alfabético) para facilitar a
  // busca no relatório individual.
  const colaboradoresOrdenados = useMemo(
    () => usuariosEmpresa
      .filter(u => u.perfil === 'colaborador' && u.ativo !== false)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [usuariosEmpresa]
  );

  // Filtra os colaboradores pela busca digitada (nome ou setor).
  const colaboradoresFiltrados = useMemo(() => {
    const q = buscaColaborador.trim().toLowerCase();
    if (!q) return colaboradoresOrdenados;
    return colaboradoresOrdenados.filter(u => {
      const setorNome = setoresEmpresa.find(s => s.id === u.setor_id)?.nome || '';
      return u.nome.toLowerCase().includes(q) || setorNome.toLowerCase().includes(q);
    });
  }, [buscaColaborador, colaboradoresOrdenados, setoresEmpresa]);

  // Nome do colaborador selecionado (para exibir no botão do filtro).
  const nomeColaboradorSelecionado = colaboradoresOrdenados.find(u => u.id === colaboradorId)?.nome || '';

  // =====================================================================
  // Exportações CSV (sempre conforme os filtros aplicados)
  // =====================================================================
  const exportarResumo = () => {
    const linhas: string[] = [
      'RELATORIO GERAL SST QUIZ — EXPORTACAO COMPLETA',
      `Origem: ${origem === 'todos' ? 'Todos' : origem === 'quizzes' ? 'Quizzes' : 'Desafios'}`,
      `Periodo: ${dataInicio || 'inicio'} ate ${dataFim || 'fim'}`,
      `Setor: ${setoresEmpresa.find(s => s.id === setorId)?.nome || 'Todos'}`,
      '',
      '=== 1. RESUMO GERAL ===',
      'METRICA;VALOR',
      `Total de Colaboradores;${resumo.totalColaboradores}`,
      `Colaboradores que Participaram de Quiz;${resumo.colaboradoresParticipantesQuiz}`,
      `Quizzes Respondidos;${resumo.totalQuizzesRespondidos}`,
      `Media de Acertos (%);${resumo.mediaAcertosQuiz}`,
      `Total de Desafios;${resumo.totalDesafios}`,
      `Desafios Concluidos;${resumo.totalDesafiosConcluidos}`,
      `Total de Vitorias;${resumo.totalVitorias}`,
      `Taxa de Vitoria (%);${resumo.taxaVitoria}`,
      `Pontos de Quizzes;${resumo.totalPontosQuizzes}`,
      `Pontos de Desafios;${resumo.totalPontosDesafios}`,
      '',
      '=== 2. CONFORMIDADE DOS SETORES ===',
      'SETOR;COLABORADORES;PARTICIPANTES;TAXA (%);STATUS;FALTAM_PARA_MINIMO;FALTAM_PARA_100',
      ...conformidade.map(s => [
        `"${s.setor_nome}"`,
        s.totalColaboradores,
        s.participantes,
        s.taxaParticipacao,
        s.elegivel ? 'CONFORME' : 'NAO CONFORME',
        s.faltamParaMinimo,
        s.faltamPara100,
      ].join(';')),
      '',
      '=== 3. DESEMPENHO POR NORMA ===',
      'NORMA;TOTAL_RESPOSTAS;ACERTOS;ERROS;TAXA_ACERTO (%)',
      ...desempenhoNormas.normas.map(n => [n.norma, n.totalRespostas, n.acertos, n.erros, n.taxaAcerto].join(';')),
      '',
      '=== 3.1. PERGUNTAS MAIS ERRADAS ===',
      'ENUNCIADO;CATEGORIA;NORMA;ERROS;TOTAL',
      ...desempenhoNormas.maisErradas.map(p => [`"${p.enunciado.replace(/"/g, '""')}"`, p.categoria, p.norma, p.erros, p.totalRespostas].join(';')),
      '',
      '=== 4. DESEMPENHO DOS DESAFIOS 1X1 ===',
      'SETOR;JOGADOS;VITORIAS;DERROTAS;TAXA_VITORIA (%);PONTOS_GANHOS',
      ...desempenhoDesafios.porSetor.map(s => [s.setor_nome, s.jogados, s.vitorias, s.derrotas, s.taxaVitoria, s.pontosGanhos].join(';')),
      '',
      '=== 4.1. POR MODO ===',
      'MODO;JOGADOS;VITORIAS',
      ...desempenhoDesafios.porModo.map(m => [`${m.modo === 'competitivo' ? 'Competitivo' : 'Amistoso'}`, m.jogados, m.vitorias].join(';')),
      '',
      '=== 4.2. POR TEMA ===',
      'TEMA;JOGADOS;VITORIAS;TAXA_VITORIA (%)',
      ...desempenhoDesafios.porTema.map(t => [t.tema, t.jogados, t.vitorias, t.taxaVitoria].join(';')),
      '',
      '=== 5. RANKING INDIVIDUAL DE COLABORADORES ===',
      'NOME;SETOR;CARGO;QUIZZES;ACERTOS;ERROS;TAXA_ACERTO (%);DESAFIOS;VITORIAS;TAXA_VITORIA (%);ACERTOS_DESAFIOS;ERROS_DESAFIOS;TAXA_ACERTO_DESAFIOS (%);PONTOS_TOTAIS',
      ...ranking.map(r => [
        `"${r.nome}"`,
        `"${r.setor_nome}"`,
        `"${r.cargo}"`,
        r.quizzesRespondidos,
        r.acertos,
        r.erros,
        r.taxaAcerto,
        r.desafiosJogados,
        r.desafiosVencidos,
        r.taxaVitoria,
        r.acertosDesafios,
        r.errosDesafios,
        r.taxaAcertoDesafios,
        r.pontosTotais,
      ].join(';')),
    ];
    triggerDownloadCSV('relatorio_geral_completo.csv', linhas.join('\n'));
  };

  const exportarConformidade = () => {
    const linhas = [
      'SETOR;COLABORADORES;PARTICIPANTES;TAXA (%);STATUS;FALTAM_PARA_MINIMO;FALTAM_PARA_100',
      ...conformidade.map(s => [
        `"${s.setor_nome}"`,
        s.totalColaboradores,
        s.participantes,
        s.taxaParticipacao,
        s.elegivel ? 'CONFORME' : 'NAO CONFORME',
        s.faltamParaMinimo,
        s.faltamPara100,
      ].join(';')),
    ];
    triggerDownloadCSV('relatorio_conformidade_setores.csv', linhas.join('\n'));
  };

  const exportarNormas = () => {
    const linhas = [
      'NORMA;TOTAL_RESPOSTAS;ACERTOS;ERROS;TAXA_ACERTO (%)',
      ...desempenhoNormas.normas.map(n => [n.norma, n.totalRespostas, n.acertos, n.erros, n.taxaAcerto].join(';')),
      '',
      'PERGUNTAS MAIS ERRADAS:',
      'ENUNCIADO;CATEGORIA;NORMA;ERROS;TOTAL',
      ...desempenhoNormas.maisErradas.map(p => [`"${p.enunciado.replace(/"/g, '""')}"`, p.categoria, p.norma, p.erros, p.totalRespostas].join(';')),
    ];
    triggerDownloadCSV('relatorio_desempenho_normas.csv', linhas.join('\n'));
  };

  const exportarDesafios = () => {
    const linhas = [
      'SETOR;JOGADOS;VITORIAS;DERROTAS;TAXA_VITORIA (%);PONTOS_GANHOS',
      ...desempenhoDesafios.porSetor.map(s => [s.setor_nome, s.jogados, s.vitorias, s.derrotas, s.taxaVitoria, s.pontosGanhos].join(';')),
      '',
      'POR TEMA:',
      'TEMA;JOGADOS;VITORIAS;TAXA_VITORIA (%)',
      ...desempenhoDesafios.porTema.map(t => [t.tema, t.jogados, t.vitorias, t.taxaVitoria].join(';')),
    ];
    triggerDownloadCSV('relatorio_desempenho_desafios.csv', linhas.join('\n'));
  };

  const exportarRanking = () => {
    const linhas = [
      'NOME;SETOR;CARGO;QUIZZES;ACERTOS;ERROS;TAXA_ACERTO (%);DESAFIOS;VITORIAS;TAXA_VITORIA (%);ACERTOS_DESAFIOS;ERROS_DESAFIOS;TAXA_ACERTO_DESAFIOS (%);PONTOS_TOTAIS',
      ...rankingFiltrado.map(r => [
        `"${r.nome}"`,
        `"${r.setor_nome}"`,
        `"${r.cargo}"`,
        r.quizzesRespondidos,
        r.acertos,
        r.erros,
        r.taxaAcerto,
        r.desafiosJogados,
        r.desafiosVencidos,
        r.taxaVitoria,
        r.acertosDesafios,
        r.errosDesafios,
        r.taxaAcertoDesafios,
        r.pontosTotais,
      ].join(';')),
    ];
    triggerDownloadCSV('relatorio_ranking_colaboradores.csv', linhas.join('\n'));
  };

  const exportarIndividual = () => {
    if (!relatorioIndividual) return;
    const linhas: string[] = [
      `RELATORIO INDIVIDUAL: ${relatorioIndividual.colaborador.nome} (${relatorioIndividual.colaborador.cargo})`,
      '',
      '=== RESUMO POR NORMA ===',
      'NORMA;TOTAL;ACERTOS;TAXA_ACERTO (%)',
      ...relatorioIndividual.resumoPorNorma.map(n => [n.norma, n.total, n.acertos, n.taxaAcerto].join(';')),
      '',
      '=== QUIZZES ===',
      'QUIZ;DATA;PONTUACAO;PERGUNTA;CERTA?;ALTERNATIVA_ESCOLHIDA;RESPOSTA_CORRETA;NORMA;EXPLICACAO',
    ];
    relatorioIndividual.quizzes.forEach(q => {
      q.respostas.forEach(r => {
        linhas.push([
          `"${q.titulo}"`,
          q.respondido_em,
          q.pontuacao_total,
          `"${r.enunciado.replace(/"/g, '""')}"`,
          r.correta ? 'SIM' : 'NAO',
          `"${r.alternativaEscolhidaTexto.replace(/"/g, '""')}"`,
          `"${r.respostaCorretaTexto.replace(/"/g, '""')}"`,
          r.norma,
          `"${r.explicacao.replace(/"/g, '""')}"`,
        ].join(';'));
      });
    });
    linhas.push('', '=== DESAFIOS 1X1 ===', 'DESAFIO;TIPO;TEMA;DATA;OPONENTE;STATUS;VENCEU;PLACAR');
    relatorioIndividual.desafios.forEach(d => {
      linhas.push([d.desafio_id, d.tipo, d.tema, d.data, `"${d.oponente}"`, d.status, d.venceu === null ? '-' : (d.venceu ? 'SIM' : 'NAO'), `"${d.placar}"`].join(';'));
    });
    triggerDownloadCSV(`relatorio_individual_${relatorioIndividual.colaborador.nome.replace(/\s+/g, '_')}.csv`, linhas.join('\n'));
  };

  // =====================================================================
  // Renderização
  // =====================================================================
  return (
    <div className="space-y-4">
      {/* Filtros globais */}
      <div className="bg-slate-950/60 border border-white/10 rounded-2xl p-4 space-y-3">
        <div className="font-bold text-slate-200 text-xs flex items-center space-x-2">
          <Search className="w-4 h-4 text-emerald-400" />
          <span>Filtros de Análise</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {/* Origem */}
          <div>
            <label className="block font-semibold text-slate-400 text-[10px] mb-1">Origem</label>
            <select value={origem} onChange={(e) => setOrigem(e.target.value as OrigemRelatorio)} className="w-full bg-slate-900 border border-white/10 rounded-lg p-1.5 text-xs text-slate-200">
              <option value="todos">Todos</option>
              <option value="quizzes">Quizzes</option>
              <option value="desafios">Desafios</option>
            </select>
          </div>

          {/* Período */}
          <div>
            <label className="block font-semibold text-slate-400 text-[10px] mb-1">Data Início</label>
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg p-1.5 text-xs text-slate-200" />
          </div>
          <div>
            <label className="block font-semibold text-slate-400 text-[10px] mb-1">Data Fim</label>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg p-1.5 text-xs text-slate-200" />
          </div>

          {/* Setor */}
          <div>
            <label className="block font-semibold text-slate-400 text-[10px] mb-1">Setor</label>
            <select value={setorId} onChange={(e) => setSetorId(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg p-1.5 text-xs text-slate-200">
              <option value="">Todos</option>
              {setoresEmpresa.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>

          {/* Modo do desafio */}
          {origem !== 'quizzes' && (
            <div>
              <label className="block font-semibold text-slate-400 text-[10px] mb-1">Modo Desafio</label>
              <select value={modoDesafio} onChange={(e) => setModoDesafio(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg p-1.5 text-xs text-slate-200">
                <option value="">Todos</option>
                <option value="competitivo">Competitivo</option>
                <option value="amistoso">Amistoso</option>
              </select>
            </div>
          )}

          {/* Norma */}
          {origem !== 'desafios' && (
            <div>
              <label className="block font-semibold text-slate-400 text-[10px] mb-1">Norma</label>
              <select value={normaFiltro} onChange={(e) => setNormaFiltro(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg p-1.5 text-xs text-slate-200">
                <option value="">Todas as normas</option>
                {normasDisponiveis.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}

          {/* Categoria */}
          {origem !== 'desafios' && (
            <div>
              <label className="block font-semibold text-slate-400 text-[10px] mb-1">Categoria</label>
              <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-lg p-1.5 text-xs text-slate-200">
                <option value="">Todas as categorias</option>
                {categoriasDisponiveis.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          {/* Situação (corretas/erradas) — mostra em seções que exibem respostas */}
          {secao === 'individual' && (
            <div>
              <label className="block font-semibold text-slate-400 text-[10px] mb-1">Situação</label>
              <select value={situacao} onChange={(e) => setSituacao(e.target.value as 'todas' | 'corretas' | 'erradas')} className="w-full bg-slate-900 border border-white/10 rounded-lg p-1.5 text-xs text-slate-200">
                <option value="todas">Todas</option>
                <option value="corretas">Somente corretas</option>
                <option value="erradas">Somente erradas</option>
              </select>
            </div>
          )}

          {/* Busca Rápida com Autocomplete (Filtragem instantânea) */}
          <div className="relative col-span-2 sm:col-span-1">
            <label className="block font-semibold text-slate-400 text-[10px] mb-1 flex items-center justify-between">
              <span>Busca Rápida (Filtrar Tabelas)</span>
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca('')}
                  className="text-slate-500 hover:text-slate-300 text-[10px]"
                >
                  Limpar
                </button>
              )}
            </label>
            <div className="relative">
              <input
                type="text"
                value={busca}
                onFocus={() => setAutocompleteAberto(true)}
                onBlur={() => setTimeout(() => setAutocompleteAberto(false), 200)}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setAutocompleteAberto(true);
                }}
                placeholder="Buscar colaborador ou setor..."
                className="w-full bg-slate-900 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>

            {/* Dropdown de Autocomplete com sugestões instantâneas */}
            {autocompleteAberto && (sugestoesAutocomplete.colaboradores.length > 0 || sugestoesAutocomplete.setores.length > 0) && (
              <div className="absolute z-40 mt-1 w-full bg-slate-900/95 backdrop-blur-md border border-emerald-500/30 rounded-xl shadow-2xl p-2 space-y-2 text-xs">
                {sugestoesAutocomplete.colaboradores.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider px-2 py-1 flex items-center space-x-1">
                      <User className="w-3 h-3" />
                      <span>Colaboradores</span>
                    </div>
                    {sugestoesAutocomplete.colaboradores.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setBusca(c.nome);
                          setAutocompleteAberto(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-emerald-500/20 text-slate-200 hover:text-white flex items-center justify-between transition-colors"
                      >
                        <span className="font-medium">{c.nome}</span>
                        <span className="text-[10px] text-slate-400">{setoresEmpresa.find(s => s.id === c.setor_id)?.nome}</span>
                      </button>
                    ))}
                  </div>
                )}

                {sugestoesAutocomplete.setores.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider px-2 py-1 flex items-center space-x-1">
                      <Building className="w-3 h-3" />
                      <span>Setores</span>
                    </div>
                    {sugestoesAutocomplete.setores.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setBusca(s.nome);
                          setAutocompleteAberto(false);
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-blue-500/20 text-slate-200 hover:text-white transition-colors font-medium"
                      >
                        {s.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Seletor de colaborador (individual) — com busca + lista alfabética */}
          {secao === 'individual' && (
            <div className="col-span-2 sm:col-span-1 relative">
              <label className="block font-semibold text-slate-400 text-[10px] mb-1">Colaborador</label>
              <input
                type="text"
                value={colaboradorId ? nomeColaboradorSelecionado : buscaColaborador}
                onFocus={() => setColabDropdownAberto(true)}
                onBlur={() => setTimeout(() => setColabDropdownAberto(false), 150)}
                onChange={(e) => { setBuscaColaborador(e.target.value); if (colaboradorId) setColaboradorId(''); setColabDropdownAberto(true); }}
                placeholder="Digite o nome do colaborador..."
                className="w-full bg-slate-900 border border-white/10 rounded-lg p-1.5 text-xs text-slate-200"
              />
              {/* Dropdown com a lista alfabética — SÓ aparece enquanto o campo está
                  focado ou sendo digitado, para não atrapalhar a visibilidade. */}
              {colabDropdownAberto && colaboradoresFiltrados.length > 0 && (
                <div className="absolute z-30 mt-1 w-full max-h-40 overflow-y-auto bg-slate-900 border border-white/15 rounded-lg shadow-xl">
                  {colaboradoresFiltrados.map(u => (
                    <button
                      key={u.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setColaboradorId(u.id); setBuscaColaborador(''); setColabDropdownAberto(false); }}
                      className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-white/10 ${u.id === colaboradorId ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-200'}`}
                    >
                      {u.nome} <span className="text-slate-500">• {setoresEmpresa.find(s => s.id === u.setor_id)?.nome || 'Setor'}</span>
                    </button>
                  ))}
                </div>
              )}
              {colaboradorId && (
                <button onClick={() => setColaboradorId('')} className="absolute right-2 top-7 text-slate-400 hover:text-rose-300 text-[10px] font-bold">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/5">
          <div className="text-[10px] text-slate-500">
            Exportação reflete exatamente os filtros aplicados.
          </div>
          <button
            onClick={() => {
              setOrigem('todos'); setDataInicio(''); setDataFim(''); setSetorId(''); setModoDesafio(''); setNormaFiltro(''); setCategoriaFiltro(''); setBusca(''); setColaboradorId(''); setBuscaColaborador(''); setSituacao('todas'); setStatusConformidade('todos'); setColabDropdownAberto(false);
            }}
            className="text-[10px] text-rose-300 hover:text-rose-200 font-bold"
          >
            Limpar Filtros
          </button>
        </div>
      </div>

      {/* Navegação das seções */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ['resumo', 'Resumo Geral', BarChart3],
          ['conformidade', 'Conformidade', ShieldAlert],
          ['normas', 'Normas', TrendingUp],
          ['desafios', 'Desafios 1x1', Swords],
          ['ranking', 'Ranking', Users],
          ['individual', 'Individual', Award],
        ] as [SecaoRelatorio, string, any][]).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setSecao(key)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center space-x-1.5 transition-all ${
              secao === key ? 'bg-emerald-500 text-slate-950 shadow-md' : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Atalhos interativos: contadores que filtram as seções ao clicar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button onClick={() => { setSecao('conformidade'); setStatusConformidade('nao'); }} className="bg-rose-950/40 hover:bg-rose-950/60 border border-rose-500/40 rounded-xl p-3 text-left transition-all">
          <div className="text-lg font-black text-rose-300">{conformidade.filter(s => !s.elegivel).length}</div>
          <div className="text-[10px] text-slate-400 font-medium">Setores abaixo da cota</div>
        </button>
        <button onClick={() => { setSecao('conformidade'); setStatusConformidade('elegivel'); }} className="bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-3 text-left transition-all">
          <div className="text-lg font-black text-emerald-300">{conformidade.filter(s => s.elegivel).length}</div>
          <div className="text-[10px] text-slate-400 font-medium">Setores elegíveis</div>
        </button>
        <button onClick={() => { setSecao('conformidade'); setStatusConformidade('cem'); }} className="bg-amber-950/40 hover:bg-amber-950/60 border border-amber-500/40 rounded-xl p-3 text-left transition-all">
          <div className="text-lg font-black text-amber-300">{conformidade.filter(s => s.taxaParticipacao >= 100).length}</div>
          <div className="text-[10px] text-slate-400 font-medium">Setores em 100%</div>
        </button>
        <button onClick={() => { setSecao('normas'); setNormaFiltro(''); }} className="bg-indigo-950/40 hover:bg-indigo-950/60 border border-indigo-500/40 rounded-xl p-3 text-left transition-all">
          <div className="text-lg font-black text-indigo-300">{desempenhoNormas.normas.filter(n => n.taxaAcerto < 60).length}</div>
          <div className="text-[10px] text-slate-400 font-medium">Normas críticas (&lt;60%)</div>
        </button>
      </div>

      {/* ===== SEÇÃO 1: RESUMO GERAL ===== */}
      {secao === 'resumo' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-slate-200">Resumo Geral</h4>
            <button onClick={exportarResumo} className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5">
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Colaboradores', resumo.totalColaboradores],
              ['Participaram de Quiz', resumo.colaboradoresParticipantesQuiz],
              ['Quizzes Respondidos', resumo.totalQuizzesRespondidos],
              ['Média de Acertos', `${resumo.mediaAcertosQuiz}%`],
              ['Desafios', resumo.totalDesafios],
              ['Desafios Concluídos', resumo.totalDesafiosConcluidos],
              ['Vitórias', resumo.totalVitorias],
              ['Taxa de Vitória', `${resumo.taxaVitoria}%`],
              ['Pontos de Quizzes', resumo.totalPontosQuizzes],
              ['Pontos de Desafios', resumo.totalPontosDesafios],
            ].map(([label, valor], i) => (
              <div key={i} className="bg-slate-950/60 border border-white/10 rounded-xl p-3 text-center">
                <div className="text-lg font-black text-emerald-400">{valor}</div>
                <div className="text-[10px] text-slate-400 font-medium">{label}</div>
              </div>
            ))}
          </div>

          {/* B1: barras visuais de proporção no resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Participação em quizzes */}
            <div className="bg-slate-950/60 border border-white/10 rounded-xl p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-slate-200">Participação em Quizzes</span>
                <span className="font-black text-emerald-400">{resumo.totalColaboradores > 0 ? Math.round((resumo.colaboradoresParticipantesQuiz / resumo.totalColaboradores) * 100) : 0}%</span>
              </div>
              <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400" style={{ width: `${resumo.totalColaboradores > 0 ? Math.min(100, (resumo.colaboradoresParticipantesQuiz / resumo.totalColaboradores) * 100) : 0}%` }} />
              </div>
              <div className="text-[10px] text-slate-500 mt-1">{resumo.colaboradoresParticipantesQuiz} de {resumo.totalColaboradores} colaboradores participaram</div>
            </div>

            {/* Taxa de vitória em desafios */}
            <div className="bg-slate-950/60 border border-white/10 rounded-xl p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-slate-200">Taxa de Vitória nos Desafios</span>
                <span className="font-black text-amber-400">{resumo.taxaVitoria}%</span>
              </div>
              <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-600 to-amber-400" style={{ width: `${resumo.taxaVitoria}%` }} />
              </div>
              <div className="text-[10px] text-slate-500 mt-1">{resumo.totalVitorias} vitórias em {resumo.totalDesafiosConcluidos} concluídos</div>
            </div>

            {/* Média de acertos */}
            <div className="bg-slate-950/60 border border-white/10 rounded-xl p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-slate-200">Média de Acertos (Quizzes)</span>
                <span className="font-black text-sky-400">{resumo.mediaAcertosQuiz}%</span>
              </div>
              <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-600 to-sky-400" style={{ width: `${resumo.mediaAcertosQuiz}%` }} />
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Aproveitamento médio por pergunta</div>
            </div>

            {/* Proporção desafios concluídos */}
            <div className="bg-slate-950/60 border border-white/10 rounded-xl p-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-slate-200">Desafios Concluídos</span>
                <span className="font-black text-purple-400">{resumo.totalDesafios > 0 ? Math.round((resumo.totalDesafiosConcluidos / resumo.totalDesafios) * 100) : 0}%</span>
              </div>
              <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400" style={{ width: `${resumo.totalDesafios > 0 ? Math.min(100, (resumo.totalDesafiosConcluidos / resumo.totalDesafios) * 100) : 0}%` }} />
              </div>
              <div className="text-[10px] text-slate-500 mt-1">{resumo.totalDesafiosConcluidos} de {resumo.totalDesafios} desafios foram concluídos</div>
            </div>
          </div>
        </div>
      )}

      {/* ===== SEÇÃO 2: CONFORMIDADE DOS SETORES ===== */}
      {secao === 'conformidade' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-slate-200">Conformidade dos Setores</h4>
            <button onClick={exportarConformidade} className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5">
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>

          {/* Filtro de status: todos / 100% / elegível / não atingiu a cota */}
          <div className="flex flex-wrap gap-1.5">
            {([
              ['todos', `Todos (${conformidade.length})`],
              ['cem', '100%'],
              ['elegivel', 'Elegível'],
              ['nao', 'Não atingiu a cota'],
            ] as ['todos' | 'cem' | 'elegivel' | 'nao', string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusConformidade(key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  statusConformidade === key ? 'bg-emerald-500 text-slate-950 shadow-md' : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {conformidadeFiltrada.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Nenhum setor corresponde ao status selecionado.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {conformidadeFiltrada.map(s => (
                <div key={s.setor_id} className={`p-3.5 rounded-xl border text-xs ${s.elegivel ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-rose-950/30 border-rose-500/40'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold text-white">{s.setor_nome}</div>
                    {s.elegivel ? (
                      <span className="flex items-center space-x-1 text-emerald-400 font-bold text-[11px]"><CheckCircle2 className="w-4 h-4" /><span>CONFORME</span></span>
                    ) : (
                      <span className="flex items-center space-x-1 text-rose-400 font-bold text-[11px]"><ShieldAlert className="w-4 h-4" /><span>NÃO CONFORME</span></span>
                    )}
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-300 mb-2">
                    <span>{s.participantes} de {s.totalColaboradores} participaram</span>
                    <span className="font-bold">{s.taxaParticipacao}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${s.elegivel ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : 'bg-gradient-to-r from-rose-600 to-rose-400'}`} style={{ width: `${s.taxaParticipacao}%` }} />
                  </div>
                  {!s.elegivel && (
                    <p className="text-[10px] text-rose-300 mt-2">Faltam {s.faltamParaMinimo} para atingir {percentualMinimo}% • Faltam {s.faltamPara100} para 100%.</p>
                  )}
                  <button
                    onClick={() => { setSetorId(s.setor_id); setSecao('ranking'); }}
                    className="mt-2 w-full bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 text-[10px] font-bold py-1.5 rounded-lg transition-all"
                  >
                    Ver colaboradores do setor →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== SEÇÃO 3: DESEMPENHO POR NORMA ===== */}
      {secao === 'normas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-slate-200">Desempenho por Norma / Categoria</h4>
            <button onClick={exportarNormas} className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5">
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>

            <div>
              <h5 className="text-xs font-extrabold text-amber-300 uppercase tracking-wider mb-2">Normas que precisam de mais treinamento (menor taxa de acerto)</h5>
              <p className="text-[10px] text-slate-500 mb-2">Clique em uma norma para ver as perguntas dela e quem errou (drill-down).</p>
              {desempenhoNormas.normas.length === 0 ? (
                <p className="text-xs text-slate-500 italic">Nenhuma resposta registrada com os filtros atuais.</p>
              ) : (
                <div className="space-y-2">
                  {desempenhoNormas.normas.map((n, i) => (
                    <button
                      key={i}
                      onClick={() => { setNormaDetalhe(normaDetalhe === n.norma ? null : n.norma); setNormaFiltro(n.norma); }}
                      className={`w-full bg-slate-950/60 border border-white/10 rounded-xl p-3 text-xs text-left transition-all hover:bg-white/5 ${normaDetalhe === n.norma ? 'ring-2 ring-emerald-500/50' : ''}`}
                    >
                      <div className="flex justify-between mb-1">
                        <span className="font-bold text-white">{n.norma}</span>
                        <span className={n.taxaAcerto < 60 ? 'text-rose-400 font-bold' : n.taxaAcerto < 80 ? 'text-amber-300 font-bold' : 'text-emerald-400 font-bold'}>{n.taxaAcerto}%</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                        <span>{n.acertos} acertos • {n.erros} erros • {n.totalRespostas} respostas</span>
                        <span className="text-emerald-400 font-bold">Ver detalhes →</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${n.taxaAcerto < 60 ? 'bg-rose-500' : n.taxaAcerto < 80 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${n.taxaAcerto}%` }} />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* C5: Drill-down da norma selecionada — perguntas e quem errou */}
              {normaDetalhe && (
                <div className="mt-3 p-3 bg-slate-950/70 border border-emerald-500/30 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="font-extrabold text-emerald-300 text-xs">🔍 Detalhes da norma: {normaDetalhe}</div>
                    <button onClick={() => setNormaDetalhe(null)} className="text-slate-400 hover:text-white text-[10px] font-bold">Fechar ✕</button>
                  </div>
                  {detalheNorma && detalheNorma.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Nenhuma pergunta desta norma com respostas registradas.</p>
                  ) : (
                    <div className="space-y-2">
                      {detalheNorma?.map((p, i) => (
                        <div key={p.pergunta_id} className={`p-3 rounded-xl border text-xs ${p.erros.length > 0 ? 'bg-rose-950/30 border-rose-500/40' : 'bg-emerald-950/30 border-emerald-500/30'}`}>
                          <div className="font-bold text-white">{i + 1}. {p.enunciado}</div>
                          <div className="text-[10px] text-slate-400 mt-1">{p.categoria} • {p.total} respostas • <span className={p.erros.length > 0 ? 'text-rose-300 font-bold' : 'text-emerald-400 font-bold'}>{p.erros.length} erros</span> • {p.acertos.length} acertos</div>
                          {p.erros.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {p.erros.map((e, j) => (
                                <span key={j} className="inline-flex items-center space-x-1 bg-white/5 border border-rose-500/30 rounded-full px-2 py-0.5 text-[10px] text-rose-200">
                                  <span>✗</span>
                                  <span>{e.nome}</span>
                                  <span className="text-slate-500">({e.setor})</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          <div>
            <h5 className="text-xs font-extrabold text-amber-300 uppercase tracking-wider mb-2">Perguntas Mais Erradas</h5>
            {desempenhoNormas.maisErradas.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Nenhuma pergunta com erros registrados.</p>
            ) : (
              <div className="space-y-2">
                {desempenhoNormas.maisErradas.map((p, i) => (
                  <div key={i} className="bg-rose-950/30 border border-rose-500/30 rounded-xl p-3 text-xs">
                    <div className="font-bold text-white">{i + 1}. {p.enunciado}</div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      {p.categoria} • {p.norma} • <span className="text-rose-300 font-bold">{p.erros} erros</span> de {p.totalRespostas} respostas
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== SEÇÃO 4: DESEMPENHO DOS DESAFIOS ===== */}
      {secao === 'desafios' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-slate-200">Desempenho dos Desafios 1x1</h4>
            <button onClick={exportarDesafios} className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5">
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>

          {/* Por modo */}
          <div className="grid grid-cols-2 gap-3">
            {desempenhoDesafios.porModo.map((m, i) => (
              <div key={i} className="bg-slate-950/60 border border-white/10 rounded-xl p-3 text-center">
                <div className="text-sm font-black text-amber-400 uppercase">{m.modo === 'competitivo' ? 'Competitivo' : 'Amistoso'}</div>
                <div className="text-lg font-black text-white">{m.jogados} jogados • {m.vitorias} vitórias</div>
              </div>
            ))}
          </div>

          <div>
            <h5 className="text-xs font-extrabold text-amber-300 uppercase tracking-wider mb-2">Por Setor</h5>
            {desafiosSetoresFiltrados.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Nenhum desafio concluído com os filtros atuais.</p>
            ) : (
              <div className="space-y-2">
                {desafiosSetoresFiltrados.map(s => (
                  <div key={s.setor_id} className="bg-slate-950/60 border border-white/10 rounded-xl p-3 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white">{s.setor_nome}</div>
                      <div className="text-[10px] text-slate-400">{s.jogados} jogados • {s.vitorias} vitórias • {s.derrotas} derrotas</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-emerald-400">{s.taxaVitoria}%</div>
                      <div className="text-[10px] text-slate-400">{s.pontosGanhos} pts de setor</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h5 className="text-xs font-extrabold text-amber-300 uppercase tracking-wider mb-2">Por Tema</h5>
            {desempenhoDesafios.porTema.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Nenhum tema registrado.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {desempenhoDesafios.porTema.map((t, i) => (
                  <span key={i} className="inline-flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-[11px] text-slate-200">
                    <span className="font-bold">{t.tema}</span>
                    <span className="text-slate-400">{t.jogados} jogados</span>
                    <span className="text-emerald-400 font-bold">{t.taxaVitoria}% vit.</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== SEÇÃO 5: RANKING INDIVIDUAL ===== */}
      {secao === 'ranking' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-slate-200">Ranking Individual de Colaboradores</h4>
            <button onClick={exportarRanking} className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5">
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>

          {/* C1: Filtro por faixa de taxa de acerto */}
          <div className="flex flex-wrap gap-1.5">
            {([
              ['todas', 'Todas as taxas'],
              ['baixo', 'Atenção (<60%)'],
              ['medio', 'Em desenvolvimento (60-85%)'],
              ['alto', 'Alto desempenho (≥85%)'],
            ] as ['todas' | 'baixo' | 'medio' | 'alto', string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFaixaTaxa(key)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  faixaTaxa === key ? 'bg-emerald-500 text-slate-950 shadow-md' : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="text-[10px] text-slate-500 self-center ml-1">Clique nas colunas para ordenar.</span>
          </div>

          {rankingFiltrado.length === 0 ? (
            <p className="text-xs text-slate-500 italic">Nenhum colaborador com participação nos filtros atuais.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] text-slate-400 uppercase border-b border-white/10">
                    <th onClick={() => trocarOrdenacao('nome')} className={`py-2 pr-2 cursor-pointer select-none hover:text-white ${ordenacaoChave === 'nome' ? 'text-emerald-400' : ''}`}>
                      Colaborador {ordenacaoChave === 'nome' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => trocarOrdenacao('setor_nome')} className={`py-2 pr-2 cursor-pointer select-none hover:text-white ${ordenacaoChave === 'setor_nome' ? 'text-emerald-400' : ''}`}>
                      Setor {ordenacaoChave === 'setor_nome' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => trocarOrdenacao('quizzesRespondidos')} className={`py-2 pr-2 text-center cursor-pointer select-none hover:text-white ${ordenacaoChave === 'quizzesRespondidos' ? 'text-emerald-400' : ''}`}>
                      Quizzes {ordenacaoChave === 'quizzesRespondidos' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => trocarOrdenacao('acertos')} className={`py-2 pr-2 text-center cursor-pointer select-none hover:text-white ${ordenacaoChave === 'acertos' ? 'text-emerald-400' : ''}`}>
                      Acertos {ordenacaoChave === 'acertos' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => trocarOrdenacao('erros')} className={`py-2 pr-2 text-center cursor-pointer select-none hover:text-white ${ordenacaoChave === 'erros' ? 'text-emerald-400' : ''}`}>
                      Erros {ordenacaoChave === 'erros' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => trocarOrdenacao('taxaAcerto')} className={`py-2 pr-2 text-center cursor-pointer select-none hover:text-white ${ordenacaoChave === 'taxaAcerto' ? 'text-emerald-400' : ''}`}>
                      Taxa Acerto {ordenacaoChave === 'taxaAcerto' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => trocarOrdenacao('desafiosJogados')} className={`py-2 pr-2 text-center cursor-pointer select-none hover:text-white ${ordenacaoChave === 'desafiosJogados' ? 'text-emerald-400' : ''}`}>
                      Desafios {ordenacaoChave === 'desafiosJogados' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => trocarOrdenacao('desafiosVencidos')} className={`py-2 pr-2 text-center cursor-pointer select-none hover:text-white ${ordenacaoChave === 'desafiosVencidos' ? 'text-emerald-400' : ''}`}>
                      Vitórias {ordenacaoChave === 'desafiosVencidos' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => trocarOrdenacao('taxaVitoria')} className={`py-2 pr-2 text-center cursor-pointer select-none hover:text-white ${ordenacaoChave === 'taxaVitoria' ? 'text-emerald-400' : ''}`}>
                      Taxa Vit. {ordenacaoChave === 'taxaVitoria' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => trocarOrdenacao('acertosDesafios')} className={`py-2 pr-2 text-center cursor-pointer select-none hover:text-white ${ordenacaoChave === 'acertosDesafios' ? 'text-emerald-400' : ''}`}>
                      Acertos Des. {ordenacaoChave === 'acertosDesafios' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => trocarOrdenacao('errosDesafios')} className={`py-2 pr-2 text-center cursor-pointer select-none hover:text-white ${ordenacaoChave === 'errosDesafios' ? 'text-emerald-400' : ''}`}>
                      Erros Des. {ordenacaoChave === 'errosDesafios' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => trocarOrdenacao('pontosTotais')} className={`py-2 text-right cursor-pointer select-none hover:text-white ${ordenacaoChave === 'pontosTotais' ? 'text-emerald-400' : ''}`}>
                      Pontos {ordenacaoChave === 'pontosTotais' && (ordenacaoDir === 'asc' ? '▲' : '▼')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rankingFiltrado.map(r => (
                    <tr
                      key={r.usuario_id}
                      onClick={() => { setColaboradorId(r.usuario_id); setSecao('individual'); }}
                      className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                      title="Clique para ver o relatório individual"
                    >
                      <td className="py-2 pr-2 font-bold text-white">{r.nome}</td>
                      <td className="py-2 pr-2 text-slate-400">{r.setor_nome}</td>
                      <td className="py-2 pr-2 text-center">{r.quizzesRespondidos}</td>
                      <td className="py-2 pr-2 text-center text-emerald-400">{r.acertos}</td>
                      <td className="py-2 pr-2 text-center text-rose-400">{r.erros}</td>
                      <td className="py-2 pr-2 text-center font-bold">{r.taxaAcerto}%</td>
                      <td className="py-2 pr-2 text-center">{r.desafiosJogados}</td>
                      <td className="py-2 pr-2 text-center">{r.desafiosVencidos}</td>
                      <td className="py-2 pr-2 text-center font-bold">{r.taxaVitoria}%</td>
                      <td className="py-2 pr-2 text-center text-emerald-400">{r.acertosDesafios}</td>
                      <td className="py-2 pr-2 text-center text-rose-400">{r.errosDesafios}</td>
                      <td className="py-2 text-right font-black text-emerald-400">{r.pontosTotais}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== SEÇÃO 6: RELATÓRIO INDIVIDUAL ===== */}
      {secao === 'individual' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-extrabold text-slate-200">Relatório Individual do Colaborador</h4>
            <button onClick={exportarIndividual} disabled={!relatorioIndividual} className={`bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1.5 ${!relatorioIndividual ? 'opacity-40 cursor-not-allowed' : 'hover:bg-emerald-500/30'}`}>
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
          </div>

          {!colaboradorId ? (
            <div className="space-y-3">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200">
                <strong>ℹ️ Como usar:</strong> {normaFiltro ? (
                  <>Você veio da análise de normas e a norma <strong>"{normaFiltro}"</strong> já está filtrada. Digite o nome de um colaborador acima (ou escolha na lista) para ver as respostas dele nessa norma.</>
                ) : (
                  <>Digite o nome de um colaborador no campo acima (ou escolha na lista em ordem alfabética) para ver o relatório detalhado.</>
                )}
              </div>

              {/* Sugestão rápida: colaboradores com mais erros na norma filtrada */}
              {normaFiltro && (
                <div className="space-y-2">
                  <h5 className="text-xs font-extrabold text-rose-300 uppercase tracking-wider">Quem mais errou nesta norma</h5>
                  {(() => {
                    // Calcula erros por colaborador apenas na norma filtrada.
                    const mapaErros = new Map<string, { nome: string; setor: string; erros: number; acertos: number }>();
                    quizzesEmpresa
                      .filter(q => q.status === 'concluido')
                      .forEach(q => {
                        (q.respostas || []).forEach(r => {
                          const pergunta = q.perguntas.find(p => p.id === r.pergunta_id) || perguntas.find(p => p.id === r.pergunta_id);
                          if (!pergunta || normalizarTexto(pergunta.norma_relacionada || 'Geral') !== normalizarTexto(normaFiltro)) return;
                          const u = usuariosEmpresa.find(x => x.id === q.colaborador_id);
                          if (!u) return;
                          const e = mapaErros.get(u.id) || { nome: u.nome, setor: setoresEmpresa.find(s => s.id === u.setor_id)?.nome || 'Setor', erros: 0, acertos: 0 };
                          if (r.correta) e.acertos += 1; else e.erros += 1;
                          mapaErros.set(u.id, e);
                        });
                      });
                    const ordenados = Array.from(mapaErros.entries())
                      .map(([id, v]) => ({ id, ...v }))
                      .filter(v => v.erros > 0)
                      .sort((a, b) => b.erros - a.erros)
                      .slice(0, 5);

                    if (ordenados.length === 0) return <p className="text-xs text-slate-500 italic">Nenhum erro registrado nesta norma.</p>;

                    return ordenados.map((v, i) => (
                      <button
                        key={v.id}
                        onClick={() => setColaboradorId(v.id)}
                        className="w-full bg-rose-950/30 border border-rose-500/30 rounded-xl p-2.5 text-xs flex items-center justify-between text-left hover:bg-rose-950/50 transition-all"
                      >
                        <div>
                          <div className="font-bold text-white">{i + 1}. {v.nome}</div>
                          <div className="text-[10px] text-slate-400">{v.setor} • {v.erros} erros • {v.acertos} acertos</div>
                        </div>
                        <span className="text-[10px] text-emerald-400 font-bold shrink-0">Ver relatório →</span>
                      </button>
                    ));
                  })()}
                </div>
              )}
            </div>
          ) : !relatorioIndividual ? (
            <p className="text-xs text-slate-500 italic">Colaborador não encontrado.</p>
          ) : (
            <div className="space-y-4">
              {/* Resumo por norma */}
              <div>
                <h5 className="text-xs font-extrabold text-amber-300 uppercase tracking-wider mb-2">Base de Conhecimento por Norma</h5>
                <p className="text-[10px] text-slate-500 mb-2">Clique em uma norma para filtrar as respostas abaixo por ela.</p>
                {relatorioIndividual.resumoPorNorma.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Sem respostas registradas com os filtros atuais.</p>
                ) : (
                  <div className="space-y-2">
                    {relatorioIndividual.resumoPorNorma.map((n, i) => (
                      <button
                        key={i}
                        onClick={() => setNormaFiltro(normaFiltro === n.norma ? '' : n.norma)}
                        className={`w-full bg-slate-950/60 border border-white/10 rounded-xl p-2.5 text-xs flex items-center justify-between transition-all hover:bg-white/5 ${normaFiltro === n.norma ? 'ring-2 ring-emerald-500/50' : ''}`}
                      >
                        <span className="font-bold text-white">{n.norma}</span>
                        <span className={n.taxaAcerto < 60 ? 'text-rose-400 font-bold' : n.taxaAcerto < 80 ? 'text-amber-300 font-bold' : 'text-emerald-400 font-bold'}>{n.taxaAcerto}% ({n.acertos}/{n.total})</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Quizzes */}
              <div>
                <h5 className="text-xs font-extrabold text-emerald-300 uppercase tracking-wider mb-2">Quizzes Respondidos ({relatorioIndividual.quizzes.length})</h5>
                {relatorioIndividual.quizzes.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Nenhum quiz com os filtros atuais.</p>
                ) : (
                  <div className="space-y-3">
                    {relatorioIndividual.quizzes.map(q => (
                      <div key={q.quiz_id} className="bg-slate-950/60 border border-white/10 rounded-xl p-3 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <div className="font-bold text-white">{q.titulo} <span className="text-slate-500 font-normal">• {new Date(q.respondido_em).toLocaleDateString('pt-BR')}</span></div>
                          <div className="text-emerald-400 font-black">{q.pontuacao_total} pts • {q.totalAcertos}/{q.totalPerguntas}</div>
                        </div>
                        <div className="space-y-1.5">
                          {q.respostas.map((r, j) => (
                            <div key={j} className={`p-2 rounded-lg border text-[11px] ${r.correta ? 'bg-emerald-950/30 border-emerald-500/20' : 'bg-rose-950/30 border-rose-500/30'}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <div className="text-slate-200">{r.enunciado}</div>
                                  <div className={`text-[10px] mt-0.5 ${r.correta ? 'text-emerald-400' : 'text-rose-300'}`}>
                                    {r.correta ? '✓ ' : '✗ '}{r.alternativaEscolhidaTexto}
                                    {!r.correta && <span className="text-slate-400"> • Correto: {r.respostaCorretaTexto}</span>}
                                  </div>
                                  {r.explicacao && <div className="text-[10px] text-slate-400 mt-0.5">💡 {r.explicacao}</div>}
                                </div>
                                <span className="text-[9px] text-slate-500 shrink-0">{r.norma}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Desafios */}
              <div>
                <h5 className="text-xs font-extrabold text-purple-300 uppercase tracking-wider mb-2">Desafios 1x1 ({relatorioIndividual.desafios.length})</h5>
                {relatorioIndividual.desafios.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Nenhum desafio com os filtros atuais.</p>
                ) : (
                  <div className="space-y-3">
                    {relatorioIndividual.desafios.map(d => (
                      <div key={d.desafio_id} className="bg-slate-950/60 border border-white/10 rounded-xl p-3 space-y-2">
                        <div className="flex flex-wrap justify-between items-center text-xs gap-2">
                          <div className="font-bold text-white">
                            {d.tipo} • {d.tema}
                            <span className="text-slate-500 font-normal"> vs {d.oponente} • {new Date(d.data).toLocaleDateString('pt-BR')}</span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="text-slate-400 text-[10px]">{d.placar}</span>
                            {d.venceu === true && <span className="text-emerald-400 font-bold">✓ VENCEU</span>}
                            {d.venceu === false && <span className="text-rose-400 font-bold">✗ PERDEU</span>}
                            {d.venceu === null && <span className="text-slate-500 text-[10px]">{d.status}</span>}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          {d.respostasMinhas.map((r, j) => (
                            <div key={j} className={`p-2 rounded-lg border text-[11px] ${r.correta ? 'bg-emerald-950/30 border-emerald-500/20' : 'bg-rose-950/30 border-rose-500/30'}`}>
                              <div className="text-slate-200">{r.enunciado}</div>
                              <div className={`text-[10px] mt-0.5 ${r.correta ? 'text-emerald-400' : 'text-rose-300'}`}>
                                {r.correta ? '✓ ' : '✗ '}{r.alternativaEscolhidaTexto}
                                {!r.correta && <span className="text-slate-400"> • Correto: {r.respostaCorretaTexto}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
