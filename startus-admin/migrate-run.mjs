// migrate-run.mjs
// calendar-manager → member-manager スケジュールデータ移行スクリプト
// node migrate-run.mjs

const SRC_URL = 'https://vmnwxackvpxbgtexcsmv.supabase.co';
const SRC_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtbnd4YWNrdnB4Ymd0ZXhjc212Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTYwOTAsImV4cCI6MjA4ODA3MjA5MH0.BmQzdh5xuQ32Y26I_JH2IC-nwHcJnWWc8XIC9Okb0yk';

const DST_URL = 'https://jfsxywwufwdprqdkyxhr.supabase.co';
const DST_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impmc3h5d3d1ZndkcHJxZGt5eGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NTM4NjUsImV4cCI6MjA4NzUyOTg2NX0.htkbpmzoFkH204wggYTl10YEBalDIDq4gJp-W25fRRQ';

function headers(key, extras = {}) {
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extras,
  };
}

async function getAll(url, key, table, params = '') {
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
    headers: headers(key),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${table} failed [${res.status}]: ${text}`);
  }
  return res.json();
}

async function insertBatch(url, key, table, records) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(key, { 'Prefer': 'return=minimal' }),
    body: JSON.stringify(records),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${table} failed [${res.status}]: ${text}`);
  }
}

async function main() {
  console.log('=== calendar-manager → member-manager 移行 ===\n');

  // ① ソースからスケジュール取得
  console.log('① calendar-manager からスケジュールを取得...');
  const schedules = await getAll(SRC_URL, SRC_KEY, 'schedules', 'select=*&order=date.asc');
  console.log(`   取得: ${schedules.length} 件`);

  if (schedules.length === 0) {
    console.log('   移行するデータがありません。終了します。');
    return;
  }

  // ② 移行先のスケジュール件数確認
  console.log('\n② member-manager の現在のスケジュール件数確認...');
  let existingSchedules;
  try {
    existingSchedules = await getAll(DST_URL, DST_KEY, 'schedules', 'select=id&limit=1');
  } catch (e) {
    if (e.message.includes('42P01') || e.message.includes('does not exist')) {
      console.error('\n❌ エラー: member-manager の schedules テーブルが存在しません。');
      console.error('   先に setup-schedules.sql を member-manager Supabase SQL Editor で実行してください。');
      process.exit(1);
    }
    throw e;
  }
  if (existingSchedules.length > 0) {
    // 全件取得してカウント
    const all = await getAll(DST_URL, DST_KEY, 'schedules', 'select=id');
    console.log(`   既存データあり: ${all.length} 件`);
    console.log('   ⚠️  既存データがある状態で実行すると重複します。');
    console.log('   続行するには 5 秒待ちます... (Ctrl+C でキャンセル)');
    await new Promise(r => setTimeout(r, 5000));
  } else {
    console.log('   既存データなし（クリーン状態）');
  }

  // ③ 移行先の教室マスタ取得
  console.log('\n③ member-manager から教室マスタを取得...');
  const classrooms = await getAll(DST_URL, DST_KEY, 'classrooms', 'select=id,name,main_coach&order=name.asc');
  const classroomMap = new Map(classrooms.map(c => [c.name, c]));
  console.log(`   教室数: ${classrooms.length} 件`);

  // ④ データ変換
  console.log('\n④ データ変換...');
  const transformed = schedules.map(s => {
    const cls = classroomMap.get(s.class_name);
    return {
      class_name:   s.class_name,
      class_id:     cls?.id         || null,
      coach_name:   cls?.main_coach || null,
      date:         s.date,
      start_time:   s.start_time || null,
      end_time:     s.end_time   || null,
      venue:        s.venue      || null,
      status:       s.status,
      is_published: s.is_published ?? false,
      is_trial_ok:  true,
      fiscal_year:  parseInt(s.fiscal_year, 10),
      created_at:   s.created_at || new Date().toISOString(),
      updated_at:   s.updated_at || null,
    };
  });

  // 教室名不一致チェック
  const unmatched = [...new Set(transformed.filter(s => !s.class_id).map(s => s.class_name))];
  if (unmatched.length > 0) {
    console.log(`   ⚠️  classrooms と一致しない教室名 (${unmatched.length} 種): class_id=NULL で移行します`);
    unmatched.forEach(n => console.log(`       - "${n}"`));
  } else {
    console.log('   ✓ 全教室名が classrooms と一致');
  }

  // ⑤ バッチインサート
  console.log('\n⑤ member-manager にインサート...');
  const BATCH = 500;
  for (let i = 0; i < transformed.length; i += BATCH) {
    const batch = transformed.slice(i, i + BATCH);
    await insertBatch(DST_URL, DST_KEY, 'schedules', batch);
    console.log(`   ${Math.min(i + BATCH, transformed.length)} / ${transformed.length} 件完了`);
  }

  // ⑥ 結果サマリー
  console.log('\n=== 移行完了 ===');
  const byFY = {};
  transformed.forEach(s => {
    if (!byFY[s.fiscal_year]) byFY[s.fiscal_year] = { total: 0, confirmed: 0, tentative: 0, canceled: 0 };
    byFY[s.fiscal_year].total++;
    byFY[s.fiscal_year][s.status]++;
  });
  console.log('年度別:');
  Object.entries(byFY).sort().forEach(([fy, c]) => {
    console.log(`  ${fy}年度: 計${c.total}件 (確定${c.confirmed} / 暫定${c.tentative} / キャンセル${c.canceled})`);
  });

  const matchedCount = transformed.filter(s => s.class_id).length;
  console.log(`\nclass_id 付与: ${matchedCount} / ${transformed.length} 件`);
  if (unmatched.length > 0) {
    console.log('※ class_id が NULL の教室は member-manager アプリで手動確認してください。');
  }
}

main().catch(err => {
  console.error('\n❌ 移行エラー:', err.message);
  process.exit(1);
});
