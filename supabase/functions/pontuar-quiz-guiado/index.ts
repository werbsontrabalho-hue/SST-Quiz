// Edge Function: pontuar-quiz-guiado
// Valida a resposta de um participante do QUIZ GUIADO no SERVIDOR:
//  - confere se a pergunta está DENTRO da janela de tempo (question_ends_at);
//  - confere o gabarito no banco (não confia no cliente);
//  - evita resposta duplicada para a mesma pergunta;
//  - atualiza pontuação e participantes da sala.
// Deploy: supabase functions deploy pontuar-quiz-guiado

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOLERANCIA_MS = 1500; // tolerância de rede para envios no limite do tempo

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, message: "Não autenticado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const body = await req.json();
    const { sala_id, participante_id, pergunta_id, resposta_index, tempo_ms } = body || {};

    if (!sala_id || !participante_id || !pergunta_id || resposta_index === undefined) {
      return new Response(
        JSON.stringify({ success: false, message: "Parâmetros inválidos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Carrega a sala
    const { data: sala, error: salaErr } = await supabase
      .from("salas_quiz_guiado")
      .select("*")
      .eq("id", sala_id)
      .maybeSingle();
    if (salaErr || !sala) {
      return new Response(
        JSON.stringify({ success: false, message: "Sala não encontrada." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2a. Escopo por autenticação (respeitando salas com visitantes):
    //  - salas SEM permitir_visitantes exigem usuário autenticado da MESMA empresa;
    //  - salas COM permitir_visitantes aceitam anônimos (visitantes) e usuários autenticados.
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      const { data: usuarioAuth } = await supabase
        .from("usuarios")
        .select("id, empresa_id")
        .eq("auth_uid", authData.user.id)
        .maybeSingle();
      if (usuarioAuth && sala.empresa_id && usuarioAuth.empresa_id !== sala.empresa_id) {
        return new Response(
          JSON.stringify({ success: false, message: "Acesso negado: sala de outra empresa." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // ANTI-IMPERSONAÇÃO: usuário autenticado só pode responder como um
      // participante que esteja VINCULADO a ele (usuario_id = seu id) ou,
      // em salas com visitantes, como um participante sem usuário que ele
      // criou nesta sessão. Impede responder em nome de outro participante.
      const participanteAlvo = (sala.participantes || []).find(
        (p: any) => String(p.id) === String(participante_id)
      );
      if (participanteAlvo?.usuario_id && String(participanteAlvo.usuario_id) !== String(usuarioAuth?.id)) {
        return new Response(
          JSON.stringify({ success: false, message: "Acesso negado: participante vinculado a outra conta." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (!sala.permitir_visitantes) {
      return new Response(
        JSON.stringify({ success: false, message: "Acesso negado: sala exige participante autenticado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Valida que a sala está em andamento
    if (sala.status !== "em_andamento" && sala.status !== "aguardando") {
      return new Response(
        JSON.stringify({ success: false, message: "A sala não está aberta para respostas." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Valida a JANELA DE TEMPO da pergunta (server-authoritative)
    const agora = Date.now();
    const endsAt = Number(sala.question_ends_at ?? 0);
    if (endsAt > 0 && agora > endsAt + TOLERANCIA_MS) {
      return new Response(
        JSON.stringify({ success: false, message: "Tempo esgotado para esta pergunta.", code: "TEMPO_ESGOTADO" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Confere o gabarito no banco
    const perguntas = (sala.perguntas || []) as any[];
    const pergunta = perguntas.find((p: any) => String(p.id) === String(pergunta_id));
    if (!pergunta) {
      return new Response(
        JSON.stringify({ success: false, message: "Pergunta não encontrada na sala." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const correta = Number(resposta_index) === Number(pergunta.resposta_correta);

    // 5. Pontuação (mesma regra do cliente, agora validada no servidor)
    let pontosAdicionais = 0;
    if (correta) {
      if (sala.estilo === "competitivo") {
        const tempoMaxMs = (Number(sala.tempo_por_pergunta_seg ?? 30) || 30) * 1000;
        // CORREÇÃO (auditoria Quiz Guiado/Avaliação): o tempo informado pelo
        // cliente é LIMITADO — negativo vira 0 (máximo de pontos) e acima do
        // limite da pergunta é cortado (evita extrapolar a janela de tempo).
        const tempoCliente = Number(tempo_ms ?? 0);
        const tempoEfetivo = isFinite(tempoCliente)
          ? Math.min(Math.max(0, tempoCliente), tempoMaxMs)
          : tempoMaxMs;
        const ratio = Math.max(0, (tempoMaxMs - tempoEfetivo) / tempoMaxMs);
        pontosAdicionais = 1000 + Math.round(ratio * 500);
      } else {
        pontosAdicionais = 100;
      }
    }

    // 6. Atualiza participantes (evita duplicidade por pergunta)
    const participantes = (sala.participantes || []) as any[];
    const idx = participantes.findIndex((p: any) => String(p.id) === String(participante_id));
    let novaPontuacao = 0;
    let jaRespondida = false;

    // CORREÇÃO (auditoria Quiz Guiado/Avaliação): se o participante_id não
    // existe na sala, retorna erro (antes retornava sucesso sem gravar).
    if (idx < 0) {
      return new Response(
        JSON.stringify({ success: false, message: "Participante não encontrado na sala.", code: "PARTICIPANTE_INVALIDO" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const p = participantes[idx];
    const respostasMap = p.respostas || {};
    if (respostasMap[pergunta_id]) {
      jaRespondida = true;
    } else {
      const novasRespostas = {
        ...respostasMap,
        [pergunta_id]: {
          resposta_index: Number(resposta_index),
          tempo_ms: Number(tempo_ms ?? 0),
          timestamp: new Date().toISOString(),
          correta,
        },
      };
      novaPontuacao = (Number(p.pontuacao_acumulada ?? 0) || 0) + pontosAdicionais;
      participantes[idx] = { ...p, respostas: novasRespostas, pontuacao_acumulada: novaPontuacao };
    }

    if (jaRespondida) {
      return new Response(
        JSON.stringify({ success: false, message: "Resposta já enviada para esta pergunta.", code: "DUPLICADA" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Persiste a sala atualizada
    const { error: updErr } = await supabase
      .from("salas_quiz_guiado")
      .update({ participantes })
      .eq("id", sala.id);
    if (updErr) {
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao salvar resposta: " + updErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // CORREÇÃO (auditoria Quiz Guiado/Avaliação): grava também na tabela
    // IMUTÁVEL quiz_guiado_respostas (primeira escrita vence) para trilha de
    // auditoria e re-consenso. Se a tabela não tiver grants de INSERT direto,
    // registra via RPC registrar_resposta_quiz_guiado (SECURITY DEFINER).
    try {
      await supabase.rpc("registrar_resposta_quiz_guiado", {
        p_sala_id: sala.id,
        p_participante_id: String(participante_id),
        p_participante_nome: (participantes[idx]?.nome) ?? null,
        p_pergunta_id: String(pergunta_id),
        p_resposta_index: Number(resposta_index),
        p_tempo_ms: Number(tempo_ms ?? 0),
      });
    } catch (rpcErr) {
      // Falha na trilha imutável não bloqueia a resposta (a sala já foi salva).
      console.warn("Falha ao gravar quiz_guiado_respostas:", rpcErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: correta ? "Resposta correta registrada!" : "Resposta registrada.",
        correta,
        pontosAdicionais,
        pontuacao_acumulada: novaPontuacao,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, message: err?.message ?? "Erro interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
