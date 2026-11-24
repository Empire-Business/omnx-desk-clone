import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createPasswordChangeHandler } from './handler.ts'

const USER='00000000-0000-4000-8000-000000000001'
const SESSION='00000000-0000-4000-8000-000000000002'
const GENERATION='00000000-0000-4000-8000-000000000003'
const OTHER='00000000-0000-4000-8000-000000000004'
const TEST_KEY='fixture-only-no-real-secret'
const PASSWORD='fixture-pass-only'
const HEADER='Bearer fixture-user-session'
const NOW=Date.parse('2026-11-05T12:00:00Z')

type Row={user_id:string;requirement_id:string;completed_at:string|null}
function fixture() {
  const state={now:NOW,auth:true,actor:USER,session:SESSION,gate:'password_change_required',active:true,
    row:{user_id:USER,requirement_id:GENERATION,completed_at:null} as Row|null,failRead:false,failClear:false,throwClear:false,writeCount:0}
  const authGet=vi.fn(async()=>({data:{user:state.auth?{id:state.actor}:null},error:null}))
  const rpc=vi.fn(async()=>({data:{state:state.gate,requirement_active:state.active,session_id:state.session},error:null}))
  const client={auth:{getUser:authGet},rpc} as unknown as SupabaseClient
  const admin={from:(table:string)=>{
    expect(table).toBe('desk_password_requirements')
    let op='read';let data:Partial<Row>={};const filters:[string,unknown][]=[]
    const query={select:()=>query,eq:(key:string,value:unknown)=>{filters.push([key,value]);return query},
      is:(key:string,value:unknown)=>{filters.push([key,value]);return query},
      update:(value:Partial<Row>)=>{op='update';data=value;return query},
      maybeSingle:async()=>{
        if (op==='read'&&state.failRead) return {data:null,error:{code:'offline'}}
        if (op==='update'&&state.throwClear) throw new Error('network')
        if (op==='update'&&state.failClear) return {data:null,error:{code:'offline'}}
        const found=state.row&&filters.every(([k,v])=>state.row![k as keyof Row]===v)
        if (op==='update'&&found) {state.writeCount++;Object.assign(state.row!,data)}
        return {data:found?{...state.row}:null,error:null}
      }}
    return query
  }} as unknown as SupabaseClient
  const native=vi.fn(async()=>Response.json({id:state.actor}))
  const userClient=vi.fn(()=>client)
  const handler=createPasswordChangeHandler({userClient,admin,url:'https://fixture.invalid',anonKey:'fixture-anon',serviceKey:TEST_KEY,fetch:native,now:()=>state.now})
  const invoke=async(body:unknown={password:PASSWORD},headers:Record<string,string>={authorization:HEADER,'x-actor-id':USER,'x-session-id':SESSION})=>{
    const response=await handler(new Request('https://edge.fixture.invalid',{method:'POST',headers,body:JSON.stringify(body)}))
    return {status:response.status,body:await response.json()}
  }
  return {state,native,userClient,authGet,rpc,invoke,handler}
}

beforeEach(()=>vi.restoreAllMocks())
describe('troca própria de senha — handler real com Auth e banco simulados',()=>{
  it.each(['anonymous','actor','session','invalid-session'])('nega %s antes do PUT/marker',async mode=>{
    const f=fixture()
    if(mode==='anonymous')f.state.auth=false
    if(mode==='actor')f.state.actor=OTHER
    if(mode==='session')f.state.session=OTHER
    if(mode==='invalid-session')f.state.gate='invalid_session'
    const r=await f.invoke();expect(r.status).toBe(401);expect(f.native).not.toHaveBeenCalled();expect(f.state.writeCount).toBe(0)
  })
  it.each([null,[],{password:PASSWORD,completion_proof:'pc1.a.b'},{password:''},{password:4},{password:PASSWORD,user_id:OTHER},{completion_proof:4},{foo:'bar'}])('nega body fora do contrato %j',async body=>{
    const f=fixture();expect((await f.invoke(body)).status).toBe(400);expect(f.native).not.toHaveBeenCalled()
  })
  it('confirma sessão via próprio JWT e usa PUT self, nunca admin/refreshToken',async()=>{
    const f=fixture();const r=await f.invoke()
    expect(r.body).toEqual({ok:true,state:'ok',password_updated:true})
    expect(f.userClient).toHaveBeenCalledWith(HEADER)
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith('desk_password_change_status')
    expect(f.native).toHaveBeenCalledExactlyOnceWith('https://fixture.invalid/auth/v1/user',expect.objectContaining({method:'PUT',
      headers:{Authorization:HEADER,apikey:'fixture-anon','Content-Type':'application/json'},body:JSON.stringify({password:PASSWORD})}))
    expect(f.state.row?.completed_at).toBe(new Date(NOW).toISOString());expect(f.state.writeCount).toBe(1)
  })
  it('suporta recuperação/conta não marcada sem escrever marcador novo',async()=>{
    const f=fixture();f.state.row=null;f.state.active=false;f.state.gate='ok'
    expect((await f.invoke()).body.ok).toBe(true);expect(f.state.writeCount).toBe(0);expect(f.native).toHaveBeenCalledTimes(1)
  })
  it('sessão anterior à marcação pode trocar voluntariamente e concluir requisito',async()=>{
    const f=fixture();f.state.gate='ok'
    expect((await f.invoke()).body.ok).toBe(true);expect(f.state.writeCount).toBe(1)
  })
  it('leitura do marcador indisponível impede alterar senha',async()=>{
    const f=fixture();f.state.failRead=true
    expect((await f.invoke()).body.error).toBe('requirement_unavailable');expect(f.native).not.toHaveBeenCalled()
  })
  it.each(['same_password','weak_password','reauthentication_needed','current_password_required','current_password_mismatch'])('Auth %s não conclui marcador nem emite proof',async code=>{
    const f=fixture();f.native.mockResolvedValue(Response.json({code,message:'provider-sensitive-value'},{status:422}))
    const r=await f.invoke();expect(r.status).toBe(422);expect(r.body).toEqual({ok:false,error:code,password_updated:false})
    expect(f.state.writeCount).toBe(0)
  })
  it('timeout Auth é incerto: sem proof, sem clear e sem repetir PUT',async()=>{
    const f=fixture();f.native.mockRejectedValue(new Error('timeout'))
    expect((await f.invoke()).body).toEqual({ok:false,error:'password_update_uncertain',password_updated:false})
    expect(f.native).toHaveBeenCalledTimes(1);expect(f.state.writeCount).toBe(0)
  })
  it('2xx com usuário diferente não autoriza nenhuma conclusão',async()=>{
    const f=fixture();f.native.mockResolvedValue(Response.json({id:OTHER}))
    expect((await f.invoke()).body.error).toBe('password_update_uncertain');expect(f.state.writeCount).toBe(0)
  })
  it.each(['error','reject'])('Auth confirmado e falha DB %s retorna proof sem senha/token',async mode=>{
    const f=fixture();f.state.failClear=mode==='error';f.state.throwClear=mode==='reject'
    const r=await f.invoke();expect(r.status).toBe(202)
    expect(r.body).toMatchObject({ok:false,error:'completion_pending',password_updated:true,completion_proof:expect.stringMatching(/^pc1\./)})
    const serialized=JSON.stringify(r.body);expect(serialized).not.toContain(PASSWORD);expect(serialized).not.toContain(HEADER);expect(serialized).not.toContain(TEST_KEY)
    const payload=JSON.parse(Buffer.from(r.body.completion_proof.split('.')[1],'base64url').toString())
    expect(payload).toMatchObject({v:1,purpose:'omnx-desk:password-completion:v1',user_id:USER,session_id:SESSION,requirement_id:GENERATION})
    expect(payload.exp-payload.iat).toBe(600)
  })
  it('proof válido conclui sem reenviar senha; replay é idempotente',async()=>{
    const f=fixture();f.state.failClear=true;const first=await f.invoke();f.state.failClear=false
    expect((await f.invoke({completion_proof:first.body.completion_proof})).body).toEqual({ok:true,state:'ok',password_updated:true})
    expect((await f.invoke({completion_proof:first.body.completion_proof})).body.ok).toBe(true)
    expect(f.native).toHaveBeenCalledTimes(1);expect(f.state.writeCount).toBe(1)
  })
  it.each(['tamper','expired','user','session','generation'])('proof %s é recusado sem PUT/clear',async mode=>{
    const f=fixture();f.state.failClear=true;const first=await f.invoke();f.state.failClear=false
    let proof=first.body.completion_proof
    if(mode==='tamper')proof=proof.slice(0,-2)+'xx'
    if(mode==='expired')f.state.now+=601_000
    if(mode==='user')f.state.actor=OTHER
    if(mode==='session')f.state.session=OTHER
    if(mode==='generation')f.state.row!.requirement_id=OTHER
    const r=await f.invoke({completion_proof:proof},{authorization:HEADER,'x-actor-id':f.state.actor,'x-session-id':f.state.session})
    expect(r.status).toBe(409);expect(r.body.error).toBe('confirmation_invalid');expect(f.state.writeCount).toBe(0)
    expect(f.native).toHaveBeenCalledTimes(1)
  })
  it('requisito remarcado durante PUT não é concluído pelo pedido antigo',async()=>{
    const f=fixture();f.native.mockImplementation(async()=>{f.state.row!.requirement_id=OTHER;return Response.json({id:USER})})
    const r=await f.invoke();expect(r.body).toEqual({ok:false,error:'requirement_changed',password_updated:true})
    expect(f.state.row?.completed_at).toBeNull();expect(f.state.writeCount).toBe(0)
  })
  it('OPTIONS não executa Auth nem leitura/atualização',async()=>{
    const f=fixture();const r=await f.handler(new Request('https://fixture.invalid',{method:'OPTIONS'}))
    expect(r.headers.get('access-control-allow-headers')).toContain('x-session-id');expect(f.authGet).not.toHaveBeenCalled();expect(f.native).not.toHaveBeenCalled()
  })
  it('5xx Auth pode ter ocorrido após gravação: retorna incerto e não emite proof',async()=>{
    const f=fixture();f.native.mockResolvedValue(Response.json({message:'internal-detail'},{status:500}))
    expect((await f.invoke()).body).toEqual({ok:false,error:'password_update_uncertain',password_updated:false})
    expect(f.state.writeCount).toBe(0)
  })
  it('erro ao assinar proof não apaga sucesso Auth já confirmado',async()=>{
    const f=fixture();f.state.failClear=true
    vi.spyOn(crypto.subtle,'sign').mockRejectedValueOnce(new Error('crypto unavailable'))
    expect((await f.invoke()).body).toEqual({ok:false,error:'request_failed',password_updated:true})
    expect(f.native).toHaveBeenCalledTimes(1)
  })

  it('encaminha current_password/nonce nativos sem outros campos e conclui só após Auth',async()=>{
    const f=fixture();await f.invoke({password:PASSWORD,current_password:'old-fixture',nonce:'123456'})
    expect(f.native).toHaveBeenCalledWith('https://fixture.invalid/auth/v1/user',expect.objectContaining({
      body:JSON.stringify({password:PASSWORD,current_password:'old-fixture',nonce:'123456'})}))
    expect(f.state.writeCount).toBe(1)
  })
  it.each([{password:'1234567'},{password:PASSWORD,nonce:'12345'}, {password:PASSWORD,nonce:'1234567890123'},
    {password:PASSWORD,nonce:'123a56'}, {password:PASSWORD,nonce:123456}, {password:PASSWORD,current_password:''},
    {password:PASSWORD,current_password:12}, {password:PASSWORD,reauthenticate:true}, {completion_proof:'pc1.a.b',nonce:'123456'},
    {reauthenticate:false}, {reauthenticate:true,email:'other@example.invalid'}])('recusa opções fora do contrato %j',async body=>{
    const f=fixture();expect((await f.invoke(body)).status).toBe(400);expect(f.native).not.toHaveBeenCalled();expect(f.state.writeCount).toBe(0)
  })
  it('reauthenticate explícito usa somente Bearer próprio/anon e não altera senha/marker',async()=>{
    const f=fixture();f.native.mockResolvedValue(new Response(null,{status:200}))
    expect((await f.invoke({reauthenticate:true})).body).toEqual({ok:true,reauthentication_sent:true,password_updated:false})
    expect(f.native).toHaveBeenCalledExactlyOnceWith('https://fixture.invalid/auth/v1/reauthenticate',expect.objectContaining({method:'GET',headers:{Authorization:HEADER,apikey:'fixture-anon'}}))
    expect(f.native.mock.calls[0][1]).not.toHaveProperty('body');expect(f.state.writeCount).toBe(0)
  })
  it('reauthenticate não aceita sessão de outra identidade',async()=>{
    const f=fixture();f.state.session=OTHER
    expect((await f.invoke({reauthenticate:true})).status).toBe(401);expect(f.native).not.toHaveBeenCalled()
  })
  it.each([429,500])('falha%d reauth não libera acesso nem altera marker',async status=>{
    const f=fixture();f.native.mockResolvedValue(Response.json({detail:'private'}, {status}))
    const result=await f.invoke({reauthenticate:true});expect(result.body.password_updated).toBe(false)
    expect(result.body.error).toBe(status===500?'reauthentication_uncertain':'reauthentication_failed')
    expect(result.body).not.toHaveProperty('state');expect(f.state.writeCount).toBe(0)
  })

})
