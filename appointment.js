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
    const docSnap = await db.collection('public_doctors').doc(doctorPublicId).get();
    if (docSnap.exists) {
      const d = docSnap.data() || {};
      doctorUid = d.uid || doctorPublicId; // prefer actual auth UID
      doctorPretty = d.name || doctorPretty || '';
    }
  } catch {}

  const nameEl = document.getElementById('selected-doctor-name');
  if (nameEl) nameEl.textContent = doctorPretty || 'Selected Doctor';

  const form = document.getElementById('appointment-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

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
      alert('Please select a valid date and time.');
      return;
    }

    const slotTS = firebase.firestore.Timestamp.fromDate(slotDate);

    // Prevent double booking (by doctor UID stored in doctorId)
    const existing = await db.collection('appointments')
      .where('doctorId', '==', doctorUid)
      .where('startAt', '==', slotTS)
      .limit(1)
      .get();
    if (!existing.empty) {
      alert('That time is already booked. Please choose another slot.');
      return;
    }

    // Persist appointment
    await db.collection('appointments').add({
      doctorId: doctorUid,            // dashboard listens to this
      doctorPublicId: doctorPublicId, // reference to public_doctors/{id}
      doctorName: doctorPretty || '',
      patientId: user.uid,
      patientName: user.displayName || user.email || 'Patient',
      startAt: slotTS,
      status: 'pending',
      reason: reasonEl ? (reasonEl.value || '').trim() : '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert('Appointment request sent!');
  });
});
