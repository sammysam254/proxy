const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lpqrffvbcbousmhqpdpm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxwcXJmZnZiY2JvdXNtaHFwZHBtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjE1ODU5NywiZXhwIjoyMTA3NzM0NTk3fQ.WJnz5BBCuKtJB0cwIn_eGVCkXIca3TX6A2ri2sXwW18';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getLiveLogs() {
  const { data, error } = await supabase
    .from('system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error fetching logs:', error.message);
    return;
  }

  console.log('=== LATEST 30 LIVE LOGS FROM USA MACHINE ===');
  (data || []).reverse().forEach(l => {
    const time = new Date(l.created_at).toLocaleTimeString();
    const lvl = (l.level || 'INFO').toUpperCase();
    const srv = l.service || 'engine';
    console.log(`[${time}] [${lvl}] [${srv}] ${l.message}`);
  });
}
getLiveLogs();
