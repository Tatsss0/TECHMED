(function(){
  const $ = (s) => document.querySelector(s);
  const FieldValue = firebase.firestore.FieldValue;
  const PLACEHOLDER = 'https://via.placeholder.com/96x96.png?text=Dr';
  let currentUser;

  function toast(message, type = 'dark') {
    const host = document.querySelector('.toast-container');
    const el = document.createElement('div');
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.setAttribute('role','alert');
    el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div>`;
    host.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 2000 });
    t.show();
    el.addEventListener('hidden.bs.toast', ()=> el.remove());
  }

  function guardAuth(){
    auth.onAuthStateChanged(async (user)=>{
      if (!user) { window.location.href = './login.html'; return; }
      currentUser = user;
      await loadProfile();
      bindEvents();
      await loadLicenses();
      $('#logoutBtn')?.addEventListener('click', async ()=>{ await auth.signOut(); window.location.href = './login.html'; });
    });
  }

  async function loadProfile(){
    const uid = currentUser.uid;
    const snap = await db.collection('doctors').doc(uid).get();
    const p = snap.exists ? snap.data() : {};
    $('#profile-name').value = p.fullName || (currentUser.displayName || '').replace(/^Dr\.\s*/,'');
    $('#profile-specialty').value = p.specialty || '';
    $('#profile-contact').value = p.phone || '';
    $('#profile-email').value = currentUser.email || '';
    $('#profile-about').value = p.about || '';
    $('#avatar-preview').src = p.avatarUrl || PLACEHOLDER;
  }

  function bindEvents(){
    $('#btn-avatar-change').addEventListener('click', ()=> $('#profile-avatar').click());
    $('#profile-avatar').addEventListener('change', uploadAvatar);
    $('#btn-avatar-remove').addEventListener('click', removeAvatar);
    $('#license-upload').addEventListener('click', uploadLicenses);
    $('#profile-form').addEventListener('submit', saveProfile);
    $('#profile-reset').addEventListener('click', (e)=>{ e.preventDefault(); loadProfile(); });
  }

  async function saveProfile(e){
    e.preventDefault();
    const uid = currentUser.uid;
    const fullName = $('#profile-name').value.trim();
    const specialty = $('#profile-specialty').value.trim();
    const phone = $('#profile-contact').value.trim();
    const about = $('#profile-about').value.trim();
    const newEmail = $('#profile-email').value.trim();

    try {
      // Update Auth profile (name)
      const displayName = fullName ? (fullName.match(/^Dr\./i) ? fullName : `Dr. ${fullName}`) : currentUser.displayName;
      if (displayName && displayName !== currentUser.displayName) {
        await currentUser.updateProfile({ displayName });
      }
      // Update Auth email if changed (may require re-auth)
      if (newEmail && newEmail !== currentUser.email) {
        await currentUser.updateEmail(newEmail);
      }

      await db.collection('doctors').doc(uid).set({
        uid,
        email: newEmail || currentUser.email,
        fullName: fullName,
        role: 'doctor',
        specialty,
        phone,
        about,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      toast('Profile saved');
      await loadProfile();
    } catch (err) {
      console.error(err);
      const msg = (err && err.code === 'auth/requires-recent-login') ? 'Please log out and log in again to change email' : (err.message || 'Failed to save');
      toast(msg, 'danger');
    }
  }

  async function uploadAvatar(){
    const fileEl = $('#profile-avatar');
    const file = fileEl.files && fileEl.files[0];
    if (!file) return;
    const uid = currentUser.uid;
    const path = `doctors/${uid}/avatar.jpg`;
    try {
      const ref = firebase.storage().ref().child(path);
      await ref.put(file, { contentType: file.type });
      const url = await ref.getDownloadURL();
      await db.collection('doctors').doc(uid).set({ avatarUrl: url, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      $('#avatar-preview').src = url;
      fileEl.value = '';
      toast('Avatar updated');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Failed to upload avatar', 'danger');
    }
  }

  async function removeAvatar(){
    const uid = currentUser.uid;
    const path = `doctors/${uid}/avatar.jpg`;
    try {
      await firebase.storage().ref().child(path).delete().catch(()=>{});
      await db.collection('doctors').doc(uid).set({ avatarUrl: '', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      $('#avatar-preview').src = PLACEHOLDER;
      toast('Avatar removed');
    } catch (err) {
      console.error(err);
      toast(err.message || 'Failed to remove avatar', 'danger');
    }
  }

  async function uploadLicenses(){
    const input = $('#profile-license');
    const files = Array.from(input.files || []);
    if (!files.length) { toast('Select files to upload','info'); return; }
    const uid = currentUser.uid;
    for (const file of files) {
      try {
        const licRef = db.collection('doctors').doc(uid).collection('licenses').doc();
        const storagePath = `doctors/${uid}/licenses/${licRef.id}_${file.name}`;
        const sref = firebase.storage().ref().child(storagePath);
        await sref.put(file, { contentType: file.type });
        const url = await sref.getDownloadURL();
        await licRef.set({
          id: licRef.id,
          name: file.name,
          size: file.size,
          contentType: file.type || null,
          url,
          path: storagePath,
          uploadedAt: FieldValue.serverTimestamp()
        });
      } catch (err) {
        console.error(err);
        toast(`Failed to upload ${file.name}`, 'danger');
      }
    }
    input.value = '';
    await loadLicenses();
    toast('Upload complete');
  }

  async function loadLicenses(){
    const uid = currentUser.uid;
    const list = $('#license-list');
    list.innerHTML = '<li class="list-group-item text-muted">Loading…</li>';
    try {
      const snap = await db.collection('doctors').doc(uid).collection('licenses').orderBy('uploadedAt','desc').get();
      if (snap.empty) { list.innerHTML = '<li class="list-group-item text-muted">No files uploaded</li>'; return; }
      list.innerHTML = '';
      snap.forEach(doc => {
        const f = doc.data();
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `
          <div>
            <div>${f.name}</div>
            <div class="file-meta">${(f.size/1024).toFixed(1)} KB • ${f.contentType || 'file'}</div>
          </div>
          <div class="d-flex gap-2">
            <a class="btn btn-sm btn-outline-primary" href="${f.url}" target="_blank" rel="noopener">Download</a>
            <button class="btn btn-sm btn-outline-danger" data-del="${f.id}">Delete</button>
          </div>`;
        li.querySelector('[data-del]')?.addEventListener('click', ()=> deleteLicense(f.id, f.path));
        list.appendChild(li);
      });
    } catch (err) {
      console.error(err);
      list.innerHTML = '<li class="list-group-item text-danger">Failed to load licenses</li>';
    }
  }

  async function deleteLicense(id, path){
    const uid = currentUser.uid;
    try {
      await firebase.storage().ref().child(path).delete().catch(()=>{});
      await db.collection('doctors').doc(uid).collection('licenses').doc(id).delete();
      await loadLicenses();
      toast('Deleted');
    } catch (err) {
      console.error(err);
      toast('Failed to delete','danger');
    }
  }

  // start
  guardAuth();
})();
