// Edge Function: pontuar-desafio
// Registra/valida as respostas de um DESAFIO 1V1 no SERVIDOR.
// O cliente envia apenas a alternativa escolhida + tempo; o gabarito é lido
// do banco. Evita forjar "correta: true" e vitórias.
// Deploy: supabase functions deploy pontuar-desafio

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const { desafio_id, user_id, respostas } = body || {};

    if (!desafio_id || !user_id || !Array.isArray(respostas)) {
      return new Response(
        JSON.stringify({ success: false, message: "Parâmetros inválidos: desafio_id, user_id e respostas são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Autentica o usuário (JWT) e resolve o usuário do app por auth_uid
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return new Response(
        JSON.stringify({ success: false, message: "Token inválido ou expirado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: usuario, error: usrErr } = await supabase
      .from("usuarios")
      .select("id, empresa_id")
      .eq("auth_uid", authData.user.id)
      .maybeSingle();
    if (usrErr || !usuario) {
      return new Response(
        JSON.stringify({ success: false, message: "Usuário não encontrado ou não vinculado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Só o próprio usuário pode submeter as próprias respostas
    if (String(user_id) !== String(usuario.id)) {
      return new Response(
        JSON.stringify({ success: false, message: "Acesso negado: user_id não corresponde ao usuário autenticado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Carrega o desafio
    const { data: desafio, error: dsfErr } = await supabase
      .from("desafios_1v1")
      .select("*")
      .eq("id", desafio_id)
      .maybeSingle();
    if (dsfErr || !desafio) {
      return new Response(
        JSON.stringify({ success: false, message: "Desafio não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Escopo: o desafio deve pertencer à MESMA empresa do usuário
    if (desafio.empresa_id !== usuario.empresa_id) {
      return new Response(
        JSON.stringify({ success: false, message: "Acesso negado: desafio de outra empresa." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Já concluído não pode pontuar de novo
    if (desafio.status === "concluido") {
      return new Response(
        JSON.stringify({ success: false, message: "Desafio já concluído. Pontuação ignorada." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Confirma que o user participa do desafio
    const isDesafiante = String(user_id) === String(desafio.desafiante_id);
    const isDesafiado = String(user_id) === String(desafio.desafiado_id);
    if (!isDesafiante && !isDesafiado) {
      return new Response(
        JSON.stringify({ success: false, message: "Usuário não participa deste desafio." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Valida cada resposta contra o gabarito (perguntas no banco)
    const perguntasDoDesafio = (desafio.perguntas || []) as any[];
    const respostasValidadas = respostas.map((r: any) => {
      const pergunta = perguntasDoDesafio.find((p: any) => p.id === r.pergunta_id);
      const correta = pergunta ? Number(r.alternativa_escolhida) === Number(pergunta.resposta_correta) : false;
      return {
        pergunta_id: r.pergunta_id,
        alternativa_escolhida: r.alternativa_escolhida,
        correta,
        tempo_resposta_segundos: Number(r.tempo_resposta_segundos ?? 0),
      };
    });

    // 5. Mescla com as respostas já registradas do outro jogador
    const coluna = isDesafiante ? "respostas_desafiante" : "respostas_desafiado";
    const colunaOposta = isDesafiante ? "respostas_desafiado" : "respostas_desafiante";
    const existentesOpostas = desafio[colunaOposta] || [];
    const minhasAtualizadas = respostasValidadas;

    // 6. Persiste as respostas validadas
    const { error: updErr } = await supabase
      .from("desafios_1v1")
      .update({ [coluna]: minhasAtualizadas })
      .eq("id", desafio.id);
    if (updErr) {
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao salvar respostas: " + updErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totalPerguntas = perguntasDoDesafio.length || 5;
    const ambosConcluiram = minhasAtualizadas.length >= Math.min(5, totalPerguntas) &&
      existentesOpostas.length >= Math.min(5, totalPerguntas);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Respostas validadas e salvas no servidor.",
        respostasValidadas,
        ambosConcluiram,
        // A avaliação final do vencedor acontece quando os DOIS terminarem;
        // o cliente usa estes dados validados para o desempate local.
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
