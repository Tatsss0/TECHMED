// appointment.js
const auth = firebase.auth();
const db = firebase.firestore();

const urlDoctorId = new URL(window.location.href).searchParams.get('doctorId');

function parse12hToDate(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setHours(h, min, 0, 0);
  return d;
}

auth.onAuthStateChanged(async (user) => {
  if (!user) { window.location.replace('login.php'); return; }

  // doctorPublicId from URL or hidden input
  const hiddenEl = document.getElementById('doctorIdHidden');
  let doctorPublicId = urlDoctorId || (hiddenEl?.value || '').trim();
  if (!doctorPublicId) { alert('Please select a doctor first.'); return; }

  // Resolve doctor UID + pretty name from public_doctors
  let doctorUid = doctorPublicId;
  let doctorPretty = (document.getElementById('doctorInput')?.value || '').trim();
  try {
    const pubRef = db.collection('public_doctors').doc(doctorPublicId);
    const pubSnap = await pubRef.get();
    if (pubSnap.exists) {
      const d = pubSnap.data() || {};
      doctorUid = (d.uid || '').trim() || doctorPublicId;
      doctorPretty = (d.name || '').trim() || doctorPretty || '';
    } else {
      // Fallback: if public doc missing, try doctors/{id} (id may already be the UID)
      const docSnap = await db.collection('doctors').doc(doctorPublicId).get();
      if (docSnap.exists) doctorUid = doctorPublicId;
    }
  } catch {}

  const nameEl = document.getElementById('selected-doctor-name');
  if (nameEl) nameEl.textContent = doctorPretty || 'Selected Doctor';

  const form = document.getElementById('appointment-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const errorBox = form.querySelector('.error-message');
    const loadingEl = form.querySelector('.loading');
    if (errorBox) errorBox.textContent = '';
    if (loadingEl) loadingEl.style.display = 'block';
    if (submitBtn) submitBtn.disabled = true;
    
    const slotInput = document.getElementById('slot');
    const dateInput = document.getElementById('dateInput');
    const timeSelect = document.getElementById('timeSelect');
    const reasonEl = document.getElementById('reason');

    let slotDate = null;
    if (slotInput && slotInput.value) {
      const d = new Date(slotInput.value);
      if (!isNaN(d.getTime())) slotDate = d;
    } else if (dateInput && timeSelect && dateInput.value && timeSelect.value) {
      slotDate = parse12hToDate(dateInput.value, timeSelect.value);
    }
    if (!slotDate || isNaN(slotDate.getTime())) {
      if (errorBox) errorBox.textContent = 'Please select a valid date and time.';
      else alert('Please select a valid date and time.');
      if (loadingEl) loadingEl.style.display = 'none';
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    const slotTS = firebase.firestore.Timestamp.fromDate(slotDate);

    // Prevent double booking (by doctor UID stored in doctorId)
    try {
      const existing = await db.collection('appointments')
        .where('doctorId', '==', doctorUid)
        .where('startAt', '==', slotTS)
        .limit(1)
        .get();
      if (!existing.empty) {
        if (errorBox) errorBox.textContent = 'That time is already booked. Please choose another slot.';
        else alert('That time is already booked. Please choose another slot.');
        if (loadingEl) loadingEl.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
        return;
      }
    } catch (err) {
      // If rules or index error occurs, surface message
      if (errorBox) errorBox.textContent = err?.message || 'Failed to verify slot availability.';
      else alert(err?.message || 'Failed to verify slot availability.');
      if (loadingEl) loadingEl.style.display = 'none';
      if (submitBtn) submitBtn.disabled = false;
      return;
    }

    // Persist appointment
    try {
      await db.collection('appointments').add({
        doctorId: doctorUid,            // primary key used by dashboard
        doctorUid: doctorUid,           // legacy/secondary key for compatibility
        doctorPublicId: doctorPublicId, // reference to public_doctors/{id}
        doctorName: doctorPretty || '',
        patientId: user.uid,
        patientName: user.displayName || user.email || 'Patient',
        startAt: slotTS,
        status: 'pending',
        reason: reasonEl ? (reasonEl.value || '').trim() : '',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      const okBox = form.querySelector('.sent-message');
      if (okBox) okBox.style.display = 'block';
      else alert('Appointment request sent!');
      form.reset();
    } catch (err) {
      if (errorBox) errorBox.textContent = err?.message || 'Failed to book appointment.';
      else alert(err?.message || 'Failed to book appointment.');
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      if (submitBtn) submitBtn.disabled = false;
    }
  });
});
