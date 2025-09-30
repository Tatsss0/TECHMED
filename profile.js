(function(){
  const STORAGE = {
    profile: 'techmed.doctor.profile',
    licenses: 'techmed.doctor.licenses'
  };
  const $ = (s, r=document) => r.querySelector(s);
  const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  function loadProfile() {
    const p = load(STORAGE.profile, null);
    if (!p) return;
    $('#profile-name').value = p.name || '';
    $('#profile-specialty').value = p.specialty || '';
    $('#profile-contact').value = p.contact || '';
    $('#profile-email').value = p.email || '';
    $('#profile-about').value = p.about || '';
  }

  function renderLicenses() {
    const list = document.getElementById('license-list');
    const files = load(STORAGE.licenses, []);
    list.innerHTML = files.length ? '' : '<li class="list-group-item text-muted">No files uploaded</li>';
    for (const f of files) {
      const li = document.createElement('li');
      li.className = 'list-group-item d-flex justify-content-between align-items-center';
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
    }
  }

  function fileToDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
  function downloadDataUrl(dataUrl, filename) { const a = document.createElement('a'); a.href = dataUrl; a.download = filename; a.click(); }

  document.getElementById('license-upload').addEventListener('click', async () => {
    const input = document.getElementById('profile-license');
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
      name: document.getElementById('profile-name').value.trim(),
      specialty: document.getElementById('profile-specialty').value.trim(),
      contact: document.getElementById('profile-contact').value.trim(),
      email: document.getElementById('profile-email').value.trim(),
      about: document.getElementById('profile-about').value.trim()
    };
    save(STORAGE.profile, profile);
    toast('Profile saved');
  });

  function toast(message) {
    let host = document.querySelector('.toast-container');
    if (!host) { host = document.createElement('div'); host.className = 'toast-container'; document.body.appendChild(host); }
    const note = document.createElement('div');
    note.className = 'toast align-items-center show';
    note.setAttribute('role','alert');
    note.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div></div>`;
    host.appendChild(note);
    setTimeout(() => note.remove(), 2000);
  }

  loadProfile();
  renderLicenses();
})();

