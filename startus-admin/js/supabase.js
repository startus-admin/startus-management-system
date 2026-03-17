import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
