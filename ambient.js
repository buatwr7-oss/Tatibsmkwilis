/* Latar suasana alam Tatib (v3.14.0) — skrip biasa (bukan module), dimuat sebelum app.js */
    (function () {
      const bgRoot = document.getElementById('ambient-background');
      const skyLayers = document.querySelectorAll('.ambient-sky-layer');
      const starsContainer = document.getElementById('ambient-stars-container');
      const shootingContainer = document.getElementById('ambient-shooting-container');
      const particlesContainer = document.getElementById('ambient-particles-container');
      const firefliesContainer = document.getElementById('ambient-fireflies-container');

      const isMobileViewport = window.innerWidth < 640;
      let currentMood = 'pagi';
      let shootingStarTimer = null;

      /**
       * Membuat bintang berkelip untuk suasana Malam (jumlah adaptif HP vs Laptop)
       */
      function initStars(count) {
        if (!starsContainer) return;
        const total = count || (isMobileViewport ? 95 : 175);
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < total; i++) {
          const star = document.createElement('span');
          const size = (Math.random() * 2.4 + 0.8).toFixed(1);
          star.className = 'ambient-star';
          star.style.width = `${size}px`;
          star.style.height = `${size}px`;
          star.style.left = `${(Math.random() * 100).toFixed(2)}%`;
          star.style.top = `${(Math.random() * 78).toFixed(2)}%`;
          star.style.opacity = (Math.random() * 0.65 + 0.35).toFixed(2);
          star.style.setProperty('--twinkle-dur', `${(Math.random() * 3.5 + 2.2).toFixed(1)}s`);
          star.style.setProperty('--twinkle-delay', `${(Math.random() * 4).toFixed(1)}s`);
          fragment.appendChild(star);
        }
        starsContainer.appendChild(fragment);
      }

      /**
       * Mengatur kemunculan bintang jatuh secara berkala saat suasana Malam
       */
      function spawnShootingStar() {
        if (!shootingContainer || currentMood !== 'malam') return;
        const streak = document.createElement('span');
        streak.className = 'shooting-star';
        streak.style.left = `${(Math.random() * 55 + 38).toFixed(1)}%`;
        streak.style.top = `${(Math.random() * 30 + 6).toFixed(1)}%`;
        shootingContainer.appendChild(streak);

        setTimeout(() => {
          if (streak.parentNode) streak.parentNode.removeChild(streak);
        }, 1450);
      }

      function manageShootingStars(isNight) {
        if (shootingStarTimer) {
          clearInterval(shootingStarTimer);
          shootingStarTimer = null;
        }
        if (isNight) {
          setTimeout(spawnShootingStar, 900);
          shootingStarTimer = setInterval(() => {
            if (Math.random() > 0.3) spawnShootingStar();
          }, 4200);
        }
      }

      /**
       * Membuat partikel debu cahaya hangat untuk suasana Sore Jingga
       */
      function initGoldenParticles(count) {
        if (!particlesContainer) return;
        const total = count || (isMobileViewport ? 16 : 28);
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < total; i++) {
          const mote = document.createElement('span');
          const size = (Math.random() * 5 + 3).toFixed(1);
          mote.className = 'golden-mote';
          mote.style.width = `${size}px`;
          mote.style.height = `${size}px`;
          mote.style.left = `${(Math.random() * 100).toFixed(2)}%`;
          mote.style.top = `${(Math.random() * 68 + 22).toFixed(2)}%`;
          mote.style.setProperty('--float-dur', `${(Math.random() * 8 + 8).toFixed(1)}s`);
          mote.style.setProperty('--float-delay', `${(Math.random() * 6).toFixed(1)}s`);
          fragment.appendChild(mote);
        }
        particlesContainer.appendChild(fragment);
      }

      /**
       * Membuat kunang-kunang bercahaya lembut di dekat bukit saat Malam
       */
      function initFireflies(count) {
        if (!firefliesContainer) return;
        const total = count || (isMobileViewport ? 14 : 24);
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < total; i++) {
          const fly = document.createElement('span');
          const size = (Math.random() * 3 + 2.2).toFixed(1);
          fly.className = 'firefly-dot';
          fly.style.width = `${size}px`;
          fly.style.height = `${size}px`;
          fly.style.left = `${(Math.random() * 94 + 3).toFixed(2)}%`;
          fly.style.bottom = `${(Math.random() * 24 + 6).toFixed(2)}%`;
          fly.style.setProperty('--ff-dur', `${(Math.random() * 7 + 7).toFixed(1)}s`);
          fly.style.setProperty('--ff-delay', `${(Math.random() * 5).toFixed(1)}s`);
          fly.style.setProperty('--pulse-dur', `${(Math.random() * 2 + 1.8).toFixed(1)}s`);
          fragment.appendChild(fly);
        }
        firefliesContainer.appendChild(fragment);
      }

      /**
       * Fungsi Utama Pengubah Opasitas Gradasi Background (Global API)
       * Nilai antara 0.1 hingga 1 (contoh: setAmbientOpacity(0.75))
       */
      window.setAmbientOpacity = function (opacityValue) {
        if (!bgRoot) return;
        const clamped = Math.min(1, Math.max(0.1, Number(opacityValue)));
        bgRoot.style.setProperty('--ambient-opacity', clamped.toFixed(2));
      };

      /**
       * Fungsi Utama Pengubah Suasana Background (Global API)
       * Dapat dipanggil dari website utama: window.setAmbientMood('pagi' | 'siang' | 'sore' | 'malam')
       */
      window.setAmbientMood = function (mood) {
        const validMoods = ['pagi', 'siang', 'sore', 'malam'];
        if (!validMoods.includes(mood) || !bgRoot) return;

        currentMood = mood;
        bgRoot.setAttribute('data-mood', mood);

        skyLayers.forEach((layer) => {
          if (layer.getAttribute('data-sky') === mood) {
            layer.classList.add('is-active');
          } else {
            layer.classList.remove('is-active');
          }
        });

        manageShootingStars(mood === 'malam');

        // Pancarkan custom event agar UI/komponen lain di website utama bisa ikut merespons
        window.dispatchEvent(new CustomEvent('ambientMoodChanged', { detail: { mood } }));
      };

      // Inisialisasi elemen atmosfer saat halaman siap
      initStars();
      initGoldenParticles();
      initFireflies();
          // ---- Integrasi Tatib: mood awal sesuai jam (tanpa animasi transisi saat memuat) ----
      function moodDariJam(d) {
        const j = (d || new Date()).getHours();
        if (j >= 4 && j < 11) return 'pagi';
        if (j >= 11 && j < 15) return 'siang';
        if (j >= 15 && j < 18) return 'sore';
        return 'malam';
      }
      window.moodDariJamTatib = moodDariJam;
      if (bgRoot) {
        bgRoot.classList.add('no-trans');
        window.setAmbientMood(moodDariJam());
        requestAnimationFrame(() => requestAnimationFrame(() => bgRoot.classList.remove('no-trans')));
      }
      document.addEventListener('visibilitychange', () => {
        document.documentElement.classList.toggle('tab-tersembunyi', document.hidden);
      });
    })();
