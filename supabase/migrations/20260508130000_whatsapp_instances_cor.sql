-- Adiciona coluna `cor` para identificação visual no seletor de instâncias.
alter table whatsapp_instances
  add column if not exists cor text;
