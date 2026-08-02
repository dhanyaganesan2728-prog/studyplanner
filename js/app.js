// js/app.js — Main entry point
// ALL imports MUST be at the top level (ES module requirement)

import { db } from './firebase-config.js';
import { initTheme, toggleTheme } from './theme.js';
import { requireVerified, initAuth } from './auth.js';
import {
  loginUser, registerUser, loginGoogle,
  showAuthTab, verifyOTP, resendOTP, backToRegister,
  otpKeyUp, otpPaste, doSignOut
} from './auth.js';

import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, where, onSnapshot, serverTimestamp, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Init theme immediately (before DOM) ──
initTheme();

// ── State ──
let currentUser    = null;
let currentType    = 'personal';
let allTasks       = [];
let allGroups      = [];
let activeGroup    = null;
let deadlineTimers = [];
let unsubTasks     = null;
let unsubGroups    = null;

// ══════════════════════════════════════════════════════
//  DOM READY — wire all event listeners
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  // Auth buttons
  on('login-btn',           () => loginUser());
  on('register-btn',        () => registerUser());
  on('login-google-btn',    () => loginGoogle());
  on('register-google-btn', () => loginGoogle());
  on('tab-login',           () => showAuthTab('login'));
  on('tab-register',        () => showAuthTab('register'));

  // Enter key shortcuts
  document.getElementById('login-pass')?.addEventListener('keydown',  e => { if (e.key === 'Enter') loginUser(); });
  document.getElementById('reg-pass2')?.addEventListener('keydown',   e => { if (e.key === 'Enter') registerUser(); });

  // OTP
  on('verify-otp-btn',       () => verifyOTP());
  on('resend-otp-btn',       () => resendOTP());
  on('back-to-register-btn', () => backToRegister());
  [1,2,3,4,5,6].forEach(i => {
    document.getElementById(`otp-${i}`)?.addEventListener('keyup', e => otpKeyUp(e, i));
  });
  document.querySelector('.otp-inputs')?.addEventListener('paste', e => otpPaste(e));

  // Theme
  on('theme-toggle-btn', toggleTheme);
  on('topbar-theme-btn', toggleTheme);

  // Sidebar
  on('hamburger',       openSidebar);
  on('sidebar-overlay', closeSidebar);
  on('signout-btn',     handleSignOut);
  on('new-group-btn',   closeSidebar);

  // Navigation — sidebar + bottom nav + widget links
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.page));
  });

  // "Add task" buttons
  document.querySelectorAll('.add-task-btn').forEach(btn => {
    btn.addEventListener('click', () => setTaskType(btn.dataset.type || 'personal'));
  });
  on('fab', () => setTaskType('personal'));

  // Modal actions
  on('save-task-btn',    saveTask);
  on('create-group-btn', createGroup);

  // Start Firebase auth listener
  initAuth();
});

// ── Helper: attach click listener by element id ──
function on(id, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', fn);
}

// ══════════════════════════════════════════════════════
//  AUTH STATE EVENTS (fired by auth.js via CustomEvent)
// ══════════════════════════════════════════════════════
window.addEventListener('userReady', e => {
  currentUser = e.detail;
  startListeners();
  requestNotificationPermission();
});

window.addEventListener('userSignedOut', () => {
  currentUser = null;
  allTasks    = [];
  allGroups   = [];
  deadlineTimers.forEach(clearTimeout);
  deadlineTimers = [];
  unsubTasks?.();
  unsubGroups?.();
});

// ══════════════════════════════════════════════════════
//  SIGN OUT
// ══════════════════════════════════════════════════════
function handleSignOut() {
  if (confirm('Sign out of StudySync?')) doSignOut();
}

// ══════════════════════════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════════════════════════
function navigate(page) {
  // Hide all pages, activate target
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  // Update nav highlights
  document.querySelectorAll('.nav-item[data-page]').forEach(a =>
    a.classList.toggle('active', a.dataset.page === page));
  document.querySelectorAll('.bnav-item[data-page]').forEach(b =>
    b.classList.toggle('active', b.dataset.page === page));

  closeSidebar();
  if (page === 'group')     renderGroupTasks();
  if (page === 'deadlines') renderDeadlines();
}

function openSidebar()  {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('sidebar-overlay')?.classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('show');
}

// ══════════════════════════════════════════════════════
//  TOAST
// ══════════════════════════════════════════════════════
function showToast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  document.getElementById('toast-container')?.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'all .3s';
    el.style.opacity    = '0';
    el.style.transform  = 'translateX(110%)';
    setTimeout(() => el.remove(), 300);
  }, 4000);
}
window.showToast = showToast;

// ══════════════════════════════════════════════════════
//  TASK TYPE + MODAL SETUP
// ══════════════════════════════════════════════════════
function setTaskType(type) {
  currentType = type;
  const titles = { study: 'New Study Plan', group: 'New Group Task', personal: 'New Task' };
  const titleEl = document.getElementById('modal-task-title');
  if (titleEl) titleEl.textContent = titles[type] || 'New Task';

  const gsw = document.getElementById('group-select-wrap');
  const sf  = document.getElementById('study-fields');
  if (gsw) gsw.style.display = type === 'group' ? '' : 'none';
  if (sf)  sf.style.display  = type === 'study' ? '' : 'none';

  // Clear form
  document.getElementById('edit-task-id').value = '';
  ['task-title-in', 'task-desc-in', 'task-subject-in'].forEach(id => {
    const e = document.getElementById(id); if (e) e.value = '';
  });
  const pri = document.getElementById('task-priority-in'); if (pri) pri.value = 'medium';
  const ddl = document.getElementById('task-deadline-in'); if (ddl) ddl.value = '';
  const rem = document.getElementById('task-reminder-in'); if (rem) rem.value = '';
  const dur = document.getElementById('task-duration-in'); if (dur) dur.value = '';
  const res = document.getElementById('task-resources-in'); if (res) res.value = '';

  if (type === 'group') {
    const sel = document.getElementById('task-group-in');
    if (sel) {
      sel.innerHTML = '<option value="">-- Select Group --</option>';
      allGroups.forEach(g => sel.innerHTML += `<option value="${g.id}">${g.name}</option>`);
    }
  }
}

// ══════════════════════════════════════════════════════
//  SAVE TASK
// ══════════════════════════════════════════════════════
async function saveTask() {
  const title    = document.getElementById('task-title-in')?.value.trim();
  const desc     = document.getElementById('task-desc-in')?.value.trim();
  const priority = document.getElementById('task-priority-in')?.value;
  const deadline = document.getElementById('task-deadline-in')?.value;
  const subject  = document.getElementById('task-subject-in')?.value.trim();
  const reminder = document.getElementById('task-reminder-in')?.value;
  const editId   = document.getElementById('edit-task-id')?.value;

  if (!title)       return showToast('Title is required', 'error');
  if (!currentUser) return showToast('Please sign in first', 'error');

  const data = {
    title, desc, priority, subject,
    deadline: deadline ? new Date(deadline).toISOString() : null,
    reminder: reminder ? new Date(reminder).toISOString() : null,
    type:     currentType,
    userId:   currentUser.uid,
    updatedAt: serverTimestamp()
  };

  if (currentType === 'study') {
    data.duration  = document.getElementById('task-duration-in')?.value || null;
    data.resources = document.getElementById('task-resources-in')?.value.trim() || '';
  }
  if (currentType === 'group') {
    if (!requireVerified()) return showToast('Email verification required for groups', 'error');
    const gid = document.getElementById('task-group-in')?.value;
    if (!gid) return showToast('Please select a group', 'error');
    data.groupId = gid;
  }

  try {
    if (editId) {
      await updateDoc(doc(db, 'tasks', editId), data);
      showToast('Task updated!', 'success');
    } else {
      data.createdAt = serverTimestamp();
      data.done      = false;
      await addDoc(collection(db, 'tasks'), data);
      showToast('Task added! 🎉', 'success');
    }
    bootstrap.Modal.getInstance(document.getElementById('addTaskModal'))?.hide();
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════
//  FIRESTORE LISTENERS
// ══════════════════════════════════════════════════════
function startListeners() {
  // Tasks listener — with index-required fallback
  const q = query(
    collection(db, 'tasks'),
    where('userId', '==', currentUser.uid),
    orderBy('createdAt', 'desc')
  );
  unsubTasks = onSnapshot(q, snap => {
    allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAll();
    scheduleDeadlineNotifications();
  }, () => {
    // Fallback if composite index not created yet
    const q2 = query(collection(db, 'tasks'), where('userId', '==', currentUser.uid));
    unsubTasks = onSnapshot(q2, snap => {
      allTasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderAll();
    });
  });

  // Groups listener
  const qg = query(collection(db, 'groups'), where('memberIds', 'array-contains', currentUser.uid));
  unsubGroups = onSnapshot(qg, snap => {
    allGroups = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderGroupSidebar();
    renderGroupTasks();
  });
}

function renderAll() {
  renderDashboard();
  renderStudy();
  renderPersonal();
  renderGroupTasks();
  renderDeadlines();
}

// ══════════════════════════════════════════════════════
//  RENDER HELPERS
// ══════════════════════════════════════════════════════
const pbadge = p => `<span class="badge-${p || 'medium'}">${p || 'medium'}</span>`;

function dlabel(dl) {
  if (!dl) return '';
  const d = new Date(dl), now = new Date(), diff = d - now;
  const cls = diff < 0 ? 'red' : diff < 86400000 ? 'orange' : 'green';
  const txt = diff < 0
    ? 'Overdue'
    : diff < 86400000
    ? `${Math.ceil(diff / 3600000)}h left`
    : `Due ${d.toLocaleDateString()}`;
  return `<span class="dl-badge ${cls}"><i class="bi bi-clock"></i> ${txt}</span>`;
}

function makeCard(t) {
  return `
  <div class="task-card ${t.done ? 'done' : ''}" data-id="${t.id}">
    <div class="card-top">
      <div class="card-left">
        <input type="checkbox" class="task-check" ${t.done ? 'checked' : ''}
          data-action="toggle" data-id="${t.id}" data-done="${!t.done}"/>
        <span class="task-title">${escHtml(t.title)}</span>
      </div>
      ${pbadge(t.priority)}
    </div>
    ${t.subject ? `<div class="card-subject"><i class="bi bi-tag"></i> ${escHtml(t.subject)}</div>` : ''}
    ${t.desc    ? `<p class="card-desc">${escHtml(t.desc)}</p>` : ''}
    <div class="card-bottom">
      ${dlabel(t.deadline)}
      <div class="card-actions">
        <button class="icon-btn"        data-action="edit"   data-id="${t.id}"><i class="bi bi-pencil"></i></button>
        <button class="icon-btn danger" data-action="delete" data-id="${t.id}"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  </div>`;
}

function emptyState(icon, msg) {
  return `<div class="empty-state"><i class="bi bi-${icon}"></i><p>${msg}</p></div>`;
}

// Escape HTML to prevent XSS
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Event delegation for task card actions ──
document.addEventListener('click', async e => {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) {
    // Clicking the card itself → open detail
    const card = e.target.closest('.task-card');
    if (card) openDetail(card.dataset.id);
    return;
  }
  e.stopPropagation();
  const { action, id } = actionEl.dataset;
  if (action === 'toggle') await toggleDone(id, actionEl.dataset.done === 'true');
  if (action === 'edit')   editTask(id);
  if (action === 'delete') { if (confirm('Delete this task?')) await deleteTask(id); }

  // Widget "See all" links
  if (actionEl.dataset.page) navigate(actionEl.dataset.page);
});

// ══════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════
function renderDashboard() {
  const now     = new Date();
  const total   = allTasks.length;
  const done    = allTasks.filter(t => t.done).length;
  const overdue = allTasks.filter(t => !t.done && t.deadline && new Date(t.deadline) < now).length;
  const study   = allTasks.filter(t => t.type === 'study').length;
  const soon    = allTasks.filter(t => !t.done && t.deadline && (new Date(t.deadline) - now) < 86400000 && new Date(t.deadline) > now).length;
  const pct     = total ? Math.round((done / total) * 100) : 0;

  setText('stat-total',   total);
  setText('stat-done',    done);
  setText('stat-overdue', overdue);
  setText('stat-soon',    soon);
  setText('stat-study',   study);
  setText('prog-pct',     pct + '%');
  const pf = document.getElementById('prog-fill');
  if (pf) pf.style.width = pct + '%';

  // Recent tasks
  const rt = document.getElementById('recent-tasks');
  if (rt) rt.innerHTML = allTasks.slice(0, 6).length
    ? allTasks.slice(0, 6).map(makeCard).join('')
    : emptyState('inbox', 'No tasks yet — add your first!');

  // Upcoming deadlines
  const ud = document.getElementById('upcoming-deadlines');
  if (ud) {
    const upcoming = allTasks
      .filter(t => t.deadline && !t.done && new Date(t.deadline) > now)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
      .slice(0, 5);
    ud.innerHTML = upcoming.length
      ? upcoming.map(t => {
          const d = new Date(t.deadline), diff = d - now;
          const cls = diff < 3600000 ? 'red' : diff < 86400000 ? 'orange' : 'green';
          const ago = diff < 3600000 ? `${Math.ceil(diff/60000)}m` : diff < 86400000 ? `${Math.ceil(diff/3600000)}h` : `${Math.ceil(diff/86400000)}d`;
          return `<div class="up-row" data-id="${t.id}">
            <div class="up-info">
              <span class="up-title">${escHtml(t.title)}</span>
              <span class="up-meta">${escHtml(t.subject || t.type)}</span>
            </div>
            <span class="up-time ${cls}">${ago}</span>
          </div>`;
        }).join('')
      : `<div style="text-align:center;padding:1.5rem;color:var(--text-2);font-size:.85rem;">No upcoming deadlines 🎉</div>`;
  }

  // Activity feed
  const af = document.getElementById('activity-feed');
  if (af) {
    af.innerHTML = allTasks.slice(0, 5).length
      ? allTasks.slice(0, 5).map(t => `
          <div class="act-row">
            <div class="act-dot ${t.done ? 'green' : t.type === 'study' ? 'brand' : 'gray'}"></div>
            <div class="act-info">
              <span class="act-title">${escHtml(t.title)}</span>
              <span class="act-meta">${t.type} · ${escHtml(t.subject || 'No subject')}</span>
            </div>
            <span class="act-status">${t.done ? '✅' : '⏳'}</span>
          </div>`).join('')
      : `<div style="text-align:center;padding:1rem;color:var(--text-2);font-size:.85rem;">No activity yet</div>`;
  }
}

function setText(id, val) { const e = document.getElementById(id); if (e) e.textContent = val; }

// ══════════════════════════════════════════════════════
//  PAGE RENDERS
// ══════════════════════════════════════════════════════
function renderStudy() {
  const tasks = allTasks.filter(t => t.type === 'study');
  const el    = document.getElementById('study-list');
  if (el) el.innerHTML = tasks.length ? tasks.map(makeCard).join('') : emptyState('journal-bookmark', 'No study plans yet');
}

function renderPersonal() {
  const tasks = allTasks.filter(t => t.type === 'personal');
  const el    = document.getElementById('personal-list');
  if (el) el.innerHTML = tasks.length ? tasks.map(makeCard).join('') : emptyState('check2-square', 'No personal tasks yet');
}

function renderGroupTasks() {
  const tasks = allTasks.filter(t => t.type === 'group');
  const sel   = document.getElementById('group-selector');

  if (sel) {
    sel.innerHTML = '';
    // "All" button
    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn' + (activeGroup === null ? ' active' : '');
    allBtn.textContent = 'All';
    allBtn.addEventListener('click', () => { activeGroup = null; renderGroupTasks(); });
    sel.appendChild(allBtn);

    // One button per group
    allGroups.forEach(g => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn' + (activeGroup === g.id ? ' active' : '');
      btn.textContent = g.name;
      btn.addEventListener('click', () => { activeGroup = g.id; renderGroupTasks(); });
      sel.appendChild(btn);
    });
  }

  const filtered = activeGroup ? tasks.filter(t => t.groupId === activeGroup) : tasks;
  const el       = document.getElementById('group-list');
  if (el) el.innerHTML = filtered.length ? filtered.map(makeCard).join('') : emptyState('people', 'No group tasks yet');
}

function renderDeadlines() {
  const list = allTasks.filter(t => t.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  const el   = document.getElementById('deadline-list');
  if (!el) return;
  if (!list.length) { el.innerHTML = emptyState('calendar-event', 'No deadlines set'); return; }

  const now = new Date();
  el.innerHTML = list.map(t => {
    const d = new Date(t.deadline), diff = d - now;
    const cls  = diff < 0 ? 'red' : diff < 86400000 ? 'orange' : 'green';
    const icon = diff < 0 ? 'exclamation-circle' : diff < 86400000 ? 'alarm' : 'calendar-check';
    const ago  = diff < 0
      ? `${Math.ceil(-diff / 86400000)}d overdue`
      : diff < 86400000
      ? `${Math.ceil(diff / 3600000)}h left`
      : `${Math.ceil(diff / 86400000)}d left`;
    return `
    <div class="deadline-row ${t.done ? 'done' : ''}">
      <div class="dl-left">
        <input type="checkbox" class="task-check" ${t.done ? 'checked' : ''}
          data-action="toggle" data-id="${t.id}" data-done="${!t.done}"/>
        <div>
          <div class="task-title">${escHtml(t.title)}</div>
          <div class="card-subject">${escHtml(t.subject || '')} ${t.type ? '· ' + t.type : ''}</div>
        </div>
      </div>
      <div class="dl-right">
        <div class="dl-badge ${cls}"><i class="bi bi-${icon}"></i> ${ago}</div>
        <div class="dl-date">${d.toLocaleString()}</div>
      </div>
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════
//  GROUPS SIDEBAR
// ══════════════════════════════════════════════════════
function renderGroupSidebar() {
  const el = document.getElementById('group-list-sidebar');
  if (!el) return;
  el.innerHTML = '';
  allGroups.forEach(g => {
    const a  = document.createElement('a');
    a.className = 'nav-item';
    a.innerHTML = `<i class="bi bi-people-fill"></i><span>${escHtml(g.name)}</span>`;
    a.addEventListener('click', () => { activeGroup = g.id; navigate('group'); });
    el.appendChild(a);
  });
}

async function createGroup() {
  if (!requireVerified()) return showToast('Please verify your email before creating groups', 'error');
  const name   = document.getElementById('group-name-in')?.value.trim();
  const desc   = document.getElementById('group-desc-in')?.value.trim();
  const emails = document.getElementById('group-members-in')?.value.split(',').map(e => e.trim()).filter(Boolean);
  if (!name) return showToast('Group name required', 'error');
  try {
    await addDoc(collection(db, 'groups'), {
      name, desc,
      createdBy:    currentUser.uid,
      memberIds:    [currentUser.uid],
      memberEmails: [currentUser.email, ...emails],
      createdAt:    serverTimestamp()
    });
    bootstrap.Modal.getInstance(document.getElementById('createGroupModal'))?.hide();
    showToast(`Group "${name}" created! 🎉`, 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ══════════════════════════════════════════════════════
//  TASK CRUD
// ══════════════════════════════════════════════════════
async function toggleDone(id, val) {
  try {
    await updateDoc(doc(db, 'tasks', id), { done: val, updatedAt: serverTimestamp() });
    if (val) showToast('Task completed! 🎉', 'success');
  } catch { showToast('Error updating task', 'error'); }
}

async function deleteTask(id) {
  try { await deleteDoc(doc(db, 'tasks', id)); showToast('Task deleted', 'info'); }
  catch { showToast('Error deleting task', 'error'); }
}

function editTask(id) {
  const t = allTasks.find(x => x.id === id); if (!t) return;
  setTaskType(t.type);
  document.getElementById('edit-task-id').value     = id;
  document.getElementById('task-title-in').value    = t.title    || '';
  document.getElementById('task-desc-in').value     = t.desc     || '';
  document.getElementById('task-priority-in').value = t.priority || 'medium';
  document.getElementById('task-subject-in').value  = t.subject  || '';
  if (t.deadline) document.getElementById('task-deadline-in').value = toLocal(t.deadline);
  if (t.reminder) document.getElementById('task-reminder-in').value = toLocal(t.reminder);
  if (t.type === 'study') {
    const d = document.getElementById('task-duration-in');  if (d) d.value = t.duration  || '';
    const r = document.getElementById('task-resources-in'); if (r) r.value = t.resources || '';
  }
  if (t.type === 'group' && t.groupId) {
    const s = document.getElementById('task-group-in'); if (s) s.value = t.groupId;
  }
  new bootstrap.Modal(document.getElementById('addTaskModal')).show();
}

function openDetail(id) {
  const t = allTasks.find(x => x.id === id); if (!t) return;
  setText('detail-title', t.title);
  document.getElementById('detail-body').innerHTML = `
    <div class="detail-chips">
      ${pbadge(t.priority)}
      <span class="chip">${t.type}</span>
      ${t.subject ? `<span class="chip">${escHtml(t.subject)}</span>` : ''}
      ${t.done    ? '<span class="chip green">✅ Done</span>' : ''}
    </div>
    ${t.desc     ? `<p class="detail-desc">${escHtml(t.desc)}</p>`                                                                    : ''}
    ${t.deadline ? `<div class="detail-row"><span>📅</span><span>${new Date(t.deadline).toLocaleString()}</span></div>`               : ''}
    ${t.reminder ? `<div class="detail-row"><span>🔔</span><span>${new Date(t.reminder).toLocaleString()}</span></div>`               : ''}
    ${t.duration ? `<div class="detail-row"><span>⏱</span><span>${t.duration} hour(s)</span></div>`                                   : ''}
    ${t.resources? `<div class="detail-row"><span>📚</span><span>${escHtml(t.resources)}</span></div>`                                : ''}`;

  document.getElementById('detail-footer').innerHTML = `
    <button class="btn-ghost" data-bs-dismiss="modal">Close</button>
    <button class="btn-primary" id="detail-toggle-btn">${t.done ? 'Mark Undone' : '✅ Mark Done'}</button>`;

  document.getElementById('detail-toggle-btn')?.addEventListener('click', async () => {
    await toggleDone(id, !t.done);
    bootstrap.Modal.getInstance(document.getElementById('taskDetailModal'))?.hide();
  });
  new bootstrap.Modal(document.getElementById('taskDetailModal')).show();
}

// ══════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════
async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function scheduleDeadlineNotifications() {
  deadlineTimers.forEach(clearTimeout);
  deadlineTimers = [];
  const now = Date.now();
  allTasks.forEach(t => {
    if (!t.deadline || t.done) return;
    const due = new Date(t.deadline).getTime(), diff = due - now;
    [{ ms: 24*3600000, label: '24 hours' }, { ms: 3600000, label: '1 hour' }, { ms: 0, label: 'NOW' }].forEach(({ ms, label }) => {
      const fireAt = diff - ms;
      if (fireAt > 0 && fireAt < 48 * 3600000) {
        deadlineTimers.push(setTimeout(() => {
          if (Notification.permission === 'granted') {
            try { new Notification(`⏰ Due in ${label}`, { body: `"${t.title}"`, tag: t.id + label }); } catch(_) {}
          }
          showToast(`⏰ "${t.title}" due in ${label}`, 'warning');
        }, fireAt));
      }
    });
  });
}

// ── Utility: convert ISO to datetime-local value ──
const toLocal = iso => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
