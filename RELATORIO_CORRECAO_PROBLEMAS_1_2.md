# RELATÓRIO DE CORREÇÃO — PROBLEMAS DE PRODUÇÃO DO QUIZ GUIADO
## Respostas corretas marcadas como erradas + Participante travado na tela "Iniciar" (2ª sessão)

**Data:** 16/08/2026
**Ambiente:** projeto Supabase `vsnilfdvmfhotvrwtiln` (migrations 001–036 aplicadas) + servidor Express local na porta 3000 (build novo)
**Status:** ✅ corrigidos e validados (testes 142/142, lint, build)

---

## 1. RESUMO EXECUTIVO

| Critério | Status |
|---|---|
| **Problema 1** — respostas corretas marcadas como erradas | ✅ CORRIGIDO (causa raiz: sobrescrita do gabarito) |
| **Problema 2** — participante travado na tela "Iniciar" ao reiniciar a sala | ✅ CORRIGIDO (causa raiz: PIN novo não aceito no servidor + merge de participantes antigos + falha silenciosa) |
| Build / lint / testes | ✅ 142/142 testes, `tsc --noEmit`, build OK |
| Migrations novas aplicadas na nuvem | ✅ 035 e 036 |
| Servidor Express | ✅ reiniciado com `dist/server.cjs` (health 200) |

---

## 2. PROBLEMA 1 — RESPOSTAS CORRETAS MARCADAS COMO ERRADAS

### Causa raiz
1. O participante recebe a sala **SANITIZADA** (sem `resposta_correta`/`explicacao`) — via view `vw_salas_quiz_guiado_publica` ou Express.
2. Ao entrar e ao responder, o participante enviava a sala **inteira** de volta ao Supabase (`upsertSalaQuizGuiado`), **SOBRESCREVENDO `perguntas[].resposta_correta` com `undefined`** no banco.
3. Depois disso, a Edge Function `pontuar-quiz-guiado` e o RPC `registrar_resposta_quiz_guiado` validavam contra `sala.perguntas[].resposta_correta` que virara `undefined` → `Number(undefined) = NaN` → `correta` sempre `false`.
4. Fallback local (`respostaIndex === pergunta.resposta_correta`) também falhava: o participante tem a sala sanitizada, então `pergunta.resposta_correta` é `undefined`.

### Correções aplicadas
| Arquivo | O que mudou |
|---|---|
| `supabase/migrations/035_atualizar_participante_sala.sql` (novo) | RPC `atualizar_participante_sala` (SECURITY DEFINER) que atualiza **apenas** `participantes`, preservando `perguntas` (gabarito). |
| `supabase/migrations/036_fix_atualizar_participante_sala_upsert.sql` (novo) | Recrea o RPC como **UPSERT**: adiciona o participante quando ele ainda não existe (sem substituir perguntas). |
| `src/services/supabaseService.ts` | Novo método `atualizarParticipanteSala` + `upsertSalaQuizGuiado(sala, { somenteExpress })` — o participante NÃO sobrescreve mais o Supabase. |
| `src/context/SSTContext.tsx` | Entrada/reconexão/resposta do participante passam a: (a) gravar no Supabase via RPC seguro; (b) enviar ao Express somente (`somenteExpress: true`) para o polling. |
| `src/context/SSTContext.tsx` | `submeterRespostaQuizGuiado`: quando a Edge Function falha, usa o retorno do RPC `registrar_resposta_quiz_guiado` (valida contra o gabarito do banco) — eliminando o fallback local corrompido. |

### Validação no banco real
- Sala com 5 perguntas, `resposta_correta` presente e `explicacao` presente (gabarito íntegro).
- `SELECT atualizar_participante_sala(...)` com participante novo → `success:true` (upsert).
- Após o upsert: `gab_p0 = 0`, `tem_expl = true`, participante adicionado → **gabarito preservado**.
- Limpeza do participante de teste (sala restaurada ao estado original).

---

## 3. PROBLEMA 2 — PARTICIPANTE TRAVADO NA TELA "INICIAR" AO REINICIAR A SALA

### Causas raiz (3 fatores combinados)
1. **Servidor Express mantinha o PIN antigo** (`server.ts:322` → `salaFinal.pin = existente.pin`): quando o instrutor reiniciava a sala, `reiniciarSalaQuizGuiado` gerava um **novo PIN** e **novo `sessao_id`**, mas o Express preservava o PIN antigo. O participante visitante (sem JWT) dependia do Express para achar a sala por PIN → PIN novo não era encontrado → `entrarNaSalaQuizGuiado` retornava `success:false`.
2. **Falha SILENCIOSA** no `PainelParticipante`: `handleEntrarComNome` só salvava o id em caso de sucesso — **sem mensagem de erro**, o participante clicava em "CONFIRMAR E ENTRAR" e nada acontecia (travado na tela "Iniciar").
3. **Merge de participantes da sessão anterior**: o merge do polling (Express) e do Realtime (Supabase) re-adicionava os participantes LOCAIS da sessão antiga quando o `sessao_id` mudava — o participante "fantasma" da 1ª sessão podia ser reutilizado por nome na 2ª sessão.

### Correções aplicadas
| Arquivo | O que mudou |
|---|---|
| `server.ts` | `POST /api/salas_quiz_guiado`: detecta **reinício** quando o `sessao_id` enviado difere do existente → aceita o **novo PIN**, novo `sessao_id`, zera participantes/pergunta/estado, mas **sempre preserva o gabarito** e os metadados do instrutor. Upsert comum (mesma sessão) continua preservando PIN e não regredindo progresso. |
| `src/components/views/quizGuiado/PainelParticipante.tsx` | `handleEntrarComNome` agora captura `res.success === false` e exceções e **exibe a mensagem de erro** (`erroEntrada`) no formulário de identificação. |
| `src/context/SSTContext.tsx` | Merge do polling e do Realtime: quando `sessao_id` mudou (sala reiniciada), **não mescla participantes locais da sessão antiga** — elimina o participante "fantasma". |

### Validação no servidor real (E2E)
1. Sala criada (`sess-A`, PIN `900111`) → PIN responde, gabarito NÃO exposto na resposta.
2. Participante Ana entrou na sessão A.
3. Instrutor reiniciou → `sess-B`, PIN `900112`, participantes zerados.
4. Novo PIN (`900112`) responde: `sessao=sess-B`, `status=aguardando`, `qtd_part=0`.
5. PIN antigo (`900111`) → **404** (não responde mais).
6. Sala de teste removida; Express sem salas residuais.

---

## 4. ARQUIVOS ALTERADOS

| Arquivo | Tipo de mudança |
|---|---|
| `supabase/migrations/035_atualizar_participante_sala.sql` | Novo (RPC seguro) |
| `supabase/migrations/036_fix_atualizar_participante_sala_upsert.sql` | Novo (RPC upsert) |
| `server.ts` | Correção do reinício (novo PIN aceito) |
| `src/services/supabaseService.ts` | Novo método `atualizarParticipanteSala`; `upsertSalaQuizGuiado` com `somenteExpress` |
| `src/context/SSTContext.tsx` | Entrada/reconexão/resposta via RPC; validação server-side via RPC como fallback; merge por sessão |
| `src/components/views/quizGuiado/PainelParticipante.tsx` | Feedback de erro na identificação |
| `tests/serverRoutes.test.ts` | Novo teste: reinício aceita novo PIN/PIN preservando gabarito |

---

## 5. VALIDAÇÃO FINAL

- `npm run lint` → ✅ (`tsc --noEmit` sem erros)
- `npm test` → ✅ **142/142** (1 novo teste de reinício)
- `npm run build` → ✅ (`dist/server.cjs` gerado)
- Servidor Express reiniciado na porta 3000 com o build novo → health `200`
- Migrations 035 e 036 aplicadas na nuvem (`supabase migration list` confirma 001–036)

---

## 6. PENDÊNCIAS / RECOMENDAÇÕES

1. **Teste manual em 2 dispositivos** (instrutor + participante) no mesmo Wi-Fi: criar sala → participar → responder → reiniciar → novo PIN → participar de novo → verificar que a 1ª resposta não aparece como errada e que ninguém fica preso na tela "Iniciar".
2. As salas **criadas antes** desta correção já tinham gabarito íntegro no banco (verificado nas 2 salas existentes) — nenhuma ação de reparo de dados foi necessária.
3. **Semântica de `sessao_id`**: após reinício, é gerado um novo `sessao_id` e novo PIN; o QR/URL antigo não responde mais (comportamento correto).

---

## 7. CONCLUSÃO

Ambos os problemas reportados foram **corrigidos na causa raiz** e validados no banco Supabase real e no servidor Express real:
- **P1 (respostas corretas erradas):** o gabarito não é mais sobrescrito pelo participante; a validação é sempre server-side contra o gabarito do banco.
- **P2 (travado na tela "Iniciar"):** o novo PIN do reinício é aceito pelo servidor; a falha de entrada agora exibe motivo; participantes da sessão anterior não "fantasmam" a nova sessão.

**Testes 142/142, lint e build OK.**
