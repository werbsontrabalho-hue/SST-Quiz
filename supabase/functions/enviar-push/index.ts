// Edge Function: enviar-push (API FCM HTTP V1 — a versão atual do Google)
// Envia avisos estilo WhatsApp para o celular — mesmo com o app fechado.
//
// COMO LIGAR (passo a passo):
// 1) Firebase > Configurações > Contas de serviço > "Gerar nova chave
//    privada" (baixa um arquivo JSON — guarde bem, é a senha do carteiro).
// 2) Supabase > Edge Functions > Secrets, cadastre (cole do JSON):
//      FCM_PROJECT_ID  = project_id      (ex.: sst-quiz)
//      FCM_CLIENT_EMAIL = client_email   (ex.: ...@sst-quiz.iam.gserviceaccount.com)
//      FCM_PRIVATE_KEY  = private_key     (inteira, com -----BEGIN/END-----)
// 3) Publique: supabase functions deploy enviar-push
//    (ou cole este código na função enviar-push pelo painel do Supabase)
// 4) Rode o webhook SQL (arquivo webhook_push_notificacoes.sql ao lado):
//    toda linha nova na tabela "notificacoes" vira push no celular.
//
// Chamada manual (teste):
//   POST /functions/v1/enviar-push  { usuario_id, titulo, mensagem, tipo }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface PushPayload {
  usuario_id?: string;
  titulo?: string;
  mensagem?: string;
  tipo?: string;
  // Formato do webhook do Supabase (record da tabela notificacoes):
  record?: {
    usuario_id?: string;
    titulo?: string;
    mensagem?: string;
    tipo?: string;
  };
}

// --- Base64URL (JWT precisa deste formato) ---
function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemParaBytes(pem: string): Uint8Array {
  // Recorta só o miolo (entre o cabeçalho BEGIN e o rodapé END).
  let miolo = pem;
  const iBegin = pem.indexOf("-----BEGIN");
  if (iBegin >= 0) {
    const aposCabecalho = pem.indexOf("-----", iBegin + 10);
    miolo = aposCabecalho >= 0 ? pem.slice(aposCabecalho + 5) : pem.slice(iBegin);
  }
  const iEnd = miolo.indexOf("-----END");
  if (iEnd >= 0) miolo = miolo.slice(0, iEnd);
  // Mantém SOMENTE caracteres base64 válidos.
  const limpa = miolo.replace(/[^A-Za-z0-9+/=]/g, "");
  if (limpa.length < 100) {
    throw new Error(
      "Chave privada inválida ou incompleta (só " + limpa.length + " caracteres úteis). Copie o private_key inteiro do JSON."
    );
  }
  const bin = atob(limpa);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Troca a chave privada por um token de acesso do Google (vale 1 hora).
async function pegarTokenGoogle(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: clientEmail,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: agora,
        exp: agora + 3600,
      })
    )
  );
  const chave = await crypto.subtle.importKey(
    "pkcs8",
    pemParaBytes(privateKey).buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const assinatura = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    chave,
    new TextEncoder().encode(`${header}.${claims}`)
  );
  const jwt = `${header}.${claims}.${base64url(new Uint8Array(assinatura))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const dados = await res.json();
  if (!res.ok || !dados.access_token) {
    throw new Error("Google não aceitou a chave: " + JSON.stringify(dados).slice(0, 200));
  }
  return dados.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const json = (extra: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(extra), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = (await req.json()) as PushPayload & {
      action?: string;
      token?: string;
      email?: string;
      plataforma?: string;
    };

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // REGISTRO do celular (chamado pelo app ao entrar). Passa pelo
    // entregador para atualizar o dono mesmo se o código já existir.
    if (body.action === "registrar") {
      const token = String(body.token || "").trim();
      const usuario_id = String(body.usuario_id || body.record?.usuario_id || "").trim();
      const email = String(body.email || "").trim().toLowerCase() || null;
      if (!token || !usuario_id) {
        return json({ success: false, message: "token e usuario_id são obrigatórios." }, 400);
      }
      const { error } = await supabase.from("push_tokens").upsert(
        {
          usuario_id,
          email,
          token,
          plataforma: String(body.plataforma || "android"),
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "token" }
      );
      if (error) return json({ success: false, message: error.message }, 500);
      return json({ success: true, message: "Celular registrado.", versao: "v4-registrar" });
    }

    const usuario_id = body.usuario_id || body.record?.usuario_id;
    const titulo = body.titulo || body.record?.titulo || "SST Quiz";
    const mensagem =
      body.mensagem || body.record?.mensagem || "Você tem uma novidade!";
    const tipo = body.tipo || body.record?.tipo || "alerta_sst";

    if (!usuario_id) {
      return json({ success: false, message: "usuario_id é obrigatório." }, 400);
    }

    const projectId = (Deno.env.get("FCM_PROJECT_ID") ?? "").trim();
    const clientEmail = (Deno.env.get("FCM_CLIENT_EMAIL") ?? "").trim();
    let privateKey = (Deno.env.get("FCM_PRIVATE_KEY") ?? "").trim();
    // Limpeza: remove aspas das pontas (se coladas junto) e normaliza quebras.
    if ((privateKey.startsWith('"') && privateKey.endsWith('"')) || (privateKey.startsWith("'") && privateKey.endsWith("'"))) {
      privateKey = privateKey.slice(1, -1);
    }
    // Aceita a chave com \n escapado (como vem do JSON do Firebase).
    if (privateKey.includes("\\n")) privateKey = privateKey.replace(/\\n/g, "\n");

    if (!projectId || !clientEmail || !privateKey) {
      return json(
        {
          success: false,
          message:
            "Faltam os Secrets FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY na função.",
        },
        500
      );
    }

    // 1) Busca os celulares do usuário (pelo id OU pelo e-mail, o que achar).
    let emailDoUsuario = "";
    try {
      const { data: dono } = await supabase
        .from("usuarios")
        .select("email")
        .eq("id", usuario_id)
        .maybeSingle();
      emailDoUsuario = String((dono as any)?.email || "").trim().toLowerCase();
    } catch {
      // Segue só com o id.
    }
    let consulta = supabase.from("push_tokens").select("token");
    if (emailDoUsuario) {
      consulta = consulta.or(`usuario_id.eq.${usuario_id},email.eq.${emailDoUsuario}`);
    } else {
      consulta = consulta.eq("usuario_id", usuario_id);
    }
    const { data: tokens, error: tokErr } = await consulta;
    if (tokErr) throw tokErr;
    if (!tokens || tokens.length === 0) {
      return json({ success: true, message: "Usuário sem celular registrado.", enviados: 0 });
    }

    // 2) Autoriza no Google e envia um a um.
    const accessToken = await pegarTokenGoogle(clientEmail, privateKey);
    let enviados = 0;
    const erros: string[] = [];
    for (const row of tokens) {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message: {
              token: (row as { token: string }).token,
              notification: { title: titulo, body: mensagem },
              data: { tipo: String(tipo), usuario_id: String(usuario_id) },
              android: { priority: "high" },
            },
          }),
        }
      );
      if (res.ok) {
        enviados++;
      } else {
        erros.push(await res.text().then((t) => t.slice(0, 160)).catch(() => String(res.status)));
      }
    }

    return json({ success: true, enviados, total: tokens.length, erros: erros.slice(0, 3) });
  } catch (err) {
    return json(
      { success: false, message: (err as Error)?.message || "Erro ao enviar push." },
      500
    );
  }
});
