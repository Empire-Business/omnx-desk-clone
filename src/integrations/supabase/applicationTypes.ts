import type { Database as GeneratedDatabase } from './types'

type PublicTables = GeneratedDatabase['public']['Tables']
type ServerTenantTable = 'clients' | 'client_contracts' | 'permissoes_app' | 'user_instance_assignments'

/**
 * Contrato de INSERT mantido à parte dos tipos gerados: estas tabelas recebem
 * tenant_id do trigger set_tenant_id antes da checagem NOT NULL/RLS.
 * Fontes: 20260723120000_multitenant_fase_a_tenant_id.sql (clients,
 * client_contracts, user_instance_assignments) e
 * 20260727150000_onda3_permissoes_por_app.sql (permissoes_app).
 * Apenas a omissão no INSERT é permitida; Row, Update e demais campos/tabelas
 * continuam com os contratos gerados. Nenhum tenant é escolhido pelo frontend.
 */
type TableWithServerTenant<Name extends ServerTenantTable> = Omit<PublicTables[Name], 'Insert'> & {
  Insert: Omit<PublicTables[Name]['Insert'], 'tenant_id'> &
    Partial<Pick<PublicTables[Name]['Insert'], 'tenant_id'>>
}

export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Tables'> & {
    Tables: Omit<PublicTables, ServerTenantTable> & {
      [Name in ServerTenantTable]: TableWithServerTenant<Name>
    }
  }
}
