require('dotenv').config();
const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  for (const t of ['national_exam_sessions','national_exam_registrations','national_exam_results','national_exam_subject_scores']) {
    const n = (await p.query(`SELECT COUNT(*)::int c FROM "${t}"`)).rows[0].c;
    console.log(`  ${t.padEnd(32)} ${n} rows`);
  }
  const dep = (await p.query(`
    SELECT tc.table_name child, kcu.column_name col, ccu.table_name parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name=tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
     WHERE tc.constraint_type='FOREIGN KEY'
       AND ccu.table_name LIKE 'national_exam%' AND tc.table_name NOT LIKE 'national_exam%'`)).rows;
  console.log('\nnon-national tables depending on them:', dep.length ? JSON.stringify(dep) : 'none');
  const ex = (await p.query(`SELECT COUNT(*)::int c FROM exams WHERE type='MOCK_NATIONAL'`)).rows[0].c;
  console.log('exams of type MOCK_NATIONAL:', ex);
  const g9 = (await p.query(`SELECT code, is_exit_grade FROM grade_levels ORDER BY level_order`)).rows;
  console.log('grade_levels:', JSON.stringify(g9));
  await p.end();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
