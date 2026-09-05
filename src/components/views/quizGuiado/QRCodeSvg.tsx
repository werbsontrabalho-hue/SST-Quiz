import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { getPublicBaseUrl } from '../../../lib/publicBaseUrl';

interface QRCodeSvgProps {
  value: string;
  size?: number;
  className?: string;
  showPinLabel?: boolean;
}

export const QRCodeSvg: React.FC<QRCodeSvgProps> = ({ 
  value, 
  size = 180, 
  className = '',
  showPinLabel = true 
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState<string>(typeof window !== 'undefined' ? window.location.origin : '');

  useEffect(() => {
    let isMounted = true;
    getPublicBaseUrl().then(url => {
      if (isMounted && url) setBaseUrl(url);
    });
    return () => { isMounted = false; };
  }, []);

  // Constrói a URL completa e canônica de entrada na sala
  const cleanBase = (baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
  const pathname = (typeof window !== 'undefined' && window.location.pathname) ? window.location.pathname : '/';
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const cleanPin = encodeURIComponent(value.trim().toUpperCase());
  
  const qrText = value.startsWith('http')
    ? value
    : `${cleanBase}${cleanPath}?pin=${cleanPin}`;

  useEffect(() => {
    let isMounted = true;
    if (!qrText) return;

    QRCode.toDataURL(qrText, {
      width: size * 2,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    })
      .then((url) => {
        if (isMounted) setDataUrl(url);
      })
      .catch((err) => {
        console.error('Erro ao gerar QR Code:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [qrText, size]);

  return (
    <div className={`relative inline-flex flex-col items-center bg-white p-3 rounded-2xl shadow-xl border-2 border-emerald-500/30 ${className}`}>
      {dataUrl ? (
        <img 
          src={dataUrl} 
          alt={`QR Code PIN ${value}`} 
          style={{ width: size, height: size }} 
          className="rounded-lg border border-slate-200"
        />
      ) : (
        <div 
          style={{ width: size, height: size }} 
          className="flex items-center justify-center bg-slate-100 rounded-lg text-xs font-bold text-slate-400 animate-pulse"
        >
          Gerando QR Code...
        </div>
      )}
      {showPinLabel && (
        <div className="text-center mt-2 text-xs font-mono font-black text-slate-800 tracking-widest bg-slate-100 px-3 py-1 rounded-full border border-slate-200">
          PIN: {value}
        </div>
      )}
    </div>
  );
};

