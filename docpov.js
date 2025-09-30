(function() {
  const STORAGE = {
    profile: 'techmed.doctor.profile',
    licenses: 'techmed.doctor.licenses',
    appointments: 'techmed.doctor.appointments',
    patients: 'techmed.patients',
    remindersDismissed: 'techmed.reminders.dismissed'
  };

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };

  // Notifications demo (with read state)
  let notifications = [
    { id: 1, text: "Upcoming appointment with Juan Dela Cruz at 9:00 AM", time: "Today", read: false },
    { id: 2, text: "Maria Santos uploaded a new report", time: "Yesterday", read: false },
    { id: 3, text: "Your license document was approved", time: "2 days ago", read: false }
  ];

  function renderNotifications() {
    const list = document.getElementById("notify-list");
    const badge = document.getElementById("notify-count");
    const unreadCount = notifications.filter(n => !n.read).length;
    if (!notifications.length) {
      list.innerHTML = `<li class="text-muted small px-2">No new notifications</li>`;
      badge.style.display = "none";
      return;
    }
    badge.textContent = unreadCount;
    badge.style.display = unreadCount > 0 ? "inline-block" : "none";
    list.innerHTML = notifications.map((n, i) => `
      <li class="dropdown-item ${n.read ? "text-muted" : ""}">
        <div><strong class="${n.read ? "fw-normal" : "fw-bold"}">${n.text}</strong></div>
        <small class="text-muted">${n.time}</small>
      </li>
      ${i < notifications.length - 1 ? '<li><hr class="dropdown-divider"></li>' : ''}
    `).join("");
  }

  document.getElementById("notifyDropdown").addEventListener("click", () => {
    notifications.forEach(n => n.read = true);
    renderNotifications();
  });

  // Sidebar section switching
  $$('[data-section]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const target = btn.getAttribute('data-section');
      ['appointments','patients','profile'].forEach(id => document.getElementById('section-' + id).style.display = 'none');
      document.getElementById('section-' + target).style.display = 'block';
      $$('[data-section]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Seed data
  function seedAppointments() {
    const now = new Date();
    const addH = (h) => new Date(now.getTime() + h * 3600_000).toISOString();
    return [
      { id: 'A1001', patient: 'Juan Dela Cruz', status: 'pending', date: addH(2) },
      { id: 'A1002', patient: 'Maria Santos', status: 'upcoming', date: addH(26) },
      { id: 'A1003', patient: 'Carlos Reyes', status: 'past', date: addH(-120) }
    ];
  }
  function seedPatients() {
    return [
      { id: 'P001', name: 'Juan Dela Cruz', dob: '1990-03-14', phone: '+639111234567', notes: 'Diabetic Type II', reports: ['Blood Test.pdf'], history: [{ date: new Date().toISOString(), note: 'Routine checkup' }], consultations: [{ date: new Date().toISOString(), notes: 'Stable', prescription: 'Metformin 500mg' }] },
      { id: 'P002', name: 'Maria Santos', dob: '1985-11-22', phone: '+639222345678', notes: 'Hypertension', reports: ['BP Log.xlsx'], history: [{ date: new Date(Date.now()-86400_000).toISOString(), note: 'Elevated BP' }], consultations: [{ date: new Date(Date.now()-86400_000).toISOString(), notes: 'Lifestyle advice', prescription: 'Amlodipine 5mg' }] }
    ];
  }

  // Appointments
  let appointments = load(STORAGE.appointments, seedAppointments());
  // Normalize: send any pending appointments straight to upcoming
  if (appointments.some(a => a.status === 'pending')) {
    appointments = appointments.map(a => a.status === 'pending' ? { ...a, status: 'upcoming' } : a);
    save(STORAGE.appointments, appointments);
  }
  function formatDate(dateStr) { const d = new Date(dateStr); return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }); }

  function renderAppointments() {
    const sections = { upcoming: 'appointments-upcoming', past: 'appointments-past' };
    Object.keys(sections).forEach(status => {
      const container = document.getElementById(sections[status]);
      const filtered = appointments.filter(a => a.status === status || (status==='past' && a.status==='done'));
      if (!filtered.length) {
        container.innerHTML = `<div class="text-muted p-2">No ${status} appointments</div>`;
        return;
      }
      container.innerHTML = filtered.map(a => `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div>
            <span class="badge-status ${a.status}"></span>
            <strong class="text-primary" style="cursor:pointer" data-view-record="${a.patient}">${a.patient}</strong><br>
            <small class="text-muted">${formatDate(a.date)}</small>
          </div>
          ${a.status === 'upcoming' ? `
            <div class="d-flex gap-2">
              <a href="video.php?id=${a.id}" class="btn btn-primary">Join</a>
              <button class="btn btn-success" data-mark-done="${a.id}">Mark as Done</button>
            </div>
          ` : `<button class="btn btn-outline-secondary btn-sm" data-view-record="${a.patient}">View</button>`}
        </div>
      `).join('');
    });

    // Bind actions
    $$('[data-mark-done]').forEach(b => b.addEventListener('click', () => markCompleted(b.getAttribute('data-mark-done'))));
    $$('[data-view-record]').forEach(b => b.addEventListener('click', () => viewPatientRecord(b.getAttribute('data-view-record'))));
  }

  function setStatus(id, status) {
    const appt = appointments.find(a => a.id === id);
    if (!appt) return;
    appt.status = status;
    save(STORAGE.appointments, appointments);
    renderAppointments();
  }
  function markCompleted(id) { setStatus(id, 'past'); }

  // Reminders for upcoming within 24h
  function checkReminders() {
    const dismissed = load(STORAGE.remindersDismissed, []);
    const now = Date.now();
    const soon = 24 * 3600 * 1000;
    appointments.filter(a => a.status==='upcoming').forEach(a => {
      const t = new Date(a.date).getTime();
      if (t>now && t-now<soon && !dismissed.includes(a.id)) {
        toast(`Upcoming: ${a.patient} at ${new Date(a.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`, {
          actionText: 'Dismiss', onAction: () => {
            dismissed.push(a.id); save(STORAGE.remindersDismissed, dismissed);
          }
        });
      }
    });
  }

  // Patients
  let patients = load(STORAGE.patients, seedPatients());
  function renderPatients(list = patients) {
    const container = document.getElementById('patients-list');
    if (!container) return;
    container.innerHTML = list.map(p => `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        <div>
          <strong>${p.name}</strong> <span class="text-muted">(${p.id})</span><br>
          <small class="text-muted">DOB: ${p.dob} • ${p.phone}</small>
        </div>
        <button class="btn btn-sm btn-primary" data-view-record="${p.name}">View Records</button>
      </div>
    `).join('');
    $$('[data-view-record]').forEach(b => b.addEventListener('click', () => viewPatientRecord(b.getAttribute('data-view-record'))));
  }

  $('#patient-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = patients.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    renderPatients(filtered);
  });

  function viewPatientRecord(name) {
    const p = patients.find(x => x.name === name);
    if (!p) return;
    const el = document.getElementById('patient-records');
    el.innerHTML = `
      <h5>${p.name} <small class="text-muted">(${p.id})</small></h5>
      <p><strong>DOB:</strong> ${p.dob}<br><strong>Phone:</strong> ${p.phone}<br><strong>Notes:</strong> ${p.notes}</p>
      <h6>Reports:</h6><ul>${p.reports.map(r => `<li><a href="#" download>${r}</a></li>`).join('')}</ul>
      <h6 class="mt-3">Consultations</h6>
      <ul class="list-group">${(p.consultations||[]).map(c => `<li class="list-group-item">
        <div><strong>${new Date(c.date).toLocaleDateString()}</strong></div>
        <div class="text-muted">${c.notes}</div>
        <div><strong>Prescription:</strong> ${c.prescription || '—'}</div>
      </li>`).join('')}</ul>
    `;
    new bootstrap.Modal(document.getElementById('patientModal')).show();
  }

  // Profile persistence and licenses
  function loadProfile() {
    const p = load(STORAGE.profile, null);
    if (!p) return;
    $('#profile-name').value = p.name || '';
    $('#profile-specialty').value = p.specialty || '';
    $('#profile-contact').value = p.contact || '';
    $('#profile-email').value = p.email || '';
    $('#profile-about').value = p.about || '';
    $('#doc-name').textContent = p.name || 'Doctor';
    $('#doc-specialty').textContent = p.specialty || '';
    const avatar = p.avatarDataUrl || 'https://via.placeholder.com/56x56.png?text=Dr';
    const img = document.getElementById('avatar');
    if (img) img.src = avatar;
  }

  function renderLicenses() {
    const list = $('#license-list');
    const files = load(STORAGE.licenses, []);
    list.innerHTML = files.length ? '' : '<li class="list-group-item text-muted">No files uploaded</li>';
    files.forEach(f => {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
      li.dataset.id = f.id;
      li.innerHTML = `<div>
        <div>${f.name}</div>
        <div class="file-meta">${(f.size/1024).toFixed(1)} KB • ${f.type||'file'}</div>
      </div>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-primary" data-download>Download</button>
        <button class="btn btn-sm btn-outline-danger" data-delete>Delete</button>
      </div>`;
      li.querySelector('[data-download]').addEventListener('click', () => downloadDataUrl(f.dataUrl, f.name));
      li.querySelector('[data-delete]').addEventListener('click', () => {
        const arr = load(STORAGE.licenses, []);
        save(STORAGE.licenses, arr.filter(x => x.id !== f.id));
        renderLicenses();
      });
      list.appendChild(li);
    });
  }

  function fileToDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
  function downloadDataUrl(dataUrl, filename) { const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click(); }

  $('#license-upload').addEventListener('click', async () => {
    const input = $('#profile-license');
    const files = Array.from(input.files || []);
    if (!files.length) { toast('Select files to upload'); return; }
    const arr = load(STORAGE.licenses, []);
    for (const f of files) {
      const dataUrl = await fileToDataURL(f);
      arr.push({ id: crypto.randomUUID(), name: f.name, size: f.size, type: f.type, dataUrl });
    }
    save(STORAGE.licenses, arr);
    input.value = '';
    renderLicenses();
    toast('Uploaded');
  });

  document.getElementById('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const profile = {
      name: $('#profile-name').value.trim(),
      specialty: $('#profile-specialty').value.trim(),
      contact: $('#profile-contact').value.trim(),
      email: $('#profile-email').value.trim(),
      about: $('#profile-about').value.trim()
    };
    save(STORAGE.profile, profile);
    $('#doc-name').textContent = profile.name || 'Doctor';
    $('#doc-specialty').textContent = profile.specialty || '';
    toast('Profile updated');
  });

  document.getElementById('profile-reset').addEventListener('click', () => {
    localStorage.removeItem(STORAGE.profile);
    loadProfile();
    toast('Profile reset');
  });

  // Toast
  function toast(message, opts = {}) {
    let host = document.querySelector('.toast-container');
    if (!host) { host = document.createElement('div'); host.className = 'toast-container'; document.body.appendChild(host); }
    const note = document.createElement('div');
    note.className = 'toast align-items-center show';
    note.setAttribute('role','alert');
    note.innerHTML = `<div class="d-flex">
      <div class="toast-body">${message}</div>
      ${opts.actionText ? `<button type="button" class="btn btn-link me-2 ms-auto">${opts.actionText}</button>` : ''}
    </div>`;
    host.appendChild(note);
    if (opts.actionText && opts.onAction) {
      note.querySelector('button').addEventListener('click', () => { opts.onAction(); note.remove(); });
    }
    const t = opts.timeout ?? 2000;
    if (t) setTimeout(() => note.remove(), t);
  }

  // Init
  function init() {
    renderNotifications();
    loadProfile();
    renderLicenses();
    renderPatients();
    renderAppointments();
    checkReminders();
    setInterval(checkReminders, 60*1000);
  }
  init();
})();

