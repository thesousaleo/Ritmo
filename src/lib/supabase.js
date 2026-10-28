import { createClient } from '@supabase/supabase-js';

// Chave publicável: segura para o navegador. O acesso aos dados é protegido por RLS (cada usuário só vê os próprios registros).
export const SUPABASE_URL = 'https://mdpwlihnyxfxjekdszrg.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_YT9HTP9cxuy3S97400YYxA_wTRQcUwJ';

// Para onde os e-mails de confirmação e de nova senha levam: a própria página no navegador,
// ou o site publicado quando o pedido sai do APK (o link de e-mail abre no navegador do celular).
const PUBLIC_SITE = 'https://thesousaleo.github.io/Ritmo/';
export const SITE_URL =
  typeof window !== 'undefined' && window.location.protocol === 'https:' && window.location.hostname.endsWith('github.io')
    ? window.location.origin + window.location.pathname
    : typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && window.location.port
      ? window.location.origin + window.location.pathname
      : PUBLIC_SITE;

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'ritmo.auth',
  },
  realtime: { params: { eventsPerSecond: 5 } },
});

const MESSAGES = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/user already registered|already been registered/i, 'Já existe uma conta com este e-mail. Entre com sua senha.'],
  [/email not confirmed/i, 'Confirme o e-mail pelo link que enviamos antes de entrar.'],
  [/password should be at least|at least 6 characters/i, 'A senha precisa ter pelo menos 6 caracteres.'],
  [/rate limit|too many requests|security purposes/i, 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'],
  [/unable to validate email|invalid email|invalid format/i, 'Este e-mail não parece válido.'],
  [/same password|different from the old/i, 'Escolha uma senha diferente da anterior.'],
  [/failed to fetch|network|load failed/i, 'Sem conexão com o servidor. Verifique a internet e tente de novo.'],
];

export function authMessage(error) {
  const raw = (error && (error.message || String(error))) || '';
  for (const [re, text] of MESSAGES) if (re.test(raw)) return text;
  return raw ? `Não deu certo: ${raw}` : 'Algo não funcionou. Tente de novo.';
}
