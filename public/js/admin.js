// کلاس‌هاب — admin panel logic
import { faDigits, formatJalali, formatJalaliDateTime, countdown, WEEK_DAY_NAMES, KIND_LABELS, KIND_ICONS } from './utils.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  subjects: [],
  scheduleDays: [],
  tasks: { active: [], expired: [] },
  announcements: [],
  settings: {},
  me: null,
  hwLessonId: null,   // lesson whose homework is being edited
  pendingUploads: [], // newly picked File objects for homework
};

// ---------- api ----------
async function api(path, options = {}) {
  const opts = { headers: {}, ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.error || `خطای ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- dom helpers ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child);
  }
  return node;
}

function toast(msg, type = 'info') {
  const t = el('div', { class: `toast toast--${type}`, text: msg });
  $('#toastRegion').append(t);
  setTimeout(() => {
    t.style.transition = 'opacity .4s, transform .4s';
    t.style.opacity = '0';
    t.style.transform = 'translateY(10px)';
    setTimeout(() => t.remove(), 400);
  }, 3400);
}

function confirmDialog(text) {
  return new Promise((resolve) => {
    $('#confirmText').textContent = text;
    const overlay = $('#confirmOverlay');
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('overlay--open'));
    const done = (val) => {
      overlay.classList.remove('overlay--open');
      setTimeout(() => { overlay.hidden = true; }, 250);
      $('#confirmYes').onclick = null;
      $('#confirmNo').onclick = null;
      resolve(val);
    };
    $('#confirmYes').onclick = () => done(true);
    $('#confirmNo').onclick = () => done(false);
  });
}

// ---------- overlays ----------
function openOverlay(overlay) {
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add('overlay--open'));
  document.body.style.overflow = 'hidden';
}
function closeOverlay(overlay) {
  overlay.classList.remove('overlay--open');
  document.body.style.overflow = '';
  setTimeout(() => { overlay.hidden = true; }, 340);
}

// ---------- login ----------
async function checkAuth() {
  try {
    const data = await api('/api/admin/auth/me');
    state.me = data.admin;
    return true;
  } catch {
    return false;
  }
}

async function handleLoginInner() {
  const data = await api('/api/admin/auth/login', {
    method: 'POST',
    body: { username: $('#loginUser').value.trim(), password: $('#loginPass').value },
  });
  state.me = data.admin;
  toast('خوش آمدید! 🌸', 'success');
  showAdmin();
}

async function handleLogout() {
  try { await api('/api/admin/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  state.me = null;
  location.reload();
}

function showAdmin() {
  $('#loginView').classList.add('hidden');
  $('#adminView').classList.remove('hidden');
  $('#adminName').textContent = state.me?.username || 'مدیر';
  refreshAll();
}

// ---------- data refresh ----------
async function refreshAll() {
  const [sched, tasks, anns, subjects, settings] = await Promise.allSettled([
    api('/api/schedule'), api('/api/tasks'), api('/api/announcements'), api('/api/subjects'), api('/api/settings'),
  ]);
  if (sched.status === 'fulfilled') state.scheduleDays = sched.value.days;
  if (tasks.status === 'fulfilled') state.tasks = { active: tasks.value.active, expired: tasks.value.expired };
  if (anns.status === 'fulfilled') state.announcements = anns.value.announcements;
  if (subjects.status === 'fulfilled') state.subjects = subjects.value.subjects;
  if (settings.status === 'fulfilled') state.settings = settings.value.settings;
  renderLessonsTab();
  renderTasksTab();
  renderAnnsTab();
  renderSubjectsTab();
  fillSettingsForm();
}

// ---------- lessons tab ----------
function fillSelects() {
  const daySel = $('#lessonDay');
  if (!daySel.options.length) {
    for (let d = 0; d < 7; d++) {
      daySel.append(el('option', { value: d, text: WEEK_DAY_NAMES[d] }));
    }
  }
  const perSel = $('#lessonPeriod');
  if (!perSel.options.length) {
    for (let p = 1; p <= 12; p++) {
      perSel.append(el('option', { value: p, text: `زنگ ${faDigits(p)}` }));
    }
  }
  const subjSel = $('#lessonSubject');
  subjSel.textContent = '';
  for (const s of state.subjects) {
    subjSel.append(el('option', { value: s.id, text: s.name }));
  }
  const taskSubjSel = $('#taskSubject');
  taskSubjSel.textContent = '';
  taskSubjSel.append(el('option', { value: '', text: '— بدون درس —' }));
  for (const s of state.subjects) {
    taskSubjSel.append(el('option', { value: s.id, text: s.name }));
  }
}

async function submitLesson(e) {
  e.preventDefault();
  const id = $('#lessonId').value;
  const payload = {
    day: Number($('#lessonDay').value),
    period: Number($('#lessonPeriod').value),
    subjectId: Number($('#lessonSubject').value),
    startTime: $('#lessonStart').value.trim(),
    endTime: $('#lessonEnd').value.trim(),
  };
  try {
    if (id) {
      await api(`/api/admin/lessons/${id}`, { method: 'PUT', body: payload });
      toast('درس به‌روزرسانی شد ✅', 'success');
    } else {
      await api('/api/admin/lessons', { method: 'POST', body: payload });
      toast('درس جدید اضافه شد ✅', 'success');
    }
    resetLessonForm();
    refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function resetLessonForm() {
  $('#lessonId').value = '';
  $('#lessonSubmit').textContent = 'ذخیره درس';
  $('#lessonStart').value = '';
  $('#lessonEnd').value = '';
}

function editLesson(lesson) {
  $('#lessonId').value = lesson.id;
  $('#lessonDay').value = lesson.day;
  $('#lessonPeriod').value = lesson.period;
  $('#lessonSubject').value = lesson.subject_id;
  $('#lessonStart').value = lesson.start_time;
  $('#lessonEnd').value = lesson.end_time;
  $('#lessonSubmit').textContent = 'به‌روزرسانی درس';
  $('#lessonForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteLesson(lesson) {
  const ok = await confirmDialog(`حذف «${lesson.subject_name} — ${WEEK_DAY_NAMES[lesson.day]} زنگ ${faDigits(lesson.period)}»؟ تکالیف آن هم حذف می‌شود.`);
  if (!ok) return;
  try {
    await api(`/api/admin/lessons/${lesson.id}`, { method: 'DELETE' });
    toast('درس حذف شد.', 'success');
    refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderLessonsTab() {
  fillSelects();
  const list = $('#lessonsList');
  list.textContent = '';
  let count = 0;
  for (let d = 0; d < 7; d++) {
    const lessons = state.scheduleDays[d] || [];
    for (const lesson of lessons) {
      count += 1;
      const row = el('div', { class: 'admin-row' },
        el('div', { class: 'admin-row__main' },
          el('div', { class: 'admin-row__title', text: `${lesson.subject_name} — ${WEEK_DAY_NAMES[lesson.day]}، زنگ ${faDigits(lesson.period)}` }),
          el('div', { class: 'admin-row__sub', text: `${faDigits(lesson.start_time)}–${faDigits(lesson.end_time)} · ${lesson.homework ? `تکلیف: ${lesson.homework.title}` : 'بدون تکلیف'}` })),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => editLesson(lesson), text: '✏️ ویرایش' }),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => openHwEditor(lesson), text: '📝 تکلیف' }),
        el('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: () => deleteLesson(lesson), text: '🗑️' }),
      );
      list.append(row);
    }
  }
  if (!count) {
    list.append(el('div', { class: 'empty-state', text: 'هنوز درسی ثبت نشده است. از فرم بالا شروع کنید!' }));
  }
}

// ---------- homework editor ----------
async function openHwEditor(lesson) {
  state.hwLessonId = lesson.id;
  state.pendingUploads = [];
  $('#hwTitle').textContent = `تکلیف: ${lesson.subject_name} (${WEEK_DAY_NAMES[lesson.day]}، زنگ ${faDigits(lesson.period)})`;
  $('#hwTitleInput').value = lesson.homework?.title || '';
  $('#hwDesc').value = '';
  $('#hwPages').value = '';
  $('#hwInstructions').value = '';
  $('#hwNotes').value = '';
  $('#hwDue').value = '';
  renderPendingUploads();
  $('#hwExistingFiles').textContent = '';
  $('#hwDelete').classList.toggle('hidden', !lesson.homework);

  if (lesson.homework) {
    // fetch full homework
    try {
      const data = await api(`/api/lessons/${lesson.id}`);
      const hw = data.lesson.homework;
      if (hw) {
        $('#hwTitleInput').value = hw.title || '';
        $('#hwDesc').value = hw.description || '';
        $('#hwPages').value = hw.textbook_pages || '';
        $('#hwInstructions').value = hw.instructions || '';
        $('#hwNotes').value = hw.notes || '';
        $('#hwDue').value = hw.due_at ? toLocalInput(hw.due_at) : '';
      }
      const files = data.lesson.attachments || [];
      renderExistingFiles(files);
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  openOverlay($('#hwOverlay'));
}

function toLocalInput(iso) {
  // convert ISO (UTC) to Tehran local datetime-local value
  const d = new Date(iso);
  const t = new Date(d.getTime() + 3.5 * 3600_000);
  return `${t.toISOString().slice(0, 10)}T${t.toISOString().slice(11, 16)}`;
}

function fromLocalInput(value) {
  // datetime-local interpreted as Tehran time -> ISO UTC
  if (!value) return null;
  const d = new Date(value + ':00Z'); // treat as UTC first
  const utc = new Date(d.getTime() - 3.5 * 3600_000);
  return utc.toISOString().slice(0, 19) + 'Z';
}

function renderExistingFiles(files) {
  const list = $('#hwExistingFiles');
  list.textContent = '';
  for (const f of files) {
    list.append(el('div', { class: 'admin-row' },
      el('span', { text: '📎' }),
      el('div', { class: 'admin-row__main' },
        el('div', { class: 'admin-row__title', text: f.filename }),
        el('div', { class: 'admin-row__sub', text: `${faDigits(f.size)} بایت` })),
      el('button', {
        class: 'btn btn--danger btn--sm', type: 'button', text: '🗑️',
        onclick: async () => {
          const ok = await confirmDialog(`حذف پیوست «${f.filename}»؟`);
          if (!ok) return;
          try {
            await api(`/api/admin/attachments/${f.id}`, { method: 'DELETE' });
            toast('پیوست حذف شد.', 'success');
            f.deleted = true;
            f.el?.remove();
            renderExistingFiles(files.filter((x) => !x.deleted));
          } catch (err) { toast(err.message, 'error'); }
        },
      })));
  }
}

function renderPendingUploads() {
  const row = $('#hwUploadRow');
  row.textContent = '';
  for (const [i, file] of state.pendingUploads.entries()) {
    row.append(el('span', { class: 'file-chip' },
      el('span', { text: file.name }),
      el('button', {
        class: 'file-chip__x', type: 'button', text: '×', 'aria-label': `حذف ${file.name}`,
        onclick: () => { state.pendingUploads.splice(i, 1); renderPendingUploads(); },
      })));
  }
}

async function submitHomework(e) {
  e.preventDefault();
  const title = $('#hwTitleInput').value.trim();
  if (!title) { toast('عنوان تکلیف الزامی است.', 'error'); return; }
  const payload = {
    title,
    description: $('#hwDesc').value.trim(),
    textbookPages: $('#hwPages').value.trim(),
    instructions: $('#hwInstructions').value.trim(),
    notes: $('#hwNotes').value.trim(),
    dueAt: fromLocalInput($('#hwDue').value),
  };
  try {
    const res = await api(`/api/admin/lessons/${state.hwLessonId}/homework`, { method: 'PUT', body: payload });
    // upload pending attachments
    let uploaded = 0;
    for (const file of state.pendingUploads) {
      const fd = new FormData();
      fd.append('parentType', 'homework');
      fd.append('parentId', String(res.id));
      fd.append('file', file);
      try {
        await api('/api/admin/attachments', { method: 'POST', body: fd });
        uploaded += 1;
      } catch (err) {
        toast(`آپلود «${file.name}» ناموفق: ${err.message}`, 'error');
      }
    }
    toast(uploaded ? `تکلیف و ${faDigits(uploaded)} پیوست ذخیره شد ✅` : 'تکلیف ذخیره شد ✅', 'success');
    closeOverlay($('#hwOverlay'));
    refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function deleteHomework() {
  const ok = await confirmDialog('حذف کامل تکلیف این درس (به‌همراه پیوست‌ها)؟');
  if (!ok) return;
  try {
    await api(`/api/admin/lessons/${state.hwLessonId}/homework`, { method: 'DELETE' });
    toast('تکلیف حذف شد.', 'success');
    closeOverlay($('#hwOverlay'));
    refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------- tasks tab ----------
async function submitTask(e) {
  e.preventDefault();
  const id = $('#taskId').value;
  const subjectId = $('#taskSubject').value;
  const payload = {
    kind: $('#taskKind').value,
    title: $('#taskTitle').value.trim(),
    subjectId: subjectId ? Number(subjectId) : null,
    description: $('#taskDesc').value.trim(),
    dueAt: fromLocalInput($('#taskDue').value),
    priority: $('#taskPriority').value,
  };
  if (!payload.dueAt) { toast('مهلت الزامی است.', 'error'); return; }
  try {
    if (id) {
      await api(`/api/admin/tasks/${id}`, { method: 'PUT', body: payload });
      toast('مهلت به‌روزرسانی شد ✅', 'success');
    } else {
      const res = await api('/api/admin/tasks', { method: 'POST', body: payload });
      // attach pending file if any
      const file = state.taskFile;
      if (file) {
        const fd = new FormData();
        fd.append('parentType', 'task');
        fd.append('parentId', String(res.id));
        fd.append('file', file);
        try { await api('/api/admin/attachments', { method: 'POST', body: fd }); } catch (err) { toast(`آپلود پیوست ناموفق: ${err.message}`, 'error'); }
        state.taskFile = null;
      }
      toast('مهلت جدید ایجاد شد ✅', 'success');
    }
    resetTaskForm();
    refreshAll();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function resetTaskForm() {
  $('#taskId').value = '';
  $('#taskTitle').value = '';
  $('#taskDesc').value = '';
  $('#taskDue').value = '';
  $('#taskPriority').value = 'normal';
  $('#taskSubmit').textContent = 'ذخیره';
  state.taskFile = null;
}

function editTask(task) {
  $('#taskId').value = task.id;
  $('#taskKind').value = task.kind;
  $('#taskTitle').value = task.title;
  $('#taskDesc').value = task.description;
  $('#taskSubject').value = task.subject_id ?? '';
  $('#taskDue').value = toLocalInput(task.due_at);
  $('#taskPriority').value = task.priority;
  $('#taskSubmit').textContent = 'به‌روزرسانی';
  $('#taskForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteTask(task) {
  const ok = await confirmDialog(`حذف «${task.title}»؟`);
  if (!ok) return;
  try {
    await api(`/api/admin/tasks/${task.id}`, { method: 'DELETE' });
    toast('حذف شد.', 'success');
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

async function archiveTask(task) {
  try {
    await api(`/api/admin/tasks/${task.id}/archive`, { method: 'POST' });
    toast(task.archived ? 'از آرشیو خارج شد.' : 'بایگانی شد.', 'success');
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

function renderTasksTab() {
  const list = $('#tasksList');
  list.textContent = '';
  const all = [...state.tasks.active, ...state.tasks.expired];
  if (!all.length) {
    list.append(el('div', { class: 'empty-state', text: 'هنوز مهلتی ثبت نشده است.' }));
    return;
  }
  for (const t of all) {
    const cd = countdown(t.due_at);
    const row = el('div', { class: 'admin-row', style: t.archived ? 'opacity:.6;' : '' },
      el('div', { class: 'admin-row__main' },
        el('div', { class: 'admin-row__title', text: `${KIND_ICONS[t.kind]} ${t.title}${t.archived ? ' (بایگانی)' : ''}` }),
        el('div', { class: 'admin-row__sub', text: `${t.subject_name ? t.subject_name + ' · ' : ''}${formatJalaliDateTime(t.due_at)} · ${cd.text}` })),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => editTask(t), text: '✏️' }),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => archiveTask(t), text: t.archived ? '📤' : '📥' }),
      el('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: () => deleteTask(t), text: '🗑️' }),
    );
    list.append(row);
  }
}

// ---------- announcements tab ----------
async function submitAnn(e) {
  e.preventDefault();
  const id = $('#annId').value;
  const payload = {
    title: $('#annTitle').value.trim(),
    body: $('#annBody').value.trim(),
    pinned: $('#annPinned').checked,
  };
  try {
    if (id) {
      await api(`/api/admin/announcements/${id}`, { method: 'PUT', body: payload });
      toast('اطلاعیه به‌روزرسانی شد ✅', 'success');
    } else {
      const res = await api('/api/admin/announcements', { method: 'POST', body: payload });
      const file = state.annFile;
      if (file) {
        const fd = new FormData();
        fd.append('parentType', 'announcement');
        fd.append('parentId', String(res.id));
        fd.append('file', file);
        try { await api('/api/admin/attachments', { method: 'POST', body: fd }); } catch (err) { toast(`آپلود پیوست ناموفق: ${err.message}`, 'error'); }
        state.annFile = null;
      }
      toast('اطلاعیه منتشر شد ✅', 'success');
    }
    resetAnnForm();
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

function resetAnnForm() {
  $('#annId').value = '';
  $('#annTitle').value = '';
  $('#annBody').value = '';
  $('#annPinned').checked = false;
  $('#annSubmit').textContent = 'انتشار';
}

function editAnn(ann) {
  $('#annId').value = ann.id;
  $('#annTitle').value = ann.title;
  $('#annBody').value = ann.body;
  $('#annPinned').checked = ann.pinned;
  $('#annSubmit').textContent = 'به‌روزرسانی';
  $('#annForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function deleteAnn(ann) {
  const ok = await confirmDialog(`حذف اطلاعیه «${ann.title}»؟`);
  if (!ok) return;
  try {
    await api(`/api/admin/announcements/${ann.id}`, { method: 'DELETE' });
    toast('حذف شد.', 'success');
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

function renderAnnsTab() {
  const list = $('#annsList');
  list.textContent = '';
  if (!state.announcements.length) {
    list.append(el('div', { class: 'empty-state', text: 'هنوز اطلاعیه‌ای منتشر نشده است.' }));
    return;
  }
  for (const a of state.announcements) {
    const row = el('div', { class: 'admin-row' },
      el('div', { class: 'admin-row__main' },
        el('div', { class: 'admin-row__title', text: `${a.pinned ? '📌 ' : ''}${a.title}` }),
        el('div', { class: 'admin-row__sub', text: `${formatJalaliDateTime(a.published_at)}${a.attachment_count ? ` · 📎 ${faDigits(a.attachment_count)} پیوست` : ''}` })),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => editAnn(a), text: '✏️' }),
      el('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: () => deleteAnn(a), text: '🗑️' }),
    );
    list.append(row);
  }
}

// ---------- subjects tab ----------
async function submitSubject(e) {
  e.preventDefault();
  try {
    await api('/api/admin/subjects', {
      method: 'POST',
      body: { name: $('#subjectName').value.trim(), colorKey: $('#subjectColor').value },
    });
    toast('درس جدید اضافه شد ✅', 'success');
    $('#subjectName').value = '';
    refreshAll();
  } catch (err) { toast(err.message, 'error'); }
}

function renderSubjectsTab() {
  const list = $('#subjectsList');
  list.textContent = '';
  for (const s of state.subjects) {
    list.append(el('div', { class: 'admin-row' },
      el('span', { style: `width:22px;height:22px;border-radius:8px;background:var(--${s.colorKey});border:1px solid var(--border-strong);`, 'aria-hidden': 'true' }),
      el('div', { class: 'admin-row__main' },
        el('div', { class: 'admin-row__title', text: s.name }),
        el('div', { class: 'admin-row__sub', text: `شناسه: ${faDigits(s.id)}` }))));
  }
}

// ---------- settings tab ----------
function fillSettingsForm() {
  $('#setClassName').value = state.settings.class_name || '';
  $('#setWelcome').value = state.settings.welcome_message || '';
  $('#setNote').value = state.settings.admin_note || '';
}

async function submitSettings(e) {
  e.preventDefault();
  try {
    await api('/api/admin/settings', {
      method: 'PUT',
      body: {
        class_name: $('#setClassName').value.trim(),
        welcome_message: $('#setWelcome').value.trim(),
        admin_note: $('#setNote').value.trim(),
      },
    });
    toast('تنظیمات ذخیره شد ✅', 'success');
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- tabs ----------
function switchTab(name) {
  for (const btn of document.querySelectorAll('.admin-tab')) {
    const active = btn.dataset.tab === name;
    btn.classList.toggle('admin-tab--active', active);
    btn.setAttribute('aria-selected', String(active));
  }
  for (const panel of document.querySelectorAll('.admin-panel')) {
    panel.classList.toggle('hidden', panel.id !== `tab-${name}`);
  }
}

// ---------- boot ----------
async function boot() {
  $('#brandDate').textContent = formatJalali(new Date(), { withWeekday: true });
  const authed = await checkAuth();
  if (authed) showAdmin();
  else {
    // check if bootstrap needed (no admin exists yet)
    try {
      const need = await fetch('/api/admin/auth/status').then((r) => r.json());
      if (need.bootstrapRequired) {
        $('#loginSub').textContent = 'نخستین بار: حساب مدیر کلاس را بسازید';
        $('#loginSubmit').textContent = 'ساخت حساب مدیر';
        $('#loginForm').dataset.mode = 'bootstrap';
        $('#loginUser').setAttribute('autocomplete', 'new-username');
        $('#loginPass').setAttribute('autocomplete', 'new-password');
        const hint = $('#loginHint');
        hint.textContent = 'نام کاربری و گذرواژه (حداقل ۸ نویسه) انتخاب کنید.';
      }
    } catch { /* default login mode */ }
  }
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#loginSubmit');
  btn.disabled = true;
  try {
    if ($('#loginForm').dataset.mode === 'bootstrap') {
      await api('/api/admin/auth/bootstrap', {
        method: 'POST',
        body: { username: $('#loginUser').value.trim(), password: $('#loginPass').value },
      });
    }
    await handleLoginInner();
  } catch (err) {
    toast(err.message, 'error');
    $('#loginHint').textContent = err.message;
  } finally { btn.disabled = false; }
});

// wire events
$('#logoutBtn').addEventListener('click', handleLogout);
$('#lessonForm').addEventListener('submit', submitLesson);
$('#lessonReset').addEventListener('click', resetLessonForm);
$('#taskForm').addEventListener('submit', submitTask);
$('#taskReset').addEventListener('click', resetTaskForm);
$('#annForm').addEventListener('submit', submitAnn);
$('#annReset').addEventListener('click', resetAnnForm);
$('#subjectForm').addEventListener('submit', submitSubject);
$('#settingsForm').addEventListener('submit', submitSettings);
$('#hwForm').addEventListener('submit', submitHomework);
$('#hwDelete').addEventListener('click', deleteHomework);
$('#hwClose').addEventListener('click', () => closeOverlay($('#hwOverlay')));
$('#hwOverlay').addEventListener('mousedown', (e) => {
  if (e.target === $('#hwOverlay')) closeOverlay($('#hwOverlay'));
});
$('#hwAddFile').addEventListener('click', () => $('#hwFile').click());
$('#hwFile').addEventListener('change', () => {
  for (const f of $('#hwFile').files) {
    if (f.size > 1_500_000) { toast(`«${f.name}» بزرگ‌تر از ۱.۵ مگابایت است.`, 'error'); continue; }
    state.pendingUploads.push(f);
  }
  $('#hwFile').value = '';
  renderPendingUploads();
});

for (const btn of document.querySelectorAll('.admin-tab')) {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!$('#hwOverlay').hidden) closeOverlay($('#hwOverlay'));
    if (!$('#confirmOverlay').hidden) $('#confirmNo').click();
  }
});

boot();
