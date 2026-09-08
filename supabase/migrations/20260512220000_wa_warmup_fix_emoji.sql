-- Correção: remove emoji 🦅 (águia/gavião, símbolo do Corinthians) que foi
-- usado por engano nas personalidades e frases. Símbolo do Vasco é a Cruz de
-- Malta — usar ⚓ (Vasco é clube náutico) ou apenas as cores ⚫⚪.

update public.wa_warmup_groups
   set personalidades = replace(personalidades::text, '🦅', '⚓')::jsonb,
       frases         = replace(frases::text,         '🦅', '⚓')::jsonb,
       proxima_mensagem_em = null
 where nome = 'Teste';
