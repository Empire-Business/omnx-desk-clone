// JWT de usuário validado pelo handler; service_role preservado para os bots existentes.
import { servirComLicenca } from '../_shared/htai-licenca.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createSendMessageHandler } from './handler.ts'

servirComLicenca(createSendMessageHandler({
  createClient,
  env: key => Deno.env.get(key),
  fetch,
}))
