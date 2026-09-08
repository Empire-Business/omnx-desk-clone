-- Permite que usuários com perfil 'atendimento' também gerenciem
-- pipelines, etapas e checkboxes (não apenas admin/gerente).

DROP POLICY IF EXISTS sales_pipelines_write ON sales_pipelines;
CREATE POLICY sales_pipelines_write ON sales_pipelines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente','atendimento')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente','atendimento')));

DROP POLICY IF EXISTS sales_stages_write ON sales_stages;
CREATE POLICY sales_stages_write ON sales_stages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente','atendimento')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente','atendimento')));

DROP POLICY IF EXISTS sales_stage_checklist_items_write ON sales_stage_checklist_items;
CREATE POLICY sales_stage_checklist_items_write ON sales_stage_checklist_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente','atendimento')))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND perfil IN ('admin','gerente','atendimento')));
