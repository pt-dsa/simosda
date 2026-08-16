import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://lntxiauelcphograekzl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxudHhpYXVlbGNwaG9ncmFla3psIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMDg5MDEsImV4cCI6MjA5ODc4NDkwMX0.c-0efscNTQLjk25RH8H1hbv0AJHTIcy7lY-yHGhdaDU'
);

async function test() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: '198507152010011002@simosda.go.id', // typical pattern?
    password: 'Rahasia#2026!Simosda'
  });
  
  if (authError) {
    console.log("Auth failed:", authError.message);
    // try different email
    const { data: authData2, error: authError2 } = await supabase.auth.signInWithPassword({
      email: 'budi.santoso@dcktr.tangsel.go.id',
      password: 'Rahasia#2026!Simosda'
    });
    if (authError2) {
       console.log("Auth2 failed:", authError2.message);
       return;
    }
  }

  const { data, error } = await supabase.from('pegawai').select('nama,foto,foto_storage_path').limit(5);
  console.log(JSON.stringify(data, null, 2));
}
test();
