const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://zsfijzjzioaragnlopgn.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzZmlqemp6aW9hcmFnbmxvcGduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjMwNDksImV4cCI6MjEwMjY5OTA0OX0.Z-VBaoutWmZUW6S_G3SECl5ylWUfECs5iR7E4aMNASI';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fixDb() {
  await supabase.from('proxies').update({ vps_host: '104.131.118.5' }).neq('vps_host', '104.131.118.5');
  console.log('Database updated successfully to 104.131.118.5');
}
fixDb();
