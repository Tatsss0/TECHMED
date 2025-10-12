(function () {
  'use strict';
  // Prevent double-initialization if the script is accidentally included twice
  if (window.__techmedPatientDirectoryLoaded) return;
  window.__techmedPatientDirectoryLoaded = true;

  // Will be set once Firebase is ready
  let db;

  // Small helper: wait for a condition (Firebase/lib readiness)
  async function waitUntil(checkFn, { timeoutMs = 10000, intervalMs = 50 } = {}) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      (function poll() {
        try {
          if (checkFn()) return resolve(true);
        } catch (_) { /* ignore */ }
        if (Date.now() - start >= timeoutMs) return reject(new Error('timeout'));
        setTimeout(poll, intervalMs);
      })();
    });
  }

  // DOM elements (optional on some pages)
  const swiperEl = document.querySelector('.swiper');
  const swiperWrapper = document.querySelector('.swiper .swiper-wrapper');
  const directoryContainer = document.querySelector('.doctor-directory .isotope-container');

  // Profile area
  const profileImgEl = document.getElementById('doctor-image');
  const profileNameEl = document.getElementById('doctor-name');
  const profileSpecEl = document.getElementById('doctor-specialty');
  const profileBioEl = document.getElementById('doctor-bio');
  const scheduleGridEl = document.getElementById('doctor-schedule');

  // Appointment form elements
  const form = document.getElementById('appointment-form');
  const doctorInput = document.getElementById('doctorInput');
  const doctorIdHidden = document.getElementById('doctorIdHidden');
  const dateInput = document.getElementById('dateInput');
  const timeSelect = document.getElementById('timeSelect');

  // Keep flatpickr instance per doctor selection
  let calendarInstance = null;
  let calendarLibTries = 0;

  // URL doctorId preselection
  const urlDoctorId = new URL(window.location.href).searchParams.get('doctorId');

  // Cache monthly bookings per doctor to minimize reads
  // Key: `${doctorId}|YYYY-MM` -> Map<YYYY-MM-DD, Set<number(ms)>>
  const monthlyBookingsCache = new Map();

  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function formatYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function monthKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function to12h(time) {
    // Expects time as minutes from midnight
    const hours24 = Math.floor(time / 60);
    const minutes = time % 60;
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 || 12;
    return `${String(hours12)}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  }

  function parseHHMM(hhmm) {
    const [h, m] = (hhmm || '').split(':').map(v => parseInt(v, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  }

  function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  function defaultSchedule() {
    return {
      workingDays: [1, 2, 3, 4, 5], // Mon-Fri
      startHour: '09:00',
      endHour: '17:00',
      slotMinutes: 30,
    };
  }

  function getWorkingDays(doctor) {
    const sched = doctor?.schedule || {};
    const wd = Array.isArray(sched.workingDays) && sched.workingDays.length ? sched.workingDays : defaultSchedule().workingDays;
    return wd;
  }

  function buildSlotsForDate(date, schedule) {
    const sched = schedule || defaultSchedule();
    const startMin = parseHHMM(sched.startHour) ?? parseHHMM('09:00');
    const endMin = parseHHMM(sched.endHour) ?? parseHHMM('17:00');
    const step = Math.max(5, parseInt(sched.slotMinutes || 30, 10));

    const slots = [];
    for (let t = startMin; t + step <= endMin; t += step) {
      const slotDate = new Date(date);
      const hours = Math.floor(t / 60);
      const minutes = t % 60;
      slotDate.setHours(hours, minutes, 0, 0);
      slots.push(slotDate);
    }
    return slots;
  }

  function filterPastSlots(slots) {
    const now = new Date();
    return slots.filter(d => d.getTime() > now.getTime());
  }

  async function fetchDoctorById(doctorId) {
    const doc = await db.collection('public_doctors').doc(doctorId).get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    return {
      id: doc.id,
      name: data.name || 'Doctor',
      specialty: data.specialty || '',
      bio: data.bio || '',
      photoUrl: data.photoUrl || data.photo || '',
      schedule: {
        workingDays: Array.isArray(data.workingDays) ? data.workingDays : undefined,
        startHour: data.startHour,
        endHour: data.endHour,
        slotMinutes: data.slotMinutes,
      },
    };
  }

  async function prefetchMonthBookings(doctorId, year, monthIndex /* 0-based */) {
    const first = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const last = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    const mKey = `${doctorId}|${monthKey(first)}`;
    if (monthlyBookingsCache.has(mKey)) return monthlyBookingsCache.get(mKey);

    const snap = await db.collection('appointments')
      .where('doctorId', '==', doctorId)
      .where('startAt', '>=', firebase.firestore.Timestamp.fromDate(first))
      .where('startAt', '<=', firebase.firestore.Timestamp.fromDate(last))
      .get();

    const dayToSet = new Map();
    snap.forEach(d => {
      const v = d.data();
      const ts = v && v.startAt && v.startAt.toDate ? v.startAt.toDate() : null;
      if (!ts) return;
      const dayKey = formatYMD(ts);
      let set = dayToSet.get(dayKey);
      if (!set) { set = new Set(); dayToSet.set(dayKey, set); }
      set.add(ts.getTime());
    });

    monthlyBookingsCache.set(mKey, dayToSet);
    return dayToSet;
  }

  async function getBookedSetForDayFromCacheOrFetch(doctorId, date) {
    const y = date.getFullYear();
    const m = date.getMonth();
    const mk = `${doctorId}|${monthKey(date)}`;
    if (!monthlyBookingsCache.has(mk)) {
      await prefetchMonthBookings(doctorId, y, m);
    }
    const map = monthlyBookingsCache.get(mk) || new Map();
    const set = map.get(formatYMD(date));
    return set ? new Set(set) : new Set();
  }

  async function fetchDoctors() {
    const snap = await db.collection('public_doctors').orderBy('name', 'asc').get();
    return snap.docs.map(d => {
      const v = d.data() || {};
      return {
        id: d.id,
        name: v.name || 'Doctor',
        specialty: v.specialty || '',
        bio: v.bio || '',
        photoUrl: v.photoUrl || v.photo || '',
        schedule: {
          workingDays: Array.isArray(v.workingDays) ? v.workingDays : undefined,
          startHour: v.startHour,
          endHour: v.endHour,
          slotMinutes: v.slotMinutes,
        },
      };
    });
  }

  let swiperInitTries = 0;
  function ensureSwiperInitialized() {
    if (!swiperEl) return;
    // Avoid double-init
    if (swiperEl && swiperEl.swiper) return;
    if (typeof Swiper === 'undefined') {
      if (swiperInitTries++ < 60) setTimeout(ensureSwiperInitialized, 100);
      return;
    }
    // eslint-disable-next-line no-new
    new Swiper(swiperEl, {
      slidesPerView: 1,
      spaceBetween: 12,
      navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev',
      },
      pagination: { el: '.swiper-pagination', clickable: true },
      breakpoints: {
        576: { slidesPerView: 2 },
        992: { slidesPerView: 3 },
        1200: { slidesPerView: 4 },
      },
    });
  }

  function renderDoctorsToSwiper(doctors) {
    if (!swiperWrapper) return;
    swiperWrapper.innerHTML = '';
    doctors.forEach(doc => {
      const slide = document.createElement('div');
      slide.className = 'swiper-slide';
      slide.innerHTML = `
        <div class="card h-100 doctor-card" data-doctor-id="${doc.id}">
          <img src="${doc.photoUrl || 'logo.png'}" class="card-img-top" alt="${doc.name}">
          <div class="card-body">
            <h5 class="card-title mb-1">${doc.name}</h5>
            <p class="card-text text-muted mb-2">${doc.specialty || ''}</p>
            <button class="btn btn-primary btn-sm select-doctor">Select</button>
          </div>
        </div>`;
      swiperWrapper.appendChild(slide);
    });

    // Initialize or retry initializing Swiper once slides are in the DOM
    ensureSwiperInitialized();
  }

  function renderDoctorsToDirectory(doctors) {
    if (!directoryContainer) return;
    directoryContainer.innerHTML = '';
    doctors.forEach(doc => {
      const col = document.createElement('div');
      col.className = 'col-12 col-sm-6 col-lg-4';
      col.innerHTML = `
        <div class="card h-100 doctor-card" data-doctor-id="${doc.id}">
          <div class="row g-0">
            <div class="col-4">
              <img src="${doc.photoUrl || 'logo.png'}" class="img-fluid rounded-start h-100 object-fit-cover" alt="${doc.name}">
            </div>
            <div class="col-8">
              <div class="card-body">
                <h6 class="card-title mb-1">${doc.name}</h6>
                <div class="text-muted small mb-2">${doc.specialty || ''}</div>
                <button class="btn btn-outline-primary btn-sm select-doctor">Select</button>
              </div>
            </div>
          </div>
        </div>`;
      directoryContainer.appendChild(col);
    });
  }

  function updateProfileView(doctor) {
    if (profileImgEl && doctor.photoUrl) profileImgEl.src = doctor.photoUrl;
    if (profileNameEl) profileNameEl.textContent = doctor.name || 'Selected Doctor';
    if (profileSpecEl) profileSpecEl.textContent = doctor.specialty || '';
    if (profileBioEl) profileBioEl.textContent = doctor.bio || '';

    if (scheduleGridEl) {
      scheduleGridEl.innerHTML = '<div class="text-muted">Select a date to see available times.</div>';
    }
  }

  function destroyCalendarIfAny() {
    if (calendarInstance && typeof calendarInstance.destroy === 'function') {
      calendarInstance.destroy();
      calendarInstance = null;
    }
  }

  function initCalendarForDoctor(doctor) {
    if (!dateInput) return;
    if (typeof flatpickr === 'undefined') {
      // Retry briefly until flatpickr is available
      if (calendarLibTries++ < 60) setTimeout(() => initCalendarForDoctor(doctor), 100);
      return;
    }

    destroyCalendarIfAny();

    const sched = doctor.schedule || {};
    const workingDays = Array.isArray(sched.workingDays) && sched.workingDays.length
      ? sched.workingDays
      : defaultSchedule().workingDays;

    calendarInstance = flatpickr(dateInput, {
      altInput: false,
      dateFormat: 'Y-m-d',
      minDate: 'today',
      disable: [
        function (d) {
          // Disable days not in workingDays (0=Sun..6=Sat)
          return !workingDays.includes(d.getDay());
        },
      ],
      onReady: async function (selectedDates, dateStr, fp) {
        const currentFirst = new Date(fp.currentYear, fp.currentMonth, 1);
        await prefetchMonthBookings(doctor.id, currentFirst.getFullYear(), currentFirst.getMonth());
        fp.redraw();
      },
      onMonthChange: async function (selectedDates, dateStr, fp) {
        const currentFirst = new Date(fp.currentYear, fp.currentMonth, 1);
        await prefetchMonthBookings(doctor.id, currentFirst.getFullYear(), currentFirst.getMonth());
        fp.redraw();
      },
      onYearChange: async function (selectedDates, dateStr, fp) {
        const currentFirst = new Date(fp.currentYear, fp.currentMonth, 1);
        await prefetchMonthBookings(doctor.id, currentFirst.getFullYear(), currentFirst.getMonth());
        fp.redraw();
      },
      onDayCreate: function (dObj, dStr, fp, dayElem) {
        try {
          const d = dayElem.dateObj || (dStr ? new Date(`${dStr}T00:00:00`) : null);
          if (!d || isNaN(d.getTime())) return;
          // Clear previous markers
          dayElem.classList.remove('available', 'booked');

          if (!workingDays.includes(d.getDay())) return;

          const mk = `${doctor.id}|${monthKey(d)}`;
          const map = monthlyBookingsCache.get(mk);
          const bookedSet = map ? (map.get(formatYMD(d)) || new Set()) : new Set();

          const allSlots = buildSlotsForDate(d, doctor.schedule || defaultSchedule());
          const today = new Date();
          const effectiveSlots = isSameDay(d, today) ? filterPastSlots(allSlots) : allSlots;
          const open = effectiveSlots.filter(s => !bookedSet.has(s.getTime()));

          if (open.length <= 0) {
            dayElem.classList.add('booked');
          } else {
            dayElem.classList.add('available');
          }
        } catch (_) { /* ignore */ }
      },
      onChange: function (selectedDates) {
        const d = selectedDates && selectedDates[0] ? selectedDates[0] : null;
        if (d) {
          populateTimesForDate(doctor, d);
        }
      },
    });
  }

  async function fetchBookedForDay(doctorId, date) {
    // Prefer cached monthly bookings; fall back to month prefetch
    return await getBookedSetForDayFromCacheOrFetch(doctorId, date);
  }

  async function populateTimesForDate(doctor, date) {
    if (!timeSelect) return;

    timeSelect.innerHTML = '<option value="">Loading...</option>';

    const baseSlots = buildSlotsForDate(date, doctor.schedule || defaultSchedule());
    const slots = startOfDay(date).toDateString() === new Date().toDateString()
      ? filterPastSlots(baseSlots)
      : baseSlots;

    const booked = await fetchBookedForDay(doctor.id, date);
    const available = slots.filter(d => !booked.has(d.getTime()));

    timeSelect.innerHTML = '<option value="">Select Time</option>';
    available.forEach(d => {
      const hours = d.getHours();
      const minutes = d.getMinutes();
      const valueMinutes = hours * 60 + minutes;
      const label = to12h(valueMinutes);
      const opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      timeSelect.appendChild(opt);
    });

    if (available.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No times available';
      timeSelect.appendChild(opt);
    } else {
      // Preselect first available time
      timeSelect.selectedIndex = 1;
    }
  }

  async function selectDoctor(doctor) {
    if (doctorInput) doctorInput.value = doctor.name;
    if (doctorIdHidden) doctorIdHidden.value = doctor.id;

    updateProfileView(doctor);
    renderWeeklySchedule(doctor);
    initCalendarForDoctor(doctor);

    // If a date is already selected, repopulate times
    if (calendarInstance && calendarInstance.selectedDates?.length) {
      await populateTimesForDate(doctor, calendarInstance.selectedDates[0]);
    } else if (dateInput && dateInput.value) {
      const d = new Date(dateInput.value);
      if (!isNaN(d.getTime())) await populateTimesForDate(doctor, d);
    } else {
      // Auto-select the next available date/time if nothing is selected
      const pick = await findNextAvailableSlot(doctor, new Date());
      if (pick) {
        if (calendarInstance) calendarInstance.setDate(pick.date, true);
        await populateTimesForDate(doctor, pick.date);
        // timeSelect will have options now; pick the one matching pick.timeLabel
        if (timeSelect) {
          const opt = Array.from(timeSelect.options).find(o => o.value === pick.timeLabel);
          if (opt) timeSelect.value = pick.timeLabel;
        }
      }
    }

    // Scroll to appointment form for convenience
    const formSection = document.getElementById('appointment');
    if (formSection) formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderWeeklySchedule(doctor) {
    if (!scheduleGridEl) return;
    const sched = doctor.schedule || defaultSchedule();
    const working = getWorkingDays(doctor);
    const start = sched.startHour || '09:00';
    const end = sched.endHour || '17:00';
    let html = '<div class="row g-2">';
    for (let i = 0; i < 7; i += 1) {
      const on = working.includes(i);
      html += `
        <div class="col-6 col-md-4">
          <div class="border rounded p-2 h-100">
            <div class="fw-semibold">${DAY_NAMES[i]}</div>
            <div class="small ${on ? '' : 'text-muted'}">${on ? `${start} - ${end}` : 'Off'}</div>
          </div>
        </div>`;
    }
    html += '</div>';
    scheduleGridEl.innerHTML = html;
  }

  async function findNextAvailableSlot(doctor, fromDate) {
    const limitDays = 60; // safety bound
    const start = startOfDay(fromDate);
    for (let i = 0; i < limitDays; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const wd = d.getDay();
      if (!getWorkingDays(doctor).includes(wd)) continue;
      const allSlots = buildSlotsForDate(d, doctor.schedule || defaultSchedule());
      const today = new Date();
      const effectiveSlots = isSameDay(d, today) ? filterPastSlots(allSlots) : allSlots;
      if (effectiveSlots.length === 0) continue;
      const booked = await getBookedSetForDayFromCacheOrFetch(doctor.id, d);
      const open = effectiveSlots.filter(s => !booked.has(s.getTime()));
      if (open.length > 0) {
        const first = open[0];
        const label = to12h(first.getHours() * 60 + first.getMinutes());
        return { date: d, timeLabel: label };
      }
    }
    return null;
  }

  function attachSelectionHandlers(doctorsById) {
    const root = document;
    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('.select-doctor');
      if (!btn) return;
      const card = btn.closest('.doctor-card');
      if (!card) return;
      const id = card.getAttribute('data-doctor-id');
      if (!id) return;
      const doc = doctorsById.get(id);
      if (!doc) return;
      await selectDoctor(doc);
    });
  }

  async function bootstrap() {
    try {
      // Ensure Firebase is initialized before using Firestore
      await waitUntil(() => window.firebase && firebase.apps && firebase.apps.length > 0);
      db = firebase.firestore();

      const doctors = await fetchDoctors();

      if (doctors.length === 0) {
        if (swiperWrapper) swiperWrapper.innerHTML = '<div class="p-4">No doctors found.</div>';
        if (directoryContainer) directoryContainer.innerHTML = '<div class="p-4">No doctors found.</div>';
        return;
      }

      renderDoctorsToSwiper(doctors);
      renderDoctorsToDirectory(doctors);

      // In case Swiper loads after this script, attempt one more init on window load
      window.addEventListener('load', ensureSwiperInitialized, { once: true });

      const doctorsById = new Map(doctors.map(d => [d.id, d]));
      attachSelectionHandlers(doctorsById);

      // Preselect via URL doctorId
      if (urlDoctorId && doctorsById.has(urlDoctorId)) {
        await selectDoctor(doctorsById.get(urlDoctorId));
      }

      // If no URL id but form already has a doctor id/name, hydrate selection
      else if (doctorIdHidden && doctorIdHidden.value && doctorsById.has(doctorIdHidden.value)) {
        await selectDoctor(doctorsById.get(doctorIdHidden.value));
      } else if (doctorInput && doctorInput.value) {
        const match = doctors.find(d => d.name === doctorInput.value);
        if (match) await selectDoctor(match);
      }

      // If a doctor is selected later via some external script, observe changes to hidden id
      if (doctorIdHidden) {
        const obs = new MutationObserver(async () => {
          const id = doctorIdHidden.value;
          if (id && doctorsById.has(id)) await selectDoctor(doctorsById.get(id));
        });
        obs.observe(doctorIdHidden, { attributes: true, attributeFilter: ['value'] });
      }

      // If the date changes (even outside flatpickr), repopulate times if a doctor is chosen
      if (dateInput) {
        dateInput.addEventListener('change', async () => {
          const id = doctorIdHidden && doctorIdHidden.value;
          if (!id || !dateInput.value) return;
          const doctor = await fetchDoctorById(id);
          if (!doctor) return;
          const d = new Date(dateInput.value);
          if (!isNaN(d.getTime())) await populateTimesForDate(doctor, d);
        });
      }

    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to initialize patient directory:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
