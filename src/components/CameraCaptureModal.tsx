// =====================================================================
// CameraCaptureModal — Modal de captura de foto usando a webcam
// =====================================================================
// - Abre a câmera via getUserMedia (MediaDevices API) para capturar a
//   imagem do rosto/produto e devolvê-la em base64 (Data URL) via onCapture.
// - Fallback: se a câmera falhar, permite escolher uma foto do dispositivo.
// - Props:
//   - isOpen   : controla se o modal está visível.
//   - onClose  : função chamada ao fechar o modal.
//   - onCapture: recebe o Data URL da imagem capturada/selecionada.
// =====================================================================
import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, RefreshCw, Check, AlertCircle } from 'lucide-react';

// Tipagem das props recebidas pelo componente
interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (imageDataUrl: string) => void;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
}) => {
  // Referência ao elemento <video> que exibe o fluxo da câmera
  const videoRef = useRef<HTMLVideoElement>(null);
  // Fluxo (stream) da câmera ativa, usado para liberar a câmera ao parar
  const [stream, setStream] = useState<MediaStream | null>(null);
  // Mensagem de erro de câmera (caso o acesso falhe)
  const [cameraError, setCameraError] = useState<string>('');
  // Modo da câmera: 'user' (frontal/selfie) ou 'environment' (traseira)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  // Indica se a câmera está sendo iniciada (exibe spinner de carregamento)
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // Referência ao input de arquivo escondido usado como fallback (galeria)
  const fileInputFallbackRef = useRef<HTMLInputElement>(null);

  // Efeito que sincroniza o ciclo de vida da câmera com o estado do modal
  useEffect(() => {
    // Quando o modal fecha, encerra a câmera
    if (!isOpen) {
      stopCamera();
      return;
    }

    // Quando abre, inicia a câmera no modo atual (frontal/traseira)
    startCamera(facingMode);

    // Cleanup: garante que a câmera é liberada ao desmontar
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  // Encerra a câmera, parando todas as tracks do stream ativo
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  // Inicia a câmera solicitando permissão via getUserMedia
  const startCamera = async (mode: 'user' | 'environment') => {
    // Sempre para uma câmera já ativa antes de abrir nova
    stopCamera();
    setCameraError('');
    setIsLoading(true);

    try {
      // Verifica se o navegador suporta a MediaDevices API
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Navegador não suporta acesso à câmera diretamente. Use a galeria de arquivos.');
      }

      // Solicita o fluxo de vídeo da webcam (sem áudio, quadrado ~720px)
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 720 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      // Guarda o stream e exibe o vídeo no elemento <video>
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err: any) {
      // Trata erros comuns e mostra mensagem amigável ao usuário
      console.warn('Erro ao acessar a câmera:', err);
      let msg = 'Não foi possível acessar a câmera do dispositivo.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Permissão de acesso à câmera negada. Verifique as configurações do navegador ou use o envio da galeria.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Nenhuma câmera encontrada no dispositivo. Você pode escolher uma foto da galeria.';
      }
      setCameraError(msg);
    } finally {
      // Sempre desativa o indicador de carregamento ao finalizar
      setIsLoading(false);
    }
  };

  // Captura o quadro atual do vídeo, recorta um quadrado central
  // e envia a imagem em JPEG (base64) via onCapture
  const handleTakeSnapshot = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    // Cria um canvas off-screen para desenhar o quadro
    const canvas = document.createElement('canvas');
    // Tamanho do quadrado a recortar (menor lado do vídeo)
    const size = Math.min(video.videoWidth || 400, video.videoHeight || 400);

    // Imagem de saída sempre 400x400 (quadrado do avatar)
    canvas.width = 400;
    canvas.height = 400;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Recorta o quadrado central do vídeo (origem calculada no centro)
    const startX = ((video.videoWidth || size) - size) / 2;
    const startY = ((video.videoHeight || size) - size) / 2;

    // Desenha o recorte central redimensionado para 400x400 no canvas
    ctx.drawImage(video, startX, startY, size, size, 0, 0, 400, 400);

    // Converte o canvas em Data URL JPEG (qualidade 88%) e entrega ao pai
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    onCapture(dataUrl);
    stopCamera();
    onClose();
  };

  // Fallback: lê um arquivo de imagem escolhido pelo usuário (galeria)
  const handleFallbackFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Limite de 5MB para o arquivo selecionado
      if (file.size > 5 * 1024 * 1024) {
        alert('A foto deve ter no máximo 5MB.');
        return;
      }
      // Lê o arquivo como Data URL para entregar ao pai
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          onCapture(reader.result);
          stopCamera();
          onClose();
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Se o modal não estiver aberto, não renderiza nada
  if (!isOpen) return null;

  return (
    // =====================================================================
    // Layout do modal: overlay escuro com blur + painel central
    // =====================================================================
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-white/15 rounded-3xl p-5 text-white space-y-4 shadow-2xl">
        {/* Cabeçalho do modal com título e botão de fechar (X) */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-purple-500/20 text-purple-400 rounded-xl">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-100">Capturar Foto da Câmera</h3>
              <p className="text-[11px] text-slate-400">Enquadre seu rosto ou produto na câmera</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Área principal: fluxo de vídeo ao vivo OU tela de erro/fallback */}
        <div className="relative aspect-square w-full bg-slate-950 rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center">
          {/* Spinner exibido enquanto a câmera está sendo iniciada */}
          {isLoading && (
            <div className="flex flex-col items-center space-y-2 text-slate-400 text-xs">
              <RefreshCw className="w-6 h-6 animate-spin text-purple-400" />
              <span>Iniciando câmera...</span>
            </div>
          )}

          {/* Em caso de erro de câmera: exibe mensagem e fallback de galeria */}
          {cameraError ? (
            <div className="p-6 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
              <p className="text-xs text-slate-300 leading-relaxed">{cameraError}</p>

              {/* Input de arquivo escondido, aberto pelo botão abaixo */}
              <input
                ref={fileInputFallbackRef}
                type="file"
                accept="image/*"
                onChange={handleFallbackFileSelect}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputFallbackRef.current?.click()}
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-lg"
              >
                Escolher Foto do Dispositivo
              </button>
            </div>
          ) : (
            <>
              {/* Elemento <video> que reproduz o fluxo ao vivo da webcam */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Sobreposição de guia: círculo tracejado para enquadrar o rosto */}
              <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-emerald-400/50 rounded-full m-8 flex items-center justify-center">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping" />
              </div>
            </>
          )}
        </div>

        {/* Controles de ação: inverter câmera e tirar foto */}
        {!cameraError && (
          <div className="flex items-center justify-between pt-1 gap-2">
            {/* Alterna entre câmera frontal (user) e traseira (environment) */}
            <button
              type="button"
              onClick={() => setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-3 py-2 rounded-xl border border-white/10 flex items-center space-x-1.5 text-xs transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Inverter</span>
            </button>

            {/* Captura a foto; desabilitado enquanto não há stream ou está carregando */}
            <button
              type="button"
              onClick={handleTakeSnapshot}
              disabled={!stream || isLoading}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold py-2.5 px-4 rounded-xl flex items-center justify-center space-x-2 shadow-lg transition-all text-xs disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>Tirar Foto</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
