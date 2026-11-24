import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'node:fs';

const db = new PGlite({ extensions: { btree_gist } });
// Like new Supabase projects: NO default table grants, so the script must grant explicitly.
const setup = fs.readFileSync(process.argv[2], 'utf8').replace(/\('[^']+@[^']+', 'owner'\)/, "('you@example.com', 'owner')")
  .replace("('you@example.com', 'owner')", "('owner@test.dev', 'owner')");

// ---- minimal Supabase shim ----
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema extensions; create schema auth;
  grant usage on schema public, extensions, auth to anon, authenticated;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(auth.jwt()->>'sub','')::uuid $$;
  grant execute on all functions in schema auth to anon, authenticated;
  create publication supabase_realtime;
  insert into auth.users values ('11111111-1111-1111-1111-111111111111','owner@test.dev'), ('22222222-2222-2222-2222-222222222222','stranger@test.dev');
`);

await db.exec(setup);
await db.exec(setup); // idempotent re-run
console.log('setup ran twice OK');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };

async function as(role, email, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${email ? JSON.stringify({ sub: email.startsWith('owner') ? '11111111-1111-1111-1111-111111111111' : '22222222-2222-2222-2222-222222222222', email }) : ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
async function expectErr(p, code, hint) {
  try { await p; return { ok: false, msg: 'no error' }; }
  catch (e) { return { ok: e.code === code && (!hint || e.hint === hint), msg: `${e.code} ${e.hint || ''} ${e.message}` }; }
}

const unit = (await db.query(`select id from units where name='BGC 24J'`)).rows[0].id;
const unit2 = (await db.query(`select id from units where name='BGC 8T'`)).rows[0].id;
ok((await db.query('select count(*)::int c from units')).rows[0].c === 2, 'units seeded once');
ok((await db.query('select count(*)::int c from platforms')).rows[0].c === 4, 'platforms seeded once');
ok((await db.query(`select count(*)::int c from pg_publication_tables where pubname='supabase_realtime'`)).rows[0].c === 4, 'realtime publication has 4 tables');

// anon
let r = await as('anon', null, () => expectErr(db.query('select * from bookings'), '42501'));
ok(r.ok, 'anon cannot read bookings: ' + r.msg);

// non-member
await as('authenticated', 'stranger@test.dev', async () => {
  ok((await db.query('select count(*)::int c from units')).rows[0].c === 0, 'non-member sees 0 units');
  ok((await db.query('select public.is_team_member() m')).rows[0].m === false, 'non-member is_team_member=false');
  const e = await expectErr(db.query(`insert into bookings (unit_id, platform, guest_name, check_in, check_out) values ('${unit}','airbnb','X','2026-12-01','2026-12-03')`), '42501');
  ok(e.ok, 'non-member insert blocked by RLS: ' + e.msg);
});

// member
await as('authenticated', 'owner@test.dev', async () => {
  ok((await db.query('select public.is_team_member() m')).rows[0].m === true, 'member is_team_member=true');
  ok((await db.query('select count(*)::int c from units')).rows[0].c === 2, 'member sees units');
  const ins = (ci, co, u = unit, name = 'Guest') => db.query(
    `insert into bookings (unit_id, platform, guest_name, guest_count, check_in, check_out, amount) values ($1,'airbnb',$2,2,$3,$4,5000) returning *`, [u, name, ci, co]);
  const a = (await ins('2026-12-01', '2026-12-05', unit, 'Ana')).rows[0];
  ok(a.nights === 4, 'nights generated = 4');
  ok(a.created_by === '11111111-1111-1111-1111-111111111111', 'created_by = auth.uid()');
  let e = await expectErr(ins('2026-12-04', '2026-12-06'), '23P01');
  ok(e.ok, 'overlap rejected: ' + e.msg);
  e = await expectErr(ins('2026-11-28', '2026-12-10'), '23P01');
  ok(e.ok, 'enclosing overlap rejected');
  ok((await ins('2026-12-05', '2026-12-08', unit, 'Ben')).rows.length === 1, 'back-to-back after checkout allowed');
  ok((await ins('2026-11-28', '2026-12-01', unit, 'Cy')).rows.length === 1, 'back-to-back before check-in allowed');
  ok((await ins('2026-12-02', '2026-12-04', unit2, 'Other unit')).rows.length === 1, 'same dates on other unit allowed');
  e = await expectErr(ins('2026-12-10', '2026-12-10'), '23514');
  ok(e.ok, 'zero-night booking rejected: ' + e.msg);

  // blocks
  await db.query(`insert into blocked_dates (unit_id, reason, start_date, end_date) values ($1,'maintenance','2026-12-10','2026-12-12')`, [unit]);
  e = await expectErr(ins('2026-12-11', '2026-12-13'), '23P01', 'overlaps_blocked');
  ok(e.ok, 'booking over block rejected: ' + e.msg);
  e = await expectErr(ins('2026-12-12', '2026-12-14'), '23P01', 'overlaps_blocked');
  ok(e.ok, 'booking starting on last blocked night rejected');
  ok((await ins('2026-12-08', '2026-12-10', unit, 'Dee')).rows.length === 1, 'booking checking out on first blocked day allowed');
  ok((await ins('2026-12-13', '2026-12-15', unit, 'Eve')).rows.length === 1, 'booking checking in day after block allowed');
  e = await expectErr(db.query(`insert into blocked_dates (unit_id, start_date, end_date) values ($1,'2026-12-14','2026-12-14')`, [unit]), '23P01', 'overlaps_booking');
  ok(e.ok, 'block over booking rejected: ' + e.msg);
  ok((await db.query(`insert into blocked_dates (unit_id, start_date, end_date) values ($1,'2026-12-15','2026-12-15') returning id`, [unit])).rows.length === 1, 'block on checkout day allowed');
  e = await expectErr(db.query(`insert into blocked_dates (unit_id, start_date, end_date) values ($1,'2026-12-11','2026-12-11')`, [unit]), '23P01');
  ok(e.ok, 'overlapping blocks rejected');

  // update into overlap
  e = await expectErr(db.query(`update bookings set check_out='2026-12-06' where id=$1`, [a.id]), '23P01');
  ok(e.ok, 'update into overlap rejected');
  await db.query(`update bookings set guest_name='Ana B', amount=6000 where id=$1`, [a.id]);
  const upd = (await db.query(`select * from bookings where id=$1`, [a.id])).rows[0];
  ok(upd.guest_name === 'Ana B' && upd.updated_at > upd.created_at, 'edit works + updated_at bumped');

  const v = (await db.query(`select * from monthly_unit_revenue where unit_id=$1 and month='2026-12-01'`, [unit])).rows[0];
  ok(Number(v.gross_amount) === 21000 && Number(v.bookings) === 4, 'reporting view: ' + v.gross_amount + ' / ' + v.bookings);

  e = await expectErr(db.query(`delete from units where id=$1`, [unit]), '42501');
  ok(e.ok, 'units cannot be deleted from app: ' + e.msg);
  e = await expectErr(db.query(`insert into team_members (email) values ('hacker@x.com')`), '42501');
  ok(e.ok, 'members cannot add team members: ' + e.msg);

  const d = await db.query(`delete from bookings where id=$1 returning id`, [a.id]);
  ok(d.rows.length === 1, 'delete booking works');
  ok((await ins('2026-12-02', '2026-12-04', unit, 'Fay')).rows.length === 1, 'freed dates bookable again');
});

// ---- activity log ----
const acts = async () => (await db.query(`select * from activity_log order by id`)).rows;
let before = await acts();
ok(before.filter(r => r.kind === 'action' && r.ref?.startsWith('setup:')).length === 2, 'setup to-dos seeded once (script ran twice)');
await as('authenticated', 'owner@test.dev', async () => {
  const b = (await db.query(`insert into bookings (unit_id, platform, guest_name, check_in, check_out, amount) values ($1,'airbnb','Logged Guest','2027-03-01','2027-03-04',9000) returning id`, [unit])).rows[0];
  await db.query(`update bookings set amount = 9500 where id = $1`, [b.id]);
  await db.query(`update bookings set amount = 9500 where id = $1`, [b.id]); // no-op
  await db.query(`delete from bookings where id = $1`, [b.id]);
  const rows = (await db.query(`select operation, actor, before->>'amount' b, after->>'amount' a from activity_log where entity_id = $1 order by id`, [b.id])).rows;
  ok(rows.map(r => r.operation).join() === 'insert,update,delete', 'insert/update/delete logged, no-op update skipped: ' + rows.map(r => r.operation).join());
  ok(rows.every(r => r.actor === 'owner@test.dev'), 'member edits credited to their email');
  ok(rows[1].b === '9000.00' && rows[1].a === '9500.00', 'update keeps before/after values');
  // app inserts
  const okIns = await db.query(`insert into activity_log (kind, title, ref) values ('email','Guest email draft created','booking:x') returning actor`);
  ok(okIns.rows[0].actor === 'owner@test.dev', 'member can log email note under own email');
  let e = await expectErr(db.query(`insert into activity_log (kind, actor, title) values ('email','AI agent','spoof')`), '42501');
  ok(e.ok, 'member cannot spoof actor: ' + e.msg);
  e = await expectErr(db.query(`insert into activity_log (kind, title) values ('edit','fake edit')`), '42501');
  ok(e.ok, 'member cannot fake an edit entry');
  // resolve a to-do
  const todo = (await db.query(`select id from activity_log where ref = 'setup:site-url'`)).rows[0];
  await db.query(`update activity_log set status='done', resolved_at=now(), resolved_by='owner@test.dev' where id=$1`, [todo.id]);
  ok((await db.query(`select status from activity_log where id=$1`, [todo.id])).rows[0].status === 'done', 'member can mark to-do done');
  e = await expectErr(db.query(`update activity_log set title='hacked' where id=$1`, [todo.id]), '42501');
  ok(e.ok, 'member cannot rewrite to-do text: ' + e.msg);
  const editRow = (await db.query(`select id from activity_log where kind='edit' limit 1`)).rows[0];
  const upd = await db.query(`update activity_log set status='done' where id=$1`, [editRow.id]);
  ok(upd.affectedRows === 0, 'history entries cannot be altered');
  e = await expectErr(db.query(`delete from activity_log where id=$1`, [editRow.id]), '42501');
  ok(e.ok, 'history cannot be deleted from the app');
});
await as('authenticated', 'stranger@test.dev', async () => {
  ok((await db.query(`select count(*)::int c from activity_log`)).rows[0].c === 0, 'non-member sees no activity');
});
// AI agent via service_role key (bypasses RLS) and a named agent
await db.exec(`reset role; select set_config('request.jwt.claims', '{"role":"service_role"}', false);`);
const ai = (await db.query(`insert into bookings (unit_id, platform, guest_name, check_in, check_out, amount) values ($1,'direct','Agent Guest','2027-04-01','2027-04-03',5000) returning id`, [unit2])).rows[0];
ok((await db.query(`select actor from activity_log where entity_id=$1`, [ai.id])).rows[0].actor === 'AI agent', 'service_role writes credited to "AI agent"');
await db.exec(`begin; set local app.actor = 'Booking bot'; update bookings set amount = 5200 where id = '${ai.id}'; commit;`);
ok((await db.query(`select actor from activity_log where entity_id=$1 and operation='update'`, [ai.id])).rows[0].actor === 'Booking bot', 'agent can name itself with app.actor');
await db.exec(`select set_config('request.jwt.claims', '', false);`);
await db.query(`update bookings set notes='from dashboard' where id=$1`, [ai.id]);
ok((await db.query(`select actor from activity_log where entity_id=$1 order by id desc limit 1`, [ai.id])).rows[0].actor === 'Supabase dashboard', 'SQL editor changes credited to "Supabase dashboard"');
ok((await db.query(`select count(*)::int c from pg_publication_tables where pubname='supabase_realtime' and tablename='activity_log'`)).rows[0].c === 1, 'activity_log in realtime');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
