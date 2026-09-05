/**
 * Redimensiona e comprime imagens enviadas (da galeria ou câmera) para evitar
 * estourar o limite de armazenamento do localStorage e otimizar o tráfego de rede.
 *
 * - Parâmetros:
 *   - `file` (File) — arquivo de imagem selecionado pelo usuário;
 *   - `maxWidth`/`maxHeight` (default 400) — dimensão máxima do lado maior;
 *   - `quality` (default 0.82) — qualidade do JPEG resultante (0 a 1).
 * - Retorno: Promise<string> que resolve com um Data URL JPEG (base64) comprimido.
 * - Uso no app: UserProfileModal (avatar do usuário), AdminManagementView
 *   (cadastro de colaboradores) e SuperAdminView (avatar da empresa) com
 *   400x400, e PrizesView (foto do prêmio) com 600x600.
 *
 * Lógica: lê o arquivo como Data URL, carrega num <img>, calcula a proporção
 * para caber no limite (mantendo o aspect ratio), desenha num <canvas> com
 * suavização e converte para JPEG de baixo peso. Falhas de leitura/tipo são
 * rejeitadas com mensagens em PT-BR.
 */
export const compressImageFile = (
  file: File,
  maxWidth = 400,
  maxHeight = 400,
  quality = 0.82
): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('O arquivo selecionado não é uma imagem válida.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo de imagem.'));
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Erro ao carregar a imagem para processamento.'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calcula a proporção para manter o aspect ratio (limita o lado maior)
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível obter o contexto 2D do Canvas.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Converte para string JPEG leve (base64)
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };

      if (typeof event.target?.result === 'string') {
        img.src = event.target.result;
      } else {
        reject(new Error('Falha ao processar conteúdo do arquivo.'));
      }
    };

    reader.readAsDataURL(file);
  });
};
