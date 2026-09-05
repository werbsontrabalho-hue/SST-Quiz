import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { Camera, Upload, X, QrCode, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';

interface QRCodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (pin: string) => void;
}

export const QRCodeScannerModal: React.FC<QRCodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload'>('camera');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanResultMsg, setScanResultMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameId = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Parar a câmera quando o modal for fechado ou mudar de aba
  const stopCamera = () => {
    if (animFrameId.current) {
      cancelAnimationFrame(animFrameId.current);
      animFrameId.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsScanning(false);
  };

  // Iniciar a câmera
  const startCamera = async () => {
    stopCamera();
    setCameraError(null);
    setScanResultMsg(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'A câmera não é suportada ou permitida neste navegador/dispositivo. Você pode digitar o PIN ou fazer o upload da imagem do QR Code.'
      );
      return;
    }

    try {
      let stream: MediaStream;
      try {
        // Tenta primeiro a câmera traseira (ideal para dispositivos móveis)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch (e1) {
        // Fallback para qualquer vídeo/webcam disponível (ex: laptops e PCs sem câmera traseira)
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setIsScanning(true);
        requestAnimationFrame(tickScan);
      }
    } catch (err: any) {
      console.error('Erro ao acessar a câmera:', err);
      setCameraError(
        'Nenhuma câmera foi encontrada neste dispositivo ou o acesso foi bloqueado. Por favor, faça o upload de uma foto do QR Code ou digite o PIN fornecido.'
      );
    }
  };

  // Loop de leitura de frames do vídeo
  const tickScan = () => {
    if (!videoRef.current || videoRef.current.readyState !== videoRef.current.HAVE_ENOUGH_DATA) {
      animFrameId.current = requestAnimationFrame(tickScan);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        const pin = extrairPinDeQrContent(code.data);
        if (pin) {
          setScanResultMsg(`QR Code lido com sucesso! PIN: ${pin}`);
          stopCamera();
          setTimeout(() => {
            onScanSuccess(pin);
            onClose();
          }, 600);
          return;
        }
      }
    }

    animFrameId.current = requestAnimationFrame(tickScan);
  };

  // Extrai o PIN de URLs como "https://...?pin=849201" ou string do código "849201"
  const extrairPinDeQrContent = (content: string): string | null => {
    if (!content) return null;
    const trimmed = content.trim();

    // Se for URL completa com ?pin=
    if (trimmed.includes('pin=')) {
      try {
        const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        const pinParam = urlObj.searchParams.get('pin');
        if (pinParam && pinParam.trim().length >= 4) {
          return pinParam.trim().toUpperCase();
        }
      } catch (e) {
        const match = trimmed.match(/[?&]pin=([A-Za-z0-9]+)/i);
        if (match && match[1]) return match[1].toUpperCase();
      }
    }

    // Se for um PIN direto (4 a 8 caracteres alfanuméricos)
    const cleanPin = trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (cleanPin.length >= 4 && cleanPin.length <= 8) {
      return cleanPin;
    }

    return null;
  };

  // Leitura de imagem por upload de arquivo
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanResultMsg(null);
    setCameraError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;

        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (code && code.data) {
            const pin = extrairPinDeQrContent(code.data);
            if (pin) {
              setScanResultMsg(`QR Code identificado na imagem! PIN: ${pin}`);
              setTimeout(() => {
                onScanSuccess(pin);
                onClose();
              }, 600);
            } else {
              setCameraError('Conteúdo do QR Code não contém um PIN válido de sala.');
            }
          } else {
            setCameraError('Não foi possível ler um QR Code válido na imagem selecionada.');
          }
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (isOpen && activeTab === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-emerald-500/30 rounded-3xl p-6 max-w-md w-full shadow-2xl text-white space-y-5">
        
        {/* Cabeçalho do Modal */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">Leitor de QR Code do Quiz</h3>
              <p className="text-xs text-slate-400">Aproxime a câmera da tela do instrutor</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Abas: Câmera ou Upload */}
        <div className="flex bg-slate-950 p-1 rounded-2xl border border-white/10">
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'camera'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Usar Câmera</span>
          </button>
          <button
            onClick={() => {
              stopCamera();
              setActiveTab('upload');
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'upload'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload de Imagem</span>
          </button>
        </div>

        {/* Mensagem de sucesso */}
        {scanResultMsg && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-2xl text-emerald-300 text-xs font-bold flex items-center space-x-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{scanResultMsg}</span>
          </div>
        )}

        {/* Mensagem de erro */}
        {cameraError && (
          <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-rose-300 text-xs font-bold flex items-start space-x-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{cameraError}</span>
          </div>
        )}

        {/* Visor de Câmera */}
        {activeTab === 'camera' && (
          <div className="relative bg-black rounded-2xl overflow-hidden aspect-square border-2 border-emerald-500/40 flex items-center justify-center">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
            />
            {/* Overlay com Mira Quadrada */}
            <div className="absolute inset-0 border-[40px] border-black/60 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-emerald-400 rounded-2xl relative shadow-[0_0_20px_rgba(16,185,129,0.5)]">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-400 -mt-1 -ml-1 rounded-tl-sm" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-emerald-400 -mt-1 -mr-1 rounded-tr-sm" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-emerald-400 -mb-1 -ml-1 rounded-bl-sm" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-400 -mb-1 -mr-1 rounded-br-sm" />
              </div>
            </div>

            {isScanning && (
              <div className="absolute bottom-3 bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-emerald-400 border border-emerald-500/30 flex items-center space-x-1.5">
                <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                <span>Buscando QR Code...</span>
              </div>
            )}
          </div>
        )}

        {/* Form de Upload */}
        {activeTab === 'upload' && (
          <div className="bg-slate-950 p-6 rounded-2xl border-2 border-dashed border-white/20 text-center space-y-3">
            <Upload className="w-10 h-10 text-emerald-400 mx-auto" />
            <div>
              <div className="text-xs font-bold text-white">Selecione a imagem do QR Code</div>
              <p className="text-[11px] text-slate-400 mt-0.5">Formatos suportados: PNG, JPG, WEBP</p>
            </div>
            <label className="inline-block bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs cursor-pointer shadow-lg transition-all">
              <span>Escolher Arquivo</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        )}

      </div>
    </div>
  );
};
