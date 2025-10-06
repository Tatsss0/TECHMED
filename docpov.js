(function(){
  const state = { user: null, profile: null };

  function qs(id){ return document.getElementById(id); }
  function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }
  function fmt(ts){ if (!ts) return ''; const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString(); }

  function guardAuth(){
    auth.onAuthStateChanged(async (user)=>{
      if (!user) { window.location.href = './login.html'; return; }
      state.user = user;
      qs('headerName').textContent = user.displayName || user.email;
      await loadProfile(user.uid);
      wireNav();
      loadAppointments();
      loadPatients();
    });
  }

  async function loadProfile(uid){
    const snap = await db.collection('doctors').doc(uid).get();
    state.profile = snap.exists ? snap.data() : null;
    const p = state.profile || {};
    qs('doc-name').textContent = p.fullName ? (p.fullName.startsWith('Dr.')? p.fullName : 'Dr. ' + p.fullName) : (state.user.displayName || 'Doctor');
    qs('doc-specialty').textContent = p.specialty || 'Specialty';
    const initials = (p.fullName || 'Dr').split(' ').map(s=>s[0]).join('').substring(0,2).toUpperCase();
    qs('avatar').textContent = initials;

    // Fill form
    qs('profile-name').value = p.fullName || '';
    qs('profile-specialty').value = p.specialty || '';
    qs('profile-contact').value = p.phone || '';
    qs('profile-email').value = state.user.email || '';
    qs('profile-about').value = p.about || '';
  }

  async function saveProfile(e){
    e.preventDefault();
    const updates = {
      fullName: qs('profile-name').value.trim(),
      specialty: qs('profile-specialty').value.trim(),
      phone: qs('profile-contact').value.trim(),
      about: qs('profile-about').value.trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const uid = state.user.uid;
    await db.collection('doctors').doc(uid).set({ uid, email: state.user.email, role: 'doctor', ...updates }, { merge: true });
    await loadProfile(uid);
    toast('Profile saved');
  }

  function resetProfile(){ loadProfile(state.user.uid); }

  function wireNav(){
    document.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', ()=> showSection(btn.getAttribute('data-section')));
    });
    document.querySelectorAll('#navmenu a.nav-link').forEach(a => {
      a.addEventListener('click', (e)=>{ e.preventDefault(); showSection(a.getAttribute('data-section')); document.querySelectorAll('#navmenu a').forEach(x=>x.classList.remove('active')); a.classList.add('active'); });
    });
    qs('profile-form').addEventListener('submit', saveProfile);
    qs('profile-reset').addEventListener('click', resetProfile);
    qs('logoutBtn').addEventListener('click', async ()=>{ await auth.signOut(); window.location.href='./login.html'; });
  }

  function showSection(id){
    ['appointments','patients','profile'].forEach(sec=>{
      qs('section-' + sec).style.display = (sec===id) ? '' : 'none';
    });
    document.querySelectorAll('[data-section]').forEach(b=> b.classList.toggle('active', b.getAttribute('data-section')===id));
  }

  function toast(msg){
    const t = el(`<div class="toast align-items-center text-bg-dark border-0" role="alert" aria-live="assertive" aria-atomic="true" style="position:fixed;bottom:20px;right:20px;z-index:1080"><div class="d-flex"><div class="toast-body">${msg}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div></div>`);
    document.body.appendChild(t);
    const bsToast = new bootstrap.Toast(t, { delay: 2000 });
    bsToast.show();
    t.addEventListener('hidden.bs.toast', ()=> t.remove());
  }

  async function loadAppointments(){
    const uid = state.user.uid;
    const now = new Date();
    const listUpcoming = qs('appointments-upcoming');
    const listPast = qs('appointments-past');
    listUpcoming.innerHTML = '<div class="text-muted small px-2">Loading…</div>';
    listPast.innerHTML = '';

    const snap = await db.collection('appointments').where('doctorId','==',uid).orderBy('startAt','asc').get().catch(()=>null);
    listUpcoming.innerHTML=''; listPast.innerHTML='';
    if (!snap || snap.empty) {
      listUpcoming.innerHTML = '<div class="list-group-item">No upcoming appointments</div>';
      return;
    }
    snap.forEach(doc => {
      const a = doc.data();
      const when = a.startAt && a.startAt.toDate ? a.startAt.toDate() : (a.startAt ? new Date(a.startAt) : null);
      const isPast = when ? when < now : false;
      const roomLink = a.roomId ? `./index.html?room=${encodeURIComponent(a.roomId)}` : './index.html';
      const item = el(`<div class="list-group-item d-flex justify-content-between align-items-center appt-card">
        <div>
          <div class="fw-semibold">${a.patientName || 'Patient'}</div>
          <div class="text-muted small">${fmt(a.startAt)} • ${a.reason || ''}</div>
        </div>
        <div class="d-flex gap-2">
          <a href="${roomLink}" class="btn btn-sm btn-primary">${a.roomId ? 'Join call' : 'Open meeting'}</a>
        </div>
      </div>`);
      (isPast ? listPast : listUpcoming).appendChild(item);
    });
    if (!listPast.children.length) listPast.innerHTML = '<div class="list-group-item">No past appointments</div>';
  }

  async function loadPatients(){
    const uid = state.user.uid;
    const list = qs('patients-list');
    list.innerHTML = '<div class="text-muted small px-2">Loading…</div>';
    const snap = await db.collection('patients').where('doctorId','==',uid).limit(25).get().catch(()=>null);
    list.innerHTML = '';
    if (!snap || snap.empty) { list.innerHTML = '<div class="list-group-item">No patients yet</div>'; return; }
    snap.forEach(doc => {
      const p = doc.data();
      list.appendChild(el(`<div class="list-group-item d-flex justify-content-between align-items-center">
        <div>
          <div class="fw-semibold">${p.fullName || 'Patient'}</div>
          <div class="text-muted small">${p.email || ''}</div>
        </div>
        <a class="btn btn-sm btn-outline-primary" href="#">View</a>
      </div>`));
    });
  }

  // start
  guardAuth();
})();
