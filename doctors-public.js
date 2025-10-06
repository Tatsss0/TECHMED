(function(){
  // Requires firebase compat libs and firebase-init.js to be loaded beforehand
  const PLACEHOLDER = 'https://via.placeholder.com/240x240.png?text=Dr';

  function qs(sel, root=document){ return root.querySelector(sel); }
  function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

  function setProfile({name, specialty, image, bio, schedule, reviews}){
    const img = qs('#doctor-image');
    const nm = qs('#doctor-name');
    const sp = qs('#doctor-specialty');
    const bioEl = qs('#doctor-bio');
    const schedEl = qs('#doctor-schedule');
    const revEl = qs('#doctor-reviews');
    if (img) img.src = image || PLACEHOLDER;
    if (nm) nm.textContent = name || 'Doctor';
    if (sp) sp.textContent = specialty || '';
    if (bioEl) bioEl.textContent = bio || 'No bio provided';
    if (schedEl) {
      const arr = Array.isArray(schedule) ? schedule : [];
      schedEl.innerHTML = arr.length ? arr.map(s => `<div class="schedule-item"><strong>${s.day}</strong> <span class="text-muted">${s.time}</span></div>`).join('') : '<div class="text-muted">No schedule available</div>';
    }
    if (revEl) revEl.textContent = reviews || 'No reviews yet';
  }

  function makeSlide(doc){
    const d = doc.data();
    const fullName = d.fullName || (d.displayName || 'Doctor').replace(/^Dr\.\s*/, '');
    const name = fullName.match(/^Dr\./i) ? fullName : `Dr. ${fullName}`;
    const specialty = d.specialty || '';
    const image = d.avatarUrl || PLACEHOLDER;
    const bio = d.about || '';
    const schedule = Array.isArray(d.schedule) ? d.schedule : [];
    const reviews = '';

    const slide = document.createElement('div');
    slide.className = 'swiper-slide';
    slide.innerHTML = `
      <div class="minimal-card text-center">
        <img src="${image}" alt="${name}" class="avatar img-fluid" loading="lazy" style="object-fit:cover;border-radius:12px;">
        <div class="info">
          <h4 class="mb-0">${name}</h4>
          <small>${specialty}</small>
        </div>
      </div>`;
    const card = slide.firstElementChild;
    card.addEventListener('click', ()=> setProfile({ name, specialty, image, bio, schedule, reviews }));
    // On first card, set profile by default if none chosen
    if (!qs('#doctor-name')?.dataset.bound) {
      setProfile({ name, specialty, image, bio, schedule, reviews });
      const bound = qs('#doctor-name');
      if (bound) bound.dataset.bound = '1';
    }
    return slide;
  }

  function initSwiperIfAvailable(container){
    if (window.Swiper) {
      // eslint-disable-next-line no-new
      new Swiper(container.closest('.swiper') || container, {
        slidesPerView: 1.2,
        spaceBetween: 16,
        breakpoints: { 576: { slidesPerView: 2 }, 992: { slidesPerView: 3 } },
        navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
        pagination: { el: '.swiper-pagination', clickable: true },
      });
    }
  }

  function slugify(text){
    return (text || 'general').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'general';
  }

  function makeDirectoryItem(doc){
    const d = doc.data();
    const fullName = d.fullName || (d.displayName || 'Doctor').replace(/^Dr\.\s*/, '');
    const name = /^Dr\./i.test(fullName) ? fullName : `Dr. ${fullName}`;
    const specialty = d.specialty || '';
    const deptSlug = `filter-${slugify((specialty.split(/[,•-]/)[0] || 'general'))}`; // e.g., Cardiology -> filter-cardiology
    const image = d.avatarUrl || PLACEHOLDER;
    const bio = d.about || '';
    const schedule = Array.isArray(d.schedule) ? d.schedule : [];

    const col = document.createElement('div');
    col.className = `col-lg-3 col-md-6 doctor-item isotope-item ${deptSlug}`;
    col.innerHTML = `
      <article class="doctor-card h-100">
        <figure class="doctor-media">
          <img src="${image}" class="img-fluid" alt="${name}" loading="lazy" style="object-fit:cover;width:100%;height:220px;border-radius:8px;">
        </figure>
        <div class="doctor-content">
          <h3 class="doctor-name">${name}</h3>
          <p class="doctor-title">${specialty}</p>
          <p class="doctor-desc">${bio ? (bio.length > 120 ? bio.slice(0,117) + '…' : bio) : ''}</p>
          <div class="doctor-meta">
            ${specialty ? `<span class="badge dept">${specialty.split(/[,•-]/)[0]}</span>` : ''}
          </div>
          <div class="doctor-actions d-flex gap-2">
            <a href="#appointment" class="btn btn-sm btn-appointment" data-doctor-id="${doc.id}" data-doctor-name="${name}" data-doctor-specialty="${specialty}">Book Appointment</a>
            <a href="#" class="btn btn-sm btn-soft btn-view-profile">View Profile</a>
          </div>
        </div>
      </article>`;

    // Hook up buttons
    col.querySelector('.btn-view-profile')?.addEventListener('click', (e)=>{
      e.preventDefault();
      setProfile({ name, specialty, image, bio, schedule, reviews: '' });
      // Scroll to profile section if present
      const prof = document.querySelector('.profile-tabs') || document.getElementById('doctor-name');
      if (prof && prof.scrollIntoView) prof.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    col.querySelector('.btn-appointment')?.addEventListener('click', (e)=>{
      // Let host page handle booking UI; we emit an event with details
      const detail = { doctorId: doc.id, name, specialty, image };
      window.dispatchEvent(new CustomEvent('book-appointment', { detail }));
    });

    return col;
  }

  function renderDirectoryFromSnapshot(snap){
    const container = document.querySelector('.doctor-directory .isotope-container');
    if (!container) return;
    container.innerHTML = '';
    if (snap.empty) {
      container.innerHTML = '<div class="col-12 text-center text-muted py-3">No doctors available</div>';
      return;
    }
    snap.forEach(doc => container.appendChild(makeDirectoryItem(doc)));
    // If the page uses Isotope or AOS, their init can run separately
  }

  async function renderDoctors(){
    const wrapper = qs('.compact-view .swiper .swiper-wrapper') || qs('.swiper-wrapper');
    if (!wrapper) return;
    wrapper.innerHTML = '<div class="p-3 text-center w-100">Loading doctors…</div>';

    try {
      // Listen live so new registrations appear automatically
      db.collection('doctors').orderBy('fullName', 'asc').onSnapshot((snap)=>{
        wrapper.innerHTML = '';
        if (snap.empty) {
          wrapper.innerHTML = '<div class="p-3 text-center w-100 text-muted">No doctors available</div>';
          return;
        }
        snap.forEach(doc => wrapper.appendChild(makeSlide(doc)));
        initSwiperIfAvailable(wrapper);
        renderDirectoryFromSnapshot(snap);
      }, (err) => {
        console.error(err);
        wrapper.innerHTML = '<div class="p-3 text-center w-100 text-danger">Failed to load doctors</div>';
        renderDirectoryFromSnapshot({ empty: true, forEach: ()=>{} });
      });
    } catch (e) {
      console.error(e);
      wrapper.innerHTML = '<div class="p-3 text-center w-100 text-danger">Failed to load doctors</div>';
      renderDirectoryFromSnapshot({ empty: true, forEach: ()=>{} });
    }
  }

  // Start after DOM ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderDoctors);
  else renderDoctors();
})();
