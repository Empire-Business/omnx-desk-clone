-- Renomeia instâncias UAZAPI para padrão "Suporte N" / "Financeiro 1".
-- Suporte 1 foi recriada no UAZAPI (instance_id mudou de SuporteEB → Suporte1).
-- As outras 3 mantêm instance_id antigo até confirmação.

-- Suporte 1 (recriada): atualiza linha antiga SuporteEB para apontar pro novo instance_id.
update whatsapp_instances
   set nome = 'Suporte 1',
       instance_id = 'Suporte1',
       numero_whatsapp = '5521972869214',
       ativo = true
 where instance_id = 'SuporteEB';

update whatsapp_instances
   set nome = 'Financeiro 1',
       numero_whatsapp = '5511945266344',
       ativo = true
 where instance_id = 'Financeiro1';

update whatsapp_instances
   set nome = 'Suporte 2',
       numero_whatsapp = '5511942856707',
       ativo = true
 where instance_id = 'Cami';

update whatsapp_instances
   set nome = 'Suporte 3',
       numero_whatsapp = '5511551951461',
       ativo = true
 where instance_id = 'empire3';

-- Desativa instância antiga "DESK" (substituída por empire3 → Suporte 3).
update whatsapp_instances
   set ativo = false
 where instance_id = 'DESK';

-- Suporte 4: instância nova criada no UAZAPI.
insert into whatsapp_instances (nome, instance_id, numero_whatsapp, ativo, status)
     values ('Suporte 4', 'Suporte4', '551151979967', true, 'conectado')
on conflict (instance_id) do update
        set nome = excluded.nome,
            numero_whatsapp = excluded.numero_whatsapp,
            ativo = true,
            status = 'conectado';
