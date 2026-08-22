import React, { useState, useEffect, useMemo, useRef } from 'react';
import { formatAlternativaText, normalizeAlternativas } from '../../../utils/questionHelpers';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { ResultadoAvaliacaoSST } from '../../../types';
import { useSST } from '../../../context/SSTContext';
import { 
  X, 
  Printer, 
  Mail, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Award, 
  Building2, 
  User, 
  Calendar, 
  Clock, 
  FileText,
  Sparkles,
  CheckSquare,
  Square,
  Send,
  AlertCircle,
  Download,
  Settings,
  Image as ImageIcon,
  RotateCcw,
  Save,
  Check,
  Upload,
  Layers,
  FileCheck,
  Lock
} from 'lucide-react';

export interface CabecalhoLaudoConfig {
  empresaNome: string;
  tituloDocumento: string;
  subtituloOuRegistro: string;
  textoEvidenciaLegal: string;
  logoUrl?: string; // Data URL base64 ou URL HTTP
  logoTamanho: 'pequeno' | 'medio' | 'grande';
  cargoInstrutorPersonalizado?: string;
  corTema: 'slate' | 'emerald' | 'blue' | 'navy';
}

const CONFIG_STORAGE_KEY_PREFIX = 'sst_cabecalho_laudo_config_';

interface ProvaAvaliacaoPDFModalProps {
  resultado: ResultadoAvaliacaoSST | null;
  isOpen: boolean;
  onClose: () => void;
  modoInicial?: 'visualizar' | 'imprimir' | 'baixar_pdf';
}

export const ProvaAvaliacaoPDFModal: React.FC<ProvaAvaliacaoPDFModalProps> = ({
  resultado,
  isOpen,
  onClose,
  modoInicial = 'visualizar'
}) => {
  const { currentUser, empresas } = useSST();

  const isSuperAdmin = currentUser?.perfil === 'super_admin';
  const isAdminEmpresa = currentUser?.perfil === 'admin';

  // REGRAS DE ISOLAMENTO MULTI-TENANT E PERMISSÕES:
  // 1. Identifica a empresa dona do laudo/documento
  const empresaIdChave = resultado?.empresa_id || currentUser?.empresa_id || 'global';

  // 2. Apenas ADMINISTRADORES (Super Admin ou Admin da respectiva empresa) podem editar cabeçalho.
  // Colaboradores, funcionários e alunos NÃO têm permissão de alterar o cabeçalho oficial.
  const podeEditarCabecalho = isSuperAdmin || (isAdminEmpresa && (!resultado?.empresa_id || resultado.empresa_id === currentUser?.empresa_id));

  // Estados de controle da interface
  const [mostrarExplicacoes, setMostrarExplicacoes] = useState<boolean>(true);
  const [showEmailDialog, setShowEmailDialog] = useState<boolean>(false);
  const [showConfigPainel, setShowConfigPainel] = useState<boolean>(false);
  const [emailDestinatario, setEmailDestinatario] = useState<string>('');
  const [emailStatus, setEmailStatus] = useState<{ tipo: 'sucesso' | 'erro' | null; mensagem: string; fileUrl?: string }>({ tipo: null, mensagem: '' });
  const [enviandoEmail, setEnviandoEmail] = useState<boolean>(false);
  const [gerandoPdf, setGerandoPdf] = useState<boolean>(false);
  const [imprimindo, setImprimindo] = useState<boolean>(false);
  const [configSalvaSucesso, setConfigSalvaSucesso] = useState<boolean>(false);
  const [isDraggingLogo, setIsDraggingLogo] = useState<boolean>(false);
  const [urlLogoInput, setUrlLogoInput] = useState<string>('');
  const [erroLogoMsg, setErroLogoMsg] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Busca o nome oficial da empresa cadastrada no sistema
  const empresaCadastrada = empresas?.find(e => e.id === empresaIdChave);
  const nomeEmpresaResolvido = empresaCadastrada?.nome || resultado?.empresa_nome || 'SST QUIZ CORPORATE — SEGURANÇA E SAÚDE NO TRABALHO';

  // Configuração inicial do cabeçalho
  const padraoConfig: CabecalhoLaudoConfig = useMemo(() => ({
    empresaNome: nomeEmpresaResolvido,
    tituloDocumento: 'AVALIAÇÃO TEÓRICA DE TREINAMENTO SST',
    subtituloOuRegistro: 'SESMT — Serviço Especializado em Engenharia de Segurança e Medicina do Trabalho',
    textoEvidenciaLegal: 'Evidência documental individual de verificação de conhecimento técnico para atendimento de normas regulamentadoras e procedimentos de segurança do trabalho.',
    logoUrl: '',
    logoTamanho: 'medio',
    cargoInstrutorPersonalizado: resultado?.instrutor_cargo || 'Técnico de Segurança do Trabalho / Instrutor SST',
    corTema: 'slate'
  }), [nomeEmpresaResolvido, resultado]);

  const [cabecalhoConfig, setCabecalhoConfig] = useState<CabecalhoLaudoConfig>(padraoConfig);

  // Carrega configurações personalizadas salvas no localStorage EXCLUSIVAS da empresa dona do laudo
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`${CONFIG_STORAGE_KEY_PREFIX}${empresaIdChave}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setCabecalhoConfig({ ...padraoConfig, ...parsed });
      } else {
        setCabecalhoConfig(padraoConfig);
      }
    } catch (_) {
      setCabecalhoConfig(padraoConfig);
    }
  }, [empresaIdChave, padraoConfig]);

  // =========================================================================
  // ALGORITMO INTELIGENTE DE PAGINAÇÃO A4
  // Distribui as perguntas e blocos para que NENHUMA PERGUNTA SEJA CORTADA
  // =========================================================================
  const paginasCalculadas = useMemo(() => {
    const questoes = resultado?.respostas_detalhadas || [];
    const totalQuestoes = questoes.length;

    if (totalQuestoes === 0) {
      return [{ tipo: 'unica', questoes: [] }];
    }

    // Calcula peso estimado de cada questão em unidades de altura
    const getPesoQuestao = (q: typeof questoes[0]) => {
      let peso = 120; // Base: número, badges, padding
      peso += Math.max(1, Math.ceil((q.enunciado?.length || 0) / 60)) * 22;
      const alts = q.alternativas || [q.resposta_fornecida, q.resposta_correta, 'Opção C', 'Opção D'];
      alts.forEach(alt => {
        peso += Math.max(34, Math.ceil((alt?.length || 0) / 45) * 20);
      });
      if (mostrarExplicacoes && q.explicacao) {
        peso += 32 + Math.ceil((q.explicacao.length || 0) / 70) * 18;
      }
      return peso;
    };

    // Capacidades de cada página (em unidades de peso)
    // Página 1: Cabeçalho Oficial + Dados Participante + Painel Notas consom ~480. Sobram ~440.
    const CAPACIDADE_PAGINA_1 = 440;
    // Páginas Intermediárias: Apenas mini-cabeçalho e rodapé (~80). Sobram ~840.
    const CAPACIDADE_PAGINA_MEIO = 840;
    // Bloco Final (Declaração + 2 Assinaturas + Rodapé Oficial): consome ~290.
    const PESO_BLOCO_FINAL = 290;

    const pages: {
      numeroPagina: number;
      isPagina1: boolean;
      questoes: { questao: typeof questoes[0]; originalIndex: number }[];
      incluiBlocoFinal: boolean;
    }[] = [];

    let qIdx = 0;

    // --- PÁGINA 1 ---
    const questoesP1: { questao: typeof questoes[0]; originalIndex: number }[] = [];
    let pesoAcumuladoP1 = 0;

    while (qIdx < totalQuestoes) {
      const q = questoes[qIdx];
      const pesoQ = getPesoQuestao(q);

      // Se for a primeira questão da página 1, sempre cabe
      if (questoesP1.length === 0) {
        questoesP1.push({ questao: q, originalIndex: qIdx });
        pesoAcumuladoP1 += pesoQ;
        qIdx++;
      } else if (pesoAcumuladoP1 + pesoQ <= CAPACIDADE_PAGINA_1) {
        questoesP1.push({ questao: q, originalIndex: qIdx });
        pesoAcumuladoP1 += pesoQ;
        qIdx++;
      } else {
        break; // Página 1 cheia
      }
    }

    // Verifica se cabe o bloco final na Página 1 (caso de poucas questões, ex: 1 questão)
    const cabeBlocoFinalP1 = (qIdx >= totalQuestoes) && (pesoAcumuladoP1 + PESO_BLOCO_FINAL <= CAPACIDADE_PAGINA_1 + 100);

    pages.push({
      numeroPagina: 1,
      isPagina1: true,
      questoes: questoesP1,
      incluiBlocoFinal: cabeBlocoFinalP1
    });

    // --- PÁGINAS SUBSEQUENTES (2, 3...) ---
    let numPag = 2;
    while (qIdx < totalQuestoes) {
      const questoesPagina: { questao: typeof questoes[0]; originalIndex: number }[] = [];
      let pesoAcumulado = 0;

      while (qIdx < totalQuestoes) {
        const q = questoes[qIdx];
        const pesoQ = getPesoQuestao(q);

        if (questoesPagina.length === 0) {
          questoesPagina.push({ questao: q, originalIndex: qIdx });
          pesoAcumulado += pesoQ;
          qIdx++;
        } else if (pesoAcumulado + pesoQ <= CAPACIDADE_PAGINA_MEIO) {
          questoesPagina.push({ questao: q, originalIndex: qIdx });
          pesoAcumulado += pesoQ;
          qIdx++;
        } else {
          break; // Página intermediária cheia
        }
      }

      // Se terminou todas as questões, verifica se o bloco final cabe nesta página
      const todasQuestoesAlocadas = (qIdx >= totalQuestoes);
      const cabeBlocoFinal = todasQuestoesAlocadas && (pesoAcumulado + PESO_BLOCO_FINAL <= CAPACIDADE_PAGINA_MEIO);

      pages.push({
        numeroPagina: numPag,
        isPagina1: false,
        questoes: questoesPagina,
        incluiBlocoFinal: cabeBlocoFinal
      });

      numPag++;
    }

    // Se o bloco final não coube na última página com questões, adiciona página exclusiva para o Bloco Final
    const ultimoFoiComBlocoFinal = pages[pages.length - 1]?.incluiBlocoFinal;
    if (!ultimoFoiComBlocoFinal) {
      pages.push({
        numeroPagina: numPag,
        isPagina1: false,
        questoes: [],
        incluiBlocoFinal: true
      });
    }

    return pages;
  }, [resultado, mostrarExplicacoes]);

  const totalPaginas = paginasCalculadas.length;

  // =========================================================================
  // PROCESSAMENTO E OTIMIZAÇÃO DE LOGO (COMPRESSÃO EM CANVAS)
  // Suporta qualquer tamanho de imagem, otimiza para PNG cristalino de ~20-30KB,
  // evitando sobrecarga de memória, travamentos e estouro do LocalStorage.
  // =========================================================================
  const otimizarImagemParaDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('Nenhum arquivo de imagem fornecido.'));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo de imagem.'));
      reader.onload = (e) => {
        const rawData = e.target?.result as string;
        if (!rawData) {
          reject(new Error('Arquivo vazio ou corrompido.'));
          return;
        }

        // Se for SVG, pode ser utilizado diretamente
        if (file.type === 'image/svg+xml' || rawData.startsWith('data:image/svg+xml')) {
          resolve(rawData);
          return;
        }

        const img = new Image();
        img.onerror = () => resolve(rawData); // Fallback para rawData
        img.onload = () => {
          try {
            const MAX_WIDTH = 500;
            const MAX_HEIGHT = 300;
            let { width, height } = img;

            if (width > MAX_WIDTH || height > MAX_HEIGHT) {
              const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
              width = Math.max(1, Math.round(width * ratio));
              height = Math.max(1, Math.round(height * ratio));
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(rawData);
              return;
            }

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);

            const compactPng = canvas.toDataURL('image/png');
            resolve(compactPng);
          } catch (canvasErr) {
            console.warn('Fallback de compressão de imagem:', canvasErr);
            resolve(rawData);
          }
        };
        img.src = rawData;
      };
      reader.readAsDataURL(file);
    });
  };

  // Manipuladores de Upload de Logo
  const aplicarArquivoLogo = async (file: File) => {
    setErroLogoMsg('');
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErroLogoMsg('Formato não suportado. Por favor, envie uma imagem PNG, JPG, WebP ou SVG.');
      return;
    }

    try {
      const dataUrl = await otimizarImagemParaDataUrl(file);
      setCabecalhoConfig(prev => ({ ...prev, logoUrl: dataUrl }));
      setErroLogoMsg('');
    } catch (err: any) {
      console.error('Erro ao processar imagem:', err);
      setErroLogoMsg('Não foi possível carregar a imagem. Tente outro arquivo ou formato.');
    }
  };

  const handleUploadLogoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      aplicarArquivoLogo(file);
    }
    // Reseta o input para permitir selecionar o mesmo arquivo novamente
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDropLogo = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingLogo(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      aplicarArquivoLogo(file);
    }
  };

  const handleCarregarUrlLogo = (e: React.FormEvent) => {
    e.preventDefault();
    setErroLogoMsg('');
    const url = urlLogoInput.trim();
    if (!url) return;

    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:image/')) {
      setErroLogoMsg('A URL deve começar com https://, http:// ou data:image/');
      return;
    }

    setCabecalhoConfig(prev => ({ ...prev, logoUrl: url }));
    setUrlLogoInput('');
  };

  const handleRemoverLogo = () => {
    setCabecalhoConfig(prev => ({ ...prev, logoUrl: '' }));
    setErroLogoMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSalvarComoPadrao = () => {
    if (!podeEditarCabecalho) return;
    try {
      localStorage.setItem(`${CONFIG_STORAGE_KEY_PREFIX}${empresaIdChave}`, JSON.stringify(cabecalhoConfig));
      setConfigSalvaSucesso(true);
      setTimeout(() => setConfigSalvaSucesso(false), 3000);
    } catch (e) {
      console.error('Erro ao salvar configuração do cabeçalho:', e);
      setErroLogoMsg('Aviso: Armazenamento local cheio. Tente usar uma logo de tamanho menor.');
    }
  };

  const handleRestaurarPadrao = () => {
    if (!podeEditarCabecalho) return;
    setCabecalhoConfig(padraoConfig);
    setErroLogoMsg('');
    try {
      localStorage.removeItem(`${CONFIG_STORAGE_KEY_PREFIX}${empresaIdChave}`);
    } catch (_) {}
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // =========================================================================
  // GERAÇÃO DO PDF PÁGINA POR PÁGINA (ZERO CORTES OU SOBREPOSIÇÕES)
  // =========================================================================
  const gerarPdfBlob = async (paraEmail = false): Promise<{ pdfBase64: string; blob: Blob; filename: string } | null> => {
    try {
      const pageElements = document.querySelectorAll<HTMLElement>('.prova-pdf-page-container');
      if (!pageElements || pageElements.length === 0) {
        console.error('Nenhum contêiner de página encontrado para o PDF.');
        return null;
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const formatoImg = paraEmail ? 'JPEG' : 'PNG';
      const escala = paraEmail ? 1.5 : 2.0;

      for (let i = 0; i < pageElements.length; i++) {
        const pageEl = pageElements[i];

        const canvas = await html2canvas(pageEl, {
          scale: escala,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: 1000,
        });

        const imgData = paraEmail 
          ? canvas.toDataURL('image/jpeg', 0.85) 
          : canvas.toDataURL('image/png');

        if (i > 0) {
          pdf.addPage('a4', 'portrait');
        }

        // Desenha exatamente no formato A4 (210mm x 297mm)
        pdf.addImage(imgData, formatoImg, 0, 0, 210, 297);
      }

      const pdfBase64 = pdf.output('datauristring');
      const blob = pdf.output('blob');
      const filename = `Avaliacao_Teorica_SST_${(resultado?.participante_nome || 'Participante').replace(/\s+/g, '_')}_${codigoDocumento}.pdf`;

      return { pdfBase64, blob, filename };
    } catch (e) {
      console.error('Erro ao gerar canvas/pdf:', e);
      return null;
    }
  };

  // Baixar arquivo PDF diretamente no computador
  const handleBaixarPdfDireto = async () => {
    setGerandoPdf(true);
    try {
      const resData = await gerarPdfBlob(false);
      if (resData) {
        const url = URL.createObjectURL(resData.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = resData.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        alert('Não foi possível gerar o PDF. Verifique se o navegador suporta a captura.');
      }
    } catch (e) {
      console.error('Erro ao baixar o PDF do laudo:', e);
      alert('Erro inesperado ao gerar o PDF. Tente usar o botão Imprimir.');
    } finally {
      setGerandoPdf(false);
    }
  };

  // =========================================================================
  // IMPRESSÃO NATIVA ROBUSTA E ISOLADA A4
  // Resolve o problema de navegadores/iframes onde o print convencional
  // não disparava ou imprimia o fundo da aplicação inteira.
  // =========================================================================
  const executarImpressaoNativa = async () => {
    setImprimindo(true);
    try {
      window.focus();
      window.print();
    } catch (err) {
      console.warn('Fallback para download do PDF:', err);
      await handleBaixarPdfDireto();
    } finally {
      setTimeout(() => setImprimindo(false), 800);
    }
  };

  // Gatilho automático caso a modal tenha sido aberta a partir do botão Imprimir ou Baixar PDF
  useEffect(() => {
    if (!isOpen || !resultado) return;

    if (modoInicial === 'imprimir') {
      const timer = setTimeout(() => {
        executarImpressaoNativa();
      }, 350);
      return () => clearTimeout(timer);
    } else if (modoInicial === 'baixar_pdf') {
      const timer = setTimeout(() => {
        handleBaixarPdfDireto();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen, resultado, modoInicial]);

  // Envio por e-mail
  const handleAbrirEmailModal = () => {
    setEmailDestinatario(resultado.email && resultado.email !== 'Visitante' && resultado.email !== 'Cadastrado' ? resultado.email : '');
    setEmailStatus({ tipo: null, mensagem: '' });
    setShowEmailDialog(true);
  };

  const handleEnviarEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!emailDestinatario || !emailDestinatario.includes('@') || !emailDestinatario.includes('.')) {
      setEmailStatus({
        tipo: 'erro',
        mensagem: 'Por favor, informe um endereço de e-mail válido para o envio da prova.'
      });
      return;
    }

    setEnviandoEmail(true);
    setEmailStatus({ tipo: null, mensagem: '' });

    try {
      const pdfData = await gerarPdfBlob(true);
      if (!pdfData) {
        setEmailStatus({
          tipo: 'erro',
          mensagem: 'Não foi possível gerar o PDF do laudo. Verifique o console e tente novamente.'
        });
        setEnviandoEmail(false);
        return;
      }

      const apiToken = (import.meta.env.VITE_API_TOKEN as string | undefined) || "";
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiToken) headers['x-api-token'] = apiToken;

      const res = await fetch('/api/enviar_email_prova', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: emailDestinatario,
          nome: resultado.participante_nome,
          resultado,
          pdfBase64: pdfData.pdfBase64,
        }),
      });

      let body: any = {};
      try {
        body = await res.json();
      } catch (_) {
        body = { error: 'O servidor retornou uma resposta inesperada.' };
      }

      if (res.ok && body.success) {
        setEmailStatus({
          tipo: 'sucesso',
          mensagem: body.message || `Laudo e Prova em PDF enviados com sucesso para ${emailDestinatario}!`,
          fileUrl: body.fileUrl,
        });
      } else {
        const erro = body.error || 'Não foi possível concluir o envio por e-mail no servidor.';
        setEmailStatus({
          tipo: 'erro',
          mensagem: `${erro} Utilize o botão "Baixar PDF" para salvar diretamente no dispositivo.`
        });
      }
    } catch (err: any) {
      console.error('Erro ao enviar e-mail:', err);
      setEmailStatus({
        tipo: 'erro',
        mensagem: 'Erro de conexão com o servidor de e-mail. Utilize a opção "Baixar PDF" para salvar localmente.'
      });
    } finally {
      setEnviandoEmail(false);
    }
  };

  // Cores do tema selecionado
  const getThemeColors = () => {
    switch (cabecalhoConfig.corTema) {
      case 'emerald':
        return {
          headerBg: 'bg-emerald-950',
          badgeBorder: 'border-emerald-700',
          titleColor: 'text-emerald-950',
          accentColor: 'text-emerald-700',
          dividerColor: 'border-emerald-800',
          monogramBg: 'bg-emerald-800'
        };
      case 'blue':
        return {
          headerBg: 'bg-blue-950',
          badgeBorder: 'border-blue-700',
          titleColor: 'text-blue-950',
          accentColor: 'text-blue-700',
          dividerColor: 'border-blue-800',
          monogramBg: 'bg-blue-800'
        };
      case 'navy':
        return {
          headerBg: 'bg-indigo-950',
          badgeBorder: 'border-indigo-700',
          titleColor: 'text-indigo-950',
          accentColor: 'text-indigo-700',
          dividerColor: 'border-indigo-800',
          monogramBg: 'bg-indigo-900'
        };
      case 'slate':
      default:
        return {
          headerBg: 'bg-slate-900',
          badgeBorder: 'border-slate-800',
          titleColor: 'text-slate-900',
          accentColor: 'text-slate-800',
          dividerColor: 'border-slate-900',
          monogramBg: 'bg-slate-900'
        };
    }
  };

  const themeColors = getThemeColors();

  if (!isOpen || !resultado) return null;

  const aprovado = resultado.situacao === 'APROVADO' || resultado.situacao === 'Aprovado';

  // Formatação de Horários e Códigos Únicos
  const dataProvaFormatada = resultado.data_finalizacao 
    ? new Date(resultado.data_finalizacao).toLocaleDateString('pt-BR') 
    : resultado.data;

  const horaProvaFormatada = resultado.data_finalizacao
    ? new Date(resultado.data_finalizacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '14:00';

  const codigoDocumento = resultado.codigo_documento || `DOC-SST-${(resultado.sala_id || 'SALASST').slice(-6).toUpperCase()}-${(resultado.id || 'PART').slice(-4).toUpperCase()}`;
  const codigoSessao = resultado.sessao_codigo || `SST-SESSAO-${(resultado.sala_id || 'SALASST').slice(-6).toUpperCase()}`;

  return (
    <div className="sst-laudo-modal-backdrop fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 overflow-y-auto p-2 sm:p-6 flex flex-col items-center font-sans">
      
      {/* =========================================================================
          ESTILOS DE IMPRESSÃO A4 PROFISSIONAL (PÁGINA POR PÁGINA)
      ========================================================================= */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0mm !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
          }
          /* Remove backdrop escuro e garante fluxo A4 */
          .sst-laudo-modal-backdrop {
            position: static !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            inset: auto !important;
            display: block !important;
            width: 100% !important;
            height: auto !important;
            min-height: auto !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
          }
          .print-hidden, nav, header, footer, button, .no-print {
            display: none !important;
          }
          #impressao-laudo-completo-root {
            display: block !important;
            position: static !important;
            width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          .prova-pdf-page-container {
            width: 210mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            height: 297mm !important;
            padding: 12mm 14mm !important;
            margin: 0 auto !important;
            page-break-after: always !important;
            break-after: page !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
            background: #ffffff !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          .prova-pdf-page-container:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .page-break-inside-avoid {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* PAINEL FLUTUANTE SUPERIOR DE CONTROLES (NÃO SAI NA IMPRESSÃO) */}
      <div className="w-full max-w-4xl bg-slate-900 border border-white/20 rounded-3xl p-4 sm:p-5 text-white mb-6 shadow-2xl print-hidden space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-black text-base text-white">Laudo Oficial de Avaliação SST</h3>
                <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  {totalPaginas} {totalPaginas === 1 ? 'Página A4' : 'Páginas A4'}
                </span>
                {!podeEditarCabecalho && (
                  <span className="text-[10px] font-bold bg-slate-800 text-slate-300 border border-white/10 px-2 py-0.5 rounded-full flex items-center space-x-1">
                    <Lock className="w-3 h-3 text-amber-400" />
                    <span>Cabeçalho Oficial da Empresa</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">Layout diagramado com proteção contra quebras de texto e alternativas</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-2">
            {/* Botão de Personalização do Cabeçalho - EXCLUSIVO PARA ADMINISTRADORES */}
            {podeEditarCabecalho && (
              <button
                onClick={() => setShowConfigPainel(!showConfigPainel)}
                className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center space-x-1.5 transition-all border ${
                  showConfigPainel
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-500/30'
                }`}
                title="Personalizar Logo, Título da Empresa e Cabeçalho do Laudo (Apenas Administradores)"
              >
                <Settings className="w-4 h-4" />
                <span>Personalizar Cabeçalho</span>
              </button>
            )}

            {/* Alternar Explicações */}
            <button
              onClick={() => setMostrarExplicacoes(!mostrarExplicacoes)}
              className="bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/40 px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1"
              title="Alternar fundamentação técnica SST no documento"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>{mostrarExplicacoes ? 'Ocultar Explicações' : 'Exibir Explicações'}</span>
            </button>

            {/* Baixar PDF Direto */}
            <button
              onClick={handleBaixarPdfDireto}
              disabled={gerandoPdf}
              className="bg-purple-600 hover:bg-purple-500 text-white font-black px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-md disabled:opacity-50"
              title="Baixar arquivo PDF com formatação A4 oficial"
            >
              <Download className="w-4 h-4" />
              <span>{gerandoPdf ? 'Gerando A4...' : 'Baixar PDF'}</span>
            </button>

            {/* Enviar E-mail */}
            <button
              onClick={handleAbrirEmailModal}
              className="bg-blue-600 hover:bg-blue-500 text-white font-black px-3.5 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-md"
            >
              <Mail className="w-4 h-4" />
              <span>Enviar por E-mail</span>
            </button>

            {/* Imprimir */}
            <button
              onClick={executarImpressaoNativa}
              disabled={imprimindo}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 transition-all shadow-md disabled:opacity-50"
              title="Abrir diálogo de impressão direta em formato A4"
            >
              <Printer className="w-4 h-4" />
              <span>{imprimindo ? 'Preparando...' : 'Imprimir'}</span>
            </button>

            {/* Fechar */}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PAINEL EXPANSÍVEL: PERSONALIZADOR DE CABEÇALHO & LOGO (EXCLUSIVO PARA ADMINISTRADORES) */}
        {podeEditarCabecalho && showConfigPainel && (
          <div className="bg-slate-950/95 border border-amber-500/40 rounded-2xl p-4 sm:p-6 space-y-4 text-xs animate-fadeIn">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 flex-wrap gap-2">
              <div className="flex items-center space-x-2 text-amber-400 font-black">
                <ImageIcon className="w-5 h-5" />
                <span className="text-sm">Personalização de Logotipo e Cabeçalho Oficial — {cabecalhoConfig.empresaNome || 'Empresa'}</span>
              </div>
              <span className="text-[10px] text-slate-400">
                Alterações isoladas para esta empresa
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Coluna 1: Logo e Imagem */}
              <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/10">
                <span className="font-extrabold text-slate-200 block text-[11px] flex items-center space-x-1.5">
                  <Upload className="w-3.5 h-3.5 text-amber-400" />
                  <span>Logotipo da Empresa ou Consultoria SST</span>
                </span>

                {/* Área de Visualização e Dropzone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingLogo(true); }}
                  onDragLeave={() => setIsDraggingLogo(false)}
                  onDrop={handleDropLogo}
                  className={`border-2 border-dashed rounded-xl p-3 text-center transition-all flex flex-col items-center justify-center space-y-2 ${
                    isDraggingLogo
                      ? 'border-amber-400 bg-amber-500/10'
                      : 'border-white/20 bg-slate-900/80 hover:border-amber-500/40'
                  }`}
                >
                  {cabecalhoConfig.logoUrl ? (
                    <div className="relative p-2 bg-white rounded-xl border border-slate-300 w-full max-w-[220px] h-20 flex items-center justify-center overflow-hidden shadow-inner">
                      <img 
                        src={cabecalhoConfig.logoUrl} 
                        alt="Logo Empresa" 
                        className="max-w-full max-h-full object-contain"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="py-2 flex flex-col items-center text-slate-400 space-y-1">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 font-black flex items-center justify-center text-sm">
                        SST
                      </div>
                      <span className="text-[11px] font-bold text-slate-300">Nenhum logotipo anexado</span>
                      <span className="text-[10px] text-slate-500">Arraste uma imagem ou clique para selecionar</span>
                    </div>
                  )}

                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleUploadLogoInput} 
                    accept="image/png, image/jpeg, image/svg+xml, image/webp" 
                    className="hidden" 
                  />

                  <div className="flex items-center space-x-2 w-full pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                          fileInputRef.current.click();
                        }
                      }}
                      className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-3 py-2 rounded-xl text-xs flex items-center justify-center space-x-1.5 shadow-md transition-all"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{cabecalhoConfig.logoUrl ? 'Trocar Logotipo' : 'Selecionar Arquivo'}</span>
                    </button>

                    {cabecalhoConfig.logoUrl && (
                      <button
                        type="button"
                        onClick={handleRemoverLogo}
                        className="text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 font-bold px-3 py-2 rounded-xl text-xs transition-colors"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>

                {/* Opção de Colar URL Direta */}
                <form onSubmit={handleCarregarUrlLogo} className="flex items-center space-x-1.5">
                  <input
                    type="text"
                    value={urlLogoInput ?? ''}
                    onChange={(e) => setUrlLogoInput(e.target.value)}
                    placeholder="Ou cole a URL da imagem (https://...)"
                    className="flex-1 bg-slate-900 border border-white/20 rounded-xl px-2.5 py-1.5 text-white focus:outline-none focus:border-amber-400 text-[11px]"
                  />
                  <button
                    type="submit"
                    className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold px-2.5 py-1.5 rounded-xl text-[11px] border border-amber-500/30 whitespace-nowrap"
                  >
                    Carregar URL
                  </button>
                </form>

                {erroLogoMsg && (
                  <div className="text-rose-400 bg-rose-500/10 border border-rose-500/30 p-2 rounded-xl text-[11px] flex items-center space-x-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{erroLogoMsg}</span>
                  </div>
                )}

                {/* Altura da Logo */}
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">
                    Dimensão / Altura da Logo no Documento:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['pequeno', 'medio', 'grande'] as const).map(tam => (
                      <button
                        key={tam}
                        type="button"
                        onClick={() => setCabecalhoConfig(prev => ({ ...prev, logoTamanho: tam }))}
                        className={`py-1.5 rounded-xl text-[11px] font-bold capitalize border ${
                          cabecalhoConfig.logoTamanho === tam
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                            : 'bg-slate-900 text-slate-300 border-white/10 hover:bg-white/5'
                        }`}
                      >
                        {tam === 'pequeno' ? 'Pequena (40px)' : tam === 'medio' ? 'Média (50px)' : 'Grande (65px)'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Paleta Temática */}
                <div>
                  <label className="block text-slate-400 text-[10px] font-bold mb-1">
                    Estilo Visual e Cor das Linhas:
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: 'slate', nome: 'Grafite', cor: 'bg-slate-800' },
                      { id: 'emerald', nome: 'Verde SST', cor: 'bg-emerald-700' },
                      { id: 'blue', nome: 'Azul', cor: 'bg-blue-700' },
                      { id: 'navy', nome: 'Marinho', cor: 'bg-indigo-900' }
                    ].map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setCabecalhoConfig(prev => ({ ...prev, corTema: t.id as any }))}
                        className={`py-1 px-2 rounded-xl text-[10px] font-bold flex items-center justify-center space-x-1 border ${
                          cabecalhoConfig.corTema === t.id
                            ? 'bg-white text-slate-950 border-white ring-2 ring-amber-400'
                            : 'bg-slate-900 text-slate-300 border-white/10 hover:bg-white/5'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${t.cor}`} />
                        <span>{t.nome}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Coluna 2: Textos Oficiais e Títulos */}
              <div className="space-y-2.5 bg-white/5 p-3.5 rounded-xl border border-white/10">
                <div>
                  <label className="block text-slate-300 font-bold mb-0.5 text-[11px]">
                    Nome da Empresa / Razão Social / Instituição:
                  </label>
                  <input
                    type="text"
                    value={cabecalhoConfig.empresaNome ?? ''}
                    onChange={(e) => setCabecalhoConfig(prev => ({ ...prev, empresaNome: e.target.value }))}
                    placeholder="Ex: MINHA EMPRESA LTDA — SEGURANÇA E SAÚDE"
                    className="w-full bg-slate-900 border border-white/20 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-amber-400 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-0.5 text-[11px]">
                    Título Principal do Laudo / Avaliação:
                  </label>
                  <input
                    type="text"
                    value={cabecalhoConfig.tituloDocumento ?? ''}
                    onChange={(e) => setCabecalhoConfig(prev => ({ ...prev, tituloDocumento: e.target.value }))}
                    placeholder="Ex: AVALIAÇÃO TEÓRICA DE TREINAMENTO SST"
                    className="w-full bg-slate-900 border border-white/20 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-amber-400 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-0.5 text-[11px]">
                    Subtítulo / Departamento / Registro / CNPJ:
                  </label>
                  <input
                    type="text"
                    value={cabecalhoConfig.subtituloOuRegistro ?? ''}
                    onChange={(e) => setCabecalhoConfig(prev => ({ ...prev, subtituloOuRegistro: e.target.value }))}
                    placeholder="Ex: SESMT — CNPJ: 00.000.000/0001-00 • Reg. MTE: 12345"
                    className="w-full bg-slate-900 border border-white/20 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-amber-400 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-0.5 text-[11px]">
                    Cargo / Registro do Instrutor na Assinatura:
                  </label>
                  <input
                    type="text"
                    value={cabecalhoConfig.cargoInstrutorPersonalizado ?? ''}
                    onChange={(e) => setCabecalhoConfig(prev => ({ ...prev, cargoInstrutorPersonalizado: e.target.value }))}
                    placeholder="Ex: Técnico de Segurança do Trabalho - Reg. MTE 12345 / Instrutor SST"
                    className="w-full bg-slate-900 border border-white/20 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-amber-400 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-0.5 text-[11px]">
                    Texto Legal / Finalidade Regulatória (Rodapé do Cabeçalho):
                  </label>
                  <textarea
                    rows={2}
                    value={cabecalhoConfig.textoEvidenciaLegal ?? ''}
                    onChange={(e) => setCabecalhoConfig(prev => ({ ...prev, textoEvidenciaLegal: e.target.value }))}
                    placeholder="Evidência documental individual de verificação..."
                    className="w-full bg-slate-900 border border-white/20 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-amber-400 text-[11px]"
                  />
                </div>
              </div>
            </div>

            {/* Ações de Salvar e Restaurar */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRestaurarPadrao}
                className="text-slate-400 hover:text-white font-bold flex items-center space-x-1 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Padrão Oficial</span>
              </button>

              <div className="flex items-center space-x-2">
                {configSalvaSucesso && (
                  <span className="text-emerald-400 font-bold flex items-center space-x-1 text-xs animate-fadeIn">
                    <Check className="w-4 h-4" />
                    <span>Configuração Salva como Padrão!</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSalvarComoPadrao}
                  className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black px-4 py-2 rounded-xl text-xs flex items-center space-x-1.5 shadow-md transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar como Padrão da Empresa</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          CONTÊINER GLOBAL DE PÁGINAS A4 INDIVIDUAIS
          Cada página é um contêiner A4 isolado (210mm x 297mm)
      ========================================================================= */}
      <div id="impressao-laudo-completo-root" className="w-full flex flex-col items-center space-y-6 pb-12">
        {paginasCalculadas.map((pag, pIdx) => {
          const numPagina = pIdx + 1;
          const letras = ['A', 'B', 'C', 'D', 'E'];

          return (
            <div
              key={pIdx}
              className="prova-pdf-page-container w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 p-8 sm:p-10 rounded-2xl shadow-2xl border border-slate-200 flex flex-col justify-between"
              style={{
                boxSizing: 'border-box'
              }}
            >
              {/* TOPO DA PÁGINA */}
              <div className="space-y-4">
                
                {/* ---------------------------------------------------------------
                    PÁGINA 1: CABEÇALHO COMPLETO, PARTICIPANTE E NOTA FINAL
                ---------------------------------------------------------------- */}
                {pag.isPagina1 ? (
                  <div className="space-y-4">
                    
                    {/* CABEÇALHO INSTITUCIONAL OFICIAL */}
                    <div className={`border-b-2 ${themeColors.dividerColor} pb-3 space-y-2`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-3">
                          {cabecalhoConfig.logoUrl ? (
                            <img
                              src={cabecalhoConfig.logoUrl}
                              alt="Logo"
                              referrerPolicy="no-referrer"
                              className={`object-contain ${
                                cabecalhoConfig.logoTamanho === 'pequeno' ? 'h-10 max-w-[120px]' :
                                cabecalhoConfig.logoTamanho === 'grande' ? 'h-16 max-w-[180px]' :
                                'h-12 max-w-[150px]'
                              }`}
                            />
                          ) : (
                            <div className={`w-11 h-11 rounded-xl ${themeColors.monogramBg} text-white font-black flex items-center justify-center text-lg shrink-0 shadow-sm`}>
                              SST
                            </div>
                          )}

                          <div>
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider block line-clamp-1">
                              {cabecalhoConfig.empresaNome}
                            </span>
                            <h1 className={`text-lg sm:text-xl font-black ${themeColors.titleColor} leading-tight`}>
                              {cabecalhoConfig.tituloDocumento}
                            </h1>
                            {cabecalhoConfig.subtituloOuRegistro && (
                              <span className="text-[11px] font-bold text-slate-600 block line-clamp-1">
                                {cabecalhoConfig.subtituloOuRegistro}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Código do Documento no Canto Superior Direito */}
                        <div className="text-right shrink-0">
                          <span className="font-mono text-slate-500 text-[9px] font-bold block">CÓDIGO DO DOCUMENTO:</span>
                          <span className="font-mono font-black text-slate-900 text-xs bg-slate-100 px-2.5 py-0.5 rounded border border-slate-300 block">
                            {codigoDocumento}
                          </span>
                        </div>
                      </div>

                      {cabecalhoConfig.textoEvidenciaLegal && (
                        <p className="text-[10px] text-slate-500 italic leading-snug pt-1 border-t border-slate-100">
                          {cabecalhoConfig.textoEvidenciaLegal}
                        </p>
                      )}
                    </div>

                    {/* DADOS CADASTRAIS DO PARTICIPANTE E INSTRUTOR */}
                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-300 text-xs font-sans">
                      {/* Bloco Participante */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block border-b border-slate-200 pb-0.5">
                          📌 DADOS DO PARTICIPANTE
                        </span>
                        <div className="space-y-0.5 text-xs">
                          <div><strong>Nome:</strong> <span className="text-slate-900 font-bold">{resultado.participante_nome}</span></div>
                          <div><strong>Matrícula/ID:</strong> <span className="font-mono text-slate-800">{resultado.matricula || resultado.cpf_ou_empresa || '—'}</span></div>
                          {resultado.cargo && <div><strong>Cargo:</strong> <span>{resultado.cargo}</span></div>}
                        </div>
                      </div>

                      {/* Bloco Treinamento e Instrutor */}
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block border-b border-slate-200 pb-0.5">
                          🎓 DADOS DO TREINAMENTO E INSTRUTOR
                        </span>
                        <div className="space-y-0.5 text-xs">
                          <div><strong>Treinamento:</strong> <span className="text-slate-900 font-bold">{resultado.treinamento_titulo || resultado.sala_nome}</span></div>
                          <div><strong>Instrutor:</strong> <span className="text-slate-900 font-bold">{resultado.instrutor_nome}</span></div>
                          <div className="text-[11px]"><strong>Data da Avaliação:</strong> <span className="font-mono">{dataProvaFormatada}</span> às <span className="font-mono">{horaProvaFormatada}</span></div>
                          <div className="text-[10px] text-slate-500"><strong>Identificação Sessão:</strong> <span className="font-mono">{codigoSessao}</span></div>
                        </div>
                      </div>
                    </div>

                    {/* PAINEL DE RESULTADO FINAL E APROVEITAMENTO */}
                    <div className={`border-2 ${themeColors.badgeBorder} rounded-xl p-3.5 bg-slate-50 flex items-center justify-between flex-wrap gap-3`}>
                      <div className="space-y-1">
                        <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider block">RESULTADO E APROVEITAMENTO</span>
                        <div className="flex items-center space-x-2.5">
                          <span className={`text-xl font-black px-3.5 py-0.5 rounded-lg border text-white ${
                            aprovado ? 'bg-emerald-700 border-emerald-800' : 'bg-rose-700 border-rose-800'
                          }`}>
                            {resultado.situacao}
                          </span>
                          <span className="text-[11px] text-slate-600 font-semibold">
                            Mínima: <strong>{(resultado.nota_minima || 7.0).toFixed(1)} / 10.0</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 text-center text-xs">
                        <div>
                          <span className="text-[9px] text-slate-500 font-bold block">QUESTÕES</span>
                          <span className="text-base font-black font-mono">{resultado.total_perguntas || resultado.total_questoes}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-emerald-700 font-bold block">ACERTOS</span>
                          <span className="text-base font-black font-mono text-emerald-700">{resultado.acertos ?? resultado.questoes_corretas}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-rose-700 font-bold block">ERROS</span>
                          <span className="text-base font-black font-mono text-rose-700">{resultado.erros}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 font-bold block">APROVEITAMENTO</span>
                          <span className="text-base font-black font-mono">{resultado.porcentagem_acertos ?? (resultado.total_perguntas > 0 ? Math.round((resultado.acertos / resultado.total_perguntas) * 100) : 0)}%</span>
                        </div>
                        <div className="border-l border-slate-300 pl-3">
                          <span className="text-[9px] text-slate-500 font-bold block">NOTA FINAL</span>
                          <span className="text-xl font-black font-mono text-slate-900">{resultado.nota_final.toFixed(1)} / 10.0</span>
                        </div>
                      </div>
                    </div>

                    {/* TÍTULO DA SEÇÃO DE QUESTÕES */}
                    <div className={`border-b-2 ${themeColors.dividerColor} pb-1 flex items-center justify-between text-xs font-black uppercase tracking-wider`}>
                      <span className={themeColors.titleColor}>QUESTÕES DA AVALIAÇÃO TEÓRICA</span>
                      <span className="text-[10px] text-slate-400 font-normal lowercase">respostas registradas pelo participante</span>
                    </div>

                  </div>
                ) : (
                  /* ---------------------------------------------------------------
                      PÁGINAS 2..N: MINI CABEÇALHO CONTÍNUO
                  ---------------------------------------------------------------- */
                  <div className={`border-b-2 ${themeColors.dividerColor} pb-2 flex items-center justify-between text-xs`}>
                    <div className="flex items-center space-x-2">
                      {cabecalhoConfig.logoUrl ? (
                        <img
                          src={cabecalhoConfig.logoUrl}
                          alt="Logo"
                          referrerPolicy="no-referrer"
                          className="h-6 max-w-[80px] object-contain"
                        />
                      ) : (
                        <div className={`w-6 h-6 rounded-lg ${themeColors.monogramBg} text-white font-black flex items-center justify-center text-[10px]`}>
                          SST
                        </div>
                      )}
                      <div>
                        <span className="font-extrabold text-slate-900 block text-xs leading-tight">
                          {cabecalhoConfig.tituloDocumento}
                        </span>
                        <span className="text-[10px] text-slate-500 block">
                          {resultado.participante_nome} • {resultado.treinamento_titulo || resultado.sala_nome}
                        </span>
                      </div>
                    </div>

                    <div className="text-right font-mono text-[10px] text-slate-500">
                      <span>DOC: <strong>{codigoDocumento}</strong></span>
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------------------------
                    QUESTÕES DESTA PÁGINA (GARANTIA DE NUNCA SEREM CORTADAS)
                ---------------------------------------------------------------- */}
                {pag.questoes.length > 0 && (
                  <div className="space-y-4 pt-1">
                    {pag.questoes.map(({ questao: q, originalIndex: qIdx }) => {
                      const eCorreta = q.correta;
                      const rawAlts = q.alternativas || [
                        q.resposta_fornecida,
                        q.resposta_correta,
                        'Outra opção de resposta',
                        'Opção complementar SST'
                      ];
                      const alts = normalizeAlternativas(rawAlts);

                      const respString = (q.resposta_fornecida || '').trim();
                      const respStringLower = respString.toLowerCase();
                      const semResposta = !respString || respStringLower === 'sem resposta' || respStringLower === 'não respondida' || respString === '—' || q.resposta_fornecida_index === -1;

                      return (
                        <div key={qIdx} className="border border-slate-300 rounded-xl p-3.5 bg-white space-y-2.5 page-break-inside-avoid shadow-xs">
                          
                          {/* Cabeçalho da Questão */}
                          <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-1.5">
                            <div className="flex items-center space-x-2">
                              <span className="bg-slate-900 text-white text-[11px] font-black px-2 py-0.5 rounded font-mono">
                                Questão {String(qIdx + 1).padStart(2, '0')}
                              </span>
                              {q.norma_relacionada && (
                                <span className="text-[10px] font-bold text-purple-800 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">
                                  {q.norma_relacionada}
                                </span>
                              )}
                            </div>

                            <span className={`text-[10px] font-black px-2 py-0.5 rounded border flex items-center space-x-1 ${
                              eCorreta 
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}>
                              {eCorreta ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                                  <span>CORRETA</span>
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-3 h-3 text-rose-700" />
                                  <span>INCORRETA</span>
                                </>
                              )}
                            </span>
                          </div>

                          {/* Enunciado */}
                          <p className="text-xs sm:text-sm font-extrabold text-slate-900 leading-snug">
                            {q.enunciado}
                          </p>

                          {/* Alternativas */}
                          <div className="space-y-1.5 pt-0.5">
                            {(() => {
                              let algunMarcada = false;
                              const marcadasMap = alts.map((altTexto, aIdx) => {
                                const altTextoLower = altTexto.trim().toLowerCase();
                                const letraOption = letras[aIdx % letras.length].toLowerCase();

                                let eMarcada = false;
                                if (q.resposta_fornecida_index !== undefined && q.resposta_fornecida_index >= 0) {
                                  eMarcada = (aIdx === q.resposta_fornecida_index);
                                } else if (!semResposta) {
                                  eMarcada = (
                                    altTextoLower === respStringLower ||
                                    respStringLower === letraOption ||
                                    respStringLower === `opção ${letraOption}` ||
                                    respStringLower === `opcao ${letraOption}` ||
                                    respStringLower === `${letraOption})` ||
                                    respString === String(aIdx)
                                  );
                                }

                                let eGabarito = false;
                                if (q.resposta_correta_index !== undefined && q.resposta_correta_index >= 0) {
                                  eGabarito = (aIdx === q.resposta_correta_index);
                                } else {
                                  eGabarito = (altTextoLower === (q.resposta_correta || '').trim().toLowerCase());
                                }

                                if (eMarcada) algunMarcada = true;
                                return { altTexto, aIdx, eMarcada, eGabarito };
                              });

                              return (
                                <>
                                  {!eCorreta && (semResposta || !algunMarcada) && (
                                    <div className="bg-rose-50 border-l-4 border-rose-600 p-2 rounded-r-lg text-xs font-bold text-rose-900 flex items-center justify-between mb-1.5">
                                      <div className="flex items-center space-x-1.5">
                                        <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                        <span className="text-[11px]">
                                          {semResposta
                                            ? 'Participante NÃO assinalou nenhuma alternativa (Sem Resposta / Esgotado).'
                                            : `Resposta Registrada: "${q.resposta_fornecida}"`}
                                        </span>
                                      </div>
                                      <span className="text-[9px] uppercase font-black bg-rose-200 text-rose-900 px-1.5 py-0.5 rounded shrink-0">
                                        Sem Acerto
                                      </span>
                                    </div>
                                  )}

                                  {marcadasMap.map(({ altTexto, aIdx, eMarcada, eGabarito }) => (
                                    <div 
                                      key={aIdx} 
                                      className={`p-2 rounded-lg border text-xs flex items-center justify-between transition-all ${
                                        eMarcada && eCorreta
                                          ? 'bg-emerald-50 border-emerald-500 font-bold text-emerald-950'
                                          : eMarcada && !eCorreta
                                          ? 'bg-rose-100 border-rose-500 font-black text-rose-950'
                                          : eGabarito && !eCorreta
                                          ? 'bg-amber-50 border-amber-400 font-bold text-slate-900'
                                          : 'bg-slate-50/60 border-slate-200 text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center space-x-2">
                                        <span className="font-mono font-bold text-slate-600 w-4 text-[11px]">
                                          {letras[aIdx % letras.length]})
                                        </span>
                                        
                                        <span className="flex items-center space-x-1.5 text-xs">
                                          {eMarcada ? (
                                            <CheckSquare className={`w-3.5 h-3.5 shrink-0 ${eCorreta ? 'text-emerald-700' : 'text-rose-700'}`} />
                                          ) : (
                                            <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                          )}
                                          <span className={eMarcada && !eCorreta ? 'underline decoration-rose-600 decoration-2' : ''}>
                                            {altTexto}
                                          </span>
                                        </span>
                                      </div>

                                      <div className="flex items-center space-x-1 shrink-0 text-[10px]">
                                        {eMarcada && eCorreta && (
                                          <span className="font-black bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded uppercase flex items-center space-x-1">
                                            <span>✓</span>
                                            <span>Resposta Correta Escolhida</span>
                                          </span>
                                        )}

                                        {eMarcada && !eCorreta && (
                                          <span className="font-black bg-rose-600 text-white px-2 py-0.5 rounded uppercase flex items-center space-x-1 shadow-xs">
                                            <span>✕</span>
                                            <span>SUA RESPOSTA (INCORRETA)</span>
                                          </span>
                                        )}

                                        {!eMarcada && eGabarito && !eCorreta && (
                                          <span className="font-black bg-amber-200 text-amber-950 border border-amber-300 px-2 py-0.5 rounded uppercase">
                                            GABARITO CORRETO
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </>
                              );
                            })()}
                          </div>

                          {/* Explicação Técnica / Norma Regulamentadora se Ativado */}
                          {mostrarExplicacoes && q.explicacao && (
                            <div className="bg-purple-50 border border-purple-200 rounded-lg p-2 text-[10px] text-purple-950 space-y-0.5">
                              <strong className="font-extrabold text-purple-900 block">Fundamentação Técnica / Norma SST:</strong>
                              <p className="leading-relaxed">{q.explicacao}</p>
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ---------------------------------------------------------------
                    BLOCO FINAL: DECLARAÇÃO DE REALIZAÇÃO + ASSINATURAS
                ---------------------------------------------------------------- */}
                {pag.incluiBlocoFinal && (
                  <div className="space-y-4 pt-4 page-break-inside-avoid">
                    {/* Declaração Formal */}
                    <div className="bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs space-y-1">
                      <strong className="font-black text-slate-900 uppercase tracking-wider block text-[11px]">
                        DECLARAÇÃO DE REALIZAÇÃO DA AVALIAÇÃO
                      </strong>
                      <p className="text-slate-700 leading-relaxed italic text-[10px]">
                        "Declaro que participei pessoalmente da avaliação teórica referente ao treinamento identificado neste documento e que as respostas registradas nesta prova representam fielmente o resultado da avaliação realizada."
                      </p>
                    </div>

                    {/* Espaços de Assinatura */}
                    <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs text-slate-700">
                      <div className="space-y-1">
                        <div className="border-t-2 border-slate-800 pt-1.5 font-bold text-slate-900 text-xs">
                          {resultado.participante_nome}
                        </div>
                        <div className="text-[10px] text-slate-600">Assinatura do Participante / Colaborador</div>
                        <div className="text-[9px] text-slate-500 font-mono">Data: ____ / ____ / ________</div>
                      </div>

                      <div className="space-y-1">
                        <div className="border-t-2 border-slate-800 pt-1.5 font-bold text-slate-900 text-xs">
                          {resultado.instrutor_nome}
                        </div>
                        <div className="text-[10px] text-slate-600">
                          {cabecalhoConfig.cargoInstrutorPersonalizado || resultado.instrutor_cargo || 'Instrutor Responsável SST / Técnico de Segurança'}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono">Data: ____ / ____ / ________</div>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* RODAPÉ OFICIAL DA PÁGINA (SEMPRE FIXO NO FUNDO DE CADA A4) */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[9px] text-slate-400 font-mono mt-4">
                <div>{cabecalhoConfig.empresaNome || 'Plataforma SST Quiz Corporate'} • Sistema de Registro de Evidências</div>
                <div className="font-bold text-slate-500">
                  Página {numPagina} de {totalPaginas}
                </div>
                <div>Documento Validado • ID: {codigoDocumento}</div>
              </div>

            </div>
          );
        })}
      </div>

      {/* DIÁLOGO MODAL PARA ENVIO DE E-MAIL */}
      {showEmailDialog && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 print-hidden">
          <div className="bg-slate-900 border border-white/20 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl text-white">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2 text-blue-400">
                <Mail className="w-5 h-5" />
                <h3 className="font-extrabold text-sm text-white">Enviar Prova em PDF por E-mail</h3>
              </div>
              <button 
                onClick={() => setShowEmailDialog(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEnviarEmailSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  E-mail do Destinatário:
                </label>
                <input
                  type="email"
                  value={emailDestinatario ?? ''}
                  onChange={(e) => setEmailDestinatario(e.target.value)}
                  placeholder="exemplo@empresa.com.br"
                  className="w-full bg-slate-950 border border-white/20 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-blue-400 text-xs font-mono"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  O PDF oficial estruturado em A4 será anexado ao e-mail ({codigoDocumento}).
                </span>
              </div>

              {emailStatus.mensagem && (
                <div className={`p-3 rounded-xl text-xs font-bold flex flex-col space-y-2 ${
                  emailStatus.tipo === 'sucesso' 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' 
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}>
                  <div className="flex items-start space-x-2">
                    {emailStatus.tipo === 'sucesso' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    )}
                    <span>{emailStatus.mensagem}</span>
                  </div>

                  {emailStatus.fileUrl && (
                    <a
                      href={emailStatus.fileUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="self-start inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition-all shadow-md mt-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar PDF Gerado no Servidor</span>
                    </a>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowEmailDialog(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={enviandoEmail}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black flex items-center space-x-1.5 shadow-lg disabled:opacity-50"
                >
                  {enviandoEmail ? (
                    <span>Gerando e Enviando...</span>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>Enviar Laudo PDF</span>
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  );
};
