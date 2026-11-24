/* Logic tests for Chico Stays.
   Extracts the pure-logic block from index.html and tests it in Node.
   Run:  node tests/logic.test.js                                       */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = html.split('// ==LOGIC-START==')[1].split('// ==LOGIC-END==')[0];
const ctx = { TextEncoder, btoa, atob };
vm.createContext(ctx);
vm.runInContext(code + `;Object.assign(globalThis, { toISO, parseISO, isValidISO, addDays, diffDays, daysInMonth, weekday, todayISO,
  shiftMonth, nightsBetween, rangesOverlap, overlapNights, blockRange, findConflict, buildDayMap, periodStats, yearStats,
  monthStats, ytdGross, validateBooking, validateBlock, parseAmount, formatPHP, formatPct, formatRange,
  formatLongDate, fillTemplate, emailVars, buildMime, base64UrlAscii, safeFilename,
  parseCSV, parseMoney, parseAnyDate, parseAirbnbCsv, parseAirbnbEmail, planAirbnbImport });`, ctx);
const L = ctx;

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  if (!ok) console.log(`FAIL ${msg}\n   expected ${JSON.stringify(expected)}\n   actual   ${JSON.stringify(actual)}`);
}

// ---- date arithmetic ----
eq(L.addDays('2026-12-31', 1), '2027-01-01', 'addDays across year');
eq(L.addDays('2028-02-28', 1), '2028-02-29', 'leap day');
eq(L.addDays('2026-03-01', -1), '2026-02-28', 'addDays backwards non-leap');
eq(L.diffDays('2026-03-07', '2026-03-09'), 2, 'diffDays over US DST change');
eq(L.diffDays('2026-12-30', '2027-01-02'), 3, 'diffDays across year');
eq(L.daysInMonth(2028, 2), 29, 'Feb leap');
eq(L.daysInMonth(2026, 2), 28, 'Feb normal');
eq(L.weekday('2026-11-18'), 3, 'Nov 18 2026 is a Wednesday');
eq(L.shiftMonth(2026, 12, 1), { y: 2027, m: 1 }, 'next month from Dec');
eq(L.shiftMonth(2026, 1, -1), { y: 2025, m: 12 }, 'prev month from Jan');
eq(L.shiftMonth(2026, 5, -12), { y: 2025, m: 5 }, 'prev year');
eq(L.isValidISO('2026-02-30'), false, 'invalid date rejected');
eq(L.isValidISO('2026-02-28'), true, 'valid date accepted');
eq(L.todayISO(new Date(2026, 10, 18, 23, 59)), '2026-11-18', 'todayISO uses local date');

// ---- nights & overlap (check-in included, check-out excluded) ----
eq(L.nightsBetween('2026-12-01', '2026-12-05'), 4, '4 nights');
eq(L.rangesOverlap('2026-12-01', '2026-12-05', '2026-12-05', '2026-12-08'), false, 'back-to-back does not overlap');
eq(L.rangesOverlap('2026-12-01', '2026-12-05', '2026-12-04', '2026-12-08'), true, 'one-night overlap');
eq(L.rangesOverlap('2026-12-02', '2026-12-03', '2026-12-01', '2026-12-08'), true, 'contained overlap');
eq(L.overlapNights('2026-11-28', '2026-12-03', '2026-12-01', '2027-01-01'), 2, 'nights clipped to December');
eq(L.blockRange({ start_date: '2026-12-10', end_date: '2026-12-12' }), ['2026-12-10', '2026-12-13'], 'block range inclusive→half-open');

const U1 = 'u1', U2 = 'u2';
const bookings = [
  { id: 'a', unit_id: U1, platform: 'airbnb', guest_name: 'Ana', check_in: '2026-12-01', check_out: '2026-12-05', amount: 10000 },
  { id: 'b', unit_id: U1, platform: 'direct', guest_name: 'Ben', check_in: '2026-12-05', check_out: '2026-12-08', amount: 7500.5 },
  { id: 'c', unit_id: U1, platform: 'tiktok', guest_name: 'Cy', check_in: '2026-12-30', check_out: '2027-01-03', amount: 12000 },
  { id: 'd', unit_id: U2, platform: 'other', guest_name: 'Dee', check_in: '2026-12-02', check_out: '2026-12-04', amount: '4000.00' },
];
const blocks = [{ id: 'k', unit_id: U1, reason: 'maintenance', start_date: '2026-12-10', end_date: '2026-12-12' }];

// ---- conflict detection ----
const fc = (start, end, excludeId, unitId = U1) => {
  const r = L.findConflict({ unitId, start, end, excludeId }, bookings, blocks);
  return r ? `${r.type}:${r.item.id}` : null;
};
eq(fc('2026-12-08', '2026-12-10'), null, 'fits between Ben and block');
eq(fc('2026-12-07', '2026-12-09'), 'booking:b', 'overlaps Ben');
eq(fc('2026-11-28', '2026-12-01'), null, 'checks out on Ana check-in day');
eq(fc('2026-12-09', '2026-12-11'), 'block:k', 'overlaps block');
eq(fc('2026-12-12', '2026-12-13'), 'block:k', 'starts on last blocked night');
eq(fc('2026-12-13', '2026-12-14'), null, 'day after block');
eq(fc('2026-12-02', '2026-12-04', 'a'), null, 'editing Ana inside own dates');
eq(fc('2026-12-02', '2026-12-06', 'a'), 'booking:b', 'editing Ana into Ben');
eq(fc('2026-12-02', '2026-12-04', null, U2), 'booking:d', 'other unit independent (own conflict)');
eq(fc('2026-12-05', '2026-12-08', null, U2), null, 'other unit free while U1 booked');
// block form uses half-open end = last night + 1
eq(L.findConflict({ unitId: U1, start: '2026-12-08', end: L.addDays('2026-12-09', 1) }, bookings, blocks), null, 'block on Ben checkout day ok');

// ---- day map ----
const map = L.buildDayMap(U1, '2026-12-01', '2027-01-01', bookings, blocks);
eq([map['2026-12-01'].kind, map['2026-12-01'].first, map['2026-12-01'].last], ['booking', true, false], 'Dec 1 Ana first night');
eq([map['2026-12-04'].item.id, map['2026-12-04'].last], ['a', true], 'Dec 4 Ana last night');
eq([map['2026-12-05'].item.id, map['2026-12-05'].first, map['2026-12-05'].checkout.id], ['b', true, 'a'], 'Dec 5: Ben in, Ana out');
eq([map['2026-12-08'].kind, map['2026-12-08'].checkout.id], [null, 'b'], 'Dec 8 free, Ben checkout marker');
eq([map['2026-12-12'].kind, map['2026-12-12'].last], ['blocked', true], 'Dec 12 last blocked');
eq(map['2026-12-13'].kind, null, 'Dec 13 free');
eq([map['2026-12-31'].item.id, map['2026-12-31'].last], ['c', false], 'Dec 31 Cy continues into Jan');
const jan = L.buildDayMap(U1, '2027-01-01', '2027-02-01', bookings, blocks);
eq([jan['2027-01-01'].first, jan['2027-01-02'].last, jan['2027-01-03'].kind, jan['2027-01-03'].checkout.id], [false, true, null, 'c'], 'Jan view of Cy stay');
const nov = L.buildDayMap(U1, '2026-11-01', '2026-12-01', bookings, blocks);
eq(Object.values(nov).filter(x => x.kind).length, 0, 'November empty');

// ---- statistics ----
const dec = L.monthStats([U1], 2026, 12, bookings, blocks);
eq(dec.count, 3, 'Dec check-ins (Ana, Ben, Cy)');
eq(dec.gross, 29500.5, 'Dec gross by check-in');
eq(dec.bookedNights, 4 + 3 + 2, 'Dec booked nights (Cy only 2 in Dec)');
eq(dec.blockedNights, 3, 'Dec blocked nights');
eq(dec.openNights, 31 - 3, 'Dec open nights');
eq(dec.availableNights, 31 - 3 - 9, 'Dec available nights');
eq(Math.round(dec.occupancy * 1000) / 1000, Math.round(9 / 28 * 1000) / 1000, 'Dec occupancy = booked/open');
const jan27 = L.monthStats([U1], 2027, 1, bookings, blocks);
eq([jan27.count, jan27.gross, jan27.bookedNights], [0, 0, 2], 'Jan 2027: no revenue (check-in Dec) but 2 nights');
const y26 = L.yearStats([U1, U2], 2026, bookings, blocks);
eq([y26.count, y26.gross, y26.bookedNights, y26.totalNights], [4, 33500.5, 11, 730], 'year stats both units');
eq(L.ytdGross([U1], 2026, '2026-12-04', bookings), 10000, 'YTD up to Dec 4 includes only Ana');
eq(L.ytdGross([U1], 2026, '2026-12-05', bookings), 17500.5, 'YTD includes today check-in');
eq(L.ytdGross([U1], 2025, '2026-12-05', bookings), 0, 'past year YTD = full year (none)');
eq(L.ytdGross([U1], 2027, '2026-12-05', bookings), 0, 'future year YTD = 0');
eq(L.monthStats([], 2026, 12, bookings, blocks).occupancy, 0, 'no units → 0 occupancy, no NaN');

// ---- validation & formatting ----
const good = { unit_id: U1, platform: 'airbnb', guest_name: 'Maria', guest_count: 2, check_in: '2026-12-01', check_out: '2026-12-03', amount: 5000, notes: null };
eq(L.validateBooking(good), null, 'valid booking');
eq(L.validateBooking({ ...good, check_out: '2026-12-01' }), 'Check-out must be after check-in.', 'same-day checkout rejected');
eq(L.validateBooking({ ...good, guest_name: '  ' }), 'Enter the guest name.', 'blank guest');
eq(L.validateBooking({ ...good, guest_count: 0 }), 'Number of guests must be between 1 and 50.', 'zero guests');
eq(L.validateBooking({ ...good, amount: NaN }), 'Enter a valid booking amount (0 or more).', 'bad amount');
eq(L.validateBooking({ ...good, platform: 'booking' }), 'Choose a booking platform.', 'unknown platform');
eq(L.validateBlock({ unit_id: U1, reason: 'personal', start_date: '2026-12-10', end_date: '2026-12-10' }), null, 'single-night block ok');
eq(L.validateBlock({ unit_id: U1, reason: 'personal', start_date: '2026-12-10', end_date: '2026-12-09' }), 'The last blocked date cannot be before the first.', 'reversed block');
eq(L.parseAmount('12,500.50'), 12500.5, 'parse amount with comma');
eq(L.parseAmount('₱ 3,000'), 3000, 'parse with peso sign');
eq(L.parseAmount(''), 0, 'empty amount = 0');
eq(Number.isNaN(L.parseAmount('12.345')), true, '3 decimals rejected');
eq(Number.isNaN(L.parseAmount('-5')), true, 'negative rejected');
eq(L.formatPHP(12500), '₱12,500', 'format whole');
eq(L.formatPHP(7500.5), '₱7,500.50', 'format decimals');
eq(L.formatPHP('4000.00'), '₱4,000', 'format numeric string');
eq(L.formatPct(9 / 28), '32%', 'percent');
eq(L.formatRange('2026-12-30', '2027-01-03'), 'Dec 30, 2026 – Jan 3, 2027', 'range across years');

// ---- guest email ----
eq(L.formatLongDate('2026-11-20'), 'Nov 20, 2026', 'long date');
const ev = L.emailVars({ unit: '24J', checkIn: '2026-11-24', checkOut: '2026-12-02', guests: ['Sophie Tan', ' Ben Tan ', ''], ownerName: 'Joshua Natividad', ownerMobile: '09662775947' });
eq(L.fillTemplate('UPS T2; room {unit}; {checkin} - {checkout}', ev), 'UPS T2; room 24J; Nov 24, 2026 - Dec 2, 2026', 'subject template');
eq(ev.guest_list, '1. Sophie Tan\n2. Ben Tan', 'numbered guest list skips blanks');
eq(L.fillTemplate('{guest} x{guests} {typo}', ev), 'Sophie Tan x2 {typo}', 'unknown placeholders left visible');
eq(L.safeFilename('Guest ID 1 - María "x".jpg'), 'Guest ID 1 - Maria x.jpg', 'safe filename keeps letters');
const mime = L.buildMime({ to: ['a@x.com', 'b@y.com'], subject: 'Hi ñ', body: 'Line 1\nLíne 2', attachments: [{ filename: 'f.pdf', mime: 'application/pdf', base64: 'JVBERi0x' }], boundary: 'B' });
eq(/^[\x00-\x7f]*$/.test(mime), true, 'MIME is pure ASCII');
eq(mime.split('\r\n')[0], 'To: a@x.com, b@y.com', 'MIME To header');
eq(mime.includes('Subject: =?UTF-8?B?'), true, 'non-ASCII subject encoded');
const bodyB64 = mime.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--B')[0].replace(/\r\n/g, '');
eq(Buffer.from(bodyB64, 'base64').toString('utf8'), 'Line 1\r\nLíne 2', 'UTF-8 body round-trips with CRLF');
eq(mime.trim().endsWith('--B--'), true, 'MIME closing boundary');
eq(/[+/=]/.test(L.base64UrlAscii(mime)), false, 'base64url has no + / =');

// ---- Airbnb earnings import ----
eq(L.parseCSV('a,"b, c",d\r\n1,"say ""hi""",3\n'), [['a', 'b, c', 'd'], ['1', 'say "hi"', '3']], 'CSV quotes, commas, CRLF');
eq([L.parseMoney('₱12,125.00'), L.parseMoney('(500.00)'), L.parseMoney('PHP 1,234'), Number.isNaN(L.parseMoney(''))], [12125, -500, 1234, true], 'money parsing');
eq([L.parseAnyDate('12/05/2026'), L.parseAnyDate('2026-12-05'), L.parseAnyDate('Dec 5, 2026'), L.parseAnyDate('13/45/2026')], ['2026-12-05', '2026-12-05', '2026-12-05', null], 'date parsing');
const CSV = [
  'Date,Arriving by date,Type,Confirmation code,Booking date,Start date,End date,Nights,Guest,Listing,Details,Reference code,Currency,Amount,Paid out,Service fee,Fast pay fee,Cleaning fee,Gross earnings,Occupancy taxes,Earnings year',
  '11/20/2026,11/21/2026,Payout,,,,,,,,"Transfer to Account ****1234",,PHP,,"20,000.00",,,,,,2026',
  '11/20/2026,,Reservation,HMABCD1234,11/01/2026,12/05/2026,12/09/2026,4,"Liza Ramos","Cozy 1BR, BGC 24J",,,PHP,"12,125.00",,375.00,,500.00,"12,500.00",,2026',
  '11/22/2026,,Resolution Adjustment,HMABCD1234,,,,,"Liza Ramos","Cozy 1BR, BGC 24J",,,PHP,-125.00,,,,,,,2026',
  '11/20/2026,,Reservation,HMOLD00001,10/01/2026,10/10/2026,10/12/2026,2,"Old Guest","Studio BGC 8T",,,PHP,"6,000.00",,,,,,,2026',
].join('\r\n');
const pc = L.parseAirbnbCsv(CSV);
eq(pc.error, null, 'CSV parsed without error');
const liza = pc.items.find(i => i.code === 'HMABCD1234');
eq([pc.items.length, liza.payout, liza.guest, liza.checkIn, liza.checkOut, liza.listing], [2, 12000, 'Liza Ramos', '2026-12-05', '2026-12-09', 'Cozy 1BR, BGC 24J'], 'payout rows skipped, adjustments summed by code');
eq(L.parseAirbnbCsv('Name,Value\nx,1').error.includes('Confirmation code'), true, 'wrong file explained');
const mail = L.parseAirbnbEmail({ subject: 'Reservation confirmed - Liza Ramos arrives Dec 5',
  text: 'New booking confirmed! Liza arrives Dec 5.\nCheck-in Sat, Dec 5 2:00 PM Checkout Wed, Dec 9\nConfirmation code\nHMABCD1234\nGuest paid\n₱3,000.00 x 4 nights ₱12,000.00\nCleaning fee ₱500.00\nTotal (PHP) ₱13,250.00\nHost payout\n4 nights room fee ₱12,000.00\nCleaning fee ₱500.00\nHost service fee (3.0%) -₱375.00\nYou earn ₱12,125.00' });
eq([mail.code, mail.guest, mail.payout, mail.guestPaid], ['HMABCD1234', 'Liza Ramos', 12125, 13250], 'email: code, guest name, payout, guest paid');
eq(L.parseAirbnbEmail({ subject: 'Hello', text: 'no code here' }), null, 'non-reservation email ignored');
const ext = [{ reservation_code: 'HMABCD1234', unit_id: 'u24', check_in: '2026-12-05', check_out: '2026-12-09' }, { reservation_code: 'HMNEW00002', unit_id: 'u8', check_in: '2027-01-02', check_out: '2027-01-05' }];
const bks = [
  { id: 'b1', unit_id: 'u24', platform: 'airbnb', guest_name: 'Liza Ramos', check_in: '2026-12-05', check_out: '2026-12-09', amount: 0, notes: 'Airbnb HMABCD1234 · phone ends 4321' },
  { id: 'b2', unit_id: 'u8', platform: 'airbnb', guest_name: 'Same Guest', check_in: '2026-10-10', check_out: '2026-10-12', amount: 6000, notes: null },
];
const plan = L.planAirbnbImport([
  { code: 'HMABCD1234', guest: 'Liza Ramos', payout: 12000 },
  { code: 'HMOLD00001', guest: 'Old Guest', payout: 6000, checkIn: '2026-10-10', checkOut: '2026-10-12', listing: 'Studio BGC 8T' },
  { code: 'HMNEW00002', guest: 'New Person', payout: 9000 },
  { code: 'HMNOPE0003', guest: 'Ghost', payout: 5000, listing: 'Mystery listing' },
  { code: 'HMZERO0004', guest: 'Zero', payout: NaN },
], { bookings: bks, external: ext, listingUnit: { 'Studio BGC 8T': 'u8' } });
eq(plan.map(p => p.action), ['update', 'update', 'create', 'unmatched', 'skip'], 'import plan actions');
eq(plan[0].patch, { amount: 12000 }, 'fills ₱0 amount from payout');
eq([plan[1].patch.amount, plan[1].patch.notes], [undefined, 'Airbnb HMOLD00001'], 'same amount: only links the code');
eq([plan[2].create.unit_id, plan[2].create.check_in, plan[2].create.guest_name, plan[2].create.amount], ['u8', '2027-01-02', 'New Person', 9000], 'creates booking from calendar reservation + payout');
eq(plan[3].reason.includes('Mystery listing'), true, 'unknown listing asks for a unit');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
