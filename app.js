// Simple local persistence helpers
const STORAGE_KEYS = {
  profile: 'doctor.profile',
  certs: 'doctor.certs',
  appointments: 'doctor.appointments',
  patients: 'doctor.patients'
};

function saveLocal(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

// DOM Helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Router-like view switching
function switchView(viewId) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + viewId).classList.add('active');
}

function initNav() {
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.target));
  });
}

// PROFILE MANAGEMENT
function initProfile() {
  const profileForm = $('#profile-form');
  const certUpload = $('#cert-upload');
  const certList = $('#cert-list');

  // Load profile
  const profile = loadLocal(STORAGE_KEYS.profile, {
    name: '', email: '', phone: '', specialization: '', license: '', experience: 0, about: ''
  });
  $('#doctor-name').value = profile.name;
  $('#doctor-email').value = profile.email;
  $('#doctor-phone').value = profile.phone;
  $('#doctor-specialization').value = profile.specialization;
  $('#doctor-license').value = profile.license;
  $('#doctor-experience').value = profile.experience;
  $('#doctor-about').value = profile.about;

  // Load certs
  let certs = loadLocal(STORAGE_KEYS.certs, []);
  renderCerts();

  $('#btn-add-cert').addEventListener('click', async () => {
    const files = Array.from(certUpload.files);
    if (!files.length) return;
    // Store as data URLs for demo purposes
    for (const file of files) {
      const dataUrl = await fileToDataURL(file);
      certs.push({ id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, dataUrl });
    }
    saveLocal(STORAGE_KEYS.certs, certs);
    certUpload.value = '';
    renderCerts();
  });

  certList.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    if (e.target.matches('.btn-delete')) {
      certs = certs.filter(c => c.id !== id);
      saveLocal(STORAGE_KEYS.certs, certs);
      renderCerts();
    } else if (e.target.matches('.btn-download')) {
      const cert = certs.find(c => c.id === id);
      if (cert) downloadDataUrl(cert.dataUrl, cert.name);
    }
  });

  profileForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newProfile = {
      name: $('#doctor-name').value.trim(),
      email: $('#doctor-email').value.trim(),
      phone: $('#doctor-phone').value.trim(),
      specialization: $('#doctor-specialization').value.trim(),
      license: $('#doctor-license').value.trim(),
      experience: Number($('#doctor-experience').value || 0),
      about: $('#doctor-about').value.trim()
    };
    saveLocal(STORAGE_KEYS.profile, newProfile);
    flash('Profile saved');
  });

  $('#btn-reset-profile').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.profile);
    location.reload();
  });

  function renderCerts() {
    certList.innerHTML = '';
    if (!certs.length) {
      certList.innerHTML = '<li class="muted">No certificates uploaded yet.</li>';
      return;
    }
    for (const c of certs) {
      const li = document.createElement('li');
      li.dataset.id = c.id;
      li.innerHTML = `
        <div>
          <div>${c.name}</div>
          <div class="meta">${(c.size/1024).toFixed(1)} KB • ${c.type || 'file'}</div>
        </div>
        <div class="actions">
          <button class="btn" type="button" data-action="download btn-download">Download</button>
          <button class="btn danger btn-delete" type="button">Delete</button>
        </div>`;
      certList.appendChild(li);
    }
  }
}

// APPOINTMENTS MANAGEMENT
function initAppointments() {
  const tabs = $$('.tab-btn');
  tabs.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

  function switchTab(tab) {
    tabs.forEach(b => b.classList.remove('active'));
    tabs.find(b => b.dataset.tab === tab)?.classList.add('active');
    $$('.tab').forEach(t => t.classList.remove('active'));
    $('#tab-' + tab).classList.add('active');
  }

  let appointments = loadLocal(STORAGE_KEYS.appointments, seedAppointments());
  renderAppointments();

  // Auto reminders: simple notification banner when upcoming in < 24h
  setInterval(checkReminders, 60 * 1000); // every minute
  checkReminders();

  function renderAppointments() {
    const upcomingUl = $('#list-upcoming');
    const pendingUl = $('#list-pending');
    const pastUl = $('#list-past');
    for (const ul of [upcomingUl, pendingUl, pastUl]) ul.innerHTML = '';

    const now = Date.now();
    const upcoming = appointments.filter(a => a.status === 'approved' && new Date(a.datetime).getTime() >= now);
    const pending = appointments.filter(a => a.status === 'pending');
    const past = appointments.filter(a => new Date(a.datetime).getTime() < now);

    for (const a of upcoming) upcomingUl.appendChild(renderAppointmentItem(a, ['Mark As Done']));
    for (const a of pending) pendingUl.appendChild(renderAppointmentItem(a, ['Approve', 'Reject']));
    for (const a of past) pastUl.appendChild(renderAppointmentItem(a, []));
  }

  function renderAppointmentItem(appt, actions) {
    const tpl = document.importNode($('#appointment-item-tpl').content, true);
    const li = tpl.querySelector('li');
    li.dataset.id = appt.id;
    li.querySelector('.primary').textContent = `${formatDate(appt.datetime)} • ${appt.patientName}`;
    li.querySelector('.secondary').textContent = `${appt.reason || 'General consultation'} • ${appt.status}`;
    const right = li.querySelector('.right');
    for (const act of actions) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = act;
      btn.addEventListener('click', () => onAppointmentAction(appt.id, act));
      right.appendChild(btn);
    }
    return li;
  }

  function onAppointmentAction(id, action) {
    const idx = appointments.findIndex(a => a.id === id);
    if (idx === -1) return;
    const appt = appointments[idx];
    if (action === 'Approve') appt.status = 'approved';
    else if (action === 'Reject') appt.status = 'rejected';
    else if (action === 'Mark As Done') appt.status = 'done';
    appointments[idx] = appt;
    saveLocal(STORAGE_KEYS.appointments, appointments);
    renderAppointments();
  }

  function checkReminders() {
    const now = Date.now();
    const soon = 24 * 60 * 60 * 1000; // 24h
    const due = loadLocal('doctor.reminders.dismissed', []);
    appointments.filter(a => a.status === 'approved').forEach(a => {
      const t = new Date(a.datetime).getTime();
      if (t > now && t - now < soon && !due.includes(a.id)) {
        toast(`Upcoming appointment: ${a.patientName} at ${formatTime(a.datetime)}`, {
          actionText: 'Dismiss', onAction: () => dismissReminder(a.id)
        });
      }
    });
  }

  function dismissReminder(id) {
    const arr = loadLocal('doctor.reminders.dismissed', []);
    if (!arr.includes(id)) arr.push(id);
    saveLocal('doctor.reminders.dismissed', arr);
  }
}

// PATIENTS MANAGEMENT
function initPatients() {
  const searchInput = $('#patient-search');
  const patientsUl = $('#patients-ul');
  const profileGrid = $('#patient-profile-grid');
  const historyUl = $('#history-ul');
  const filesUl = $('#files-ul');
  const consultationsUl = $('#consultations-ul');

  let patients = loadLocal(STORAGE_KEYS.patients, seedPatients());
  renderList(patients);

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase();
    const filtered = patients.filter(p => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || (p.email||'').toLowerCase().includes(q));
    renderList(filtered);
  });

  patientsUl.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    $$('#patients-ul li').forEach(n => n.classList.remove('active'));
    li.classList.add('active');
    const p = patients.find(x => x.id === li.dataset.id);
    if (p) showPatient(p);
  });

  $('#btn-download-all').addEventListener('click', () => {
    const selected = Array.from(filesUl.querySelectorAll('input[type="checkbox"]:checked'));
    if (!selected.length) { flash('Select files to download'); return; }
    selected.forEach(chk => {
      const id = chk.closest('li').dataset.id;
      for (const p of patients) {
        const f = p.files.find(ff => ff.id === id);
        if (f) downloadDataUrl(f.dataUrl, f.name);
      }
    });
  });

  function renderList(list) {
    patientsUl.innerHTML = '';
    for (const p of list) {
      const li = document.createElement('li');
      li.dataset.id = p.id;
      li.innerHTML = `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
        <div>
          <div><strong>${p.firstName} ${p.lastName}</strong></div>
          <div class="secondary">${p.email || '—'} • ${p.age}y</div>
        </div>
        <div class="secondary">${p.gender}</div>
      </div>`;
      patientsUl.appendChild(li);
    }
  }

  function showPatient(p) {
    $('#patient-summary').classList.add('hidden');
    $('#patient-profile').classList.remove('hidden');
    $('#patient-history').classList.remove('hidden');
    $('#patient-files').classList.remove('hidden');
    $('#patient-consultations').classList.remove('hidden');

    profileGrid.innerHTML = '';
    const rows = [
      ['Name', `${p.firstName} ${p.lastName}`],
      ['Email', p.email || '—'],
      ['Age', `${p.age}`],
      ['Gender', p.gender],
      ['Conditions', p.conditions.join(', ') || '—'],
      ['Allergies', p.allergies.join(', ') || '—']
    ];
    for (const [k, v] of rows) {
      const div = document.createElement('div');
      div.innerHTML = `<label>${k}<input value="${escapeHtml(v)}" readonly></label>`;
      profileGrid.appendChild(div);
    }

    historyUl.innerHTML = '';
    for (const h of p.history) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${formatDate(h.date)}</strong> — ${escapeHtml(h.summary)}`;
      historyUl.appendChild(li);
    }

    filesUl.innerHTML = '';
    for (const f of p.files) {
      const li = document.createElement('li');
      li.dataset.id = f.id;
      li.innerHTML = `<div>
        <div>${f.name}</div>
        <div class="meta">${(f.size/1024).toFixed(1)} KB • ${f.type || 'file'}</div>
      </div>
      <div>
        <label style="display:flex;align-items:center;gap:6px;"><input type="checkbox"> Select</label>
        <button class="btn" type="button">Download</button>
      </div>`;
      li.querySelector('button').addEventListener('click', () => downloadDataUrl(f.dataUrl, f.name));
      filesUl.appendChild(li);
    }

    consultationsUl.innerHTML = '';
    for (const c of p.consultations) {
      const li = document.createElement('li');
      li.innerHTML = `<div><strong>${formatDate(c.date)}</strong> — ${escapeHtml(c.notes)}</div>
      <div class="secondary">Prescription: ${escapeHtml(c.prescription || '—')}</div>`;
      consultationsUl.appendChild(li);
    }
  }
}

// Utilities
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl; a.download = filename; a.click();
}

function formatDate(dt) {
  const d = new Date(dt);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function formatTime(dt) {
  const d = new Date(dt);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function flash(message, timeout = 2000) {
  toast(message, { timeout });
}

function toast(message, opts = {}) {
  let host = $('#toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    host.style.position = 'fixed';
    host.style.right = '16px';
    host.style.bottom = '16px';
    host.style.display = 'grid';
    host.style.gap = '8px';
    document.body.appendChild(host);
  }
  const note = document.createElement('div');
  note.className = 'card';
  note.style.background = '#16224d';
  note.style.borderColor = 'var(--accent)';
  note.textContent = message;
  if (opts.actionText) {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = opts.actionText;
    btn.style.marginLeft = '8px';
    btn.addEventListener('click', () => { opts.onAction?.(); host.removeChild(note); });
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.alignItems = 'center';
    wrap.style.justifyContent = 'space-between';
    wrap.appendChild(document.createTextNode(message));
    wrap.appendChild(btn);
    note.textContent = '';
    note.appendChild(wrap);
  }
  host.appendChild(note);
  const t = opts.timeout ?? 0;
  if (t) setTimeout(() => note.remove(), t);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]+/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

// Seed Data
function seedAppointments() {
  const now = new Date();
  const addH = (h) => new Date(now.getTime() + h * 3600_000).toISOString();
  return [
    { id: crypto.randomUUID(), patientId: 'p1', patientName: 'Alice Johnson', datetime: addH(2), status: 'pending', reason: 'Follow-up' },
    { id: crypto.randomUUID(), patientId: 'p2', patientName: 'Bob Smith', datetime: addH(28), status: 'approved', reason: 'General check' },
    { id: crypto.randomUUID(), patientId: 'p3', patientName: 'Clara Doe', datetime: addH(-10), status: 'done', reason: 'Lab review' },
  ];
}

function makeDataUrlFromText(name, text) {
  return 'data:text/plain;base64,' + btoa(unescape(encodeURIComponent(text)));
}

function seedPatients() {
  const fileA = { id: crypto.randomUUID(), name: 'bloodwork_alice.txt', size: 1200, type: 'text/plain', dataUrl: makeDataUrlFromText('bloodwork_alice.txt', 'Hemoglobin: 13.6 g/dL') };
  const fileB = { id: crypto.randomUUID(), name: 'xray_bob.txt', size: 800, type: 'text/plain', dataUrl: makeDataUrlFromText('xray_bob.txt', 'No abnormalities detected') };
  return [
    {
      id: 'p1', firstName: 'Alice', lastName: 'Johnson', age: 29, gender: 'F', email: 'alice@example.com',
      conditions: ['Hypertension'], allergies: ['Penicillin'],
      history: [ { date: new Date().toISOString(), summary: 'Routine checkup' } ],
      files: [fileA],
      consultations: [ { date: new Date().toISOString(), notes: 'Stable BP. Continue meds.', prescription: 'Lisinopril 10mg' } ]
    },
    {
      id: 'p2', firstName: 'Bob', lastName: 'Smith', age: 41, gender: 'M', email: 'bob@example.com',
      conditions: [], allergies: [],
      history: [ { date: new Date(Date.now()-86400_000).toISOString(), summary: 'Back pain' } ],
      files: [fileB],
      consultations: [ { date: new Date(Date.now()-86400_000).toISOString(), notes: 'Muscle strain suspected', prescription: 'Ibuprofen 400mg PRN' } ]
    },
    {
      id: 'p3', firstName: 'Clara', lastName: 'Doe', age: 35, gender: 'F', email: 'clara@example.com',
      conditions: ['Asthma'], allergies: ['Dust'],
      history: [ { date: new Date(Date.now()-7*86400_000).toISOString(), summary: 'Asthma follow-up' } ],
      files: [],
      consultations: [ { date: new Date(Date.now()-7*86400_000).toISOString(), notes: 'Inhaler technique reviewed', prescription: 'Albuterol inhaler' } ]
    }
  ];
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initProfile();
  initAppointments();
  initPatients();
  $('#year').textContent = new Date().getFullYear();
});

