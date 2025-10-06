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
      }, (err) => {
        console.error(err);
        wrapper.innerHTML = '<div class="p-3 text-center w-100 text-danger">Failed to load doctors</div>';
      });
    } catch (e) {
      console.error(e);
      wrapper.innerHTML = '<div class="p-3 text-center w-100 text-danger">Failed to load doctors</div>';
    }
  }

  // Start after DOM ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderDoctors);
  else renderDoctors();
})();
