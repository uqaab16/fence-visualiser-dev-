import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ekhipvszzgwkweejlfcf.supabase.co';
const supabaseAnonKey = 'sb_publishable_Dh7ybHv0nSBUfaPYEpVVlg_BMXb_Dti';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
