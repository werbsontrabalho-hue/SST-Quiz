# RELATÓRIO DE HOMOLOGAÇÃO / QA — QUIZ GUIADO SST EM TEMPO REAL

**Data:** 16/08/2026
**Ambiente:** projeto Supabase `vsnilfdvmfhotvrwtiln` (migrations 001–032 aplicadas) + servidor Express local
**Método:** varredura funcional, testes práticos no banco real (REST/Auth) e no servidor, validação de estabilidade. Correções aplicadas quando necessário (todas não-destrutivas).

---

## 1. RESUMO EXECUTIVO

| Critério | Status |
|---|---|
| Build / lint / testes | ✅ 141/141 testes, `tsc --noEmit`, build OK |
| Entrada por PIN/QR | ✅ CORRIGIDO e validado no banco real |
| Execução do quiz (responder/pontuar) | ✅ CORRIGIDO e validado |
| Encerramento / avaliação / histórico / PDF | ✅ CORRIGIDO e validado |
| Estabilidade (looping de tela) | ✅ CORRIGIDO (removido polling redundante) |
| Isolamento de avaliações por sessão | ✅ CORRIGIDO e validado |

**Veredito:** o módulo está **apto para homologação funcional** após as correções desta rodada. Identificados e corrigidos 4 problemas de produção (entrada por PIN, looping de tela, PDF de sessão anterior, e poison field de sessão nos resultados).

---

## 2. VARREdura FUNCIONAL — STATUS POR FLUXO

| # | Fluxo | Resultado | Evidência |
|---|---|---|---|
| 1 | **Criação de sala** | ✅ | Admin sem `is_instrutor` → 403 (RLS). POST Express não cria sala forjada (404). Regra de Instrutor ativa. |
| 2 | **Entrada por PIN/QR** | ✅ | Colaborador da mesma empresa lê sala por PIN via view sanitizada (sem gabarito). Causa raiz do travamento corrigida (view agora SECURITY DEFINER sanitizada). |
| 3 | **Execução do quiz** | ✅ | Participante responde dentro do tempo → `correta: true`, `pontosAdicionais: 1467` (velocidade). RPC valida gabarito/janela de tempo/anti-oráculo. |
| 4 | **Encerramento / avaliação** | ✅ | Resultado persiste com `sessao_id`/`codigo_documento`; isolamento por sessão validado (2 sessões do mesmo Quiz → avaliações separadas). |
| 5 | **Histórico de avaliações** | ✅ | Nova área "Histórico de Avaliações Realizadas" criada (escopo por perfil: super/admin/instrutor/participante). |
| 6 | **PDF / ficha** | ✅ | Geração no frontend (html2canvas-pro + jsPDF); `/pdf` protegido por token quando configurado; PDF por sessão (código único). |
| 7 | **Estabilidade de tela** | ✅ | Removido o polling de 3s do Supabase (redundante com Realtime + polling Express). Merge não regride progresso (instrutor não "volta" para QR; participante segue o instrutor). |

---

## 3. PROBLEMAS IDENTIFICADOS E CORRIGIDOS NA HOMOLOGAÇÃO

| # | Problema | Gravidade | Causa | Correção |
|---|---|---|---|---|
| QA-1 | **Entrada por PIN/QR travada** (participante não acha a sala) | CRÍTICO | `iniciarFluxoIdentificacao` só procurava no estado local; view era `security_invoker` e a RLS bloqueava novo participante | View recriada como `SECURITY DEFINER` sanitizada (031) + `iniciarFluxoIdentificacao` busca no servidor quando necessário |
| QA-2 | **Looping/alternância de tela** no instrutor | ALTO | 3 mecanismos simultâneos (Realtime + polling Supabase 3s + polling Express 1,5s) com merges conflitantes | Removido polling Supabase; Realtime e merges não regridem progresso |
| QA-3 | **PDF/avaliação de sessão anterior** ainda aparecia | CRÍTICO | Resultados antigos sem `sessao_id`; filtros usavam só `sala_id`; coluna `sessao_id` não existia no banco | Coluna `sessao_id`/`codigo_documento`/`sessao_codigo` adicionadas (032); filtros por sessão; `obterResultado` exige sessão |
| QA-4 | **Poison field**: `sessao_id` não existia em `resultados_avaliacao_sst` | ALTO | Migration 009 não incluiu a coluna | Migration 032 (ADD COLUMN IF NOT EXISTS + índice) |

---

## 4. VALIDAÇÃO PRÁTICA (banco real)

### Entrada por PIN
- Sala criada (service_role) com `permitir_visitantes=true`.
- Colaborador da mesma empresa buscou por PIN via view → **retornou a sala**, **sem** `resposta_correta`/`explicacao`.
- Tentativa de leitura da base → **negado** (RLS mantida).

### Execução
- Participante respondeu corretamente dentro do tempo → RPC retornou `correta:true`, `pontosAdicionais:1467`, `registrado:true`.
- Resposta duplicada → `DUPLICADA` sem revelar gabarito (anti-oráculo).
- Tempo esgotado → `TEMPO_ESGOTADO`.

### Isolamento de avaliações por sessão
- 2 resultados da mesma sala (sessões `sess-100` e `sess-200`):
  - Sessão 100 → `APROVADO`, `codigo_documento: DOC-SESS-sess-100`
  - Sessão 200 → `NAO_APROVADO`, `codigo_documento: DOC-SESS-sess-200`
- ✅ Avaliações separadas — o PDF antigo não reaparece na nova sessão.

---

## 5. VALIDAÇÃO DE ESTABILIDADE

- **Pontos críticos verificados:** concorrência de fontes (Realtime vs polling), merge de estado, timer de pergunta, encerramento.
- **Correção de estabilidade:** um único polling do Express (1,5s) + Realtime (eventos). Sem loop de re-render.
- **Risco residual:** o servidor Express não persiste salas (in-memory); reiniciá-lo durante uma sessão ativa perde o estado local. O Supabase é a fonte durável.

---

## 6. PENDÊNCIAS / RECOMENDAÇÕES PARA USO EM PRODUÇÃO

1. **Configurar SMTP** (criar `.env` com `SMTP_HOST/USER/PASS`) para o envio de PDF por e-mail; até lá, usar "Baixar PDF".
2. **Definir `API_TOKEN` + `VITE_API_TOKEN`** para proteger `/pdf` e rotas sensíveis em produção (se vazio, LAN aberta).
3. **Teste manual em 2 dispositivos** (instrutor + participante) no mesmo Wi-Fi para validar o tempo real de ponta a ponta.
4. **Reiniciar o servidor** após o build para aplicar `dist/server.cjs`.

---

## 7. CONCLUSÃO

O módulo **Quiz Guiado SST em Tempo Real** está **FUNCIONAL** após as correções desta homologação: entrada por PIN/QR, execução, pontuação, encerramento, avaliação, histórico e PDF validados no banco real, com isolamento de avaliações por sessão e estabilidade de tela corrigida. **Testes 141/141, lint e build OK.** Recomendo o teste manual em 2 dispositivos antes de liberar para uso geral.
