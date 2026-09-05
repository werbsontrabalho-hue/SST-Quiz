// Edge Function: pontuar-quiz
// Valida as respostas de um quiz DIÁRIO no SERVIDOR (gabarito no banco),
// calcula a pontuação e atualiza quiz + estatísticas do usuário de forma
// atômica. O cliente NÃO informa pontosGanhos nem correta.
// Deploy: supabase functions deploy pontuar-quiz

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
    const { quiz_id, respostas } = body || {};

    if (!quiz_id || !Array.isArray(respostas)) {
      return new Response(
        JSON.stringify({ success: false, message: "Parâmetros inválidos: quiz_id e respostas são obrigatórios." }),
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

    // 2. Carrega o quiz
    const { data: quiz, error: quizErr } = await supabase
      .from("quizzes")
      .select("*")
      .eq("id", quiz_id)
      .maybeSingle();
    if (quizErr || !quiz) {
      return new Response(
        JSON.stringify({ success: false, message: "Quiz não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Escopo: só o dono do quiz, da mesma empresa, pode pontuá-lo
    if (String(quiz.colaborador_id) !== String(usuario.id) || quiz.empresa_id !== usuario.empresa_id) {
      return new Response(
        JSON.stringify({ success: false, message: "Acesso negado: quiz não pertence a este usuário/empresa." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Rejeita quiz já concluído (evita pontuação dupla)
    if (quiz.status === "concluido") {
      return new Response(
        JSON.stringify({ success: false, message: "Quiz já concluído. Pontuação ignorada." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Carrega empresa (configurações de pontos)
    const { data: empresa } = await supabase
      .from("empresas")
      .select("configuracoes")
      .eq("id", quiz.empresa_id)
      .maybeSingle();
    const config = empresa?.configuracoes || {};
    const pontosPorAcerto = Number(config.pontosPorAcertoQuiz ?? 10);
    const maxBonusVel = Number(config.bonusVelocidadeMax ?? 3);
    const maxBonusStreak = Number(config.bonusStreakMax ?? 10);

    // 4. Carrega usuário (para streak)
    const { data: userData } = await supabase
      .from("usuarios")
      .select("estatisticas")
      .eq("id", quiz.colaborador_id)
      .maybeSingle();
    const streak = userData?.estatisticas?.streak_dias ?? 0;

    const perguntasDoQuiz = (quiz.perguntas || []) as any[];
    const detalhesValidados: any[] = [];
    let pontos = 0;
    let acertos = 0;
    let erros = 0;

    for (const r of respostas || []) {
      const pergunta = perguntasDoQuiz.find((p: any) => p.id === r.pergunta_id);
      if (!pergunta) continue;
      const eCorreta = Number(r.resposta_escolhida) === Number(pergunta.resposta_correta);
      let pontosPergunta = 0;
      const tempoSeg = Number(r.tempo_gasto_segundos ?? 0);
      const tempoLimite = Number(pergunta.tempo_limite_segundos ?? 30) || 30;

      if (eCorreta) {
        pontosPergunta += pontosPorAcerto;
        // Bônus de velocidade (client já validou o tempo; aqui reconfirma)
        const pctSobra = tempoLimite > 0 ? Math.max(0, (tempoLimite - tempoSeg) / tempoLimite) : 0;
        if (maxBonusVel > 0) {
          if (pctSobra >= 0.75) pontosPergunta += Math.round(maxBonusVel);
          else if (pctSobra >= 0.5) pontosPergunta += Math.max(1, Math.round(maxBonusVel * 0.66));
          else if (pctSobra >= 0.25) pontosPergunta += Math.max(1, Math.round(maxBonusVel * 0.33));
        }
        // Bônus de streak
        if (maxBonusStreak > 0) {
          if (streak >= 15) pontosPergunta += Math.round(maxBonusStreak);
          else if (streak >= 7) pontosPergunta += Math.max(1, Math.round(maxBonusStreak * 0.5));
          else if (streak >= 3) pontosPergunta += Math.max(1, Math.round(maxBonusStreak * 0.2));
        }
        acertos++;
      } else {
        erros++;
      }
      pontos += pontosPergunta;
      detalhesValidados.push({
        pergunta_id: pergunta.id,
        resposta_escolhida: r.resposta_escolhida,
        correta: eCorreta,
        tempo_gasto_segundos: tempoSeg,
        pontos_ganhos: pontosPergunta,
      });
    }

    // 5. Grava o resultado numa ÚNICA transação (RPC idempotente)
    const stats = userData?.estatisticas || {};
    const novos = {
      ...stats,
      pontos_quizzes: (Number(stats.pontos_quizzes ?? 0) || 0) + pontos,
      pontos_totais: (Number(stats.pontos_totais ?? 0) || 0) + pontos,
      pontos_resgataveis: (Number(stats.pontos_resgataveis ?? stats.pontos_totais ?? 0) || 0) + pontos,
      quizzes_respondidos: (Number(stats.quizzes_respondidos ?? 0) || 0) + 1,
      acertos_totais: (Number(stats.acertos_totais ?? 0) || 0) + acertos,
      erros_totais: (Number(stats.erros_totais ?? 0) || 0) + erros,
    };
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("pontuar_quiz", {
      p_quiz_id: quiz.id,
      p_pontos: pontos,
      p_acertos: acertos,
      p_erros: erros,
      p_detalhes: detalhesValidados,
      p_novas_estatisticas: novos,
    });
    if (rpcErr) {
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao salvar resultado: " + rpcErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!rpcRes?.updated) {
      return new Response(
        JSON.stringify({ success: false, message: "Quiz já concluído. Pontuação ignorada." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Quiz validado e pontuado no servidor.",
        pontos,
        acertos,
        erros,
        detalhesValidados,
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
