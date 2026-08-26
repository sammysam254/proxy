const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://zsfijzjzioaragnlopgn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getTunnelLogs() {
  const { data, error } = await supabase
    .from('system_logs')
    .select('*')
    .ilike('message', '%tunnel%')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching logs:', error.message);
    return;
  }

  console.log('=== LATEST TUNNEL LOGS ===');
  (data || []).reverse().forEach(l => {
    const time = new Date(l.created_at).toLocaleTimeString();
    console.log(`[${time}] [${l.level?.toUpperCase()}] ${l.message}`);
  });
}
getTunnelLogs();
