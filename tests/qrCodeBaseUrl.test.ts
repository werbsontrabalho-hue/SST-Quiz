import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('QR Code & Base URL Resolution Tests', () => {
  const originalWindow = (globalThis as any).window;

  afterEach(() => {
    (globalThis as any).window = originalWindow;
  });

  test('Constrói a URL canônica do QR Code com o PIN formatado', () => {
    const origin = 'https://meu-quiz-sst.empresa.com.br';
    const pin = ' 849201 ';
    const cleanPin = pin.trim().toUpperCase();
    const cleanBase = origin.replace(/\/+$/, '');
    const pathname = '/';
    const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
    const qrText = `${cleanBase}${cleanPath}?pin=${encodeURIComponent(cleanPin)}`;

    assert.equal(qrText, 'https://meu-quiz-sst.empresa.com.br/?pin=849201');
  });

  test('Extrai corretamente o PIN de uma URL lida pela câmera ou scanner', () => {
    const extrairPinDeQrContent = (content: string): string | null => {
      if (!content) return null;
      const trimmed = content.trim();
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
      const cleanPin = trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (cleanPin.length >= 4 && cleanPin.length <= 8) {
        return cleanPin;
      }
      return null;
    };

    assert.equal(
      extrairPinDeQrContent('https://app.sstquiz.com/?pin=AB9123'),
      'AB9123'
    );
    assert.equal(
      extrairPinDeQrContent('http://192.168.1.15:3000/?pin=998877'),
      '998877'
    );
    assert.equal(
      extrairPinDeQrContent('998877'),
      '998877'
    );
    assert.equal(
      extrairPinDeQrContent(''),
      null
    );
  });
});
