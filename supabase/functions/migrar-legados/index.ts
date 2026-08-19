// Edge Function: migrar-legados
// Migra usuários legados (que existem APENAS em public.usuarios com senha em
// texto puro) para o Supabase Auth (hash Bcrypt em auth.users), vinculando o
// auth_uid e permitindo o login com o mesmo e-mail/senha.
//
// SEGURANÇA:
//   - Requer um usuário autenticado cujo perfil seja 'super_admin' (o JWT é
//     validado ANTES de qualquer criação de conta);
//   - usa a chave service_role SOMENTE no servidor (nunca no navegador);
//   - cria a conta com email_confirm = true (evita o e-mail de confirmação
//     para contas legadas já em uso);
//   - NÃO apaga nem altera senha de texto puro automaticamente — apenas
//     adiciona a coluna auth_uid. A limpeza da coluna "senha" é opcional
//     (parametro removerSenha=false por padrão) e deve ser feita de forma
//     controlada após validação manual.
//
// Uso (somente super_admin autenticado):
//   POST /functions/v1/migrar-legados
//   Body: { "removerSenha": false }
//
// Deploy: supabase functions deploy migrar-legados

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

    // Cliente com service_role para administração do Auth (criação de contas).
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Valida o JWT do chamador e confere se é super_admin.
    const { data: caller, error: callerErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (callerErr || !caller?.user) {
      return new Response(
        JSON.stringify({ success: false, message: "Token inválido ou expirado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { data: perfil } = await admin
      .from("usuarios")
      .select("perfil")
      .eq("auth_uid", caller.user.id)
      .maybeSingle();
    if (!perfil || perfil.perfil !== "super_admin") {
      return new Response(
        JSON.stringify({ success: false, message: "Acesso negado: apenas super_admin pode migrar usuários." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const removerSenha = Boolean(body?.removerSenha);

    // 2. Lista usuários legados (sem auth_uid e com senha em texto puro).
    const { data: legados, error: listErr } = await admin
      .from("usuarios")
      .select("id, email, senha, nome, perfil, empresa_id")
      .is("auth_uid", null)
      .not("senha", "is", null)
      .neq("senha", "");
    if (listErr) {
      return new Response(
        JSON.stringify({ success: false, message: "Erro ao listar usuários legados: " + listErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const criados: { email: string; id?: string; erro?: string }[] = [];
    for (const u of legados || []) {
      // 3. Cria a conta no Auth com a mesma senha legada (hash Bcrypt).
      const { data: criado, error: createErr } = await admin.auth.admin.createUser({
        email: u.email,
        password: u.senha,
        email_confirm: true,
        user_metadata: { nome: u.nome, perfil: u.perfil, empresa_id: u.empresa_id },
      });
      if (createErr) {
        // Erro típico: e-mail já cadastrado no Auth (conta parcial).
        criados.push({ email: u.email, erro: createErr.message });
        continue;
      }
      // 4. Vincula o auth_uid ao perfil legado (via service_role, sem RLS).
      const { error: linkErr } = await admin
        .from("usuarios")
        .update({ auth_uid: criado.user?.id ?? null })
        .eq("id", u.id);
      if (linkErr) {
        criados.push({ email: u.email, id: criado.user?.id, erro: "auth criada, mas vínculo falhou: " + linkErr.message });
        continue;
      }
      // 5. Limpeza opcional da senha em texto puro (após vínculo bem-sucedido).
      if (removerSenha) {
        await admin.from("usuarios").update({ senha: "" }).eq("id", u.id);
      }
      criados.push({ email: u.email, id: criado.user?.id });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Migração concluída. ${criados.filter((c) => !c.erro).length} conta(s) criada(s) e vinculada(s).`,
        totalEncontrados: (legados || []).length,
        criados,
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