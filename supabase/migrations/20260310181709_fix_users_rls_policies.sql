
-- Remove políticas com recursão infinita
DROP POLICY IF EXISTS "admin_full_access" ON public.users;
DROP POLICY IF EXISTS "users_read_own" ON public.users;

-- Qualquer usuário autenticado pode ler seu próprio perfil
CREATE POLICY "users_read_own" ON public.users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Apenas admin pode ler todos (sem subquery recursiva — usa JWT metadata)
CREATE POLICY "admin_read_all" ON public.users
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'perfil') = 'admin'
    OR id = auth.uid()
  );

-- Apenas o próprio serviço pode inserir (via trigger)
CREATE POLICY "service_insert" ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());
