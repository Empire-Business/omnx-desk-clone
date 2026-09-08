-- Fase C.5 — empresa nova nasce com a própria estrutura organizacional.
--
-- Até agora `company_areas`, `subareas` e `positions` eram lidas com USING(true),
-- então um tenant novo "pegava emprestado" o organograma da Aliança. Fechado o
-- isolamento (C.1), ele passaria a ver zero cargos e a tela de colaboradores
-- ficaria vazia. Aqui o seed passa a clonar a estrutura do mestre como ponto de
-- partida — cópia própria, que o tenant edita sem afetar ninguém.

CREATE OR REPLACE FUNCTION public.seed_tenant(p_tenant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_master uuid;
BEGIN
  SELECT id INTO v_master FROM public.tenants WHERE is_master LIMIT 1;
  IF p_tenant_id IS NULL OR p_tenant_id = v_master THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contratos_kanban_colunas WHERE tenant_id = p_tenant_id) THEN
    INSERT INTO public.contratos_kanban_colunas (titulo, status_chave, cor, ordem, is_onboarding, tenant_id)
    SELECT titulo, status_chave, cor, ordem, is_onboarding, p_tenant_id
    FROM public.contratos_kanban_colunas
    WHERE tenant_id = v_master;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.chat_departments WHERE tenant_id = p_tenant_id) THEN
    INSERT INTO public.chat_departments (nome, ativo, tenant_id) VALUES
      ('Suporte', true, p_tenant_id),
      ('Estrategista', true, p_tenant_id);
  END IF;

  -- Organograma: áreas -> subáreas -> cargos, com os ids remapeados.
  IF NOT EXISTS (SELECT 1 FROM public.company_areas WHERE tenant_id = p_tenant_id) THEN
    CREATE TEMP TABLE _map_area  (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    CREATE TEMP TABLE _map_sub   (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;
    CREATE TEMP TABLE _map_pos   (old_id uuid PRIMARY KEY, new_id uuid) ON COMMIT DROP;

    INSERT INTO _map_area (old_id, new_id)
    SELECT id, gen_random_uuid() FROM public.company_areas WHERE tenant_id = v_master;

    INSERT INTO public.company_areas (id, tenant_id, name, type, position, color, sort_order)
    SELECT m.new_id, p_tenant_id, a.name, a.type, a.position, a.color, a.sort_order
    FROM public.company_areas a JOIN _map_area m ON m.old_id = a.id
    WHERE a.tenant_id = v_master;

    INSERT INTO _map_sub (old_id, new_id)
    SELECT id, gen_random_uuid() FROM public.subareas WHERE tenant_id = v_master;

    INSERT INTO public.subareas (id, tenant_id, area_id, name, color, sort_order)
    SELECT m.new_id, p_tenant_id, ma.new_id, s.name, s.color, s.sort_order
    FROM public.subareas s
    JOIN _map_sub m ON m.old_id = s.id
    JOIN _map_area ma ON ma.old_id = s.area_id
    WHERE s.tenant_id = v_master;

    INSERT INTO _map_pos (old_id, new_id)
    SELECT id, gen_random_uuid() FROM public.positions WHERE tenant_id = v_master;

    INSERT INTO public.positions (
      id, tenant_id, subarea_id, area_id, title, description,
      responsibilities, goals, level, sort_order
    )
    SELECT mp.new_id, p_tenant_id, ms.new_id, ma.new_id, p.title, p.description,
           p.responsibilities, p.goals, p.level, p.sort_order
    FROM public.positions p
    JOIN _map_pos mp ON mp.old_id = p.id
    LEFT JOIN _map_sub ms ON ms.old_id = p.subarea_id
    LEFT JOIN _map_area ma ON ma.old_id = p.area_id
    WHERE p.tenant_id = v_master;

    -- hierarquia (reports_to) numa 2ª passada, já com todos os cargos criados
    UPDATE public.positions np
       SET reports_to_id = mchefe.new_id
      FROM public.positions op
      JOIN _map_pos mp ON mp.old_id = op.id
      JOIN _map_pos mchefe ON mchefe.old_id = op.reports_to_id
     WHERE op.tenant_id = v_master
       AND op.reports_to_id IS NOT NULL
       AND np.id = mp.new_id;
  END IF;
END;
$function$;
