export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      _backup_contratos_20260805_rotulo: {
        Row: {
          atualizado_em: string | null
          bonus: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cpf_cnpj: string | null
          crescimento_seguidores: number | null
          criado_em: string | null
          criado_por: string | null
          data_assinatura: string | null
          data_fechamento: string | null
          data_pagamento: string | null
          email: string | null
          empresa: string | null
          endereco: string | null
          entrada: number | null
          entregas_no_prazo: number | null
          entregas_totais: number | null
          estrategista_id: string | null
          estrategista_nome_raw: string | null
          fat_bruto: number | null
          faturamento: string | null
          forma_pagamento: string | null
          ghl_assinada_erro: string | null
          ghl_assinada_oportunidade_id: string | null
          ghl_assinada_sincronizada_em: string | null
          id: string | null
          importado_em: string | null
          instagram: string | null
          link_clicksign: string | null
          nicho: string | null
          notion_numero: string | null
          notion_page_id: string | null
          notion_raw: Json | null
          notion_ultima_edicao: string | null
          nps_vip: string | null
          num_parcelas: number | null
          observacoes: string | null
          pagador_cpf_cnpj: string | null
          pagador_diferente: boolean | null
          pagador_nome: string | null
          pagador_observacao: string | null
          pagador_relacao: string | null
          pagamentos: Json | null
          percentual_aplicado: number | null
          pg_entrada: string | null
          plano_dias: number | null
          posicionamento: string | null
          produto_id: string | null
          produto_nome: string | null
          renovacao: string | null
          resumo: string | null
          seguidores_fim: number | null
          seguidores_inicio: number | null
          semanas: number | null
          status: string | null
          status_secundario: string | null
          tenant_id: string | null
          treinador: string | null
          valor_parcela: number | null
          valor_total: number | null
          vencimento: string | null
          venda_diretoria: boolean | null
          venda_interna: boolean | null
          venda_pendente_id: string | null
          vendedor: string | null
          videos_postados: number | null
          whatsapp: string | null
        }
        Insert: {
          atualizado_em?: string | null
          bonus?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          crescimento_seguidores?: number | null
          criado_em?: string | null
          criado_por?: string | null
          data_assinatura?: string | null
          data_fechamento?: string | null
          data_pagamento?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          entrada?: number | null
          entregas_no_prazo?: number | null
          entregas_totais?: number | null
          estrategista_id?: string | null
          estrategista_nome_raw?: string | null
          fat_bruto?: number | null
          faturamento?: string | null
          forma_pagamento?: string | null
          ghl_assinada_erro?: string | null
          ghl_assinada_oportunidade_id?: string | null
          ghl_assinada_sincronizada_em?: string | null
          id?: string | null
          importado_em?: string | null
          instagram?: string | null
          link_clicksign?: string | null
          nicho?: string | null
          notion_numero?: string | null
          notion_page_id?: string | null
          notion_raw?: Json | null
          notion_ultima_edicao?: string | null
          nps_vip?: string | null
          num_parcelas?: number | null
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean | null
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json | null
          percentual_aplicado?: number | null
          pg_entrada?: string | null
          plano_dias?: number | null
          posicionamento?: string | null
          produto_id?: string | null
          produto_nome?: string | null
          renovacao?: string | null
          resumo?: string | null
          seguidores_fim?: number | null
          seguidores_inicio?: number | null
          semanas?: number | null
          status?: string | null
          status_secundario?: string | null
          tenant_id?: string | null
          treinador?: string | null
          valor_parcela?: number | null
          valor_total?: number | null
          vencimento?: string | null
          venda_diretoria?: boolean | null
          venda_interna?: boolean | null
          venda_pendente_id?: string | null
          vendedor?: string | null
          videos_postados?: number | null
          whatsapp?: string | null
        }
        Update: {
          atualizado_em?: string | null
          bonus?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          crescimento_seguidores?: number | null
          criado_em?: string | null
          criado_por?: string | null
          data_assinatura?: string | null
          data_fechamento?: string | null
          data_pagamento?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          entrada?: number | null
          entregas_no_prazo?: number | null
          entregas_totais?: number | null
          estrategista_id?: string | null
          estrategista_nome_raw?: string | null
          fat_bruto?: number | null
          faturamento?: string | null
          forma_pagamento?: string | null
          ghl_assinada_erro?: string | null
          ghl_assinada_oportunidade_id?: string | null
          ghl_assinada_sincronizada_em?: string | null
          id?: string | null
          importado_em?: string | null
          instagram?: string | null
          link_clicksign?: string | null
          nicho?: string | null
          notion_numero?: string | null
          notion_page_id?: string | null
          notion_raw?: Json | null
          notion_ultima_edicao?: string | null
          nps_vip?: string | null
          num_parcelas?: number | null
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean | null
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json | null
          percentual_aplicado?: number | null
          pg_entrada?: string | null
          plano_dias?: number | null
          posicionamento?: string | null
          produto_id?: string | null
          produto_nome?: string | null
          renovacao?: string | null
          resumo?: string | null
          seguidores_fim?: number | null
          seguidores_inicio?: number | null
          semanas?: number | null
          status?: string | null
          status_secundario?: string | null
          tenant_id?: string | null
          treinador?: string | null
          valor_parcela?: number | null
          valor_total?: number | null
          vencimento?: string | null
          venda_diretoria?: boolean | null
          venda_interna?: boolean | null
          venda_pendente_id?: string | null
          vendedor?: string | null
          videos_postados?: number | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      _backup_thiago_20260805: {
        Row: {
          fonte: string | null
          id: string | null
          pagamentos: Json | null
          valor: number | null
        }
        Insert: {
          fonte?: string | null
          id?: string | null
          pagamentos?: Json | null
          valor?: number | null
        }
        Update: {
          fonte?: string | null
          id?: string | null
          pagamentos?: Json | null
          valor?: number | null
        }
        Relationships: []
      }
      _backup_vendas_pendentes_20260805: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          atualizado_em: string | null
          cliente_bairro: string | null
          cliente_cep: string | null
          cliente_complemento: string | null
          cliente_cpf_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_instagram: string | null
          cliente_logradouro: string | null
          cliente_municipio: string | null
          cliente_nome: string | null
          cliente_numero: string | null
          cliente_razao_social: string | null
          cliente_uf: string | null
          cliente_whatsapp: string | null
          closer_email: string | null
          closer_nome: string | null
          comprovantes: Json | null
          criado_em: string | null
          ghl_contato_id: string | null
          ghl_oportunidade_id: string | null
          ghl_pipeline_name: string | null
          ghl_venda_id: string | null
          historico_edicoes: Json | null
          id: string | null
          identificador_pagamento: string | null
          ip_origem: string | null
          observacoes: string | null
          pagador_cpf_cnpj: string | null
          pagador_diferente: boolean | null
          pagador_nome: string | null
          pagador_observacao: string | null
          pagador_relacao: string | null
          pagamentos: Json | null
          produto_id: string | null
          produto_nome: string | null
          sincronizacao_erro: string | null
          sincronizado_em: string | null
          status: string | null
          tenant_id: string | null
          user_agent: string | null
          valor_total_venda: number | null
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          atualizado_em?: string | null
          cliente_bairro?: string | null
          cliente_cep?: string | null
          cliente_complemento?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_instagram?: string | null
          cliente_logradouro?: string | null
          cliente_municipio?: string | null
          cliente_nome?: string | null
          cliente_numero?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cliente_whatsapp?: string | null
          closer_email?: string | null
          closer_nome?: string | null
          comprovantes?: Json | null
          criado_em?: string | null
          ghl_contato_id?: string | null
          ghl_oportunidade_id?: string | null
          ghl_pipeline_name?: string | null
          ghl_venda_id?: string | null
          historico_edicoes?: Json | null
          id?: string | null
          identificador_pagamento?: string | null
          ip_origem?: string | null
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean | null
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json | null
          produto_id?: string | null
          produto_nome?: string | null
          sincronizacao_erro?: string | null
          sincronizado_em?: string | null
          status?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          valor_total_venda?: number | null
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          atualizado_em?: string | null
          cliente_bairro?: string | null
          cliente_cep?: string | null
          cliente_complemento?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_instagram?: string | null
          cliente_logradouro?: string | null
          cliente_municipio?: string | null
          cliente_nome?: string | null
          cliente_numero?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cliente_whatsapp?: string | null
          closer_email?: string | null
          closer_nome?: string | null
          comprovantes?: Json | null
          criado_em?: string | null
          ghl_contato_id?: string | null
          ghl_oportunidade_id?: string | null
          ghl_pipeline_name?: string | null
          ghl_venda_id?: string | null
          historico_edicoes?: Json | null
          id?: string | null
          identificador_pagamento?: string | null
          ip_origem?: string | null
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean | null
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json | null
          produto_id?: string | null
          produto_nome?: string | null
          sincronizacao_erro?: string | null
          sincronizado_em?: string | null
          status?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          valor_total_venda?: number | null
        }
        Relationships: []
      }
      _backup_vendas_pendentes_20260805_pos_edicao: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          atualizado_em: string | null
          cliente_bairro: string | null
          cliente_cep: string | null
          cliente_complemento: string | null
          cliente_cpf_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_instagram: string | null
          cliente_logradouro: string | null
          cliente_municipio: string | null
          cliente_nome: string | null
          cliente_numero: string | null
          cliente_razao_social: string | null
          cliente_uf: string | null
          cliente_whatsapp: string | null
          closer_email: string | null
          closer_nome: string | null
          comprovantes: Json | null
          criado_em: string | null
          ghl_contato_id: string | null
          ghl_oportunidade_id: string | null
          ghl_pipeline_name: string | null
          ghl_venda_id: string | null
          historico_edicoes: Json | null
          id: string | null
          identificador_pagamento: string | null
          ip_origem: string | null
          observacoes: string | null
          pagador_cpf_cnpj: string | null
          pagador_diferente: boolean | null
          pagador_nome: string | null
          pagador_observacao: string | null
          pagador_relacao: string | null
          pagamentos: Json | null
          produto_id: string | null
          produto_nome: string | null
          sincronizacao_erro: string | null
          sincronizado_em: string | null
          status: string | null
          tenant_id: string | null
          user_agent: string | null
          valor_total_venda: number | null
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          atualizado_em?: string | null
          cliente_bairro?: string | null
          cliente_cep?: string | null
          cliente_complemento?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_instagram?: string | null
          cliente_logradouro?: string | null
          cliente_municipio?: string | null
          cliente_nome?: string | null
          cliente_numero?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cliente_whatsapp?: string | null
          closer_email?: string | null
          closer_nome?: string | null
          comprovantes?: Json | null
          criado_em?: string | null
          ghl_contato_id?: string | null
          ghl_oportunidade_id?: string | null
          ghl_pipeline_name?: string | null
          ghl_venda_id?: string | null
          historico_edicoes?: Json | null
          id?: string | null
          identificador_pagamento?: string | null
          ip_origem?: string | null
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean | null
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json | null
          produto_id?: string | null
          produto_nome?: string | null
          sincronizacao_erro?: string | null
          sincronizado_em?: string | null
          status?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          valor_total_venda?: number | null
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          atualizado_em?: string | null
          cliente_bairro?: string | null
          cliente_cep?: string | null
          cliente_complemento?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_instagram?: string | null
          cliente_logradouro?: string | null
          cliente_municipio?: string | null
          cliente_nome?: string | null
          cliente_numero?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cliente_whatsapp?: string | null
          closer_email?: string | null
          closer_nome?: string | null
          comprovantes?: Json | null
          criado_em?: string | null
          ghl_contato_id?: string | null
          ghl_oportunidade_id?: string | null
          ghl_pipeline_name?: string | null
          ghl_venda_id?: string | null
          historico_edicoes?: Json | null
          id?: string | null
          identificador_pagamento?: string | null
          ip_origem?: string | null
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean | null
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json | null
          produto_id?: string | null
          produto_nome?: string | null
          sincronizacao_erro?: string | null
          sincronizado_em?: string | null
          status?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          valor_total_venda?: number | null
        }
        Relationships: []
      }
      _backup_vendas_pendentes_20260805_pos_edicao_2: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          atualizado_em: string | null
          cliente_bairro: string | null
          cliente_cep: string | null
          cliente_complemento: string | null
          cliente_cpf_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_instagram: string | null
          cliente_logradouro: string | null
          cliente_municipio: string | null
          cliente_nome: string | null
          cliente_numero: string | null
          cliente_razao_social: string | null
          cliente_uf: string | null
          cliente_whatsapp: string | null
          closer_email: string | null
          closer_nome: string | null
          comprovantes: Json | null
          criado_em: string | null
          ghl_contato_id: string | null
          ghl_oportunidade_id: string | null
          ghl_pipeline_name: string | null
          ghl_venda_id: string | null
          historico_edicoes: Json | null
          id: string | null
          identificador_pagamento: string | null
          ip_origem: string | null
          observacoes: string | null
          pagador_cpf_cnpj: string | null
          pagador_diferente: boolean | null
          pagador_nome: string | null
          pagador_observacao: string | null
          pagador_relacao: string | null
          pagamentos: Json | null
          produto_id: string | null
          produto_nome: string | null
          sincronizacao_erro: string | null
          sincronizado_em: string | null
          status: string | null
          tenant_id: string | null
          user_agent: string | null
          valor_total_venda: number | null
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          atualizado_em?: string | null
          cliente_bairro?: string | null
          cliente_cep?: string | null
          cliente_complemento?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_instagram?: string | null
          cliente_logradouro?: string | null
          cliente_municipio?: string | null
          cliente_nome?: string | null
          cliente_numero?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cliente_whatsapp?: string | null
          closer_email?: string | null
          closer_nome?: string | null
          comprovantes?: Json | null
          criado_em?: string | null
          ghl_contato_id?: string | null
          ghl_oportunidade_id?: string | null
          ghl_pipeline_name?: string | null
          ghl_venda_id?: string | null
          historico_edicoes?: Json | null
          id?: string | null
          identificador_pagamento?: string | null
          ip_origem?: string | null
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean | null
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json | null
          produto_id?: string | null
          produto_nome?: string | null
          sincronizacao_erro?: string | null
          sincronizado_em?: string | null
          status?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          valor_total_venda?: number | null
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          atualizado_em?: string | null
          cliente_bairro?: string | null
          cliente_cep?: string | null
          cliente_complemento?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_instagram?: string | null
          cliente_logradouro?: string | null
          cliente_municipio?: string | null
          cliente_nome?: string | null
          cliente_numero?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cliente_whatsapp?: string | null
          closer_email?: string | null
          closer_nome?: string | null
          comprovantes?: Json | null
          criado_em?: string | null
          ghl_contato_id?: string | null
          ghl_oportunidade_id?: string | null
          ghl_pipeline_name?: string | null
          ghl_venda_id?: string | null
          historico_edicoes?: Json | null
          id?: string | null
          identificador_pagamento?: string | null
          ip_origem?: string | null
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean | null
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json | null
          produto_id?: string | null
          produto_nome?: string | null
          sincronizacao_erro?: string | null
          sincronizado_em?: string | null
          status?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          valor_total_venda?: number | null
        }
        Relationships: []
      }
      _backup_vendas_pendentes_20260805_rotulo: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          atualizado_em: string | null
          cliente_bairro: string | null
          cliente_cep: string | null
          cliente_complemento: string | null
          cliente_cpf_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_instagram: string | null
          cliente_logradouro: string | null
          cliente_municipio: string | null
          cliente_nome: string | null
          cliente_numero: string | null
          cliente_razao_social: string | null
          cliente_uf: string | null
          cliente_whatsapp: string | null
          closer_email: string | null
          closer_nome: string | null
          comprovantes: Json | null
          criado_em: string | null
          ghl_contato_id: string | null
          ghl_oportunidade_id: string | null
          ghl_pipeline_name: string | null
          ghl_venda_id: string | null
          historico_edicoes: Json | null
          id: string | null
          identificador_pagamento: string | null
          ip_origem: string | null
          observacoes: string | null
          pagador_cpf_cnpj: string | null
          pagador_diferente: boolean | null
          pagador_nome: string | null
          pagador_observacao: string | null
          pagador_relacao: string | null
          pagamentos: Json | null
          produto_id: string | null
          produto_nome: string | null
          sincronizacao_erro: string | null
          sincronizado_em: string | null
          status: string | null
          tenant_id: string | null
          user_agent: string | null
          valor_total_venda: number | null
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          atualizado_em?: string | null
          cliente_bairro?: string | null
          cliente_cep?: string | null
          cliente_complemento?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_instagram?: string | null
          cliente_logradouro?: string | null
          cliente_municipio?: string | null
          cliente_nome?: string | null
          cliente_numero?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cliente_whatsapp?: string | null
          closer_email?: string | null
          closer_nome?: string | null
          comprovantes?: Json | null
          criado_em?: string | null
          ghl_contato_id?: string | null
          ghl_oportunidade_id?: string | null
          ghl_pipeline_name?: string | null
          ghl_venda_id?: string | null
          historico_edicoes?: Json | null
          id?: string | null
          identificador_pagamento?: string | null
          ip_origem?: string | null
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean | null
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json | null
          produto_id?: string | null
          produto_nome?: string | null
          sincronizacao_erro?: string | null
          sincronizado_em?: string | null
          status?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          valor_total_venda?: number | null
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          atualizado_em?: string | null
          cliente_bairro?: string | null
          cliente_cep?: string | null
          cliente_complemento?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_instagram?: string | null
          cliente_logradouro?: string | null
          cliente_municipio?: string | null
          cliente_nome?: string | null
          cliente_numero?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cliente_whatsapp?: string | null
          closer_email?: string | null
          closer_nome?: string | null
          comprovantes?: Json | null
          criado_em?: string | null
          ghl_contato_id?: string | null
          ghl_oportunidade_id?: string | null
          ghl_pipeline_name?: string | null
          ghl_venda_id?: string | null
          historico_edicoes?: Json | null
          id?: string | null
          identificador_pagamento?: string | null
          ip_origem?: string | null
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean | null
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json | null
          produto_id?: string | null
          produto_nome?: string | null
          sincronizacao_erro?: string | null
          sincronizado_em?: string | null
          status?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          valor_total_venda?: number | null
        }
        Relationships: []
      }
      _webhook_debug: {
        Row: {
          body: Json | null
          chatid: string | null
          criado_em: string | null
          event_type: string | null
          id: number
          instance: string | null
          is_group: boolean | null
        }
        Insert: {
          body?: Json | null
          chatid?: string | null
          criado_em?: string | null
          event_type?: string | null
          id?: number
          instance?: string | null
          is_group?: boolean | null
        }
        Update: {
          body?: Json | null
          chatid?: string | null
          criado_em?: string | null
          event_type?: string | null
          id?: number
          instance?: string | null
          is_group?: boolean | null
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          expira_em: string | null
          id: string
          key_hash: string
          key_prefix: string
          nome: string
          permissoes: Json
          tenant_id: string
          ultimo_uso: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          expira_em?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          nome: string
          permissoes?: Json
          tenant_id: string
          ultimo_uso?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          expira_em?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          nome?: string
          permissoes?: Json
          tenant_id?: string
          ultimo_uso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_keys_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "api_keys_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_logs: {
        Row: {
          app: string
          created_at: string
          detalhe: Json
          duracao_ms: number | null
          evento: string
          id: string
          mensagem: string | null
          nivel: string
          rota: string | null
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          app?: string
          created_at?: string
          detalhe?: Json
          duracao_ms?: number | null
          evento: string
          id?: string
          mensagem?: string | null
          nivel?: string
          rota?: string | null
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          app?: string
          created_at?: string
          detalhe?: Json
          duracao_ms?: number | null
          evento?: string
          id?: string
          mensagem?: string | null
          nivel?: string
          rota?: string | null
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_modules: {
        Row: {
          categoria: string
          descricao: string | null
          enabled: boolean
          icone: string | null
          nome: string
          ordem: number
          slug: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          categoria?: string
          descricao?: string | null
          enabled?: boolean
          icone?: string | null
          nome: string
          ordem?: number
          slug: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          categoria?: string
          descricao?: string | null
          enabled?: boolean
          icone?: string | null
          nome?: string
          ordem?: number
          slug?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          atualizado_em: string | null
          chave: string
          criado_em: string | null
          id: string
          tenant_id: string
          valor: string
        }
        Insert: {
          atualizado_em?: string | null
          chave: string
          criado_em?: string | null
          id?: string
          tenant_id: string
          valor?: string
        }
        Update: {
          atualizado_em?: string | null
          chave?: string
          criado_em?: string | null
          id?: string
          tenant_id?: string
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimento_comentarios: {
        Row: {
          autor_id: string | null
          created_at: string
          demanda_id: string
          id: string
          tenant_id: string
          texto: string
        }
        Insert: {
          autor_id?: string | null
          created_at?: string
          demanda_id: string
          id?: string
          tenant_id: string
          texto: string
        }
        Update: {
          autor_id?: string | null
          created_at?: string
          demanda_id?: string
          id?: string
          tenant_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_comentarios_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_comentarios_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_comentarios_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "atendimento_comentarios_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "atendimento_comentarios_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: false
            referencedRelation: "atendimento_demandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_comentarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimento_demandas: {
        Row: {
          anexos: Json
          aprovacao: string
          aprovacao_obs: string | null
          cliente_id: string | null
          codigo: string
          concluida_em: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          etapa_id: string | null
          id: string
          prazo: string | null
          prioridade: string
          responsavel_id: string | null
          tenant_id: string
          tipo_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          anexos?: Json
          aprovacao?: string
          aprovacao_obs?: string | null
          cliente_id?: string | null
          codigo?: string
          concluida_em?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          etapa_id?: string | null
          id?: string
          prazo?: string | null
          prioridade?: string
          responsavel_id?: string | null
          tenant_id: string
          tipo_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          anexos?: Json
          aprovacao?: string
          aprovacao_obs?: string | null
          cliente_id?: string | null
          codigo?: string
          concluida_em?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          etapa_id?: string | null
          id?: string
          prazo?: string | null
          prioridade?: string
          responsavel_id?: string | null
          tenant_id?: string
          tipo_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_demandas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_demandas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_demandas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_demandas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "atendimento_demandas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "atendimento_demandas_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "atendimento_etapas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_demandas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_demandas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_demandas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "atendimento_demandas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "atendimento_demandas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_demandas_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "atendimento_tipos"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimento_etapas: {
        Row: {
          cor: string
          created_at: string
          id: string
          is_final: boolean
          nome: string
          ordem: number
          tenant_id: string
        }
        Insert: {
          cor?: string
          created_at?: string
          id?: string
          is_final?: boolean
          nome: string
          ordem?: number
          tenant_id: string
        }
        Update: {
          cor?: string
          created_at?: string
          id?: string
          is_final?: boolean
          nome?: string
          ordem?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_etapas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimento_historico: {
        Row: {
          autor_id: string | null
          campo: string
          created_at: string
          demanda_id: string
          id: string
          tenant_id: string
          valor_de: string | null
          valor_para: string | null
        }
        Insert: {
          autor_id?: string | null
          campo: string
          created_at?: string
          demanda_id: string
          id?: string
          tenant_id: string
          valor_de?: string | null
          valor_para?: string | null
        }
        Update: {
          autor_id?: string | null
          campo?: string
          created_at?: string
          demanda_id?: string
          id?: string
          tenant_id?: string
          valor_de?: string | null
          valor_para?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_historico_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_historico_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_historico_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "atendimento_historico_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "atendimento_historico_demanda_id_fkey"
            columns: ["demanda_id"]
            isOneToOne: false
            referencedRelation: "atendimento_demandas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimento_historico_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      atendimento_tipos: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "atendimento_tipos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          acao: string
          criado_em: string
          detalhes: Json | null
          entidade: string
          entidade_id: string | null
          id: string
          ip_address: string | null
          tenant_id: string
          user_id: string | null
          user_nome: string | null
          user_perfil: string | null
        }
        Insert: {
          acao: string
          criado_em?: string
          detalhes?: Json | null
          entidade: string
          entidade_id?: string | null
          id?: string
          ip_address?: string | null
          tenant_id: string
          user_id?: string | null
          user_nome?: string | null
          user_perfil?: string | null
        }
        Update: {
          acao?: string
          criado_em?: string
          detalhes?: Json | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          ip_address?: string | null
          tenant_id?: string
          user_id?: string | null
          user_nome?: string | null
          user_perfil?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      chat_contact_clients: {
        Row: {
          client_id: string
          contact_id: string
          criado_em: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          client_id: string
          contact_id: string
          criado_em?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          client_id?: string
          contact_id?: string
          criado_em?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_contact_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_contact_clients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "chat_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_contact_clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_contacts: {
        Row: {
          atualizado_em: string | null
          bloqueado: boolean | null
          client_id: string | null
          criado_em: string | null
          foto_url: string | null
          group_size: number | null
          id: string
          instance_id: string | null
          nome: string | null
          notas: string | null
          numero_whatsapp: string
          restrito_admin: boolean
          tags: string[]
          tenant_id: string
        }
        Insert: {
          atualizado_em?: string | null
          bloqueado?: boolean | null
          client_id?: string | null
          criado_em?: string | null
          foto_url?: string | null
          group_size?: number | null
          id?: string
          instance_id?: string | null
          nome?: string | null
          notas?: string | null
          numero_whatsapp: string
          restrito_admin?: boolean
          tags?: string[]
          tenant_id: string
        }
        Update: {
          atualizado_em?: string | null
          bloqueado?: boolean | null
          client_id?: string | null
          criado_em?: string | null
          foto_url?: string | null
          group_size?: number | null
          id?: string
          instance_id?: string | null
          nome?: string | null
          notas?: string | null
          numero_whatsapp?: string
          restrito_admin?: boolean
          tags?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_contacts_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversation_user_prefs: {
        Row: {
          arquivada: boolean
          conversation_id: string
          fixado: boolean
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          arquivada?: boolean
          conversation_id: string
          fixado?: boolean
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          arquivada?: boolean
          conversation_id?: string
          fixado?: boolean
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversation_user_prefs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversation_user_prefs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversation_user_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversation_user_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversation_user_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "chat_conversation_user_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          agente_id: string | null
          aguardando_resposta: boolean | null
          arquivada: boolean
          atualizado_em: string | null
          automacao_pausada_ate: string | null
          contact_id: string | null
          criado_em: string | null
          department_id: string | null
          encerrada_em: string | null
          id: string
          instance_id: string | null
          is_group: boolean | null
          primeira_resposta_em: string | null
          protocolo: string | null
          resumo_ia: string | null
          sentimento: string | null
          silenciado: boolean | null
          sla_primeira_resposta_violado: boolean | null
          sla_resolucao_violado: boolean | null
          status: string | null
          tenant_id: string
          ultima_msg_cliente_em: string | null
        }
        Insert: {
          agente_id?: string | null
          aguardando_resposta?: boolean | null
          arquivada?: boolean
          atualizado_em?: string | null
          automacao_pausada_ate?: string | null
          contact_id?: string | null
          criado_em?: string | null
          department_id?: string | null
          encerrada_em?: string | null
          id?: string
          instance_id?: string | null
          is_group?: boolean | null
          primeira_resposta_em?: string | null
          protocolo?: string | null
          resumo_ia?: string | null
          sentimento?: string | null
          silenciado?: boolean | null
          sla_primeira_resposta_violado?: boolean | null
          sla_resolucao_violado?: boolean | null
          status?: string | null
          tenant_id: string
          ultima_msg_cliente_em?: string | null
        }
        Update: {
          agente_id?: string | null
          aguardando_resposta?: boolean | null
          arquivada?: boolean
          atualizado_em?: string | null
          automacao_pausada_ate?: string | null
          contact_id?: string | null
          criado_em?: string | null
          department_id?: string | null
          encerrada_em?: string | null
          id?: string
          instance_id?: string | null
          is_group?: boolean | null
          primeira_resposta_em?: string | null
          protocolo?: string | null
          resumo_ia?: string | null
          sentimento?: string | null
          silenciado?: boolean | null
          sla_primeira_resposta_violado?: boolean | null
          sla_resolucao_violado?: boolean | null
          status?: string | null
          tenant_id?: string
          ultima_msg_cliente_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "chat_conversations_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "chat_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "chat_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_csat: {
        Row: {
          comentario: string | null
          conversation_id: string | null
          criado_em: string | null
          id: string
          nota: number | null
          respondido_em: string | null
          tenant_id: string
        }
        Insert: {
          comentario?: string | null
          conversation_id?: string | null
          criado_em?: string | null
          id?: string
          nota?: number | null
          respondido_em?: string | null
          tenant_id: string
        }
        Update: {
          comentario?: string | null
          conversation_id?: string | null
          criado_em?: string | null
          id?: string
          nota?: number | null
          respondido_em?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_csat_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_csat_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_department_agents: {
        Row: {
          criado_em: string | null
          department_id: string | null
          id: string
          is_gerente: boolean
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          criado_em?: string | null
          department_id?: string | null
          id?: string
          is_gerente?: boolean
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          criado_em?: string | null
          department_id?: string | null
          id?: string
          is_gerente?: boolean
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_department_agents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "chat_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_department_agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_department_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_department_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_department_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "chat_department_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      chat_departments: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          dias_atendimento: number[] | null
          distribuicao: string | null
          gerente_id: string | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          instance_id: string | null
          mensagem_boas_vindas: string | null
          mensagem_fora_horario: string | null
          modulo_acesso: string | null
          nome: string
          sla_primeira_resposta_minutos: number | null
          sla_resolucao_horas: number | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          dias_atendimento?: number[] | null
          distribuicao?: string | null
          gerente_id?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          instance_id?: string | null
          mensagem_boas_vindas?: string | null
          mensagem_fora_horario?: string | null
          modulo_acesso?: string | null
          nome: string
          sla_primeira_resposta_minutos?: number | null
          sla_resolucao_horas?: number | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          dias_atendimento?: number[] | null
          distribuicao?: string | null
          gerente_id?: string | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          instance_id?: string | null
          mensagem_boas_vindas?: string | null
          mensagem_fora_horario?: string | null
          modulo_acesso?: string | null
          nome?: string
          sla_primeira_resposta_minutos?: number | null
          sla_resolucao_horas?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_departments_gerente_id_fkey"
            columns: ["gerente_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_departments_gerente_id_fkey"
            columns: ["gerente_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_departments_gerente_id_fkey"
            columns: ["gerente_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "chat_departments_gerente_id_fkey"
            columns: ["gerente_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_departments_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_group_members: {
        Row: {
          contact_id: string
          criado_em: string | null
          id: string
          is_admin: boolean | null
          is_super_admin: boolean | null
          nome: string | null
          numero_whatsapp: string
          tenant_id: string
        }
        Insert: {
          contact_id: string
          criado_em?: string | null
          id?: string
          is_admin?: boolean | null
          is_super_admin?: boolean | null
          nome?: string | null
          numero_whatsapp: string
          tenant_id: string
        }
        Update: {
          contact_id?: string
          criado_em?: string | null
          id?: string
          is_admin?: boolean | null
          is_super_admin?: boolean | null
          nome?: string | null
          numero_whatsapp?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "chat_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_group_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_grupos_restritos: {
        Row: {
          criado_em: string
          grupo_base: string
          origem: string
          tenant_id: string
        }
        Insert: {
          criado_em?: string
          grupo_base: string
          origem: string
          tenant_id: string
        }
        Update: {
          criado_em?: string
          grupo_base?: string
          origem?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_grupos_restritos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_reads: {
        Row: {
          conversation_id: string
          id: string
          last_read_at: string
          last_read_message_id: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          last_read_at?: string
          last_read_message_id?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          last_read_at?: string
          last_read_message_id?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reads_last_read_message_id_fkey"
            columns: ["last_read_message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "chat_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          agente_id: string | null
          autor_chave: string | null
          autor_nome: string | null
          autor_origem: string | null
          autor_tipo: string | null
          autor_user_id: string | null
          conteudo: string | null
          conversation_id: string | null
          criado_em: string | null
          enviado_por_agente: boolean | null
          enviado_por_ia: boolean | null
          fonte_envio: string | null
          id: string
          lida: boolean | null
          media_url: string | null
          message_id_wpp: string | null
          reactions: Json | null
          reply_to_id: string | null
          status_envio: string | null
          tenant_id: string
          tipo: string | null
        }
        Insert: {
          agente_id?: string | null
          autor_chave?: string | null
          autor_nome?: string | null
          autor_origem?: string | null
          autor_tipo?: string | null
          autor_user_id?: string | null
          conteudo?: string | null
          conversation_id?: string | null
          criado_em?: string | null
          enviado_por_agente?: boolean | null
          enviado_por_ia?: boolean | null
          fonte_envio?: string | null
          id?: string
          lida?: boolean | null
          media_url?: string | null
          message_id_wpp?: string | null
          reactions?: Json | null
          reply_to_id?: string | null
          status_envio?: string | null
          tenant_id: string
          tipo?: string | null
        }
        Update: {
          agente_id?: string | null
          autor_chave?: string | null
          autor_nome?: string | null
          autor_origem?: string | null
          autor_tipo?: string | null
          autor_user_id?: string | null
          conteudo?: string | null
          conversation_id?: string | null
          criado_em?: string | null
          enviado_por_agente?: boolean | null
          enviado_por_ia?: boolean | null
          fonte_envio?: string | null
          id?: string
          lida?: boolean | null
          media_url?: string | null
          message_id_wpp?: string | null
          reactions?: Json | null
          reply_to_id?: string | null
          status_envio?: string | null
          tenant_id?: string
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "chat_messages_agente_id_fkey"
            columns: ["agente_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_midia_texto: {
        Row: {
          atualizado_em: string
          criado_em: string
          custo_usd: number | null
          duracao_s: number | null
          erro_code: string | null
          idioma: string | null
          mensagem_em: string
          message_id: string
          modelo: string | null
          processado_em: string | null
          proxima_tentativa_em: string
          reivindicado_em: string | null
          status: string
          tenant_id: string
          tentativas: number
          texto: string | null
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          custo_usd?: number | null
          duracao_s?: number | null
          erro_code?: string | null
          idioma?: string | null
          mensagem_em: string
          message_id: string
          modelo?: string | null
          processado_em?: string | null
          proxima_tentativa_em?: string
          reivindicado_em?: string | null
          status?: string
          tenant_id: string
          tentativas?: number
          texto?: string | null
          tipo: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          custo_usd?: number | null
          duracao_s?: number | null
          erro_code?: string | null
          idioma?: string | null
          mensagem_em?: string
          message_id?: string
          modelo?: string | null
          processado_em?: string | null
          proxima_tentativa_em?: string
          reivindicado_em?: string | null
          status?: string
          tenant_id?: string
          tentativas?: number
          texto?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_midia_texto_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_midia_texto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_quick_replies: {
        Row: {
          atalho: string | null
          atualizado_em: string | null
          categoria: string | null
          conteudo: string
          criado_em: string | null
          criado_por: string | null
          id: string
          tenant_id: string
          titulo: string
        }
        Insert: {
          atalho?: string | null
          atualizado_em?: string | null
          categoria?: string | null
          conteudo: string
          criado_em?: string | null
          criado_por?: string | null
          id?: string
          tenant_id: string
          titulo: string
        }
        Update: {
          atalho?: string | null
          atualizado_em?: string | null
          categoria?: string | null
          conteudo?: string
          criado_em?: string | null
          criado_por?: string | null
          id?: string
          tenant_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_quick_replies_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_quick_replies_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_quick_replies_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "chat_quick_replies_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_quick_replies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_templates: {
        Row: {
          ativo: boolean
          atualizado_em: string
          categoria: string
          conteudo: string
          criado_em: string
          criado_por: string | null
          id: string
          nome: string
          tenant_id: string
          variaveis: string[]
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          categoria: string
          conteudo: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome: string
          tenant_id: string
          variaveis?: string[]
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          categoria?: string
          conteudo?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          nome?: string
          tenant_id?: string
          variaveis?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "chat_templates_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_templates_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_templates_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "chat_templates_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_weekly_reports: {
        Row: {
          alertas: Json | null
          bloqueios: string[] | null
          clareza_posicionamento: string | null
          client_id: string | null
          client_nome: string | null
          como_lidar: Json | null
          contact_id: string | null
          criado_em: string | null
          direcionamentos_dados: string[] | null
          entregaveis_pendentes: string[] | null
          estrategista_id: string | null
          estrategista_nome: string | null
          ia_score: number | null
          id: string
          is_group: boolean | null
          nivel_confianca_cliente: string | null
          nivel_execucao: string | null
          nota_detalhada: string | null
          objecoes: Json | null
          proximos_passos: Json | null
          qualidade_consultoria_estrategista: number | null
          resumo: string | null
          risco_abandono: string | null
          semana_inicio: string
          sentimento_geral: string | null
          sugestoes_estrategista: string[] | null
          temas_tratados: string[] | null
          tenant_id: string
          topicos: Json | null
          total_conversas: number | null
          total_mensagens: number | null
        }
        Insert: {
          alertas?: Json | null
          bloqueios?: string[] | null
          clareza_posicionamento?: string | null
          client_id?: string | null
          client_nome?: string | null
          como_lidar?: Json | null
          contact_id?: string | null
          criado_em?: string | null
          direcionamentos_dados?: string[] | null
          entregaveis_pendentes?: string[] | null
          estrategista_id?: string | null
          estrategista_nome?: string | null
          ia_score?: number | null
          id?: string
          is_group?: boolean | null
          nivel_confianca_cliente?: string | null
          nivel_execucao?: string | null
          nota_detalhada?: string | null
          objecoes?: Json | null
          proximos_passos?: Json | null
          qualidade_consultoria_estrategista?: number | null
          resumo?: string | null
          risco_abandono?: string | null
          semana_inicio: string
          sentimento_geral?: string | null
          sugestoes_estrategista?: string[] | null
          temas_tratados?: string[] | null
          tenant_id: string
          topicos?: Json | null
          total_conversas?: number | null
          total_mensagens?: number | null
        }
        Update: {
          alertas?: Json | null
          bloqueios?: string[] | null
          clareza_posicionamento?: string | null
          client_id?: string | null
          client_nome?: string | null
          como_lidar?: Json | null
          contact_id?: string | null
          criado_em?: string | null
          direcionamentos_dados?: string[] | null
          entregaveis_pendentes?: string[] | null
          estrategista_id?: string | null
          estrategista_nome?: string | null
          ia_score?: number | null
          id?: string
          is_group?: boolean | null
          nivel_confianca_cliente?: string | null
          nivel_execucao?: string | null
          nota_detalhada?: string | null
          objecoes?: Json | null
          proximos_passos?: Json | null
          qualidade_consultoria_estrategista?: number | null
          resumo?: string | null
          risco_abandono?: string | null
          semana_inicio?: string
          sentimento_geral?: string | null
          sugestoes_estrategista?: string[] | null
          temas_tratados?: string[] | null
          tenant_id?: string
          topicos?: Json | null
          total_conversas?: number | null
          total_mensagens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_weekly_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_weekly_reports_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "chat_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_weekly_reports_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_weekly_reports_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_weekly_reports_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "chat_weekly_reports_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "chat_weekly_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_alerts: {
        Row: {
          client_id: string
          criado_em: string
          data_alerta: string | null
          descricao: string | null
          id: string
          resolvido: boolean
          resolvido_em: string | null
          tenant_id: string
          titulo: string
          user_id: string
        }
        Insert: {
          client_id: string
          criado_em?: string
          data_alerta?: string | null
          descricao?: string | null
          id?: string
          resolvido?: boolean
          resolvido_em?: string | null
          tenant_id: string
          titulo: string
          user_id: string
        }
        Update: {
          client_id?: string
          criado_em?: string
          data_alerta?: string | null
          descricao?: string | null
          id?: string
          resolvido?: boolean
          resolvido_em?: string | null
          tenant_id?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "client_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      client_assignment_events: {
        Row: {
          acao: string
          antes: Json | null
          ator_id: string
          ator_nome: string
          client_id: string
          depois: Json | null
          id: string
          motivo: string
          ocorrido_em: string
          operacao_id: string
          origem: string
          revisao: number
          tenant_id: string
        }
        Insert: {
          acao: string
          antes?: Json | null
          ator_id: string
          ator_nome: string
          client_id: string
          depois?: Json | null
          id?: string
          motivo: string
          ocorrido_em?: string
          operacao_id: string
          origem: string
          revisao: number
          tenant_id: string
        }
        Update: {
          acao?: string
          antes?: Json | null
          ator_id?: string
          ator_nome?: string
          client_id?: string
          depois?: Json | null
          id?: string
          motivo?: string
          ocorrido_em?: string
          operacao_id?: string
          origem?: string
          revisao?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignment_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignment_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assignment_operations: {
        Row: {
          acao: string
          ator_id: string
          client_id: string
          criada_em: string
          id: string
          idempotencia: string
          motivo: string
          origem: string
          pedido: Json
          resposta: Json | null
          tenant_id: string
          transacao: number
        }
        Insert: {
          acao: string
          ator_id: string
          client_id: string
          criada_em?: string
          id?: string
          idempotencia: string
          motivo: string
          origem?: string
          pedido: Json
          resposta?: Json | null
          tenant_id: string
          transacao?: number
        }
        Update: {
          acao?: string
          ator_id?: string
          client_id?: string
          criada_em?: string
          id?: string
          idempotencia?: string
          motivo?: string
          origem?: string
          pedido?: Json
          resposta?: Json | null
          tenant_id?: string
          transacao?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_assignment_operations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignment_operations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assignment_state: {
        Row: {
          client_id: string
          historico_desde: string
          revisao: number
          tenant_id: string
        }
        Insert: {
          client_id: string
          historico_desde?: string
          revisao?: number
          tenant_id: string
        }
        Update: {
          client_id?: string
          historico_desde?: string
          revisao?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignment_state_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignment_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assignments: {
        Row: {
          ativo: boolean
          client_id: string
          criado_em: string
          id: string
          tenant_id: string
          tipo: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          client_id: string
          criado_em?: string
          id?: string
          tenant_id: string
          tipo: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          client_id?: string
          criado_em?: string
          id?: string
          tenant_id?: string
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "client_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      client_contracts: {
        Row: {
          atualizado_em: string | null
          bonus: string | null
          cancelamento: string | null
          client_id: string
          comprovante_entrada: string | null
          crescimento_seguidores: number | null
          criado_em: string | null
          data_assinatura: string | null
          data_pg_entrada: string | null
          data_renovacao: string | null
          data_vencimento: string | null
          email_enviado: boolean | null
          entregas_prazo: number | null
          entregas_totais: number | null
          especialista: string | null
          faturamento_bruto: string | null
          financeiro_ok: boolean | null
          forma_pagamento: string | null
          funil: string | null
          id: string
          link_clicksign: string | null
          notas: string | null
          nps: string | null
          num_parcelas: number | null
          plano_dias: number | null
          produto: string | null
          seguidores_fim: number | null
          seguidores_inicio: number | null
          semanas: number | null
          status: string | null
          tenant_id: string
          treinador: string | null
          upgrade: string | null
          valor_entrada: string | null
          valor_parcela: string | null
          venda_diretoria: boolean | null
          venda_interna: boolean | null
          vendedor: string | null
          videos_postados: number | null
        }
        Insert: {
          atualizado_em?: string | null
          bonus?: string | null
          cancelamento?: string | null
          client_id: string
          comprovante_entrada?: string | null
          crescimento_seguidores?: number | null
          criado_em?: string | null
          data_assinatura?: string | null
          data_pg_entrada?: string | null
          data_renovacao?: string | null
          data_vencimento?: string | null
          email_enviado?: boolean | null
          entregas_prazo?: number | null
          entregas_totais?: number | null
          especialista?: string | null
          faturamento_bruto?: string | null
          financeiro_ok?: boolean | null
          forma_pagamento?: string | null
          funil?: string | null
          id?: string
          link_clicksign?: string | null
          notas?: string | null
          nps?: string | null
          num_parcelas?: number | null
          plano_dias?: number | null
          produto?: string | null
          seguidores_fim?: number | null
          seguidores_inicio?: number | null
          semanas?: number | null
          status?: string | null
          tenant_id: string
          treinador?: string | null
          upgrade?: string | null
          valor_entrada?: string | null
          valor_parcela?: string | null
          venda_diretoria?: boolean | null
          venda_interna?: boolean | null
          vendedor?: string | null
          videos_postados?: number | null
        }
        Update: {
          atualizado_em?: string | null
          bonus?: string | null
          cancelamento?: string | null
          client_id?: string
          comprovante_entrada?: string | null
          crescimento_seguidores?: number | null
          criado_em?: string | null
          data_assinatura?: string | null
          data_pg_entrada?: string | null
          data_renovacao?: string | null
          data_vencimento?: string | null
          email_enviado?: boolean | null
          entregas_prazo?: number | null
          entregas_totais?: number | null
          especialista?: string | null
          faturamento_bruto?: string | null
          financeiro_ok?: boolean | null
          forma_pagamento?: string | null
          funil?: string | null
          id?: string
          link_clicksign?: string | null
          notas?: string | null
          nps?: string | null
          num_parcelas?: number | null
          plano_dias?: number | null
          produto?: string | null
          seguidores_fim?: number | null
          seguidores_inicio?: number | null
          semanas?: number | null
          status?: string | null
          tenant_id?: string
          treinador?: string | null
          upgrade?: string | null
          valor_entrada?: string | null
          valor_parcela?: string | null
          venda_diretoria?: boolean | null
          venda_interna?: boolean | null
          vendedor?: string | null
          videos_postados?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          author_id: string | null
          author_nome: string | null
          client_id: string
          conteudo: string
          created_at: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_nome?: string | null
          client_id: string
          conteudo: string
          created_at?: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_nome?: string | null
          client_id?: string
          conteudo?: string
          created_at?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_canais: {
        Row: {
          atualizado_em: string
          chave: string
          client_id: string | null
          criado_em: string
          evidencias: Json
          id: string
          origem: string
          revisado_em: string | null
          revisado_por: string | null
          score: number | null
          status: string
          tenant_id: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          chave: string
          client_id?: string | null
          criado_em?: string
          evidencias?: Json
          id?: string
          origem: string
          revisado_em?: string | null
          revisado_por?: string | null
          score?: number | null
          status: string
          tenant_id: string
          tipo: string
        }
        Update: {
          atualizado_em?: string
          chave?: string
          client_id?: string | null
          criado_em?: string
          evidencias?: Json
          id?: string
          origem?: string
          revisado_em?: string | null
          revisado_por?: string | null
          score?: number | null
          status?: string
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_canais_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_canais_revisado_por_fkey"
            columns: ["revisado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_canais_revisado_por_fkey"
            columns: ["revisado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_canais_revisado_por_fkey"
            columns: ["revisado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "cliente_canais_revisado_por_fkey"
            columns: ["revisado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cliente_canais_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_relacionamento: {
        Row: {
          analisado_ate: string | null
          analisado_em: string | null
          atualizado_em: string
          client_id: string
          cobertura: Json
          confianca: number
          criado_em: string
          custo_usd: number | null
          dia_processado: string | null
          eventos: Json
          metricas: Json
          modelo: string | null
          motivo: string | null
          pendencias: Json
          processado_em: string | null
          reivindicado_em: string | null
          resumo: string
          risco: string
          risco_motivos: string[]
          satisfacao: string
          sinais_cliente: string[]
          tenant_id: string
          tendencia: string | null
          tokens_entrada: number | null
          tokens_saida: number | null
          versao_prompt: string | null
        }
        Insert: {
          analisado_ate?: string | null
          analisado_em?: string | null
          atualizado_em?: string
          client_id: string
          cobertura?: Json
          confianca?: number
          criado_em?: string
          custo_usd?: number | null
          dia_processado?: string | null
          eventos?: Json
          metricas?: Json
          modelo?: string | null
          motivo?: string | null
          pendencias?: Json
          processado_em?: string | null
          reivindicado_em?: string | null
          resumo?: string
          risco?: string
          risco_motivos?: string[]
          satisfacao?: string
          sinais_cliente?: string[]
          tenant_id: string
          tendencia?: string | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
          versao_prompt?: string | null
        }
        Update: {
          analisado_ate?: string | null
          analisado_em?: string | null
          atualizado_em?: string
          client_id?: string
          cobertura?: Json
          confianca?: number
          criado_em?: string
          custo_usd?: number | null
          dia_processado?: string | null
          eventos?: Json
          metricas?: Json
          modelo?: string | null
          motivo?: string | null
          pendencias?: Json
          processado_em?: string | null
          reivindicado_em?: string | null
          resumo?: string
          risco?: string
          risco_motivos?: string[]
          satisfacao?: string
          sinais_cliente?: string[]
          tenant_id?: string
          tendencia?: string | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
          versao_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_relacionamento_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_relacionamento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_relacionamento_hist: {
        Row: {
          analisado_ate: string | null
          client_id: string
          confianca: number
          criado_em: string
          id: string
          metricas: Json
          modelo: string | null
          motivo: string | null
          pendencias: Json
          resumo: string
          risco: string
          risco_motivos: string[]
          satisfacao: string
          sinais_cliente: string[]
          tenant_id: string
          tendencia: string | null
          versao_prompt: string | null
        }
        Insert: {
          analisado_ate?: string | null
          client_id: string
          confianca: number
          criado_em?: string
          id?: string
          metricas?: Json
          modelo?: string | null
          motivo?: string | null
          pendencias?: Json
          resumo?: string
          risco: string
          risco_motivos?: string[]
          satisfacao: string
          sinais_cliente?: string[]
          tenant_id: string
          tendencia?: string | null
          versao_prompt?: string | null
        }
        Update: {
          analisado_ate?: string | null
          client_id?: string
          confianca?: number
          criado_em?: string
          id?: string
          metricas?: Json
          modelo?: string | null
          motivo?: string | null
          pendencias?: Json
          resumo?: string
          risco?: string
          risco_motivos?: string[]
          satisfacao?: string
          sinais_cliente?: string[]
          tenant_id?: string
          tendencia?: string | null
          versao_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_relacionamento_hist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_relacionamento_hist_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_relacionamento_uso: {
        Row: {
          chamadas_ia: number
          custo_usd: number
          dia: string
          previas: number
          tenant_id: string
          ultima_previa_em: string | null
        }
        Insert: {
          chamadas_ia?: number
          custo_usd?: number
          dia: string
          previas?: number
          tenant_id: string
          ultima_previa_em?: string | null
        }
        Update: {
          chamadas_ia?: number
          custo_usd?: number
          dia?: string
          previas?: number
          tenant_id?: string
          ultima_previa_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_relacionamento_uso_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          ativo: boolean
          atualizado_em: string
          cnpj: string | null
          criado_em: string
          email: string | null
          empresa: string | null
          endereco: string | null
          faturamento: string | null
          id: string
          instagram: string | null
          logo_url: string | null
          nicho: string | null
          nome: string
          nota: number | null
          notas: string | null
          posicionamento: string | null
          razao_social: string | null
          segmento: string | null
          telefone: string | null
          tenant_id: string
          whatsapp: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          faturamento?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          nicho?: string | null
          nome: string
          nota?: number | null
          notas?: string | null
          posicionamento?: string | null
          razao_social?: string | null
          segmento?: string | null
          telefone?: string | null
          tenant_id: string
          whatsapp?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          faturamento?: string | null
          id?: string
          instagram?: string | null
          logo_url?: string | null
          nicho?: string | null
          nome?: string
          nota?: number | null
          notas?: string | null
          posicionamento?: string | null
          razao_social?: string | null
          segmento?: string | null
          telefone?: string | null
          tenant_id?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_devedores: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          data_vencimento: string | null
          descricao_divida: string | null
          id: string
          instance_id: string | null
          nome: string
          numero_whatsapp: string
          passo_atual: number | null
          proximo_envio_em: string | null
          regua_id: string | null
          status: string | null
          tenant_id: string
          valor_divida: number | null
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          data_vencimento?: string | null
          descricao_divida?: string | null
          id?: string
          instance_id?: string | null
          nome: string
          numero_whatsapp: string
          passo_atual?: number | null
          proximo_envio_em?: string | null
          regua_id?: string | null
          status?: string | null
          tenant_id: string
          valor_divida?: number | null
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          data_vencimento?: string | null
          descricao_divida?: string | null
          id?: string
          instance_id?: string | null
          nome?: string
          numero_whatsapp?: string
          passo_atual?: number | null
          proximo_envio_em?: string | null
          regua_id?: string | null
          status?: string | null
          tenant_id?: string
          valor_divida?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_devedores_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "cobranca_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_devedores_regua_id_fkey"
            columns: ["regua_id"]
            isOneToOne: false
            referencedRelation: "cobranca_reguas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_devedores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_instances: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          dias_semana: number[] | null
          envios_hora_max: number | null
          horario_fim: string | null
          horario_inicio: string | null
          id: string
          instance_id: string
          intervalo_max_segundos: number | null
          intervalo_min_segundos: number | null
          nome: string
          numero_whatsapp: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          dias_semana?: number[] | null
          envios_hora_max?: number | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          instance_id: string
          intervalo_max_segundos?: number | null
          intervalo_min_segundos?: number | null
          nome: string
          numero_whatsapp?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          dias_semana?: number[] | null
          envios_hora_max?: number | null
          horario_fim?: string | null
          horario_inicio?: string | null
          id?: string
          instance_id?: string
          intervalo_max_segundos?: number | null
          intervalo_min_segundos?: number | null
          nome?: string
          numero_whatsapp?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_regua_passos: {
        Row: {
          criado_em: string | null
          dias_apos_anterior: number | null
          id: string
          mensagem_template: string
          ordem: number
          regua_id: string | null
          tenant_id: string
          usar_ia_variacao: boolean | null
        }
        Insert: {
          criado_em?: string | null
          dias_apos_anterior?: number | null
          id?: string
          mensagem_template: string
          ordem: number
          regua_id?: string | null
          tenant_id: string
          usar_ia_variacao?: boolean | null
        }
        Update: {
          criado_em?: string | null
          dias_apos_anterior?: number | null
          id?: string
          mensagem_template?: string
          ordem?: number
          regua_id?: string | null
          tenant_id?: string
          usar_ia_variacao?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_regua_passos_regua_id_fkey"
            columns: ["regua_id"]
            isOneToOne: false
            referencedRelation: "cobranca_reguas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_regua_passos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_reguas: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          descricao: string | null
          id: string
          nome: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          descricao?: string | null
          id?: string
          nome: string
          tenant_id: string
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_reguas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_sends: {
        Row: {
          devedor_id: string | null
          enviado_em: string | null
          id: string
          instance_id: string | null
          mensagem_enviada: string
          passo: number
          status_envio: string | null
          tenant_id: string
        }
        Insert: {
          devedor_id?: string | null
          enviado_em?: string | null
          id?: string
          instance_id?: string | null
          mensagem_enviada: string
          passo: number
          status_envio?: string | null
          tenant_id: string
        }
        Update: {
          devedor_id?: string | null
          enviado_em?: string | null
          id?: string
          instance_id?: string | null
          mensagem_enviada?: string
          passo?: number
          status_envio?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_sends_devedor_id_fkey"
            columns: ["devedor_id"]
            isOneToOne: false
            referencedRelation: "cobranca_devedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_sends_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "cobranca_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_sends_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes: {
        Row: {
          cliente_nome: string
          contrato_id: string
          criado_em: string
          editado_em: string | null
          editado_por: string | null
          eh_bonus: boolean
          estrategista_id: string
          extrato_id: string | null
          id: string
          mes_referencia: string
          observacoes_gestor: string | null
          parcela_num: number
          postergada_para: string | null
          status: string
          tenant_id: string
          total_parcelas: number
          valor_calculado: number
          valor_final: number
        }
        Insert: {
          cliente_nome: string
          contrato_id: string
          criado_em?: string
          editado_em?: string | null
          editado_por?: string | null
          eh_bonus?: boolean
          estrategista_id: string
          extrato_id?: string | null
          id?: string
          mes_referencia: string
          observacoes_gestor?: string | null
          parcela_num: number
          postergada_para?: string | null
          status?: string
          tenant_id: string
          total_parcelas: number
          valor_calculado: number
          valor_final: number
        }
        Update: {
          cliente_nome?: string
          contrato_id?: string
          criado_em?: string
          editado_em?: string | null
          editado_por?: string | null
          eh_bonus?: boolean
          estrategista_id?: string
          extrato_id?: string | null
          id?: string
          mes_referencia?: string
          observacoes_gestor?: string | null
          parcela_num?: number
          postergada_para?: string | null
          status?: string
          tenant_id?: string
          total_parcelas?: number
          valor_calculado?: number
          valor_final?: number
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_contratos_alertas"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "comissoes_editado_por_fkey"
            columns: ["editado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_editado_por_fkey"
            columns: ["editado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_editado_por_fkey"
            columns: ["editado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "comissoes_editado_por_fkey"
            columns: ["editado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "comissoes_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "comissoes_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "comissoes_extrato_id_fkey"
            columns: ["extrato_id"]
            isOneToOne: false
            referencedRelation: "extratos_mensais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comissoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      comissoes_backup_20260602: {
        Row: {
          cliente_nome: string | null
          contrato_id: string | null
          criado_em: string | null
          editado_em: string | null
          editado_por: string | null
          estrategista_id: string | null
          extrato_id: string | null
          id: string | null
          mes_referencia: string | null
          observacoes_gestor: string | null
          parcela_num: number | null
          postergada_para: string | null
          status: string | null
          total_parcelas: number | null
          valor_calculado: number | null
          valor_final: number | null
        }
        Insert: {
          cliente_nome?: string | null
          contrato_id?: string | null
          criado_em?: string | null
          editado_em?: string | null
          editado_por?: string | null
          estrategista_id?: string | null
          extrato_id?: string | null
          id?: string | null
          mes_referencia?: string | null
          observacoes_gestor?: string | null
          parcela_num?: number | null
          postergada_para?: string | null
          status?: string | null
          total_parcelas?: number | null
          valor_calculado?: number | null
          valor_final?: number | null
        }
        Update: {
          cliente_nome?: string | null
          contrato_id?: string | null
          criado_em?: string | null
          editado_em?: string | null
          editado_por?: string | null
          estrategista_id?: string | null
          extrato_id?: string | null
          id?: string | null
          mes_referencia?: string | null
          observacoes_gestor?: string | null
          parcela_num?: number | null
          postergada_para?: string | null
          status?: string | null
          total_parcelas?: number | null
          valor_calculado?: number | null
          valor_final?: number | null
        }
        Relationships: []
      }
      comissoes_backup_20260630: {
        Row: {
          cliente_nome: string | null
          contrato_id: string | null
          criado_em: string | null
          editado_em: string | null
          editado_por: string | null
          eh_bonus: boolean | null
          estrategista_id: string | null
          extrato_id: string | null
          id: string | null
          mes_referencia: string | null
          observacoes_gestor: string | null
          parcela_num: number | null
          postergada_para: string | null
          status: string | null
          total_parcelas: number | null
          valor_calculado: number | null
          valor_final: number | null
        }
        Insert: {
          cliente_nome?: string | null
          contrato_id?: string | null
          criado_em?: string | null
          editado_em?: string | null
          editado_por?: string | null
          eh_bonus?: boolean | null
          estrategista_id?: string | null
          extrato_id?: string | null
          id?: string | null
          mes_referencia?: string | null
          observacoes_gestor?: string | null
          parcela_num?: number | null
          postergada_para?: string | null
          status?: string | null
          total_parcelas?: number | null
          valor_calculado?: number | null
          valor_final?: number | null
        }
        Update: {
          cliente_nome?: string | null
          contrato_id?: string | null
          criado_em?: string | null
          editado_em?: string | null
          editado_por?: string | null
          eh_bonus?: boolean | null
          estrategista_id?: string | null
          extrato_id?: string | null
          id?: string | null
          mes_referencia?: string | null
          observacoes_gestor?: string | null
          parcela_num?: number | null
          postergada_para?: string | null
          status?: string | null
          total_parcelas?: number | null
          valor_calculado?: number | null
          valor_final?: number | null
        }
        Relationships: []
      }
      comissoes_backup_20260706: {
        Row: {
          cliente_nome: string | null
          contrato_id: string | null
          criado_em: string | null
          editado_em: string | null
          editado_por: string | null
          eh_bonus: boolean | null
          estrategista_id: string | null
          extrato_id: string | null
          id: string | null
          mes_referencia: string | null
          observacoes_gestor: string | null
          parcela_num: number | null
          postergada_para: string | null
          status: string | null
          total_parcelas: number | null
          valor_calculado: number | null
          valor_final: number | null
        }
        Insert: {
          cliente_nome?: string | null
          contrato_id?: string | null
          criado_em?: string | null
          editado_em?: string | null
          editado_por?: string | null
          eh_bonus?: boolean | null
          estrategista_id?: string | null
          extrato_id?: string | null
          id?: string | null
          mes_referencia?: string | null
          observacoes_gestor?: string | null
          parcela_num?: number | null
          postergada_para?: string | null
          status?: string | null
          total_parcelas?: number | null
          valor_calculado?: number | null
          valor_final?: number | null
        }
        Update: {
          cliente_nome?: string | null
          contrato_id?: string | null
          criado_em?: string | null
          editado_em?: string | null
          editado_por?: string | null
          eh_bonus?: boolean | null
          estrategista_id?: string | null
          extrato_id?: string | null
          id?: string | null
          mes_referencia?: string | null
          observacoes_gestor?: string | null
          parcela_num?: number | null
          postergada_para?: string | null
          status?: string | null
          total_parcelas?: number | null
          valor_calculado?: number | null
          valor_final?: number | null
        }
        Relationships: []
      }
      comissoes_papeis: {
        Row: {
          atualizado_em: string
          criado_em: string
          papel: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          papel?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          papel?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comissoes_papeis_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      company_areas: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          position: string
          sort_order: number | null
          tenant_id: string
          type: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          position: string
          sort_order?: number | null
          tenant_id: string
          type: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          position?: string
          sort_order?: number | null
          tenant_id?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_anexos: {
        Row: {
          categoria: string
          contrato_id: string
          enviado_em: string
          enviado_por: string | null
          id: string
          mime_type: string | null
          nome_original: string
          storage_path: string
          tamanho_bytes: number | null
          tenant_id: string
        }
        Insert: {
          categoria?: string
          contrato_id: string
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          mime_type?: string | null
          nome_original: string
          storage_path: string
          tamanho_bytes?: number | null
          tenant_id: string
        }
        Update: {
          categoria?: string
          contrato_id?: string
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          mime_type?: string | null
          nome_original?: string
          storage_path?: string
          tamanho_bytes?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_anexos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_anexos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_contratos_alertas"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contrato_anexos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_anexos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_anexos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "contrato_anexos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contrato_anexos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_modelos: {
        Row: {
          arquivo_b64: string | null
          arquivo_nome: string | null
          ativo: boolean
          atualizado_em: string
          conteudo: string | null
          criado_em: string
          id: string
          produto_id: string | null
          tenant_id: string
          titulo: string | null
          variante: string | null
        }
        Insert: {
          arquivo_b64?: string | null
          arquivo_nome?: string | null
          ativo?: boolean
          atualizado_em?: string
          conteudo?: string | null
          criado_em?: string
          id?: string
          produto_id?: string | null
          tenant_id: string
          titulo?: string | null
          variante?: string | null
        }
        Update: {
          arquivo_b64?: string | null
          arquivo_nome?: string | null
          ativo?: boolean
          atualizado_em?: string
          conteudo?: string | null
          criado_em?: string
          id?: string
          produto_id?: string | null
          tenant_id?: string
          titulo?: string | null
          variante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_modelos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_modelos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_pdf_extractions: {
        Row: {
          anexo_id: string | null
          aplicado_em: string | null
          aplicado_por: string | null
          contrato_id: string
          criado_em: string
          criado_por: string | null
          dados_extraidos: Json
          id: string
          modelo: string
          tenant_id: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          anexo_id?: string | null
          aplicado_em?: string | null
          aplicado_por?: string | null
          contrato_id: string
          criado_em?: string
          criado_por?: string | null
          dados_extraidos: Json
          id?: string
          modelo: string
          tenant_id: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          anexo_id?: string | null
          aplicado_em?: string | null
          aplicado_por?: string | null
          contrato_id?: string
          criado_em?: string
          criado_por?: string | null
          dados_extraidos?: Json
          id?: string
          modelo?: string
          tenant_id?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_pdf_extractions_anexo_id_fkey"
            columns: ["anexo_id"]
            isOneToOne: false
            referencedRelation: "contrato_anexos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_pdf_extractions_aplicado_por_fkey"
            columns: ["aplicado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_pdf_extractions_aplicado_por_fkey"
            columns: ["aplicado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_pdf_extractions_aplicado_por_fkey"
            columns: ["aplicado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "contrato_pdf_extractions_aplicado_por_fkey"
            columns: ["aplicado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contrato_pdf_extractions_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_pdf_extractions_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_contratos_alertas"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contrato_pdf_extractions_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_pdf_extractions_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_pdf_extractions_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "contrato_pdf_extractions_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contrato_pdf_extractions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_clientes: {
        Row: { tenant_id: string; contrato_id: string; cliente_id: string; criado_em: string }
        Insert: { tenant_id: string; contrato_id: string; cliente_id: string; criado_em?: string }
        Update: { tenant_id?: string; contrato_id?: string; cliente_id?: string; criado_em?: string }
        Relationships: [
          { foreignKeyName: "contrato_clientes_contrato_id_tenant_id_fkey"; columns: ["contrato_id", "tenant_id"]; isOneToOne: false; referencedRelation: "contratos"; referencedColumns: ["id", "tenant_id"] },
          { foreignKeyName: "contrato_clientes_cliente_id_tenant_id_fkey"; columns: ["cliente_id", "tenant_id"]; isOneToOne: false; referencedRelation: "clients"; referencedColumns: ["id", "tenant_id"] }
        ]
      }
      contrato_tags: {
        Row: {
          contrato_id: string
          criado_em: string
          criado_por: string | null
          tag_id: string
          tenant_id: string
        }
        Insert: {
          contrato_id: string
          criado_em?: string
          criado_por?: string | null
          tag_id: string
          tenant_id: string
        }
        Update: {
          contrato_id?: string
          criado_em?: string
          criado_por?: string | null
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_tags_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_tags_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "v_contratos_alertas"
            referencedColumns: ["contrato_id"]
          },
          {
            foreignKeyName: "contrato_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          atualizado_em: string
          bonus: string | null
          cliente_id: string | null
          cliente_nome: string
          cpf_cnpj: string | null
          crescimento_seguidores: number | null
          criado_em: string
          criado_por: string | null
          data_assinatura: string | null
          data_fechamento: string
          data_pagamento: string | null
          email: string | null
          empresa: string | null
          endereco: string | null
          entrada: number | null
          entregas_no_prazo: number | null
          entregas_totais: number | null
          estrategista_id: string | null
          estrategista_nome_raw: string | null
          fat_bruto: number | null
          faturamento: string | null
          forma_pagamento: string | null
          ghl_assinada_erro: string | null
          ghl_assinada_oportunidade_id: string | null
          ghl_assinada_sincronizada_em: string | null
          id: string
          importado_em: string | null
          instagram: string | null
          link_clicksign: string | null
          nicho: string | null
          notion_numero: string | null
          notion_page_id: string | null
          notion_raw: Json | null
          notion_ultima_edicao: string | null
          nps_vip: string | null
          num_parcelas: number
          observacoes: string | null
          pagador_cpf_cnpj: string | null
          pagador_diferente: boolean
          pagador_nome: string | null
          pagador_observacao: string | null
          pagador_relacao: string | null
          pagamentos: Json
          percentual_aplicado: number
          pg_entrada: string | null
          plano_dias: number | null
          posicionamento: string | null
          produto_id: string | null
          produto_nome: string | null
          renovacao: string | null
          resumo: string | null
          seguidores_fim: number | null
          seguidores_inicio: number | null
          semanas: number | null
          status: string
          status_secundario: string | null
          tenant_id: string
          treinador: string | null
          valor_parcela: number | null
          valor_total: number
          vigencia_fim: string | null
          vigencia_motivo: string | null
          vencimento: string | null
          venda_diretoria: boolean | null
          venda_interna: boolean | null
          venda_pendente_id: string | null
          vendedor: string | null
          videos_postados: number | null
          whatsapp: string | null
        }
        Insert: {
          atualizado_em?: string
          bonus?: string | null
          cliente_id?: string | null
          cliente_nome: string
          cpf_cnpj?: string | null
          crescimento_seguidores?: number | null
          criado_em?: string
          criado_por?: string | null
          data_assinatura?: string | null
          data_fechamento: string
          data_pagamento?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          entrada?: number | null
          entregas_no_prazo?: number | null
          entregas_totais?: number | null
          estrategista_id?: string | null
          estrategista_nome_raw?: string | null
          fat_bruto?: number | null
          faturamento?: string | null
          forma_pagamento?: string | null
          ghl_assinada_erro?: string | null
          ghl_assinada_oportunidade_id?: string | null
          ghl_assinada_sincronizada_em?: string | null
          id?: string
          importado_em?: string | null
          instagram?: string | null
          link_clicksign?: string | null
          nicho?: string | null
          notion_numero?: string | null
          notion_page_id?: string | null
          notion_raw?: Json | null
          notion_ultima_edicao?: string | null
          nps_vip?: string | null
          num_parcelas?: number
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json
          percentual_aplicado?: number
          pg_entrada?: string | null
          plano_dias?: number | null
          posicionamento?: string | null
          produto_id?: string | null
          produto_nome?: string | null
          renovacao?: string | null
          resumo?: string | null
          seguidores_fim?: number | null
          seguidores_inicio?: number | null
          semanas?: number | null
          status?: string
          status_secundario?: string | null
          tenant_id: string
          treinador?: string | null
          valor_parcela?: number | null
          valor_total: number
          vigencia_fim?: string | null
          vigencia_motivo?: string | null
          vencimento?: string | null
          venda_diretoria?: boolean | null
          venda_interna?: boolean | null
          venda_pendente_id?: string | null
          vendedor?: string | null
          videos_postados?: number | null
          whatsapp?: string | null
        }
        Update: {
          atualizado_em?: string
          bonus?: string | null
          cliente_id?: string | null
          cliente_nome?: string
          cpf_cnpj?: string | null
          crescimento_seguidores?: number | null
          criado_em?: string
          criado_por?: string | null
          data_assinatura?: string | null
          data_fechamento?: string
          data_pagamento?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          entrada?: number | null
          entregas_no_prazo?: number | null
          entregas_totais?: number | null
          estrategista_id?: string | null
          estrategista_nome_raw?: string | null
          fat_bruto?: number | null
          faturamento?: string | null
          forma_pagamento?: string | null
          ghl_assinada_erro?: string | null
          ghl_assinada_oportunidade_id?: string | null
          ghl_assinada_sincronizada_em?: string | null
          id?: string
          importado_em?: string | null
          instagram?: string | null
          link_clicksign?: string | null
          nicho?: string | null
          notion_numero?: string | null
          notion_page_id?: string | null
          notion_raw?: Json | null
          notion_ultima_edicao?: string | null
          nps_vip?: string | null
          num_parcelas?: number
          observacoes?: string | null
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json
          percentual_aplicado?: number
          pg_entrada?: string | null
          plano_dias?: number | null
          posicionamento?: string | null
          produto_id?: string | null
          produto_nome?: string | null
          renovacao?: string | null
          resumo?: string | null
          seguidores_fim?: number | null
          seguidores_inicio?: number | null
          semanas?: number | null
          status?: string
          status_secundario?: string | null
          tenant_id?: string
          treinador?: string | null
          valor_parcela?: number | null
          valor_total?: number
          vigencia_fim?: string | null
          vigencia_motivo?: string | null
          vencimento?: string | null
          venda_diretoria?: boolean | null
          venda_interna?: boolean | null
          venda_pendente_id?: string | null
          vendedor?: string | null
          videos_postados?: number | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "contratos_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contratos_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "contratos_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contratos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_venda_pendente_id_fkey"
            columns: ["venda_pendente_id"]
            isOneToOne: false
            referencedRelation: "vendas_pendentes"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_audit_log: {
        Row: {
          alterado_em: string
          alterado_por: string | null
          campo: string | null
          contrato_id: string
          id: string
          operacao: string
          tenant_id: string
          valor_antigo: string | null
          valor_novo: string | null
        }
        Insert: {
          alterado_em?: string
          alterado_por?: string | null
          campo?: string | null
          contrato_id: string
          id?: string
          operacao: string
          tenant_id: string
          valor_antigo?: string | null
          valor_novo?: string | null
        }
        Update: {
          alterado_em?: string
          alterado_por?: string | null
          campo?: string | null
          contrato_id?: string
          id?: string
          operacao?: string
          tenant_id?: string
          valor_antigo?: string | null
          valor_novo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_audit_log_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_audit_log_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_audit_log_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "contratos_audit_log_alterado_por_fkey"
            columns: ["alterado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contratos_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_backup_20260602: {
        Row: {
          atualizado_em: string | null
          bonus: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cpf_cnpj: string | null
          crescimento_seguidores: number | null
          criado_em: string | null
          criado_por: string | null
          data_fechamento: string | null
          email: string | null
          empresa: string | null
          endereco: string | null
          entrada: number | null
          entregas_no_prazo: number | null
          entregas_totais: number | null
          estrategista_id: string | null
          estrategista_nome_raw: string | null
          fat_bruto: number | null
          faturamento: string | null
          forma_pagamento: string | null
          id: string | null
          importado_em: string | null
          instagram: string | null
          link_clicksign: string | null
          nicho: string | null
          notion_numero: string | null
          notion_page_id: string | null
          notion_raw: Json | null
          notion_ultima_edicao: string | null
          nps_vip: string | null
          num_parcelas: number | null
          observacoes: string | null
          percentual_aplicado: number | null
          pg_entrada: string | null
          plano_dias: number | null
          posicionamento: string | null
          produto_id: string | null
          produto_nome: string | null
          renovacao: string | null
          resumo: string | null
          seguidores_fim: number | null
          seguidores_inicio: number | null
          semanas: number | null
          status: string | null
          status_secundario: string | null
          treinador: string | null
          valor_parcela: number | null
          valor_total: number | null
          vencimento: string | null
          venda_diretoria: boolean | null
          venda_interna: boolean | null
          vendedor: string | null
          videos_postados: number | null
          whatsapp: string | null
        }
        Insert: {
          atualizado_em?: string | null
          bonus?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          crescimento_seguidores?: number | null
          criado_em?: string | null
          criado_por?: string | null
          data_fechamento?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          entrada?: number | null
          entregas_no_prazo?: number | null
          entregas_totais?: number | null
          estrategista_id?: string | null
          estrategista_nome_raw?: string | null
          fat_bruto?: number | null
          faturamento?: string | null
          forma_pagamento?: string | null
          id?: string | null
          importado_em?: string | null
          instagram?: string | null
          link_clicksign?: string | null
          nicho?: string | null
          notion_numero?: string | null
          notion_page_id?: string | null
          notion_raw?: Json | null
          notion_ultima_edicao?: string | null
          nps_vip?: string | null
          num_parcelas?: number | null
          observacoes?: string | null
          percentual_aplicado?: number | null
          pg_entrada?: string | null
          plano_dias?: number | null
          posicionamento?: string | null
          produto_id?: string | null
          produto_nome?: string | null
          renovacao?: string | null
          resumo?: string | null
          seguidores_fim?: number | null
          seguidores_inicio?: number | null
          semanas?: number | null
          status?: string | null
          status_secundario?: string | null
          treinador?: string | null
          valor_parcela?: number | null
          valor_total?: number | null
          vencimento?: string | null
          venda_diretoria?: boolean | null
          venda_interna?: boolean | null
          vendedor?: string | null
          videos_postados?: number | null
          whatsapp?: string | null
        }
        Update: {
          atualizado_em?: string | null
          bonus?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          crescimento_seguidores?: number | null
          criado_em?: string | null
          criado_por?: string | null
          data_fechamento?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          entrada?: number | null
          entregas_no_prazo?: number | null
          entregas_totais?: number | null
          estrategista_id?: string | null
          estrategista_nome_raw?: string | null
          fat_bruto?: number | null
          faturamento?: string | null
          forma_pagamento?: string | null
          id?: string | null
          importado_em?: string | null
          instagram?: string | null
          link_clicksign?: string | null
          nicho?: string | null
          notion_numero?: string | null
          notion_page_id?: string | null
          notion_raw?: Json | null
          notion_ultima_edicao?: string | null
          nps_vip?: string | null
          num_parcelas?: number | null
          observacoes?: string | null
          percentual_aplicado?: number | null
          pg_entrada?: string | null
          plano_dias?: number | null
          posicionamento?: string | null
          produto_id?: string | null
          produto_nome?: string | null
          renovacao?: string | null
          resumo?: string | null
          seguidores_fim?: number | null
          seguidores_inicio?: number | null
          semanas?: number | null
          status?: string | null
          status_secundario?: string | null
          treinador?: string | null
          valor_parcela?: number | null
          valor_total?: number | null
          vencimento?: string | null
          venda_diretoria?: boolean | null
          venda_interna?: boolean | null
          vendedor?: string | null
          videos_postados?: number | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      contratos_backup_20260630: {
        Row: {
          atualizado_em: string | null
          bonus: string | null
          cliente_id: string | null
          cliente_nome: string | null
          cpf_cnpj: string | null
          crescimento_seguidores: number | null
          criado_em: string | null
          criado_por: string | null
          data_fechamento: string | null
          email: string | null
          empresa: string | null
          endereco: string | null
          entrada: number | null
          entregas_no_prazo: number | null
          entregas_totais: number | null
          estrategista_id: string | null
          estrategista_nome_raw: string | null
          fat_bruto: number | null
          faturamento: string | null
          forma_pagamento: string | null
          id: string | null
          importado_em: string | null
          instagram: string | null
          link_clicksign: string | null
          nicho: string | null
          notion_numero: string | null
          notion_page_id: string | null
          notion_raw: Json | null
          notion_ultima_edicao: string | null
          nps_vip: string | null
          num_parcelas: number | null
          observacoes: string | null
          percentual_aplicado: number | null
          pg_entrada: string | null
          plano_dias: number | null
          posicionamento: string | null
          produto_id: string | null
          produto_nome: string | null
          renovacao: string | null
          resumo: string | null
          seguidores_fim: number | null
          seguidores_inicio: number | null
          semanas: number | null
          status: string | null
          status_secundario: string | null
          treinador: string | null
          valor_parcela: number | null
          valor_total: number | null
          vencimento: string | null
          venda_diretoria: boolean | null
          venda_interna: boolean | null
          vendedor: string | null
          videos_postados: number | null
          whatsapp: string | null
        }
        Insert: {
          atualizado_em?: string | null
          bonus?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          crescimento_seguidores?: number | null
          criado_em?: string | null
          criado_por?: string | null
          data_fechamento?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          entrada?: number | null
          entregas_no_prazo?: number | null
          entregas_totais?: number | null
          estrategista_id?: string | null
          estrategista_nome_raw?: string | null
          fat_bruto?: number | null
          faturamento?: string | null
          forma_pagamento?: string | null
          id?: string | null
          importado_em?: string | null
          instagram?: string | null
          link_clicksign?: string | null
          nicho?: string | null
          notion_numero?: string | null
          notion_page_id?: string | null
          notion_raw?: Json | null
          notion_ultima_edicao?: string | null
          nps_vip?: string | null
          num_parcelas?: number | null
          observacoes?: string | null
          percentual_aplicado?: number | null
          pg_entrada?: string | null
          plano_dias?: number | null
          posicionamento?: string | null
          produto_id?: string | null
          produto_nome?: string | null
          renovacao?: string | null
          resumo?: string | null
          seguidores_fim?: number | null
          seguidores_inicio?: number | null
          semanas?: number | null
          status?: string | null
          status_secundario?: string | null
          treinador?: string | null
          valor_parcela?: number | null
          valor_total?: number | null
          vencimento?: string | null
          venda_diretoria?: boolean | null
          venda_interna?: boolean | null
          vendedor?: string | null
          videos_postados?: number | null
          whatsapp?: string | null
        }
        Update: {
          atualizado_em?: string | null
          bonus?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          cpf_cnpj?: string | null
          crescimento_seguidores?: number | null
          criado_em?: string | null
          criado_por?: string | null
          data_fechamento?: string | null
          email?: string | null
          empresa?: string | null
          endereco?: string | null
          entrada?: number | null
          entregas_no_prazo?: number | null
          entregas_totais?: number | null
          estrategista_id?: string | null
          estrategista_nome_raw?: string | null
          fat_bruto?: number | null
          faturamento?: string | null
          forma_pagamento?: string | null
          id?: string | null
          importado_em?: string | null
          instagram?: string | null
          link_clicksign?: string | null
          nicho?: string | null
          notion_numero?: string | null
          notion_page_id?: string | null
          notion_raw?: Json | null
          notion_ultima_edicao?: string | null
          nps_vip?: string | null
          num_parcelas?: number | null
          observacoes?: string | null
          percentual_aplicado?: number | null
          pg_entrada?: string | null
          plano_dias?: number | null
          posicionamento?: string | null
          produto_id?: string | null
          produto_nome?: string | null
          renovacao?: string | null
          resumo?: string | null
          seguidores_fim?: number | null
          seguidores_inicio?: number | null
          semanas?: number | null
          status?: string | null
          status_secundario?: string | null
          treinador?: string | null
          valor_parcela?: number | null
          valor_total?: number | null
          vencimento?: string | null
          venda_diretoria?: boolean | null
          venda_interna?: boolean | null
          vendedor?: string | null
          videos_postados?: number | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      contratos_dedup_removidos_20260602: {
        Row: {
          cliente_nome: string | null
          data_fechamento: string | null
          id: string | null
          motivo: string | null
          ncom: number | null
          produto_nome: string | null
          status: string | null
          valor_total: number | null
        }
        Insert: {
          cliente_nome?: string | null
          data_fechamento?: string | null
          id?: string | null
          motivo?: string | null
          ncom?: number | null
          produto_nome?: string | null
          status?: string | null
          valor_total?: number | null
        }
        Update: {
          cliente_nome?: string | null
          data_fechamento?: string | null
          id?: string | null
          motivo?: string | null
          ncom?: number | null
          produto_nome?: string | null
          status?: string | null
          valor_total?: number | null
        }
        Relationships: []
      }
      contratos_kanban_colunas: {
        Row: {
          atualizado_em: string
          cor: string
          criado_em: string
          id: string
          is_onboarding: boolean
          ordem: number
          status_chave: string
          tenant_id: string
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          cor?: string
          criado_em?: string
          id?: string
          is_onboarding?: boolean
          ordem?: number
          status_chave: string
          tenant_id: string
          titulo: string
        }
        Update: {
          atualizado_em?: string
          cor?: string
          criado_em?: string
          id?: string
          is_onboarding?: boolean
          ordem?: number
          status_chave?: string
          tenant_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratos_kanban_colunas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_eventos_recebidos: {
        Row: {
          crm_venda_id: string | null
          desk_venda_id: string | null
          event_id: string
          recebido_em: string
          resposta: Json
          tenant_id: string
        }
        Insert: {
          crm_venda_id?: string | null
          desk_venda_id?: string | null
          event_id: string
          recebido_em?: string
          resposta: Json
          tenant_id: string
        }
        Update: {
          crm_venda_id?: string | null
          desk_venda_id?: string | null
          event_id?: string
          recebido_em?: string
          resposta?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_eventos_recebidos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          atualizado_em: string
          criado_em: string
          descricao: string | null
          id: string
          nome: string
          product_id: string
          quantidade: number
          tenant_id: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
          product_id: string
          quantidade?: number
          tenant_id: string
          tipo?: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
          product_id?: string
          quantidade?: number
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          atualizado_em: string
          client_id: string
          criado_em: string
          deliverable_id: string
          id: string
          prazo: string | null
          responsavel_id: string | null
          status: string
          tenant_id: string
          titulo: string
        }
        Insert: {
          atualizado_em?: string
          client_id: string
          criado_em?: string
          deliverable_id: string
          id?: string
          prazo?: string | null
          responsavel_id?: string | null
          status?: string
          tenant_id: string
          titulo: string
        }
        Update: {
          atualizado_em?: string
          client_id?: string
          criado_em?: string
          deliverable_id?: string
          id?: string
          prazo?: string | null
          responsavel_id?: string | null
          status?: string
          tenant_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "deliveries_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_approvals: {
        Row: {
          aprovado: boolean
          aprovado_por: string | null
          criado_em: string
          delivery_id: string
          id: string
          notas: string | null
          tenant_id: string
          version_id: string
        }
        Insert: {
          aprovado: boolean
          aprovado_por?: string | null
          criado_em?: string
          delivery_id: string
          id?: string
          notas?: string | null
          tenant_id: string
          version_id: string
        }
        Update: {
          aprovado?: boolean
          aprovado_por?: string | null
          criado_em?: string
          delivery_id?: string
          id?: string
          notas?: string | null
          tenant_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_approvals_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_approvals_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_approvals_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "delivery_approvals_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "delivery_approvals_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_approvals_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "delivery_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_comments: {
        Row: {
          autor_id: string | null
          criado_em: string
          delivery_id: string
          id: string
          tenant_id: string
          texto: string
          version_id: string | null
        }
        Insert: {
          autor_id?: string | null
          criado_em?: string
          delivery_id: string
          id?: string
          tenant_id: string
          texto: string
          version_id?: string | null
        }
        Update: {
          autor_id?: string | null
          criado_em?: string
          delivery_id?: string
          id?: string
          tenant_id?: string
          texto?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_comments_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_comments_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_comments_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "delivery_comments_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "delivery_comments_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_comments_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "delivery_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_content_items: {
        Row: {
          criado_em: string
          id: string
          nome: string | null
          tamanho: number | null
          tenant_id: string
          texto: string | null
          tipo: string
          url: string | null
          version_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          nome?: string | null
          tamanho?: number | null
          tenant_id: string
          texto?: string | null
          tipo: string
          url?: string | null
          version_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          nome?: string | null
          tamanho?: number | null
          tenant_id?: string
          texto?: string | null
          tipo?: string
          url?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_content_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_content_items_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "delivery_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_versions: {
        Row: {
          criado_em: string
          criado_por: string | null
          delivery_id: string
          id: string
          notas: string | null
          tenant_id: string
          versao: number
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          delivery_id: string
          id?: string
          notas?: string | null
          tenant_id: string
          versao?: number
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          delivery_id?: string
          id?: string
          notas?: string | null
          tenant_id?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_versions_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_versions_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_versions_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "delivery_versions_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "delivery_versions_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      department_instance_assignments: {
        Row: {
          criado_em: string | null
          department_id: string
          id: string
          instance_id: string
          tenant_id: string
        }
        Insert: {
          criado_em?: string | null
          department_id: string
          id?: string
          instance_id: string
          tenant_id: string
        }
        Update: {
          criado_em?: string | null
          department_id?: string
          id?: string
          instance_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_instance_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "chat_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_instance_assignments_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_instance_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dept_team_messages: {
        Row: {
          conteudo: string
          criado_em: string
          department_id: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          conteudo: string
          criado_em?: string
          department_id: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          conteudo?: string
          criado_em?: string
          department_id?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dept_team_messages_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "chat_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_team_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_team_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_team_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dept_team_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "dept_team_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      email_queue: {
        Row: {
          assunto: string
          corpo_html: string
          corpo_texto: string | null
          criado_em: string
          destinatario_email: string
          destinatario_nome: string | null
          enviado_em: string | null
          erro: string | null
          id: string
          max_tentativas: number
          referencia_id: string | null
          referencia_tipo: string | null
          status: string
          tenant_id: string
          tentativas: number
          tipo: string
        }
        Insert: {
          assunto: string
          corpo_html: string
          corpo_texto?: string | null
          criado_em?: string
          destinatario_email: string
          destinatario_nome?: string | null
          enviado_em?: string | null
          erro?: string | null
          id?: string
          max_tentativas?: number
          referencia_id?: string | null
          referencia_tipo?: string | null
          status?: string
          tenant_id: string
          tentativas?: number
          tipo?: string
        }
        Update: {
          assunto?: string
          corpo_html?: string
          corpo_texto?: string | null
          criado_em?: string
          destinatario_email?: string
          destinatario_nome?: string | null
          enviado_em?: string | null
          erro?: string | null
          id?: string
          max_tentativas?: number
          referencia_id?: string | null
          referencia_tipo?: string | null
          status?: string
          tenant_id?: string
          tentativas?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_positions: {
        Row: {
          created_at: string | null
          employee_id: string
          id: string
          is_primary: boolean | null
          position_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          employee_id: string
          id?: string
          is_primary?: boolean | null
          position_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          employee_id?: string
          id?: string
          is_primary?: boolean | null
          position_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_positions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          admission_date: string | null
          created_at: string | null
          id: string
          is_ceo: boolean | null
          manager_id: string | null
          phone: string | null
          position_id: string | null
          status: Database["public"]["Enums"]["employee_status"] | null
          tenant_id: string
          updated_at: string | null
          user_id: string | null
          work_email: string | null
        }
        Insert: {
          admission_date?: string | null
          created_at?: string | null
          id?: string
          is_ceo?: boolean | null
          manager_id?: string | null
          phone?: string | null
          position_id?: string | null
          status?: Database["public"]["Enums"]["employee_status"] | null
          tenant_id: string
          updated_at?: string | null
          user_id?: string | null
          work_email?: string | null
        }
        Update: {
          admission_date?: string | null
          created_at?: string | null
          id?: string
          is_ceo?: boolean | null
          manager_id?: string | null
          phone?: string | null
          position_id?: string | null
          status?: Database["public"]["Enums"]["employee_status"] | null
          tenant_id?: string
          updated_at?: string | null
          user_id?: string | null
          work_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_identidades: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          instance_uuid: string | null
          lid: string | null
          lid_aprendido_em: string | null
          nome_exibicao: string | null
          origem: string
          telefone_fim: string | null
          telefone_norm: string | null
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          instance_uuid?: string | null
          lid?: string | null
          lid_aprendido_em?: string | null
          nome_exibicao?: string | null
          origem?: string
          telefone_fim?: string | null
          telefone_norm?: string | null
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          instance_uuid?: string | null
          lid?: string | null
          lid_aprendido_em?: string | null
          nome_exibicao?: string | null
          origem?: string
          telefone_fim?: string | null
          telefone_norm?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipe_identidades_instance_uuid_fkey"
            columns: ["instance_uuid"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_identidades_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_identidades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_identidades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_identidades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "equipe_identidades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      estrategista_aliases: {
        Row: {
          alias_normalizado: string
          alias_original: string
          criado_em: string
          criado_por: string | null
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          alias_normalizado: string
          alias_original: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          alias_normalizado?: string
          alias_original?: string
          criado_em?: string
          criado_por?: string | null
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estrategista_aliases_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategista_aliases_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategista_aliases_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "estrategista_aliases_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "estrategista_aliases_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategista_aliases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategista_aliases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategista_aliases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "estrategista_aliases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      estrategista_comissao_override: {
        Row: {
          percentual_custom: number
          produto_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          percentual_custom: number
          produto_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          percentual_custom?: number
          produto_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estrategista_comissao_override_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategista_comissao_override_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategista_comissao_override_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategista_comissao_override_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estrategista_comissao_override_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "estrategista_comissao_override_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      extratos_mensais: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          criado_em: string
          estrategista_doc: string | null
          estrategista_id: string
          estrategista_nome: string
          estrategista_pix: string | null
          id: string
          mes_referencia: string
          observacoes: string | null
          pago_em: string | null
          status: string
          tenant_id: string
          total_bruto: number
          total_liquido: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          criado_em?: string
          estrategista_doc?: string | null
          estrategista_id: string
          estrategista_nome: string
          estrategista_pix?: string | null
          id?: string
          mes_referencia: string
          observacoes?: string | null
          pago_em?: string | null
          status?: string
          tenant_id: string
          total_bruto?: number
          total_liquido?: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          criado_em?: string
          estrategista_doc?: string | null
          estrategista_id?: string
          estrategista_nome?: string
          estrategista_pix?: string | null
          id?: string
          mes_referencia?: string
          observacoes?: string | null
          pago_em?: string | null
          status?: string
          tenant_id?: string
          total_bruto?: number
          total_liquido?: number
        }
        Relationships: [
          {
            foreignKeyName: "extratos_mensais_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extratos_mensais_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extratos_mensais_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "extratos_mensais_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "extratos_mensais_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extratos_mensais_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extratos_mensais_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "extratos_mensais_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "extratos_mensais_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_bot_activation_rules: {
        Row: {
          bot_id: string | null
          criado_em: string | null
          id: string
          tenant_id: string
          tipo: string
          valor: string | null
        }
        Insert: {
          bot_id?: string | null
          criado_em?: string | null
          id?: string
          tenant_id: string
          tipo: string
          valor?: string | null
        }
        Update: {
          bot_id?: string | null
          criado_em?: string | null
          id?: string
          tenant_id?: string
          tipo?: string
          valor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_bot_activation_rules_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "ia_bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_bot_activation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_bot_conversation_overrides: {
        Row: {
          bot_id: string | null
          conversation_id: string | null
          criado_em: string | null
          id: string
          pausado: boolean | null
          pausado_por: string | null
          tenant_id: string
        }
        Insert: {
          bot_id?: string | null
          conversation_id?: string | null
          criado_em?: string | null
          id?: string
          pausado?: boolean | null
          pausado_por?: string | null
          tenant_id: string
        }
        Update: {
          bot_id?: string | null
          conversation_id?: string | null
          criado_em?: string | null
          id?: string
          pausado?: boolean | null
          pausado_por?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_bot_conversation_overrides_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "ia_bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_bot_conversation_overrides_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_bot_conversation_overrides_pausado_por_fkey"
            columns: ["pausado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_bot_conversation_overrides_pausado_por_fkey"
            columns: ["pausado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_bot_conversation_overrides_pausado_por_fkey"
            columns: ["pausado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "ia_bot_conversation_overrides_pausado_por_fkey"
            columns: ["pausado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ia_bot_conversation_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_bot_documents: {
        Row: {
          bot_id: string | null
          conteudo: string | null
          criado_em: string | null
          id: string
          nome: string
          tenant_id: string
          tipo: string | null
          url: string | null
        }
        Insert: {
          bot_id?: string | null
          conteudo?: string | null
          criado_em?: string | null
          id?: string
          nome: string
          tenant_id: string
          tipo?: string | null
          url?: string | null
        }
        Update: {
          bot_id?: string | null
          conteudo?: string | null
          criado_em?: string | null
          id?: string
          nome?: string
          tenant_id?: string
          tipo?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_bot_documents_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "ia_bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_bot_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_bot_execution_logs: {
        Row: {
          bot_id: string | null
          conversation_id: string | null
          criado_em: string | null
          erro: string | null
          escalada: boolean | null
          id: string
          message_id: string | null
          tenant_id: string
          tokens_input: number | null
          tokens_output: number | null
          tools_executadas: Json | null
        }
        Insert: {
          bot_id?: string | null
          conversation_id?: string | null
          criado_em?: string | null
          erro?: string | null
          escalada?: boolean | null
          id?: string
          message_id?: string | null
          tenant_id: string
          tokens_input?: number | null
          tokens_output?: number | null
          tools_executadas?: Json | null
        }
        Update: {
          bot_id?: string | null
          conversation_id?: string | null
          criado_em?: string | null
          erro?: string | null
          escalada?: boolean | null
          id?: string
          message_id?: string | null
          tenant_id?: string
          tokens_input?: number | null
          tokens_output?: number | null
          tools_executadas?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ia_bot_execution_logs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "ia_bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_bot_execution_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_bot_execution_logs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_bot_execution_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_bots: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          criado_em: string | null
          department_id: string | null
          descricao: string | null
          id: string
          instance_id: string | null
          modelo_openrouter: string
          nome: string
          system_prompt: string | null
          temperatura: number | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          department_id?: string | null
          descricao?: string | null
          id?: string
          instance_id?: string | null
          modelo_openrouter?: string
          nome: string
          system_prompt?: string | null
          temperatura?: number | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          department_id?: string | null
          descricao?: string | null
          id?: string
          instance_id?: string | null
          modelo_openrouter?: string
          nome?: string
          system_prompt?: string | null
          temperatura?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_bots_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "chat_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_bots_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ia_bots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_conversation_members: {
        Row: {
          conversation_id: string
          criado_em: string | null
          id: string
          role: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          criado_em?: string | null
          id?: string
          role?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          criado_em?: string | null
          id?: string
          role?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "internal_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_conversation_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "internal_conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      internal_conversations: {
        Row: {
          atualizado_em: string | null
          criado_em: string | null
          criado_por: string | null
          department_id: string | null
          descricao: string | null
          fixado: boolean | null
          id: string
          nome: string | null
          tenant_id: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string | null
          criado_em?: string | null
          criado_por?: string | null
          department_id?: string | null
          descricao?: string | null
          fixado?: boolean | null
          id?: string
          nome?: string | null
          tenant_id: string
          tipo: string
        }
        Update: {
          atualizado_em?: string | null
          criado_em?: string | null
          criado_por?: string | null
          department_id?: string | null
          descricao?: string | null
          fixado?: boolean | null
          id?: string
          nome?: string | null
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_conversations_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_conversations_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_conversations_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "internal_conversations_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "internal_conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "chat_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_message_reads: {
        Row: {
          conversation_id: string
          id: string
          last_read_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          last_read_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          last_read_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_message_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "internal_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_message_reads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "internal_message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      internal_messages: {
        Row: {
          conteudo: string
          conversation_id: string
          criado_em: string | null
          id: string
          media_url: string | null
          tenant_id: string
          tipo: string | null
          user_id: string
        }
        Insert: {
          conteudo: string
          conversation_id: string
          criado_em?: string | null
          id?: string
          media_url?: string | null
          tenant_id: string
          tipo?: string | null
          user_id: string
        }
        Update: {
          conteudo?: string
          conversation_id?: string
          criado_em?: string | null
          id?: string
          media_url?: string | null
          tenant_id?: string
          tipo?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "internal_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "internal_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      internal_post_comments: {
        Row: {
          conteudo: string
          criado_em: string | null
          id: string
          post_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          conteudo: string
          criado_em?: string | null
          id?: string
          post_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          conteudo?: string
          criado_em?: string | null
          id?: string
          post_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "internal_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "internal_post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      internal_post_poll_votes: {
        Row: {
          criado_em: string
          id: string
          option_index: number
          post_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          option_index: number
          post_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          option_index?: number
          post_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_post_poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "internal_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_poll_votes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "internal_post_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      internal_post_reactions: {
        Row: {
          criado_em: string | null
          id: string
          post_id: string
          tenant_id: string
          tipo: string
          user_id: string
        }
        Insert: {
          criado_em?: string | null
          id?: string
          post_id: string
          tenant_id: string
          tipo?: string
          user_id: string
        }
        Update: {
          criado_em?: string | null
          id?: string
          post_id?: string
          tenant_id?: string
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "internal_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_reactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "internal_post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      internal_posts: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string | null
          atualizado_em: string | null
          categoria: string | null
          conteudo: string
          criado_em: string | null
          department_id: string | null
          fixado: boolean | null
          id: string
          imagem_url: string | null
          poll_options: Json | null
          tenant_id: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          atualizado_em?: string | null
          categoria?: string | null
          conteudo: string
          criado_em?: string | null
          department_id?: string | null
          fixado?: boolean | null
          id?: string
          imagem_url?: string | null
          poll_options?: Json | null
          tenant_id: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          atualizado_em?: string | null
          categoria?: string | null
          conteudo?: string
          criado_em?: string | null
          department_id?: string | null
          fixado?: boolean | null
          id?: string
          imagem_url?: string | null
          poll_options?: Json | null
          tenant_id?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_posts_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "chat_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "internal_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      internal_typing_indicators: {
        Row: {
          conversation_id: string
          id: string
          started_at: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          started_at?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          started_at?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_typing_indicators_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "internal_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_typing_indicators_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "internal_typing_indicators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      iris_gt3_connections: {
        Row: {
          ativo: boolean
          created_at: string
          created_by: string
          expires_at: string
          id: string
          revisao: number
          revoked_at: string | null
          tenant_id: string
          token_hash: string
          workspace_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          revisao?: number
          revoked_at?: string | null
          tenant_id: string
          token_hash: string
          workspace_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          revisao?: number
          revoked_at?: string | null
          tenant_id?: string
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iris_gt3_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_gt3_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_gt3_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "iris_gt3_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "iris_gt3_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      iris_gt3_context: {
        Row: {
          connection_id: string
          gt3_user_id: string
          mensagens: Json
          scope_hash: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          gt3_user_id: string
          mensagens?: Json
          scope_hash: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          gt3_user_id?: string
          mensagens?: Json
          scope_hash?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iris_gt3_context_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "iris_gt3_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_gt3_context_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      iris_gt3_pairing_codes: {
        Row: {
          code_hash: string
          consumed_at: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          tenant_id: string
          workspace_id: string
        }
        Insert: {
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          tenant_id: string
          workspace_id: string
        }
        Update: {
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          tenant_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "iris_gt3_pairing_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_gt3_pairing_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_gt3_pairing_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "iris_gt3_pairing_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "iris_gt3_pairing_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      iris_gt3_recipients: {
        Row: {
          ativo: boolean
          connection_id: string
          desk_user_id: string
          gt3_user_id: string
          id: string
          modo_teste: boolean
          revisao: number
          tenant_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          ativo?: boolean
          connection_id: string
          desk_user_id: string
          gt3_user_id: string
          id?: string
          modo_teste?: boolean
          revisao?: number
          tenant_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          ativo?: boolean
          connection_id?: string
          desk_user_id?: string
          gt3_user_id?: string
          id?: string
          modo_teste?: boolean
          revisao?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "iris_gt3_recipients_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "iris_gt3_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_gt3_recipients_desk_user_id_fkey"
            columns: ["desk_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_gt3_recipients_desk_user_id_fkey"
            columns: ["desk_user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_gt3_recipients_desk_user_id_fkey"
            columns: ["desk_user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "iris_gt3_recipients_desk_user_id_fkey"
            columns: ["desk_user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "iris_gt3_recipients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      iris_gt3_requests: {
        Row: {
          connection_id: string
          created_at: string
          gt3_user_id: string
          id: string
          lease: string
          lease_until: string
          request_id: string
          scope_hash: string
          status: string
          tenant_id: string
          texto: string | null
        }
        Insert: {
          connection_id: string
          created_at?: string
          gt3_user_id: string
          id?: string
          lease?: string
          lease_until?: string
          request_id: string
          scope_hash: string
          status?: string
          tenant_id: string
          texto?: string | null
        }
        Update: {
          connection_id?: string
          created_at?: string
          gt3_user_id?: string
          id?: string
          lease?: string
          lease_until?: string
          request_id?: string
          scope_hash?: string
          status?: string
          tenant_id?: string
          texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "iris_gt3_requests_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "iris_gt3_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iris_gt3_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_enrollments: {
        Row: {
          criado_em: string | null
          id: string
          path_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          criado_em?: string | null
          id?: string
          path_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          criado_em?: string | null
          id?: string
          path_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_enrollments_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_enrollments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "learning_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      learning_lessons: {
        Row: {
          conteudo_texto: string | null
          conteudo_url: string | null
          criado_em: string | null
          descricao: string | null
          duracao_minutos: number | null
          id: string
          module_id: string
          ordem: number | null
          tenant_id: string
          tipo: string
          titulo: string
        }
        Insert: {
          conteudo_texto?: string | null
          conteudo_url?: string | null
          criado_em?: string | null
          descricao?: string | null
          duracao_minutos?: number | null
          id?: string
          module_id: string
          ordem?: number | null
          tenant_id: string
          tipo?: string
          titulo: string
        }
        Update: {
          conteudo_texto?: string | null
          conteudo_url?: string | null
          criado_em?: string | null
          descricao?: string | null
          duracao_minutos?: number | null
          id?: string
          module_id?: string
          ordem?: number | null
          tenant_id?: string
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "learning_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_lessons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_modules: {
        Row: {
          criado_em: string | null
          descricao: string | null
          id: string
          ordem: number | null
          path_id: string
          tenant_id: string
          titulo: string
        }
        Insert: {
          criado_em?: string | null
          descricao?: string | null
          id?: string
          ordem?: number | null
          path_id: string
          tenant_id: string
          titulo: string
        }
        Update: {
          criado_em?: string | null
          descricao?: string | null
          id?: string
          ordem?: number | null
          path_id?: string
          tenant_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_modules_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_modules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_paths: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          criado_em: string | null
          descricao: string | null
          id: string
          ordem: number | null
          tenant_id: string
          thumbnail_url: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          id?: string
          ordem?: number | null
          tenant_id: string
          thumbnail_url?: string | null
          tipo?: string
          titulo: string
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          descricao?: string | null
          id?: string
          ordem?: number | null
          tenant_id?: string
          thumbnail_url?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_paths_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_progress: {
        Row: {
          concluido: boolean | null
          concluido_em: string | null
          criado_em: string | null
          id: string
          lesson_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          concluido?: boolean | null
          concluido_em?: string | null
          criado_em?: string | null
          id?: string
          lesson_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          concluido?: boolean | null
          concluido_em?: string | null
          criado_em?: string | null
          id?: string
          lesson_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "learning_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_progress_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "learning_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      meeting_feedback: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          livekit_room_name: string
          meeting_id: string | null
          rating: number | null
          respondent_name: string | null
          respondent_role: string | null
          tenant_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          livekit_room_name: string
          meeting_id?: string | null
          rating?: number | null
          respondent_name?: string | null
          respondent_role?: string | null
          tenant_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          livekit_room_name?: string
          meeting_id?: string | null
          rating?: number | null
          respondent_name?: string | null
          respondent_role?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_feedback_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          ai_action_items: Json | null
          ai_generated_at: string | null
          ai_summary: string | null
          ai_title: string | null
          client_id: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          duration_seconds: number | null
          ended_at: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          livekit_room_name: string
          meeting_link: string | null
          meeting_type: string | null
          metadata: Json | null
          participants: Json | null
          participants_count: number | null
          recording_status: string | null
          recording_url: string | null
          scheduled_at: string | null
          scheduled_duration_min: number | null
          started_at: string | null
          status: string | null
          tenant_id: string
          title: string | null
          transcriptions: Json | null
          updated_at: string | null
        }
        Insert: {
          ai_action_items?: Json | null
          ai_generated_at?: string | null
          ai_summary?: string | null
          ai_title?: string | null
          client_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          livekit_room_name: string
          meeting_link?: string | null
          meeting_type?: string | null
          metadata?: Json | null
          participants?: Json | null
          participants_count?: number | null
          recording_status?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          scheduled_duration_min?: number | null
          started_at?: string | null
          status?: string | null
          tenant_id: string
          title?: string | null
          transcriptions?: Json | null
          updated_at?: string | null
        }
        Update: {
          ai_action_items?: Json | null
          ai_generated_at?: string | null
          ai_summary?: string | null
          ai_title?: string | null
          client_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          livekit_room_name?: string
          meeting_link?: string | null
          meeting_type?: string | null
          metadata?: Json | null
          participants?: Json | null
          participants_count?: number | null
          recording_status?: string | null
          recording_url?: string | null
          scheduled_at?: string | null
          scheduled_duration_min?: number | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string
          title?: string | null
          transcriptions?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "chat_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meetings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          criado_em: string | null
          id: string
          lida: boolean | null
          link: string | null
          mensagem: string | null
          metadata: Json | null
          tenant_id: string
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          criado_em?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          mensagem?: string | null
          metadata?: Json | null
          tenant_id: string
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          criado_em?: string | null
          id?: string
          lida?: boolean | null
          link?: string | null
          mensagem?: string | null
          metadata?: Json | null
          tenant_id?: string
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          comentario: string | null
          criado_em: string | null
          id: string
          nota: number
          respondido_por: string | null
          survey_id: string
          tenant_id: string
        }
        Insert: {
          comentario?: string | null
          criado_em?: string | null
          id?: string
          nota: number
          respondido_por?: string | null
          survey_id: string
          tenant_id: string
        }
        Update: {
          comentario?: string | null
          criado_em?: string | null
          id?: string
          nota?: number
          respondido_por?: string | null
          survey_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_respondido_por_fkey"
            columns: ["respondido_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_respondido_por_fkey"
            columns: ["respondido_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_respondido_por_fkey"
            columns: ["respondido_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "nps_responses_respondido_por_fkey"
            columns: ["respondido_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "nps_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "nps_surveys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_surveys: {
        Row: {
          client_id: string
          criado_em: string | null
          delivery_id: string | null
          enviado_em: string | null
          id: string
          respondido_em: string | null
          tenant_id: string
        }
        Insert: {
          client_id: string
          criado_em?: string | null
          delivery_id?: string | null
          enviado_em?: string | null
          id?: string
          respondido_em?: string | null
          tenant_id: string
        }
        Update: {
          client_id?: string
          criado_em?: string | null
          delivery_id?: string | null
          enviado_em?: string | null
          id?: string
          respondido_em?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nps_surveys_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_surveys_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_surveys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      permissoes_app: {
        Row: {
          acao: string
          atualizado_em: string
          criado_em: string
          id: string
          perfil: string
          recurso: string
          tenant_id: string
        }
        Insert: {
          acao: string
          atualizado_em?: string
          criado_em?: string
          id?: string
          perfil: string
          recurso: string
          tenant_id: string
        }
        Update: {
          acao?: string
          atualizado_em?: string
          criado_em?: string
          id?: string
          perfil?: string
          recurso?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissoes_app_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_notes: {
        Row: {
          color: string | null
          content: string
          created_at: string
          id: string
          media_url: string | null
          pinned: boolean
          reminder_at: string | null
          tags: string[]
          tenant_id: string
          tipo: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          content?: string
          created_at?: string
          id?: string
          media_url?: string | null
          pinned?: boolean
          reminder_at?: string | null
          tags?: string[]
          tenant_id: string
          tipo?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          content?: string
          created_at?: string
          id?: string
          media_url?: string | null
          pinned?: boolean
          reminder_at?: string | null
          tags?: string[]
          tenant_id?: string
          tipo?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "personal_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pj_entregas: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          atualizado_em: string
          competencia: string | null
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          motivo_recusa: string | null
          pago_em: string | null
          prestador_id: string
          status: string
          tenant_id: string
          titulo: string
          valor: number
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          competencia?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          motivo_recusa?: string | null
          pago_em?: string | null
          prestador_id: string
          status?: string
          tenant_id: string
          titulo: string
          valor?: number
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          competencia?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          motivo_recusa?: string | null
          pago_em?: string | null
          prestador_id?: string
          status?: string
          tenant_id?: string
          titulo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pj_entregas_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "pj_prestadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pj_entregas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pj_notas: {
        Row: {
          entrega_id: string
          enviado_em: string
          id: string
          mime_type: string | null
          nome_original: string | null
          prestador_id: string
          storage_path: string
          tamanho_bytes: number | null
          tenant_id: string
        }
        Insert: {
          entrega_id: string
          enviado_em?: string
          id?: string
          mime_type?: string | null
          nome_original?: string | null
          prestador_id: string
          storage_path: string
          tamanho_bytes?: number | null
          tenant_id: string
        }
        Update: {
          entrega_id?: string
          enviado_em?: string
          id?: string
          mime_type?: string | null
          nome_original?: string | null
          prestador_id?: string
          storage_path?: string
          tamanho_bytes?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pj_notas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "pj_entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pj_notas_prestador_id_fkey"
            columns: ["prestador_id"]
            isOneToOne: false
            referencedRelation: "pj_prestadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pj_notas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pj_prestadores: {
        Row: {
          ativo: boolean
          atualizado_em: string
          chave_pix: string | null
          cnpj: string | null
          criado_em: string
          dados_bancarios: string | null
          id: string
          nome: string
          razao_social: string | null
          tenant_id: string
          tipo: string
          user_id: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          chave_pix?: string | null
          cnpj?: string | null
          criado_em?: string
          dados_bancarios?: string | null
          id?: string
          nome: string
          razao_social?: string | null
          tenant_id: string
          tipo?: string
          user_id?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          chave_pix?: string | null
          cnpj?: string | null
          criado_em?: string
          dados_bancarios?: string | null
          id?: string
          nome?: string
          razao_social?: string | null
          tenant_id?: string
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pj_prestadores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          area_id: string | null
          created_at: string | null
          description: string | null
          goals: string[] | null
          id: string
          level: number | null
          reports_to_id: string | null
          responsibilities: string[] | null
          sort_order: number | null
          subarea_id: string | null
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string | null
          description?: string | null
          goals?: string[] | null
          id?: string
          level?: number | null
          reports_to_id?: string | null
          responsibilities?: string[] | null
          sort_order?: number | null
          subarea_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          area_id?: string | null
          created_at?: string | null
          description?: string | null
          goals?: string[] | null
          id?: string
          level?: number | null
          reports_to_id?: string | null
          responsibilities?: string[] | null
          sort_order?: number | null
          subarea_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "positions_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "company_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_subarea_id_fkey"
            columns: ["subarea_id"]
            isOneToOne: false
            referencedRelation: "subareas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          ativo: boolean
          atualizado_em: string
          client_id: string | null
          criado_em: string
          descricao: string | null
          id: string
          nome: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          client_id?: string | null
          criado_em?: string
          descricao?: string | null
          id?: string
          nome: string
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          client_id?: string | null
          criado_em?: string
          descricao?: string | null
          id?: string
          nome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos_comissao: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          bonus_condicional: boolean
          observacoes: string | null
          parcelas_padrao: number
          percentual_padrao: number
          produto_id: string
          tenant_id: string
          tipo_comissao: string
          valor_bonus: number
          valor_comissao_padrao: number
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          bonus_condicional?: boolean
          observacoes?: string | null
          parcelas_padrao?: number
          percentual_padrao?: number
          produto_id: string
          tenant_id: string
          tipo_comissao?: string
          valor_bonus?: number
          valor_comissao_padrao?: number
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          bonus_condicional?: boolean
          observacoes?: string | null
          parcelas_padrao?: number
          percentual_padrao?: number
          produto_id?: string
          tenant_id?: string
          tipo_comissao?: string
          valor_bonus?: number
          valor_comissao_padrao?: number
        }
        Relationships: [
          {
            foreignKeyName: "produtos_comissao_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_comissao_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_comissao_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "produtos_comissao_atualizado_por_fkey"
            columns: ["atualizado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "produtos_comissao_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_comissao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          phone: string | null
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          criado_em: string
          endpoint: string
          id: string
          p256dh: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          auth: string
          criado_em?: string
          endpoint: string
          id?: string
          p256dh: string
          tenant_id: string
          user_id: string
        }
        Update: {
          auth?: string
          criado_em?: string
          endpoint?: string
          id?: string
          p256dh?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      reportes_erro: {
        Row: {
          anexos: Json
          categoria: string
          console_logs: Json
          contexto: Json
          created_at: string
          descricao: string | null
          id: string
          impacto: string
          link_externo: string | null
          modulo: string | null
          network_logs: Json
          passos: string | null
          prioridade: string
          protocolo: string
          reportado_email: string | null
          reportado_nome: string | null
          reportado_por: string | null
          resolvido_em: string | null
          resolvido_versao: string | null
          resposta_interna: string | null
          resposta_usuario: string | null
          resultado_esperado: string | null
          resultado_ocorrido: string | null
          rota: string | null
          status: string
          tenant_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          anexos?: Json
          categoria?: string
          console_logs?: Json
          contexto?: Json
          created_at?: string
          descricao?: string | null
          id?: string
          impacto?: string
          link_externo?: string | null
          modulo?: string | null
          network_logs?: Json
          passos?: string | null
          prioridade?: string
          protocolo?: string
          reportado_email?: string | null
          reportado_nome?: string | null
          reportado_por?: string | null
          resolvido_em?: string | null
          resolvido_versao?: string | null
          resposta_interna?: string | null
          resposta_usuario?: string | null
          resultado_esperado?: string | null
          resultado_ocorrido?: string | null
          rota?: string | null
          status?: string
          tenant_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          anexos?: Json
          categoria?: string
          console_logs?: Json
          contexto?: Json
          created_at?: string
          descricao?: string | null
          id?: string
          impacto?: string
          link_externo?: string | null
          modulo?: string | null
          network_logs?: Json
          passos?: string | null
          prioridade?: string
          protocolo?: string
          reportado_email?: string | null
          reportado_nome?: string | null
          reportado_por?: string | null
          resolvido_em?: string | null
          resolvido_versao?: string | null
          resposta_interna?: string | null
          resposta_usuario?: string | null
          resultado_esperado?: string | null
          resultado_ocorrido?: string | null
          rota?: string | null
          status?: string
          tenant_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reportes_erro_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      salario_fixo_itens: {
        Row: {
          cliente_id: string | null
          cliente_nome: string
          descricao: string | null
          extrato_id: string
          id: string
          ordem: number
          tenant_id: string
          valor: number
        }
        Insert: {
          cliente_id?: string | null
          cliente_nome: string
          descricao?: string | null
          extrato_id: string
          id?: string
          ordem?: number
          tenant_id: string
          valor: number
        }
        Update: {
          cliente_id?: string | null
          cliente_nome?: string
          descricao?: string | null
          extrato_id?: string
          id?: string
          ordem?: number
          tenant_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "salario_fixo_itens_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salario_fixo_itens_extrato_id_fkey"
            columns: ["extrato_id"]
            isOneToOne: false
            referencedRelation: "extratos_mensais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salario_fixo_itens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      social_snapshots: {
        Row: {
          client_id: string
          created_at: string
          fetched_at: string
          followers: number | null
          full_name: string | null
          id: string
          last_post_at: string | null
          last_post_caption: string | null
          last_post_url: string | null
          platform: string
          profile_pic_url: string | null
          raw: Json | null
          tenant_id: string
          username: string
        }
        Insert: {
          client_id: string
          created_at?: string
          fetched_at?: string
          followers?: number | null
          full_name?: string | null
          id?: string
          last_post_at?: string | null
          last_post_caption?: string | null
          last_post_url?: string | null
          platform: string
          profile_pic_url?: string | null
          raw?: Json | null
          tenant_id: string
          username: string
        }
        Update: {
          client_id?: string
          created_at?: string
          fetched_at?: string
          followers?: number | null
          full_name?: string | null
          id?: string
          last_post_at?: string | null
          last_post_caption?: string | null
          last_post_url?: string | null
          platform?: string
          profile_pic_url?: string | null
          raw?: Json | null
          tenant_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subareas: {
        Row: {
          area_id: string
          color: string | null
          created_at: string | null
          id: string
          name: string
          sort_order: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          area_id: string
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          sort_order?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          area_id?: string
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subareas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "company_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subareas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_monitor_estado: {
        Row: {
          assinatura: string
          atualizado_em: string
          id: number
        }
        Insert: {
          assinatura?: string
          atualizado_em?: string
          id: number
        }
        Update: {
          assinatura?: string
          atualizado_em?: string
          id?: number
        }
        Relationships: []
      }
      tags: {
        Row: {
          cor: string
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          nome: string
          tenant_id: string
        }
        Insert: {
          cor?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome: string
          tenant_id: string
        }
        Update: {
          cor?: string
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tempo_resposta_agendas: {
        Row: {
          agenda_revisao: number
          atualizado_em: string
          connection_id: string
          consentimento_desde: string | null
          desconectado_em: string | null
          desk_user_id: string
          fim: string | null
          gt3_user_id: string
          inicio: string | null
          ja_conectada: boolean
          ocupados: Json
          recipient_id: string
          recipient_revisao: number
          sincronizado_em: string | null
          status: string
          tenant_id: string
          ultimo_sucesso_em: string | null
        }
        Insert: {
          agenda_revisao: number
          atualizado_em?: string
          connection_id: string
          consentimento_desde?: string | null
          desconectado_em?: string | null
          desk_user_id: string
          fim?: string | null
          gt3_user_id: string
          inicio?: string | null
          ja_conectada?: boolean
          ocupados?: Json
          recipient_id: string
          recipient_revisao: number
          sincronizado_em?: string | null
          status: string
          tenant_id: string
          ultimo_sucesso_em?: string | null
        }
        Update: {
          agenda_revisao?: number
          atualizado_em?: string
          connection_id?: string
          consentimento_desde?: string | null
          desconectado_em?: string | null
          desk_user_id?: string
          fim?: string | null
          gt3_user_id?: string
          inicio?: string | null
          ja_conectada?: boolean
          ocupados?: Json
          recipient_id?: string
          recipient_revisao?: number
          sincronizado_em?: string | null
          status?: string
          tenant_id?: string
          ultimo_sucesso_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tempo_resposta_agendas_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "iris_gt3_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_agendas_desk_user_id_fkey"
            columns: ["desk_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_agendas_desk_user_id_fkey"
            columns: ["desk_user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_agendas_desk_user_id_fkey"
            columns: ["desk_user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "tempo_resposta_agendas_desk_user_id_fkey"
            columns: ["desk_user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tempo_resposta_agendas_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: true
            referencedRelation: "iris_gt3_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_agendas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tempo_resposta_alertas: {
        Row: {
          config_revisao: number
          connection_id: string
          created_at: string
          delivery_id: string | null
          episodio_id: string
          etapa: string
          gt3_user_id: string
          id: string
          recipient_id: string
          recipient_revisao: number
          segmento_id: string
          status: string
          tenant_id: string
          texto: string | null
          updated_at: string
        }
        Insert: {
          config_revisao: number
          connection_id: string
          created_at?: string
          delivery_id?: string | null
          episodio_id: string
          etapa: string
          gt3_user_id: string
          id?: string
          recipient_id: string
          recipient_revisao: number
          segmento_id: string
          status?: string
          tenant_id: string
          texto?: string | null
          updated_at?: string
        }
        Update: {
          config_revisao?: number
          connection_id?: string
          created_at?: string
          delivery_id?: string | null
          episodio_id?: string
          etapa?: string
          gt3_user_id?: string
          id?: string
          recipient_id?: string
          recipient_revisao?: number
          segmento_id?: string
          status?: string
          tenant_id?: string
          texto?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tempo_resposta_alertas_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "iris_gt3_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_alertas_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "iris_gt3_recipients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_alertas_tenant_id_episodio_id_segmento_id_fkey"
            columns: ["tenant_id", "episodio_id", "segmento_id"]
            isOneToOne: false
            referencedRelation: "tempo_resposta_segmentos"
            referencedColumns: ["tenant_id", "episodio_id", "id"]
          },
          {
            foreignKeyName: "tempo_resposta_alertas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tempo_resposta_auditoria: {
        Row: {
          acao: string
          ator_id: string | null
          dados: Json
          id: string
          ocorrido_em: string
          tenant_id: string
        }
        Insert: {
          acao: string
          ator_id?: string | null
          dados: Json
          id?: string
          ocorrido_em?: string
          tenant_id: string
        }
        Update: {
          acao?: string
          ator_id?: string | null
          dados?: Json
          id?: string
          ocorrido_em?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tempo_resposta_auditoria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tempo_resposta_config: {
        Row: {
          anos_confirmados: number[]
          atualizado_em: string
          atualizado_por: string | null
          feriados: string[]
          modo: string
          monitorando_desde: string | null
          revisao: number
          tenant_id: string
        }
        Insert: {
          anos_confirmados?: number[]
          atualizado_em?: string
          atualizado_por?: string | null
          feriados?: string[]
          modo?: string
          monitorando_desde?: string | null
          revisao?: number
          tenant_id: string
        }
        Update: {
          anos_confirmados?: number[]
          atualizado_em?: string
          atualizado_por?: string | null
          feriados?: string[]
          modo?: string
          monitorando_desde?: string | null
          revisao?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tempo_resposta_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tempo_resposta_episodios: {
        Row: {
          agenda_no_encerramento: Json | null
          anos_confirmados: number[]
          atualizado_em: string
          client_id: string | null
          cliente_nome: string | null
          config_revisao: number
          conversation_id: string
          criado_em: string
          estado: string
          feriados: string[]
          id: string
          inicio: string
          instance_id: string
          motivo: string | null
          primeira_mensagem_id: string
          qualidade: string
          respondente_id: string | null
          respondente_nome: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          resposta_em: string | null
          segmento_atual_id: string | null
          tenant_id: string
          ultima_mensagem_em: string
        }
        Insert: {
          agenda_no_encerramento?: Json | null
          anos_confirmados: number[]
          atualizado_em?: string
          client_id?: string | null
          cliente_nome?: string | null
          config_revisao: number
          conversation_id: string
          criado_em?: string
          estado?: string
          feriados: string[]
          id?: string
          inicio: string
          instance_id: string
          motivo?: string | null
          primeira_mensagem_id: string
          qualidade?: string
          respondente_id?: string | null
          respondente_nome?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          resposta_em?: string | null
          segmento_atual_id?: string | null
          tenant_id: string
          ultima_mensagem_em: string
        }
        Update: {
          agenda_no_encerramento?: Json | null
          anos_confirmados?: number[]
          atualizado_em?: string
          client_id?: string | null
          cliente_nome?: string | null
          config_revisao?: number
          conversation_id?: string
          criado_em?: string
          estado?: string
          feriados?: string[]
          id?: string
          inicio?: string
          instance_id?: string
          motivo?: string | null
          primeira_mensagem_id?: string
          qualidade?: string
          respondente_id?: string | null
          respondente_nome?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          resposta_em?: string | null
          segmento_atual_id?: string | null
          tenant_id?: string
          ultima_mensagem_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "tempo_resposta_episodios_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_episodios_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_episodios_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_episodios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_segmento_atual_fk"
            columns: ["tenant_id", "id", "segmento_atual_id"]
            isOneToOne: false
            referencedRelation: "tempo_resposta_segmentos"
            referencedColumns: ["tenant_id", "episodio_id", "id"]
          },
        ]
      }
      tempo_resposta_ingressos: {
        Row: {
          ator_verificado: string | null
          confiavel: boolean
          conversation_id: string
          mensagem_id: string
          ocorrido_em: string | null
          recebido_em: string
          recuperada: boolean
          tenant_id: string
        }
        Insert: {
          ator_verificado?: string | null
          confiavel: boolean
          conversation_id: string
          mensagem_id: string
          ocorrido_em?: string | null
          recebido_em?: string
          recuperada: boolean
          tenant_id: string
        }
        Update: {
          ator_verificado?: string | null
          confiavel?: boolean
          conversation_id?: string
          mensagem_id?: string
          ocorrido_em?: string | null
          recebido_em?: string
          recuperada?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tempo_resposta_ingressos_mensagem_id_fkey"
            columns: ["mensagem_id"]
            isOneToOne: true
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_ingressos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tempo_resposta_pausas: {
        Row: {
          criado_por: string
          encerrado_por: string | null
          fim: string
          id: string
          inicio: string
          motivo: string
          nome: string
          previsto_fim: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          criado_por: string
          encerrado_por?: string | null
          fim: string
          id?: string
          inicio?: string
          motivo: string
          nome: string
          previsto_fim: string
          tenant_id: string
          user_id: string
        }
        Update: {
          criado_por?: string
          encerrado_por?: string | null
          fim?: string
          id?: string
          inicio?: string
          motivo?: string
          nome?: string
          previsto_fim?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tempo_resposta_pausas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tempo_resposta_segmentos: {
        Row: {
          assignment_revision: number
          episodio_id: string
          fim: string | null
          id: string
          inicio: string
          nome: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          assignment_revision?: number
          episodio_id: string
          fim?: string | null
          id?: string
          inicio: string
          nome: string
          tenant_id: string
          user_id: string
        }
        Update: {
          assignment_revision?: number
          episodio_id?: string
          fim?: string | null
          id?: string
          inicio?: string
          nome?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tempo_resposta_segmentos_tenant_id_episodio_id_fkey"
            columns: ["tenant_id", "episodio_id"]
            isOneToOne: false
            referencedRelation: "tempo_resposta_episodios"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      tempo_resposta_titulares: {
        Row: {
          atualizado_em: string
          atualizado_por: string
          client_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por: string
          client_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string
          client_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tempo_resposta_titulares_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tempo_resposta_titulares_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_integracoes: {
        Row: {
          base_url: string | null
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          provider: string
          rotation_version: number
          secret_key_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          provider: string
          rotation_version?: number
          secret_key_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          provider?: string
          rotation_version?: number
          secret_key_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_integracoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          atendimento_segmento: string
          created_at: string | null
          custom_domain: string | null
          external_ref: string | null
          favicon_url: string | null
          id: string
          is_master: boolean
          logo_dark_url: string | null
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          settings: Json | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          atendimento_segmento?: string
          created_at?: string | null
          custom_domain?: string | null
          external_ref?: string | null
          favicon_url?: string | null
          id?: string
          is_master?: boolean
          logo_dark_url?: string | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
          settings?: Json | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          atendimento_segmento?: string
          created_at?: string | null
          custom_domain?: string | null
          external_ref?: string | null
          favicon_url?: string | null
          id?: string
          is_master?: boolean
          logo_dark_url?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          settings?: Json | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_instance_assignments: {
        Row: {
          criado_em: string | null
          id: string
          instance_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          criado_em?: string | null
          id?: string
          instance_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          criado_em?: string | null
          id?: string
          instance_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_instance_assignments_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_instance_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_instance_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_instance_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_instance_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "user_instance_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          acesso_contratos: boolean
          ativo: boolean | null
          ativo_comissoes: boolean | null
          chave_pix: string | null
          cnpj_cpf: string | null
          criado_em: string | null
          department_id: string | null
          email: string
          foto_url: string | null
          id: string
          inativacao_em: string | null
          inativacao_motivo: string | null
          inativacao_por: string | null
          last_seen_at: string | null
          nome: string
          perfil: string
          salario_fixo_mensal: number | null
          tenant_id: string
          tipo_consultor: string | null
        }
        Insert: {
          acesso_contratos?: boolean
          ativo?: boolean | null
          ativo_comissoes?: boolean | null
          chave_pix?: string | null
          cnpj_cpf?: string | null
          criado_em?: string | null
          department_id?: string | null
          email: string
          foto_url?: string | null
          id: string
          inativacao_em?: string | null
          inativacao_motivo?: string | null
          inativacao_por?: string | null
          last_seen_at?: string | null
          nome: string
          perfil: string
          salario_fixo_mensal?: number | null
          tenant_id: string
          tipo_consultor?: string | null
        }
        Update: {
          acesso_contratos?: boolean
          ativo?: boolean | null
          ativo_comissoes?: boolean | null
          chave_pix?: string | null
          cnpj_cpf?: string | null
          criado_em?: string | null
          department_id?: string | null
          email?: string
          foto_url?: string | null
          id?: string
          inativacao_em?: string | null
          inativacao_motivo?: string | null
          inativacao_por?: string | null
          last_seen_at?: string | null
          nome?: string
          perfil?: string
          salario_fixo_mensal?: number | null
          tenant_id?: string
          tipo_consultor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "chat_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_inativacao_por_fkey"
            columns: ["inativacao_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_inativacao_por_fkey"
            columns: ["inativacao_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_inativacao_por_fkey"
            columns: ["inativacao_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "users_inativacao_por_fkey"
            columns: ["inativacao_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_pendentes: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          atualizado_em: string
          cliente_bairro: string | null
          cliente_cep: string | null
          cliente_complemento: string | null
          cliente_cpf_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_instagram: string | null
          cliente_logradouro: string | null
          cliente_municipio: string | null
          cliente_nome: string
          cliente_numero: string | null
          cliente_razao_social: string | null
          cliente_uf: string | null
          cliente_whatsapp: string
          closer_email: string
          closer_nome: string
          comprovantes: Json
          criado_em: string
          crm_sincronizacao_erro: string | null
          crm_sincronizado_em: string | null
          crm_venda_id: string | null
          ghl_contato_id: string | null
          ghl_oportunidade_id: string | null
          ghl_pipeline_name: string | null
          ghl_venda_id: string | null
          historico_edicoes: Json
          id: string
          identificador_pagamento: string | null
          ip_origem: string | null
          observacoes: string | null
          origem: string
          pagador_cpf_cnpj: string | null
          pagador_diferente: boolean
          pagador_nome: string | null
          pagador_observacao: string | null
          pagador_relacao: string | null
          pagamentos: Json
          produto_id: string | null
          produto_nome: string | null
          sincronizacao_erro: string | null
          sincronizado_em: string | null
          status: string
          tenant_id: string
          user_agent: string | null
          valor_total_venda: number | null
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          atualizado_em?: string
          cliente_bairro?: string | null
          cliente_cep?: string | null
          cliente_complemento?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_instagram?: string | null
          cliente_logradouro?: string | null
          cliente_municipio?: string | null
          cliente_nome: string
          cliente_numero?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cliente_whatsapp: string
          closer_email: string
          closer_nome: string
          comprovantes?: Json
          criado_em?: string
          crm_sincronizacao_erro?: string | null
          crm_sincronizado_em?: string | null
          crm_venda_id?: string | null
          ghl_contato_id?: string | null
          ghl_oportunidade_id?: string | null
          ghl_pipeline_name?: string | null
          ghl_venda_id?: string | null
          historico_edicoes?: Json
          id?: string
          identificador_pagamento?: string | null
          ip_origem?: string | null
          observacoes?: string | null
          origem?: string
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json
          produto_id?: string | null
          produto_nome?: string | null
          sincronizacao_erro?: string | null
          sincronizado_em?: string | null
          status?: string
          tenant_id: string
          user_agent?: string | null
          valor_total_venda?: number | null
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          atualizado_em?: string
          cliente_bairro?: string | null
          cliente_cep?: string | null
          cliente_complemento?: string | null
          cliente_cpf_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_instagram?: string | null
          cliente_logradouro?: string | null
          cliente_municipio?: string | null
          cliente_nome?: string
          cliente_numero?: string | null
          cliente_razao_social?: string | null
          cliente_uf?: string | null
          cliente_whatsapp?: string
          closer_email?: string
          closer_nome?: string
          comprovantes?: Json
          criado_em?: string
          crm_sincronizacao_erro?: string | null
          crm_sincronizado_em?: string | null
          crm_venda_id?: string | null
          ghl_contato_id?: string | null
          ghl_oportunidade_id?: string | null
          ghl_pipeline_name?: string | null
          ghl_venda_id?: string | null
          historico_edicoes?: Json
          id?: string
          identificador_pagamento?: string | null
          ip_origem?: string | null
          observacoes?: string | null
          origem?: string
          pagador_cpf_cnpj?: string | null
          pagador_diferente?: boolean
          pagador_nome?: string | null
          pagador_observacao?: string | null
          pagador_relacao?: string | null
          pagamentos?: Json
          produto_id?: string | null
          produto_nome?: string | null
          sincronizacao_erro?: string | null
          sincronizado_em?: string | null
          status?: string
          tenant_id?: string
          user_agent?: string | null
          valor_total_venda?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_pendentes_atendido_por_fkey"
            columns: ["atendido_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_pendentes_atendido_por_fkey"
            columns: ["atendido_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_pendentes_atendido_por_fkey"
            columns: ["atendido_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "vendas_pendentes_atendido_por_fkey"
            columns: ["atendido_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vendas_pendentes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_pendentes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vinculos_execucoes: {
        Row: {
          criado_em: string
          id: string
          origem: string
          resultado: Json
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          criado_em?: string
          id?: string
          origem: string
          resultado?: Json
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          criado_em?: string
          id?: string
          origem?: string
          resultado?: Json
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_execucoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_execucoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_execucoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_execucoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "vinculos_execucoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wa_agente_acoes_propostas: {
        Row: {
          acao: string
          alvo: string
          chat_jid: string
          codigo: string
          criada_em: string
          eh_grupo: boolean
          esperado: Json
          estado: string
          expira_em: string
          id: string
          instance_uuid: string
          membro_id: string
          mensagem_origem_id: string
          novo: Json
          origem_criada_em: string
          pedido_confirmacao_id: string | null
          pedido_origem_id: string
          previa: Json
          recibo: Json | null
          remetente_chave: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          acao: string
          alvo: string
          chat_jid: string
          codigo: string
          criada_em?: string
          eh_grupo: boolean
          esperado: Json
          estado?: string
          expira_em: string
          id?: string
          instance_uuid: string
          membro_id: string
          mensagem_origem_id: string
          novo: Json
          origem_criada_em: string
          pedido_confirmacao_id?: string | null
          pedido_origem_id: string
          previa: Json
          recibo?: Json | null
          remetente_chave: string
          tenant_id: string
          user_id: string
        }
        Update: {
          acao?: string
          alvo?: string
          chat_jid?: string
          codigo?: string
          criada_em?: string
          eh_grupo?: boolean
          esperado?: Json
          estado?: string
          expira_em?: string
          id?: string
          instance_uuid?: string
          membro_id?: string
          mensagem_origem_id?: string
          novo?: Json
          origem_criada_em?: string
          pedido_confirmacao_id?: string | null
          pedido_origem_id?: string
          previa?: Json
          recibo?: Json | null
          remetente_chave?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_agente_acoes_propostas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_agente_aprendizados: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          criado_por_nome: string | null
          criado_por_user: string | null
          desativado_em: string | null
          id: string
          instrucao: string
          origem: string
          pedido_id: string | null
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          criado_por_nome?: string | null
          criado_por_user?: string | null
          desativado_em?: string | null
          id?: string
          instrucao: string
          origem?: string
          pedido_id?: string | null
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          criado_por_nome?: string | null
          criado_por_user?: string | null
          desativado_em?: string | null
          id?: string
          instrucao?: string
          origem?: string
          pedido_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_agente_aprendizados_criado_por_user_fkey"
            columns: ["criado_por_user"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_aprendizados_criado_por_user_fkey"
            columns: ["criado_por_user"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_aprendizados_criado_por_user_fkey"
            columns: ["criado_por_user"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "wa_agente_aprendizados_criado_por_user_fkey"
            columns: ["criado_por_user"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "wa_agente_aprendizados_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "wa_agente_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_aprendizados_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_agente_execucoes: {
        Row: {
          canal: string | null
          created_at: string
          custo_usd: number | null
          duracao_ms: number | null
          ferramentas: string[]
          gatilho: string | null
          id: string
          mensagens: number | null
          modelo: string | null
          passos: number | null
          pedido_id: string | null
          resultado: string
          tenant_id: string
          tokens_cache: number | null
          tokens_entrada: number | null
          tokens_saida: number | null
          user_id: string | null
        }
        Insert: {
          canal?: string | null
          created_at?: string
          custo_usd?: number | null
          duracao_ms?: number | null
          ferramentas?: string[]
          gatilho?: string | null
          id?: string
          mensagens?: number | null
          modelo?: string | null
          passos?: number | null
          pedido_id?: string | null
          resultado: string
          tenant_id: string
          tokens_cache?: number | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
          user_id?: string | null
        }
        Update: {
          canal?: string | null
          created_at?: string
          custo_usd?: number | null
          duracao_ms?: number | null
          ferramentas?: string[]
          gatilho?: string | null
          id?: string
          mensagens?: number | null
          modelo?: string | null
          passos?: number | null
          pedido_id?: string | null
          resultado?: string
          tenant_id?: string
          tokens_cache?: number | null
          tokens_entrada?: number | null
          tokens_saida?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_agente_execucoes_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "wa_agente_pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_execucoes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_execucoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_execucoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_execucoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "wa_agente_execucoes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wa_agente_fatos_equipe: {
        Row: {
          ativo: boolean
          autor_id: string
          autor_nome: string
          autorizado_por: string | null
          criado_em: string
          desativado_em: string | null
          desativado_por: string | null
          entrada_sha256: string
          executor_bd: string | null
          fonte_criada_em: string | null
          grupo_jid: string
          id: string
          mensagem_id: string
          origem: string
          pedido_desativacao_id: string | null
          pedido_id: string
          sujeito_id: string
          sujeito_nome: string
          sujeito_tipo: string
          tenant_id: string
          trecho: string
          trecho_sha256: string
        }
        Insert: {
          ativo?: boolean
          autor_id: string
          autor_nome: string
          autorizado_por?: string | null
          criado_em?: string
          desativado_em?: string | null
          desativado_por?: string | null
          entrada_sha256: string
          executor_bd?: string | null
          fonte_criada_em?: string | null
          grupo_jid: string
          id: string
          mensagem_id: string
          origem?: string
          pedido_desativacao_id?: string | null
          pedido_id: string
          sujeito_id: string
          sujeito_nome: string
          sujeito_tipo: string
          tenant_id: string
          trecho: string
          trecho_sha256: string
        }
        Update: {
          ativo?: boolean
          autor_id?: string
          autor_nome?: string
          autorizado_por?: string | null
          criado_em?: string
          desativado_em?: string | null
          desativado_por?: string | null
          entrada_sha256?: string
          executor_bd?: string | null
          fonte_criada_em?: string | null
          grupo_jid?: string
          id?: string
          mensagem_id?: string
          origem?: string
          pedido_desativacao_id?: string | null
          pedido_id?: string
          sujeito_id?: string
          sujeito_nome?: string
          sujeito_tipo?: string
          tenant_id?: string
          trecho?: string
          trecho_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_agente_fatos_equipe_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_agente_grupo_numeros: {
        Row: {
          created_at: string
          grupo_id: string
          id: string
          instance_uuid: string
          ordem: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          grupo_id: string
          id?: string
          instance_uuid: string
          ordem: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          grupo_id?: string
          id?: string
          instance_uuid?: string
          ordem?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_agente_grupo_numeros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "wa_agente_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_grupo_numeros_instance_uuid_fkey"
            columns: ["instance_uuid"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_grupo_numeros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_agente_grupos: {
        Row: {
          acesso_total: boolean
          ativo: boolean
          boas_vindas_em: string | null
          created_at: string
          grupo_jid: string
          id: string
          nome: string | null
          participantes_externos: number | null
          participantes_membros: string[] | null
          participantes_verificados_em: string | null
          tenant_id: string
        }
        Insert: {
          acesso_total?: boolean
          ativo?: boolean
          boas_vindas_em?: string | null
          created_at?: string
          grupo_jid: string
          id?: string
          nome?: string | null
          participantes_externos?: number | null
          participantes_membros?: string[] | null
          participantes_verificados_em?: string | null
          tenant_id: string
        }
        Update: {
          acesso_total?: boolean
          ativo?: boolean
          boas_vindas_em?: string | null
          created_at?: string
          grupo_jid?: string
          id?: string
          nome?: string | null
          participantes_externos?: number | null
          participantes_membros?: string[] | null
          participantes_verificados_em?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_agente_grupos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_agente_membros: {
        Row: {
          ativo: boolean
          boas_vindas_em: string | null
          created_at: string
          created_by: string | null
          id: string
          telefone: string
          telefone_chave: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          boas_vindas_em?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          telefone: string
          telefone_chave?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          boas_vindas_em?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          telefone?: string
          telefone_chave?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_agente_membros_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_membros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_membros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_membros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "wa_agente_membros_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wa_agente_pedidos: {
        Row: {
          chat_jid: string
          chat_message_id: string | null
          conversation_id: string | null
          created_at: string
          eh_grupo: boolean
          entrada_encaminhada: boolean | null
          entrada_texto_sha256: string | null
          gatilho: string
          id: string
          instance_uuid: string
          lock_ate: string | null
          membro_id: string | null
          message_id_wpp: string
          motivo: string | null
          processar_apos: string
          remetente_chave: string | null
          resposta_message_ids: string[]
          status: string
          tenant_id: string
          tentativas: number
          user_id: string | null
        }
        Insert: {
          chat_jid: string
          chat_message_id?: string | null
          conversation_id?: string | null
          created_at?: string
          eh_grupo?: boolean
          entrada_encaminhada?: boolean | null
          entrada_texto_sha256?: string | null
          gatilho: string
          id?: string
          instance_uuid: string
          lock_ate?: string | null
          membro_id?: string | null
          message_id_wpp: string
          motivo?: string | null
          processar_apos?: string
          remetente_chave?: string | null
          resposta_message_ids?: string[]
          status?: string
          tenant_id: string
          tentativas?: number
          user_id?: string | null
        }
        Update: {
          chat_jid?: string
          chat_message_id?: string | null
          conversation_id?: string | null
          created_at?: string
          eh_grupo?: boolean
          entrada_encaminhada?: boolean | null
          entrada_texto_sha256?: string | null
          gatilho?: string
          id?: string
          instance_uuid?: string
          lock_ate?: string | null
          membro_id?: string | null
          message_id_wpp?: string
          motivo?: string | null
          processar_apos?: string
          remetente_chave?: string | null
          resposta_message_ids?: string[]
          status?: string
          tenant_id?: string
          tentativas?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_agente_pedidos_instance_uuid_fkey"
            columns: ["instance_uuid"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_pedidos_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "wa_agente_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_pedidos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_pedidos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_pedidos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_agente_pedidos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "wa_agente_pedidos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wa_auto_alertas_ignorados: {
        Row: {
          ate: string | null
          client_id: string | null
          contact_id: string | null
          created_at: string
          criado_por: string | null
          id: string
          modo: string
          motivo: string | null
          tenant_id: string
          tipo: string
        }
        Insert: {
          ate?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          modo: string
          motivo?: string | null
          tenant_id: string
          tipo: string
        }
        Update: {
          ate?: string | null
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          criado_por?: string | null
          id?: string
          modo?: string
          motivo?: string | null
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_auto_alertas_ignorados_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_auto_alertas_ignorados_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "chat_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_auto_alertas_ignorados_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_auto_config: {
        Row: {
          agendamento_ativo: boolean
          agente_ativo: boolean
          agente_grupos: boolean
          agente_limite_hora: number
          agente_nome: string
          agente_nome_contato: string | null
          agente_privado: boolean
          created_at: string
          id: string
          provider: string
          relatorio_agrupar_estrategista: boolean
          relatorio_ativo: boolean
          relatorio_hora: string
          relatorio_so_clientes_ativos: boolean
          resumo_ativo: boolean
          resumo_destino: string
          resumo_dia: number
          resumo_hora: string
          template_idioma: string
          template_link: string | null
          template_relatorio: string | null
          template_resumo: string | null
          tenant_id: string
          uazapi_instance_id: string | null
          updated_at: string
        }
        Insert: {
          agendamento_ativo?: boolean
          agente_ativo?: boolean
          agente_grupos?: boolean
          agente_limite_hora?: number
          agente_nome?: string
          agente_nome_contato?: string | null
          agente_privado?: boolean
          created_at?: string
          id?: string
          provider?: string
          relatorio_agrupar_estrategista?: boolean
          relatorio_ativo?: boolean
          relatorio_hora?: string
          relatorio_so_clientes_ativos?: boolean
          resumo_ativo?: boolean
          resumo_destino?: string
          resumo_dia?: number
          resumo_hora?: string
          template_idioma?: string
          template_link?: string | null
          template_relatorio?: string | null
          template_resumo?: string | null
          tenant_id: string
          uazapi_instance_id?: string | null
          updated_at?: string
        }
        Update: {
          agendamento_ativo?: boolean
          agente_ativo?: boolean
          agente_grupos?: boolean
          agente_limite_hora?: number
          agente_nome?: string
          agente_nome_contato?: string | null
          agente_privado?: boolean
          created_at?: string
          id?: string
          provider?: string
          relatorio_agrupar_estrategista?: boolean
          relatorio_ativo?: boolean
          relatorio_hora?: string
          relatorio_so_clientes_ativos?: boolean
          resumo_ativo?: boolean
          resumo_destino?: string
          resumo_dia?: number
          resumo_hora?: string
          template_idioma?: string
          template_link?: string | null
          template_relatorio?: string | null
          template_resumo?: string | null
          tenant_id?: string
          uazapi_instance_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_auto_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_auto_envios: {
        Row: {
          chave_idempotencia: string | null
          created_at: string
          destino: string
          destino_nome: string | null
          erro: string | null
          id: string
          payload: Json
          provider: string
          status: string
          tenant_id: string
          tipo: string
        }
        Insert: {
          chave_idempotencia?: string | null
          created_at?: string
          destino: string
          destino_nome?: string | null
          erro?: string | null
          id?: string
          payload?: Json
          provider: string
          status?: string
          tenant_id: string
          tipo: string
        }
        Update: {
          chave_idempotencia?: string | null
          created_at?: string
          destino?: string
          destino_nome?: string | null
          erro?: string | null
          id?: string
          payload?: Json
          provider?: string
          status?: string
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_auto_envios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_auto_gestores: {
        Row: {
          ativo: boolean
          created_at: string
          grupo_jid: string | null
          grupo_nome: string | null
          id: string
          nome: string
          telefone: string | null
          tenant_id: string
          tipo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          grupo_jid?: string | null
          grupo_nome?: string | null
          id?: string
          nome: string
          telefone?: string | null
          tenant_id: string
          tipo?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          grupo_jid?: string | null
          grupo_nome?: string | null
          id?: string
          nome?: string
          telefone?: string | null
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_auto_gestores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_auto_modelos: {
        Row: {
          consultado_em: string
          id: string
          idioma: string
          meta_id: string | null
          motivo: string | null
          nome: string
          qualidade: string | null
          status: string
          tenant_id: string
          texto_diferente: boolean
          tipo: string
        }
        Insert: {
          consultado_em?: string
          id?: string
          idioma: string
          meta_id?: string | null
          motivo?: string | null
          nome: string
          qualidade?: string | null
          status: string
          tenant_id: string
          texto_diferente?: boolean
          tipo: string
        }
        Update: {
          consultado_em?: string
          id?: string
          idioma?: string
          meta_id?: string | null
          motivo?: string | null
          nome?: string
          qualidade?: string | null
          status?: string
          tenant_id?: string
          texto_diferente?: boolean
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_auto_modelos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_auto_modelos_chamadas: {
        Row: {
          acao: string
          created_at: string
          id: number
          tenant_id: string
        }
        Insert: {
          acao: string
          created_at?: string
          id?: never
          tenant_id: string
        }
        Update: {
          acao?: string
          created_at?: string
          id?: never
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_auto_modelos_chamadas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_auto_regras_anomalia: {
        Row: {
          ativo: boolean
          id: string
          janela_dias: number
          limiar: number
          tenant_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          id?: string
          janela_dias?: number
          limiar?: number
          tenant_id: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          id?: string
          janela_dias?: number
          limiar?: number
          tenant_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_auto_regras_anomalia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_auto_satisfacao: {
        Row: {
          analisado_ate: string
          client_id: string | null
          confianca: number
          contact_id: string | null
          conversation_id: string
          created_at: string
          id: string
          modelo: string
          motivo: string
          nivel: string
          sinais: string[]
          tenant_id: string
          tendencia: string | null
        }
        Insert: {
          analisado_ate: string
          client_id?: string | null
          confianca: number
          contact_id?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          modelo: string
          motivo: string
          nivel: string
          sinais?: string[]
          tenant_id: string
          tendencia?: string | null
        }
        Update: {
          analisado_ate?: string
          client_id?: string | null
          confianca?: number
          contact_id?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          modelo?: string
          motivo?: string
          nivel?: string
          sinais?: string[]
          tenant_id?: string
          tendencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_auto_satisfacao_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_auto_satisfacao_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "chat_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_auto_satisfacao_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_auto_satisfacao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_warmup_groups: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          frases: Json
          horario_fim: string
          horario_inicio: string
          id: string
          instance_ids: string[]
          intervalo_max_seg: number
          intervalo_min_seg: number
          nome: string
          personalidades: Json
          pesos: Json
          proxima_mensagem_em: string | null
          tema: string
          tenant_id: string
          ultima_mensagem_em: string | null
          usar_ia: boolean
          wa_chatid: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          frases?: Json
          horario_fim?: string
          horario_inicio?: string
          id?: string
          instance_ids?: string[]
          intervalo_max_seg?: number
          intervalo_min_seg?: number
          nome: string
          personalidades?: Json
          pesos?: Json
          proxima_mensagem_em?: string | null
          tema?: string
          tenant_id: string
          ultima_mensagem_em?: string | null
          usar_ia?: boolean
          wa_chatid: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          frases?: Json
          horario_fim?: string
          horario_inicio?: string
          id?: string
          instance_ids?: string[]
          intervalo_max_seg?: number
          intervalo_min_seg?: number
          nome?: string
          personalidades?: Json
          pesos?: Json
          proxima_mensagem_em?: string | null
          tema?: string
          tenant_id?: string
          ultima_mensagem_em?: string | null
          usar_ia?: boolean
          wa_chatid?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_warmup_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_warmup_logs: {
        Row: {
          enviado_em: string
          group_id: string
          id: string
          instance_id: string
          mensagem: string
          sucesso: boolean
          tenant_id: string
          uazapi_response: Json | null
        }
        Insert: {
          enviado_em?: string
          group_id: string
          id?: string
          instance_id: string
          mensagem: string
          sucesso?: boolean
          tenant_id: string
          uazapi_response?: Json | null
        }
        Update: {
          enviado_em?: string
          group_id?: string
          id?: string
          instance_id?: string
          mensagem?: string
          sucesso?: boolean
          tenant_id?: string
          uazapi_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_warmup_logs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "wa_warmup_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_warmup_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_webhook_tokens: {
        Row: {
          anterior_ate: string | null
          criado_em: string
          instance_id: string
          instancia_lid: string | null
          rotacionado_em: string
          tenant_id: string
          token_hash: string
          token_hash_anterior: string | null
          ultimo_uso_em: string | null
        }
        Insert: {
          anterior_ate?: string | null
          criado_em?: string
          instance_id: string
          instancia_lid?: string | null
          rotacionado_em?: string
          tenant_id: string
          token_hash: string
          token_hash_anterior?: string | null
          ultimo_uso_em?: string | null
        }
        Update: {
          anterior_ate?: string | null
          criado_em?: string
          instance_id?: string
          instancia_lid?: string | null
          rotacionado_em?: string
          tenant_id?: string
          token_hash?: string
          token_hash_anterior?: string | null
          ultimo_uso_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_webhook_tokens_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: true
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_webhook_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          criado_em: string
          duracao_ms: number | null
          evento: string
          id: string
          payload: Json | null
          response_body: string | null
          status_code: number | null
          sucesso: boolean
          tenant_id: string
          webhook_id: string
        }
        Insert: {
          criado_em?: string
          duracao_ms?: number | null
          evento: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          status_code?: number | null
          sucesso?: boolean
          tenant_id: string
          webhook_id: string
        }
        Update: {
          criado_em?: string
          duracao_ms?: number | null
          evento?: string
          id?: string
          payload?: Json | null
          response_body?: string | null
          status_code?: number | null
          sucesso?: boolean
          tenant_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          criado_por: string | null
          eventos: string[]
          id: string
          nome: string
          secret: string
          tenant_id: string
          url: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          eventos?: string[]
          id?: string
          nome: string
          secret: string
          tenant_id: string
          url: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          criado_por?: string | null
          eventos?: string[]
          id?: string
          nome?: string
          secret?: string
          tenant_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhooks_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "webhooks_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          ativo: boolean | null
          auto_reply_fora_horario: boolean | null
          categoria: Database["public"]["Enums"]["instance_categoria"] | null
          cor: string | null
          criado_em: string | null
          departamento_padrao_id: string | null
          id: string
          instance_id: string
          mensagem_fora_horario: string | null
          nome: string
          numero_whatsapp: string | null
          ocultar_grupos: boolean
          qr_code: string | null
          status: string | null
          tenant_id: string
          webhook_url: string | null
        }
        Insert: {
          ativo?: boolean | null
          auto_reply_fora_horario?: boolean | null
          categoria?: Database["public"]["Enums"]["instance_categoria"] | null
          cor?: string | null
          criado_em?: string | null
          departamento_padrao_id?: string | null
          id?: string
          instance_id: string
          mensagem_fora_horario?: string | null
          nome: string
          numero_whatsapp?: string | null
          ocultar_grupos?: boolean
          qr_code?: string | null
          status?: string | null
          tenant_id: string
          webhook_url?: string | null
        }
        Update: {
          ativo?: boolean | null
          auto_reply_fora_horario?: boolean | null
          categoria?: Database["public"]["Enums"]["instance_categoria"] | null
          cor?: string | null
          criado_em?: string | null
          departamento_padrao_id?: string | null
          id?: string
          instance_id?: string
          mensagem_fora_horario?: string | null
          nome?: string
          numero_whatsapp?: string | null
          ocultar_grupos?: boolean
          qr_code?: string | null
          status?: string | null
          tenant_id?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contrato_clientes_atendidos: {
        Row: { tenant_id: string | null; contrato_id: string | null; cliente_id: string | null; principal: boolean | null }
        Relationships: []
      }
      users_legacy: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          email: string | null
          id: string | null
          nome: string | null
          perfil_derivado: string | null
          perfil_legado: string | null
        }
        Relationships: []
      }
      v_alertas_estrategista: {
        Row: {
          chat_negativo: number | null
          entregas_atrasadas: number | null
          estrategista_id: string | null
          estrategista_nome: string | null
          ranking_pos: number | null
        }
        Insert: {
          chat_negativo?: never
          entregas_atrasadas?: never
          estrategista_id?: string | null
          estrategista_nome?: string | null
          ranking_pos?: never
        }
        Update: {
          chat_negativo?: never
          entregas_atrasadas?: never
          estrategista_id?: string | null
          estrategista_nome?: string | null
          ranking_pos?: never
        }
        Relationships: []
      }
      v_contratos_alertas: {
        Row: {
          atualizado_em: string | null
          cliente_nome: string | null
          contrato_id: string | null
          estrategista_id: string | null
          num_parcelas: number | null
          status_secundario: string | null
          ultimo_vencimento: string | null
          vencimento: string | null
        }
        Insert: {
          atualizado_em?: string | null
          cliente_nome?: string | null
          contrato_id?: string | null
          estrategista_id?: string | null
          num_parcelas?: number | null
          status_secundario?: string | null
          ultimo_vencimento?: never
          vencimento?: string | null
        }
        Update: {
          atualizado_em?: string | null
          cliente_nome?: string | null
          contrato_id?: string | null
          estrategista_id?: string | null
          num_parcelas?: number | null
          status_secundario?: string | null
          ultimo_vencimento?: never
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "users_legacy"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "v_alertas_estrategista"
            referencedColumns: ["estrategista_id"]
          },
          {
            foreignKeyName: "contratos_estrategista_id_fkey"
            columns: ["estrategista_id"]
            isOneToOne: false
            referencedRelation: "v_dept_member_metrics"
            referencedColumns: ["user_id"]
          },
        ]
      }
      v_dept_member_metrics: {
        Row: {
          conversas_abertas: number | null
          department_id: string | null
          is_gerente: boolean | null
          msgs_hoje: number | null
          msgs_semana: number | null
          user_id: string | null
          user_nome: string | null
          user_perfil: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_department_agents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "chat_departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      definir_clientes_contrato: {
        Args: { p_contrato_id: string; p_actor_esperado: string; p_cliente_ids: string[]; p_cliente_ids_esperados: string[]; p_cliente_principal_esperado: string; p_motivo: string }
        Returns: Json
      }
      desk_password_change_status: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      aprovar_extrato_mes: {
        Args: { p_estrategista_id: string; p_mes: string }
        Returns: string
      }
      auto_match_contacts_to_clients: {
        Args: never
        Returns: {
          client_id: string
          client_nome: string
          contact_id: string
          contact_nome: string
        }[]
      }
      calcular_comissoes_contrato: {
        Args: { p_contrato_id: string }
        Returns: undefined
      }
      chat_midia_reivindicar: {
        Args: { p_limite?: number; p_max_tenant_dia?: number }
        Returns: {
          caminho: string
          conversation_id: string
          media_url: string
          message_id: string
          mimetype: string
          tamanho: number
          tenant_id: string
          tentativas: number
          tipo: string
        }[]
      }
      client_assignment_contexto: {
        Args: { p_client_id: string }
        Returns: Json
      }
      client_assignment_decidir: {
        Args: {
          p_acao: string
          p_assignment_id: string
          p_client_id: string
          p_idempotencia: string
          p_motivo: string
          p_revisao_esperada: number
          p_tipo: string
          p_user_id: string
        }
        Returns: Json
      }
      client_assignment_historico: {
        Args: { p_antes_revisao?: number; p_client_id: string }
        Returns: Json
      }
      client_assignment_pode_ler: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      cliente_canais_resumo: {
        Args: { p_client: string; p_instancias?: string[]; p_tenant: string }
        Returns: {
          canal_rotulo: string
          canal_tipo: string
          instancias: number
          msgs_30d: number
          status: string
          ultima_msg: string
        }[]
      }
      cliente_relacionamento_previa_reservar: {
        Args: {
          p_dia: string
          p_intervalo_s?: number
          p_max_dia?: number
          p_tenant: string
        }
        Returns: boolean
      }
      cliente_relacionamento_reivindicar: {
        Args: {
          p_client_ids: string[]
          p_dia: string
          p_limite?: number
          p_tenant: string
        }
        Returns: {
          analisado_ate: string | null
          analisado_em: string | null
          atualizado_em: string
          client_id: string
          cobertura: Json
          confianca: number
          criado_em: string
          custo_usd: number | null
          dia_processado: string | null
          eventos: Json
          metricas: Json
          modelo: string | null
          motivo: string | null
          pendencias: Json
          processado_em: string | null
          reivindicado_em: string | null
          resumo: string
          risco: string
          risco_motivos: string[]
          satisfacao: string
          sinais_cliente: string[]
          tenant_id: string
          tendencia: string | null
          tokens_entrada: number | null
          tokens_saida: number | null
          versao_prompt: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "cliente_relacionamento"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cliente_relacionamento_uso_registrar: {
        Args: {
          p_chamadas: number
          p_custo: number
          p_dia: string
          p_tenant: string
        }
        Returns: undefined
      }
      cliente_timeline: {
        Args: {
          p_ate?: string
          p_client: string
          p_desde: string
          p_instancias?: string[]
          p_limite?: number
          p_tenant: string
        }
        Returns: {
          autor_nome: string
          autor_tipo: string
          canal_rotulo: string
          canal_tipo: string
          conteudo: string
          criado_em: string
          message_id: string
          midia_texto: string
          tipo: string
        }[]
      }
      comissoes_papel_do_perfil: { Args: { p_perfil: string }; Returns: string }
      get_agent_tma: {
        Args: { p_agent_id: string; p_days?: number }
        Returns: {
          tma_minutos: number
          total_conversas: number
        }[]
      }
      get_client_last_contact: {
        Args: { p_client_ids: string[] }
        Returns: {
          client_id: string
          ultimo_contato: string
        }[]
      }
      get_contact_client_id: { Args: { p_contact_id: string }; Returns: string }
      get_internal_last_messages: {
        Args: { p_conv_ids: string[] }
        Returns: {
          conteudo: string
          conversation_id: string
          criado_em: string
          id: string
          media_url: string
          tipo: string
          user_id: string
          user_nome: string
          user_perfil: string
        }[]
      }
      get_internal_unread_counts: {
        Args: { p_user_id: string }
        Returns: {
          conversation_id: string
          unread_count: number
        }[]
      }
      get_my_gerente_dept_ids: { Args: never; Returns: string[] }
      get_omnx_bridge_credential: {
        Args: { p_provider?: string }
        Returns: {
          base_url: string
          rotation_version: number
          secret: string
          tenant_id: string
        }[]
      }
      get_omnx_bridge_credential_tenant: {
        Args: { p_provider?: string; p_tenant_id: string }
        Returns: {
          base_url: string
          rotation_version: number
          secret: string
          tenant_id: string
        }[]
      }
      get_omnx_integracao_status: {
        Args: { p_provider?: string }
        Returns: {
          base_url: string
          connected: boolean
          is_active: boolean
          provider: string
          rotation_version: number
          updated_at: string
        }[]
      }
      get_tenant_by_domain: {
        Args: { p_domain: string }
        Returns: {
          favicon_url: string
          id: string
          logo_dark_url: string
          logo_url: string
          name: string
          primary_color: string
          slug: string
        }[]
      }
      get_tenant_do_usuario: { Args: { p_user_id: string }; Returns: string }
      get_unread_counts_for_user: {
        Args: { p_instance_ids?: string[]; p_user_id: string }
        Returns: {
          conversation_id: string
          unread_count: number
        }[]
      }
      get_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      has_permissao: {
        Args: { p_acao: string; p_recurso: string }
        Returns: boolean
      }
      has_permissao_de: {
        Args: { p_acao: string; p_recurso: string; p_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      iris_gt3_begin_chat: {
        Args: {
          p_connection: string
          p_gt3_user: string
          p_request: string
          p_scope_hash: string
        }
        Returns: Json
      }
      iris_gt3_consume_code: {
        Args: { p_hash: string; p_token_hash: string; p_workspace: string }
        Returns: {
          ativo: boolean
          created_at: string
          created_by: string
          expires_at: string
          id: string
          revisao: number
          revoked_at: string | null
          tenant_id: string
          token_hash: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "iris_gt3_connections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      iris_gt3_finish_chat: {
        Args: {
          p_connection_revision: number
          p_id: string
          p_lease: string
          p_mensagens: Json
          p_recipient_revision: number
          p_texto: string
        }
        Returns: boolean
      }
      iris_gt3_save_recipient: {
        Args: {
          p_actor: string
          p_ativo: boolean
          p_connection: string
          p_desk_user: string
          p_gt3_user: string
          p_teste: boolean
        }
        Returns: {
          ativo: boolean
          connection_id: string
          desk_user_id: string
          gt3_user_id: string
          id: string
          modo_teste: boolean
          revisao: number
          tenant_id: string
          updated_at: string
          updated_by: string
        }
        SetofOptions: {
          from: "*"
          to: "iris_gt3_recipients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_manager: { Args: never; Returns: boolean }
      is_comissoes_admin: { Args: never; Returns: boolean }
      is_comissoes_gestor: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_master_admin: { Args: never; Returns: boolean }
      match_contact_to_client: {
        Args: { p_contact_id: string; p_whatsapp: string }
        Returns: string
      }
      notify_secret_matches: { Args: { candidate: string }; Returns: boolean }
      pj_owns_prestador: { Args: { p: string }; Returns: boolean }
      pj_registrar_nota: {
        Args: {
          p_entrega_id: string
          p_mime: string
          p_nome: string
          p_storage_path: string
          p_tamanho: number
        }
        Returns: string
      }
      prorrogar_vigencia_contrato: {
        Args: { p_contrato_id: string; p_actor_esperado: string; p_nova_data: string; p_motivo: string; p_fim_esperado: string | null; p_status_esperado: string; p_reativar?: boolean }
        Returns: Json
      }
      concluir_contratos_vencidos: { Args: never; Returns: Json }
      pode_gerir_contratos: { Args: never; Returns: boolean }
      pode_ver_restrito: { Args: never; Returns: boolean }
      renumerar_parcelas_pagamentos: {
        Args: { p_pagamentos: Json }
        Returns: Json
      }
      resolve_tenant_default: { Args: never; Returns: string }
      resolve_tenant_do_clone: { Args: never; Returns: string }
      resumo_saude_apps: {
        Args: { p_horas?: number }
        Returns: {
          app: string
          avisos: number
          erros: number
          ultimo: string
        }[]
      }
      revoke_omnx_integracao: {
        Args: { p_provider?: string }
        Returns: undefined
      }
      save_omnx_integracao_secret: {
        Args: {
          p_base_url?: string
          p_metadata?: Json
          p_provider: string
          p_secret: string
        }
        Returns: number
      }
      seed_app_modules_for_tenant: {
        Args: { p_tenant: string }
        Returns: undefined
      }
      seed_atendimento_segmento: {
        Args: { p_segmento: string; p_tenant: string }
        Returns: undefined
      }
      seed_tenant: { Args: { p_tenant_id: string }; Returns: undefined }
      seed_wa_auto_for_tenant: {
        Args: { p_tenant: string }
        Returns: undefined
      }
      storage_autor_do_upload: {
        Args: { p_owner: string; p_owner_id: string }
        Returns: string
      }
      tempo_resposta_agenda_registrar: {
        Args: {
          p_agenda: Json
          p_connection: string
          p_gt3_user: string
          p_recipient_revisao: number
        }
        Returns: Json
      }
      tempo_resposta_agendas_episodios: {
        Args: { p_ids: string[]; p_tenant: string }
        Returns: Json
      }
      tempo_resposta_configurar: {
        Args: {
          p_anos: number[]
          p_feriados: string[]
          p_modo: string
          p_revisao: number
        }
        Returns: Json
      }
      tempo_resposta_definir_titular: {
        Args: { p_client: string; p_user?: string }
        Returns: Json
      }
      tempo_resposta_detalhe: {
        Args: { p_episodio: string; p_tenant: string }
        Returns: Json
      }
      tempo_resposta_encerrar_pausa: { Args: { p_id: string }; Returns: Json }
      tempo_resposta_lote: {
        Args: { p_cursor?: string; p_limite?: number; p_tenant: string }
        Returns: Json
      }
      tempo_resposta_painel: { Args: { p_cursor?: string }; Returns: Json }
      tempo_resposta_pausar: {
        Args: { p_minutos: number; p_motivo: string; p_user: string }
        Returns: Json
      }
      tempo_resposta_registrar: {
        Args: {
          p_confiavel: boolean
          p_mensagem: string
          p_ocorrido_em: string
          p_recuperada: boolean
          p_user?: string
        }
        Returns: Json
      }
      tenant_do_anexo_atendimento: {
        Args: { p_object_name: string }
        Returns: string
      }
      tenant_do_anexo_contrato: {
        Args: { p_object_name: string }
        Returns: string
      }
      tenant_do_anexo_reporte: {
        Args: { p_object_name: string }
        Returns: string
      }
      tenant_do_arquivo_delivery: {
        Args: { p_object_name: string }
        Returns: string
      }
      tenant_do_arquivo_pj_nota: {
        Args: { p_object_name: string }
        Returns: string
      }
      tenant_do_comprovante_venda: {
        Args: { p_object_name: string }
        Returns: string
      }
      tenant_fallback_mais_antigo: { Args: never; Returns: string }
      user_can_access_client: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      user_can_access_instance: {
        Args: { p_instance_id: string }
        Returns: boolean
      }
      vinculos_buscar_clientes: {
        Args: { p_limite?: number; p_texto: string }
        Returns: {
          ativo: boolean
          empresa: string
          id: string
          nome: string
          vigente: boolean
        }[]
      }
      vinculos_decidir: {
        Args: { p_acao: string; p_client_id?: string; p_contato_id: string }
        Returns: Json
      }
      vinculos_gravar_sugestoes: {
        Args: { p_chaves?: string[]; p_itens: Json; p_tenant: string }
        Returns: Json
      }
      vinculos_listar: {
        Args: {
          p_dias?: number
          p_filtro?: string
          p_limite?: number
          p_tipo?: string
        }
        Returns: {
          clientes: Json
          contato_id: string
          decisao: string
          final_telefone: string
          instancias: number
          instancias_nomes: string[]
          instancias_ocultas: string[]
          msgs_30d: number
          nome: string
          ocultar_grupos: boolean
          rejeitados: number
          restrito: boolean
          sugestoes: Json
          tipo: string
          ultima_msg_em: string
        }[]
      }
      vinculos_pode_gerir: { Args: never; Returns: boolean }
      vinculos_reservar_execucao: {
        Args: { p_intervalo_s?: number; p_tenant: string; p_user: string }
        Returns: string
      }
      wa_agente_acoes_capacidades: { Args: never; Returns: Json }
      wa_agente_acoes_confirmar: {
        Args: { p_codigo: string; p_pedido: string }
        Returns: Json
      }
      wa_agente_acoes_propor: {
        Args: { p_acao: string; p_alvo: string; p_novo: Json; p_pedido: string }
        Returns: Json
      }
      wa_agente_escopo: {
        Args: { p_tenant: string; p_user: string }
        Returns: {
          client_ids: string[]
          total: boolean
        }[]
      }
      wa_agente_reivindicar: {
        Args: { p_limite: number }
        Returns: {
          chat_jid: string
          chat_message_id: string | null
          conversation_id: string | null
          created_at: string
          eh_grupo: boolean
          entrada_encaminhada: boolean | null
          entrada_texto_sha256: string | null
          gatilho: string
          id: string
          instance_uuid: string
          lock_ate: string | null
          membro_id: string | null
          message_id_wpp: string
          motivo: string | null
          processar_apos: string
          remetente_chave: string | null
          resposta_message_ids: string[]
          status: string
          tenant_id: string
          tentativas: number
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "wa_agente_pedidos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      wa_auto_cron_secret_confere: {
        Args: { p_segredo: string }
        Returns: boolean
      }
      wa_auto_grupos_sem_cliente: {
        Args: {
          p_agora?: string
          p_dias?: number
          p_limite?: number
          p_tenant: string
        }
        Returns: {
          chave: string
          contato_id: string
          contato_ids: string[]
          msgs: number
          nome: string
          sugestao_client_id: string
          ultima_msg: string
        }[]
      }
      wa_auto_queda_volume: {
        Args: { p_agora?: string; p_limiar: number; p_tenant_id: string }
        Returns: {
          contact_id: string
          media_semanal: number
          msgs_semana: number
        }[]
      }
      wa_base_url_permitida: {
        Args: { p_provider: string; p_url: string }
        Returns: boolean
      }
      wa_webhook_instancia_do_token: {
        Args: { p_token: string }
        Returns: {
          instance_id: string
          instance_uuid: string
          tenant_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "member"
      employee_status: "active" | "inactive" | "on_leave"
      instance_categoria: "suporte" | "financeiro" | "entrega"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "member"],
      employee_status: ["active", "inactive", "on_leave"],
      instance_categoria: ["suporte", "financeiro", "entrega"],
    },
  },
} as const
