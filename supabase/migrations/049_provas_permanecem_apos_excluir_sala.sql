-- ============================================================
-- 049_provas_permanecem_apos_excluir_sala.sql
-- ------------------------------------------------------------
-- GARANTIAS:
--
-- 1. Excluir uma sala NUNCA pode apagar as provas (laudos). Se o FK
--    resultados_avaliacao_sst.sala_id → salas_quiz_guiado.id estiver como
--    ON DELETE CASCADE no banco, os laudos eram DESTRUÍDOS junto. Aqui
--    forçamos ON DELETE SET NULL (a prova permanece, apenas perde o vínculo
--    com a sala).
--
-- 2. Após a sala ser excluída, as policies antigas de leitura/update faziam
--    JOIN com salas_quiz_guiado — sem a sala, os laudos "desapareciam" da
--    nuvem para quem aplicou. Criamos políticas de AUTORIA DIRETA usando as
--    colunas instrutor_id/empresa_id do próprio laudo.
-- ============================================================

-- 1. Força ON DELETE SET NULL no vínculo sala → provas (idempotente)
DO $$
DECLARE
  v_constraint TEXT;
  v_on_delete TEXT;
BEGIN
  -- Coluna correta do catálogo: pg_constraint.confdeltype
  -- ('a'=NO ACTION, 'r'=RESTRICT, 'c'=CASCADE, 'n'=SET NULL, 'd'=SET DEFAULT)
  SELECT conname, confdeltype::text INTO v_constraint, v_on_delete
  FROM pg_constraint
  WHERE conrelid = 'public.resultados_avaliacao_sst'::regclass
    AND contype = 'f'
    AND pg_get_constraintdef(oid) LIKE '%salas_quiz_guiado%'
  LIMIT 1;

  IF v_constraint IS NULL THEN
    -- Sem FK: cria já com SET NULL
    ALTER TABLE public.resultados_avaliacao_sst
      ADD CONSTRAINT fk_resultados_sala_setnull
      FOREIGN KEY (sala_id) REFERENCES public.salas_quiz_guiado(id)
      ON DELETE SET NULL;
    RAISE NOTICE 'FK criada com ON DELETE SET NULL';
  ELSIF v_on_delete <> 'n' THEN
    -- Códigos: 'a'=NO ACTION, 'r'=RESTRICT, 'c'=CASCADE, 'n'=SET NULL,
    -- 'd'=SET DEFAULT. Só recria se NÃO for SET NULL ('n').
    EXECUTE format('ALTER TABLE public.resultados_avaliacao_sst DROP CONSTRAINT %I', v_constraint);
    ALTER TABLE public.resultados_avaliacao_sst
      ADD CONSTRAINT fk_resultados_sala_setnull
      FOREIGN KEY (sala_id) REFERENCES public.salas_quiz_guiado(id)
      ON DELETE SET NULL;
    RAISE NOTICE 'FK % recriada com ON DELETE SET NULL (antes: %)', v_constraint, v_on_delete;
  ELSE
    RAISE NOTICE 'FK já está com ON DELETE SET NULL — nada a fazer';
  END IF;
END $$;

-- 2. Leitura por AUTORIA DIRETA (funciona mesmo sem a sala existir mais)
DROP POLICY IF EXISTS "Resultados Leitura Autor" ON public.resultados_avaliacao_sst;
CREATE POLICY "Resultados Leitura Autor" ON public.resultados_avaliacao_sst
  FOR SELECT USING (
    public.is_super_admin()
    OR instrutor_id = public.usuario_id_atual()
    OR empresa_id = public.user_empresa_id()
    OR participante_id = public.usuario_id_atual()
  );
