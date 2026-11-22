// انتخاب تاریخ/ساعت شمسی برای پنل ادمین.
// جایگزین <input type="datetime-local"> میلادی: فیلد جلالی فقط‌خواندنی + پاپ‌آور تقویم ماهانه + ورودی ساعت.
// مقدار داخلی {jy, jm, jd, hh, mm} است؛ API بیرونی همان ISO UTC (به وقت تهران) باقی می‌ماند
// تا toLocalInput/fromLocalInput و بقیه‌ی منطق تغییر نکنند.

import {
  JALALI_MONTHS, WEEK_DAY_NAMES, faDigits, toLatinDigits,
  fromJalali, iranDayIndex, todayJalali,
} from './utils.js';

function monthLength(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const remainders = [1, 5, 9, 13, 17, 22, 26, 30];
  return remainders.includes(jy % 33) ? 30 : 29;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined) node.append(c);
  return node;
}

/**
 * یک فیلد تاریخ/ساعت جلالی می‌سازد و درون container می‌گذارد.
 * API:
 *   field.getISO()        → 'YYYY-MM-DDTHH:MM:SSZ' (به وقت تهران) یا null
 *   field.setISO(iso)     → مقدار اولیه از رشته‌ی ISO
 *   field.setDefault()    → فردا ساعت ۰۸:۰۰ (پیش‌فرض منطقی مهلت)
 */
export function createJalaliField(container) {
  const state = { jy: 0, jm: 0, jd: 0, hh: '08', mm: '00' };
  const api = { getISO, setISO, setDefault };

  const input = el('input', {
    class: 'input jdate-field__input',
    type: 'text', readonly: '', tabindex: '-1',
    'aria-label': 'تاریخ (شمسی)',
  });
  const timeInput = el('input', {
    class: 'input jdate-field__time', type: 'time', value: '08:00',
    'aria-label': 'ساعت',
  });
  const clearBtn = el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button', text: '✕',
    'aria-label': 'پاک‌کردن تاریخ', title: 'پاک‌کردن تاریخ',
    onclick: () => { setISO(null); },
  });

  // ---------- پاپ‌آور تقویم ----------
  const pop = el('div', { class: 'jdate-pop', hidden: '' });
  const nav = { jy: 0, jm: 0 };
  const title = el('strong', { class: 'jdate-pop__title', text: '' });
  const grid = el('div', { class: 'jdate-pop__grid' });

  const renderPop = () => {
    title.textContent = `${JALALI_MONTHS[nav.jm - 1]} ${faDigits(nav.jy)}`;
    grid.textContent = '';
    for (const name of WEEK_DAY_NAMES.slice(0, 7)) {
      grid.append(el('span', { class: 'jdate-pop__dow', text: name.slice(0, 3) }));
    }
    const first = fromJalali(nav.jy, nav.jm, 1);
    const firstDow = iranDayIndex(first);
    for (let i = 0; i < firstDow; i++) grid.append(el('span', { class: 'jdate-pop__pad' }));
    const len = monthLength(nav.jy, nav.jm);
    const today = todayJalali();
    for (let jd = 1; jd <= len; jd++) {
      const selected = state.jy === nav.jy && state.jm === nav.jm && state.jd === jd;
      const isToday = today.jy === nav.jy && today.jm === nav.jm && today.jd === jd;
      grid.append(el('button', {
        class: `jdate-pop__day${selected ? ' jdate-pop__day--sel' : ''}${isToday ? ' jdate-pop__day--today' : ''}`,
        type: 'button', text: faDigits(jd),
        onclick: () => {
          state.jy = nav.jy; state.jm = nav.jm; state.jd = jd;
          closePop(); sync();
        },
      }));
    }
  };

  const openPop = () => {
    if (state.jy) { nav.jy = state.jy; nav.jm = state.jm; }
    else { const t = todayJalali(); nav.jy = t.jy; nav.jm = t.jm; }
    renderPop();
    pop.hidden = false;
  };
  const closePop = () => { pop.hidden = true; };

  const calBtn = el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button', text: '📅',
    'aria-label': 'انتخاب تاریخ', title: 'انتخاب تاریخ',
    onclick: () => (pop.hidden ? openPop() : closePop()),
  });
  const prevBtn = el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button', text: '‹', 'aria-label': 'ماه قبل',
    onclick: () => { nav.jm -= 1; if (nav.jm < 1) { nav.jm = 12; nav.jy -= 1; } renderPop(); },
  });
  const nextBtn = el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button', text: '›', 'aria-label': 'ماه بعد',
    onclick: () => { nav.jm += 1; if (nav.jm > 12) { nav.jm = 1; nav.jy += 1; } renderPop(); },
  });
  const todayBtn = el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button', text: 'امروز',
    onclick: () => { const t = todayJalali(); nav.jy = t.jy; nav.jm = t.jm; renderPop(); },
  });
  pop.append(
    el('div', { class: 'jdate-pop__nav' }, prevBtn, title, nextBtn),
    grid,
    el('div', { class: 'jdate-pop__foot' }, todayBtn),
  );

  // کلیک بیرون: بستن پاپ‌آور
  document.addEventListener('mousedown', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && e.target !== calBtn && !calBtn.contains(e.target)) closePop();
  });

  // ---------- مقدار ----------
  function sync() {
    if (state.jy) {
      const date = fromJalali(state.jy, state.jm, state.jd);
      const dayIdx = iranDayIndex(date);
      input.value = `${faDigits(state.jy)}/${faDigits(String(state.jm).padStart(2, '0'))}/${faDigits(String(state.jd).padStart(2, '0'))} (${WEEK_DAY_NAMES[dayIdx]})`;
      timeInput.value = `${state.hh}:${state.mm}`;
      input.classList.remove('jdate-field__input--empty');
    } else {
      input.value = '— تاریخ انتخاب نشده —';
      input.classList.add('jdate-field__input--empty');
    }
  }

  timeInput.addEventListener('change', () => {
    const v = toLatinDigits(timeInput.value || '');
    const m = /^(\d{1,2}):(\d{2})$/.exec(v);
    if (m) {
      state.hh = String(Math.min(23, Number(m[1]))).padStart(2, '0');
      state.mm = String(Math.min(59, Number(m[2]))).padStart(2, '0');
    }
    sync();
  });
  input.addEventListener('focus', () => calBtn.focus());

  function getISO() {
    if (!state.jy) return null;
    // ساعت به وقت تهران → UTC (تهران UTC+3:30 بدون DST)
    const date = fromJalali(state.jy, state.jm, state.jd);
    const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(),
      Number(state.hh), Number(state.mm), 0);
    const utc = new Date(local.getTime() - 3.5 * 3600_000);
    return `${utc.toISOString().slice(0, 19)}Z`;
  }

  function setISO(iso) {
    if (!iso) { state.jy = state.jm = state.jd = 0; sync(); return; }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) { state.jy = state.jm = state.jd = 0; sync(); return; }
    const t = new Date(d.getTime() + 3.5 * 3600_000); // به وقت تهران
    const j = jFromGregorian(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    state.jy = j.jy; state.jm = j.jm; state.jd = j.jd;
    state.hh = String(t.getUTCHours()).padStart(2, '0');
    state.mm = String(t.getUTCMinutes()).padStart(2, '0');
    sync();
  }

  function setDefault() {
    // فردا ساعت ۰۸:۰۰ تهران — پیش‌فرض منطقی برای مهلت/تکلیف
    const now = Date.now() + 86_400_000;
    const t = new Date(now + 3.5 * 3600_000);
    const j = jFromGregorian(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    state.jy = j.jy; state.jm = j.jm; state.jd = j.jd;
    state.hh = '08'; state.mm = '00';
    sync();
  }

  // تبدیل میلادی→جلالی (بدون وابستگی به منطقه‌ی زمانی) — همان الگوریتم utils
  function jFromGregorian(gy, gm, gd) {
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = gy <= 1600 ? 0 : 979;
    const gy2 = gy <= 1600 ? gy - 621 : gy - 1600;
    let days = 365 * gy2 + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
      + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
    days += (((gy2 % 4 === 0 && gy2 % 100 !== 0) || gy2 % 400 === 0) && gm > 2) ? 1 : 0;
    let jy2 = jy + 33 * Math.floor(days / 12053);
    days %= 12053;
    jy2 += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) { jy2 += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return { jy: jy2, jm, jd };
  }

  const wrap = el('div', { class: 'jdate-field' },
    el('div', { class: 'jdate-field__row' }, input, calBtn, timeInput, clearBtn),
    pop,
  );
  container.textContent = '';
  container.append(wrap);
  sync();
  return api;
}
