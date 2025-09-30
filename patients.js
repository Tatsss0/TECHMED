(function(){
  const STORAGE = {
    patients: 'techmed.patients'
  };
  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };

  function seedPatients() {
    return [
      { id: 'P001', name: 'Juan Dela Cruz', dob: '1990-03-14', phone: '+639111234567', notes: 'Diabetic Type II', reports: ['Blood Test.pdf'], history: [{ date: new Date().toISOString(), note: 'Routine checkup' }], consultations: [{ date: new Date().toISOString(), notes: 'Stable', prescription: 'Metformin 500mg' }] },
      { id: 'P002', name: 'Maria Santos', dob: '1985-11-22', phone: '+639222345678', notes: 'Hypertension', reports: ['BP Log.xlsx'], history: [{ date: new Date(Date.now()-86400_000).toISOString(), note: 'Elevated BP' }], consultations: [{ date: new Date(Date.now()-86400_000).toISOString(), notes: 'Lifestyle advice', prescription: 'Amlodipine 5mg' }] }
    ];
  }

  let patients = load(STORAGE.patients, seedPatients());

  function renderPatients(list = patients) {
    const container = document.getElementById('patients-list');
    container.innerHTML = list.map(p => `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        <div>
          <strong>${p.name}</strong> <span class="text-muted">(${p.id})</span><br>
          <small class="text-muted">DOB: ${p.dob} • ${p.phone}</small>
        </div>
        <button class="btn btn-sm btn-primary" data-view="${p.name}">View Records</button>
      </div>
    `).join('');
    $$('[data-view]').forEach(b => b.addEventListener('click', () => viewPatientRecord(b.getAttribute('data-view'))));
  }

  function viewPatientRecord(name) {
    const p = patients.find(x => x.name === name);
    if (!p) return;
    document.getElementById('patient-records').innerHTML = `
      <h5>${p.name} <small class="text-muted">(${p.id})</small></h5>
      <p><strong>DOB:</strong> ${p.dob}<br><strong>Phone:</strong> ${p.phone}<br><strong>Notes:</strong> ${p.notes}</p>
      <h6>Reports:</h6><ul>${p.reports.map(r => `<li><a href="#">${r}</a></li>`).join('')}</ul>
      <h6 class="mt-3">Consultations</h6>
      <ul class="list-group">${(p.consultations||[]).map(c => `<li class="list-group-item">
        <div><strong>${new Date(c.date).toLocaleDateString()}</strong></div>
        <div class="text-muted">${c.notes}</div>
        <div><strong>Prescription:</strong> ${c.prescription || '—'}</div>
      </li>`).join('')}</ul>
    `;
    new bootstrap.Modal(document.getElementById('patientModal')).show();
  }

  document.getElementById('patient-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    renderPatients(patients.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)));
  });

  renderPatients();
})();

