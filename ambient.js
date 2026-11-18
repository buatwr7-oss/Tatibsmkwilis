/* Latar suasana alam Tatib (v3.16.0) — skrip biasa (bukan module), dimuat sebelum app.js */
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
        const total = count || (isMobileViewport ? 70 : 150);
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
        const total = count || (isMobileViewport ? 10 : 20);
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
      // ---- Cuaca (v4.4.0): Open-Meteo (gratis, tanpa kunci), titik tetap sekolah, cache 30 menit ----
      // Ubah koordinat di bawah bila perlu (cukup perkiraan, grid data ~11 km).
      const CUACA_LAT = -7.12, CUACA_LON = 107.86;
      const KUNCI_CUACA = 'tatibCuaca';
      const CUACA_TTL = 30 * 60 * 1000;      // data dianggap segar 30 menit
      const CUACA_KADALUARSA = 3 * 3600 * 1000; // data lebih tua dari 3 jam tidak dipakai
      const cuacaValid = ['cerah', 'mendung', 'hujan'];
      let cuacaAsli = 'cerah', cuacaWaktu = 0, cuacaPaksa = null;

      function klasifikasiCuaca(d) {
        // d: respons Open-Meteo {current:{weather_code,precipitation,cloud_cover}, hourly:{precipitation_probability}}
        const c = (d && d.current) || {};
        const kode = Number(c.weather_code);
        const hujanKode = (kode >= 51 && kode <= 67) || (kode >= 80 && kode <= 82) || (kode >= 95 && kode <= 99);
        const prob = d && d.hourly && d.hourly.precipitation_probability;
        const probJamDepan = Array.isArray(prob) && prob.length > 1 ? Number(prob[1]) : 0; // ramalan 1 jam ke depan
        if (hujanKode || Number(c.precipitation) > 0.1 || probJamDepan >= 70) return 'hujan';
        if (Number(c.cloud_cover) >= 85 || kode === 45 || kode === 48) return 'mendung';
        return 'cerah';
      }
      function buatTetesHujan() {
        const wadah = document.getElementById('ambient-rain-container');
        if (!wadah || wadah.childElementCount) return;
        const mobile = window.innerWidth < 768;
        const jumlah = mobile ? 30 : 60;
        const frag = document.createDocumentFragment();
        for (let i = 0; i < jumlah; i++) {
          const t = document.createElement('i');
          t.className = 'rain-drop';
          t.style.left = (Math.random() * 104 - 2).toFixed(1) + '%';
          t.style.height = (Math.random() * 14 + 12).toFixed(0) + 'px';
          t.style.opacity = (Math.random() * 0.4 + 0.45).toFixed(2);
          t.style.setProperty('--rain-dur', (Math.random() * 0.6 + 0.8).toFixed(2) + 's');
          t.style.setProperty('--rain-delay', (-Math.random() * 1.5).toFixed(2) + 's');
          t.style.setProperty('--rain-top', (Math.random() * 90).toFixed(0) + '%');
          frag.appendChild(t);
        }
        wadah.appendChild(frag);
      }
      function terapkanCuaca(c) {
        if (!bgRoot || cuacaValid.indexOf(c) < 0) return;
        if (c === 'hujan') buatTetesHujan(); // dibuat sekali, hanya saat benar-benar hujan
        bgRoot.setAttribute('data-cuaca', c);
        window.dispatchEvent(new CustomEvent('ambientCuacaChanged', { detail: { cuaca: c } }));
      }
      function cuacaTampil() { return cuacaPaksa || cuacaAsli; }
      // Pratinjau admin: nilai paksa (cerah|mendung|hujan) atau null/'auto' untuk kembali ke cuaca asli
      window.setAmbientCuaca = function (c) {
        cuacaPaksa = cuacaValid.indexOf(c) >= 0 ? c : null;
        terapkanCuaca(cuacaTampil());
      };
      window.ambientCuacaInfo = function () {
        return { asli: cuacaAsli, tampil: cuacaTampil(), paksa: cuacaPaksa, waktu: cuacaWaktu };
      };
      window.klasifikasiCuacaTatib = klasifikasiCuaca;
      function bacaCacheCuaca() {
        try {
          const o = JSON.parse(localStorage.getItem(KUNCI_CUACA) || 'null');
          if (o && cuacaValid.indexOf(o.c) >= 0 && Date.now() - o.t < CUACA_KADALUARSA) return o;
        } catch (e) {}
        return null;
      }
      function simpanCacheCuaca(c) { try { localStorage.setItem(KUNCI_CUACA, JSON.stringify({ c, t: Date.now() })); } catch (e) {} }
      function setCuacaAsli(c, t) {
        cuacaAsli = c; cuacaWaktu = t;
        if (!cuacaPaksa) terapkanCuaca(c);
        window.dispatchEvent(new CustomEvent('ambientCuacaDiperbarui'));
      }
      async function muatCuaca(paksaMuat) {
        const cache = bacaCacheCuaca();
        if (cache && !paksaMuat && Date.now() - cache.t < CUACA_TTL) { setCuacaAsli(cache.c, cache.t); return; }
        if (cache) setCuacaAsli(cache.c, cache.t); // tampilkan dulu data lama sambil menunggu
        try {
          const ctl = typeof AbortController === 'function' ? new AbortController() : null;
          const timer = setTimeout(() => ctl && ctl.abort(), 7000);
          const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + CUACA_LAT + '&longitude=' + CUACA_LON +
            '&current=weather_code,precipitation,cloud_cover&hourly=precipitation_probability&forecast_hours=2&timezone=Asia%2FJakarta';
          const res = await fetch(url, ctl ? { signal: ctl.signal } : undefined);
          clearTimeout(timer);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const c = klasifikasiCuaca(await res.json());
          simpanCacheCuaca(c);
          setCuacaAsli(c, Date.now());
        } catch (e) {
          // gagal/offline: tetap pakai data lama (<3 jam) atau cerah; tanpa pesan galat ke siswa
          if (!cache) setCuacaAsli('cerah', 0);
        }
      }
      window.muatCuacaTatib = muatCuaca;
      muatCuaca(false);
      setInterval(() => { if (!document.hidden) muatCuaca(false); }, CUACA_TTL);
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) { const c = bacaCacheCuaca(); if (!c || Date.now() - c.t >= CUACA_TTL) muatCuaca(false); }
      });

      // ---- Mode ringan: otomatis untuk HP lemah, bisa diubah manual (window.setAmbientRingan) ----
      // Alasan: ~150 animasi + banyak elemen berat untuk HP RAM kecil / CPU lambat.
      const KUNCI_RINGAN = 'tatibAmbientRingan'; // '1' = paksa ringan, '0' = paksa penuh, kosong = otomatis
      function bacaPilihan() { try { return localStorage.getItem(KUNCI_RINGAN); } catch (e) { return null; } }
      function simpanPilihan(v) { try { v === null ? localStorage.removeItem(KUNCI_RINGAN) : localStorage.setItem(KUNCI_RINGAN, v); } catch (e) {} }
      function terapkanRingan(on) {
        if (bgRoot) bgRoot.classList.toggle('ambient-ringan', !!on);
        window.dispatchEvent(new CustomEvent('ambientRinganChanged', { detail: { ringan: !!on } }));
      }
      function perangkatLemah() {
        const mem = navigator.deviceMemory;          // GB (Chrome/Android)
        const inti = navigator.hardwareConcurrency;  // jumlah core
        const hemat = navigator.connection && navigator.connection.saveData;
        return !!hemat || (mem && mem <= 3) || (inti && inti <= 4);
      }
      // null = otomatis, true/false = paksa
      window.setAmbientRingan = function (nilai) {
        if (nilai === null || nilai === undefined || nilai === 'auto') {
          simpanPilihan(null);
          terapkanRingan(perangkatLemah());
        } else {
          simpanPilihan(nilai ? '1' : '0');
          terapkanRingan(!!nilai);
        }
      };
      window.ambientRinganAktif = function () { return !!(bgRoot && bgRoot.classList.contains('ambient-ringan')); };
      window.ambientRinganPilihan = bacaPilihan;
      (function () {
        const p = bacaPilihan();
        if (p === '1') return terapkanRingan(true);
        if (p === '0') return terapkanRingan(false);
        terapkanRingan(perangkatLemah());
        // Pantau kelancaran 4 detik pertama; kalau patah-patah, otomatis beralih ke mode ringan.
        if (window.ambientRinganAktif()) return;
        setTimeout(() => {
          let n = 0, lambat = 0, last = performance.now(), akhir = last + 4000;
          (function f(t) {
            const d = t - last; last = t;
            if (!document.hidden && d < 250) { n++; if (d > 40) lambat++; } // >40 ms = di bawah 25 fps
            if (t < akhir) requestAnimationFrame(f);
            else if (n > 30 && lambat / n > 0.35 && bacaPilihan() === null) terapkanRingan(true);
          })(last);
        }, 2500);
      })();

      document.addEventListener('visibilitychange', () => {
        document.documentElement.classList.toggle('tab-tersembunyi', document.hidden);
      });
    })();
