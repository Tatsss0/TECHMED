(function(){
  'use strict';

  if (!window.firebase || !firebase.apps?.length) return;

  window.auth = firebase.auth();
  window.db = firebase.firestore();

  const state = { user: null, profile: null, unsubApptsA: null, unsubApptsB: null, apptA: new Map(), apptB: new Map() };

  function qs(id){ return document.getElementById(id); }
  function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }
  function fmt(ts){ if (!ts) return ''; const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString(); }
  function withDrPrefix(name){ if (!name) return ''; const n = name.trim(); return n.toLowerCase().startsWith('dr.') ? n : `Dr. ${n}`; }

  function toast(msg){
    const t = el(`<div class="toast align-items-center text-bg-dark border-0" role="alert" aria-live="assertive" aria-atomic="true" style="position:fixed;bottom:20px;right:20px;z-index:1080"><div class="d-flex"><div class="toast-body">${msg}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button></div></div>`);
    document.body.appendChild(t);
    const bsToast = new bootstrap.Toast(t, { delay: 2000 });
    bsToast.show();
    t.addEventListener('hidden.bs.toast', ()=> t.remove());
  }

  function showSection(id){
    ['appointments','patients','profile'].forEach(sec=>{
      const el = qs('section-' + sec);
      if (el) el.style.display = (sec===id) ? '' : 'none';
    });
    document.querySelectorAll('[data-section]').forEach(b=> b.classList.toggle('active', b.getAttribute('data-section')===id));
  }

  function wireNav(){
    document.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', ()=> showSection(btn.getAttribute('data-section')));
    });
    document.querySelectorAll('#navmenu a.nav-link').forEach(a => {
      a.addEventListener('click', (e)=>{ e.preventDefault(); showSection(a.getAttribute('data-section')); document.querySelectorAll('#navmenu a').forEach(x=>x.classList.remove('active')); a.classList.add('active'); });
    });

    // Profile form guards
    const form = qs('profile-form');
    if (form) {
      form.addEventListener('submit', saveProfile);
    }
    const resetBtn = qs('profile-reset');
    if (resetBtn) resetBtn.addEventListener('click', resetProfile);

    const logoutBtn = qs('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', async ()=>{ await auth.signOut(); window.location.href='./doclogin.php'; });
  }

  function guardAuth(){
    auth.onAuthStateChanged(async (user)=>{
      if (!user) { window.location.href = './doclogin.php'; return; }
      try {
        const [userDoc, doctorDoc] = await Promise.all([
          db.collection('users').doc(user.uid).get(),
          db.collection('doctors').doc(user.uid).get()
        ]);
        const role = userDoc.exists ? userDoc.data().role : null;
        const isDoctor = role === 'doctor' || doctorDoc.exists;
        if (!isDoctor) {
          await auth.signOut().catch(()=>{});
          window.location.href = './doclogin.php';
          return;
        }
      } catch {
        await auth.signOut().catch(()=>{});
        window.location.href = './doclogin.php';
        return;
      }

      state.user = user;
      if (qs('headerName')) qs('headerName').textContent = user.displayName || user.email;

      await loadProfile(user.uid);
      wireNav();
      subscribeAppointments();
      loadPatients();
    });
  }

  async function loadProfile(uid){
    const snap = await db.collection('doctors').doc(uid).get();
    state.profile = snap.exists ? snap.data() : null;
    const p = state.profile || {};
    const displayName = withDrPrefix(p.fullName) || (state.user.displayName || 'Doctor');

    if (qs('doc-name')) qs('doc-name').textContent = displayName;
    if (qs('doc-specialty')) qs('doc-specialty').textContent = p.specialty || 'Specialty';
    if (qs('avatar')) {
      const initials = (p.fullName || 'Dr').split(' ').map(s=>s[0]).join('').substring(0,2).toUpperCase();
      qs('avatar').textContent = initials;
    }

    // Optional profile form fields
    const pfName = qs('profile-name'); if (pfName) pfName.value = p.fullName || '';
    const pfSpec = qs('profile-specialty'); if (pfSpec) pfSpec.value = p.specialty || '';
    const pfContact = qs('profile-contact'); if (pfContact) pfContact.value = p.phone || '';
    const pfEmail = qs('profile-email'); if (pfEmail) { pfEmail.value = state.user.email || ''; pfEmail.disabled = true; }
    const pfAbout = qs('profile-about'); if (pfAbout) pfAbout.value = p.about || '';

    await ensurePublicProfile(uid, p, displayName);
  }

  async function ensurePublicProfile(uid, p, displayName){
    try {
      const publicRef = db.collection('public_doctors').doc(uid);
      const pubSnap = await publicRef.get();
      if (!pubSnap.exists) {
        await publicRef.set({
          uid: uid,
          name: displayName || withDrPrefix(p.fullName) || 'Doctor',
          specialty: p.specialty || '',
          image: p.avatarUrl || 'assets/img/health/doctor-placeholder.webp',
          bio: p.about || '',
          schedule: Array.isArray(p.schedule) ? p.schedule : [],
          reviewsCount: 0,
          isListed: true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (err) {
      console.error('ensurePublicProfile failed', err);
    }
  }

  async function saveProfile(e){
    e.preventDefault();
    const updates = {
      fullName: (qs('profile-name')?.value || '').trim(),
      specialty: (qs('profile-specialty')?.value || '').trim(),
      phone: (qs('profile-contact')?.value || '').trim(),
      about: (qs('profile-about')?.value || '').trim(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    const uid = state.user.uid;

    await db.collection('doctors').doc(uid).set(
      { uid, email: state.user.email, role: 'doctor', ...updates },
      { merge: true }
    );

    await syncPublicProfile(uid, updates);
    await loadProfile(uid);
    toast('Profile saved');
  }

  async function syncPublicProfile(uid, updates){
    try {
      const publicRef = db.collection('public_doctors').doc(uid);
      const prevSnap = await publicRef.get();
      const prev = prevSnap.exists ? prevSnap.data() : {};
      const displayName =
        withDrPrefix(updates.fullName) ||
        withDrPrefix(state.profile?.fullName) ||
        (state.user.displayName || 'Doctor');

      await publicRef.set({
        uid: uid,
        name: displayName,
        specialty: updates.specialty || prev.specialty || '',
        image: prev.image || 'assets/img/health/doctor-placeholder.webp',
        bio: updates.about || prev.bio || '',
        schedule: Array.isArray(prev.schedule) ? prev.schedule : [],
        reviewsCount: typeof prev.reviewsCount === 'number' ? prev.reviewsCount : 0,
        isListed: typeof prev.isListed === 'boolean' ? prev.isListed : true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (err) {
      console.error('syncPublicProfile failed', err);
    }
  }

  function renderApptItem(a){
    const whenText = fmt(a.startAt);
    const roomLink = a.roomId ? `./index.html?room=${encodeURIComponent(a.roomId)}` : './index.html';
    return el(`<div class="list-group-item d-flex justify-content-between align-items-center appt-card">
      <div>
        <div class="fw-semibold">${a.patientName || 'Patient'}</div>
        <div class="text-muted small">${whenText} • ${a.reason || ''}</div>
      </div>
      <div class="d-flex gap-2">
        <a href="${roomLink}" class="btn btn-sm btn-primary">${a.roomId ? 'Join call' : 'Open meeting'}</a>
      </div>
    </div>`);
  }

  function updateNotify(items){
    const list = document.getElementById('notify-list');
    const badge = document.getElementById('notify-count');
    if (!list || !badge) return;
    list.innerHTML = '';
    const now = Date.now();
    const upcoming = items.filter(a => {
      const t = a.startAt && a.startAt.toDate ? a.startAt.toDate().getTime() : 0;
      return t && t > now && (t - now) < 1000 * 60 * 60 * 24; // within 24h
    });
    const unread = upcoming.length;
    if (unread > 0) {
      badge.style.display = '';
      badge.textContent = String(unread);
    } else {
      badge.style.display = 'none';
      badge.textContent = '0';
    }
    if (upcoming.length === 0) {
      list.innerHTML = '<li class="text-muted small px-2">No new notifications</li>';
      return;
    }
    upcoming.slice(0, 10).forEach(a => {
      const li = el(`<li class="dropdown-item d-flex flex-column">
        <div><strong>${a.patientName || 'Patient'}</strong></div>
        <small class="text-muted">${fmt(a.startAt)}</small>
      </li>`);
      list.appendChild(li);
    });
  }

  function renderAppointmentsMerged(){
    const listUpcoming = qs('appointments-upcoming');
    const listPast = qs('appointments-past');
    if (!listUpcoming || !listPast) return;
    listUpcoming.innerHTML = '';
    listPast.innerHTML = '';
    const merged = new Map();
    if (state.apptA) state.apptA.forEach((v, k) => merged.set(k, v));
    if (state.apptB) state.apptB.forEach((v, k) => merged.set(k, v));
    if (merged.size === 0) {
      listUpcoming.innerHTML = '<div class="list-group-item">No upcoming appointments</div>';
      updateNotify([]);
      return;
    }
    const items = Array.from(merged.values()).sort((x, y) => {
      const xt = x.startAt && x.startAt.toDate ? x.startAt.toDate().getTime() : 0;
      const yt = y.startAt && y.startAt.toDate ? y.startAt.toDate().getTime() : 0;
      return xt - yt;
    });
    const now = Date.now();
    items.forEach(a => {
      const t = a.startAt && a.startAt.toDate ? a.startAt.toDate().getTime() : 0;
      const isPast = t ? t < now : false;
      (isPast ? listPast : listUpcoming).appendChild(renderApptItem(a));
    });
    updateNotify(items);
  }

  function subscribeAppointments(){
    const uid = state.user.uid;
    const listUpcoming = qs('appointments-upcoming');
    if (listUpcoming) listUpcoming.innerHTML = '<div class="text-muted small px-2">Loading…</div>';

    // Tear down previous listeners
    if (state.unsubApptsA) { state.unsubApptsA(); state.unsubApptsA = null; }
    if (state.unsubApptsB) { state.unsubApptsB(); state.unsubApptsB = null; }
    if (state.apptA) state.apptA.clear();
    if (state.apptB) state.apptB.clear();

    // Primary stream: doctorId == uid (new writes)
    state.unsubApptsA = db.collection('appointments')
      .where('doctorId','==',uid)
      .orderBy('startAt','asc')
      .onSnapshot((snap)=>{
        if (state.apptA) state.apptA.clear();
        if (snap && !snap.empty) snap.forEach(doc => state.apptA.set(doc.id, doc.data()));
        renderAppointmentsMerged();
      }, (err)=>{
        if (listUpcoming) listUpcoming.innerHTML = `<div class="text-danger small px-2">${err?.message || 'Failed to load appointments'}</div>`;
      });

    // Secondary stream: legacy field doctorUid == uid (if present)
    state.unsubApptsB = db.collection('appointments')
      .where('doctorUid','==',uid)
      .orderBy('startAt','asc')
      .onSnapshot((snap)=>{
        if (state.apptB) state.apptB.clear();
        if (snap && !snap.empty) snap.forEach(doc => state.apptB.set(doc.id, doc.data()));
        renderAppointmentsMerged();
      }, ()=>{});
  }

  async function loadPatients(){
    const uid = state.user.uid;
    const list = qs('patients-list');
    if (list) list.innerHTML = '<div class="text-muted small px-2">Loading…</div>';
    const snap = await db.collection('patients').where('doctorId','==',uid).limit(25).get().catch(()=>null);
    if (!list) return;
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

  // Start
  guardAuth();
})();
