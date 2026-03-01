import { supabase } from './supabase.js';
import { ALLOWED_EMAILS } from './config.js';

export async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export function isAllowedEmail(email) {
  if (!ALLOWED_EMAILS || ALLOWED_EMAILS.length === 0) return true;
  return ALLOWED_EMAILS.includes(email);
}

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) {
    console.error('Login error:', error);
    throw error;
  }
}

export async function signOut() {
  await supabase.auth.signOut();
  location.reload();
}

export function onAuthStateChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
