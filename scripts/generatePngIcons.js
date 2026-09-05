// ============================================================================
// generatePngIcons.js — Gerador de Ícones PNG para PWA (Google Chrome Android)
// ----------------------------------------------------------------------------
// O Google Chrome no Android exige arquivos PNG (192x192 e 512x512) para que o
// aviso nativo "Instalar aplicativo" (beforeinstallprompt) funcione no celular.
// ============================================================================
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

function createIcon(size, filename) {
  const png = new PNG({ width: size, height: size });

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;

      // Fundo circular azul escuro / slate (#0f172a)
      const cx = size / 2;
      const cy = size / 2;
      const radius = size * 0.45;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      if (dist <= radius) {
        // Dentro do círculo do ícone
        const isShield = Math.abs(x - cx) < size * 0.25 && y > size * 0.25 && y < size * 0.75;
        if (isShield && dist <= radius * 0.7) {
          // Escudo verde esmeralda (#10b981)
          png.data[idx] = 0x10;
          png.data[idx + 1] = 0xb9;
          png.data[idx + 2] = 0x81;
          png.data[idx + 3] = 0xff;
        } else {
          // Fundo do círculo (#0f172a)
          png.data[idx] = 0x0f;
          png.data[idx + 1] = 0x17;
          png.data[idx + 2] = 0x2a;
          png.data[idx + 3] = 0xff;
        }
      } else {
        // Transparente fora do círculo
        png.data[idx] = 0x00;
        png.data[idx + 1] = 0x00;
        png.data[idx + 2] = 0x00;
        png.data[idx + 3] = 0x00;
      }
    }
  }

  const publicDir = path.resolve(process.cwd(), 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const filePath = path.join(publicDir, filename);
  png.pack().pipe(fs.createWriteStream(filePath)).on('finish', () => {
    console.log(`[PWA Icon] Gerado com sucesso: ${filePath} (${size}x${size})`);
  });
}

createIcon(192, 'pwa-192.png');
createIcon(512, 'pwa-512.png');
