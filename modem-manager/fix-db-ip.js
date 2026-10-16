const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lpqrffvbcbousmhqpdpm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwcXJmZnZiY2JvdXNtaHFwZHBtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjE1ODU5NywiZXhwIjoyMTA3NzM0NTk3fQ.WJnz5BBCuKtJB0cwIn_eGVCkXIca3TX6A2ri2sXwW18';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fixDb() {
  await supabase.from('proxies').update({ vps_host: '104.131.118.5' }).neq('vps_host', '104.131.118.5');
  console.log('Database updated successfully to 104.131.118.5');
}
fixDb();
