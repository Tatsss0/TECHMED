(function(){
  const $ = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
  const FieldValue = firebase.firestore.FieldValue;
  let currentUser;
  let unsubscribePatients = null;
  let latestPatients = [];

  function toast(message, type='dark'){
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
      $('#logoutBtn')?.addEventListener('click', async ()=>{ await auth.signOut(); window.location.href='./login.html'; });
      wire();
      listenPatients();
    });
  }

  function wire(){
    $('#patient-search').addEventListener('input', (e)=> renderPatients(filterPatients(e.target.value)));
    $('#addConsultBtn').addEventListener('click', ()=>{
      $('#consultForm').reset();
      $('#cDate').value = new Date(Date.now() - (new Date()).getTimezoneOffset()*60000).toISOString().slice(0,16);
      new bootstrap.Modal($('#addConsultModal')).show();
    });
    $('#consultForm').addEventListener('submit', saveConsultation);
  }

  function filterPatients(query){
    const q = (query || '').toLowerCase();
    if (!q) return latestPatients;
    return latestPatients.filter(p =>
      (p.fullName||'').toLowerCase().includes(q) ||
      (p.email||'').toLowerCase().includes(q) ||
      (p.phone||'').toLowerCase().includes(q)
    );
  }

  function renderPatients(list){
    const container = $('#patients-list');
    if (!list || !list.length) { container.innerHTML = '<div class="list-group-item">No patients yet</div>'; return; }
    container.innerHTML = list.map(p => `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        <div>
          <strong>${p.fullName || 'Patient'}</strong> <span class="text-muted">${p.email ? '('+p.email+')' : ''}</span><br>
          <small class="text-muted">${p.phone || ''}</small>
        </div>
        <button class="btn btn-sm btn-primary" data-view="${p.id}">View Records</button>
      </div>
    `).join('');
    $$('[data-view]').forEach(btn => btn.addEventListener('click', ()=> openPatient(btn.getAttribute('data-view'))));
  }

  function listenPatients(){
    if (unsubscribePatients) unsubscribePatients();
    // Build a doctor-centric view: patients seen by this doctor
    unsubscribePatients = db.collection('patients')
      .where('doctorIds', 'array-contains', currentUser.uid)
      .orderBy('fullName','asc')
      .onSnapshot((snap)=>{
        latestPatients = [];
        snap.forEach(doc=> latestPatients.push({ id: doc.id, ...doc.data() }));
        renderPatients(latestPatients);
      }, (err)=>{
        console.error(err);
        $('#patients-list').innerHTML = '<div class="list-group-item text-danger">Failed to load patients</div>';
      });
  }

  async function saveConsultation(e){
    e.preventDefault();
    const name = $('#cName').value.trim();
    const email = $('#cEmail').value.trim();
    const phone = $('#cPhone').value.trim();
    const dateVal = $('#cDate').value;
    const notes = $('#cNotes').value.trim();
    const prescription = $('#cRx').value.trim();
    if (!name) { toast('Patient name is required','danger'); return; }

    try {
      // Upsert patient by email if provided, else by name (not ideal, but fallback)
      let patientRef;
      if (email) {
        const snap = await db.collection('patients').where('email','==',email).limit(1).get();
        if (!snap.empty) patientRef = snap.docs[0].ref;
      }
      patientRef = patientRef || db.collection('patients').doc();

      await patientRef.set({
        id: patientRef.id,
        fullName: name,
        email: email || null,
        phone: phone || null,
        doctorIds: FieldValue.arrayUnion(currentUser.uid),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp()
      }, { merge: true });

      const consultRef = patientRef.collection('consultations').doc();
      await consultRef.set({
        id: consultRef.id,
        doctorId: currentUser.uid,
        date: dateVal ? new Date(dateVal) : new Date(),
        notes,
        prescription,
        createdAt: FieldValue.serverTimestamp()
      });

      toast('Consultation saved','success');
      bootstrap.Modal.getInstance($('#addConsultModal')).hide();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Failed to save', 'danger');
    }
  }

  async function openPatient(id){
    try {
      const ref = db.collection('patients').doc(id);
      const doc = await ref.get();
      if (!doc.exists) return;
      const p = doc.data();
      const cons = await ref.collection('consultations').orderBy('date','desc').get();
      const items = [];
      cons.forEach(d => items.push(d.data()));
      $('#patient-records').innerHTML = `
        <h5>${p.fullName} ${p.email ? '<small class="text-muted">('+p.email+')</small>' : ''}</h5>
        <p><strong>Phone:</strong> ${p.phone || '—'}</p>
        <h6 class="mt-3">Consultations</h6>
        <ul class="list-group">${items.map(c => `
          <li class="list-group-item">
            <div><strong>${(c.date && c.date.toDate ? c.date.toDate() : new Date(c.date)).toLocaleString()}</strong></div>
            <div class="text-muted">${c.notes || '—'}</div>
            <div><strong>Prescription:</strong> ${c.prescription || '—'}</div>
          </li>`).join('')}</ul>`;
      new bootstrap.Modal($('#patientModal')).show();
    } catch (err) {
      console.error(err);
      toast('Failed to load record','danger');
    }
  }

  // Security rules you need (add to Firestore rules):
  // match /patients/{pid} { allow read, write: if request.auth != null && request.auth.uid in resource.data.doctorIds; }
  // match /patients/{pid}/consultations/{cid} { allow read, write: if request.auth != null && request.auth.uid in get(/databases/$(database)/documents/patients/$(pid)).data.doctorIds; }

  // start
  guardAuth();
})();
