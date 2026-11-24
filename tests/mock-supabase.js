/* In-browser mock of the parts of supabase-js the app uses.
   FOR LOCAL UI TESTING ONLY (tests/harness.html). Not used in production.
   Mirrors the database rules: no overlapping bookings/blocks per unit,
   back-to-back allowed, RLS-style "team member" check.
   Test login: owner@test.dev / test1234  (stranger@test.dev → not authorised) */
(function () {
  const DB_KEY = 'mock.db', SES_KEY = 'mock.session';
  const uid = () => crypto.randomUUID();
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
  const diff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const ov = (aS, aE, bS, bE) => aS < bE && bS < aE;

  function seed() {
    const u1 = uid(), u2 = uid();
    const t = new Date(); const ym = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    const nm = (() => { const d = new Date(t.getFullYear(), t.getMonth() + 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
    const bk = (unit, platform, guest, ci, co, amount, notes = null, count = 2) => ({ id: uid(), unit_id: unit, platform, guest_name: guest, guest_count: count, check_in: ci, check_out: co, amount, notes, nights: diff(ci, co), created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    return {
      units: [
        { id: u1, name: 'BGC 24J', sort_order: 1, is_active: true },
        { id: u2, name: 'BGC 8T', sort_order: 2, is_active: true },
      ],
      bookings: [
        bk(u1, 'airbnb', 'Maria Santos', `${ym}-02`, `${ym}-05`, 10500, 'Late check-in ~10pm'),
        bk(u1, 'direct', 'Jun Reyes', `${ym}-05`, `${ym}-08`, 9000),
        bk(u1, 'tiktok', 'Kim Lee', `${ym}-14`, `${ym}-17`, 11250, null, 3),
        bk(u1, 'airbnb', 'Sophie Tan', `${ym}-24`, `${nm}-02`, 28000, 'Christmas stay'),
        bk(u2, 'airbnb', 'Alex Cruz', `${ym}-01`, `${ym}-04`, 8400),
        bk(u2, 'other', 'Paolo Garcia', `${ym}-10`, `${ym}-12`, 5000),
        bk(u2, 'direct', 'Ella Mendoza', `${ym}-20`, `${ym}-23`, 9600, null, 4),
        bk(u1, 'airbnb', 'Past Guest', `${t.getFullYear()}-03-10`, `${t.getFullYear()}-03-14`, 13000),
      ],
      blocked_dates: [
        { id: uid(), unit_id: u1, reason: 'maintenance', start_date: `${ym}-10`, end_date: `${ym}-11`, note: 'Aircon cleaning' },
      ],
      activity_log: [],
      calendar_feeds: [{ id: 'feed-24j', unit_id: u1, source: 'airbnb', url: 'https://www.airbnb.com/calendar/ical/111.ics?s=test', last_synced_at: new Date(Date.now() - 20 * 60e3).toISOString(), last_status: 'ok', event_count: 2 }],
      external_reservations: (() => {
        const nmStart = `${nm}-05`, nmEnd = `${nm}-09`;
        return [
          // same stay as Sophie's Airbnb booking -> should be hidden (already entered)
          { id: uid(), feed_id: 'feed-24j', unit_id: u1, source: 'airbnb', uid: 'r1@airbnb.com', check_in: `${ym}-24`, check_out: `${nm}-02`, reservation_code: 'HMSOPHIE01', phone_last4: '1111', reservation_url: 'https://www.airbnb.com/hosting/reservations/details/HMSOPHIE01', status: 'active' },
          // a new Airbnb reservation not yet in the app
          { id: uid(), feed_id: 'feed-24j', unit_id: u1, source: 'airbnb', uid: 'r2@airbnb.com', check_in: nmStart, check_out: nmEnd, reservation_code: 'HMNEW12345', phone_last4: '4321', reservation_url: 'https://www.airbnb.com/hosting/reservations/details/HMNEW12345', status: 'active' },
        ];
      })(),
    };
  }
  // Seed history so the Activity page has something realistic to show.
  function seedActivity(d) {
    let id = 1; const now = Date.now(), H = 3600e3;
    const log = (o, agoH) => d.activity_log.unshift({ id: id++, created_at: new Date(now - agoH * H).toISOString(), status: 'open', ...o });
    d.bookings.forEach((b, i) => log({ kind: 'edit', actor: i === 2 ? 'AI agent' : 'owner@test.dev', entity: 'booking', entity_id: b.id, unit_id: b.unit_id, operation: 'insert', after: b }, 200 - i * 20));
    const s = d.bookings[3];
    log({ kind: 'edit', actor: 'owner@test.dev', entity: 'booking', entity_id: s.id, unit_id: s.unit_id, operation: 'update', before: { ...s, amount: 26000, check_out: s.check_out }, after: s }, 30);
    log({ kind: 'discrepancy', actor: 'AI agent', title: 'Payment doesn’t match the quote', message: `${s.guest_name} sent ₱25,000 but the quoted total was ₱28,000. Please confirm with the guest.`, entity: 'booking', entity_id: s.id }, 5);
    log({ kind: 'action', actor: 'Claude (AI)', title: 'Turn off public sign-ups', message: 'Supabase → Authentication → Sign In / Providers → switch off "Allow new users to sign up".', ref: 'setup:disable-signups' }, 2);
    d.activity_log.sort((a, b) => b.created_at.localeCompare(a.created_at));
    d._actId = id;
    return d;
  }
  const load = () => { try { const d = JSON.parse(localStorage.getItem(DB_KEY)); if (d && !d.calendar_feeds) { d.calendar_feeds = []; d.external_reservations = []; } if (d && !d.activity_log) seedActivity(Object.assign(d, { activity_log: [] })); return d || seedActivity(seed()); } catch { return seedActivity(seed()); } };
  const save = db => localStorage.setItem(DB_KEY, JSON.stringify(db));
  let db = load(); save(db);

  const listeners = [];
  const getSession = () => { try { return JSON.parse(sessionStorage.getItem(SES_KEY)); } catch { return null; } };
  const emit = (ev, s) => listeners.forEach(cb => cb(ev, s));
  const wait = (v, ms = 120) => new Promise(r => setTimeout(() => r(v), ms));

  function checkRow(table, row, id) {
    if (table === 'bookings') {
      if (row.check_out <= row.check_in) return { code: '23514', message: 'check constraint' };
      if (db.bookings.some(b => b.id !== id && b.unit_id === row.unit_id && ov(row.check_in, row.check_out, b.check_in, b.check_out)))
        return { code: '23P01', message: 'conflicting key value violates exclusion constraint "bookings_no_overlap"' };
      if (db.blocked_dates.some(k => k.unit_id === row.unit_id && ov(row.check_in, row.check_out, k.start_date, addDays(k.end_date, 1))))
        return { code: '23P01', hint: 'overlaps_blocked', message: 'These dates overlap blocked dates for this unit.' };
    }
    if (table === 'blocked_dates') {
      const e = addDays(row.end_date, 1);
      if (db.blocked_dates.some(k => k.id !== id && k.unit_id === row.unit_id && ov(row.start_date, e, k.start_date, addDays(k.end_date, 1))))
        return { code: '23P01', message: 'conflicting key value violates exclusion constraint "blocked_no_overlap"' };
      if (db.bookings.some(b => b.unit_id === row.unit_id && ov(row.start_date, e, b.check_in, b.check_out)))
        return { code: '23P01', hint: 'overlaps_booking', message: 'These dates overlap an existing booking for this unit.' };
    }
    if (table === 'units' && db.units.some(u => u.id !== id && u.name === row.name)) return { code: '23505', message: 'duplicate key' };
    return null;
  }

  function logEdit(table, op, before, after) {
    if (!['bookings', 'blocked_dates', 'units'].includes(table)) return;
    const row = after || before;
    db.activity_log.unshift({ id: db._actId = (db._actId || 1000) + 1, created_at: new Date().toISOString(), kind: 'edit', status: 'open',
      actor: getSession()?.user?.email || 'system', entity: table === 'bookings' ? 'booking' : table === 'units' ? 'unit' : 'blocked_dates',
      entity_id: row.id, unit_id: table === 'units' ? row.id : row.unit_id, operation: op, before: before || null, after: after || null });
  }
  class Query {
    constructor(table) { this.table = table; this.op = 'select'; this.filters = []; this.payload = null; this.isSingle = false; this.rng = null; this.orders = []; }
    select() { if (this.op === 'select') this.op = 'select'; this.returning = true; return this; }
    order(col, o = {}) { this.orders.push([col, o.ascending !== false]); return this; }
    range(a, b) { this.rng = [a, b]; return this; }
    limit(n) { this.lim = n; return this; }
    gte(col, v) { this.filters.push([col, v, 'gte']); return this; }
    insert(p) { this.op = 'insert'; this.payload = p; return this; }
    update(p) { this.op = 'update'; this.payload = p; return this; }
    delete() { this.op = 'delete'; return this; }
    eq(col, v) { this.filters.push([col, v]); return this; }
    single() { this.isSingle = true; return this; }
    then(res, rej) { return this.run().then(res, rej); }
    async run() {
      await wait(null);
      if (window.__mockOffline) return { data: null, error: { message: 'Failed to fetch' } };
      const s = getSession();
      if (!s) return { data: null, error: { code: '42501', message: 'permission denied' } };
      db = load();
      const rows = db[this.table];
      const match = r => this.filters.every(([c, v, op]) => (op === 'gte' ? String(r[c]) >= String(v) : r[c] === v));
      if (this.op === 'select') {
        let out = rows.filter(match);
        for (const [c, asc] of [...this.orders].reverse()) out.sort((a, b) => String(a[c]).localeCompare(String(b[c])) * (asc ? 1 : -1));
        if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
        if (this.lim) out = out.slice(0, this.lim);
        return { data: JSON.parse(JSON.stringify(out)), error: null };
      }
      if (this.op === 'insert') {
        const row = { id: uid(), ...this.payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        if (this.table === 'units') row.is_active = true;
        const err = checkRow(this.table, row, null); if (err) return { data: null, error: err };
        if (this.table === 'bookings') row.nights = diff(row.check_in, row.check_out);
        if (this.table === 'activity_log') {
          if (!['email', 'dismiss', 'action'].includes(row.kind)) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
          Object.assign(row, { id: db._actId = (db._actId || 1000) + 1, actor: getSession()?.user?.email, status: 'open' });
          rows.unshift(row); save(db); return { data: row, error: null };
        }
        rows.push(row); logEdit(this.table, 'insert', null, row); save(db); return { data: row, error: null };
      }
      if (this.op === 'update') {
        const r = rows.find(match); if (!r) return { data: null, error: { code: 'PGRST116', message: 'not found' } };
        const next = { ...r, ...this.payload, updated_at: new Date().toISOString() };
        const err = checkRow(this.table, next, r.id); if (err) return { data: null, error: err };
        if (this.table === 'bookings') next.nights = diff(next.check_in, next.check_out);
        const before = { ...r };
        Object.assign(r, next); logEdit(this.table, 'update', before, r); save(db); return { data: r, error: null };
      }
      if (this.op === 'delete') { rows.filter(match).forEach(r => logEdit(this.table, 'delete', r, null)); db[this.table] = rows.filter(r => !match(r)); save(db); return { data: null, error: null }; }
    }
  }

  window.supabase = {
    createClient() {
      return {
        auth: {
          async getSession() { await wait(null, 50); return { data: { session: getSession() }, error: null }; },
          onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
          async signInWithPassword({ email, password }) {
            await wait(null, 300);
            if (password !== 'test1234') return { data: {}, error: { message: 'Invalid login credentials' } };
            const s = { access_token: 'mock-' + uid(), user: { id: uid(), email } };
            sessionStorage.setItem(SES_KEY, JSON.stringify(s)); emit('SIGNED_IN', s);
            return { data: { session: s, user: s.user }, error: null };
          },
          async signOut() { sessionStorage.removeItem(SES_KEY); emit('SIGNED_OUT', null); return { error: null }; },
          async resetPasswordForEmail() { await wait(null); return { data: {}, error: null }; },
          async updateUser() { await wait(null); return { data: {}, error: null }; },
        },
        async rpc(fn, args = {}) {
          await wait(null, fn === 'sync_calendar_feeds' ? 600 : 120); const s = getSession();
          if (fn === 'sync_calendar_feeds') {
            db = load();
            const out = db.calendar_feeds.filter(f => !args.p_feed || f.id === args.p_feed).map(f => {
              const unit = db.units.find(u => u.id === f.unit_id)?.name;
              if (/bad/.test(f.url)) { Object.assign(f, { last_synced_at: new Date().toISOString(), last_status: 'error', last_error: 'Airbnb returned HTTP 404 – check the link is the "Export calendar" link' }); return { unit, ok: false, error: f.last_error }; }
              const n = db.external_reservations.filter(x => x.feed_id === f.id && x.status === 'active').length;
              Object.assign(f, { last_synced_at: new Date().toISOString(), last_status: 'ok', last_error: null, event_count: n });
              return { unit, ok: true, reservations: n };
            });
            save(db); return { data: out, error: null };
          }
          return { data: fn === 'is_team_member' && s?.user?.email === 'owner@test.dev', error: null };
        },
        from(t) { return new Query(t); },
        channel() { return { on() { return this; }, subscribe() { return this; } }; },
        removeChannel() {},
      };
    },
  };
  window.__mockReset = () => { localStorage.removeItem(DB_KEY); sessionStorage.removeItem(SES_KEY); };
})();
