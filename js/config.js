/*
 * Configuração da nuvem (Supabase).
 * Dados do projeto em: Supabase > Project Settings > API Keys.
 *  - supabaseUrl: "Project URL" (sem /rest/v1 no final)
 *  - supabaseKey: chave "publishable" (pública por natureza; a segurança vem
 *    do login + regras de acesso criadas pelo arquivo supabase/schema.sql)
 * Deixando em branco, o sistema roda em MODO LOCAL (dados só neste navegador).
 */
window.OUROSAF_CONFIG = {
  supabaseUrl: 'https://cntqnnizoxwjthlzzeaq.supabase.co',
  supabaseKey: 'sb_publishable_KICj9FazqoBS7Tx9JhsNuw_8INA5EAO',
};
