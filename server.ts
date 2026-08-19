// =====================================================================
// server.ts - Servidor Node local (Express + Vite) do SST Quiz
// Serve o front-end (em desenvolvimento ou no build de produção) e expõe
// uma rota de health check. Também define a porta preferida, usada pelos
// testes automatizados em tests/server.test.ts.
// =====================================================================
import dotenv from "dotenv";
import express from "express";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";
import { sanitizeSalaParaParticipante } from "./src/utils/salaSanitize";

// Carrega as variáveis de ambiente do arquivo .env (SMTP, API_TOKEN, PORT,
// PUBLIC_URL, etc.) caso exista. Antes isso nunca era carregado, então as
// configurações documentadas ficavam inativas no servidor.
dotenv.config();

// Retorna a porta preferida do servidor: usa a variável de ambiente PORT
// quando ela for um número válido (1..65535); caso contrário, usa 3000
export function getPreferredPort(): number {
  const envPort = Number(process.env.PORT);
  return Number.isFinite(envPort) && envPort > 0 && envPort <= 65535 ? envPort : 3000;
}

// Descobre o IP de rede local da máquina (ex.: 192.168.0.10) para que o
// celular consiga acessar o app na MESMA rede Wi-Fi via QR Code.
// Prioriza variável de ambiente PUBLIC_URL (quando houver domínio público).
function getPublicBaseUrl(port: number): string {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/+$/, "");
  }
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const net = nets[name];
    if (!net) continue;
    for (const item of net) {
      // Pula loopback (127.0.0.1 / localhost) e IPv6
      if (item.family === "IPv4" && !item.internal) {
        return `http://${item.address}:${port}`;
      }
    }
  }
  return `http://localhost:${port}`;
}

// =====================================================================
// RATE LIMITER (IN-MEMORY)
// Protege rotas sensíveis contra abuso (ex.: brute-force de PIN, spam de
// e-mail) com um limite simples por janela deslizante. Em memória por ser
// um servidor local/LAN; suficiente para mitigar a exploração automatizada.
// =====================================================================
const RATE_WINDOW_MS = 60_000;
const requestLog = new Map<string, number[]>();

function rateLimit(key: string, max: number, windowMs = RATE_WINDOW_MS): boolean {
  const now = Date.now();
  const hits = (requestLog.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    requestLog.set(key, hits);
    return false;
  }
  hits.push(now);
  requestLog.set(key, hits);
  // Previne vazamento de memória a longo prazo: remove periodicamente chaves
  // inativas (sem hits na janela) — cada chave é um IP/rota único.
  if (requestLog.size > 2000 && Math.random() < 0.01) {
    for (const [k, arr] of requestLog) {
      if (arr.length === 0 || now - arr[arr.length - 1] > windowMs) {
        requestLog.delete(k);
      }
    }
  }
  return true;
}

function clientKey(req: express.Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function rateLimited(app: express.Express, max: number, windowMs = RATE_WINDOW_MS) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!rateLimit(`${req.path}|${clientKey(req)}`, max, windowMs)) {
      res.status(429).json({ error: "Muitas tentativas. Aguarde alguns segundos e tente novamente." });
      return;
    }
    next();
  };
}

// =====================================================================
// SANITIZAÇÃO DE NOME DE ARQUIVO (anti path-traversal)
// Garante que o nome gravado fique sempre DENTRO de publicPdfDir, mesmo
// que o docId/nome venha adulterado no payload.
// =====================================================================
function sanitizePdfFilename(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9_\-()\[\].\u00C0-\u00FF]/g, "_");
  const safe = base.trim().replace(/\.+$/, "");
  return safe.length > 0 ? safe : `DOC-SST-${Date.now()}.pdf`;
}

// Escapa HTML em campos controlados pelo usuário usados no corpo do e-mail,
// prevenindo injeção de HTML/script no conteúdo enviado.
function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// =====================================================================
// AUTENTICAÇÃO OPCIONAL POR TOKEN COMPARTILHADO
// Se a variável de ambiente API_TOKEN estiver definida, as rotas sensíveis
// passam a exigir `Authorization: Bearer <token>` ou header `x-api-token`.
// Sem a variável configurada, mantém o comportamento legado (LAN aberta).
// =====================================================================
function isAuthorized(req: express.Request): boolean {
  const expected = process.env.API_TOKEN;
  if (!expected) return true;
  const header = (req.headers["x-api-token"] as string | undefined) || "";
  const bearer = (req.headers.authorization || "").startsWith("Bearer ")
    ? (req.headers.authorization as string).slice(7)
    : "";
  const provided = header || bearer;
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Estado em memória do backend (salas, resultados e porta ativa), exposto
// para permitir testes de integração HTTP sem precisar do .listen().
export interface AppBackendState {
  salasQuizMap: Map<string, any>;
  resultadosAvaliacaoArray: any[];
  activePort: number;
}

// Monta o app Express com TODAS as rotas/API (sem escutar porta). Separado do
// startServer() para permitir testes HTTP de integração (tests/serverRoutes).
export async function createApp(): Promise<{ app: express.Express; state: AppBackendState }> {
  const state: AppBackendState = {
    salasQuizMap: new Map<string, any>(),
    resultadosAvaliacaoArray: [],
    activePort: getPreferredPort(),
  };
  const app = express();
  app.use(express.json({ limit: "50mb" })); // Habilita o parsing de JSON no corpo das requisições (com suporte para PDFs base64)

  // Captura erros de payload muito grande (413) e devolve JSON em vez de HTML,
  // para que o front-end consiga exibir a mensagem correta.
  app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.type === "entity.too.large" || err.status === 413)) {
      res.status(413).json({ error: "O arquivo PDF gerado é grande demais para o envio por e-mail. Tente novamente ou use a opção 'Baixar PDF'." });
      return;
    }
    next(err);
  });

  // =====================================================================
  // OBSERVABILIDADE (Fase 10): log de requisições + métricas leves.
  // Registra método, rota, status e duração em milissegundos para todas as
  // chamadas a /api/*, e acumula contadores por rota para o /api/health.
  // =====================================================================
  const metrics = { total: 0, byPath: new Map<string, number>(), errors: 0, last5m: [] as { t: number; dur: number }[] };
  const METRICS_WINDOW_MS = 5 * 60 * 1000;

  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    const start = Date.now();
    metrics.total++;
    res.on("finish", () => {
      const dur = Date.now() - start;
      const pathKey = `${req.method} ${req.path}`;
      metrics.byPath.set(pathKey, (metrics.byPath.get(pathKey) || 0) + 1);
      if (res.statusCode >= 500) metrics.errors++;
      metrics.last5m.push({ t: Date.now(), dur });
      // Mantém apenas a janela dos últimos 5 minutos (podando por tempo).
      const cutoff = Date.now() - METRICS_WINDOW_MS;
      metrics.last5m = metrics.last5m.filter((m) => m.t >= cutoff);
      if (process.env.LOG_LEVEL === "debug") {
        console.log(`[SST Quiz] ${res.statusCode} ${req.method} ${req.path} ${dur}ms`);
      }
    });
    next();
  });

  // Serve arquivos de PDF gerados
  const publicPdfDir = path.join(process.cwd(), "public", "pdf");
  if (!fs.existsSync(publicPdfDir)) {
    fs.mkdirSync(publicPdfDir, { recursive: true });
  }
  // SEGURANÇA (auditoria Quiz Guiado/Avaliação): os PDFs contêm dados
  // pessoais (nome, CPF, respostas, nota). Quando API_TOKEN estiver
  // configurado, o acesso a /pdf exige o token — via header `x-api-token`
  // OU query `?token=` (para o download direto pelo navegador). Sem token,
  // mantém o comportamento LAN (sem restrição).
  app.use("/pdf", (req, res, next) => {
    if (process.env.API_TOKEN) {
      const headerToken = (req.headers["x-api-token"] as string | undefined) || "";
      const queryToken = typeof req.query.token === "string" ? req.query.token : "";
      const provided = headerToken || queryToken;
      const expected = process.env.API_TOKEN;
      const a = Buffer.from(provided);
      const b = Buffer.from(expected);
      const ok = a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
      if (!ok) {
        res.status(401).json({ error: "Não autorizado para acessar o PDF." });
        return;
      }
    }
    next();
  }, express.static(publicPdfDir));

  // Rota de Sincronização de Registros Offline (Frente de Serviço)
  app.post("/api/sync-offline", (req, res) => {
    try {
      const { id, type, payload, timestamp } = req.body || {};
      console.log(`[SST Quiz] Sincronização offline recebida (${type}):`, id, timestamp);
      res.json({ success: true, id, syncedAt: new Date().toISOString() });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Erro ao processar sincronização offline" });
    }
  });

  // =====================================================================
  // IN-MEMORY DATA STORE FOR QUIZ GUIADO (LIVE GAME SYNCHRONIZATION)
  // Permite sincronização imediata em tempo real entre celulares e desktop
  // mesmo se o Supabase externo não estiver configurado.
  // =====================================================================
  const salasQuizMap = state.salasQuizMap;
  const resultadosAvaliacaoArray = state.resultadosAvaliacaoArray;

  // Limpeza periódica da memória: remove salas encerradas/concluídas que se
  // acumulavam indefinidamente no Map (vazamento de memória).
  const cleanupTimer = setInterval(() => {
    for (const [id, s] of salasQuizMap) {
      if (s && (s.status === "concluido" || s.status === "encerrado")) {
        salasQuizMap.delete(id);
      }
    }
  }, 60_000);
  cleanupTimer.unref();

  // Rota de health check: retorna o status do backend
  app.get("/api/health", (_req, res) => {
    const n = metrics.last5m.length;
    const avgMs = n > 0 ? Math.round(metrics.last5m.reduce((a, b) => a + b.dur, 0) / n) : 0;
    res.json({
      status: "ok",
      service: "SST Quiz Backend",
      total_salas: salasQuizMap.size,
      uptime_seconds: Math.round(process.uptime()),
      metrics: {
        total: metrics.total,
        errors: metrics.errors,
        avg_ms_ultimas_reqs: avgMs,
        por_rota: Object.fromEntries(metrics.byPath),
      },
    });
  });

  // Rota de readiness: confirma que o servidor está pronto para receber carga
  app.get("/api/ready", (_req, res) => {
    res.json({ status: "ready", uptime_seconds: Math.round(process.uptime()) });
  });

  // Rota de URL pública: usada para gerar QR Code que o CELULAR consegue abrir.
  // Prioriza PUBLIC_URL do .env ou cabeçalhos de proxy reverso (Cloud Run / Nginx).
  // Se for acesso local LAN, retorna o IP de rede da máquina.
  app.get("/api/public-base-url", (req, res) => {
    if (process.env.PUBLIC_URL) {
      return res.json({ baseUrl: process.env.PUBLIC_URL.replace(/\/+$/, "") });
    }
    const forwardedHost = (req.headers["x-forwarded-host"] as string) || (req.headers["host"] as string);
    const forwardedProto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
    if (forwardedHost && !forwardedHost.includes("localhost") && !forwardedHost.includes("127.0.0.1")) {
      return res.json({ baseUrl: `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "") });
    }
    res.json({ baseUrl: getPublicBaseUrl(state.activePort) });
  });

  // Obter todas as salas ativas de Quiz Guiado
  // SEGURANÇA (auditoria forense AUD-20): a lista NÃO pode vazar o gabarito
  // das perguntas (resposta_correta/explicacao), o PIN nem dados de
  // participantes (CPF/matrícula). Cada sala é sanitizada para participante
  // antes de ser retornada.
  app.get("/api/salas_quiz_guiado", (_req, res) => {
    const salas = Array.from(salasQuizMap.values()).filter(
      (s) => s.status !== "concluido" && s.status !== "encerrado"
    );
    res.json(salas.map((s) => sanitizeSalaParaParticipante(s)));
  });

  // Buscar sala por PIN (para entrada via celular / QR code)
  // Protegido por rate limit para evitar brute-force do PIN de 6 dígitos.
  app.get("/api/salas_quiz_guiado/pin/:pin", rateLimited(app, 12), (req, res) => {
    const cleanPin = req.params.pin.trim().toUpperCase().slice(0, 10);
    const sala = Array.from(salasQuizMap.values()).find(
      (s) => typeof s.pin === "string" && s.pin.trim().toUpperCase() === cleanPin && s.status !== "concluido" && s.status !== "encerrado"
    );
    if (sala) {
      // Sanitiza o gabarito: participante só recebe as perguntas já reveladas.
      res.json(sanitizeSalaParaParticipante(sala));
    } else {
      res.status(404).json({ error: "Sala não encontrada ou encerrada" });
    }
  });

  // Upsert (Criar ou Atualizar) Sala de Quiz Guiado
  // O participante que responde envia a sala SANITIZADA de volta; o instrutor
  // envia a sala completa ao criar/iniciar. Para o fluxo LAN/visitante
  // funcionar, o Express precisa APRENDER as salas (não persiste entre
  // restarts). Aceitamos o upsert, mas:
  //   - para salas EXISTENTES, preservamos o gabarito oficial do servidor e
  //     nunca regredimos o progresso;
  //   - para salas NOVAS, aceitamos (vindas do instrutor via nuvem/console).
  // A RESPOSTA (GET) é sempre SANITIZADA (sem gabarito), então o Express não
  // expõe resposta_correta/explicacao ao participante.
  app.post("/api/salas_quiz_guiado", rateLimited(app, 60), (req, res) => {
    const sala = req.body;
    if (!sala || typeof sala !== "object" || !sala.id || typeof sala.pin !== "string" || !sala.pin.trim()) {
      res.status(400).json({ error: "Dados inválidos da sala (id e pin são obrigatórios)" });
      return;
    }
    const existente = salasQuizMap.get(sala.id);
    // Preserva o gabarito oficial que já está no servidor: o participante
    // não pode substituir perguntas completas por uma cópia sanitizada.
    const salaFinal: any = {
      ...sala,
      updated_at: new Date().toISOString(),
    };
    if (existente) {
      // CORREÇÃO (Problema 2 — participante travado na tela "Iniciar" ao
      // reiniciar a sala): o instrutor reinicia a sala gerando um NOVO PIN e
      // um NOVO sessao_id. Antes o Express preservava o PIN antigo, então o
      // participante que escaneava o QR/PIN novo não encontrava a sala no
      // servidor (visitante sem JWT depende do Express) e ficava travado na
      // identificação. Quando o sessao_id enviado difere do existente, é um
      // REINÍCIO legítimo: aceitamos o novo PIN e o estado zerado, MAS sempre
      // preservamos o gabarito (perguntas) e os metadados do instrutor.
      const eReinicio =
        String(sala.sessao_id || '') !== '' &&
        String(existente.sessao_id || '') !== '' &&
        String(sala.sessao_id) !== String(existente.sessao_id);

      salaFinal.perguntas = existente.perguntas;
      salaFinal.empresa_id = existente.empresa_id;
      salaFinal.instrutor_id = existente.instrutor_id;
      salaFinal.instrutor_nome = existente.instrutor_nome;
      salaFinal.treinamento_titulo = existente.treinamento_titulo;
      salaFinal.modalidade = existente.modalidade;
      salaFinal.estilo = existente.estilo;
      salaFinal.nota_minima = existente.nota_minima;
      salaFinal.tempo_por_pergunta_seg = existente.tempo_por_pergunta_seg;

      if (eReinicio) {
        // Reinício: aceita o novo PIN/sessão/estado do instrutor.
        salaFinal.pin = sala.pin;
        salaFinal.sessao_id = sala.sessao_id;
        salaFinal.status = 'aguardando';
        salaFinal.estado_apresentacao = sala.estado_apresentacao || 'AGUARDANDO';
        salaFinal.pergunta_atual_index = 0;
        salaFinal.revelar_resposta_atual = false;
        salaFinal.mostrar_ranking = false;
        salaFinal.participantes = Array.isArray(sala.participantes) ? sala.participantes : [];
        salaFinal.question_started_at = 0;
        salaFinal.question_ends_at = 0;
      } else {
        // Upsert comum: preserva o PIN oficial e nunca regride o progresso.
        salaFinal.pin = existente.pin;

        // CORREÇÃO (bug: participante travado na 1ª pergunta): nunca REGREDIR o
        // progresso da sala. Um participante que responde envia a sala com o
        // estado que recebeu (possivelmente antigo); mantém o mais avançado.
        //
        // CORREÇÃO (auditoria A-01 — sala não conclui no backend LAN): o
        // encerramento (`encerrarSalaQuizGuiado`) NÃO altera question_started_at,
        // então a regra "não regredir" (que compara timestamps) rejeitava a
        // transição para `concluido`/`encerrado`, deixando o Express preso em
        // `em_andamento` enquanto o Supabase já registrava o estado terminal.
        // Estados TERMINAIS são sempre aceitos (são o fim absoluto da sessão).
        const statusEnviado = sala.status;
        const eTerminal = statusEnviado === 'concluido' || statusEnviado === 'encerrado';
        const existTime = Number(existente.question_started_at || 0);
        const envTime = Number(sala.question_started_at || 0);
        const usarEnviado = envTime > existTime;
        if (usarEnviado) {
          salaFinal.question_started_at = sala.question_started_at;
          salaFinal.question_ends_at = sala.question_ends_at;
          salaFinal.pergunta_atual_index = sala.pergunta_atual_index;
          salaFinal.estado_apresentacao = sala.estado_apresentacao;
          salaFinal.status = sala.status;
        } else if (eTerminal) {
          // Encerramento legítimo: aceita o estado terminal e os participantes
          // processados (com nota_final/situacao/concluido), preservando o
          // progresso de apresentação já existente.
          salaFinal.question_started_at = existente.question_started_at;
          salaFinal.question_ends_at = existente.question_ends_at;
          salaFinal.pergunta_atual_index = existente.pergunta_atual_index;
          salaFinal.estado_apresentacao = sala.estado_apresentacao || existente.estado_apresentacao;
          salaFinal.status = statusEnviado;
          salaFinal.participantes = Array.isArray(sala.participantes) ? sala.participantes : existente.participantes;
        } else {
          salaFinal.question_started_at = existente.question_started_at;
          salaFinal.question_ends_at = existente.question_ends_at;
          salaFinal.pergunta_atual_index = existente.pergunta_atual_index;
          salaFinal.estado_apresentacao = existente.estado_apresentacao;
          salaFinal.status = existente.status;
          if (sala.status && existente.status === 'em_andamento' && sala.status !== 'em_andamento') {
            salaFinal.status = existente.status;
          }
        }
      }
    }
    salasQuizMap.set(sala.id, salaFinal);
    res.json({ success: true, sala: salaFinal });
  });

  // Valida a resposta de um participante no SERVIDOR (Express), que possui o
  // gabarito completo da sala. CORREÇÃO (auditoria Problema 1 — resposta
  // correta marcada como errada): o participante VISITANTE (modo Kahoot/LAN)
  // não tem sessão Supabase Auth, então a edge function pontuar-quiz-guiado
  // (que exige `Authorization: Bearer`) e o RPC registrar_resposta_quiz_guiado
  // (que exige o participante já persistido no Supabase) são inacessíveis a ele.
  // Este endpoint valida a resposta contra o gabarito armazenado no próprio
  // Express, devolvendo `correta` e a pontuação — cobrindo o fluxo LAN.
  app.post("/api/salas_quiz_guiado/responder", rateLimited(app, 120), (req, res) => {
    const { sala_id, participante_id, pergunta_id, resposta_index, tempo_ms } = req.body || {};
    if (!sala_id || !participante_id || !pergunta_id || resposta_index === undefined) {
      res.status(400).json({ success: false, message: "Parâmetros inválidos." });
      return;
    }
    const sala = salasQuizMap.get(String(sala_id));
    if (!sala) {
      res.status(404).json({ success: false, message: "Sala não encontrada." });
      return;
    }
    const perguntas = Array.isArray(sala.perguntas) ? sala.perguntas : [];
    const pergunta = perguntas.find((p: any) => String(p.id) === String(pergunta_id));
    if (!pergunta) {
      res.status(404).json({ success: false, message: "Pergunta não pertence à sala." });
      return;
    }
    const corretaIndex = Number(pergunta.resposta_correta);
    const correta = Number(resposta_index) === corretaIndex;

    let pontosAdicionais = 0;
    if (correta) {
      if (sala.estilo === "competitivo") {
        const tempoMaxMs = (Number(sala.tempo_por_pergunta_seg ?? 30) || 30) * 1000;
        const tempoEfetivo = Math.min(Math.max(0, Number(tempo_ms ?? 0)), tempoMaxMs);
        const ratio = Math.max(0, (tempoMaxMs - tempoEfetivo) / tempoMaxMs);
        pontosAdicionais = 1000 + Math.round(ratio * 500);
      } else {
        pontosAdicionais = 100;
      }
    }

    // Grava a resposta (com a correção validada) no participante da sala, para
    // que o polling do instrutor reflita o resultado correto imediatamente.
    const participantes = Array.isArray(sala.participantes) ? sala.participantes : [];
    const idx = participantes.findIndex((p: any) => String(p.id) === String(participante_id));
    if (idx >= 0) {
      const p = participantes[idx];
      const respostas = p.respostas && typeof p.respostas === "object" ? { ...p.respostas } : {};
      if (!respostas[pergunta_id]) {
        respostas[pergunta_id] = {
          resposta_index: Number(resposta_index),
          tempo_ms: Number(tempo_ms ?? 0),
          timestamp: new Date().toISOString(),
          correta,
        };
        p.pontuacao_acumulada = (Number(p.pontuacao_acumulada ?? 0) || 0) + pontosAdicionais;
        p.respostas = respostas;
        participantes[idx] = p;
        sala.participantes = participantes;
      }
    }

    res.json({ success: true, correta, pontosAdicionais, code: "OK" });
  });

  // Deletar / Encerrar Sala
  // SEGURANÇA (auditoria Quiz Guiado/Avaliação): exige isAuthorized quando
  // API_TOKEN estiver configurado; sem token mantém o comportamento LAN.
  app.delete("/api/salas_quiz_guiado/:id", rateLimited(app, 60), (req, res) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Não autorizado" });
      return;
    }
    const id = req.params.id;
    salasQuizMap.delete(id);
    res.json({ success: true });
  });

  // Salvar Resultados de Avaliação SST (Histórico e PDF)
  // SEGURANÇA (auditoria forense AUD-26/27): expõe dados pessoais (nome,
  // matrícula, CPF, respostas) e aceita injeção. Quando API_TOKEN estiver
  // configurado, exige autenticação; sem token mantém o comportamento LAN.
  app.get("/api/resultados_avaliacao_sst", (req, res) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Não autorizado" });
      return;
    }
    res.json(resultadosAvaliacaoArray);
  });

  app.post("/api/resultados_avaliacao_sst", rateLimited(app, 120), (req, res) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Não autorizado" });
      return;
    }
    const resultado = req.body;
    if (resultado && resultado.id) {
      const idx = resultadosAvaliacaoArray.findIndex((r) => r.id === resultado.id);
      if (idx >= 0) resultadosAvaliacaoArray[idx] = resultado;
      else {
        resultadosAvaliacaoArray.push(resultado);
        // Previne vazamento de memória: mantém no máximo os últimos N resultados.
        const MAX_RESULTADOS = 5000;
        if (resultadosAvaliacaoArray.length > MAX_RESULTADOS) {
          resultadosAvaliacaoArray.splice(0, resultadosAvaliacaoArray.length - MAX_RESULTADOS);
        }
      }
    }
    res.json({ success: true, total: resultadosAvaliacaoArray.length });
  });

  app.delete("/api/resultados_avaliacao_sst/:id", rateLimited(app, 60), (req, res) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Não autorizado" });
      return;
    }
    const id = req.params.id;
    const idx = resultadosAvaliacaoArray.findIndex((r) => r.id === id);
    if (idx >= 0) {
      resultadosAvaliacaoArray.splice(idx, 1);
    }
    res.json({ success: true });
  });

  // =====================================================================
  // BACKUP SERVER-SIDE (disco local) — Fase 8
  // Mantém cópias duráveis dos backups na máquina LAN mesmo sem Supabase.
  // Protegidas por rate limit e pela autenticação opcional por token.
  // =====================================================================
  const backupsDir = path.join(process.cwd(), "backups");
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  // Sanitiza o id de backup usado em nome de arquivo (anti path-traversal).
  function sanitizeBackupId(id: string): string {
    const safe = path.basename(id).replace(/[^a-zA-Z0-9_-]/g, "_");
    return safe.length > 0 ? safe : `bkp-${Date.now()}`;
  }

  // Lista os backups em disco (apenas metadados — sem o snapshot pesado).
  app.get("/api/backups", rateLimited(app, 30), (req, res, next) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Não autorizado. Token de API ausente ou inválido." });
      return;
    }
    next();
  }, (_req, res) => {
    try {
      const nomes = fs.readdirSync(backupsDir).filter((n) => n.endsWith(".json"));
      const lista = nomes.map((n) => {
        const id = n.replace(/\.json$/, "");
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(backupsDir, n), "utf8"));
          return {
            id,
            data: raw.data,
            tipo: raw.tipo,
            tamanhoKb: raw.tamanhoKb,
            resumo: raw.resumo,
            escopo: raw.escopo,
            empresaId: raw.empresaId,
          };
        } catch {
          return { id, data: undefined, tipo: "manual", resumo: "Backup em disco (metadados ilegíveis)." };
        }
      });
      res.json(lista);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Erro ao listar backups." });
    }
  });

  // Salva um backup completo no disco (durabilidade LAN sem nuvem).
  app.post("/api/backups", rateLimited(app, 30), (req, res, next) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Não autorizado. Token de API ausente ou inválido." });
      return;
    }
    next();
  }, (req, res) => {
    try {
      const bkp = req.body || {};
      const id = sanitizeBackupId(String(bkp.id || `bkp-${Date.now()}`));
      const filePath = path.join(backupsDir, `${id}.json`);
      const meta = {
        id,
        data: bkp.data || new Date().toISOString(),
        tipo: bkp.tipo || "manual",
        tamanhoKb: bkp.tamanhoKb,
        resumo: bkp.resumo,
        escopo: bkp.escopo,
        empresaId: bkp.empresaId,
        jsonSnapshot: bkp.jsonSnapshot || null,
      };
      fs.writeFileSync(filePath, JSON.stringify(meta));
      res.json({ success: true, id, message: "Backup salvo no servidor." });
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Erro ao salvar backup no servidor." });
    }
  });

  // Recupera um backup completo do disco.
  app.get("/api/backups/:id", rateLimited(app, 30), (req, res, next) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Não autorizado. Token de API ausente ou inválido." });
      return;
    }
    next();
  }, (req, res) => {
    try {
      const id = sanitizeBackupId(req.params.id);
      const filePath = path.join(backupsDir, `${id}.json`);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: "Backup não encontrado no servidor." });
        return;
      }
      res.json(JSON.parse(fs.readFileSync(filePath, "utf8")));
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Erro ao ler backup do servidor." });
    }
  });

  // Exclui um backup do disco.
  app.delete("/api/backups/:id", rateLimited(app, 30), (req, res, next) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Não autorizado. Token de API ausente ou inválido." });
      return;
    }
    next();
  }, (req, res) => {
    try {
      const id = sanitizeBackupId(req.params.id);
      const filePath = path.join(backupsDir, `${id}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true, message: "Backup removido do servidor." });
      } else {
        res.status(404).json({ error: "Backup não encontrado no servidor." });
      }
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "Erro ao excluir backup do servidor." });
    }
  });

  // Rota para Envio do PDF por E-mail com anexo e persistência do arquivo
  // Protegida por rate limit e por autenticação opcional por token (API_TOKEN).
  app.post("/api/enviar_email_prova", rateLimited(app, 10), (req, res, next) => {
    if (!isAuthorized(req)) {
      res.status(401).json({ error: "Não autorizado. Token de API ausente ou inválido." });
      return;
    }
    next();
  }, async (req, res) => {
    try {
      const { email, nome, resultado, pdfBase64 } = req.body;
      if (!email || !email.includes("@")) {
        res.status(400).json({ error: "E-mail de destino inválido." });
        return;
      }

      // docId sanitizado: usado apenas como rótulo no nome do arquivo (nunca como caminho)
      const docId = String(resultado?.codigo_documento || resultado?.id || `DOC-SST-${Date.now()}`)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 64);
      const filename = `Avaliacao_Teorica_SST_${(nome || 'Participante').replace(/\s+/g, '_').slice(0, 60)}_${docId}.pdf`;

      let pdfBuffer: Buffer | null = null;
      let fileUrl = "";

      if (pdfBase64) {
        try {
          const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "").replace(/\s+/g, "");
          pdfBuffer = Buffer.from(cleanBase64, "base64");
          // path.basename garante que filename não escape de publicPdfDir (anti path-traversal)
          const filePath = path.join(publicPdfDir, sanitizePdfFilename(filename));
          fs.writeFileSync(filePath, pdfBuffer);
          fileUrl = `/pdf/${path.basename(filePath)}`;
        } catch (errPdf) {
          console.warn("[SST Quiz] Erro ao salvar PDF do laudo:", errPdf);
        }
      }

      let rawHost = (process.env.SMTP_HOST || "").trim();
      // Remove protocolos e barras caso tenham sido inseridos por engano (ex: https://.../)
      let host = rawHost.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
      // Se a porta foi incluída junto do host (ex: smtp.mail.com:587), separa
      if (host.includes(":") && !host.startsWith("[")) {
        host = host.split(":")[0].trim();
      }

      const user = (process.env.SMTP_USER || "").trim();
      const pass = (process.env.SMTP_PASS || "").trim();
      const port = Number(process.env.SMTP_PORT || 587);

      const isSupabaseUrl = host.toLowerCase().includes("supabase.co");

      let emailEnviadoViaSmtp = false;
      let ultimoErroSmtp = "";

      if (host && user && pass && !isSupabaseUrl) {
        try {
          const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 15000,
          });

          const attachments = pdfBuffer ? [{ filename, content: pdfBuffer }] : [];

          await transporter.sendMail({
            from: process.env.SMTP_FROM || `"SST Quiz Corporate" <${user}>`,
            to: email,
            subject: `Avaliação Teórica SST - ${nome || 'Participante'} - Laudo Oficial ${docId}`,
            text: `Olá ${nome || 'Participante'},\n\nSegue em anexo a sua Avaliação Teórica de Treinamento SST (Documento Oficial: ${docId}).\n\nResultado: ${resultado?.situacao || 'Concluído'}\nNota Final: ${resultado?.nota_final || 0} / 10.0\nData: ${resultado?.data || new Date().toLocaleDateString('pt-BR')}\n\nAtenciosamente,\nEquipe SST Quiz Corporate`,
            html: `
              <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b; max-width: 600px; border: 1px solid #e2e8f0; rounded: 12px;">
                <h2 style="color: #0284c7; margin-top: 0;">Avaliação Teórica SST — Laudo Oficial</h2>
                <p>Olá <strong>${escapeHtml(nome || 'Participante')}</strong>,</p>
                <p>O seu comprovante individual e prova de avaliação foram validados com sucesso.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <tr style="background: #f1f5f9;"><td style="padding: 10px; border: 1px solid #cbd5e1;"><strong>Documento:</strong></td><td style="padding: 10px; border: 1px solid #cbd5e1;">${escapeHtml(docId)}</td></tr>
                  <tr><td style="padding: 10px; border: 1px solid #cbd5e1;"><strong>Treinamento:</strong></td><td style="padding: 10px; border: 1px solid #cbd5e1;">${escapeHtml(resultado?.treinamento_titulo || 'Treinamento SST')}</td></tr>
                  <tr style="background: #f1f5f9;"><td style="padding: 10px; border: 1px solid #cbd5e1;"><strong>Resultado:</strong></td><td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; color: ${resultado?.situacao === 'APROVADO' ? '#16a34a' : '#dc2626'};">${escapeHtml(resultado?.situacao || 'Concluído')}</td></tr>
                  <tr><td style="padding: 10px; border: 1px solid #cbd5e1;"><strong>Nota Final:</strong></td><td style="padding: 10px; border: 1px solid #cbd5e1;">${escapeHtml(resultado?.nota_final || 0)} / 10.0</td></tr>
                </table>
                <p>O PDF oficial com a prova detalhada, gabarito e respostas assinaladas está <strong>anexado a este e-mail</strong>.</p>
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;" />
                <p style="font-size: 11px; color: #64748b;">SST Quiz Corporate — Sistema de Registro de Evidências</p>
              </div>
            `,
            attachments,
          });
          emailEnviadoViaSmtp = true;
        } catch (errEmail: any) {
          console.warn("[SST Quiz] Erro ao enviar e-mail via SMTP:", errEmail);
          ultimoErroSmtp = errEmail?.message || String(errEmail);
        }
      }

      if (!emailEnviadoViaSmtp) {
        // Diagnóstico claro para o usuário sobre o estado do SMTP
        let motivoSmtp = "Servidor SMTP não configurado.";
        if (isSupabaseUrl) {
          motivoSmtp = `A variável SMTP_HOST está com o endereço do Supabase (${host}), que é a URL do banco de dados/API e não um servidor de e-mail SMTP. Para envio de e-mails, utilize as credenciais de um servidor SMTP (ex: smtp.gmail.com, smtp.resend.com, smtp.office365.com).`;
        } else if (!(host && user && pass)) {
          motivoSmtp = "Servidor SMTP não configurado (defina as variáveis SMTP_HOST, SMTP_USER e SMTP_PASS nas configurações).";
        } else if (ultimoErroSmtp) {
          motivoSmtp = `Falha na conexão com o servidor SMTP (${host}:${port}): ${ultimoErroSmtp}`;
        }

        if (!pdfBuffer) {
          res.status(400).json({
            success: false,
            error: `Não foi possível gerar o PDF do laudo (${motivoSmtp}).`,
          });
          return;
        }
        res.status(200).json({
          success: false,
          error: motivoSmtp,
          fileUrl,
          filename,
        });
        return;
      }

      res.json({
        success: true,
        emailEnviadoViaSmtp,
        fileUrl,
        filename,
        message: `Laudo e Prova em PDF enviados com sucesso por e-mail para ${email}!`,
      });
    } catch (error: any) {
      console.error("[SST Quiz] Erro na rota /api/enviar_email_prova:", error);
      res.status(500).json({ error: error?.message || "Erro ao processar envio do PDF por e-mail." });
    }
  });

  // Em desenvolvimento usa o middleware do Vite (com HMR); em produção serve os arquivos estáticos do build
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath)); // Serve os arquivos estáticos gerados pelo build
    // Rotas de API desconhecidas retornam JSON 404 (e não o index.html da SPA),
    // evitando que o front-end receba HTML 200 e falhe ao fazer res.json().
    app.use("/api", (_req, res) => {
      res.status(404).json({ error: "Rota de API não encontrada." });
    });
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html")); // SPA: qualquer rota devolve o index.html
    });
  }

  return { app, state };
}

// Inicializa o servidor HTTP com Express (escuta a porta e inicia o processo).
async function startServer() {
  const { app, state } = await createApp();

  const initialPort = getPreferredPort();
  const maxAttempts = 5; // Número máximo de tentativas de porta em sequência

  // Tenta abrir o servidor na porta informada; se ela estiver ocupada (EADDRINUSE),
  // incrementa a porta e tenta novamente até o limite de tentativas
  const listenOnPort = (port: number, attempt = 1): Promise<void> => {
    return new Promise((resolve, reject) => {
      const server = app.listen(port, "0.0.0.0", () => {
        state.activePort = port; // registra a porta que realmente entrou em uso
        console.log(`[SST Quiz] Servidor iniciado na porta ${port}`);
        resolve();
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE" && attempt < maxAttempts) {
          console.warn(`Porta ${port} ocupada. Tentando ${port + 1}...`);
          server.close();
          listenOnPort(port + 1, attempt + 1).then(resolve).catch(reject);
          return;
        }
        reject(err);
      });
    });
  };

  await listenOnPort(initialPort); // Aguarda o servidor subir antes de encerrar a função
}

// Executa o servidor quando não estiver em ambiente de teste
const isTestEnv = Boolean(
  process.env.NODE_ENV === "test" ||
  process.argv.some(arg => arg.includes("test"))
);

if (!isTestEnv) {
  startServer().catch((err) => {
    console.error("[SST Quiz] Erro fatal ao iniciar o servidor:", err);
    process.exit(1);
  });
}

