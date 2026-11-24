import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createPasswordChangeHandler } from './handler.ts'

const url=Deno.env.get('SUPABASE_URL')!
const anonKey=Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
Deno.serve(createPasswordChangeHandler({
  url,anonKey,serviceKey,fetch:globalThis.fetch,
  userClient: authorization=>createClient(url,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}}),
  admin:createClient(url,serviceKey,{auth:{persistSession:false}}),
}))
