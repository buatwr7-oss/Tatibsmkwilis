import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  limit,
  runTransaction,
  writeBatch,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { AFIRMASI_SISWA, AFIRMASI_GURU } from "./afirmasi.js?v=4.8.1";
import { dataPilihan, visiMisi } from "./aturan.js?v=4.8.1";
import { FITUR, AMBIENT_DIAM_MS } from "./fitur.js?v=4.8.1";
import { PESAN_ALUMNI } from "./pesan-alumni.js?v=4.8.1";

const firebaseConfig = {
  apiKey: "AIzaSyC-zHaBz23d-ICl-CFxXzXydJ7Sb7zWRpc",
  authDomain: "tatib-smk-wiraguna.firebaseapp.com",
  projectId: "tatib-smk-wiraguna",
  storageBucket: "tatib-smk-wiraguna.firebasestorage.app",
  messagingSenderId: "80347778161",
  appId: "1:80347778161:web:cd92d4b9816b82a983d050",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Ekspos ke window agar bisa diakses secara global
window.auth = auth;
window.db = db;
window.fbAuth = { signInWithEmailAndPassword };
window.fbFirestore = {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  orderBy,
  where,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  limit,
  runTransaction,
  writeBatch,
  getCountFromServer,
};
console.log("🔥 Firebase Firestore & Auth Terhubung ke Tatib SMK Wiraguna!");

// Promise yang selesai saat Firebase Auth selesai memulihkan sesi guru
const authReady = new Promise((resolve) => {
  const unsub = onAuthStateChanged(auth, (user) => {
    unsub();
    resolve(user);
  });
});

// ==========================================
// KONSTANTA & HELPER UMUM
// ==========================================
const $ = (id) => document.getElementById(id);

const SESSION_SISWA_MS = 12 * 60 * 60 * 1000; // sesi siswa berlaku 12 jam
const CACHE_KEY = "master_siswa_cache_v2";
const CACHE_TTL_MS = 2 * 60 * 1000; // cache data siswa 2 menit
const MAX_RIWAYAT = 200; // batasi riwayat per siswa (limit dokumen Firestore 1MB)
const CHAT_MAX_LEN = 250;
const CHAT_COOLDOWN_MS = 1500;
const MAX_LAPORAN_BUG_AKTIF = 20; // total laporan bug/masukan yang boleh menumpuk sebelum ditutup sementara
const MAX_LAPORAN_BUG_PER_HARI = 10; // batas kirim per pengirim per hari
// Hemat kuota baca/tulis Firestore: tanda aktif tiap 2 menit (dulu 1 menit),
// siswa dianggap online selama < 4,5 menit sejak tanda terakhir (dulu 2,5 menit).
const HEARTBEAT_MS = 120000;
const ONLINE_THRESHOLD_MS = 270000;
const BATCH_CHUNK = 400;

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// SAPAAN SESUAI WAKTU & AFIRMASI HARIAN
// (daftar kalimat afirmasi ada di afirmasi.js)
// ==========================================
// Nama pembuka yang terlalu umum — dilewati, sapaan memakai kata berikutnya.
// Contoh: "Muhammad Fauzi" -> "Fauzi", "Siti Aminah" -> "Aminah".
const NAMA_UMUM_DILEWATI = new Set([
  "ahmad",
  "achmad",
  "akhmad",
  "ahmat",
  "muhammad",
  "muhamad",
  "muhamat",
  "mohammad",
  "mohamad",
  "mochamad",
  "muchamad",
  "mhd",
  "muh",
  "moh",
  "moch",
  "m",
  "siti",
  "sity",
  "st",
  "nur",
]);
// Gelar di depan nama (Drs., Hj., Dr., dst.) tidak dipakai sebagai nama panggilan.
const GELAR_DEPAN = /^(drs?a?|hj?|ir|prof|kh|ust|ustadz|ustadzah)$/i;

function kapitalAwal(kata) {
  return String(kata)
    .toLowerCase()
    .replace(/(^|-)([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

// "BAGAS PRATAMA" -> "Bagas" • "Muhammad Fauzi" -> "Fauzi" • "Ade Rahayu, S.Pd" -> "Ade"
function namaPanggilan(namaLengkap) {
  const tanpaGelarBelakang = String(namaLengkap || "").split(",")[0];
  const kata = tanpaGelarBelakang
    .replace(/\./g, " ")
    .split(/\s+/)
    .filter((k) => k && !GELAR_DEPAN.test(k));
  if (!kata.length) return "";
  let i = 0;
  while (i < kata.length - 1 && NAMA_UMUM_DILEWATI.has(kata[i].toLowerCase())) {
    i++;
  }
  return kapitalAwal(kata[i]);
}

// Guru: "Bu Ade" / "Pak Ade" (dari field `jk` L/P di teachers/{email});
// kalau `jk` kosong, cukup nama tanpa Pak/Bu. Field opsional `panggilan`
// di dokumen guru, kalau diisi, dipakai menggantikan nama otomatis.
function sapaGuru(u) {
  const jk = String((u && u.jk) || "")
    .trim()
    .toUpperCase()
    .charAt(0);
  const gelar = jk === "L" ? "Pak " : jk === "P" ? "Bu " : "";
  return gelar + ((u && u.panggilan) || namaPanggilan(u && u.nama));
}

function infoWaktuSapaan(d = new Date()) {
  const j = d.getHours();
  if (j >= 4 && j < 11) return { teks: "Selamat pagi", ikon: "☀️" };
  if (j >= 11 && j < 15) return { teks: "Selamat siang", ikon: "🌤️" };
  if (j >= 15 && j < 18) return { teks: "Selamat sore", ikon: "🌇" };
  return { teks: "Selamat malam", ikon: "🌙" };
}

// Sehari DUA kalimat: pagi (00.00-11.59) = kalimat pertama, siang-malam
// (12.00-23.59) = kalimat kedua. Sama untuk semua pengguna pada waktu yang sama.
function slotAfirmasi() {
  return new Date().getHours() < 12 ? 0 : 1;
}
function afirmasiSlot(daftar, slot) {
  if (!daftar || !daftar.length) return "";
  const d = new Date();
  const hari = Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000,
  );
  return daftar[(hari * 2 + slot) % daftar.length];
}

// Menampilkan kalimat dengan efek "balok berputar" (naik / turun).
// Gaya animasinya ada di style.css (.afm-teks).
function setAfirmasiTeks(el, teks, arah) {
  if (!el) return;
  const lama = el.querySelector(".afm-teks:not(.keluar)");
  if (lama && lama.dataset.t === teks) return;
  const baru = document.createElement("span");
  baru.className = "afm-teks";
  baru.dataset.t = teks;
  baru.textContent = teks;
  const diam =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Kalau perangkat memakai pengaturan "kurangi gerakan" (di Windows: Pengaturan
  // > Aksesibilitas > Efek visual > Efek animasi MATI), gulungan 3D diganti
  // pudar halus supaya tetap ada animasi yang nyaman.
  arah = diam ? "pudar" : arah === "turun" ? "turun" : "naik";
  // Bersihkan kelas animasi setelah selesai (animationend baru terpicu ketika
  // elemen benar-benar tampil, jadi animasi pembuka tidak "terbuang" saat
  // header masih tersembunyi).
  const bereskan = (node, hapus) => {
    node.addEventListener(
      "animationend",
      () => (hapus ? node.remove() : node.classList.remove("masuk", "naik", "turun")),
      { once: true },
    );
  };
  if (!lama) {
    // tampil pertama kali: kalimat "menggulung" masuk dari bawah
    baru.classList.add("masuk", arah);
    bereskan(baru, false);
    el.replaceChildren(baru);
    return;
  }
  el.querySelectorAll(".afm-teks.keluar").forEach((x) => x.remove());
  lama.classList.add("keluar", arah);
  baru.classList.add("masuk", arah);
  bereskan(lama, true);
  bereskan(baru, false);
  el.appendChild(baru);
}

// Status per elemen: slot asli (menurut jam) dan slot yang sedang ditampilkan
// (bisa dibalik dengan mengetuk tulisannya).
const AFM_GANTI_MS = 60000; // ganti kalimat otomatis tiap 1 menit
const afmStatus = new Map();
function perbaruiAfirmasi(idAfirmasi, daftar) {
  const el = $(idAfirmasi);
  if (!el) return;
  let st = afmStatus.get(idAfirmasi);
  if (!st) {
    st = { asli: -1, tampil: 0 };
    afmStatus.set(idAfirmasi, st);
    el.classList.add("afm-bisa-ketuk");
    const balik = () => {
      const s = afmStatus.get(idAfirmasi);
      s.tampil = s.tampil === 0 ? 1 : 0;
      setAfirmasiTeks(el, afirmasiSlot(s.daftar, s.tampil), "naik");
    };
    // Mengetuk = ganti kalimat; selain itu berganti sendiri tiap AFM_GANTI_MS
    // antara dua kalimat hari ini (hanya saat tab terlihat & header tampil).
    el.addEventListener("click", () => {
      balik();
      clearInterval(st.timer);
      st.timer = setInterval(otomatis, AFM_GANTI_MS);
    });
    const otomatis = () => {
      if (document.hidden || !el.getClientRects().length) return;
      balik();
    };
    st.timer = setInterval(otomatis, AFM_GANTI_MS);
  }
  st.daftar = daftar;
  const slot = slotAfirmasi();
  if (st.asli !== slot) {
    const pertama = st.asli === -1;
    st.asli = slot;
    st.tampil = slot;
    setAfirmasiTeks(el, afirmasiSlot(daftar, slot), pertama ? "naik" : "naik");
  } else {
    setAfirmasiTeks(el, afirmasiSlot(daftar, st.tampil), "naik");
  }
}

// Menulis sapaan ke elemen & memperbaruinya otomatis (tiap menit / saat
// aplikasi dibuka lagi) supaya "pagi" bisa berubah jadi "siang" tanpa refresh.
const sapaanAktif = new Map();
function pasangSapaan(kunci, idJudul, idAfirmasi, buatNama, daftarAfirmasi) {
  const terapkan = () => {
    const w = infoWaktuSapaan();
    const nama = buatNama();
    const elJudul = $(idJudul);
    const elAfirmasi = $(idAfirmasi);
    if (elJudul) {
      // \u00A0 = spasi tak terputus, supaya ikon tidak turun sendirian ke baris baru
      elJudul.textContent = nama
        ? `Hai ${nama}, ${w.teks}\u00A0${w.ikon}`
        : `${w.teks}\u00A0${w.ikon}`;
    }
    if (elAfirmasi) perbaruiAfirmasi(idAfirmasi, daftarAfirmasi);
  };
  sapaanAktif.set(kunci, terapkan);
  terapkan();
}
setInterval(() => sapaanAktif.forEach((f) => f()), 60000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) sapaanAktif.forEach((f) => f());
});

// Sapaan hanya untuk guru & kepala sekolah (Super Admin tetap memakai header biasa).
// ==========================================
// LATAR MENYESUAIKAN WAKTU (pagi / siang / sore / malam)
// Gaya langit ada di style.css: body[data-waktu="..."]
// ==========================================
const WARNA_TEMA_BROWSER = {
  pagi: "#a8dcff",
  siang: "#2e8bf0",
  sore: "#ff7a45",
  malam: "#050b1f",
};
function jenisLatar(d = new Date()) {
  const j = d.getHours();
  if (j >= 4 && j < 11) return "pagi";
  if (j >= 11 && j < 15) return "siang";
  if (j >= 15 && j < 18) return "sore";
  return "malam";
}
function terapkanLatarWaktu() {
  const k = jenisLatar();
  if (document.body.dataset.waktu === k) return;
  document.body.dataset.waktu = k;
  if (window.setAmbientMood) window.setAmbientMood(k); // latar suasana alam (ambient.js)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", WARNA_TEMA_BROWSER[k]);
}
terapkanLatarWaktu();
setInterval(terapkanLatarWaktu, 60000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) terapkanLatarWaktu();
});

function pasangSapaanStaf(user) {
  if (user.role === "Super Admin") return;
  pasangSapaan(
    "staf",
    "sapaanGuruJudul",
    "sapaanGuruAfirmasi",
    () => sapaGuru(user),
    AFIRMASI_GURU,
  );
}

// Tanggal & jam sesuai zona waktu perangkat (bukan UTC)
function pad2(n) {
  return String(n).padStart(2, "0");
}
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function localTimeStr(d = new Date()) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function localDateTimeStr(d = new Date()) {
  return `${localDateStr(d)} ${localTimeStr(d)}`;
}

function avatarFor(s) {
  if (s && s.fotoUrl) return s.fotoUrl;
  if (s && s.jk && String(s.jk).toUpperCase() === "P")
    return "assets/foto_siswa/avatar_p.webp";
  return "assets/foto_siswa/avatar_l.webp";
}

const AVATAR_ONERROR =
  "this.onerror=null;this.src='assets/foto_siswa/avatar.webp'";

// ==========================================
// CUSTOM MODAL (CUSTOM ALERT & CONFIRM)
// ==========================================
function injectCustomModalStyles() {
  if ($("customModalStyles")) return;
  const style = document.createElement("style");
  style.id = "customModalStyles";
  style.innerHTML = `
    #customPopupOverlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center; z-index: 99999;
      animation: fadeInModal 0.2s ease-out;
    }
    #customPopupBox {
      background: #111823; border: 2px solid #f1c40f; border-radius: 14px;
      padding: 20px 24px; width: 90%; max-width: 380px; text-align: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 15px rgba(241,196,15,0.3);
      color: #fff; font-family: inherit; animation: scaleInModal 0.2s ease-out;
    }
    #customPopupTitle {
      font-size: 15px; font-weight: bold; color: #f1c40f; margin-bottom: 8px;
    }
    #customPopupMessage {
      font-size: 12px; color: #cbd5e1; line-height: 1.5; margin-bottom: 20px;
      word-break: break-word; white-space: pre-line;
    }
    #customPopupButtons {
      display: flex; gap: 10px; justify-content: center;
    }
    .custom-popup-btn {
      width: auto; margin-top: 0;
      padding: 8px 18px; border-radius: 8px; font-size: 11px; font-weight: bold; cursor: pointer; border: none; transition: transform 0.1s;
    }
    .custom-popup-btn:active { transform: scale(0.95); }
    #customPopupBtnOk {
      background: linear-gradient(135deg, #f1c40f, #d4ac0d); color: #111; box-shadow: 0 4px 10px rgba(241,196,15,0.4);
    }
    #customPopupBtnCancel {
      background: #334155; color: #cbd5e1; box-shadow: none;
    }
    @keyframes fadeInModal { from { opacity: 0; } to { opacity: 1; } }
    @keyframes scaleInModal { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  `;
  document.head.appendChild(style);
}

let activePopupResolve = null;

// Pesan ditampilkan sebagai TEKS (bukan HTML) sehingga aman dari injeksi
function buildPopup({ message, title, isConfirm }) {
  return new Promise((resolve) => {
    injectCustomModalStyles();
    const existing = $("customPopupOverlay");
    if (existing) {
      existing.remove();
      if (activePopupResolve) activePopupResolve(false);
    }
    activePopupResolve = resolve;

    const overlay = document.createElement("div");
    overlay.id = "customPopupOverlay";

    const box = document.createElement("div");
    box.id = "customPopupBox";

    const titleEl = document.createElement("div");
    titleEl.id = "customPopupTitle";
    titleEl.textContent = title;

    const msgEl = document.createElement("div");
    msgEl.id = "customPopupMessage";
    msgEl.textContent = message;

    const btnWrap = document.createElement("div");
    btnWrap.id = "customPopupButtons";

    const finish = (val) => {
      overlay.remove();
      activePopupResolve = null;
      resolve(val);
    };

    if (isConfirm) {
      const btnCancel = document.createElement("button");
      btnCancel.id = "customPopupBtnCancel";
      btnCancel.type = "button";
      btnCancel.className = "custom-popup-btn";
      btnCancel.textContent = "Batal";
      btnCancel.onclick = () => finish(false);
      btnWrap.appendChild(btnCancel);
    }

    const btnOk = document.createElement("button");
    btnOk.id = "customPopupBtnOk";
    btnOk.type = "button";
    btnOk.className = "custom-popup-btn";
    btnOk.textContent = isConfirm ? "Ya, Lanjutkan" : "OK";
    btnOk.onclick = () => finish(true);
    btnWrap.appendChild(btnOk);

    box.append(titleEl, msgEl, btnWrap);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    btnOk.focus();
  });
}

window.customAlert = function (message, title = "INFORMASI SISTEM") {
  return buildPopup({ message, title, isConfirm: false });
};

window.customConfirm = function (message, title = "KONFIRMASI TINDAKAN") {
  return buildPopup({ message, title, isConfirm: true });
};

// Konfirmasi berpengaman: tombol baru aktif setelah pengguna mengetik kata kunci.
// Dipakai untuk tindakan yang menghapus data banyak siswa sekaligus.
window.konfirmasiKetik = function (message, title, kata) {
  return new Promise((resolve) => {
    injectCustomModalStyles();
    const existing = $("customPopupOverlay");
    if (existing) {
      existing.remove();
      if (activePopupResolve) activePopupResolve(false);
    }
    activePopupResolve = resolve;

    const overlay = document.createElement("div");
    overlay.id = "customPopupOverlay";
    const box = document.createElement("div");
    box.id = "customPopupBox";
    const titleEl = document.createElement("div");
    titleEl.id = "customPopupTitle";
    titleEl.textContent = title;
    const msgEl = document.createElement("div");
    msgEl.id = "customPopupMessage";
    msgEl.textContent = message;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "adm-kunci-input";
    input.placeholder = kata;
    input.autocomplete = "off";
    input.setAttribute("autocapitalize", "characters");

    const btnWrap = document.createElement("div");
    btnWrap.id = "customPopupButtons";
    const finish = (val) => {
      overlay.remove();
      activePopupResolve = null;
      resolve(val);
    };
    const btnCancel = document.createElement("button");
    btnCancel.id = "customPopupBtnCancel";
    btnCancel.type = "button";
    btnCancel.className = "custom-popup-btn";
    btnCancel.textContent = "Batal";
    btnCancel.onclick = () => finish(false);
    const btnOk = document.createElement("button");
    btnOk.id = "customPopupBtnOk";
    btnOk.type = "button";
    btnOk.className = "custom-popup-btn";
    btnOk.textContent = "Eksekusi";
    btnOk.disabled = true;
    btnOk.style.opacity = "0.4";
    btnOk.onclick = () => {
      if (input.value.trim().toUpperCase() === kata) finish(true);
    };
    input.oninput = () => {
      const cocok = input.value.trim().toUpperCase() === kata;
      btnOk.disabled = !cocok;
      btnOk.style.opacity = cocok ? "1" : "0.4";
      input.classList.toggle("cocok", cocok);
    };
    input.onkeydown = (ev) => {
      if (ev.key === "Enter") btnOk.onclick();
    };
    btnWrap.append(btnCancel, btnOk);
    box.append(titleEl, msgEl, input, btnWrap);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
  });
};

// ==========================================
// STATE GLOBAL
// ==========================================
let currentRole = "";
let currentUser = null; // data guru/admin yang sedang login
let isMultiMode = true;
let currentNisnSiswa = ""; // NISN siswa yang sedang login
let masterDataSiswa = [];
let masterDataTugas = [];
let masterLoadError = null; // galat terakhir saat memuat data siswa (null = sukses)

function getMyNisn() {
  return currentNisnSiswa || localStorage.getItem("activeUser") || "";
}

// ==========================================
// PRELOADER (AMAN: tidak akan macet jika ada error)
// ==========================================
let preloaderInterval = null;
let preloaderHideTimeout = null;

// Cegah spam klik / double-submit: selama preloader berjalan, panggilan baru diabaikan
let preloaderBusy = false;
let preloaderWatchdog = null;

function showGamePreloader(customTitle, callback) {
  if (preloaderBusy) {
    console.warn(
      "Preloader sedang berjalan, permintaan diabaikan (cegah entri ganda).",
    );
    return;
  }
  preloaderBusy = true;

  // Jaga-jaga: kalau karena bug suatu proses lupa memanggil done(), jangan sampai
  // seluruh aplikasi terkunci permanen. Lepas paksa setelah 20 detik.
  if (preloaderWatchdog) clearTimeout(preloaderWatchdog);
  preloaderWatchdog = setTimeout(() => {
    if (preloaderBusy) {
      console.warn("Preloader macet lebih dari 20 detik, dilepas paksa.");
      preloaderBusy = false;
      const stuck = $("gamePreloader");
      if (stuck) stuck.classList.add("hidden");
    }
  }, 20000);

  const preloader = $("gamePreloader");
  $("loadingTitleText").innerText = customTitle;
  const fillEl = $("progressBarFill");
  const percentEl = $("loadingPercentText");

  if (preloaderInterval) clearInterval(preloaderInterval);
  if (preloaderHideTimeout) clearTimeout(preloaderHideTimeout);

  preloader.classList.remove("hidden");
  let currentPercent = 0;
  fillEl.style.width = "0%";
  percentEl.innerText = "0%";

  preloaderInterval = setInterval(() => {
    if (currentPercent < 85) {
      currentPercent += 15;
      fillEl.style.width = currentPercent + "%";
      percentEl.innerText = currentPercent + "%";
    }
  }, 80);

  let finished = false;
  const finishLoading = () => {
    if (finished) return;
    finished = true;
    clearInterval(preloaderInterval);
    preloaderInterval = null;
    fillEl.style.width = "100%";
    percentEl.innerText = "100%";
    preloaderHideTimeout = setTimeout(() => {
      preloader.classList.add("hidden");
      preloaderBusy = false;
      if (preloaderWatchdog) {
        clearTimeout(preloaderWatchdog);
        preloaderWatchdog = null;
      }
    }, 300);
  };

  if (callback) {
    try {
      const result = callback(finishLoading);
      if (result && typeof result.catch === "function") {
        result.catch((err) => {
          console.error("Error tak tertangani di preloader:", err);
          finishLoading();
        });
      }
    } catch (err) {
      console.error("Error di preloader:", err);
      finishLoading();
    }
  }
}

// ==========================================
// FUNGSI PEMANGGIL CERDAS AVATAR KLIK
// ==========================================
window.handleAvatarClick = function () {
  const fotoUrl = window.currentStudentDataCache?.fotoUrl;
  if (
    !fotoUrl ||
    fotoUrl.includes("avatar.webp") ||
    fotoUrl.includes("avatar_l.webp") ||
    fotoUrl.includes("avatar_p.webp")
  ) {
    window.bukaModalGantiFoto();
  } else {
    window.bukaPreviewFoto();
  }
};

// ==========================================
// SISTEM ONLINE STATUS (BERBASIS FIRESTORE)
// ==========================================
let heartbeatInterval = null;
let presenceNisn = "";

// Waktu terakhir pengguna menyentuh / mengetik di aplikasi. Dikirim bersama
// heartbeat supaya perangkat lain tahu apakah pemilik akun sedang di layar.
let interaksiTerakhir = Date.now();
["pointerdown", "keydown", "touchstart", "scroll"].forEach((ev) =>
  window.addEventListener(
    ev,
    () => {
      interaksiTerakhir = Date.now();
    },
    { passive: true, capture: true },
  ),
);
let presenceTanpaInteraksi = false; // jadi true bila rules belum menerima lastInteract

async function updatePresence(state) {
  if (!presenceNisn) return;
  try {
    const { doc, setDoc } = window.fbFirestore;
    const data = { state, lastActive: Date.now() };
    if (!presenceTanpaInteraksi) data.lastInteract = interaksiTerakhir;
    await setDoc(doc(window.db, "status", presenceNisn), data, { merge: true });
  } catch (e) {
    if (!presenceTanpaInteraksi && e && e.code === "permission-denied") {
      presenceTanpaInteraksi = true; // rules lama: kirim ulang tanpa lastInteract
      return updatePresence(state);
    }
    console.error("Gagal update status online:", e);
  }
}

const onBeforeUnloadPresence = () => {
  updatePresence("offline");
};
const onVisibilityPresence = () => {
  if (presenceNisn && document.visibilityState === "visible") {
    updatePresence("online");
  }
};

function initOnlineStatusEngine(nisn) {
  stopOnlineStatusEngine(false);
  if (!nisn) return;
  presenceNisn = nisn;

  updatePresence("online");
  heartbeatInterval = setInterval(() => updatePresence("online"), HEARTBEAT_MS);

  window.addEventListener("beforeunload", onBeforeUnloadPresence);
  document.addEventListener("visibilitychange", onVisibilityPresence);
}

function stopOnlineStatusEngine(setOffline = true) {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = null;
  window.removeEventListener("beforeunload", onBeforeUnloadPresence);
  document.removeEventListener("visibilitychange", onVisibilityPresence);
  if (setOffline && presenceNisn) updatePresence("offline");
  presenceNisn = "";
}

// ==========================================
// SATU PERANGKAT AKTIF PER AKUN SISWA (dengan izin pemilik)
// ==========================================
// Aturan:
//  - Pemilik tidak sedang memakai akun (offline / tidak menyentuh layar > 5 menit)
//    -> login baru langsung diterima, pemilik diberi tahu nanti.
//  - Pemilik sedang aktif memakai akun -> login baru HARUS menunggu persetujuan
//    pemilik (pop-up Izinkan / Tolak, batas 60 detik). Pemilik tidak dikeluarkan
//    sebelum dia menekan Izinkan.
//  - Login dari perangkat yang sama (deviceId sama) tidak pernah ditanya.
// Semua disimpan di dokumen status/{nisn}. Ini fitur kenyamanan, bukan pengaman
// mutlak (siswa tidak memakai Firebase Auth); kalau pengecekan gagal, login tetap jalan.
const SESI_KEY = "activeSessionId";
const DEVICE_KEY = "deviceId";
const PEMILIK_HADIR_MS = 5 * 60 * 1000;
const IZIN_TIMEOUT_MS = 60 * 1000;
let sesiIdAktif = "";
let sesiUnsub = null;
let izinReqAktif = null;

function buatSesiId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function deviceIdLokal() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = buatSesiId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// Contoh: "Android • Chrome"
function labelPerangkat() {
  const ua = navigator.userAgent || "";
  const os = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iPhone/iPad"
      : /Windows/i.test(ua)
        ? "Windows"
        : /Mac OS/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Perangkat lain";
  const br = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /Firefox/i.test(ua)
        ? "Firefox"
        : /Chrome/i.test(ua)
          ? "Chrome"
          : /Safari/i.test(ua)
            ? "Safari"
            : "Browser";
  return `${os} • ${br}`;
}

function jamLokal(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ---- sisi perangkat BARU: minta izin pemilik ----
// Hasil: "allowed" | "denied" | "timeout" | "batal" | "error"
function mintaIzinPemilik(nisn) {
  return new Promise((resolve) => {
    const { doc, setDoc, onSnapshot } = window.fbFirestore;
    const ref = doc(window.db, "status", nisn);
    const reqId = buatSesiId();
    const modal = $("modalMenungguIzin");
    const elDetik = $("menungguIzinDetik");
    let selesai = false;
    let unsub = null;
    let timer = null;
    let tick = null;
    const mulai = Date.now();

    const akhiri = async (hasil, bersihkan) => {
      if (selesai) return;
      selesai = true;
      if (unsub) unsub();
      clearTimeout(timer);
      clearInterval(tick);
      if (modal) modal.classList.add("hidden");
      window.batalMenungguIzin = null;
      if (bersihkan) {
        try {
          await setDoc(ref, { req: null }, { merge: true });
        } catch (e) {
          /* abaikan */
        }
      }
      resolve(hasil);
    };

    window.batalMenungguIzin = () => akhiri("batal", true);

    setDoc(
      ref,
      {
        req: {
          id: reqId,
          ts: mulai,
          device: labelPerangkat(),
          status: "pending",
        },
      },
      { merge: true },
    )
      .then(() => {
        if (selesai) return;
        if (modal) modal.classList.remove("hidden");
        const perbaruiDetik = () => {
          const sisa = Math.max(
            0,
            Math.ceil((IZIN_TIMEOUT_MS - (Date.now() - mulai)) / 1000),
          );
          if (elDetik) elDetik.textContent = String(sisa);
        };
        perbaruiDetik();
        tick = setInterval(perbaruiDetik, 1000);

        unsub = onSnapshot(
          ref,
          (snap) => {
            const r = snap.exists() ? snap.data().req : null;
            if (!r || r.id !== reqId) return;
            if (r.status === "allowed") akhiri("allowed", false);
            else if (r.status === "denied") akhiri("denied", true);
          },
          () => akhiri("error", true),
        );

        timer = setTimeout(async () => {
          // pemilik tidak menjawab: tinggalkan catatan supaya dia tahu nanti
          try {
            await setDoc(
              ref,
              {
                alert: {
                  ts: Date.now(),
                  device: labelPerangkat(),
                  hasil: "tidak direspons",
                  sid: reqId,
                },
              },
              { merge: true },
            );
          } catch (e) {
            /* abaikan */
          }
          akhiri("timeout", true);
        }, IZIN_TIMEOUT_MS);
      })
      .catch((e) => {
        console.warn("Permintaan izin tidak terkirim:", e);
        akhiri("error", false);
      });
  });
}

// baru=true  : login baru (bisa diminta izin pemilik)
// baru=false : memulihkan sesi (refresh / buka lagi)
// Hasil: "ok" | "diambil" | "denied" | "timeout" | "batal"
async function klaimSesiSiswa(nisn, baru) {
  try {
    const { doc, getDoc, setDoc } = window.fbFirestore;
    const ref = doc(window.db, "status", nisn);
    const snap = await getDoc(ref);
    const d = snap.exists() ? snap.data() : {};
    const devId = deviceIdLokal();
    const now = Date.now();

    if (!baru) {
      let id = localStorage.getItem(SESI_KEY) || "";
      if (id && d.sessionId && d.sessionId !== id) return "diambil";
      if (!id) id = buatSesiId();
      await setDoc(
        ref,
        {
          state: "online",
          lastActive: Date.now(),
          sessionId: id,
          deviceId: devId,
          lastInteract: interaksiTerakhir,
        },
        { merge: true },
      );
      localStorage.setItem(SESI_KEY, id);
      sesiIdAktif = id;
      return "ok";
    }

    const adaSesiLain = !!d.sessionId && d.deviceId !== devId;
    const aktif =
      adaSesiLain &&
      d.state === "online" &&
      now - (d.lastActive || 0) < ONLINE_THRESHOLD_MS;
    const hadir = aktif && now - (d.lastInteract || 0) < PEMILIK_HADIR_MS;

    if (hadir) {
      const izin = await mintaIzinPemilik(nisn);
      if (izin !== "allowed" && izin !== "error") return izin;
    }

    const id = buatSesiId();
    const data = {
      state: "online",
      lastActive: Date.now(),
      sessionId: id,
      deviceId: devId,
      lastInteract: interaksiTerakhir,
      req: null,
    };
    if (adaSesiLain && !hadir) {
      data.alert = {
        ts: Date.now(),
        device: labelPerangkat(),
        hasil: "diambil alih",
        sid: id,
      };
    }
    await setDoc(ref, data, { merge: true });
    localStorage.setItem(SESI_KEY, id);
    sesiIdAktif = id;
    return "ok";
  } catch (e) {
    console.warn("Kunci satu-perangkat tidak aktif:", e);
    sesiIdAktif = "";
    return "ok";
  }
}

function pesanLoginDitolak(hasil) {
  if (hasil === "denied") {
    window.customAlert(
      "⛔ Pemilik akun menolak permintaan masuk. Kalau kamu pemilik akun, keluar dulu dari perangkat yang lain, lalu coba lagi.",
    );
  } else if (hasil === "timeout") {
    window.customAlert(
      "⌛ Akun ini sedang dipakai di perangkat lain dan pemilik belum menjawab. Kalau kamu pemilik akun, keluar dulu dari perangkat lain lalu coba lagi.",
    );
  }
}

// ---- sisi perangkat PEMILIK ----
function stopPantauSesi() {
  if (sesiUnsub) sesiUnsub();
  sesiUnsub = null;
}

function sembunyikanIzinLogin() {
  izinReqAktif = null;
  const m = $("modalIzinLogin");
  if (m) m.classList.add("hidden");
}

function tampilkanIzinLogin(r) {
  izinReqAktif = r;
  $("izinLoginPerangkat").textContent = r.device || "perangkat lain";
  $("izinLoginWaktu").textContent = jamLokal(r.ts || Date.now());
  $("modalIzinLogin").classList.remove("hidden");
}

window.jawabIzinLogin = async function (boleh) {
  const r = izinReqAktif;
  const nisn = getMyNisn();
  sembunyikanIzinLogin();
  if (!r || !nisn) return;
  try {
    const { doc, setDoc } = window.fbFirestore;
    await setDoc(
      doc(window.db, "status", nisn),
      { req: { ...r, status: boleh ? "allowed" : "denied" } },
      { merge: true },
    );
  } catch (e) {
    console.error("Gagal mengirim jawaban izin:", e);
  }
  if (!boleh) {
    window.customAlert(
      "✅ Permintaan masuk sudah ditolak. Kalau kamu curiga PIN-mu diketahui orang lain, segera ganti PIN di tab Profil.",
    );
  }
};

function pantauSesiSiswa(nisn) {
  stopPantauSesi();
  if (!sesiIdAktif) return;
  const { doc, onSnapshot } = window.fbFirestore;
  sesiUnsub = onSnapshot(
    doc(window.db, "status", nisn),
    (snap) => {
      const d = snap.exists() ? snap.data() : {};
      if (d.sessionId && sesiIdAktif && d.sessionId !== sesiIdAktif) {
        keluarKarenaSesiLain();
        return;
      }
      const r = d.req;
      if (
        r &&
        r.status === "pending" &&
        Date.now() - (r.ts || 0) < IZIN_TIMEOUT_MS + 10000
      ) {
        if (!izinReqAktif || izinReqAktif.id !== r.id) tampilkanIzinLogin(r);
      } else if (izinReqAktif) {
        sembunyikanIzinLogin();
      }
    },
    (e) => console.warn("Gagal memantau sesi:", e),
  );
}

function keluarKarenaSesiLain() {
  stopPantauSesi();
  // jangan menandai "offline": akun ini sedang aktif di perangkat yang baru
  stopOnlineStatusEngine(false);
  cleanupStudentSession();
  localStorage.removeItem("activeUser");
  localStorage.removeItem("activeUserExpiry");
  showScreen("menu");
  window.customAlert(
    "🔒 Akunmu dibuka di perangkat lain, jadi kamu otomatis keluar dari perangkat ini. Kalau itu bukan kamu, segera login lagi lalu ganti PIN.",
  );
}

// Catatan "ada yang masuk / mencoba masuk" yang ditinggalkan saat pemilik tidak di layar.
// Ditampilkan sekali ke pemilik, tidak ke orang yang membuat catatan itu.
async function cekPeringatanLogin(nisn) {
  try {
    const { doc, getDoc, setDoc } = window.fbFirestore;
    const ref = doc(window.db, "status", nisn);
    const snap = await getDoc(ref);
    const al = snap.exists() ? snap.data().alert : null;
    if (!al || al.sid === sesiIdAktif) return;
    await setDoc(ref, { alert: null }, { merge: true });
    window.customAlert(
      `⚠️ Akunmu ${al.hasil === "tidak direspons" ? "dicoba dibuka" : "dibuka"} dari ${al.device} pada pukul ${jamLokal(al.ts)} (${al.hasil}). Kalau itu kamu, abaikan pesan ini. Kalau bukan, segera ganti PIN di tab Profil.`,
    );
  } catch (e) {
    console.warn("Gagal memeriksa peringatan login:", e);
  }
}

// Saat keluar manual: lepaskan kunci sesi supaya login berikutnya tidak dianggap "perangkat lain"
async function lepasSesiServer(nisn) {
  if (!nisn || !sesiIdAktif) return;
  try {
    const { doc, getDoc, setDoc } = window.fbFirestore;
    const ref = doc(window.db, "status", nisn);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().sessionId === sesiIdAktif) {
      await setDoc(
        ref,
        { sessionId: "", state: "offline", lastActive: Date.now() },
        { merge: true },
      );
    }
  } catch (e) {
    console.warn("Gagal melepas sesi:", e);
  }
}

// ==========================================
// PENGINGAT GANTI PIN BAWAAN (123456) SAAT LOGIN
// Bisa ditutup; muncul lagi setiap login selama PIN belum diganti.
// ==========================================
function perluGantiPinBawaan(siswa) {
  const serverPin = siswa.pin !== undefined ? String(siswa.pin) : "123456";
  return !siswa.hasChangedPin && serverPin === "123456";
}

function cekWajibGantiPin(siswa) {
  const modal = $("modalWajibGantiPin");
  if (!modal) return;
  if (perluGantiPinBawaan(siswa)) {
    $("wajibPinBaru").value = "";
    $("wajibPinUlang").value = "";
    $("wajibPinError").style.display = "none";
    modal.classList.remove("hidden");
  } else {
    modal.classList.add("hidden");
  }
}

window.tutupWajibPin = function () {
  const modal = $("modalWajibGantiPin");
  if (modal) modal.classList.add("hidden");
};

let pinWajibBusy = false;
window.simpanPinWajib = async function () {
  if (pinWajibBusy) return;
  const nisn = getMyNisn();
  if (!nisn) return;
  const baru = $("wajibPinBaru").value.trim();
  const ulang = $("wajibPinUlang").value.trim();
  const err = $("wajibPinError");
  const tampilError = (t) => {
    err.textContent = t;
    err.style.display = "block";
  };

  if (!/^\d{4,6}$/.test(baru))
    return tampilError("PIN baru harus berupa 4 sampai 6 angka.");
  if (baru === "123456")
    return tampilError("PIN baru tidak boleh sama dengan PIN bawaan (123456).");
  if (baru !== ulang)
    return tampilError("Pengulangan PIN tidak sama. Coba ketik lagi.");

  pinWajibBusy = true;
  const btn = $("btnSimpanPinWajib");
  if (btn) btn.disabled = true;
  try {
    const { doc, updateDoc } = window.fbFirestore;
    await updateDoc(doc(window.db, "siswa", nisn), {
      pin: baru,
      hasChangedPin: true,
    });
    $("modalWajibGantiPin").classList.add("hidden");
    const kartuPin = $("cardGantiPin");
    if (kartuPin) kartuPin.style.display = "none";
    $("wajibPinBaru").value = "";
    $("wajibPinUlang").value = "";
    err.style.display = "none";
    window.customAlert("✅ PIN berhasil diganti. Ingat PIN barumu, ya!");
  } catch (e) {
    console.error("Gagal menyimpan PIN wajib:", e);
    tampilError("Gagal menyimpan PIN. Periksa koneksi internet kamu.");
  } finally {
    pinWajibBusy = false;
    if (btn) btn.disabled = false;
  }
};

function formatLastActive(timestamp) {
  if (!timestamp) return "Offline";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Terakhir aktif baru saja";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Terakhir aktif ${minutes} menit yang lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Terakhir aktif ${hours} jam yang lalu`;
  return "Terakhir aktif kemarin";
}

// Mengembalikan fungsi unsubscribe. Status dievaluasi ulang berkala
// agar teman yang menutup tab tanpa sempat "offline" tetap terdeteksi.
function subscribeStatus(friendNisn, callback) {
  const { doc, onSnapshot } = window.fbFirestore;
  let last = null;

  const evaluate = () => {
    if (!last) {
      callback({ state: "offline", text: "Offline", isOnline: false });
      return;
    }
    const elapsed = Date.now() - (last.lastActive || 0);
    if (last.state === "online" && elapsed < ONLINE_THRESHOLD_MS) {
      callback({ state: "online", text: "Online", isOnline: true });
    } else {
      callback({
        state: "offline",
        text: formatLastActive(last.lastActive),
        isOnline: false,
      });
    }
  };

  const unsub = onSnapshot(
    doc(window.db, "status", friendNisn),
    (docSnap) => {
      last = docSnap.exists() ? docSnap.data() : null;
      evaluate();
    },
    (err) => console.error("Gagal listen status teman:", err),
  );
  const timer = setInterval(evaluate, 30000);
  return () => {
    unsub();
    clearInterval(timer);
  };
}

let friendStatusListeners = {};
let friendListeners = {};

function unsubscribeAllFriendListeners() {
  clearTimeout(statusTemanLepasTimer);
  statusTemanLepasTimer = null;
  Object.values(friendListeners).forEach((u) => typeof u === "function" && u());
  Object.values(friendStatusListeners).forEach(
    (u) => typeof u === "function" && u(),
  );
  friendListeners = {};
  friendStatusListeners = {};
}

// ==========================================
// SESI SISWA
// ==========================================
let activeStudentDocListener = null;
let lastFriendSignature = "";

function cleanupStudentSession() {
  if (activeStudentDocListener) {
    activeStudentDocListener();
    activeStudentDocListener = null;
  }
  unsubscribeAllFriendListeners();
  detachChatRoomListener();
  currentChatTargetNisn = "";
  if (globalChatActiveListener) {
    globalChatActiveListener();
    globalChatActiveListener = null;
  }
  stopGlobalOnlineListener();
  stopPantauSesi();
  barPrev = null; // login berikutnya: bar terisi dari kosong lagi
  sembunyikanIzinLogin();
  const modalMenunggu = $("modalMenungguIzin");
  if (modalMenunggu) modalMenunggu.classList.add("hidden");
  sesiIdAktif = "";
  localStorage.removeItem(SESI_KEY);
  const modalPin = $("modalWajibGantiPin");
  if (modalPin) modalPin.classList.add("hidden");
  stopOnlineStatusEngine(true);

  currentNisnSiswa = "";
  lastFriendSignature = "";
  friendState = {};
  globalUnread = 0;
  globalSeenTs = 0;
  siswaActiveTab = "profil";
  window.currentStudentDataCache = null;
  window.currentStudentNisn = "";

  [
    "listTemanContainer",
    "containerUndanganMasuk",
    "chatListContainer",
    "chatMessageContainer",
    "globalChatContainer",
    "globalOnlineList",
  ].forEach((id) => {
    const el = $(id);
    if (el) el.innerHTML = "";
  });

  const roomView = $("chatRoomView");
  const listView = $("chatListView");
  if (roomView) roomView.classList.add("hidden");
  if (listView) listView.classList.remove("hidden");

  isAlumniSession = false;
  const alumniView = $("alumniTranscriptView");
  if (alumniView) alumniView.classList.add("hidden");

  setSiswaAppMode(false);
}

function initStudentRealtimeListener(nisn) {
  if (activeStudentDocListener) activeStudentDocListener();
  lastFriendSignature = "";
  try {
    const { doc, onSnapshot } = window.fbFirestore;
    activeStudentDocListener = onSnapshot(
      doc(window.db, "siswa", nisn),
      (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        window.currentStudentDataCache = data;
        window.currentStudentNisn = nisn;

        // Profil (HP, poin, riwayat) ikut diperbarui secara realtime
        tampilkanProfilSiswa(data, nisn);

        // Daftar teman hanya dirender ulang jika memang berubah
        const sig = JSON.stringify([data.friends || [], data.requests || []]);
        if (sig !== lastFriendSignature) {
          lastFriendSignature = sig;
          setupFriendHub(data.friends || [], data.requests || []);
        }
      },
      (err) => console.error("Gagal listen student doc:", err),
    );
  } catch (e) {
    console.error("Gagal listen student doc:", e);
  }
}

// ==========================================
// BINGKAI FOTO SESUAI TIER (gaya ada di style.css: .tier-*)
// ==========================================
const KELAS_BINGKAI_TIER = [
  "tier-novice",
  "tier-iron",
  "tier-bronze",
  "tier-silver",
  "tier-gold",
  "tier-platinum",
  "tier-diamond",
  "tier-master",
  "tier-mythic",
];
function terapkanBingkaiTier(elGambar, kelasBingkai) {
  const kotak = elGambar && elGambar.parentElement;
  if (!kotak) return;
  KELAS_BINGKAI_TIER.forEach((k) => kotak.classList.remove(k));
  if (kelasBingkai) kotak.classList.add(kelasBingkai);
}

// ==========================================
// BAR HP / SHIELD BERANIMASI
// ==========================================
let barPrev = null; // nilai sebelumnya, supaya kita tahu naik atau turun
function kurangiGerak() {
  return !!(
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function animasiAngka(el, dari, ke, format, instan) {
  if (!el) return;
  if (el._anim) cancelAnimationFrame(el._anim);
  if (instan || dari === ke) {
    el.textContent = format(ke);
    return;
  }
  const durasi = 900;
  const mulai = performance.now();
  const langkah = (t) => {
    const p = Math.min(1, (t - mulai) / durasi);
    const e = 1 - Math.pow(1 - p, 3); // melambat di akhir
    el.textContent = format(Math.round(dari + (ke - dari) * e));
    if (p < 1) el._anim = requestAnimationFrame(langkah);
  };
  el._anim = requestAnimationFrame(langkah);
}

function kilatBar(elOuter, kelas) {
  if (!elOuter) return;
  elOuter.classList.remove("flash-damage", "flash-heal", "flash-shield");
  void elOuter.offsetWidth; // ulang animasi
  elOuter.classList.add(kelas);
  setTimeout(() => elOuter.classList.remove(kelas), 900);
}

function perbaruiBarRpg(hp, shield) {
  const hpFill = $("barHpFill");
  const shFill = $("barShieldFill");
  if (!hpFill || !shFill) return;
  const hpOuter = hpFill.parentElement;
  const shOuter = shFill.parentElement;
  const hpPct = Math.max(0, Math.min(100, (hp / 200) * 100));
  const shPct = Math.max(0, Math.min(100, (shield / 300) * 100));

  // "jejak kerusakan": pita kuning pucat yang menyusul turun di belakang bar HP
  let jejak = hpOuter.querySelector(".rpg-hp-trail");
  if (!jejak) {
    jejak = document.createElement("div");
    jejak.className = "rpg-hp-trail";
    hpOuter.insertBefore(jejak, hpFill);
  }

  const warna = hpPct >= 50 ? "#2ecc71" : hpPct >= 25 ? "#f39c12" : "#e74c3c";
  hpFill.style.backgroundColor = warna;
  hpFill.classList.toggle("low", hpPct < 25);
  $("txtHpPercent").style.color = warna;

  const pertama = barPrev === null;
  const diam = kurangiGerak();
  const terapkanLebar = () => {
    hpFill.style.width = `${hpPct}%`;
    jejak.style.width = `${hpPct}%`;
    shFill.style.width = `${shPct}%`;
  };

  if (pertama) {
    // tampil pertama kali: bar terisi dari kosong
    [hpFill, jejak, shFill].forEach((e) => {
      e.style.transition = "none";
      e.style.width = "0%";
    });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        [hpFill, jejak, shFill].forEach((e) => (e.style.transition = ""));
        terapkanLebar();
      }),
    );
  } else {
    terapkanLebar();
  }

  animasiAngka(
    $("txtHpPercent"),
    pertama ? 0 : barPrev.hp,
    hp,
    (v) => `${v}/200`,
    false,
  );
  animasiAngka(
    $("txtShieldPercent"),
    pertama ? 0 : barPrev.shield,
    shield,
    (v) => `${v} Pts`,
    false,
  );

  if (!pertama && !diam) {
    if (hp < barPrev.hp) kilatBar(hpOuter, "flash-damage");
    else if (hp > barPrev.hp) kilatBar(hpOuter, "flash-heal");
    if (shield !== barPrev.shield) kilatBar(shOuter, "flash-shield");
  }
  barPrev = { hp, shield };
}

// Animasi isi bar dari kosong -> nilai sekarang, diputar ulang saat tab Profil
// benar-benar terlihat (bukan saat masih tertutup layar loading / tab lain).
function putarUlangBar() {
  if (!barPrev) return;
  const { hp, shield } = barPrev;
  barPrev = null; // perlakukan seperti "tampil pertama kali"
  perbaruiBarRpg(hp, shield);
}
function putarUlangBarSetelahTampil() {
  let coba = 0;
  const cek = () => {
    const pre = $("gamePreloader");
    const profil = $("siswaTabProfil");
    const tampak =
      profil &&
      profil.offsetParent !== null &&
      (!pre || pre.classList.contains("hidden"));
    if (tampak) {
      putarUlangBar();
      return;
    }
    if (++coba < 30) setTimeout(cek, 150);
  };
  setTimeout(cek, 60);
}

function getTierRank(shield) {
  if (shield >= 290)
    return {
      title: "🌌 MYTHIC LEGEND",
      frame: "tier-mythic",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #ff0844, #ffb199)",
    };
  if (shield >= 251)
    return {
      title: "👑 MASTER CHAMPION",
      frame: "tier-master",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #b224ef, #7579ff)",
    };
  if (shield >= 211)
    return {
      title: "💠 DIAMOND VANGUARD",
      frame: "tier-diamond",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #00c6ff, #0072ff)",
    };
  if (shield >= 171)
    return {
      title: "💎 PLATINUM GUARDIAN",
      frame: "tier-platinum",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #11998e, #38ef7d)",
    };
  if (shield >= 131)
    return {
      title: "🥇 GOLD PALADIN",
      frame: "tier-gold",
      color: "#1a2536",
      bg: "linear-gradient(135deg, #f7971e, #ffd200)",
    };
  if (shield >= 91)
    return {
      title: "🥈 SILVER WARRIOR",
      frame: "tier-silver",
      color: "#1a2536",
      bg: "linear-gradient(135deg, #e0eafc, #cfdef3)",
    };
  if (shield >= 51)
    return {
      title: "🥉 BRONZE KNIGHT",
      frame: "tier-bronze",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #d38312, #a83279)",
    };
  if (shield >= 11)
    return {
      title: "🛡️ IRON SQUIRE",
      frame: "tier-iron",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #485563, #29323c)",
    };
  return {
    title: "🔰 NOVICE",
    frame: "tier-novice",
    color: "#ffffff",
    bg: "linear-gradient(135deg, #7f8c8d, #95a5a6)",
  };
}

function getStatusPembinaan(tp) {
  if (tp < 10)
    return {
      title: "NORMAL",
      desc: "Tidak ada catatan pelanggaran.",
      color: "#2ecc71",
    };
  if (tp <= 20)
    return {
      title: "TEGURAN LISAN",
      desc: "Sanksi: Teguran lisan langsung oleh guru.",
      color: "#f1c40f",
    };
  if (tp <= 40)
    return {
      title: "TEGURAN TERTULIS",
      desc: "Sanksi: Teguran tertulis peringatan.",
      color: "#e67e22",
    };
  if (tp <= 80)
    return {
      title: "KONSELING BK",
      desc: "Sanksi: Pemanggilan konseling Guru BK.",
      color: "#e74c3c",
    };
  return {
    title: "TINDAKAN KEPALA SEKOLAH",
    desc: "Sanksi: Keputusan mutlak Kepala Sekolah.",
    color: "#2c3e50",
  };
}

function renderRiwayatHtml(list) {
  if (!list || list.length === 0) {
    return `<div style="font-size: 10px; color: #95a5a6; text-align: center; padding: 6px;">Tidak ada catatan riwayat.</div>`;
  }
  return list
    .map((r) => {
      const p = Number(r.p) || 0;
      const isPlus = p > 0;
      const borderColor = isPlus ? "#2ecc71" : "#e74c3c";
      const efek = teksEfekRiwayat(r);
      return `
      <div style="background: #1a2536; border-left: 3px solid ${borderColor}; padding: 8px 10px; border-radius: 0 6px 6px 0; font-size: 12.5px; color: #ecf0f1; border: 1px solid #34495e; margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 2px;">
          <span style="color: ${borderColor};">${escapeHtml(r.t)}</span>
          <span style="color: ${borderColor};">${isPlus ? "+" + p : p} Pts</span>
        </div>
        <div style="font-size: 11px; color: #bdc3c7; display: flex; justify-content: space-between;">
          <span>📍 ${escapeHtml(r.loc || "-")}</span>
          <span>📅 ${escapeHtml(r.d || "-")}</span>
        </div>${efek ? `\n        <div style="font-size: 10.5px; color: #95a5a6; margin-top: 3px;">${efek}</div>` : ""}
      </div>`;
    })
    .join("");
}

// Ringkas dampak HP/Shield suatu entri riwayat (hanya entri baru yang punya hb/ha).
function teksEfekRiwayat(r) {
  if (!r || r.hb === undefined || r.ha === undefined) return "";
  const bagian = [];
  if (r.ha !== r.hb) bagian.push(`❤️ HP ${r.hb} → ${r.ha}`);
  if (r.sa !== r.sb) bagian.push(`🛡️ Shield ${r.sb} → ${r.sa}`);
  return bagian.join(" &nbsp;•&nbsp; ");
}

// Satu-satunya fungsi untuk menampilkan profil siswa
// (menggantikan kode ganda di login & auto-login)
function tampilkanProfilSiswa(siswa, nisn) {
  const avatarImg =
    $("avatarSiswaMain") || document.querySelector(".rpg-avatar-box img");
  if (avatarImg) avatarImg.src = avatarFor(siswa);

  $("txtNamaSiswaHasil").textContent = (siswa.nama || "").toUpperCase();
  $("txtKelasSiswaHasil").textContent =
    `Kelas: ${siswa.kelas || "-"} | NISN: ${siswa.nisn || nisn}`;

  const shieldValue = siswa.shield || 0;
  const rankInfo = getTierRank(shieldValue);
  $("txtTierRankContainer").innerHTML = `
    <span style="display: inline-block; background: ${rankInfo.bg}; color: ${rankInfo.color}; padding: 2px 8px; border-radius: 5px; font-size: 10px; font-weight: 700; margin-top: 1px;">
      ${rankInfo.title}
    </span>`;
  terapkanBingkaiTier(avatarImg, rankInfo.frame);
  terapkanBingkaiTier($("miniAvatar"), rankInfo.frame);

  const hpValue = siswa.hp !== undefined ? siswa.hp : 200;
  perbaruiBarRpg(Math.max(0, hpValue), Math.max(0, shieldValue));

  $("txtDailyScoreTextOnly").innerText = `⭐ ${siswa.dailyScore || 0} Pts`;

  // Header mini (tampil di semua tab)
  const miniAv = $("miniAvatar");
  if (miniAv) miniAv.src = avatarFor(siswa);
  pasangSapaan(
    "siswa",
    "miniSapaan",
    "miniAfirmasi",
    () => siswa.panggilan || namaPanggilan(siswa.nama),
    AFIRMASI_SISWA,
  );

  const statusHukum = getStatusPembinaan(siswa.totalPelanggaran || 0);
  $("txtStatusKondisi").innerText = `STATUS: ${statusHukum.title}`;
  $("txtStatusPenanganan").innerText = statusHukum.desc;

  $("txtCountPrestasi").innerText = `${siswa.totalPrestasi || 0} Pts`;
  $("txtCountPelanggaran").innerText = `${siswa.totalPelanggaran || 0} Pts`;

  // Riwayat kejadian mengikuti FITUR.riwayatSiswa; riwayat kelas/semester sebelumnya mengikuti FITUR.riwayatKelasSebelumnya (fitur.js)
  const wadahRiwayat = document.querySelector(".history-container-main");
  if (wadahRiwayat) wadahRiwayat.style.display = FITUR.riwayatSiswa ? "" : "none";
  const tombolArsip = $("btnRiwayatKelasSiswa");
  if (tombolArsip) tombolArsip.style.display = FITUR.riwayatKelasSebelumnya ? "" : "none";
  $("historyListSiswa").innerHTML = FITUR.riwayatSiswa ? renderRiwayatHtml(siswa.riwayat) : "";

  // Kartu ganti PIN hanya tampil selama PIN masih bawaan; hilang setelah diganti
  const cardGantiPin = $("cardGantiPin");
  if (cardGantiPin)
    cardGantiPin.style.display = perluGantiPinBawaan(siswa) ? "block" : "none";
}

function startStudentSession(nisn, siswa, opsi) {
  localStorage.setItem("activeUser", nisn);
  localStorage.setItem(
    "activeUserExpiry",
    String(Date.now() + SESSION_SISWA_MS),
  );
  currentNisnSiswa = nisn;
  window.currentStudentNisn = nisn;
  window.currentStudentDataCache = siswa;

  initStudentRealtimeListener(nisn);
  initOnlineStatusEngine(nisn);
  pantauSesiSiswa(nisn);
  // Nama & foto teman diambil dari roster ringan (± 5 baca), lalu daftar dirender ulang
  pastikanRoster().then(() => {
    if (currentNisnSiswa !== nisn) return;
    const req = (window.currentStudentDataCache && window.currentStudentDataCache.requests) || [];
    renderRequests(req);
    scheduleFriendRender();
  });

  $("boxInputNisnSiswa").classList.add("hidden");
  $("hasilPoinSiswa").classList.remove("hidden");

  tampilkanProfilSiswa(siswa, nisn);
  // Pengingat ganti PIN hanya saat login (bukan saat sesi dipulihkan / refresh)
  if (opsi && opsi.tampilPopupPin) cekWajibGantiPin(siswa);
  cekPeringatanLogin(nisn);
  window.initGlobalChat(siswa);
  loadPeriodeAktifLabel();
  setSiswaAppMode(true);
  window.switchSiswaTab("profil");
  updateFabLaporanBug();
}

function validNisnFormat(v) {
  return /^[A-Za-z0-9_-]{3,30}$/.test(v);
}

window.loginSiswaWithPin = async function () {
  const nisnInput = $("nisnSiswaInput").value.trim();
  const pinInput = $("pinSiswaInput").value.trim();

  if (!nisnInput) return window.customAlert("Silakan ketik nomor NISN kamu!");
  if (!validNisnFormat(nisnInput))
    return window.customAlert("Format NISN tidak valid!");
  if (!pinInput) return window.customAlert("Silakan ketik PIN keamanan kamu!");

  showGamePreloader("MEMVERIFIKASI AKUN SISWA...", async (done) => {
    try {
      const { doc, getDoc } = window.fbFirestore;
      const docSnap = await getDoc(doc(window.db, "siswa", nisnInput));
      done();

      if (!docSnap.exists()) {
        $("modalErrorSiswa").classList.remove("hidden");
        return;
      }

      const siswa = docSnap.data();
      const serverPin = siswa.pin !== undefined ? String(siswa.pin) : "123456";
      if (pinInput !== serverPin) {
        return window.customAlert(
          "❌ PIN yang kamu masukkan salah! Periksa kembali PIN kamu.",
        );
      }

      if (siswa.dailyScore === undefined) siswa.dailyScore = 0;
      if (siswa.statusAkun === "lulus") {
        startAlumniView(nisnInput, siswa);
      } else {
        const hasilSesi = await klaimSesiSiswa(nisnInput, true);
        if (hasilSesi !== "ok") {
          pesanLoginDitolak(hasilSesi);
          return;
        }
        startStudentSession(nisnInput, siswa, { tampilPopupPin: true });
      }
    } catch (err) {
      done();
      console.error("Gagal verifikasi login siswa:", err);
      window.customAlert("Gagal login. Periksa koneksi internet kamu.");
    }
  });
};

async function autoLoginSiswa(nisnInput) {
  showGamePreloader("MEMULIHKAN SESI SISWA...", async (done) => {
    try {
      const { doc, getDoc } = window.fbFirestore;
      const docSnap = await getDoc(doc(window.db, "siswa", nisnInput));
      done();

      if (docSnap.exists()) {
        const siswa = docSnap.data();
        if (siswa.dailyScore === undefined) siswa.dailyScore = 0;
        if (siswa.statusAkun === "lulus") {
          startAlumniView(nisnInput, siswa);
        } else if ((await klaimSesiSiswa(nisnInput, false)) === "ok") {
          startStudentSession(nisnInput, siswa);
        } else {
          // sesi sudah diambil alih perangkat lain
          localStorage.removeItem("activeUser");
          localStorage.removeItem("activeUserExpiry");
          localStorage.removeItem(SESI_KEY);
          showScreen("siswa");
          window.customAlert(
            "🔒 Akunmu sedang dibuka di perangkat lain. Silakan login lagi untuk memakai di sini.",
          );
        }
      } else {
        localStorage.removeItem("activeUser");
        localStorage.removeItem("activeUserExpiry");
        showScreen("siswa");
      }
    } catch (err) {
      done();
      console.error("Gagal memulihkan sesi siswa:", err);
    }
  });
}

window.gantiPinSiswa = async function () {
  const myNisn = getMyNisn();
  const oldPin = $("oldPinInput").value.trim();
  const newPin = $("newPinInput").value.trim();

  if (!myNisn) return window.customAlert("Silakan login terlebih dahulu!");
  if (!oldPin || !newPin) {
    return window.customAlert("⚠️ Mohon isi PIN lama dan PIN baru Anda!");
  }
  if (!/^\d{4,6}$/.test(newPin)) {
    return window.customAlert("⚠️ PIN baru harus berupa 4 sampai 6 angka!");
  }
  if (newPin === "123456") {
    return window.customAlert(
      "⚠️ PIN baru tidak boleh sama dengan PIN bawaan (123456)!",
    );
  }

  showGamePreloader("MENYIMPAN PIN BARU...", async (done) => {
    try {
      const { doc, getDoc, updateDoc } = window.fbFirestore;
      const docRef = doc(window.db, "siswa", myNisn);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        done();
        return window.customAlert("Data siswa tidak ditemukan.");
      }

      const dataSiswa = docSnap.data();
      const currentPin =
        dataSiswa.pin !== undefined ? String(dataSiswa.pin) : "123456";

      if (oldPin !== currentPin) {
        done();
        return window.customAlert("❌ PIN lama yang Anda masukkan salah!");
      }

      await updateDoc(docRef, { pin: newPin, hasChangedPin: true });

      done();
      window.customAlert("✅ PIN berhasil diubah! Ingat PIN barumu, ya.");

      $("oldPinInput").value = "";
      $("newPinInput").value = "";
      const kartuPin = $("cardGantiPin");
      if (kartuPin) kartuPin.style.display = "none";
    } catch (err) {
      done();
      console.error("Gagal mengganti PIN:", err);
      window.customAlert(
        "Gagal memperbarui PIN. Periksa koneksi internet Anda.",
      );
    }
  });
};

// ==========================================
// SISTEM PERTEMANAN & SQUAD (CLOUD FIRESTORE)
// ==========================================
// Guard sederhana: cegah spam klik pada aksi pertemanan (tidak memakai preloader)
let friendActionBusy = false;

window.tambahTeman = async function () {
  if (friendActionBusy) return;
  friendActionBusy = true;
  try {
    await tambahTemanImpl();
  } finally {
    friendActionBusy = false;
  }
};

async function tambahTemanImpl() {
  const targetNisn = $("inputNisnTeman").value.trim();
  const myNisn = getMyNisn();
  if (!targetNisn)
    return window.customAlert("Ketik NISN teman yang mau di-invite!");
  if (targetNisn === myNisn)
    return window.customAlert("Tidak bisa mengundang diri sendiri ke Squad!");
  if (!validNisnFormat(targetNisn))
    return window.customAlert("Format NISN tidak valid!");

  let temanObj = cariSiswa(targetNisn);
  if (!temanObj) {
    // Belum ada di roster (mis. siswa baru): cek langsung ke database
    try {
      const { doc, getDoc } = window.fbFirestore;
      const snapTeman = await getDoc(doc(window.db, "siswa", targetNisn));
      if (snapTeman.exists()) temanObj = snapTeman.data();
    } catch (e) {
      /* dianggap tidak ditemukan */
    }
  }
  if (!temanObj)
    return window.customAlert(
      "NISN teman tidak ditemukan di database sekolah!",
    );

  const cache = window.currentStudentDataCache || {};
  if ((cache.friends || []).includes(targetNisn)) {
    return window.customAlert("Teman ini sudah ada di daftar Squad kamu!");
  }
  if ((cache.requests || []).includes(targetNisn)) {
    return window.customAlert(
      `${temanObj.nama} sudah mengundangmu! Terima undangannya di bagian "Undangan Masuk".`,
    );
  }

  try {
    const { doc, getDoc, updateDoc, arrayUnion } = window.fbFirestore;
    const targetRef = doc(window.db, "siswa", targetNisn);
    const targetSnap = await getDoc(targetRef);

    if (!targetSnap.exists())
      return window.customAlert("Data siswa tujuan tidak ditemukan di cloud.");
    const targetRequests = targetSnap.data().requests || [];

    if (targetRequests.includes(myNisn)) {
      return window.customAlert(
        "Undangan ke teman ini sudah dikirim dan sedang menunggu konfirmasi!",
      );
    }

    await updateDoc(targetRef, { requests: arrayUnion(myNisn) });

    $("inputNisnTeman").value = "";
    window.customAlert(
      `📨 Undangan Squad berhasil dikirim ke ${temanObj.nama}! Menunggu konfirmasi.`,
    );
  } catch (err) {
    console.error("Gagal kirim undangan:", err);
    window.customAlert("Gagal mengirim undangan. Periksa koneksi internet.");
  }
}

window.terimaUndangan = async function (senderNisn) {
  if (friendActionBusy) return;
  friendActionBusy = true;
  const myNisn = getMyNisn();
  try {
    const { doc, updateDoc, arrayUnion, arrayRemove } = window.fbFirestore;
    await updateDoc(doc(window.db, "siswa", myNisn), {
      requests: arrayRemove(senderNisn),
      friends: arrayUnion(senderNisn),
    });
    await updateDoc(doc(window.db, "siswa", senderNisn), {
      friends: arrayUnion(myNisn),
    });
    window.customAlert(
      "✅ Undangan diterima! Kalian sekarang resmi berteman di Squad.",
    );
  } catch (err) {
    console.error("Gagal menerima undangan:", err);
    window.customAlert("Gagal memproses penerimaan undangan.");
  } finally {
    friendActionBusy = false;
  }
};

window.tolakUndangan = async function (senderNisn) {
  if (friendActionBusy) return;
  friendActionBusy = true;
  const myNisn = getMyNisn();
  try {
    const { doc, updateDoc, arrayRemove } = window.fbFirestore;
    await updateDoc(doc(window.db, "siswa", myNisn), {
      requests: arrayRemove(senderNisn),
    });
  } catch (err) {
    console.error("Gagal menolak undangan:", err);
  } finally {
    friendActionBusy = false;
  }
};

window.hapusTeman = async function (targetNisn) {
  const yakin = await window.customConfirm(
    "Yakin ingin menghapus teman ini dari Squad?",
  );
  if (!yakin) return;
  if (friendActionBusy) return;
  friendActionBusy = true;
  const myNisn = getMyNisn();
  try {
    const { doc, updateDoc, arrayRemove } = window.fbFirestore;
    await updateDoc(doc(window.db, "siswa", myNisn), {
      friends: arrayRemove(targetNisn),
    });
    await updateDoc(doc(window.db, "siswa", targetNisn), {
      friends: arrayRemove(myNisn),
    });
    window.customAlert("Teman berhasil dihapus dari Squad.");
  } catch (err) {
    console.error("Gagal menghapus teman:", err);
    window.customAlert("Gagal menghapus teman.");
  } finally {
    friendActionBusy = false;
  }
};

function getChatRoomId(nisn1, nisn2) {
  return [nisn1, nisn2].sort().join("_");
}

// ==========================================
// NAVIGASI TAB SISWA (PROFIL / TEMAN / CHAT / GLOBAL)
// ==========================================
const SISWA_TABS = ["profil", "teman", "chat", "global", "game"];
let siswaActiveTab = "profil";
let friendState = {}; // nisn -> { online, statusText, unread, last }
let friendRenderQueued = false;
let globalUnread = 0;
let globalSeenTs = 0;

function setSiswaAppMode(on) {
  $("siswaCard").classList.toggle("siswa-app-mode", !!on);
}

function scrollToBottom(id) {
  const el = $(id);
  if (el) el.scrollTop = el.scrollHeight;
}

function setBadge(id, n) {
  const el = $(id);
  if (!el) return;
  if (n > 0) {
    el.textContent = n > 99 ? "99+" : String(n);
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function updateTabBadges() {
  const requests = (window.currentStudentDataCache?.requests || []).length;
  const unreadChat = Object.values(friendState).reduce(
    (sum, st) => sum + (st.unread || 0),
    0,
  );
  setBadge("tabBadgeTeman", requests);
  setBadge("tabBadgeChat", unreadChat);
  setBadge("tabBadgeGlobal", globalUnread);
}

window.switchSiswaTab = function (tab) {
  if (!SISWA_TABS.includes(tab)) tab = "profil";
  const prev = siswaActiveTab;
  siswaActiveTab = tab;

  SISWA_TABS.forEach((t) => {
    const panel = $("siswaTab" + t.charAt(0).toUpperCase() + t.slice(1));
    const btn = document.querySelector(`.siswa-tab-btn[data-tab="${t}"]`);
    if (panel) panel.classList.toggle("hidden", t !== tab);
    if (btn) btn.classList.toggle("active", t === tab);
  });

  // Listener berat hanya aktif saat tab-nya terlihat
  if (prev === "chat" && tab !== "chat") detachChatRoomListener();
  if (prev === "global" && tab !== "global") stopGlobalOnlineListener();
  if (tab === "teman" || tab === "chat") pasangStatusTeman();
  else if (prev === "teman" || prev === "chat") lepasStatusTemanTertunda();

  if (tab === "chat") {
    renderChatList();
    if (prev !== "chat" && currentChatTargetNisn) {
      attachChatHeaderStatus(currentChatTargetNisn);
      loadPesanChatRealtime(currentChatTargetNisn);
    }
  } else if (tab === "global") {
    markGlobalSeen();
    startGlobalOnlineListener();
    scrollToBottom("globalChatContainer");
  }

  if (tab === "game") cekGameDibuka();
  if (tab === "profil") putarUlangBarSetelahTampil();
};

// ==========================================
// TAB GAME: daftar game (dibuka di tab baru)
// Saklar admin: Firestore app_meta/game  { aktif: false, pesan: "..." }
// ==========================================
let gameDibuka = true;
async function cekGameDibuka() {
  try {
    const { doc, getDoc } = window.fbFirestore;
    const s = await getDoc(doc(window.db, "app_meta", "game"));
    const d = s.exists() ? s.data() : {};
    gameDibuka = !(d.aktif === false || d.aktif === "false");
    const info = $("gameTutupInfo");
    if (info) {
      info.classList.toggle("hidden", gameDibuka);
      if (!gameDibuka) info.textContent = "🚧 " + (d.pesan || "Game sedang ditutup sementara.");
    }
    const daftar = $("gameDaftar");
    if (daftar) daftar.classList.toggle("game-terkunci", !gameDibuka);
  } catch (e) {
    gameDibuka = true; // gagal baca: jangan kunci
  }
}
window.bukaGame = function (nama) {
  if (!gameDibuka) return window.customAlert("🚧 Game sedang ditutup sementara.");
  const DAFTAR = { tictactoe: "game-tictactoe.html" };
  if (!DAFTAR[nama]) return;
  // Catatan: jangan pakai fitur "noopener" di sini — window.open lalu selalu
  // mengembalikan null sehingga terbaca seolah pop-up diblokir.
  const w = window.open(DAFTAR[nama] + "?v=4.8.1", "_blank");
  if (w) {
    try {
      w.opener = null;
    } catch (e) {}
  } else {
    window.customAlert(
      "Pop-up diblokir browser. Izinkan pop-up untuk situs ini, lalu coba lagi.",
    );
  }
};

// ==========================================
// HUB TEMAN: status online, pesan belum dibaca, pesan terakhir
// ==========================================
function scheduleFriendRender() {
  if (friendRenderQueued) return;
  friendRenderQueued = true;
  requestAnimationFrame(() => {
    friendRenderQueued = false;
    renderTemanList();
    renderChatList();
    updateTabBadges();
  });
}

function formatChatTime(last) {
  if (!last) return "";
  const ts = last.timestamp || 0;
  if (!ts) return last.time || "";
  const d = new Date(ts);
  if (localDateStr(d) === localDateStr()) return last.time || localTimeStr(d);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function avatarWithDot(teman, online) {
  const src = teman ? avatarFor(teman) : "assets/foto_siswa/avatar_l.webp";
  return `<div class="avatar-wrap"><img src="${escapeHtml(src)}" alt="" onerror="${AVATAR_ONERROR}"><span class="presence-dot ${online ? "on" : ""}"></span></div>`;
}

function renderRequests(requestsArray) {
  const containerUndangan = $("containerUndanganMasuk");
  if (!containerUndangan) return;
  if (!requestsArray || requestsArray.length === 0) {
    containerUndangan.innerHTML = "";
    return;
  }
  let html = `<div class="request-title">📩 Undangan Masuk (${requestsArray.length}):</div>`;
  requestsArray.forEach((senderNisn) => {
    const sender = cariSiswa(senderNisn);
    const senderName = sender ? sender.nama : `NISN: ${senderNisn}`;
    const sNisn = escapeHtml(senderNisn);
    html += `
    <div class="request-row">
      <span class="request-text"><strong>${escapeHtml(senderName)}</strong> mengundangmu</span>
      <div class="request-actions">
        <button type="button" class="mini-btn ok" data-nisn="${sNisn}" onclick="terimaUndangan(this.dataset.nisn)">Terima</button>
        <button type="button" class="mini-btn del" data-nisn="${sNisn}" onclick="tolakUndangan(this.dataset.nisn)">Tolak</button>
      </div>
    </div>`;
  });
  containerUndangan.innerHTML = html;
}

function renderTemanList() {
  const container = $("listTemanContainer");
  const counter = $("jumlahTemanTxt");
  if (!container) return;

  const friends = window.currentStudentDataCache?.friends || [];
  if (counter) counter.innerText = `${friends.length} Teman`;

  if (friends.length === 0) {
    container.innerHTML = `<div class="empty-note">Belum ada teman di Squad. Yuk invite temanmu!</div>`;
    return;
  }

  const items = friends.map((nisn) => ({
    nisn,
    teman: cariSiswa(nisn),
    st: friendState[nisn] || {},
  }));
  // Yang online di atas, lalu urut nama
  items.sort((a, b) => {
    if (!!b.st.online !== !!a.st.online) return b.st.online ? 1 : -1;
    return String(a.teman?.nama || a.nisn).localeCompare(
      String(b.teman?.nama || b.nisn),
    );
  });

  container.innerHTML = items
    .map(({ nisn, teman, st }) => {
      const nama = teman ? teman.nama : `NISN: ${nisn}`;
      const kelas = teman ? teman.kelas : "-";
      const sNisn = escapeHtml(nisn);
      const unread = st.unread
        ? ` <span class="row-unread">${st.unread}</span>`
        : "";
      return `
      <div class="friend-row">
        ${avatarWithDot(teman, st.online)}
        <div class="row-main">
          <div class="row-name">${escapeHtml(nama)}</div>
          <div class="row-sub">Kelas: ${escapeHtml(kelas)}</div>
          <div class="row-status ${st.online ? "on" : ""}">${escapeHtml(st.statusText || "Memuat status...")}</div>
        </div>
        <div class="row-actions">
          <button type="button" class="mini-btn chat" data-nisn="${sNisn}" data-nama="${escapeHtml(nama)}" onclick="bukaChatTeman(this.dataset.nisn, this.dataset.nama)">Chat 💬${unread}</button>
          <button type="button" class="mini-btn del" data-nisn="${sNisn}" onclick="hapusTeman(this.dataset.nisn)">Hapus</button>
        </div>
      </div>`;
    })
    .join("");
}

function renderChatList() {
  const container = $("chatListContainer");
  if (!container) return;

  const friends = window.currentStudentDataCache?.friends || [];
  if (friends.length === 0) {
    container.innerHTML = `<div class="empty-note">Belum ada teman untuk diajak ngobrol.<br>Tambahkan teman dulu di tab <strong>Teman</strong>.</div>`;
    return;
  }

  const me = getMyNisn();
  const items = friends.map((nisn) => ({
    nisn,
    teman: cariSiswa(nisn),
    st: friendState[nisn] || {},
  }));
  // Percakapan terbaru di atas, teman tanpa pesan di bawah (urut nama)
  items.sort((a, b) => {
    const ta = a.st.last?.timestamp || 0;
    const tb = b.st.last?.timestamp || 0;
    if (tb !== ta) return tb - ta;
    return String(a.teman?.nama || a.nisn).localeCompare(
      String(b.teman?.nama || b.nisn),
    );
  });

  container.innerHTML = items
    .map(({ nisn, teman, st }) => {
      const nama = teman ? teman.nama : `NISN: ${nisn}`;
      let preview = "Belum ada pesan. Ketuk untuk menyapa 👋";
      if (st.last) {
        preview =
          (st.last.senderNisn === me ? "Kamu: " : "") + (st.last.text || "");
      }
      return `
      <div class="chat-row ${st.unread ? "has-unread" : ""}" data-nisn="${escapeHtml(nisn)}" data-nama="${escapeHtml(nama)}" onclick="bukaChatTeman(this.dataset.nisn, this.dataset.nama)">
        ${avatarWithDot(teman, st.online)}
        <div class="row-main">
          <div class="row-top">
            <span class="row-name">${escapeHtml(nama)}</span>
            <span class="row-time">${escapeHtml(formatChatTime(st.last))}</span>
          </div>
          <div class="row-bottom">
            <span class="row-preview">${escapeHtml(preview)}</span>
            ${st.unread ? `<span class="row-unread">${st.unread}</span>` : ""}
          </div>
        </div>
      </div>`;
    })
    .join("");
}

function setupFriendHub(friendsArray, requestsArray) {
  friendsArray = friendsArray || [];
  requestsArray = requestsArray || [];

  unsubscribeAllFriendListeners();

  // Pertahankan state lama agar tampilan tidak berkedip
  const prev = friendState;
  friendState = {};
  friendsArray.forEach((nisn) => {
    friendState[nisn] = prev[nisn] || {
      online: false,
      statusText: "Memuat status...",
      unread: 0,
      last: null,
    };
  });

  renderRequests(requestsArray);

  const myNisn = getMyNisn();
  const { collection, query, where, orderBy, limit, onSnapshot } =
    window.fbFirestore;

  friendsArray.forEach((nisn) => {
    try {
      const roomRef = collection(
        window.db,
        "chats",
        getChatRoomId(myNisn, nisn),
        "messages",
      );

      // Hanya pesan teman yang belum dibaca
      const unsubUnread = onSnapshot(
        query(
          roomRef,
          where("senderNisn", "==", nisn),
          where("read", "==", false),
        ),
        (snap) => {
          const st = friendState[nisn];
          if (!st) return;
          st.unread = snap.size;
          scheduleFriendRender();
        },
        (err) => console.error("Gagal melacak unread:", err),
      );

      // Pesan terakhir untuk pratinjau daftar percakapan
      const unsubLast = onSnapshot(
        query(roomRef, orderBy("timestamp", "desc"), limit(1)),
        (snap) => {
          const st = friendState[nisn];
          if (!st) return;
          st.last = snap.empty ? null : snap.docs[0].data();
          scheduleFriendRender();
        },
        (err) => console.error("Gagal memuat pesan terakhir:", err),
      );

      friendListeners[nisn] = () => {
        unsubUnread();
        unsubLast();
      };
    } catch (e) {
      console.error("Gagal memasang listener chat teman:", e);
    }
  });

  // Status online teman hanya dipantau saat tab Teman/Chat terlihat (hemat baca)
  if (siswaActiveTab === "teman" || siswaActiveTab === "chat") pasangStatusTeman();
  scheduleFriendRender();
}

// Status teman (online/offline) dipantau hanya selama tab Teman atau Chat dibuka,
// dan dilepas 60 detik setelah ditinggalkan. Dulu dipantau terus-menerus sehingga
// tiap tanda aktif teman dihitung sebagai 1 baca walau tab tidak dilihat.
let statusTemanLepasTimer = null;
function pasangStatusTeman() {
  clearTimeout(statusTemanLepasTimer);
  statusTemanLepasTimer = null;
  Object.keys(friendState).forEach((nisn) => {
    if (friendStatusListeners[nisn]) return;
    friendStatusListeners[nisn] = subscribeStatus(nisn, (info) => {
      const st = friendState[nisn];
      if (!st) return;
      st.online = info.isOnline;
      st.statusText = info.text;
      scheduleFriendRender();
    });
  });
}
function lepasStatusTemanTertunda() {
  clearTimeout(statusTemanLepasTimer);
  statusTemanLepasTimer = setTimeout(() => {
    Object.values(friendStatusListeners).forEach((u) => typeof u === "function" && u());
    friendStatusListeners = {};
    statusTemanLepasTimer = null;
  }, 60000);
}

// ==========================================
// SISTEM CHAT PERORANGAN (MESSENGER 1-ON-1) - TAB CHAT
// ==========================================
let activeChatListener = null;
let chatStatusUnsub = null;
let currentChatTargetNisn = "";
let lastChatSendAt = 0;

function detachChatRoomListener() {
  if (activeChatListener) {
    activeChatListener();
    activeChatListener = null;
  }
  if (chatStatusUnsub) {
    chatStatusUnsub();
    chatStatusUnsub = null;
  }
}

function attachChatHeaderStatus(nisn) {
  if (chatStatusUnsub) chatStatusUnsub();
  const subEl = $("chatSubStatus");
  chatStatusUnsub = subscribeStatus(nisn, (info) => {
    if (!subEl) return;
    subEl.textContent = (info.isOnline ? "● " : "○ ") + info.text;
    subEl.style.color = info.isOnline ? "#2ecc71" : "#94a3b8";
  });
}

window.bukaChatTeman = function (targetNisn, targetNama) {
  currentChatTargetNisn = targetNisn;

  const teman = cariSiswa(targetNisn);
  $("chatTitleNama").textContent = targetNama;
  const av = $("chatRoomAvatar");
  if (av) av.src = teman ? avatarFor(teman) : "assets/foto_siswa/avatar_l.webp";

  $("chatListView").classList.add("hidden");
  $("chatRoomView").classList.remove("hidden");
  $("chatMessageContainer").innerHTML =
    `<div class="empty-note">Menghubungkan ke ruang aman...</div>`;

  if (siswaActiveTab !== "chat") {
    // switchSiswaTab akan memasang listener & status header
    window.switchSiswaTab("chat");
  } else {
    detachChatRoomListener();
    attachChatHeaderStatus(targetNisn);
    loadPesanChatRealtime(targetNisn);
  }
};

// Tombol kembali: kembali ke daftar percakapan
window.tutupChatTeman = function () {
  detachChatRoomListener();
  currentChatTargetNisn = "";
  $("chatRoomView").classList.add("hidden");
  $("chatListView").classList.remove("hidden");
  renderChatList();
};

async function loadPesanChatRealtime(targetNisn) {
  const myNisn = getMyNisn();
  const roomId = getChatRoomId(myNisn, targetNisn);
  const container = $("chatMessageContainer");

  try {
    const {
      collection,
      query,
      orderBy,
      where,
      onSnapshot,
      doc,
      updateDoc,
      getDocs,
      deleteDoc,
    } = window.fbFirestore;
    const messagesRef = collection(window.db, "chats", roomId, "messages");
    const tujuhHariLalu = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Bersihkan pesan kedaluwarsa (gagal tidak boleh menggagalkan chat)
    try {
      const expiredSnap = await getDocs(
        query(messagesRef, where("timestamp", "<", tujuhHariLalu)),
      );
      await Promise.all(
        expiredSnap.docs.map((docSnap) =>
          deleteDoc(
            doc(window.db, "chats", roomId, "messages", docSnap.id),
          ).catch((err) => console.log("Gagal hapus pesan lama:", err)),
        ),
      );

      // Kalau ruang chat ini sudah lebih dari 7 hari tidak ada pesan baru,
      // berarti semua pesannya pasti sudah kedaluwarsa juga — coba hapus
      // sekalian dokumen room-nya supaya tidak ada ruang kosong tersisa.
      // Room otomatis dibuat ulang kalau kedua siswa chat lagi nanti.
      // Gagal (misalnya rules belum mengizinkan) tidak masalah, dilewati saja.
      try {
        await deleteDoc(doc(window.db, "chats", roomId));
      } catch (e) {
        // Wajar gagal kalau room masih aktif atau rules belum diperbarui
      }
    } catch (e) {
      console.log("Lewati pembersihan pesan lama:", e);
    }

    // Pengguna mungkin sudah pindah tab / ganti chat selama proses di atas
    if (siswaActiveTab !== "chat" || currentChatTargetNisn !== targetNisn)
      return;

    const qValid = query(
      messagesRef,
      where("timestamp", ">=", tujuhHariLalu),
      orderBy("timestamp", "asc"),
    );

    if (activeChatListener) activeChatListener();

    activeChatListener = onSnapshot(
      qValid,
      (snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = `<div class="empty-note">Belum ada riwayat pesan. Mulai sapa temanmu sekarang! 👋</div>`;
          return;
        }

        let chatHtml = "";
        snapshot.forEach((docSnap) => {
          const msg = docSnap.data();
          const isMe = msg.senderNisn === myNisn;

          if (!isMe && !msg.read) {
            updateDoc(doc(window.db, "chats", roomId, "messages", docSnap.id), {
              read: true,
            }).catch((e) => console.log("Gagal tandai dibaca:", e));
          }

          const tick = isMe
            ? msg.read
              ? `<span class="tick read" title="Sudah Dibaca">✓✓</span>`
              : `<span class="tick" title="Terkirim">✓</span>`
            : "";

          chatHtml += `
          <div class="bubble ${isMe ? "me" : "them"}">
            <div class="bubble-text">${escapeHtml(msg.text)}</div>
            <div class="bubble-meta"><span>${escapeHtml(msg.time || "")}</span>${tick}</div>
          </div>`;
        });

        container.innerHTML = chatHtml;
        container.scrollTop = container.scrollHeight;
      },
      (err) => {
        console.error("Gagal memuat chat:", err);
        container.innerHTML = `<div class="empty-note" style="color:#e74c3c">Gagal memuat ruang obrolan.</div>`;
      },
    );
  } catch (err) {
    console.error("Gagal memuat chat:", err);
    container.innerHTML = `<div class="empty-note" style="color:#e74c3c">Gagal memuat ruang obrolan.</div>`;
  }
}

window.kirimPesanChat = async function () {
  const inputEl = $("inputPesanChat");
  const text = inputEl.value.trim();
  if (!text) return;
  if (!currentChatTargetNisn) return;

  if (text.length > CHAT_MAX_LEN) {
    return window.customAlert(
      `⚠️ Pesan terlalu panjang (${text.length}/${CHAT_MAX_LEN} karakter). Maksimal ${CHAT_MAX_LEN} karakter per pesan agar terhindar dari spam!`,
    );
  }
  if (Date.now() - lastChatSendAt < CHAT_COOLDOWN_MS) return;
  lastChatSendAt = Date.now();

  const myNisn = getMyNisn();
  const targetNisn = currentChatTargetNisn;
  const roomId = getChatRoomId(myNisn, targetNisn);

  try {
    const { collection, addDoc, doc, setDoc } = window.fbFirestore;
    await setDoc(
      doc(window.db, "chats", roomId),
      {
        roomId,
        nisn1: myNisn,
        nisn2: targetNisn,
        lastUpdated: Date.now(),
      },
      { merge: true },
    );

    await addDoc(collection(window.db, "chats", roomId, "messages"), {
      senderNisn: myNisn,
      text,
      time: localTimeStr(),
      timestamp: Date.now(),
      read: false,
    });

    inputEl.value = "";
  } catch (err) {
    console.error("Gagal mengirim pesan:", err);
    window.customAlert("Gagal mengirim pesan. Periksa koneksi internetmu.");
  }
};

// ==========================================
// SISTEM MONITORING CHAT ADMIN (CHAT PERORANGAN)
// ==========================================
let adminActiveChatListener = null;
let currentAdminSelectedRoomId = "";

function namaDariNisn(nisn) {
  const s = cariSiswa(nisn);
  return s ? s.nama : nisn;
}

// Hapus banyak dokumen dengan batch (maks 500 per batch)
async function deleteDocsInChunks(docRefs) {
  const { writeBatch } = window.fbFirestore;
  for (let i = 0; i < docRefs.length; i += BATCH_CHUNK) {
    const batch = writeBatch(window.db);
    docRefs.slice(i, i + BATCH_CHUNK).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

window.loadAdminChatRooms = async function () {
  const roomListContainer = $("adminRoomList");
  if (!roomListContainer) return;
  roomListContainer.innerHTML = `<div style="font-size: 10px; color: #888; text-align: center; margin: auto;">Memuat seluruh daftar percakapan...</div>`;

  try {
    const { collection, getDocs } = window.fbFirestore;
    const snapshot = await getDocs(collection(window.db, "chats"));

    const rooms = [];
    snapshot.forEach((docSnap) => {
      rooms.push({
        id: docSnap.id,
        lastUpdated: docSnap.data().lastUpdated || 0,
      });
    });
    rooms.sort((a, b) => b.lastUpdated - a.lastUpdated);

    if (rooms.length === 0) {
      roomListContainer.innerHTML = `<div style="font-size: 10px; color: #888; text-align: center; margin: auto;">Belum ada ruang chat aktif dari siswa.</div>`;
      return;
    }

    roomListContainer.innerHTML = rooms
      .map((r) => {
        const [nisn1, nisn2] = r.id.split("_");
        return `
        <div data-room="${escapeHtml(r.id)}" onclick="monitorAdminRoom(this.dataset.room)" style="padding: 8px 10px; background: #fff; border: 1.5px solid #cbd5e1; border-radius: 8px; cursor: pointer; margin-bottom: 4px;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#fff'">
          <div style="font-size: 10px; font-weight: bold; color: #1e3c72;">💬 Chat:</div>
          <div style="font-size: 9px; color: #334155; margin-top: 1px; font-weight: 500;">${escapeHtml(namaDariNisn(nisn1))} &amp; ${escapeHtml(namaDariNisn(nisn2))}</div>
        </div>`;
      })
      .join("");
  } catch (err) {
    console.error("Gagal memuat room chat admin:", err);
    roomListContainer.innerHTML = `<div style="font-size: 10px; color: #e74c3c; text-align: center; margin: auto;">Gagal memuat data chat.</div>`;
  }
};

window.monitorAdminRoom = function (roomId) {
  currentAdminSelectedRoomId = roomId;
  const headerEl = $("adminChatHeader");
  const container = $("adminMessageContainer");
  if (!headerEl || !container) return;

  const [n1, n2] = roomId.split("_");
  headerEl.innerText = `Memantau: ${namaDariNisn(n1)} & ${namaDariNisn(n2)}`;

  try {
    const { collection, query, orderBy, onSnapshot, limit } =
      window.fbFirestore;
    const q = query(
      collection(window.db, "chats", roomId, "messages"),
      orderBy("timestamp", "desc"),
      limit(200),
    );

    if (adminActiveChatListener) adminActiveChatListener();

    adminActiveChatListener = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = `<div style="font-size: 11px; color: #888; text-align: center; margin: auto;">Belum ada pesan di ruang ini.</div>`;
          return;
        }

        const msgs = [];
        snapshot.forEach((d) => msgs.push(d.data()));
        msgs.reverse();

        container.innerHTML = msgs
          .map(
            (msg) => `
          <div style="background: #ffffff; color: #1e293b; border: 1.5px solid #e2e8f0; padding: 10px 14px; border-radius: 10px; width: 100%; font-size: 11px; word-break: break-word; box-shadow: 0 1px 3px rgba(0,0,0,0.04); margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; border-bottom: 1px solid #f1f5f9; padding-bottom: 3px;">
              <span style="font-size: 9.5px; font-weight: bold; color: #1e3c72;">👤 ${escapeHtml(namaDariNisn(msg.senderNisn))} - ${escapeHtml(msg.senderNisn)}</span>
              <span style="font-size: 8.5px; color: #64748b;">${escapeHtml(msg.time || "")}</span>
            </div>
            <div style="font-size: 11.5px; color: #334155; line-height: 1.4;">${escapeHtml(msg.text)}</div>
          </div>`,
          )
          .join("");
        container.scrollTop = container.scrollHeight;
      },
      (err) => console.error("Gagal memantau pesan admin:", err),
    );
  } catch (err) {
    console.error("Gagal memantau pesan admin:", err);
  }
};

window.adminHapusSemuaChatRoom = async function () {
  if (!currentAdminSelectedRoomId) {
    return window.customAlert(
      "Pilih ruang chat terlebih dahulu dari daftar di sebelah kiri!",
    );
  }
  const roomId = currentAdminSelectedRoomId;
  const yakin = await window.customConfirm(
    `Yakin ingin menghapus ruang chat ini beserta SEMUA pesannya? Ruang chat akan otomatis dibuat ulang kalau kedua siswa chat lagi nanti.`,
  );
  if (!yakin) return;

  showGamePreloader("MENGHAPUS RUANG CHAT...", async (done) => {
    try {
      const { collection, doc, getDocs, deleteDoc } = window.fbFirestore;
      const snapshot = await getDocs(
        collection(window.db, "chats", roomId, "messages"),
      );
      await deleteDocsInChunks(snapshot.docs.map((d) => d.ref));
      // Hapus juga dokumen room-nya supaya tidak ada ruang kosong tersisa
      await deleteDoc(doc(window.db, "chats", roomId));

      currentAdminSelectedRoomId = "";
      const headerEl = $("adminChatHeader");
      const container = $("adminMessageContainer");
      if (headerEl) headerEl.innerText = "Pilih ruang chat untuk dipantau";
      if (container)
        container.innerHTML = `<div style="font-size: 11px; color: #888; text-align: center; margin: auto;">Belum ada ruang chat dipilih.</div>`;
      if (adminActiveChatListener) {
        adminActiveChatListener();
        adminActiveChatListener = null;
      }
      window.loadAdminChatRooms();

      done();
      window.customAlert(
        "✅ Ruang chat beserta semua pesannya berhasil dihapus!",
      );
    } catch (err) {
      done();
      console.error("Gagal menghapus ruang chat:", err);
      window.customAlert("Gagal menghapus ruang chat.");
    }
  });
};

// ==========================================
// DATA MASTER SISWA (DENGAN CACHE BERBATAS WAKTU)
// ==========================================
function invalidateMasterCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
    sessionStorage.removeItem("master_siswa_cache"); // cache versi lama
  } catch (e) {
    /* abaikan */
  }
}

// ==========================================
// ROSTER RINGAN — hemat kuota baca Firestore
// Siswa tidak lagi membaca SELURUH koleksi `siswa` (150+ dokumen) tiap membuka
// aplikasi. Staf (yang memang memuat semua siswa) menyalin ringkasan
// {nisn, nama, kelas, jk, poin harian, foto} ke beberapa dokumen kecil
// `app_meta/roster_N` + `app_meta/roster_meta`. Siswa cukup membaca beberapa
// dokumen itu (± 5 baca). Kalau roster belum ada / gagal dibaca, aplikasi otomatis
// memakai cara lama (muat semua siswa) sehingga tidak ada fitur yang rusak.
// ==========================================
const ROSTER_META = "roster_meta";
const ROSTER_KEY = "roster_siswa_v1";
const ROSTER_TTL_MS = 10 * 60 * 1000; // roster di perangkat dianggap segar 10 menit
const ROSTER_MAKS_BYTE = 500000; // batas aman per dokumen (limit Firestore ± 1 MB)
const ROSTER_MAKS_ITEM = 60;
let profilCache = new Map();
let rosterWaktu = 0;
let rosterSinkronT = 0;

function hashSingkat(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + "." + str.length;
}
function ringkasSiswa(s) {
  return { x: String(s.nisn), n: s.nama || "", k: s.kelas || "", j: s.jk || "", d: s.dailyScore || 0, f: s.fotoUrl || "" };
}
function dariRingkas(r) {
  return { nisn: r.x, nama: r.n, kelas: r.k, jk: r.j, dailyScore: r.d, fotoUrl: r.f };
}
function isiProfilCache(items) {
  profilCache = new Map();
  items.forEach((r) => profilCache.set(String(r.x), dariRingkas(r)));
}

// Cari satu siswa: dari daftar lengkap (staf / cara lama) atau roster ringan (siswa).
function cariSiswa(nisn) {
  const k = String(nisn);
  if (masterDataSiswa.length) {
    const s = masterDataSiswa.find((x) => String(x.nisn) === k);
    if (s) return s;
  }
  return profilCache.get(k);
}
// Daftar untuk papan peringkat
function daftarSiswaRingan() {
  return masterDataSiswa.length ? masterDataSiswa : Array.from(profilCache.values());
}

// STAF: salin ringkasan ke roster bila ada yang berubah (hanya tulis potongan yang berubah)
let rosterTunda = null;
function sinkronRoster(list) {
  // Jeda minimal 30 detik antar-sinkron; perubahan yang datang lebih cepat
  // ditunda dan dikirim dengan data terbaru (tidak hilang).
  clearTimeout(rosterTunda);
  const sisa = 30000 - (Date.now() - rosterSinkronT);
  if (sisa > 0) {
    rosterTunda = setTimeout(() => sinkronRoster(masterDataSiswa), sisa);
    return;
  }
  return jalankanSinkronRoster(list);
}
async function jalankanSinkronRoster(list) {
  try {
    if (!window.auth || !window.auth.currentUser) return; // hanya akun staf (Firebase Auth)
    if (!list || !list.length) return;
    rosterSinkronT = Date.now();
    const { doc, getDoc, writeBatch } = window.fbFirestore;
    const items = [...list]
      .sort((p, q) => String(p.nisn).localeCompare(String(q.nisn)))
      .map(ringkasSiswa);
    const chunks = [];
    let cur = [];
    let size = 0;
    items.forEach((it) => {
      const b = JSON.stringify(it).length;
      if (cur.length && (size + b > ROSTER_MAKS_BYTE || cur.length >= ROSTER_MAKS_ITEM)) {
        chunks.push(cur);
        cur = [];
        size = 0;
      }
      cur.push(it);
      size += b;
    });
    if (cur.length) chunks.push(cur);
    const sigs = chunks.map((c) => hashSingkat(JSON.stringify(c)));

    const metaSnap = await getDoc(doc(window.db, "app_meta", ROSTER_META));
    const lama = metaSnap.exists() ? metaSnap.data() : {};
    const sigLama = lama.v === 1 && Array.isArray(lama.sigs) ? lama.sigs : [];
    if (sigLama.length === sigs.length && sigs.every((s, i) => s === sigLama[i])) return; // tidak ada perubahan

    const batch = writeBatch(window.db);
    chunks.forEach((c, i) => {
      if (sigLama[i] !== sigs[i]) batch.set(doc(window.db, "app_meta", "roster_" + i), { i, items: c });
    });
    for (let i = chunks.length; i < sigLama.length; i++) batch.delete(doc(window.db, "app_meta", "roster_" + i));
    batch.set(doc(window.db, "app_meta", ROSTER_META), { v: 1, n: chunks.length, sigs, total: items.length, t: Date.now() });
    await batch.commit();
  } catch (e) {
    console.warn("Sinkron roster gagal (aplikasi tetap berjalan):", e);
  }
}

// SISWA / TAMU: pastikan roster ada di memori. Gagal -> cara lama (muat semua siswa).
async function pastikanRoster(paksa = false) {
  if (!paksa && profilCache.size && Date.now() - rosterWaktu < ROSTER_TTL_MS) return true;
  if (!paksa) {
    try {
      const raw = localStorage.getItem(ROSTER_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && Array.isArray(p.items) && p.items.length && Date.now() - p.t < ROSTER_TTL_MS) {
          isiProfilCache(p.items);
          rosterWaktu = p.t;
          return true;
        }
      }
    } catch (e) {
      /* cache rusak: abaikan, ambil ulang */
    }
  }
  try {
    const { doc, getDoc } = window.fbFirestore;
    const meta = await getDoc(doc(window.db, "app_meta", ROSTER_META));
    if (!meta.exists() || meta.data().v !== 1 || !(meta.data().n > 0)) throw new Error("roster-belum-ada");
    const n = meta.data().n;
    const snaps = await Promise.all(
      Array.from({ length: n }, (_, i) => getDoc(doc(window.db, "app_meta", "roster_" + i))),
    );
    const items = [];
    snaps.forEach((s) => {
      if (s.exists()) items.push(...(s.data().items || []));
    });
    if (!items.length) throw new Error("roster-kosong");
    isiProfilCache(items);
    rosterWaktu = Date.now();
    try {
      localStorage.setItem(ROSTER_KEY, JSON.stringify({ t: rosterWaktu, items }));
    } catch (e) {
      /* penyimpanan penuh: lanjut tanpa cache lokal */
    }
    return true;
  } catch (e) {
    // Roster belum disiapkan staf / gagal dibaca: pakai cara lama supaya semua fitur tetap jalan
    await new Promise((res) => loadMasterSiswaFromCloud(res));
    return false;
  }
}

async function loadMasterSiswaFromCloud(callback, force = false) {
  if (!force) {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Date.now() - parsed.t < CACHE_TTL_MS) {
          masterDataSiswa = parsed.data || [];
          if (callback) callback();
          return;
        }
      }
    } catch (e) {
      /* cache rusak -> ambil ulang */
    }
  }

  try {
    const { collection, getDocs } = window.fbFirestore;
    const querySnapshot = await getDocs(collection(window.db, "siswa"));
    const list = [];
    querySnapshot.forEach((d) => {
      const sData = d.data();
      if (sData.dailyScore === undefined) sData.dailyScore = 0;
      // PIN & riwayat tidak perlu disimpan di memori/cache global
      delete sData.pin;
      delete sData.riwayat;
      list.push(sData);
    });
    masterDataSiswa = list;
    masterLoadError = null;
    if (currentUser) sinkronRoster(list); // staf: perbarui roster ringan untuk siswa
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ t: Date.now(), data: masterDataSiswa }),
      );
    } catch (e) {
      console.warn("Cache sessionStorage penuh, lanjut tanpa cache.", e);
    }
  } catch (err) {
    console.error("Gagal memuat data siswa:", err);
    masterLoadError = { code: (err && err.code) || "", pesan: (err && err.message) || String(err) };
  }
  if (callback) callback();
}

async function refreshMasterSiswa() {
  invalidateMasterCache();
  await loadMasterSiswaFromCloud(null, true);
}

// ==========================================
// TUGAS / PR
// ==========================================
async function loadTugasAktif() {
  const container = $("mainTaskBoardList");
  const teacherContainer = $("teacherTaskList");
  if (!container && !teacherContainer) return;

  try {
    const { collection, getDocs, query, where } = window.fbFirestore;
    const satuMinggu = 7 * 24 * 60 * 60 * 1000;
    const querySnapshot = await getDocs(
      query(
        collection(window.db, "tugas"),
        where("timestamp", ">=", Date.now() - satuMinggu),
      ),
    );

    masterDataTugas = [];
    querySnapshot.forEach((docSnap) => masterDataTugas.push(docSnap.data()));
    masterDataTugas.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    if (container) {
      if (masterDataTugas.length === 0) {
        container.innerHTML = `<div style="font-size: 10.5px; color: #888; text-align: center; padding: 10px;">Belum ada tugas atau PR aktif minggu ini.</div>`;
      } else {
        container.innerHTML = masterDataTugas
          .map(
            (t) => `
          <div style="background: #f8f9fa; border-left: 3px solid #f1c40f; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; color: #1e3c72; margin-bottom: 2px;">
              <span>📌 ${escapeHtml(t.judul)}</span>
              <span style="font-size: 8.5px; background: #e2e8f0; padding: 2px 5px; border-radius: 4px; color: #555;">${escapeHtml(t.targetKelas)}</span>
            </div>
            <div style="font-size: 10px; color: #444; line-height: 1.4; margin-bottom: 4px; white-space: pre-line;">${escapeHtml(t.isi)}</div>
            <div style="font-size: 8.5px; color: #888; display: flex; justify-content: space-between;">
              <span>👨‍🏫 Oleh: ${escapeHtml(t.namaGuru)}</span>
              <span>📅 ${escapeHtml(t.tanggal)}</span>
            </div>
          </div>`,
          )
          .join("");
      }
    }

    if (teacherContainer) {
      // Guru hanya mengelola tugas miliknya sendiri
      const namaGuru = currentUser?.nama;
      const milikku = masterDataTugas.filter((t) => t.namaGuru === namaGuru);
      if (milikku.length === 0) {
        teacherContainer.innerHTML = `<div style="font-size: 10px; color: #888; text-align: center; padding: 8px;">Tidak ada tugas aktif milikmu yang bisa dikelola.</div>`;
      } else {
        teacherContainer.innerHTML = milikku
          .map(
            (t) => `
          <div style="background: #111823; border: 1px solid #34495e; border-radius: 8px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <div style="overflow: hidden;">
              <div style="font-size: 11px; font-weight: bold; color: #f1c40f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(t.judul)}</div>
              <div style="font-size: 9px; color: #bdc3c7;">Target: ${escapeHtml(t.targetKelas)} | ${escapeHtml(t.tanggal)}</div>
            </div>
            <button type="button" data-id="${escapeHtml(t.id)}" onclick="hapusTugas(this.dataset.id)" style="margin-top: 0; padding: 4px 8px; font-size: 9px; background: #e74c3c; color: #fff; width: auto; border-radius: 6px; box-shadow: none; flex-shrink: 0;">Hapus</button>
          </div>`,
          )
          .join("");
      }
    }
  } catch (err) {
    console.error("Gagal memuat daftar tugas:", err);
    if (container) {
      container.innerHTML = `<div style="font-size: 10.5px; color: #e74c3c; text-align: center; padding: 10px;">Gagal memuat tugas. Periksa koneksi internet.</div>`;
    }
  }
}

window.hapusTugas = async function (tugasId) {
  const yakin = await window.customConfirm(
    "Yakin ingin menghapus tugas ini dari sistem?",
  );
  if (!yakin) return;

  showGamePreloader("MENDELETING TASK FROM CLOUD...", async (done) => {
    try {
      const { doc, deleteDoc } = window.fbFirestore;
      await deleteDoc(doc(window.db, "tugas", tugasId));
      done();
      window.customAlert("✅ Tugas berhasil dihapus!");
      loadTugasAktif();
    } catch (err) {
      done();
      console.error("Gagal menghapus tugas:", err);
      window.customAlert("Gagal menghapus tugas dari database.");
    }
  });
};

window.simpanPengumumanTugas = async function () {
  const targetKelas = $("postKelasTarget").value;
  const judul = $("postJudul").value.trim();
  const isi = $("postIsi").value.trim();
  const namaGuru = currentUser?.nama || $("txtNamaGuru").innerText;

  if (!judul || !isi)
    return window.customAlert("Judul dan isi tugas wajib diisi!");
  if (judul.length > 120)
    return window.customAlert("Judul maksimal 120 karakter!");
  if (isi.length > 1500)
    return window.customAlert("Isi tugas maksimal 1500 karakter!");

  showGamePreloader("PUBLISHING TASK TO CLOUD...", async (done) => {
    try {
      const { doc, setDoc } = window.fbFirestore;
      const tugasId = "tugas_" + Date.now();

      await setDoc(doc(window.db, "tugas", tugasId), {
        id: tugasId,
        targetKelas,
        judul,
        isi,
        namaGuru,
        tanggal: localDateStr(),
        timestamp: Date.now(),
      });

      done();
      window.customAlert("✅ Tugas & PR berhasil dipublikasikan!");
      $("formPostTugas").reset();
      loadTugasAktif();
    } catch (err) {
      done();
      console.error("Gagal mempublikasikan tugas:", err);
      window.customAlert("Gagal menyimpan tugas ke database.");
    }
  });
};

// ==========================================
// DATA PILIHAN POIN
// ==========================================
// Daftar aturan & poin ada di aturan.js (import di bagian atas file ini).

// ==========================================
// PENGATURAN NAVIGASI LAYAR & HTML5 HISTORY API
// ==========================================
let layarSaatIni = "menu"; // dipakai saklar maintenance

// ---- Mode Ambient: diam di menu utama AMBIENT_DIAM_MS -> menu memudar, tinggal pemandangan cuaca ----
let ambientAktif = false;
let ambientTerakhir = Date.now();
let ambientPetunjukTimer = null;
function ambientCatat() {
  ambientTerakhir = Date.now();
}
function ambientBolehMulai() {
  if (!FITUR.easterEgg || ambientAktif || document.hidden) return false;
  if (layarSaatIni !== "menu") return false;
  const menu = $("menuWrapper");
  if (!menu || menu.classList.contains("hidden")) return false;
  const mt = $("maintenanceHomeCard");
  if (mt && !mt.classList.contains("hidden")) return false; // jangan ganggu pengumuman maintenance
  const pop = $("customPopupOverlay");
  if (pop && getComputedStyle(pop).display !== "none") return false;
  return Date.now() - ambientTerakhir >= AMBIENT_DIAM_MS;
}
function ambientMulai() {
  ambientAktif = true;
  const tangkap = document.createElement("div");
  tangkap.id = "ambientTangkap";
  tangkap.innerHTML = '<div class="ambient-petunjuk">Ketuk di mana saja untuk kembali ke menu</div>';
  document.body.appendChild(tangkap);
  const selesai = (ev) => {
    if (ev && ev.type === "keydown" && ev.key === "Tab") return;
    ambientSelesai();
  };
  tangkap.addEventListener("pointerdown", selesai);
  document.addEventListener("keydown", selesai, true);
  tangkap._selesai = selesai;
  document.body.classList.add("ambient-mode");
  ambientPetunjukTimer = setTimeout(() => tangkap.classList.add("petunjuk-hilang"), 5000);
}
function ambientSelesai() {
  if (!ambientAktif) return;
  ambientAktif = false;
  clearTimeout(ambientPetunjukTimer);
  const tangkap = $("ambientTangkap");
  if (tangkap) {
    document.removeEventListener("keydown", tangkap._selesai, true);
    tangkap.remove();
  }
  document.body.classList.remove("ambient-mode");
  ambientTerakhir = Date.now();
}
if (FITUR.easterEgg) {
  ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll"].forEach((ev) =>
    document.addEventListener(ev, ambientCatat, { passive: true, capture: true }),
  );
  setInterval(() => {
    if (ambientBolehMulai()) ambientMulai();
  }, 5000);
}

const SCREEN_IDS = [
  "menuWrapper",
  "mainMenuCard",
  "loginCard",
  "siswaCard",
  "entryCard",
  "adminCard",
  "questBoardCard",
  "leaderboardCard",
];

function showScreen(screenId, pushHistory = true) {
  layarSaatIni = screenId;
  ambientSelesai();
  SCREEN_IDS.forEach((id) => $(id).classList.add("hidden"));

  if (screenId === "menu") {
    $("menuWrapper").classList.remove("hidden");
    $("mainMenuCard").classList.remove("hidden");
    loadTugasAktif();
  } else if (screenId === "login") {
    $("loginCard").classList.remove("hidden");
  } else if (screenId === "siswa") {
    $("siswaCard").classList.remove("hidden");
    if (currentNisnSiswa) {
      // Siswa masih login: jangan reset tampilan
      if (isAlumniSession) {
        $("alumniTranscriptView").classList.remove("hidden");
        $("hasilPoinSiswa").classList.add("hidden");
        $("boxInputNisnSiswa").classList.add("hidden");
      } else {
        $("hasilPoinSiswa").classList.remove("hidden");
        $("boxInputNisnSiswa").classList.add("hidden");
        setSiswaAppMode(true);
      }
    } else {
      setSiswaAppMode(false);
      $("hasilPoinSiswa").classList.add("hidden");
      $("alumniTranscriptView").classList.add("hidden");
      $("boxInputNisnSiswa").classList.remove("hidden");
      $("nisnSiswaInput").value = "";
      if ($("pinSiswaInput")) $("pinSiswaInput").value = "";
    }
  } else if (screenId === "quest") {
    $("questBoardCard").classList.remove("hidden");
    window.renderQuestUI("prestasi");
  } else if (screenId === "leaderboard") {
    $("leaderboardCard").classList.remove("hidden");
    if (currentUser) loadMasterSiswaFromCloud(() => window.renderGlobalLeaderboard());
    else pastikanRoster().then(() => window.renderGlobalLeaderboard());
  } else if (screenId === "entry") {
    $("entryCard").classList.remove("hidden");
  } else if (screenId === "admin") {
    $("adminCard").classList.remove("hidden");
    window.handleAdminActionTypeChange();
  }

  updateFabLaporanBug();
  terapkanMaintenance();

  if (pushHistory) {
    window.history.pushState({ screen: screenId }, "", `#${screenId}`);
  }
}

// ==========================================
// MODE MAINTENANCE (saklar di Firestore: app_meta/maintenance)
// ==========================================
// Cara pakai (Firebase Console > Firestore > app_meta > dokumen "maintenance"):
//   aktif: true                (boolean)  -> aplikasi dikunci untuk siswa & guru
//   pesan: "..."               (string, opsional) -> teks di layar maintenance
//   perkiraanSelesai: "..."    (string, opsional) -> mis. "15.00 WIB"
// Matikan dengan aktif: false (atau hapus dokumennya). Berlaku seketika di semua
// perangkat yang sedang membuka aplikasi. Super Admin tetap bisa masuk.
// Jika dokumen tidak ada atau gagal dibaca, aplikasi berjalan NORMAL.
let maintenanceState = { aktif: false, pesan: "", perkiraanSelesai: "" };
let adminLoginModeMaintenance = false;

// Bukan batas keamanan, hanya kenyamanan tampilan (tidak ada kedipan layar
// maintenance saat sesi admin dipulihkan).
function sesiSuperAdminAktif() {
  if (currentUser && currentUser.role === "Super Admin") return true;
  try {
    const saved = JSON.parse(localStorage.getItem("loggedInUser") || "null");
    return !!saved && saved.role === "Super Admin";
  } catch (e) {
    return false;
  }
}

let maintenanceKeluarPaksa = false;
let maintenanceSedangTerapkan = false;

// Keluarkan paksa semua sesi non-admin (siswa/alumni & guru) saat maintenance.
function paksaKeluarSemuaNonAdmin() {
  const stafTersimpan = (() => {
    try {
      return JSON.parse(localStorage.getItem("loggedInUser") || "null");
    } catch (e) {
      return null;
    }
  })();
  const stafNonAdmin =
    (currentUser && currentUser.role !== "Super Admin") ||
    (!currentUser && stafTersimpan && stafTersimpan.role !== "Super Admin");
  const adaSiswa = !!(currentNisnSiswa || localStorage.getItem("activeUser"));

  if (adaSiswa) {
    try {
      const n = getMyNisn();
      if (n) Promise.resolve(lepasSesiServer(n)).catch(() => {});
    } catch (e) {}
    cleanupStudentSession();
    localStorage.removeItem("activeUser");
    localStorage.removeItem("activeUserExpiry");
    maintenanceKeluarPaksa = true;
  }
  if (stafNonAdmin) {
    cleanupAdminListeners();
    berhentiDaftarOnline();
    stopPresenceGuru(true);
    localStorage.removeItem("loggedInUser");
    currentUser = null;
    currentRole = "";
    signOut(auth).catch((e) => console.warn("Gagal signOut:", e));
    maintenanceKeluarPaksa = true;
  }
}

function terapkanMaintenance() {
  const wrapper = $("menuWrapper");
  const kartu = $("maintenanceHomeCard");
  const banner = $("maintenanceAdminBanner");
  if (!wrapper || !kartu || !banner || maintenanceSedangTerapkan) return;
  maintenanceSedangTerapkan = true;
  try {
    const admin = sesiSuperAdminAktif();
    // Mode "Login Admin" hanya berlaku selama layar login terbuka
    if (layarSaatIni !== "login") adminLoginModeMaintenance = false;

    const blokir = maintenanceState.aktif && !admin;
    if (blokir) {
      paksaKeluarSemuaNonAdmin();
      const bolehLogin = adminLoginModeMaintenance && layarSaatIni === "login";
      if (layarSaatIni !== "menu" && !bolehLogin) {
        showScreen("menu", false); // memanggil ulang terapkanMaintenance (dijaga flag)
      }
    } else {
      maintenanceKeluarPaksa = false;
    }

    const tampilKartu = blokir && layarSaatIni === "menu";
    wrapper.classList.toggle("maintenance-on", tampilKartu);
    kartu.classList.toggle("hidden", !tampilKartu);
    banner.classList.toggle("hidden", !(maintenanceState.aktif && admin));

    if (tampilKartu) {
      $("maintenancePesan").textContent =
        maintenanceState.pesan || "Sedang diperbaiki. Mohon tunggu sebentar.";
      const est = maintenanceState.perkiraanSelesai;
      const elEst = $("maintenanceEstimasi");
      elEst.textContent = est ? `⏱ Perkiraan selesai: ${est}` : "";
      elEst.classList.toggle("hidden", !est);
      $("maintenanceKeluarInfo").classList.toggle("hidden", !maintenanceKeluarPaksa);
    }
  } finally {
    maintenanceSedangTerapkan = false;
  }
}

window.bukaLoginAdminSaatMaintenance = function () {
  adminLoginModeMaintenance = true;
  showScreen("login");
};

// Jalan masuk admin yang TIDAK terlihat: ketuk ikon 🛠️ di layar maintenance
// 5 kali dalam 3 detik -> layar login terbuka (hanya Super Admin yang lolos).
let ketukAdminHitung = 0;
let ketukAdminMulai = 0;
window.ketukIkonMaintenance = function () {
  const sekarang = Date.now();
  // Jendela 3 detik dihitung sejak ketukan pertama dalam rangkaian
  if (ketukAdminHitung === 0 || sekarang - ketukAdminMulai > 3000) {
    ketukAdminHitung = 0;
    ketukAdminMulai = sekarang;
  }
  ketukAdminHitung++;
  if (ketukAdminHitung >= 5) {
    ketukAdminHitung = 0;
    window.bukaLoginAdminSaatMaintenance();
  }
};

function mulaiPantauMaintenance() {
  try {
    const { doc, onSnapshot } = window.fbFirestore;
    onSnapshot(
      doc(window.db, "app_meta", "maintenance"),
      (snap) => {
        const d = snap.exists() ? snap.data() : {};
        maintenanceState = {
          aktif: d.aktif === true || d.aktif === "true",
          pesan: typeof d.pesan === "string" ? d.pesan : "",
          perkiraanSelesai:
            typeof d.perkiraanSelesai === "string" ? d.perkiraanSelesai : "",
        };
        terapkanMaintenance();
      },
      (err) => {
        // Gagal baca (offline/izin): jangan kunci aplikasi
        console.warn(
          "Pantau maintenance gagal (aplikasi tetap berjalan):",
          err,
        );
      },
    );
  } catch (e) {
    console.warn("Pantau maintenance tidak bisa dimulai:", e);
  }
}

// Tombol melayang "Laporan Bug & Masukan" hanya muncul untuk pengirim laporan
// (siswa/alumni & guru) — Admin tidak perlu tombol ini karena Admin yang
// MENERIMA laporan (lewat tab Laporan), bukan mengirim.
function updateFabLaporanBug() {
  const fab = $("btnFabLaporanBug");
  if (!fab) return;
  const sudahLogin =
    (!!currentUser && currentUser.role !== "Super Admin") || !!currentNisnSiswa;
  fab.classList.toggle("hidden", !sudahLogin);
}

window.togglePassword = function () {
  const pwd = $("password");
  const showing = pwd.type === "password";
  pwd.type = showing ? "text" : "password";
  const eye = $("eyeIcon");
  if (eye) eye.textContent = showing ? "🙈" : "👁️";
};

window.bukaPortal = function (tipe) {
  if (tipe === "guru") {
    showScreen("login");
  } else if (tipe === "siswa") {
    showScreen("siswa");
  } else if (tipe === "quest") {
    showGamePreloader("MEMUAT PANDUAN TATIB...", (done) => {
      setTimeout(() => {
        showScreen("quest");
        done();
      }, 600);
    });
  } else if (tipe === "leaderboard") {
    showGamePreloader("LOADING GLOBAL LEADERBOARD...", (done) => {
      setTimeout(() => {
        showScreen("leaderboard");
        done();
      }, 600);
    });
  }
};

window.kembaliKeMenu = function () {
  showScreen("menu");
};

window.keluarSiswa = async function () {
  const ok = await window.customConfirm(
    "Yakin ingin keluar dari halaman ini?",
    "🚪 KONFIRMASI KELUAR",
  );
  if (!ok) return;

  await lepasSesiServer(getMyNisn());
  cleanupStudentSession();
  localStorage.removeItem("activeUser");
  localStorage.removeItem("activeUserExpiry");
  showScreen("menu");
};

function cleanupAdminListeners() {
  if (adminActiveChatListener) {
    adminActiveChatListener();
    adminActiveChatListener = null;
  }
  if (adminGlobalChatListener) {
    adminGlobalChatListener();
    adminGlobalChatListener = null;
  }
  currentAdminSelectedRoomId = "";
}

window.logout = async function () {
  const ok = await window.customConfirm(
    "Yakin ingin keluar dari halaman ini?",
    "🚪 KONFIRMASI KELUAR",
  );
  if (!ok) return;

  cleanupAdminListeners();
  berhentiDaftarOnline();
  stopPresenceGuru(true);
  localStorage.removeItem("loggedInUser");
  currentUser = null;
  currentRole = "";
  signOut(auth).catch((e) => console.warn("Gagal signOut:", e));
  showScreen("menu");
};

// ==========================================
// LEADERBOARD
// ==========================================
window.renderGlobalLeaderboard = function () {
  const filter = $("filterLeaderboardKelas").value;
  const container = $("globalLeaderboardList");
  if (!container) return;

  const sumber = daftarSiswaRingan();
  const filtered =
    filter === "SEMUA" ? [...sumber] : sumber.filter((s) => s.kelas === filter);
  filtered.sort((a, b) => (b.dailyScore || 0) - (a.dailyScore || 0));

  if (filtered.length === 0) {
    container.innerHTML = `<div style="font-size: 11px; color: #95a5a6; text-align: center; padding: 15px;">Belum ada data siswa di leaderboard.</div>`;
    return;
  }

  let leaderboardHtml = "";

  filtered.forEach((s, index) => {
    const rank = index + 1;
    const score = s.dailyScore || 0;

    let rankBadge = `#${rank}`;
    let rowStyle = "background: #1a2536; border: 1px solid #34495e;";
    let nameColor = "#fff";
    let scoreColor = "#f1c40f";

    if (rank === 1) {
      rankBadge = "👑 1";
      rowStyle =
        "background: linear-gradient(135deg, #a18000, #1a2536); border: 2.5px solid #f1c40f; box-shadow: 0 0 18px rgba(241, 196, 15, 0.7);";
      nameColor = "#f1c40f";
      scoreColor = "#f1c40f";
    } else if (rank === 2) {
      rankBadge = "🥈 2";
      rowStyle =
        "background: linear-gradient(135deg, #003d93, #1e293b); border: 2.5px solid #38bdf8; box-shadow: 0 0 18px rgba(56, 189, 248, 0.6);";
      nameColor = "#38bdf8";
      scoreColor = "#38bdf8";
    } else if (rank === 3) {
      rankBadge = "🥉 3";
      rowStyle =
        "background: linear-gradient(135deg, #892b00, #1a2536); border: 2.5px solid #fb923c; box-shadow: 0 0 18px rgba(251, 146, 60, 0.6);";
      nameColor = "#fb923c";
      scoreColor = "#fb923c";
    }

    leaderboardHtml += `
    <div class="lb-row" style="${rowStyle} border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px;">
      <div class="lb-left" style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
        <div style="font-size: 13px; font-weight: bold; color: ${nameColor}; width: 32px; text-align: center; flex-shrink: 0;">${rankBadge}</div>
        <div style="width: 36px; height: 36px; border-radius: 8px; overflow: hidden; background: #2c3e50; flex-shrink: 0; border: 1.5px solid ${nameColor};">
          <img src="${escapeHtml(avatarFor(s))}" style="width: 100%; height: 100%; object-fit: cover;" onerror="${AVATAR_ONERROR}">
        </div>
        <div class="lb-name-wrap" style="overflow: hidden;">
          <div style="font-size: 12px; font-weight: bold; color: ${nameColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(s.nama)}</div>
          <div style="font-size: 9.5px; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Kelas: ${escapeHtml(s.kelas)}</div>
        </div>
      </div>
      <div style="text-align: right; flex-shrink: 0;">
        <div style="font-size: 13px; font-weight: bold; color: ${scoreColor}; white-space: nowrap;">${score} Pts</div>
        <div style="font-size: 8px; color: #94a3b8; white-space: nowrap;">Poin Tugas</div>
      </div>
    </div>`;
  });

  container.innerHTML = leaderboardHtml;
};

// ==========================================
// LAPORAN BUG & MASUKAN
// ==========================================
let laporanBugBusy = false;

window.bukaModalLaporanBug = function () {
  const overlay = $("modalLaporanBug");
  if (!overlay) return;
  if ($("laporanBugKategori")) $("laporanBugKategori").value = "bug";
  if ($("laporanBugIsi")) $("laporanBugIsi").value = "";
  overlay.classList.remove("hidden");
};

window.tutupModalLaporanBug = function () {
  const overlay = $("modalLaporanBug");
  if (overlay) overlay.classList.add("hidden");
};

window.kirimLaporanBugUI = async function () {
  if (laporanBugBusy) return;

  const isiEl = $("laporanBugIsi");
  const isi = (isiEl ? isiEl.value : "").trim();
  if (!isi) {
    window.customAlert("Mohon isi dulu laporan bug atau masukannya ya.");
    return;
  }
  if (isi.length > 1000) {
    window.customAlert("Teksnya kepanjangan, maksimal 1000 karakter.");
    return;
  }
  const kategori = $("laporanBugKategori")
    ? $("laporanBugKategori").value
    : "bug";

  let pelaporNama = "Anonim";
  let pelaporPeran = "Tidak diketahui";
  let pelaporId = "-";

  if (currentUser) {
    pelaporNama = currentUser.nama || "Guru/Admin";
    pelaporPeran = currentUser.role || "Guru/Admin";
    pelaporId = currentUser.email || pelaporNama;
  } else if (currentNisnSiswa) {
    const s = cariSiswa(currentNisnSiswa);
    pelaporNama = s ? s.nama : currentNisnSiswa;
    pelaporPeran = isAlumniSession ? "Alumni" : "Siswa";
    pelaporId = currentNisnSiswa;
  }

  laporanBugBusy = true;
  const btn = $("btnKirimLaporanBug");
  if (btn) btn.disabled = true;

  try {
    const { collection, getDocs, query, where, addDoc, getCountFromServer } =
      window.fbFirestore;
    const laporanRef = collection(window.db, "laporan_bug");

    // Kuota 1: total laporan yang boleh menumpuk (belum diproses/dihapus Admin)
    // di SELURUH sistem — begitu Admin menghapus laporan lama, slot ini otomatis
    // lega lagi karena yang dihitung adalah dokumen yang masih ada di database.
    try {
      const totalSnap = await getCountFromServer(laporanRef);
      const totalAktif = totalSnap.data().count;
      if (totalAktif >= MAX_LAPORAN_BUG_AKTIF) {
        window.customAlert(
          `⚠️ Kotak laporan sedang penuh (${totalAktif}/${MAX_LAPORAN_BUG_AKTIF}). Admin perlu memproses laporan yang menumpuk dulu sebelum bisa menerima laporan baru. Coba lagi nanti ya.`,
        );
        laporanBugBusy = false;
        if (btn) btn.disabled = false;
        return;
      }
    } catch (e) {
      // Kalau pengecekan kuota total gagal (mis. sedang offline), tetap lanjut kirim
      console.warn("Gagal mengecek kuota total laporan:", e);
    }

    // Kuota 2: maksimal per pengirim per hari (biar satu orang tidak memenuhi
    // sendiri kuota total di atas dengan spam berulang-ulang).
    const mulaiHariIni = new Date();
    mulaiHariIni.setHours(0, 0, 0, 0);
    const mulaiHariIniMs = mulaiHariIni.getTime();

    try {
      const cekSnap = await getDocs(
        query(laporanRef, where("pelaporId", "==", pelaporId)),
      );
      const jumlahHariIni = cekSnap.docs.filter(
        (d) => (d.data().waktu || 0) >= mulaiHariIniMs,
      ).length;

      if (jumlahHariIni >= MAX_LAPORAN_BUG_PER_HARI) {
        window.customAlert(
          `⚠️ Kamu sudah mengirim ${MAX_LAPORAN_BUG_PER_HARI} laporan hari ini. Coba lagi besok ya, atau tunggu Admin memproses laporan sebelumnya.`,
        );
        laporanBugBusy = false;
        if (btn) btn.disabled = false;
        return;
      }
    } catch (e) {
      // Kalau pengecekan kuota harian gagal (mis. sedang offline), tetap lanjut kirim
      console.warn("Gagal mengecek kuota laporan harian:", e);
    }

    await addDoc(laporanRef, {
      kategori,
      isi,
      pelaporNama,
      pelaporPeran,
      pelaporId,
      status: "baru",
      waktu: Date.now(),
    });
    window.tutupModalLaporanBug();
    window.customAlert(
      "✅ Terima kasih! Laporan/masukan kamu sudah terkirim ke Admin.",
    );
  } catch (err) {
    console.error("Gagal mengirim laporan bug:", err);
    window.customAlert(
      "Gagal mengirim laporan. Periksa koneksi internet lalu coba lagi.",
    );
  } finally {
    laporanBugBusy = false;
    if (btn) btn.disabled = false;
  }
};

// --- Panel Admin: melihat & mengelola laporan ---
function updateLaporanBugBadge(count) {
  const badge = $("navBtnLaporanBadge");
  if (!badge) return;
  if (count > 0) {
    badge.innerText = count > 99 ? "99+" : String(count);
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

window.loadLaporanBugAdmin = async function () {
  const container = $("adminLaporanBugList");
  if (!container) return;
  container.innerHTML = `<div style="font-size: 10px; color: #888; text-align: center; padding: 15px;">Memuat laporan...</div>`;

  try {
    const { collection, getDocs, query, orderBy } = window.fbFirestore;
    const snap = await getDocs(
      query(collection(window.db, "laporan_bug"), orderBy("waktu", "desc")),
    );

    if (snap.empty) {
      container.innerHTML = `<div style="font-size: 10px; color: #888; text-align: center; padding: 15px;">Belum ada laporan bug atau masukan dari pengguna.</div>`;
      updateLaporanBugBadge(0);
      return;
    }

    let html = "";
    let belumCount = 0;

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const id = docSnap.id;
      const status = d.status || "baru";
      if (status === "baru") belumCount++;

      const kategoriLabel = d.kategori === "masukan" ? "💡 Masukan" : "🐞 Bug";
      const kategoriColor = d.kategori === "masukan" ? "#3498db" : "#e74c3c";
      const waktuStr = d.waktu
        ? new Date(d.waktu).toLocaleString("id-ID", {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "-";

      html += `
      <div class="laporan-bug-row" style="border-left-color: ${kategoriColor};">
        <div class="laporan-bug-row-top">
          <span class="laporan-bug-kategori" style="color: ${kategoriColor};">${kategoriLabel}</span>
          <span class="laporan-bug-waktu">${waktuStr}</span>
        </div>
        <div class="laporan-bug-isi">${escapeHtml(d.isi || "")}</div>
        <div class="laporan-bug-meta">👤 ${escapeHtml(d.pelaporNama || "-")} (${escapeHtml(d.pelaporPeran || "-")})</div>
        <div class="laporan-bug-actions">
          <select onchange="window.ubahStatusLaporanBug('${id}', this.value)" class="laporan-bug-status-select">
            <option value="baru" ${status === "baru" ? "selected" : ""}>🆕 Baru</option>
            <option value="diproses" ${status === "diproses" ? "selected" : ""}>🔧 Diproses</option>
            <option value="selesai" ${status === "selesai" ? "selected" : ""}>✅ Selesai</option>
          </select>
          <button type="button" onclick="window.hapusLaporanBugUI('${id}')" class="laporan-bug-delete-btn">🗑️</button>
        </div>
      </div>`;
    });

    container.innerHTML = html;
    updateLaporanBugBadge(belumCount);
  } catch (err) {
    console.error("Gagal memuat laporan bug:", err);
    container.innerHTML = `<div style="font-size: 10px; color: #e74c3c; text-align: center; padding: 15px;">Gagal memuat laporan. Coba muat ulang.</div>`;
  }
};

window.ubahStatusLaporanBug = async function (id, status) {
  try {
    const { doc, updateDoc } = window.fbFirestore;
    await updateDoc(doc(window.db, "laporan_bug", id), { status });
    window.loadLaporanBugAdmin();
  } catch (err) {
    console.error("Gagal mengubah status laporan:", err);
    window.customAlert("Gagal mengubah status laporan.");
  }
};

window.hapusLaporanBugUI = async function (id) {
  const yakin = await window.customConfirm(
    "Yakin ingin menghapus laporan ini secara permanen?",
  );
  if (!yakin) return;
  try {
    const { doc, deleteDoc } = window.fbFirestore;
    await deleteDoc(doc(window.db, "laporan_bug", id));
    window.loadLaporanBugAdmin();
  } catch (err) {
    console.error("Gagal menghapus laporan:", err);
    window.customAlert("Gagal menghapus laporan.");
  }
};

// Admin tetap dapat melihat ada laporan baru walau belum membuka tab Laporan,
// dengan mengecek jumlah status "baru" sesaat setelah login sebagai Super Admin.
async function cekBadgeLaporanBugAwal() {
  try {
    const { collection, getDocs, query, where } = window.fbFirestore;
    const snap = await getDocs(
      query(
        collection(window.db, "laporan_bug"),
        where("status", "==", "baru"),
      ),
    );
    updateLaporanBugBadge(snap.size);
  } catch (err) {
    // Diam saja kalau gagal (mis. rules belum diperbarui) — tidak mengganggu login
  }
}

// ==========================================
// LOGIN GURU / ADMIN (FIREBASE AUTH)
// ==========================================
window.login = async function () {
  const usernameIn = $("namaGuruInput").value.trim();
  const passIn = $("password").value.trim();
  $("pesanEror").style.display = "none";

  const emailLogin = usernameIn.includes("@")
    ? usernameIn
    : `${usernameIn.toLowerCase()}@smkwiraguna.sch.id`;

  showGamePreloader("VERIFYING CREDENTIALS...", async (done) => {
    try {
      await window.fbAuth.signInWithEmailAndPassword(
        window.auth,
        emailLogin,
        passIn,
      );

      const { doc, getDoc } = window.fbFirestore;
      let userData = { nama: "Petugas Sekolah", role: "Guru Mapel" };
      try {
        const teacherDocSnap = await getDoc(
          doc(window.db, "teachers", emailLogin),
        );
        if (teacherDocSnap.exists()) userData = teacherDocSnap.data();
      } catch (e) {
        console.warn("Profil guru tidak terbaca, pakai peran default:", e);
      }
      // Pastikan email selalu konsisten dengan id dokumen aslinya (dipakai utk
      // identitas laporan bug & simpan foto profil guru), terlepas apakah
      // dokumen teachers/{email} menyimpan field email-nya sendiri atau tidak.
      userData.email = emailLogin;

      localStorage.setItem("loggedInUser", JSON.stringify(userData));
      prosesMasukUser(userData, done);
    } catch (err) {
      done();
      console.error("Login gagal:", err);
      $("pesanEror").style.display = "block";
    }
  });
};

function prosesMasukUser(user, doneCallback) {
  currentUser = user;
  currentRole = user.role;
  $("pesanEror").style.display = "none";

  if (user.role === "Super Admin") {
    loadMasterSiswaFromCloud(() => {
      setTimeout(() => {
        if (doneCallback) doneCallback();
        $("txtNamaAdmin").innerText = user.nama;
        pasangSapaanStaf(user);
        showScreen("admin");
        window.switchAdminTab("rekap");
        cekBadgeLaporanBugAwal();
      }, 400);
    });
  } else {
    $("txtNamaGuru").innerText = user.nama;
    $("txtRoleGuru").innerText = "Jabatan: " + labelJabatan(user);
    pasangSapaanStaf(user);
    mulaiPresenceGuru(user);
    loadMasterSiswaFromCloud(() => {
      if (doneCallback) doneCallback();
      showScreen("entry");
      initFormEntry();
      window.switchTeacherTab("profil");
      loadTugasAktif();
    });
  }
}

// ==========================================
// WALI KELAS (dari field `kelasBinaan` di dokumen teachers/{email})
// ==========================================
// Isi yang diterima (huruf besar/kecil bebas): "10", "10 SMK", "Kelas 10",
// atau beberapa kelas dipisah koma/&: "10, 11" / "10 SMK & 11 SMK".
// Kosong atau "-" = bukan wali kelas.
function kelasBinaanList(u) {
  const raw = String((u && u.kelasBinaan) || "").trim();
  if (!raw || raw === "-") return [];
  const hasil = [];
  raw.split(/[,;&]+/).forEach((bagian) => {
    const m = bagian.match(/\b(10|11|12)\b/);
    if (m) {
      const k = `${m[1]} SMK`;
      if (!hasil.includes(k)) hasil.push(k);
    }
  });
  return hasil;
}

// ---- ROLE KEPALA SEKOLAH ----
// Diisi lewat field `role` = "Kepala Sekolah" di dokumen teachers/{email}.
// Tugasnya memonitor guru & siswa (hanya melihat, tidak menginput poin/tugas).
function isKepalaSekolah(u) {
  return /kepala\s*sekolah/i.test(String((u && u.role) || ""));
}

// Kelas yang boleh dimonitor: wali kelas -> kelas binaan, kepala sekolah -> semua kelas.
function kelasMonitorList(u) {
  if (isKepalaSekolah(u)) {
    const ada = new Set(
      (masterDataSiswa || [])
        .filter((s) => s.statusAkun !== "lulus" && s.kelas)
        .map((s) => s.kelas),
    );
    return ada.size ? [...ada].sort() : ["10 SMK", "11 SMK", "12 SMK"];
  }
  return kelasBinaanList(u);
}

// Contoh hasil: "Guru Mapel • Wali Kelas 10" atau "Wali Kelas 10"
// Kalau field `role` sudah berisi kata "Wali Kelas", kata itu tidak diulang.
function labelJabatan(u) {
  const base = (u && u.role) || "-";
  const kelas = kelasBinaanList(u).map((k) => k.replace(" SMK", ""));
  if (!kelas.length) return base;
  const daftar = kelas.join(" & ");
  if (/wali\s*kelas/i.test(base)) {
    return /\b(10|11|12)\b/.test(base) ? base : `${base} ${daftar}`;
  }
  return `${base} • Wali Kelas ${daftar}`;
}

// Kotak "Reset Foto Profil Siswa" hanya tampil untuk wali kelas, dan pilihan
// kelasnya dibatasi ke kelas binaan guru itu sendiri.
function terapkanFiturWaliKelas() {
  // Tombol "Monitoring Siswa" tampil untuk wali kelas & kepala sekolah
  const kepsek = isKepalaSekolah(currentUser);
  const navMon = $("navBtnMonitoring");
  if (navMon) {
    navMon.style.display =
      kepsek || kelasBinaanList(currentUser).length ? "" : "none";
  }
  // Kepala sekolah: tidak menginput poin/tugas, tapi bisa memonitor guru
  const navPoin = $("navBtnInputPoin");
  const navPost = $("navBtnPostTugas");
  const navMonGuru = $("navBtnMonitoringGuru");
  if (navPoin) navPoin.style.display = kepsek ? "none" : "";
  if (navPost) navPost.style.display = kepsek ? "none" : "";
  if (navMonGuru) navMonGuru.style.display = kepsek ? "" : "none";
  const box = $("boxResetFotoWaliKelas");
  const sel = $("waliKelasSelectKelas");
  if (!box || !sel) return;
  const kelas = kelasBinaanList(currentUser);
  box.classList.toggle("hidden", kelas.length === 0);
  if (kelas.length === 0) return;
  sel.innerHTML =
    (kelas.length > 1 ? '<option value="">-- Pilih Kelas --</option>' : "") +
    kelas.map((k) => `<option value="${k}">${k}</option>`).join("");
  window.handleWaliKelasPilihKelas();
}

// ==========================================
// ONLINE SEKARANG (tab untuk semua guru, bukan Super Admin)
// - Semua guru (wali kelas & guru mapel): melihat siswa yang sedang aktif,
//   mirip daftar online di Global Chat siswa.
// - Kepala sekolah: ditambah daftar guru yang sedang aktif.
// Guru mengirim "tanda aktif" ke dokumen teachers/{email} miliknya sendiri
// (diizinkan rules yang sudah ada) tiap 2 menit selama halaman terlihat.
// ==========================================
const PRESENCE_GURU_MS = 120000;
const ONLINE_GURU_THRESHOLD_MS = 300000;
let presenceGuruEmail = "";
let presenceGuruTimer = null;

async function kirimPresenceGuru(state) {
  if (!presenceGuruEmail) return;
  try {
    const { doc, setDoc } = window.fbFirestore;
    await setDoc(
      doc(window.db, "teachers", presenceGuruEmail),
      { state, lastActive: Date.now() },
      { merge: true },
    );
  } catch (e) {
    console.warn("Gagal mengirim tanda aktif guru:", e);
  }
}
const onVisibilityGuru = () => {
  if (presenceGuruEmail && document.visibilityState === "visible") {
    kirimPresenceGuru("online");
  }
};
const onPageHideGuru = () => kirimPresenceGuru("offline");

function stopPresenceGuru(kirimOffline) {
  if (presenceGuruTimer) clearInterval(presenceGuruTimer);
  presenceGuruTimer = null;
  document.removeEventListener("visibilitychange", onVisibilityGuru);
  window.removeEventListener("pagehide", onPageHideGuru);
  if (kirimOffline && presenceGuruEmail) kirimPresenceGuru("offline");
  presenceGuruEmail = "";
}
function mulaiPresenceGuru(user) {
  stopPresenceGuru(false);
  if (!user || !user.email || user.role === "Super Admin") return;
  presenceGuruEmail = String(user.email).toLowerCase();
  kirimPresenceGuru("online");
  presenceGuruTimer = setInterval(() => {
    if (document.visibilityState === "visible") kirimPresenceGuru("online");
  }, PRESENCE_GURU_MS);
  document.addEventListener("visibilitychange", onVisibilityGuru);
  window.addEventListener("pagehide", onPageHideGuru);
}

let onlineSiswaDocs = {};
let onlineGuruDocs = {};
let onlineTimer = null;
let onlinePoll = null;
let onlineGen = 0; // menolak hasil terlambat setelah tab ditutup
const ONLINE_POLL_MS = 150000; // 2,5 menit (hemat kuota baca; dulu pemantauan langsung)

function berhentiDaftarOnline() {
  onlineGen++;
  if (onlineTimer) clearInterval(onlineTimer);
  if (onlinePoll) clearInterval(onlinePoll);
  onlineTimer = null;
  onlinePoll = null;
}

async function ambilDaftarOnline() {
  const gen = onlineGen;
  const { collection, query, where, getDocs } = window.fbFirestore;
  try {
    const snapS = await getDocs(
      query(
        collection(window.db, "status"),
        where("lastActive", ">", Date.now() - ONLINE_THRESHOLD_MS),
      ),
    );
    if (gen !== onlineGen) return;
    onlineSiswaDocs = {};
    snapS.forEach((d) => (onlineSiswaDocs[d.id] = d.data()));
  } catch (err) {
    console.error("Gagal memuat siswa online:", err);
  }
  if (isKepalaSekolah(currentUser)) {
    try {
      const snapG = await getDocs(
        query(
          collection(window.db, "teachers"),
          where("lastActive", ">", Date.now() - ONLINE_GURU_THRESHOLD_MS),
        ),
      );
      if (gen !== onlineGen) return;
      onlineGuruDocs = {};
      snapG.forEach((d) => (onlineGuruDocs[d.id] = d.data()));
    } catch (err) {
      console.error("Gagal memuat guru online:", err);
    }
  }
  if (gen === onlineGen) renderDaftarOnline();
}
window.segarkanDaftarOnline = function () {
  ambilDaftarOnline();
};

function mulaiDaftarOnline() {
  berhentiDaftarOnline();
  ambilDaftarOnline();
  // Diperbarui berkala selama tab terbuka & layar terlihat
  onlinePoll = setInterval(() => {
    if (!document.hidden) ambilDaftarOnline();
  }, ONLINE_POLL_MS);
  // Yang berhenti mengirim tanda aktif otomatis hilang dari daftar
  onlineTimer = setInterval(renderDaftarOnline, 30000);
  renderDaftarOnline();
}

function renderDaftarOnline() {
  const listSiswa = $("onlineSiswaList");
  if (!listSiswa) return;
  const now = Date.now();

  // --- Siswa (semua guru) ---
  const siswaOnline = Object.entries(onlineSiswaDocs)
    .filter(
      ([, d]) => d.state === "online" && now - (d.lastActive || 0) < ONLINE_THRESHOLD_MS,
    )
    .map(([nisn]) => (masterDataSiswa || []).find((s) => s.nisn === nisn))
    .filter((s) => s && s.statusAkun !== "lulus");
  $("onlineSiswaCount").textContent = `${siswaOnline.length} siswa online`;

  if (siswaOnline.length === 0) {
    listSiswa.innerHTML = `<div class="guru-riwayat-kosong">Belum ada siswa yang sedang aktif.</div>`;
  } else {
    const perKelas = {};
    siswaOnline.forEach((s) => {
      (perKelas[s.kelas || "-"] = perKelas[s.kelas || "-"] || []).push(s);
    });
    listSiswa.innerHTML = Object.keys(perKelas)
      .sort()
      .map((k) => {
        const chips = perKelas[k]
          .sort((x, y) => String(x.nama).localeCompare(String(y.nama)))
          .map(
            (s) =>
              `<span class="online-chip"><img src="${escapeHtml(avatarFor(s))}" alt="" onerror="${AVATAR_ONERROR}"><span class="nm">${escapeHtml(s.nama)}</span></span>`,
          )
          .join("");
        return `<div class="online-grup"><div class="online-grup-judul">${escapeHtml(k)} <b>${perKelas[k].length}</b></div><div class="online-wrap">${chips}</div></div>`;
      })
      .join("");
  }

  // --- Guru (khusus kepala sekolah) ---
  const wrapGuru = $("onlineGuruWrap");
  if (!wrapGuru) return;
  const kepsek = isKepalaSekolah(currentUser);
  wrapGuru.classList.toggle("hidden", !kepsek);
  if (!kepsek) return;
  const meEmail = String((currentUser && currentUser.email) || "").toLowerCase();
  const guruOnline = Object.entries(onlineGuruDocs)
    .filter(
      ([id, d]) =>
        id !== meEmail &&
        d.state === "online" &&
        now - (d.lastActive || 0) < ONLINE_GURU_THRESHOLD_MS,
    )
    .map(([, d]) => d)
    .sort((x, y) => String(x.nama).localeCompare(String(y.nama)));
  $("onlineGuruCount").textContent = `${guruOnline.length} guru online`;
  $("onlineGuruList").innerHTML = guruOnline.length
    ? `<div class="online-wrap">${guruOnline
        .map(
          (g) =>
            `<span class="online-chip guru"><img src="${escapeHtml(avatarForGuru(g))}" alt="" onerror="${AVATAR_ONERROR}"><span class="nm">${escapeHtml(g.nama || "-")}<small>${escapeHtml(labelJabatan(g))}</small></span></span>`,
        )
        .join("")}</div>`
    : `<div class="guru-riwayat-kosong">Belum ada guru lain yang sedang aktif.</div>`;
}

window.switchTeacherTab = function (tab) {
  terapkanFiturWaliKelas();
  const tabProfil = $("teacherTabProfil");
  const tabPoin = $("teacherTabPoin");
  const tabPosting = $("teacherTabPosting");
  const btnProfil = $("navBtnProfilGuru");
  const btnPoin = $("navBtnInputPoin");
  const btnPosting = $("navBtnPostTugas");
  const tabMonitoring = $("teacherTabMonitoring");
  const btnMonitoring = $("navBtnMonitoring");
  const tabMonGuru = $("teacherTabMonitoringGuru");
  const btnMonGuru = $("navBtnMonitoringGuru");
  const tabOnline = $("teacherTabOnline");
  const btnOnline = $("navBtnOnline");
  if (tabOnline) tabOnline.classList.add("hidden");
  if (btnOnline) {
    btnOnline.style.background = "transparent";
    btnOnline.className = "btn-outline";
  }
  if (tab !== "online") berhentiDaftarOnline();

  tabProfil.classList.add("hidden");
  tabPoin.classList.add("hidden");
  tabPosting.classList.add("hidden");
  tabMonitoring.classList.add("hidden");
  if (tabMonGuru) tabMonGuru.classList.add("hidden");
  if (btnMonGuru) {
    btnMonGuru.style.background = "transparent";
    btnMonGuru.className = "btn-outline";
  }

  btnProfil.style.background = "transparent";
  btnProfil.className = "btn-outline";
  btnPoin.style.background = "transparent";
  btnPoin.className = "btn-outline";
  btnPosting.style.background = "transparent";
  btnPosting.className = "btn-outline";
  btnMonitoring.style.background = "transparent";
  btnMonitoring.className = "btn-outline";

  const kepsekTab = isKepalaSekolah(currentUser);
  if (
    tab === "monitoring" &&
    !kepsekTab &&
    kelasBinaanList(currentUser).length === 0
  ) {
    tab = "profil"; // bukan wali kelas / kepala sekolah -> tidak boleh membuka tab ini
  }
  if (tab === "monitoringGuru" && !kepsekTab) tab = "profil";
  if (kepsekTab && (tab === "poin" || tab === "posting")) tab = "profil";

  if (tab === "profil") {
    tabProfil.classList.remove("hidden");
    btnProfil.style.background = "#1e3c72";
    btnProfil.className = "";
    window.loadProfilGuru();
  } else if (tab === "poin") {
    tabPoin.classList.remove("hidden");
    btnPoin.style.background = "#1e3c72";
    btnPoin.className = "";
  } else if (tab === "posting") {
    tabPosting.classList.remove("hidden");
    btnPosting.style.background = "#1e3c72";
    btnPosting.className = "";
    loadTugasAktif();
  } else if (tab === "monitoring") {
    tabMonitoring.classList.remove("hidden");
    btnMonitoring.style.background = "#1e3c72";
    btnMonitoring.className = "";
    window.renderMonitoringSiswa();
  } else if (tab === "monitoringGuru") {
    tabMonGuru.classList.remove("hidden");
    btnMonGuru.style.background = "#1e3c72";
    btnMonGuru.className = "";
    window.renderMonitoringGuru();
  } else if (tab === "online" && tabOnline) {
    tabOnline.classList.remove("hidden");
    btnOnline.style.background = "#1e3c72";
    btnOnline.className = "";
    mulaiDaftarOnline();
  }
};

// ---- Monitoring Siswa (wali kelas: kelas binaan, kepala sekolah: semua kelas) ----
window.renderMonitoringSiswa = function () {
  const sel = $("monitorKelasSelect");
  const tabel = $("monitorTabel");
  if (!sel || !tabel) return;

  const kepsek = isKepalaSekolah(currentUser);
  const kelasList = kelasMonitorList(currentUser);
  if (kelasList.length === 0) {
    tabel.innerHTML = `<div class="guru-riwayat-kosong">Fitur ini hanya untuk wali kelas dan kepala sekolah.</div>`;
    return;
  }

  // Kepala sekolah mendapat pilihan tambahan "Semua Kelas"
  const opsi = kepsek ? ["Semua Kelas", ...kelasList] : kelasList;
  const dipilih = opsi.includes(sel.value) ? sel.value : opsi[0];
  sel.innerHTML = opsi
    .map(
      (k) =>
        `<option value="${k}"${k === dipilih ? " selected" : ""}>${k}</option>`,
    )
    .join("");
  sel.classList.toggle("hidden", opsi.length === 1);
  $("lblMonitorKelas").textContent = dipilih;

  const semuaKelas = dipilih === "Semua Kelas";
  const daftar = (masterDataSiswa || [])
    .filter(
      (s) =>
        s.statusAkun !== "lulus" &&
        (semuaKelas ? kelasList.includes(s.kelas) : s.kelas === dipilih),
    )
    .sort(
      (a, b) =>
        (semuaKelas ? String(a.kelas).localeCompare(String(b.kelas)) : 0) ||
        String(a.nama).localeCompare(String(b.nama)),
    );

  $("monitorInfo").textContent = `${daftar.length} siswa aktif`;

  if (daftar.length === 0) {
    tabel.innerHTML = `<div class="guru-riwayat-kosong">Belum ada siswa aktif di kelas ini.</div>`;
    return;
  }

  const baris = daftar
    .map((s, i) => {
      const hp = Math.max(0, s.hp !== undefined ? s.hp : 200);
      const pel = s.totalPelanggaran || 0;
      const pres = s.totalPrestasi || 0;
      const kelasTag = semuaKelas
        ? ` <span class="monitor-sub">${escapeHtml(s.kelas || "-")}</span>`
        : "";
      return `
      <tr>
        <td class="monitor-nama">${i + 1}. ${escapeHtml(s.nama)}${kelasTag}</td>
        <td${hp < 60 ? ' class="monitor-merah"' : ""}>${hp}</td>
        <td>${s.shield || 0}</td>
        <td>${s.dailyScore || 0}</td>
        <td${pres > 0 ? ' class="monitor-hijau"' : ""}>${pres}</td>
        <td${pel > 0 ? ' class="monitor-merah"' : ""}>${pel}</td>
      </tr>`;
    })
    .join("");

  tabel.innerHTML = `
    <table class="monitor-table">
      <thead>
        <tr><th class="monitor-nama">Nama</th><th>❤️</th><th>🛡️</th><th>⭐</th><th>🏆</th><th>⚠️</th></tr>
      </thead>
      <tbody>${baris}</tbody>
    </table>`;
};

window.muatUlangMonitoring = async function () {
  const btn = $("btnMuatUlangMonitor");
  if (btn) btn.disabled = true;
  try {
    await refreshMasterSiswa();
  } finally {
    if (btn) btn.disabled = false;
    window.renderMonitoringSiswa();
  }
};

// ---- Monitoring Guru (khusus Kepala Sekolah) ----
// Murni menghitung: dipisah dari tampilan supaya mudah diuji.
//  siswaList : array data siswa (masing-masing punya `riwayat`)
//  teacherList: array {email, nama, role, kelasBinaan}; boleh kosong (null) kalau
//               koleksi `teachers` tidak bisa dibaca -> daftar dibuat dari riwayat
//  tugasList : array tugas aktif {namaGuru}
function hitungStatistikGuru(siswaList, teacherList, tugasList) {
  const kunciNama = (n) =>
    String(n || "")
      .trim()
      .toLowerCase();
  const peta = new Map(); // kunci -> statistik
  const byEmail = new Map();
  const byNama = new Map();

  const buatStat = (g) => ({
    nama: g.nama || g.email || "-",
    email: g.email || "",
    jabatan: g.jabatan || "",
    harian: 0,
    prestasi: 0,
    pelanggaran: 0,
    tugas: 0,
    terakhir: "",
  });

  const punyaDaftar = Array.isArray(teacherList) && teacherList.length > 0;
  if (punyaDaftar) {
    teacherList.forEach((t) => {
      if (/super\s*admin/i.test(t.role || "") || isKepalaSekolah(t)) return;
      const st = buatStat({
        nama: t.nama,
        email: t.email,
        jabatan: labelJabatan(t),
      });
      const key = (t.email || kunciNama(t.nama)).toLowerCase();
      peta.set(key, st);
      if (t.email) byEmail.set(t.email.toLowerCase(), st);
      if (t.nama) byNama.set(kunciNama(t.nama), st);
    });
  }

  const cari = (ge, g) => {
    let st =
      (ge && byEmail.get(String(ge).toLowerCase())) ||
      (g && byNama.get(kunciNama(g)));
    if (!st && !punyaDaftar && (ge || g)) {
      // tanpa daftar guru: buat dari catatan riwayat
      const key = String(ge || kunciNama(g)).toLowerCase();
      st = peta.get(key);
      if (!st) {
        st = buatStat({ nama: g, email: ge });
        peta.set(key, st);
        if (ge) byEmail.set(String(ge).toLowerCase(), st);
        if (g) byNama.set(kunciNama(g), st);
      }
    }
    return st || null;
  };

  (siswaList || []).forEach((s) => {
    (s.riwayat || []).forEach((r) => {
      if (!r || (!r.g && !r.ge)) return;
      const st = cari(r.ge, r.g);
      if (!st) return;
      const kat = kategoriRiwayat(r);
      if (kat === "TugasHarian") st.harian++;
      else if (kat === "Prestasi") st.prestasi++;
      else st.pelanggaran++;
      if (r.d && String(r.d) > st.terakhir) st.terakhir = String(r.d);
    });
  });

  (tugasList || []).forEach((t) => {
    const st = byNama.get(kunciNama(t.namaGuru));
    if (st) st.tugas++;
  });

  return [...peta.values()].sort(
    (a, b) =>
      b.harian +
        b.prestasi +
        b.pelanggaran -
        (a.harian + a.prestasi + a.pelanggaran) ||
      String(a.nama).localeCompare(String(b.nama)),
  );
}

// "2026-11-14 09:30" -> "14/11"
function formatTanggalSingkat(d) {
  const m = String(d || "").match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : "-";
}

// Data statistik guru dipakai bersama oleh tab Monitoring Guru & profil kepala
// sekolah, jadi disimpan sebentar (2 menit) supaya tidak membaca Firestore berulang.
let statGuruCache = null; // { t, hasil, teacherTerbaca }
let statGuruPromise = null;
const STAT_GURU_TTL_MS = 2 * 60 * 1000;

async function ambilStatistikGuru(paksa = false) {
  if (
    !paksa &&
    statGuruCache &&
    Date.now() - statGuruCache.t < STAT_GURU_TTL_MS
  ) {
    return statGuruCache;
  }
  if (statGuruPromise) return statGuruPromise; // permintaan yang sama sedang berjalan

  statGuruPromise = (async () => {
    const { collection, getDocs, query, where } = window.fbFirestore;
    const [siswaSnap, teacherSnap, tugasSnap] = await Promise.all([
      getDocs(collection(window.db, "siswa")),
      getDocs(collection(window.db, "teachers")).catch((e) => {
        console.warn("Daftar guru tidak bisa dibaca:", e);
        return null;
      }),
      getDocs(
        query(
          collection(window.db, "tugas"),
          where("timestamp", ">=", Date.now() - 7 * 24 * 60 * 60 * 1000),
        ),
      ).catch(() => null),
    ]);

    const siswaList = [];
    siswaSnap.forEach((d) => siswaList.push(d.data()));
    let teacherList = null;
    if (teacherSnap) {
      teacherList = [];
      teacherSnap.forEach((d) =>
        teacherList.push({ email: d.id, ...d.data() }),
      );
    }
    const tugasList = [];
    if (tugasSnap) tugasSnap.forEach((d) => tugasList.push(d.data()));

    statGuruCache = {
      t: Date.now(),
      hasil: hitungStatistikGuru(siswaList, teacherList, tugasList),
      teacherTerbaca: !!teacherList,
    };
    return statGuruCache;
  })();

  try {
    return await statGuruPromise;
  } finally {
    statGuruPromise = null;
  }
}

window.renderMonitoringGuru = async function (paksa = false) {
  const tabel = $("monGuruTabel");
  const info = $("monGuruInfo");
  if (!tabel || !info) return;
  if (!isKepalaSekolah(currentUser)) {
    tabel.innerHTML = `<div class="guru-riwayat-kosong">Fitur ini hanya untuk kepala sekolah.</div>`;
    return;
  }
  info.textContent = "";
  tabel.innerHTML = `<div class="guru-riwayat-kosong">Memuat data guru...</div>`;

  try {
    const { hasil, teacherTerbaca } = await ambilStatistikGuru(paksa === true);
    info.textContent =
      `${hasil.length} guru • data semester ini` +
      (teacherTerbaca
        ? ""
        : " • (daftar guru tidak terbaca, hanya guru yang pernah input)");

    if (hasil.length === 0) {
      tabel.innerHTML = `<div class="guru-riwayat-kosong">Belum ada data guru.</div>`;
      return;
    }

    const baris = hasil
      .map((g, i) => {
        const total = g.harian + g.prestasi + g.pelanggaran;
        const sub = g.jabatan
          ? ` <span class="monitor-sub">${escapeHtml(g.jabatan)}</span>`
          : "";
        const terakhir = g.terakhir
          ? formatTanggalSingkat(g.terakhir)
          : `<span class="monitor-merah">Belum</span>`;
        return `
      <tr>
        <td class="monitor-nama">${i + 1}. ${escapeHtml(g.nama)}${sub}</td>
        <td${total === 0 ? ' class="monitor-merah"' : ""}>${g.harian}</td>
        <td${g.prestasi > 0 ? ' class="monitor-hijau"' : ""}>${g.prestasi}</td>
        <td${g.pelanggaran > 0 ? ' class="monitor-merah"' : ""}>${g.pelanggaran}</td>
        <td>${g.tugas}</td>
        <td>${terakhir}</td>
      </tr>`;
      })
      .join("");

    tabel.innerHTML = `
    <table class="monitor-table">
      <thead>
        <tr><th class="monitor-nama">Guru</th><th>⭐</th><th>🏆</th><th>⚠️</th><th>📢</th><th>Terakhir</th></tr>
      </thead>
      <tbody>${baris}</tbody>
    </table>`;
  } catch (e) {
    console.warn("Gagal memuat monitoring guru:", e);
    tabel.innerHTML = `<div class="guru-riwayat-kosong">Gagal memuat data. Periksa koneksi internet.</div>`;
  }
};

// ---- Ringkasan Sekolah (profil Kepala Sekolah): jumlah guru & jumlah siswa ----
let jumlahGuruCache = null; // { t, n }

// Hanya membaca koleksi `teachers` (ringan). Super Admin & kepala sekolah tidak dihitung.
async function ambilJumlahGuru() {
  if (jumlahGuruCache && Date.now() - jumlahGuruCache.t < STAT_GURU_TTL_MS) {
    return jumlahGuruCache.n;
  }
  const { collection, getDocs } = window.fbFirestore;
  const snap = await getDocs(collection(window.db, "teachers"));
  let n = 0;
  snap.forEach((d) => {
    const t = d.data();
    if (/super\s*admin/i.test(t.role || "") || isKepalaSekolah(t)) return;
    n++;
  });
  jumlahGuruCache = { t: Date.now(), n };
  return n;
}

window.renderRingkasanKepsek = async function () {
  if (!isKepalaSekolah(currentUser)) return;

  // Siswa aktif (yang sudah lulus tidak dihitung) — data sudah ada di memori
  const jumlahSiswa = (masterDataSiswa || []).filter(
    (s) => s.statusAkun !== "lulus" && s.kelas,
  ).length;
  $("kepsekTotalSiswa").textContent = jumlahSiswa;

  const elGuru = $("kepsekTotalGuru");
  elGuru.textContent = "...";
  try {
    elGuru.textContent = await ambilJumlahGuru();
  } catch (e) {
    console.warn("Gagal menghitung jumlah guru:", e);
    elGuru.textContent = "-";
  }
};

// ==========================================
// TAB PROFIL GURU
// ==========================================
// Foto default guru yang belum pernah mengganti foto: mengikuti field `jk`
// di dokumen teachers/{email} ("L" = laki-laki, "P" = perempuan). Kalau `jk`
// kosong atau file gambarnya belum ada, otomatis jatuh ke avatar umum
// (lihat onerror pada <img> di index.html).
const AVATAR_GURU_DEFAULT = {
  L: "assets/foto_guru/avatar_laki.webp",
  P: "assets/foto_guru/avatar_perempuan.webp",
};
function avatarForGuru(u) {
  if (u && u.fotoUrl) return u.fotoUrl;
  const jk = String((u && u.jk) || "")
    .trim()
    .toUpperCase()
    .charAt(0);
  return AVATAR_GURU_DEFAULT[jk] || "assets/foto_siswa/avatar.webp";
}

window.loadProfilGuru = async function () {
  if (!currentUser) return;

  const namaGuru = currentUser.nama || "-";
  $("txtNamaGuruProfil").textContent = namaGuru;
  $("badgeJabatanGuruProfil").textContent = labelJabatan(currentUser);

  // NIP bersifat opsional (diisi manual oleh Admin lewat Firebase Console) —
  // baris ini disembunyikan sepenuhnya kalau guru belum punya NIP.
  const rowNip = $("rowNipGuruProfil");
  if (currentUser.nip) {
    $("txtNipGuruProfil").textContent = currentUser.nip;
    if (rowNip) rowNip.classList.remove("hidden");
  } else if (rowNip) {
    rowNip.classList.add("hidden");
  }

  const avatarImg = $("avatarGuruMain");
  if (avatarImg) avatarImg.src = avatarForGuru(currentUser);

  // Banner profil bersifat opsional — kalau guru belum pernah mengatur
  // banner-nya, biarkan gradien bawaan (di CSS) yang tampil.
  const bannerImg = $("bannerGuruMain");
  if (bannerImg) {
    if (currentUser.bannerUrl) {
      bannerImg.src = currentUser.bannerUrl;
      bannerImg.style.display = "block";
    } else {
      bannerImg.removeAttribute("src");
      bannerImg.style.display = "none";
    }
  }

  // Kepala sekolah tidak menginput poin: kotak statistik & riwayat poin disembunyikan
  const kepsekProfil = isKepalaSekolah(currentUser);
  const rowStat = $("rowStatGuruProfil");
  const boxRiwayat = $("boxRiwayatGuruProfil");
  const boxRingkasan = $("boxRingkasanKepsek");
  if (rowStat) rowStat.classList.toggle("hidden", kepsekProfil);
  if (boxRiwayat) boxRiwayat.classList.toggle("hidden", kepsekProfil);
  if (boxRingkasan) boxRingkasan.classList.toggle("hidden", !kepsekProfil);
  if (kepsekProfil) {
    window.renderRingkasanKepsek();
    return;
  }

  renderRiwayatInputGuru(namaGuru);
};

// ==========================================
// RIWAYAT POIN YANG DIBERIKAN GURU (3 TAB)
// ==========================================
// CATATAN PENTING: loadMasterSiswaFromCloud() sengaja membuang field `riwayat`
// dari masterDataSiswa (supaya cache ringan), jadi riwayat TIDAK bisa dibaca
// dari memori. Karena itu riwayat guru diambil langsung dari dokumen siswa di
// Firestore, lalu disimpan sebentar di memori (riwayatGuruCache).
let riwayatGuruCache = null; // { t: waktuAmbil, nama: namaGuru, entries: [...] }
let riwayatGuruTabAktif = "TugasHarian";
const RIWAYAT_GURU_TTL_MS = 2 * 60 * 1000;

const RIWAYAT_GURU_META = {
  TugasHarian: {
    label: "Poin Harian",
    warna: "#f1c40f",
    kosong: "Belum ada poin harian yang kamu berikan semester ini.",
  },
  Prestasi: {
    label: "Prestasi",
    warna: "#2ecc71",
    kosong: "Belum ada prestasi yang kamu catat semester ini.",
  },
  Pelanggaran: {
    label: "Pelanggaran",
    warna: "#e74c3c",
    kosong: "Belum ada pelanggaran yang kamu catat semester ini.",
  },
};

// Catatan lama (sebelum ada field `k`) ditebak dari nilai poin & judulnya.
function kategoriRiwayat(r) {
  if (r.k && RIWAYAT_GURU_META[r.k]) return r.k;
  const p = Number(r.p) || 0;
  if (p < 0) return "Pelanggaran";
  if (dataPilihan.TugasHarian.some((i) => i.t === r.t)) return "TugasHarian";
  return "Prestasi";
}

async function ambilRiwayatGuru(namaGuru, emailGuru, paksa = false) {
  if (
    !paksa &&
    riwayatGuruCache &&
    riwayatGuruCache.nama === namaGuru &&
    Date.now() - riwayatGuruCache.t < RIWAYAT_GURU_TTL_MS
  ) {
    return riwayatGuruCache.entries;
  }

  const { collection, getDocs } = window.fbFirestore;
  const snap = await getDocs(collection(window.db, "siswa"));
  const entries = [];
  snap.forEach((d) => {
    const s = d.data();
    (s.riwayat || []).forEach((r) => {
      const milikGuruIni =
        (emailGuru && r.ge === emailGuru) || (r.g && r.g === namaGuru);
      if (!milikGuruIni) return;
      entries.push({
        ...r,
        _kat: kategoriRiwayat(r),
        _siswaNama: s.nama,
        _siswaKelas: s.kelasAktif || s.kelas,
      });
    });
  });

  // Format tanggal "YYYY-MM-DD HH:MM" zero-padded -> aman diurutkan sebagai teks
  entries.sort((a, b) => String(b.d || "").localeCompare(String(a.d || "")));
  riwayatGuruCache = { t: Date.now(), nama: namaGuru, entries };
  return entries;
}

async function renderRiwayatInputGuru(namaGuru) {
  const container = $("riwayatInputGuruList");
  if (!container) return;
  container.innerHTML = `<div class="guru-riwayat-kosong">Memuat riwayat...</div>`;

  try {
    await ambilRiwayatGuru(namaGuru, currentUser?.email || "");
  } catch (e) {
    console.warn("Gagal memuat riwayat guru:", e);
    container.innerHTML = `<div class="guru-riwayat-kosong">Gagal memuat riwayat. Periksa koneksi internet.</div>`;
    return;
  }
  tampilkanRiwayatGuruTab();
}

window.switchRiwayatGuruTab = function (kat) {
  if (!RIWAYAT_GURU_META[kat]) return;
  riwayatGuruTabAktif = kat;
  tampilkanRiwayatGuruTab();
};

function tampilkanRiwayatGuruTab() {
  const container = $("riwayatInputGuruList");
  if (!container || !riwayatGuruCache) return;
  const semua = riwayatGuruCache.entries;

  // Hitungan di kartu statistik + tombol tab
  const hitung = { TugasHarian: 0, Prestasi: 0, Pelanggaran: 0 };
  semua.forEach((r) => hitung[r._kat]++);
  const elH = $("cntGuruHarian");
  const elP = $("cntGuruPrestasi");
  const elV = $("cntGuruPelanggaran");
  if (elH) elH.textContent = hitung.TugasHarian;
  if (elP) elP.textContent = hitung.Prestasi;
  if (elV) elV.textContent = hitung.Pelanggaran;

  Object.keys(RIWAYAT_GURU_META).forEach((k) => {
    const btn = $("tabRiwayat" + k);
    if (btn) btn.classList.toggle("active", k === riwayatGuruTabAktif);
  });

  const meta = RIWAYAT_GURU_META[riwayatGuruTabAktif];
  const daftar = semua.filter((r) => r._kat === riwayatGuruTabAktif);
  if (daftar.length === 0) {
    container.innerHTML = `<div class="guru-riwayat-kosong">${meta.kosong}</div>`;
    return;
  }

  const tampil = daftar.slice(0, 50);
  let html = tampil
    .map((r) => {
      const p = Number(r.p) || 0;
      const teksPoin = p > 0 ? "+" + p : String(p);
      return `
      <div class="guru-riwayat-item" style="border-left-color: ${meta.warna};">
        <div class="guru-riwayat-item-top">
          <span style="color: ${meta.warna};">${escapeHtml(r.t)}</span>
          <span style="color: ${meta.warna}; flex-shrink: 0;">${teksPoin} Pts</span>
        </div>
        <div class="guru-riwayat-item-bottom">
          <span class="guru-riwayat-siswa">👤 ${escapeHtml(r._siswaNama || "-")} (${escapeHtml(r._siswaKelas || "-")})</span>
          <span style="flex-shrink: 0;">📅 ${escapeHtml(r.d || "-")}</span>
        </div>
      </div>`;
    })
    .join("");

  if (daftar.length > tampil.length) {
    html += `<div class="guru-riwayat-kosong">Menampilkan ${tampil.length} dari ${daftar.length} riwayat terbaru.</div>`;
  }
  container.innerHTML = html;
}

// --- Ganti foto profil guru (pakai cropper yang sama dengan siswa) ---
let sedangSimpanFotoGuru = false;

window.bukaModalGantiFotoGuru = function () {
  if (!currentUser) return;
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  $("imageToCropGuru").src = avatarForGuru(currentUser);
  $("inputFileFotoGuru").value = "";
  $("modalGantiFotoGuru").classList.remove("hidden");
};

window.tutupModalGantiFotoGuru = function () {
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  $("modalGantiFotoGuru").classList.add("hidden");
  $("inputFileFotoGuru").value = "";
};

window.handleFileSelectedForCropGuru = function (input) {
  const file = input.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    window.customAlert(
      "⚠️ Format file harus berupa gambar (JPG, PNG, atau WEBP)!",
    );
    input.value = "";
    return;
  }
  if (file.size > MAX_FOTO_BYTES) {
    window.customAlert("⚠️ Ukuran foto terlalu besar (maksimal 8 MB)!");
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = function (event) {
    const imageElement = $("imageToCropGuru");
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }
    imageElement.onload = () => {
      imageElement.onload = null;
      buatCropper(imageElement);
    };
    imageElement.src = event.target.result;
  };
  reader.onerror = () =>
    window.customAlert("⚠️ Gagal membaca berkas foto. Coba berkas lain.");
  reader.readAsDataURL(file);
};

window.simpanFotoProfilGuruBaru = async function () {
  if (!cropperInstance) {
    window.customAlert("⚠️ Silakan pilih berkas foto terlebih dahulu!");
    return;
  }
  if (sedangSimpanFotoGuru) return;
  if (!currentUser || !currentUser.email) {
    window.customAlert("⚠️ Sesi tidak valid, silakan login ulang.");
    return;
  }

  const canvas = cropperInstance.getCroppedCanvas({ width: 256, height: 256 });
  if (!canvas) {
    window.customAlert("⚠️ Gagal memproses foto. Coba pilih foto lain.");
    return;
  }

  let croppedDataUrl = canvas.toDataURL("image/webp", 0.8);
  if (!croppedDataUrl.startsWith("data:image/webp")) {
    croppedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
  }

  sedangSimpanFotoGuru = true;
  try {
    const { doc, updateDoc } = window.fbFirestore;
    await updateDoc(doc(window.db, "teachers", currentUser.email), {
      fotoUrl: croppedDataUrl,
    });

    currentUser.fotoUrl = croppedDataUrl;
    localStorage.setItem("loggedInUser", JSON.stringify(currentUser));

    const avatarMain = $("avatarGuruMain");
    if (avatarMain) avatarMain.src = croppedDataUrl;

    window.tutupModalGantiFotoGuru();
    window.customAlert("🎉 Berhasil! Foto profil kamu telah diperbarui.");
  } catch (error) {
    console.error("Gagal menyimpan foto guru:", error);
    window.customAlert(
      "❌ Terjadi kesalahan saat menyimpan foto ke server. Silakan coba lagi.",
    );
  } finally {
    sedangSimpanFotoGuru = false;
  }
};

// --- Ganti banner profil guru (pakai cropper yang sama, rasio lebar) ---
const BANNER_ASPECT_RATIO = 2.8;
let sedangSimpanBannerGuru = false;

window.bukaModalGantiBannerGuru = function () {
  if (!currentUser) return;
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  const img = $("imageToCropBanner");
  // Mulai dari banner yang sedang dipakai (kalau ada) supaya guru bisa
  // menyesuaikan ulang crop-nya; kalau belum ada, mulai dari kosong.
  img.src = currentUser.bannerUrl || "";
  $("inputFileFotoBanner").value = "";
  $("modalGantiBannerGuru").classList.remove("hidden");
};

window.tutupModalGantiBannerGuru = function () {
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  $("modalGantiBannerGuru").classList.add("hidden");
  $("inputFileFotoBanner").value = "";
};

window.handleFileSelectedForCropBanner = function (input) {
  const file = input.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    window.customAlert(
      "⚠️ Format file harus berupa gambar (JPG, PNG, atau WEBP)!",
    );
    input.value = "";
    return;
  }
  if (file.size > MAX_FOTO_BYTES) {
    window.customAlert("⚠️ Ukuran foto terlalu besar (maksimal 8 MB)!");
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = function (event) {
    const imageElement = $("imageToCropBanner");
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }
    imageElement.onload = () => {
      imageElement.onload = null;
      // Rasio lebar (±2.8:1) supaya pas memenuhi seluruh kartu profil tanpa
      // menutupi nama/jabatan — bagian yang dipilih guru lewat kotak crop
      // inilah yang akan ditampilkan penuh di belakang nama, jadi guru bisa
      // menggeser & zoom supaya bagian penting fotonya tidak pas di tengah
      // (karena nama & jabatan ditampilkan di atas, agak ke kiri).
      buatCropper(imageElement, BANNER_ASPECT_RATIO);
    };
    imageElement.src = event.target.result;
  };
  reader.onerror = () =>
    window.customAlert("⚠️ Gagal membaca berkas foto. Coba berkas lain.");
  reader.readAsDataURL(file);
};

window.simpanBannerProfilGuruBaru = async function () {
  if (!cropperInstance) {
    window.customAlert("⚠️ Silakan pilih berkas foto terlebih dahulu!");
    return;
  }
  if (sedangSimpanBannerGuru) return;
  if (!currentUser || !currentUser.email) {
    window.customAlert("⚠️ Sesi tidak valid, silakan login ulang.");
    return;
  }

  const canvas = cropperInstance.getCroppedCanvas({ width: 700, height: 250 });
  if (!canvas) {
    window.customAlert("⚠️ Gagal memproses foto. Coba pilih foto lain.");
    return;
  }

  let croppedDataUrl = canvas.toDataURL("image/webp", 0.8);
  if (!croppedDataUrl.startsWith("data:image/webp")) {
    croppedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
  }

  sedangSimpanBannerGuru = true;
  try {
    const { doc, updateDoc } = window.fbFirestore;
    await updateDoc(doc(window.db, "teachers", currentUser.email), {
      bannerUrl: croppedDataUrl,
    });

    currentUser.bannerUrl = croppedDataUrl;
    localStorage.setItem("loggedInUser", JSON.stringify(currentUser));

    const bannerMain = $("bannerGuruMain");
    if (bannerMain) {
      bannerMain.src = croppedDataUrl;
      bannerMain.style.display = "block";
    }

    window.tutupModalGantiBannerGuru();
    window.customAlert("🎉 Berhasil! Banner profil kamu telah diperbarui.");
  } catch (error) {
    console.error("Gagal menyimpan banner guru:", error);
    window.customAlert(
      "❌ Terjadi kesalahan saat menyimpan banner ke server. Silakan coba lagi.",
    );
  } finally {
    sedangSimpanBannerGuru = false;
  }
};

// ==========================================
// FORM INPUT POIN (GURU)
// ==========================================
function initFormEntry() {
  const now = new Date();
  const namaHari = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jum'at",
    "Sabtu",
  ];
  $("hari").value = namaHari[now.getDay()];
  $("tanggal").value = localDateStr(now);
  $("jam").value = localTimeStr(now);
  window.handleKategoriChange();
  window.updateEntrySiswaList();
}

window.handleKategoriChange = function () {
  const kat = $("kategori").value;
  const boxSub = $("boxSubKategori");
  const container = $("containerOpsi");
  const label = $("lblDetailOpsi");
  container.innerHTML = "";

  if (kat === "Pelanggaran") {
    boxSub.classList.remove("hidden");
    const subKategori = $("subKategori");
    subKategori.innerHTML =
      '<option value="">-- Pilih Tingkat --</option><option value="Ringan">Pelanggaran Ringan (5-10 Pts)</option>';
    if (currentRole !== "Guru Mapel") {
      subKategori.innerHTML +=
        '<option value="Sedang">Pelanggaran Sedang (25-40 Pts)</option><option value="Berat">Pelanggaran Berat (100-200 Pts)</option>';
    }
    label.innerText = "PILIH TINGKAT PELANGGARAN DI ATAS";
  } else {
    boxSub.classList.add("hidden");
    window.renderOpsiPoin();
  }
};

window.renderOpsiPoin = function () {
  const kat = $("kategori").value;
  const sub = $("subKategori") ? $("subKategori").value : "";
  const container = $("containerOpsi");
  const label = $("lblDetailOpsi");
  container.innerHTML = "";
  let listTampil = [];

  if (kat === "Prestasi") {
    label.innerText = "OPSI PRESTASI (+ HP / SHIELD) *";
    listTampil = dataPilihan.Prestasi;
  } else if (kat === "TugasHarian") {
    label.innerText = "OPSI POIN HARIAN / TUGAS KELAS (+XP) *";
    listTampil = dataPilihan.TugasHarian;
  } else {
    if (!sub) return;
    label.innerText = "DETAIL PELANGGARAN (- HP) *";
    listTampil = dataPilihan.Pelanggaran[sub] || [];
  }

  const prefix = kat === "Pelanggaran" ? "-" : "+";
  container.innerHTML = listTampil
    .map(
      (
        item,
      ) => `<label class="option-item"><input type="radio" name="opsiPoin" value="${escapeHtml(item.t)}" data-poin="${item.p}" required>
                <span>${escapeHtml(item.t)} <strong>(${prefix}${item.p} Pts)</strong></span></label>`,
    )
    .join("");
};

window.updateEntrySiswaList = function () {
  const kelas = $("kelas").value;
  const singleSelect = $("selectSingleSiswa");
  const multiBox = $("boxMultiSiswa");

  if (!kelas) {
    singleSelect.innerHTML = '<option value="">-- Pilih Kelas Dulu --</option>';
    multiBox.innerHTML =
      '<span style="font-size:11px; color:#888;">Pilih kelas dulu...</span>';
    return;
  }

  // Nilai opsi memakai NISN (bukan nama) agar siswa bernama sama tidak tertukar
  const daftar = masterDataSiswa
    .filter((s) => s.kelas === kelas)
    .sort((a, b) => String(a.nama).localeCompare(String(b.nama)));

  let singleHtml = '<option value="">-- Pilih Siswa --</option>';
  let multiHtml = "";
  daftar.forEach((s) => {
    singleHtml += `<option value="${escapeHtml(s.nisn)}">${escapeHtml(s.nama)}</option>`;
    multiHtml += `<label class="checkbox-item"><input type="checkbox" name="multiSiswa" value="${escapeHtml(s.nisn)}" data-nama="${escapeHtml(s.nama)}"> ${escapeHtml(s.nama)}</label>`;
  });

  if (daftar.length === 0) {
    multiHtml =
      '<span style="font-size:11px; color:#888;">Tidak ada siswa di kelas ini.</span>';
  }
  singleSelect.innerHTML = singleHtml;
  multiBox.innerHTML = multiHtml;
};

window.toggleModeSiswa = function () {
  isMultiMode = !isMultiMode;
  $("txtModeSiswa").innerText = isMultiMode
    ? "Mode: Banyak Siswa"
    : "Mode: Satu Siswa";
  $("selectSingleSiswa").classList.toggle("hidden", isMultiMode);
  // 'required' hanya aktif saat select terlihat
  $("selectSingleSiswa").required = !isMultiMode;
  $("boxMultiSiswa").classList.toggle("hidden", !isMultiMode);
};

// Mengembalikan [{nisn, nama}]
function getSelectedSiswa() {
  const hasil = [];
  if (isMultiMode) {
    document
      .querySelectorAll('input[name="multiSiswa"]:checked')
      .forEach((cb) => hasil.push({ nisn: cb.value, nama: cb.dataset.nama }));
  } else {
    const sel = $("selectSingleSiswa");
    if (sel.value) {
      hasil.push({ nisn: sel.value, nama: sel.selectedOptions[0].text });
    }
  }
  return hasil;
}

window.konfirmasiSimpan = function () {
  const selectedRadio = document.querySelector(
    'input[name="opsiPoin"]:checked',
  );
  if (!selectedRadio)
    return window.customAlert("Pilih detail jenis kejadian terlebih dahulu!");

  const daftar = getSelectedSiswa();
  if (daftar.length === 0)
    return window.customAlert(
      isMultiMode
        ? "Pilih minimal 1 siswa!"
        : "Pilih nama siswa terlebih dahulu!",
    );

  const kat = $("kategori").value;
  const poin = selectedRadio.getAttribute("data-poin");
  const efekText =
    kat === "TugasHarian"
      ? `+${poin} Poin Harian (Leaderboard)`
      : kat === "Prestasi"
        ? `+${poin} Prestasi`
        : `-${poin} Pelanggaran`;

  // Pratinjau efek nyata pada HP/Shield tiap siswa (perkiraan dari data terakhir dimuat)
  let pratinjauEfek = "";
  if (kat !== "TugasHarian") {
    const baris = [];
    daftar.slice(0, 8).forEach((sw) => {
      const m = masterDataSiswa.find((x) => x.nisn === sw.nisn);
      if (!m) return;
      const b = hitungDampak(m, kat, parseInt(poin, 10));
      const hp0 = m.hp !== undefined && m.hp !== null ? m.hp : 200;
      const sh0 = m.shield || 0;
      const bag = [];
      if (b.hp !== hp0) bag.push(`HP ${hp0}→${b.hp}`);
      if (b.shield !== sh0) bag.push(`Shield ${sh0}→${b.shield}`);
      if (!bag.length) bag.push(kat === "Prestasi" && sh0 >= SHIELD_MAKS ? "Shield sudah maksimal" : "HP & Shield tetap");
      baris.push(`• ${escapeHtml(sw.nama)}: ${bag.join(", ")}`);
    });
    if (baris.length) {
      if (daftar.length > 8) baris.push(`…dan ${daftar.length - 8} siswa lainnya`);
      pratinjauEfek = `<strong>Efek pada HP/Shield (perkiraan):</strong><br><span style="font-size:11px">${baris.join("<br>")}</span><br>`;
    }
  }

  $("modalDetailContent").innerHTML = `
  <strong>Target Siswa (${daftar.length}):</strong><br>${escapeHtml(daftar.map((s) => s.nama).join(", "))}<br><br>
  <strong>Aktivitas:</strong> ${escapeHtml(selectedRadio.value)}<br>
  <strong>Dampak:</strong> ${escapeHtml(efekText)}<br>
  ${pratinjauEfek}
  <strong>Guru Pelapor:</strong> ${escapeHtml($("txtNamaGuru").innerText)}
  `;
  $("modalKonfirmasi").classList.remove("hidden");
};

window.tutupModal = function () {
  $("modalKonfirmasi").classList.add("hidden");
};

// Shield dibatasi di batas atas tier tertinggi (bar penuh = 300).
const SHIELD_MAKS = 300;

// Perhitungan dampak poin (HP, shield, total) - fungsi murni
// Prestasi : isi HP dulu sampai 200, sisanya jadi shield (maks SHIELD_MAKS).
// Pelanggaran : kurangi shield dulu, sisanya baru mengenai HP (min 0).
function hitungDampak(d, kat, poin) {
  let hp = d.hp !== undefined ? d.hp : 200;
  let shield = d.shield || 0;
  let totalPrestasi = d.totalPrestasi || 0;
  let totalPelanggaran = d.totalPelanggaran || 0;
  let dailyScore = d.dailyScore || 0;

  if (kat === "TugasHarian") {
    dailyScore += poin;
  } else if (kat === "Prestasi") {
    totalPrestasi += poin;
    let sisa = poin;
    const kurang = 200 - hp;
    if (kurang > 0) {
      const isi = Math.min(sisa, kurang);
      hp += isi;
      sisa -= isi;
    }
    if (sisa > 0 && shield < SHIELD_MAKS)
      shield = Math.min(SHIELD_MAKS, shield + sisa);
  } else {
    totalPelanggaran += poin;
    let sisa = poin;
    if (shield > 0) {
      const serap = Math.min(sisa, shield);
      shield -= serap;
      sisa -= serap;
    }
    if (sisa > 0) hp = Math.max(0, hp - sisa);
  }
  return { hp, shield, totalPrestasi, totalPelanggaran, dailyScore };
}

function tambahRiwayat(listLama, entryBaru) {
  return [entryBaru, ...(listLama || [])].slice(0, MAX_RIWAYAT);
}

window.eksekusiSimpanWithLoading = async function () {
  window.tutupModal();
  const selectedRadio = document.querySelector(
    'input[name="opsiPoin"]:checked',
  );
  if (!selectedRadio) return;

  const desc = selectedRadio.value;
  const poin = parseInt(selectedRadio.getAttribute("data-poin"), 10);
  if (!Number.isFinite(poin) || poin <= 0)
    return window.customAlert("Nilai poin tidak valid!");

  const kat = $("kategori").value;
  const tempat = $("tempat").value || "Sekolah";
  const waktuGabung = `${$("tanggal").value} ${$("jam").value || "00:00"}`;
  const daftar = getSelectedSiswa();
  if (daftar.length === 0) return;

  const entry = {
    t: desc,
    p: kat === "Pelanggaran" ? -poin : poin,
    loc: tempat,
    d: waktuGabung,
    g: currentUser?.nama || "Guru", // nama guru yang menginput (untuk riwayat di profil guru)
    ge: currentUser?.email || "", // email guru (pencocokan lebih akurat daripada nama)
    k: kat, // kategori: TugasHarian | Prestasi | Pelanggaran (untuk tab riwayat guru)
  };

  showGamePreloader("SAVING TO CLOUD DB...", async (done) => {
    const { doc, runTransaction } = window.fbFirestore;
    let berhasil = 0;
    const gagal = [];

    for (const s of daftar) {
      try {
        // Transaksi: aman dari tabrakan jika dua guru menginput bersamaan
        await runTransaction(window.db, async (tx) => {
          const ref = doc(window.db, "siswa", s.nisn);
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error("Siswa tidak ditemukan");
          const data = snap.data();
          const baru = hitungDampak(data, kat, poin);
          // Catat HP/Shield sebelum & sesudah (hb/sb -> ha/sa): dasar tampilan
          // efek di riwayat dan pembatalan input yang salah.
          const entrySiswa = {
            ...entry,
            hb: data.hp !== undefined && data.hp !== null ? data.hp : 200,
            sb: data.shield || 0,
            ha: baru.hp,
            sa: baru.shield,
          };
          tx.update(ref, {
            ...baru,
            riwayat: tambahRiwayat(data.riwayat, entrySiswa),
          });
        });
        berhasil++;
      } catch (err) {
        console.error("Gagal menyimpan poin untuk", s.nama, err);
        gagal.push(s.nama);
      }
    }

    riwayatGuruCache = null; // paksa muat ulang riwayat di profil guru
    await refreshMasterSiswa();
    done();

    if (gagal.length === 0) {
      window.customAlert(
        "✅ Poin Berhasil Disimpan & Disinkronkan ke Leaderboard!",
      );
    } else {
      window.customAlert(
        `⚠️ ${berhasil} siswa berhasil, ${gagal.length} gagal:\n${gagal.join(", ")}`,
      );
    }
    $("formEntry").reset();
    initFormEntry();
  });
};

// ==========================================
// ADMIN: TAB, REKAP, KONTROL
// ==========================================
window.switchAdminTab = function (tabName) {
  ["Rekap", "Kontrol", "Akademik", "Cetak", "Chat", "Laporan", "Pratinjau"].forEach((n) => {
    const el = $("adminTab" + n);
    const btn = $("navBtn" + (n === "Chat" ? "ChatAdmin" : n));
    if (el) el.classList.add("hidden");
    if (btn) {
      btn.className = "btn-outline";
      btn.style.background = "transparent";
    }
  });

  const suffix =
    tabName === "chat"
      ? "Chat"
      : tabName.charAt(0).toUpperCase() + tabName.slice(1);
  const activeEl = $("adminTab" + suffix);
  const activeBtn = $("navBtn" + (tabName === "chat" ? "ChatAdmin" : suffix));

  if (activeEl) activeEl.classList.remove("hidden");
  if (activeBtn) {
    activeBtn.className = "";
    activeBtn.style.background = "#1e3c72";
    // nav satu baris yang bisa digeser: bawa tombol aktif ke tengah
    try { activeBtn.scrollIntoView({ inline: "center", block: "nearest" }); } catch (e) { /* abaikan */ }
  }

  // Hentikan pemantauan chat saat keluar dari tab chat
  if (tabName !== "chat") cleanupAdminListeners();

  // Keluar dari tab Pratinjau: latar kembali mengikuti jam
  if (tabName !== "pratinjau") pratinjauKembali();

  if (tabName === "rekap") window.renderTabelRekap();
  if (tabName === "kontrol") {
    window.handleAdminActionTypeChange();
    window.muatRiwayatAdmin();
  }
  if (tabName === "chat") window.loadAdminChatRooms();
  if (tabName === "akademik") {
    window.muatDaftarAlumni();
    window.muatPeriodeAktifAdmin();
    window.muatRiwayatTransisiUntukBatal();
  }
  if (tabName === "laporan") window.loadLaporanBugAdmin();
  if (tabName === "pratinjau") pratinjauMulai();
};

// ==========================================
// TAB PRATINJAU (Super Admin) — hanya mengubah tampilan lokal, tanpa Firestore
// ==========================================
const PRATINJAU_TIER = [
  { shield: 0, nama: "Novice" },
  { shield: 11, nama: "Iron" },
  { shield: 51, nama: "Bronze" },
  { shield: 91, nama: "Silver" },
  { shield: 131, nama: "Gold" },
  { shield: 171, nama: "Platinum" },
  { shield: 211, nama: "Diamond" },
  { shield: 251, nama: "Master" },
  { shield: 290, nama: "Mythic" },
];
let pvBarPrev = null;

function pratinjauTandaiMood(mood) {
  document.querySelectorAll("#adminTabPratinjau .pv-btn[data-mood]").forEach((b) => {
    b.classList.toggle("aktif", b.dataset.mood === mood);
  });
}
function pratinjauMood(mood) {
  if (mood === "auto") {
    pratinjauKembali();
    pratinjauTandaiMood("auto");
    return;
  }
  if (window.setAmbientMood) window.setAmbientMood(mood);
  pratinjauTandaiMood(mood);
}
function pratinjauKembali() {
  // cuaca pratinjau ikut dikembalikan ke cuaca asli
  if (window.setAmbientCuaca) window.setAmbientCuaca(null);
  pratinjauCuacaUI();
  // paksa terapkanLatarWaktu() menerapkan ulang mood sesuai jam
  if (!document.body.dataset.pvPakai) return;
  delete document.body.dataset.pvPakai;
  document.body.dataset.waktu = "";
  terapkanLatarWaktu();
}
window.pratinjauMood = function (mood) {
  if (mood !== "auto") document.body.dataset.pvPakai = "1";
  pratinjauMood(mood);
};

function pratinjauMulai() {
  const grid = $("pvTierGrid");
  if (grid && !grid.childElementCount) {
    const src = $("avatarSiswaMain") ? $("avatarSiswaMain").src : "assets/foto_siswa/avatar.webp";
    PRATINJAU_TIER.forEach((t) => {
      const info = getTierRank(t.shield);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pv-tier-item";
      b.innerHTML = `<div class="rpg-avatar-box ${info.frame}"><img src="${src}" alt="" /></div>
        <span class="pv-tier-nama">${info.title}</span>`;
      b.onclick = () => pratinjauTierBesar(t.shield);
      grid.appendChild(b);
    });
  }
  pratinjauTandaiMood(document.body.dataset.pvPakai ? document.body.dataset.waktu : "auto");
  pratinjauRinganUI();
  pratinjauCuacaUI();
  pratinjauBar(true);
}
const NAMA_CUACA = { cerah: "Cerah ☀️", mendung: "Mendung ☁️", hujan: "Hujan 🌧️" };
function pratinjauCuacaUI() {
  const i = window.ambientCuacaInfo ? window.ambientCuacaInfo() : null;
  if (!i) return;
  document.querySelectorAll("#adminTabPratinjau .pv-btn[data-cuaca]").forEach((b) => {
    b.classList.toggle("aktif", b.dataset.cuaca === (i.paksa || "auto"));
  });
  const el = $("pvCuacaInfo");
  if (!el) return;
  const jam = i.waktu
    ? new Date(i.waktu).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
    : null;
  el.textContent =
    `Cuaca sekolah sekarang: ${NAMA_CUACA[i.asli]}` +
    (jam ? ` (diperbarui ${jam})` : " (data belum tersedia, dianggap cerah)") +
    (i.paksa ? ` — pratinjau: ${NAMA_CUACA[i.paksa]}` : "") + ".";
}
window.pratinjauCuaca = function (c) {
  if (window.setAmbientCuaca) window.setAmbientCuaca(c === "auto" ? null : c);
  pratinjauCuacaUI();
};
window.addEventListener("ambientCuacaDiperbarui", () => pratinjauCuacaUI());
function pratinjauTierBesar(shield) {
  const box = $("pvTierBesar");
  const info = getTierRank(shield);
  const src = $("avatarSiswaMain") ? $("avatarSiswaMain").src : "assets/foto_siswa/avatar.webp";
  box.innerHTML = `<div class="rpg-avatar-box ${info.frame}"><img src="${src}" alt="" /></div>
    <span style="display:inline-block;background:${info.bg};color:${info.color};padding:3px 10px;border-radius:5px;font-size:11px;font-weight:700">${info.title}</span>`;
  box.classList.add("tampak");
}
window.pratinjauBar = function (awal) {
  const hp = Number($("pvHpGeser").value);
  const sh = Number($("pvShGeser").value);
  $("pvHpNilai").textContent = hp;
  $("pvShNilai").textContent = `${sh} (${getTierRank(sh).title})`;
  const hpPct = (hp / 200) * 100;
  const shPct = (sh / 300) * 100;
  const warna = hpPct >= 50 ? "#2ecc71" : hpPct >= 25 ? "#f39c12" : "#e74c3c";
  const hpFill = $("pvHpFill");
  const shFill = $("pvShFill");
  hpFill.style.backgroundColor = warna;
  hpFill.classList.toggle("low", hpPct < 25);
  hpFill.style.width = hpPct + "%";
  shFill.style.width = shPct + "%";
  $("pvHpTeks").textContent = `${hp}/200`;
  $("pvHpTeks").style.color = warna;
  $("pvShTeks").textContent = `${sh} Pts`;
  if (awal !== true && pvBarPrev) {
    if (hp < pvBarPrev.hp) kilatBar(hpFill.parentElement, "flash-damage");
    else if (hp > pvBarPrev.hp) kilatBar(hpFill.parentElement, "flash-heal");
    if (sh !== pvBarPrev.sh) kilatBar(shFill.parentElement, "flash-shield");
  }
  pvBarPrev = { hp, sh };
};
function pratinjauRinganUI() {
  const p = window.ambientRinganPilihan ? window.ambientRinganPilihan() : null;
  const kunci = p === "1" ? "1" : p === "0" ? "0" : "auto";
  document.querySelectorAll("#adminTabPratinjau .pv-btn[data-ringan]").forEach((b) => {
    b.classList.toggle("aktif", b.dataset.ringan === kunci);
  });
  const aktif = window.ambientRinganAktif && window.ambientRinganAktif();
  const info = $("pvRinganInfo");
  if (info)
    info.textContent = `Sekarang: ${aktif ? "Ringan 🍃" : "Penuh ✨"} (${kunci === "auto" ? "otomatis" : "dipaksa manual"}). Otomatis = HP lemah atau patah-patah beralih ke Ringan. Pilihan ini hanya tersimpan di browser ini.`;
}
window.pratinjauRingan = function (v) {
  if (window.setAmbientRingan) window.setAmbientRingan(v === "auto" ? null : v === "1");
  pratinjauRinganUI();
};
window.pratinjauPreset = function (hp, sh) {
  $("pvHpGeser").value = hp;
  $("pvShGeser").value = sh;
  window.pratinjauBar();
};
// Menjaga keadaan tetap sah menurut aturan nyata: Shield > 0 hanya bila HP = 200.
window.pratinjauGeser = function (sumber) {
  const hp = $("pvHpGeser");
  const sh = $("pvShGeser");
  if (sumber === "hp" && Number(hp.value) < 200) sh.value = 0;
  if (sumber === "sh" && Number(sh.value) > 0) hp.value = 200;
  window.pratinjauBar();
};
// Simulasi memakai hitungDampak() yang sama dengan input guru
window.pratinjauSimulasi = function (kat, poin) {
  kat = kat || $("pvSimKat").value;
  poin = parseInt(poin !== undefined ? poin : $("pvSimPoin").value, 10);
  if (!(poin > 0)) return;
  const hp0 = Number($("pvHpGeser").value);
  const sh0 = Number($("pvShGeser").value);
  const b = hitungDampak({ hp: hp0, shield: sh0, totalPrestasi: 0, totalPelanggaran: 0 }, kat, poin);
  $("pvHpGeser").value = b.hp;
  $("pvShGeser").value = b.shield;
  window.pratinjauBar();
  const bag = [];
  if (b.hp !== hp0) bag.push(`HP ${hp0} → ${b.hp}`);
  if (b.shield !== sh0) bag.push(`Shield ${sh0} → ${b.shield}`);
  let cat = "";
  if (kat === "Prestasi" && b.shield >= SHIELD_MAKS && sh0 + (poin - (200 - hp0)) > SHIELD_MAKS)
    cat = ` Shield mentok ${SHIELD_MAKS}, kelebihan hangus.`;
  $("pvSimHasil").textContent =
    `${kat === "Prestasi" ? "🏆 +" : "⚠️ −"}${poin}: ` + (bag.length ? bag.join(" • ") : "HP & Shield tidak berubah") + "." + cat;
};

let statistikChartInstance = null;

// ==========================================
// REKAP ADMIN: ringkasan, cari, urut, saring
// ==========================================
const HP_KRITIS_BATAS = 50; // HP di bawah 25% dari 200
const BK_BATAS_POIN = 40; // di atas ini masuk "Konseling BK" (lihat getStatusPembinaan)
let rekapFilter = "semua"; // semua | online | hpkritis | pembinaan | pinbawaan
let rekapOnlineIds = null; // Set NISN yang sedang online, null = belum dimuat
let rekapCariTimer = null;
let rekapOnlineT = 0;

function rekapHp(s) {
  return s.hp !== undefined ? s.hp : 200;
}
function rekapCocok(s, f) {
  if (f === "online") return !!(rekapOnlineIds && rekapOnlineIds.has(String(s.nisn)));
  if (f === "hpkritis") return rekapHp(s) < HP_KRITIS_BATAS;
  if (f === "pembinaan") return (s.totalPelanggaran || 0) > BK_BATAS_POIN;
  if (f === "pinbawaan") return !s.hasChangedPin;
  return true;
}

function rekapDaftarTersaring() {
  const kelas = $("filterKelasRekap").value;
  const cari = ($("rekapCari").value || "").trim().toLowerCase();
  const urut = $("urutRekap").value;
  let data = masterDataSiswa.filter((s) => {
    if (kelas !== "SEMUA" && s.kelas !== kelas) return false;
    if (!rekapCocok(s, rekapFilter)) return false;
    if (cari && !(String(s.nama).toLowerCase().includes(cari) || String(s.nisn).includes(cari)))
      return false;
    return true;
  });
  const nama = (a, b) => String(a.nama).localeCompare(String(b.nama));
  if (urut === "pelanggaran")
    data.sort((a, b) => (b.totalPelanggaran || 0) - (a.totalPelanggaran || 0) || nama(a, b));
  else if (urut === "hp") data.sort((a, b) => rekapHp(a) - rekapHp(b) || nama(a, b));
  else if (urut === "shield") data.sort((a, b) => (b.shield || 0) - (a.shield || 0) || nama(a, b));
  else data.sort(nama);
  return data;
}

function renderRingkasRekap() {
  const kelas = $("filterKelasRekap").value;
  const dasar = kelas === "SEMUA" ? masterDataSiswa : masterDataSiswa.filter((s) => s.kelas === kelas);
  $("rkTotal").textContent = dasar.length;
  $("rkOnline").textContent = rekapOnlineIds ? dasar.filter((s) => rekapCocok(s, "online")).length : "–";
  $("rkKritis").textContent = dasar.filter((s) => rekapCocok(s, "hpkritis")).length;
  $("rkBina").textContent = dasar.filter((s) => rekapCocok(s, "pembinaan")).length;
  $("rkPin").textContent = dasar.filter((s) => rekapCocok(s, "pinbawaan")).length;
  document.querySelectorAll("#rkRingkas .rk-kartu").forEach((k) => {
    k.classList.toggle("aktif", k.dataset.f === rekapFilter);
  });
}

function penjelasanGalatMuat(g) {
  const kode = g.code || "";
  if (/resource-exhausted|quota/i.test(kode + g.pesan))
    return "Kuota BACA Firestore hari ini habis (batas paket gratis 50.000 baca/hari). Pulih otomatis setelah reset harian (sekitar pukul 14.00 WIB), atau upgrade ke paket Blaze.";
  if (/permission-denied/i.test(kode + g.pesan))
    return "Aturan Firestore menolak pembacaan data siswa. Periksa firestore.rules yang terakhir dipublish.";
  if (/unavailable|network|offline|failed to fetch/i.test(kode + g.pesan))
    return "Tidak bisa terhubung ke Firestore. Periksa koneksi internet atau jaringan sekolah.";
  return `Gagal memuat data siswa (${kode || "galat tidak dikenal"}).`;
}

function renderGalatRekap() {
  const box = $("rekapGalat");
  if (!box) return;
  if (masterLoadError) {
    box.classList.remove("hidden");
    box.innerHTML = `<b>⚠️ Data siswa tidak berhasil dimuat</b><br>${escapeHtml(penjelasanGalatMuat(masterLoadError))}
      <button type="button" class="pv-btn" style="margin-top:8px;width:100%" onclick="rekapCobaLagi()">🔄 Coba lagi</button>`;
  } else if (!masterDataSiswa.length) {
    box.classList.remove("hidden");
    box.innerHTML = `<b>Belum ada data siswa.</b> Koleksi <code>siswa</code> kosong.
      <button type="button" class="pv-btn" style="margin-top:8px;width:100%" onclick="rekapCobaLagi()">🔄 Muat ulang</button>`;
  } else {
    box.classList.add("hidden");
  }
}

window.rekapCobaLagi = async function () {
  const box = $("rekapGalat");
  if (box) box.innerHTML = "Memuat ulang...";
  await refreshMasterSiswa();
  window.renderTabelRekap();
};

window.saringRekap = function () {
  renderGalatRekap();
  renderRingkasRekap();
  const data = rekapDaftarTersaring();
  const tbody = $("tabelRekapBody");
  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="rk-kosong">Tidak ada siswa yang cocok.</td></tr>`;
  } else {
    tbody.innerHTML = data
      .map((s) => {
        const hp = rekapHp(s);
        const warnaHp = hp < HP_KRITIS_BATAS ? "#e74c3c" : "#2ecc71";
        let badge = `<span style="color:${warnaHp}; font-weight:bold">${hp} HP</span>`;
        if (s.shield > 0)
          badge += ` <span style="color:#3498db; font-size:9px">+${s.shield} Shld</span>`;
        const hukum = getStatusPembinaan(s.totalPelanggaran || 0);
        const tanda =
          (rekapCocok(s, "online") ? '<span class="rk-tanda" title="Online">🟢</span>' : "") +
          (!s.hasChangedPin ? '<span class="rk-tanda" title="PIN masih bawaan">🔑</span>' : "");
        return `<tr>
      <td><strong>${escapeHtml(s.nama)}</strong>${tanda}<span class="rk-nisn">${escapeHtml(s.nisn)}</span></td>
      <td>${escapeHtml(s.kelas)}</td>
      <td>${badge}</td>
      <td>
        <span style="font-size: 9px; padding: 3px 6px; background: ${hukum.color}; color: #fff; border-radius: 4px; font-weight: bold;">${s.totalPelanggaran || 0} Pts</span>
      </td>
      </tr>`;
      })
      .join("");
  }
  const kelas = $("filterKelasRekap").value;
  const total = kelas === "SEMUA" ? masterDataSiswa.length : masterDataSiswa.filter((s) => s.kelas === kelas).length;
  $("rekapJumlah").textContent = `Menampilkan ${data.length} dari ${total} siswa`;
};

window.rekapCariTunda = function () {
  clearTimeout(rekapCariTimer);
  rekapCariTimer = setTimeout(window.saringRekap, 150);
};

window.rekapFilterKartu = function (f) {
  if (f === "online" && !rekapOnlineIds) return muatOnlineRekap(true);
  rekapFilter = rekapFilter === f ? "semua" : f;
  window.saringRekap();
};

window.rekapSalin = async function () {
  const data = rekapDaftarTersaring();
  if (!data.length) return window.customAlert("Tidak ada data untuk disalin.");
  const labelFilter = { semua: "Semua", online: "Sedang online", hpkritis: "HP kritis", pembinaan: "Perlu konseling BK", pinbawaan: "PIN masih bawaan" }[rekapFilter];
  const baris = data.map(
    (s, i) => `${i + 1}. ${s.nama} (${s.kelas}) — ${s.totalPelanggaran || 0} Pts, HP ${rekapHp(s)}`,
  );
  const teks = `Daftar siswa — ${labelFilter} • ${$("filterKelasRekap").value === "SEMUA" ? "Semua kelas" : $("filterKelasRekap").value}\n${baris.join("\n")}`;
  try {
    await navigator.clipboard.writeText(teks);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = teks;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e2) { /* abaikan */ }
    ta.remove();
  }
  window.customAlert(`${data.length} siswa disalin ke papan klip. Tinggal tempel di WhatsApp/dokumen.`);
};

async function muatOnlineRekap(setelahnyaFilter) {
  // satu kali ambil (bukan listener) supaya hemat baca Firestore
  if (rekapOnlineIds && Date.now() - rekapOnlineT < 60000 && !setelahnyaFilter) return;
  try {
    const { collection, query, where, getDocs } = window.fbFirestore;
    const snap = await getDocs(
      query(collection(window.db, "status"), where("lastActive", ">", Date.now() - ONLINE_THRESHOLD_MS)),
    );
    const ids = new Set();
    snap.forEach((d) => {
      const v = d.data();
      if (v.state === undefined || v.state === "online") ids.add(String(d.id));
    });
    rekapOnlineIds = ids;
    rekapOnlineT = Date.now();
    if (setelahnyaFilter) rekapFilter = "online";
    if ($("adminTabRekap") && !$("adminTabRekap").classList.contains("hidden")) window.saringRekap();
  } catch (err) {
    console.warn("Gagal memuat siswa online untuk rekap:", err);
  }
}

// ---- Pustaka luar dimuat saat dibutuhkan (v4.8.1): tidak memblokir halaman awal siswa ----
const URL_CHARTJS = "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js";
const URL_CROPPER_JS = "https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.js";
const URL_CROPPER_CSS = "https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.5.13/cropper.min.css";
const pustakaLuar = {};
function muatSkripLuar(url) {
  if (!pustakaLuar[url]) {
    pustakaLuar[url] = new Promise((ok, gagal) => {
      const el = document.createElement("script");
      el.src = url;
      el.onload = () => ok();
      el.onerror = () => {
        delete pustakaLuar[url]; // boleh dicoba lagi
        gagal(new Error("Gagal memuat " + url));
      };
      document.head.appendChild(el);
    });
  }
  return pustakaLuar[url];
}
function muatCssLuar(url) {
  if (document.querySelector(`link[href="${url}"]`)) return;
  const el = document.createElement("link");
  el.rel = "stylesheet";
  el.href = url;
  document.head.appendChild(el);
}
function muatCropperLuar() {
  if (typeof Cropper !== "undefined") return Promise.resolve();
  muatCssLuar(URL_CROPPER_CSS);
  return muatSkripLuar(URL_CROPPER_JS);
}

window.renderTabelRekap = function () {
  window.saringRekap();
  muatOnlineRekap();
  gambarGrafikRekap();
};

function gambarGrafikRekap() {
  const catatanGrafik = $("rekapGrafikCatatan");
  if (typeof Chart === "undefined") {
    muatSkripLuar(URL_CHARTJS)
      .then(() => {
        if (typeof Chart !== "undefined") gambarGrafikRekap();
      })
      .catch((e) => {
        console.warn("Chart.js gagal dimuat, grafik dilewati.", e);
        if (catatanGrafik) {
          catatanGrafik.textContent = "Grafik tidak termuat (pustaka Chart.js dari jsDelivr gagal diunduh). Data tabel tetap berfungsi.";
          catatanGrafik.classList.remove("hidden");
        }
      });
    return;
  }
  if (catatanGrafik) catatanGrafik.classList.add("hidden");
  if (!$("statistikChart")) return;

  const ctx = $("statistikChart").getContext("2d");
  const labels = ["10 SMK", "11 SMK", "12 SMK"];
  const pelanggaranPerKelas = [0, 0, 0];
  const prestasiPerKelas = [0, 0, 0];

  masterDataSiswa.forEach((s) => {
    const idx = labels.indexOf(s.kelas);
    if (idx !== -1) {
      pelanggaranPerKelas[idx] += s.totalPelanggaran || 0;
      prestasiPerKelas[idx] += s.totalPrestasi || 0;
    }
  });

  if (statistikChartInstance) statistikChartInstance.destroy();

  statistikChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Total Pelanggaran", data: pelanggaranPerKelas, backgroundColor: "#e74c3c", borderRadius: 6 },
        { label: "Total Prestasi", data: prestasiPerKelas, backgroundColor: "#2ecc71", borderRadius: 6 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "top", labels: { font: { size: 10 } } } },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 10 } } },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  });
}

window.handleAdminActionTypeChange = function () {
  const act = $("adminActionType").value;
  const boxKelas = $("boxAdminKelas");
  const boxSiswa = $("boxAdminSiswa");

  if (act.includes("GLOBAL")) {
    boxKelas.classList.add("hidden");
    boxSiswa.classList.add("hidden");
  } else if (act.includes("CLASS")) {
    boxKelas.classList.remove("hidden");
    boxSiswa.classList.add("hidden");
  } else if (act.includes("INDIVIDUAL") || act === "RESET_PIN_SISWA") {
    boxKelas.classList.remove("hidden");
    boxSiswa.classList.remove("hidden");
  }
};

window.handleAdminKelasChange = function () {
  const kelas = $("adminKelasSelect").value;
  const sel = $("adminSiswaSelect");
  if (!kelas) {
    sel.innerHTML = '<option value="">-- Pilih Siswa --</option>';
    return;
  }
  let siswaHtml = '<option value="">-- Pilih Siswa --</option>';
  masterDataSiswa
    .filter((s) => s.kelas === kelas)
    .sort((a, b) => String(a.nama).localeCompare(String(b.nama)))
    .forEach((s) => {
      siswaHtml += `<option value="${escapeHtml(s.nisn)}">${escapeHtml(s.nama)} (${s.dailyScore || 0} Pts Tugas)</option>`;
    });
  sel.innerHTML = siswaHtml;
};

// Update banyak siswa sekaligus dengan batch (jauh lebih cepat & atomik per chunk).
// buildUpdate(dataSiswa, refSiswa) boleh async dan boleh mengembalikan field khusus:
//   _arsipSet:   { id, data }  -> tulis siswa/{nisn}/arsip/{id}
//   _arsipHapus: id            -> hapus siswa/{nisn}/arsip/{id}
// Keduanya ikut batch yang sama dengan update dokumen siswa (atomik).
async function batchUpdateSiswa(targetList, buildUpdate) {
  const { doc, getDoc, writeBatch } = window.fbFirestore;
  const valid = targetList.filter((s) => s.nisn);
  // Satu siswa bisa = 2 operasi tulis (update + arsip), batas batch 500 operasi
  const CHUNK = Math.floor(BATCH_CHUNK / 2);
  for (let i = 0; i < valid.length; i += CHUNK) {
    const chunk = valid.slice(i, i + CHUNK);
    const snaps = await Promise.all(
      chunk.map((s) => getDoc(doc(window.db, "siswa", s.nisn))),
    );
    const batch = writeBatch(window.db);
    for (const snap of snaps) {
      if (!snap.exists()) continue;
      const hasil = await buildUpdate(snap.data(), snap.ref);
      // buildUpdate boleh mengembalikan null/undefined/{} untuk melewati
      // siswa ini (misalnya karena sudah tidak memenuhi syarat lagi)
      if (!hasil || Object.keys(hasil).length === 0) continue;
      const { _arsipSet, _arsipHapus, ...upd } = hasil;
      if (Object.keys(upd).length > 0) batch.update(snap.ref, upd);
      if (_arsipSet) {
        batch.set(doc(snap.ref, "arsip", _arsipSet.id), _arsipSet.data);
      }
      if (_arsipHapus) {
        batch.delete(doc(snap.ref, "arsip", _arsipHapus));
      }
    }
    await batch.commit();
  }
}

// Ambil semua arsip semester/kelas milik satu siswa (subkoleksi siswa/{nisn}/arsip)
async function ambilArsipSiswa(nisn) {
  const { collection, getDocs } = window.fbFirestore;
  const snap = await getDocs(collection(window.db, "siswa", nisn, "arsip"));
  const hasil = [];
  snap.forEach((d) => hasil.push({ id: d.id, ...d.data() }));
  return hasil;
}

// ==========================================
// TAMBAH SISWA BARU (intake kelas 10 / siswa pindahan)
// ==========================================
function parseBarisSiswaBaru(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[,\t;]+/).map((p) => p.trim());
      return {
        nisn: parts[0] || "",
        nama: parts[1] || "",
        kelasOverride: parts[2] || "",
      };
    });
}

window.jalankanTambahSiswaBaruUI = async function () {
  const kelasDefault = $("kelasSiswaBaruSelect").value;
  const teksInput = $("teksSiswaBaru").value;

  if (!kelasDefault)
    return window.customAlert("Pilih kelas tujuan untuk siswa baru.");

  const baris = parseBarisSiswaBaru(teksInput);
  if (baris.length === 0)
    return window.customAlert(
      "Tempel daftar siswa dulu, satu siswa per baris. Format: NISN,Nama",
    );

  const existingNisn = new Set(masterDataSiswa.map((s) => s.nisn));
  const valid = [];
  const errors = [];

  baris.forEach((b, i) => {
    if (!validNisnFormat(b.nisn)) {
      errors.push(`Baris ${i + 1}: NISN "${b.nisn}" tidak valid.`);
    } else if (!b.nama) {
      errors.push(`Baris ${i + 1}: Nama kosong (NISN ${b.nisn}).`);
    } else if (existingNisn.has(b.nisn)) {
      errors.push(`Baris ${i + 1}: NISN ${b.nisn} sudah terdaftar, dilewati.`);
    } else {
      existingNisn.add(b.nisn); // cegah duplikat di dalam daftar yang sama
      valid.push({
        nisn: b.nisn,
        nama: b.nama,
        kelas: b.kelasOverride || kelasDefault,
      });
    }
  });

  if (valid.length === 0) {
    return window.customAlert(
      "Tidak ada siswa valid untuk ditambahkan.\n\n" + errors.join("\n"),
    );
  }

  const ok = await window.customConfirm(
    `Menambahkan ${valid.length} siswa baru (PIN awal: 123456).` +
      (errors.length
        ? ` ${errors.length} baris dilewati karena error/duplikat.`
        : "") +
      " Lanjutkan?",
    "➕ TAMBAH SISWA BARU",
  );
  if (!ok) return;

  showGamePreloader("MENAMBAHKAN SISWA BARU...", async (done) => {
    try {
      const { doc, writeBatch } = window.fbFirestore;
      for (let i = 0; i < valid.length; i += BATCH_CHUNK) {
        const chunk = valid.slice(i, i + BATCH_CHUNK);
        const batch = writeBatch(window.db);
        chunk.forEach((s) => {
          batch.set(doc(window.db, "siswa", s.nisn), {
            nama: s.nama,
            nisn: s.nisn,
            kelas: s.kelas,
            kelasAktif: s.kelas,
            statusAkun: "aktif",
            pin: "123456",
            hasChangedPin: false,
            hp: 200,
            shield: 0,
            totalPrestasi: 0,
            totalPelanggaran: 0,
            dailyScore: 0,
            riwayat: [],
            friends: [],
            requests: [],
          });
        });
        await batch.commit();
      }

      await catatLogAkademik("TAMBAH_SISWA_BARU", {
        kelas: kelasDefault,
        jumlah: valid.length,
      });
      await refreshMasterSiswa();
      done();
      window.customAlert(
        `✅ ${valid.length} siswa baru berhasil ditambahkan.` +
          (errors.length
            ? `\n\n⚠️ ${errors.length} baris dilewati:\n` + errors.join("\n")
            : ""),
      );
      $("teksSiswaBaru").value = "";
    } catch (err) {
      done();
      console.error("Gagal menambahkan siswa baru:", err);
      window.customAlert(
        "Gagal menambahkan siswa baru. Periksa koneksi internet.",
      );
    }
  });
};

// ==========================================
// MANAJEMEN ARSIP SEMESTER, KENAIKAN KELAS & ALUMNI
// ==========================================
const NEXT_KELAS_MAP = { "10 SMK": "11 SMK", "11 SMK": "12 SMK" };

function buildArsipEntry(d, label) {
  return {
    label,
    kelas: d.kelas || d.kelasAktif || "-",
    totalPrestasi: d.totalPrestasi || 0,
    totalPelanggaran: d.totalPelanggaran || 0,
    dailyScore: d.dailyScore || 0,
    hp: d.hp !== undefined ? d.hp : 200,
    shield: d.shield || 0,
    riwayat: d.riwayat || [],
    diarsipkanPada: Date.now(),
  };
}

// ID arsip TERBARU milik seorang siswa (dipakai untuk memastikan undo hanya
// menimpa periode yang paling akhir). Isi arsip ada di subkoleksi
// siswa/{nisn}/arsip; di dokumen siswa hanya disimpan daftar id-nya
// (arsipPeriodeIds, urut dari lama ke baru) supaya dokumen tetap kecil.
function periodeIdTerbaru(d) {
  const ids = d.arsipPeriodeIds || [];
  return ids.length ? ids[ids.length - 1] : null;
}

async function catatLogAkademik(aksi, detail) {
  try {
    const { collection, addDoc } = window.fbFirestore;
    await addDoc(collection(window.db, "admin_logs"), {
      aksi,
      ...detail,
      oleh: currentUser?.nama || "-",
      waktu: Date.now(),
      waktuStr: localDateTimeStr(),
    });
  } catch (e) {
    console.warn("Audit log akademik gagal:", e);
  }
}

// Dicatat setiap kali Ganti Semester / Kenaikan Kelas dijalankan, dipakai
// sebagai titik awal hitungan "Jumlah Tugas Diposting" di profil guru supaya
// statistik itu ikut ter-reset setiap periode baru (sama seperti poin siswa).
async function catatMulaiPeriodeBaru(label) {
  try {
    const { doc, setDoc } = window.fbFirestore;
    await setDoc(doc(window.db, "app_meta", "riwayatSemester"), {
      mulaiTs: Date.now(),
      label,
    });
  } catch (e) {
    console.warn(
      "Gagal mencatat waktu mulai periode baru (statistik tugas guru mungkin tidak ikut reset):",
      e,
    );
  }
}

// 1) Ganti Semester Baru: arsipkan riwayat berjalan, reset HP/Shield/Poin harian,
//    kelas TIDAK berubah.
async function jalankanGantiSemester(label, catatan) {
  const periodeId = `p${Date.now()}`;
  const ts = localDateTimeStr();
  const targets = masterDataSiswa.filter((s) => s.statusAkun !== "lulus");

  await batchUpdateSiswa(targets, (d) => ({
    _arsipSet: { id: periodeId, data: buildArsipEntry(d, label) },
    arsipPeriodeIds: [...(d.arsipPeriodeIds || []), periodeId],
    riwayat: [
      {
        t: `AWAL SEMESTER: ${label}${catatan ? " — " + catatan : ""}`,
        p: 0,
        loc: "Sistem",
        d: ts,
      },
    ],
    totalPrestasi: 0,
    totalPelanggaran: 0,
    dailyScore: 0,
    hp: 200,
    shield: 0,
    kelasAktif: d.kelasAktif || d.kelas || "-",
  }));

  await catatLogAkademik("GANTI_SEMESTER", {
    label,
    catatan,
    periodeId,
    jumlahSiswa: targets.length,
  });
  await catatMulaiPeriodeBaru(label);
  return { periodeId, jumlah: targets.length };
}

// 2) Kenaikan Kelas Massal: arsipkan riwayat, naikkan tingkat kelas,
//    reset poin aktif. Siswa kelas 12 dilewati (pakai Proses Kelulusan).
async function jalankanKenaikanKelas(label, catatan) {
  const periodeId = `p${Date.now()}`;
  const ts = localDateTimeStr();
  const semuaAktif = masterDataSiswa.filter((s) => s.statusAkun !== "lulus");
  const eligible = semuaAktif.filter((s) => NEXT_KELAS_MAP[s.kelas]);
  const skip = semuaAktif.length - eligible.length;

  await batchUpdateSiswa(eligible, (d) => {
    const kelasBaru = NEXT_KELAS_MAP[d.kelas];
    return {
      _arsipSet: { id: periodeId, data: buildArsipEntry(d, label) },
      arsipPeriodeIds: [...(d.arsipPeriodeIds || []), periodeId],
      riwayat: [
        {
          t: `KENAIKAN KELAS ke ${kelasBaru}${catatan ? " — " + catatan : ""}`,
          p: 0,
          loc: "Sistem",
          d: ts,
        },
      ],
      totalPrestasi: 0,
      totalPelanggaran: 0,
      dailyScore: 0,
      hp: 200,
      shield: 0,
      kelas: kelasBaru,
      kelasAktif: kelasBaru,
    };
  });

  await catatLogAkademik("KENAIKAN_KELAS", {
    label,
    catatan,
    periodeId,
    jumlahNaik: eligible.length,
    jumlahDilewati: skip,
  });
  await catatMulaiPeriodeBaru(label);
  return { periodeId, naik: eligible.length, skip };
}

// 3) Proses Kelulusan Kelas 12: tandai alumni. Data & riwayat kelas 12
//    yang berjalan TIDAK dihapus/diarsipkan ulang (jadi transkrip tahun
//    terakhir tetap utuh di field riwayat).
async function jalankanKelulusan(catatan) {
  const ts = localDateTimeStr();
  const targets = masterDataSiswa.filter(
    (s) => s.kelas === "12 SMK" && s.statusAkun !== "lulus",
  );

  await batchUpdateSiswa(targets, (d) => ({
    statusAkun: "lulus",
    riwayat: tambahRiwayat(d.riwayat, {
      t: `KELULUSAN${catatan ? ": " + catatan : ""}`,
      p: 0,
      loc: "Sistem",
      d: ts,
    }),
  }));

  await catatLogAkademik("KELULUSAN", { catatan, jumlahSiswa: targets.length });
  return targets.length;
}

// ---- Tahun Ajaran / Semester aktif (label informasi, tidak memengaruhi poin) ----
async function loadPeriodeAktifLabel() {
  const el = $("txtPeriodeAktif");
  if (!el) return;
  try {
    const { doc, getDoc } = window.fbFirestore;
    const snap = await getDoc(doc(window.db, "app_meta", "akademik"));
    if (snap.exists()) {
      const d = snap.data();
      const parts = [];
      if (d.tahunAjaran) parts.push(`Tahun Ajaran ${d.tahunAjaran}`);
      if (d.semester) parts.push(`Semester ${d.semester}`);
      el.textContent = parts.length
        ? "📅 " + parts.join(" • ")
        : "📅 Periode belum diatur admin";
    } else {
      el.textContent = "📅 Periode belum diatur admin";
    }
  } catch (e) {
    console.warn("Gagal memuat info tahun ajaran:", e);
    el.textContent = "";
  }
}

window.simpanPeriodeAktifUI = async function () {
  const tahunAjaran = $("inputTahunAjaran").value.trim();
  const semester = $("inputSemesterAktif").value;
  if (!tahunAjaran)
    return window.customAlert("Isi tahun ajaran, contoh: 2025/2026");

  showGamePreloader("MENYIMPAN KETERANGAN...", async (done) => {
    try {
      const { doc, setDoc } = window.fbFirestore;
      await setDoc(doc(window.db, "app_meta", "akademik"), {
        tahunAjaran,
        semester,
        updatedAt: Date.now(),
        updatedBy: currentUser?.nama || "-",
      });
      done();
      window.customAlert(
        "✅ Keterangan tahun ajaran tersimpan dan langsung tampil di Profil siswa.",
      );
    } catch (err) {
      done();
      console.error("Gagal simpan periode aktif:", err);
      window.customAlert("Gagal menyimpan. Periksa koneksi internet.");
    }
  });
};

window.muatPeriodeAktifAdmin = async function () {
  try {
    const { doc, getDoc } = window.fbFirestore;
    const snap = await getDoc(doc(window.db, "app_meta", "akademik"));
    if (snap.exists()) {
      const d = snap.data();
      if ($("inputTahunAjaran"))
        $("inputTahunAjaran").value = d.tahunAjaran || "";
      if ($("inputSemesterAktif") && d.semester)
        $("inputSemesterAktif").value = d.semester;
    }
  } catch (e) {
    console.warn("Gagal muat periode aktif admin:", e);
  }
};

// ---- Batalkan Kelulusan (uji coba / koreksi salah luluskan) ----
// Mendukung pilih satu, beberapa, atau semua alumni sekaligus.
window.muatDaftarAlumni = function () {
  const container = $("batalKelulusanList");
  if (!container) return;
  const alumni = masterDataSiswa.filter((s) => s.statusAkun === "lulus");
  const chkSemua = $("chkPilihSemuaAlumni");
  if (chkSemua) chkSemua.checked = false;

  if (alumni.length === 0) {
    container.innerHTML =
      '<div class="empty-note">Belum ada siswa berstatus Lulus.</div>';
    return;
  }

  container.innerHTML = alumni
    .map(
      (s) => `
    <label class="friend-row" style="cursor: pointer;">
      <input
        type="checkbox"
        class="batal-kelulusan-chk"
        value="${escapeHtml(s.nisn)}"
        style="width: auto; margin-right: 10px;"
      />
      <div class="row-main">
        <div class="row-name">${escapeHtml(s.nama)}</div>
        <div class="row-sub">Kelas: ${escapeHtml(s.kelas)} • NISN ${escapeHtml(s.nisn)}</div>
      </div>
    </label>`,
    )
    .join("");
};

window.toggleSemuaBatalKelulusan = function (checked) {
  document
    .querySelectorAll(".batal-kelulusan-chk")
    .forEach((el) => (el.checked = checked));
};

window.jalankanBatalKelulusanUI = async function () {
  const checked = Array.from(
    document.querySelectorAll(".batal-kelulusan-chk:checked"),
  ).map((el) => el.value);
  const catatan = $("catatanBatalKelulusan").value.trim();

  if (checked.length === 0)
    return window.customAlert(
      "Centang minimal satu siswa alumni yang mau dikembalikan statusnya (atau centang Pilih Semua).",
    );
  if (!catatan) return window.customAlert("Catatan/alasan wajib diisi.");

  const ok = await window.customConfirm(
    `Mengembalikan ${checked.length} siswa dari Alumni menjadi siswa Aktif. PIN lama dan data poin terakhir mereka tetap berlaku. TIDAK DAPAT DIBATALKAN. Lanjutkan?`,
    "↩️ BATALKAN KELULUSAN",
  );
  if (!ok) return;

  showGamePreloader("MENGEMBALIKAN STATUS...", async (done) => {
    try {
      const ts = localDateTimeStr();
      const targets = checked.map((nisn) => ({ nisn }));
      await batchUpdateSiswa(targets, (d) => ({
        statusAkun: "aktif",
        riwayat: tambahRiwayat(d.riwayat, {
          t: `STATUS DIKEMBALIKAN KE AKTIF (batal lulus): ${catatan}`,
          p: 0,
          loc: "Sistem",
          d: ts,
        }),
      }));
      await catatLogAkademik("BATAL_KELULUSAN", {
        nisn: checked.join(","),
        jumlah: checked.length,
        catatan,
      });
      await refreshMasterSiswa();
      window.muatDaftarAlumni();
      done();
      window.customAlert(
        `✅ ${checked.length} siswa dikembalikan menjadi Aktif.`,
      );
      $("catatanBatalKelulusan").value = "";
    } catch (err) {
      done();
      console.error("Gagal batalkan kelulusan:", err);
      window.customAlert(
        "Gagal mengembalikan status. Periksa koneksi internet.",
      );
    }
  });
};

window.jalankanGantiSemesterUI = async function () {
  const label = $("labelGantiSemester").value.trim();
  const catatan = $("catatanGantiSemester").value.trim();
  if (!label)
    return window.customAlert(
      "Isi nama semester yang sedang berjalan (akan jadi label arsip).",
    );
  if (!catatan) return window.customAlert("Catatan/alasan wajib diisi.");

  const ok = await window.customConfirm(
    `Mengarsipkan riwayat berjalan SEMUA siswa aktif sebagai "${label}", lalu mereset HP, Shield, dan Poin Harian. Tingkat kelas TIDAK berubah. TIDAK DAPAT DIBATALKAN. Lanjutkan?`,
    "⚠️ GANTI SEMESTER BARU",
  );
  if (!ok) return;

  showGamePreloader("MENGARSIPKAN SEMESTER...", async (done) => {
    try {
      const hasil = await jalankanGantiSemester(label, catatan);
      await refreshMasterSiswa();
      window.muatRiwayatTransisiUntukBatal();
      done();
      window.customAlert(
        `✅ Semester "${label}" diarsipkan untuk ${hasil.jumlah} siswa aktif.`,
      );
      $("labelGantiSemester").value = "";
      $("catatanGantiSemester").value = "";
    } catch (err) {
      done();
      console.error("Gagal ganti semester:", err);
      window.customAlert(
        "Gagal menjalankan Ganti Semester. Periksa koneksi internet.",
      );
    }
  });
};

window.jalankanKenaikanKelasUI = async function () {
  const label = $("labelKenaikanKelas").value.trim();
  const catatan = $("catatanKenaikanKelas").value.trim();
  if (!label)
    return window.customAlert(
      "Isi nama semester/tahun ajaran yang diarsipkan.",
    );
  if (!catatan) return window.customAlert("Catatan/alasan wajib diisi.");

  const ok = await window.customConfirm(
    `Menaikkan tingkat kelas SEMUA siswa aktif (10→11, 11→12), mengarsipkan riwayat sebagai "${label}", dan mereset poin aktif. Siswa kelas 12 akan DILEWATI (gunakan Proses Kelulusan). TIDAK DAPAT DIBATALKAN. Lanjutkan?`,
    "⚠️ KENAIKAN KELAS MASSAL",
  );
  if (!ok) return;

  showGamePreloader("MEMPROSES KENAIKAN KELAS...", async (done) => {
    try {
      const hasil = await jalankanKenaikanKelas(label, catatan);
      await refreshMasterSiswa();
      window.muatRiwayatTransisiUntukBatal();
      done();
      window.customAlert(
        `✅ ${hasil.naik} siswa naik kelas.${hasil.skip ? ` ${hasil.skip} siswa kelas 12 dilewati (proses lewat Kelulusan).` : ""}`,
      );
      $("labelKenaikanKelas").value = "";
      $("catatanKenaikanKelas").value = "";
    } catch (err) {
      done();
      console.error("Gagal kenaikan kelas:", err);
      window.customAlert(
        "Gagal menjalankan Kenaikan Kelas. Periksa koneksi internet.",
      );
    }
  });
};

// ---- Batalkan Ganti Semester / Kenaikan Kelas (uji coba / koreksi) ----
// Hanya mengizinkan undo pada proses TERAKHIR yang tercatat, dan hanya untuk
// siswa yang periode itu masih jadi arsip paling baru milik mereka (supaya
// tidak menimpa perubahan lebih baru yang mungkin terjadi sesudahnya).
window._transisiTerpilih = null; // { periodeId, aksi, label, waktuStr }

window.muatRiwayatTransisiUntukBatal = async function () {
  const selectEl = $("transisiBatalSelect");
  const infoEl = $("transisiBatalInfo");
  const listEl = $("transisiBatalList");
  if (!selectEl) return;

  selectEl.innerHTML = '<option value="">Memuat...</option>';
  if (listEl) listEl.innerHTML = "";
  if (infoEl) infoEl.textContent = "";

  try {
    const { collection, query, where, orderBy, limit, getDocs } =
      window.fbFirestore;
    const snap = await getDocs(
      query(
        collection(window.db, "admin_logs"),
        where("aksi", "in", ["GANTI_SEMESTER", "KENAIKAN_KELAS"]),
        orderBy("waktu", "desc"),
        limit(10),
      ),
    );

    if (snap.empty) {
      selectEl.innerHTML = '<option value="">-- Belum ada riwayat --</option>';
      return;
    }

    const runs = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.periodeId) runs.push(data);
    });

    if (runs.length === 0) {
      selectEl.innerHTML =
        '<option value="">-- Tidak ada proses yang bisa dibatalkan --</option>';
      return;
    }

    window._transisiRuns = runs;
    selectEl.innerHTML = runs
      .map((r, idx) => {
        const nama =
          r.aksi === "GANTI_SEMESTER" ? "Ganti Semester" : "Kenaikan Kelas";
        return `<option value="${idx}">${escapeHtml(nama)}: "${escapeHtml(r.label || "-")}" — ${escapeHtml(r.waktuStr || "")}</option>`;
      })
      .join("");
    window.pilihTransisiUntukBatal();
  } catch (err) {
    console.error("Gagal memuat riwayat transisi:", err);
    selectEl.innerHTML = '<option value="">-- Gagal memuat --</option>';
  }
};

window.pilihTransisiUntukBatal = function () {
  const selectEl = $("transisiBatalSelect");
  const infoEl = $("transisiBatalInfo");
  const listEl = $("transisiBatalList");
  const chkSemua = $("chkPilihSemuaTransisi");
  if (!selectEl || !listEl) return;

  const idx = Number(selectEl.value);
  const run = (window._transisiRuns || [])[idx];
  window._transisiTerpilih = run || null;
  if (chkSemua) chkSemua.checked = false;

  if (!run) {
    listEl.innerHTML = "";
    if (infoEl) infoEl.textContent = "";
    return;
  }

  const eligible = masterDataSiswa.filter((s) =>
    (s.arsipPeriodeIds || []).includes(run.periodeId),
  );
  const terkunci = eligible.filter(
    (s) => periodeIdTerbaru(s) !== run.periodeId,
  ).length;
  const bisaDibatalkan = eligible.length - terkunci;

  if (infoEl) {
    infoEl.textContent =
      `${eligible.length} siswa tercatat dalam proses ini` +
      (terkunci > 0
        ? `, ${terkunci} di antaranya sudah ada perubahan lebih baru sehingga tidak bisa dibatalkan (ditandai abu-abu).`
        : ".");
  }

  if (eligible.length === 0) {
    listEl.innerHTML =
      '<div class="empty-note">Tidak ada siswa untuk proses ini.</div>';
    return;
  }

  listEl.innerHTML = eligible
    .map((s) => {
      const bisa = periodeIdTerbaru(s) === run.periodeId;
      return `
    <label class="friend-row" style="cursor: ${bisa ? "pointer" : "not-allowed"}; opacity: ${bisa ? "1" : "0.5"};">
      <input
        type="checkbox"
        class="batal-transisi-chk"
        value="${escapeHtml(s.nisn)}"
        ${bisa ? "" : "disabled"}
        style="width: auto; margin-right: 10px;"
      />
      <div class="row-main">
        <div class="row-name">${escapeHtml(s.nama)}</div>
        <div class="row-sub">Kelas: ${escapeHtml(s.kelas)} • NISN ${escapeHtml(s.nisn)}${bisa ? "" : " — ada perubahan lebih baru"}</div>
      </div>
    </label>`;
    })
    .join("");
};

window.toggleSemuaBatalTransisi = function (checked) {
  document
    .querySelectorAll(".batal-transisi-chk:not(:disabled)")
    .forEach((el) => (el.checked = checked));
};

async function buildUndoTransisiUpdate(d, ref, periodeId) {
  const { doc, getDoc } = window.fbFirestore;
  const arsipSnap = await getDoc(doc(ref, "arsip", periodeId));
  if (!arsipSnap.exists()) return null;
  const entry = arsipSnap.data();
  return {
    _arsipHapus: periodeId,
    arsipPeriodeIds: (d.arsipPeriodeIds || []).filter((id) => id !== periodeId),
    totalPrestasi: entry.totalPrestasi || 0,
    totalPelanggaran: entry.totalPelanggaran || 0,
    dailyScore: entry.dailyScore || 0,
    hp: entry.hp !== undefined ? entry.hp : 200,
    shield: entry.shield || 0,
    riwayat: entry.riwayat || [],
    kelas: entry.kelas || d.kelas,
    kelasAktif: entry.kelas || d.kelasAktif || d.kelas,
  };
}

window.jalankanBatalTransisiUI = async function () {
  const run = window._transisiTerpilih;
  const catatan = $("catatanBatalTransisi").value.trim();
  if (!run) return window.customAlert("Pilih proses yang mau dibatalkan dulu.");
  if (!catatan) return window.customAlert("Catatan/alasan wajib diisi.");

  const checked = Array.from(
    document.querySelectorAll(".batal-transisi-chk:checked"),
  ).map((el) => el.value);
  if (checked.length === 0)
    return window.customAlert(
      "Centang minimal satu siswa yang mau dikembalikan (atau centang Pilih Semua).",
    );

  const nama =
    run.aksi === "GANTI_SEMESTER" ? "Ganti Semester" : "Kenaikan Kelas";
  const ok = await window.customConfirm(
    `Mengembalikan ${checked.length} siswa ke kondisi sebelum "${nama}: ${run.label}" dijalankan — HP, Shield, Poin Harian, Prestasi, Pelanggaran, Riwayat${run.aksi === "KENAIKAN_KELAS" ? ", dan tingkat kelas" : ""} akan dikembalikan seperti semula. TIDAK DAPAT DIBATALKAN LAGI. Lanjutkan?`,
    "↩️ BATALKAN " + nama.toUpperCase(),
  );
  if (!ok) return;

  showGamePreloader("MENGEMBALIKAN DATA...", async (done) => {
    try {
      const ts = localDateTimeStr();
      const targets = checked.map((nisn) => ({ nisn }));
      let dilewati = 0;

      await batchUpdateSiswa(targets, async (d, ref) => {
        // Cek ulang dari data server TERBARU (bukan dari tampilan/cache
        // browser): hanya batalkan kalau periode ini memang masih arsip
        // paling akhir milik siswa ini, supaya tidak menimpa perubahan
        // lebih baru yang mungkin terjadi sejak daftar ini ditampilkan.
        if (periodeIdTerbaru(d) !== run.periodeId) {
          dilewati++;
          return {};
        }
        const upd = await buildUndoTransisiUpdate(d, ref, run.periodeId);
        if (!upd) {
          dilewati++;
          return {}; // tidak ada perubahan field apa pun
        }
        upd.riwayat = tambahRiwayat(upd.riwayat, {
          t: `DIBATALKAN: ${nama} "${run.label}" — ${catatan}`,
          p: 0,
          loc: "Sistem",
          d: ts,
        });
        return upd;
      });

      await catatLogAkademik("BATAL_TRANSISI", {
        aksiDibatalkan: run.aksi,
        periodeId: run.periodeId,
        label: run.label,
        catatan,
        jumlah: checked.length - dilewati,
      });
      await refreshMasterSiswa();
      window.muatRiwayatTransisiUntukBatal();
      done();
      window.customAlert(
        `✅ ${checked.length - dilewati} siswa dikembalikan ke kondisi sebelum "${run.label}".` +
          (dilewati
            ? ` ${dilewati} siswa dilewati karena sudah ada perubahan lebih baru.`
            : ""),
      );
      $("catatanBatalTransisi").value = "";
    } catch (err) {
      done();
      console.error("Gagal membatalkan transisi:", err);
      window.customAlert("Gagal mengembalikan data. Periksa koneksi internet.");
    }
  });
};

window.jalankanKelulusanUI = async function () {
  const catatan = $("catatanKelulusan").value.trim();
  if (!catatan) return window.customAlert("Catatan/alasan wajib diisi.");

  const calon = masterDataSiswa.filter(
    (s) => s.kelas === "12 SMK" && s.statusAkun !== "lulus",
  ).length;
  if (calon === 0)
    return window.customAlert(
      "Tidak ada siswa kelas 12 SMK yang berstatus aktif.",
    );

  const ok = await window.customConfirm(
    `Meluluskan ${calon} siswa kelas 12 SMK. Akun mereka berubah jadi ALUMNI (data tidak dihapus, fitur chat/pertemanan/ubah profil ditutup, portal menampilkan transkrip akhir). TIDAK DAPAT DIBATALKAN. Lanjutkan?`,
    "⚠️ PROSES KELULUSAN",
  );
  if (!ok) return;

  showGamePreloader("MEMPROSES KELULUSAN...", async (done) => {
    try {
      const jumlah = await jalankanKelulusan(catatan);
      await refreshMasterSiswa();
      done();
      window.customAlert(
        `🎓 ${jumlah} siswa berhasil diluluskan menjadi Alumni.`,
      );
      $("catatanKelulusan").value = "";
    } catch (err) {
      done();
      console.error("Gagal proses kelulusan:", err);
      window.customAlert(
        "Gagal menjalankan Proses Kelulusan. Periksa koneksi internet.",
      );
    }
  });
};

// ---- Tampilan siswa aktif: lihat arsip kelas/semester sebelumnya ----
function buildHtmlPopup(titleText, bodyHtml, closeLabel = "Tutup") {
  injectCustomModalStyles();
  const existing = $("customPopupOverlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "customPopupOverlay";
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  const box = document.createElement("div");
  box.id = "customPopupBox";
  box.style.maxWidth = "420px";
  box.style.maxHeight = "80vh";
  box.style.overflowY = "auto";
  box.style.textAlign = "left";

  const titleEl = document.createElement("div");
  titleEl.id = "customPopupTitle";
  titleEl.textContent = titleText;

  const bodyEl = document.createElement("div");
  bodyEl.style.fontSize = "11px";
  bodyEl.style.color = "#cbd5e1";
  bodyEl.innerHTML = bodyHtml;

  const btnWrap = document.createElement("div");
  btnWrap.id = "customPopupButtons";
  btnWrap.style.marginTop = "14px";

  const btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.id = "customPopupBtnOk";
  btnClose.className = "custom-popup-btn";
  btnClose.textContent = closeLabel;
  btnClose.onclick = () => overlay.remove();
  btnWrap.appendChild(btnClose);

  box.append(titleEl, bodyEl, btnWrap);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  return { overlay, bodyEl };
}

window._arsipKelasItems = [];

window.lihatArsipKelas = async function () {
  const data = window.currentStudentDataCache;
  const nisn = (data && data.nisn) || window.currentStudentNisn;
  let items = [];
  try {
    if (nisn) items = await ambilArsipSiswa(nisn);
  } catch (err) {
    console.error("Gagal memuat arsip siswa:", err);
    return window.customAlert(
      "Gagal memuat riwayat sebelumnya. Periksa koneksi internet.",
      "📜 Riwayat Sebelumnya",
    );
  }
  items.sort((a, b) => (b.diarsipkanPada || 0) - (a.diarsipkanPada || 0));

  if (items.length === 0) {
    return window.customAlert(
      "Belum ada riwayat kelas/semester sebelumnya. Riwayat akan muncul di sini setelah admin menutup semester atau kamu naik kelas.",
      "📜 Riwayat Sebelumnya",
    );
  }

  window._arsipKelasItems = items;
  const listHtml = items
    .map(
      (it, idx) => `
      <div onclick="tampilDetailArsipKelas(${idx})" style="cursor:pointer; padding:10px; margin-bottom:8px; background:#1a2536; border:1px solid #334155; border-radius:8px;">
        <div style="font-weight:bold; color:#f1c40f; font-size:12px;">${escapeHtml(it.label || it.kelas || "Periode")}</div>
        <div style="font-size:10px; color:#94a3b8; margin-top:3px;">Prestasi: ${it.totalPrestasi || 0} Pts • Pelanggaran: ${it.totalPelanggaran || 0} Pts</div>
      </div>`,
    )
    .join("");

  buildHtmlPopup("📜 Riwayat Kelas/Semester Sebelumnya", listHtml);
};

window.tampilDetailArsipKelas = function (idx) {
  const it = window._arsipKelasItems[idx];
  if (!it) return;
  const body = `
    <div style="margin-bottom:10px; font-size:11px; line-height:1.6;">
      <div><strong style="color:#f1c40f">${escapeHtml(it.label || it.kelas || "Periode")}</strong></div>
      <div>Kelas saat itu: ${escapeHtml(it.kelas || "-")}</div>
      <div style="color:#2ecc71">Total Prestasi: ${it.totalPrestasi || 0} Pts</div>
      <div style="color:#e74c3c">Total Pelanggaran: ${it.totalPelanggaran || 0} Pts</div>
    </div>
    <div style="font-weight:bold; color:#f1c40f; font-size:11px; margin-bottom:6px;">Riwayat Kejadian:</div>
    ${renderRiwayatHtml(it.riwayat)}`;
  buildHtmlPopup("Detail Periode", body, "Kembali");
};

// ---- Tampilan alumni: transkrip akhir rekam jejak (read-only) ----
let isAlumniSession = false;

// Halaman alumni mode "perpisahan": hanya nama + status ALUMNI + kata-kata guru
function tampilkanPerpisahanAlumni(siswa, nisn) {
  const avatarImg = $("alumniAvatar");
  if (avatarImg) avatarImg.src = avatarFor(siswa);
  $("alumniNama").textContent = (siswa.nama || "").toUpperCase();
  $("alumniNisn").classList.add("hidden");
  $("alumniTranskripWrap").classList.add("hidden");
  $("alumniPerpisahan").classList.remove("hidden");
  $("alumniJudul").textContent = PESAN_ALUMNI.judul || "";
  const pembuka = $("alumniPembuka");
  pembuka.textContent = PESAN_ALUMNI.pembuka || "";
  pembuka.classList.toggle("hidden", !PESAN_ALUMNI.pembuka);
  // Satu pesan saja: dipilih berdasarkan NISN, jadi beda antar alumni tetapi tetap sama tiap login
  const daftar = PESAN_ALUMNI.kata || [];
  let pilih = null;
  if (daftar.length) {
    let h = 0;
    for (const c of String(siswa.nisn || nisn)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    pilih = daftar[h % daftar.length];
  }
  $("alumniKataGuru").innerHTML = pilih
    ? `<div class="alumni-kata">
        <div class="alumni-kata-isi">“${escapeHtml(pilih.pesan || "")}”</div>
        <div class="alumni-kata-dari">— ${escapeHtml(pilih.dari || "")}</div>
      </div>`
    : "";
}

async function tampilkanTranskripAlumni(siswa, nisn) {
  isAlumniSession = true;
  setSiswaAppMode(false);
  $("hasilPoinSiswa").classList.add("hidden");
  $("boxInputNisnSiswa").classList.add("hidden");
  $("alumniTranscriptView").classList.remove("hidden");
  if (FITUR.alumniMode !== "transkrip") {
    tampilkanPerpisahanAlumni(siswa, nisn);
    return; // data alumni tetap tersimpan; tidak ada pembacaan arsip
  }
  $("alumniPerpisahan").classList.add("hidden");
  $("alumniTranskripWrap").classList.remove("hidden");
  $("alumniNisn").classList.remove("hidden");

  let arsipList = [];
  try {
    arsipList = await ambilArsipSiswa(siswa.nisn || nisn);
  } catch (err) {
    console.error("Gagal memuat arsip alumni:", err);
  }
  arsipList.sort((a, b) => (a.diarsipkanPada || 0) - (b.diarsipkanPada || 0));
  const periodeAkhir = {
    label: `${siswa.kelas || siswa.kelasAktif || "Kelas Akhir"} (Tahun Terakhir)`,
    kelas: siswa.kelas || siswa.kelasAktif || "-",
    totalPrestasi: siswa.totalPrestasi || 0,
    totalPelanggaran: siswa.totalPelanggaran || 0,
    riwayat: siswa.riwayat || [],
  };
  const semuaPeriode = [...arsipList, periodeAkhir];

  const totalPrestasi = semuaPeriode.reduce(
    (s, p) => s + (p.totalPrestasi || 0),
    0,
  );
  const totalPelanggaran = semuaPeriode.reduce(
    (s, p) => s + (p.totalPelanggaran || 0),
    0,
  );

  const avatarImg = $("alumniAvatar");
  if (avatarImg) avatarImg.src = avatarFor(siswa);
  $("alumniNama").textContent = (siswa.nama || "").toUpperCase();
  $("alumniNisn").textContent = `NISN: ${siswa.nisn || nisn}`;
  $("alumniTotalPrestasi").textContent = `${totalPrestasi} Pts`;
  $("alumniTotalPelanggaran").textContent = `${totalPelanggaran} Pts`;

  window._alumniPeriodeData = semuaPeriode;
  const selectEl = $("alumniPeriodeSelect");
  if (selectEl) {
    selectEl.innerHTML = semuaPeriode
      .map(
        (p, idx) =>
          `<option value="${idx}">${escapeHtml(p.label || p.kelas || "Periode " + (idx + 1))}</option>`,
      )
      .join("");
    // Tampilkan periode terbaru (tahun terakhir) secara default
    selectEl.value = String(semuaPeriode.length - 1);
  }
  window.tampilkanPeriodeAlumniTerpilih();
}

window.tampilkanPeriodeAlumniTerpilih = function () {
  const selectEl = $("alumniPeriodeSelect");
  const detailEl = $("alumniPeriodeDetail");
  if (!selectEl || !detailEl) return;
  const idx = Number(selectEl.value);
  const p = (window._alumniPeriodeData || [])[idx];
  if (!p) {
    detailEl.innerHTML = "";
    return;
  }
  detailEl.innerHTML = `
    <div class="rpg-card-container" style="margin-bottom: 10px;">
      <div style="font-weight: bold; color: #f1c40f; font-size: 12.5px; margin-bottom: 6px;">${escapeHtml(p.label || p.kelas || "Periode")}</div>
      <div style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">
        Prestasi: <span style="color:#2ecc71">${p.totalPrestasi || 0} Pts</span> •
        Pelanggaran: <span style="color:#e74c3c">${p.totalPelanggaran || 0} Pts</span>
      </div>
      <div class="history-list-box">${renderRiwayatHtml(p.riwayat)}</div>
    </div>`;
};

function startAlumniView(nisn, siswa) {
  localStorage.setItem("activeUser", nisn);
  localStorage.setItem(
    "activeUserExpiry",
    String(Date.now() + SESSION_SISWA_MS),
  );
  currentNisnSiswa = nisn;
  window.currentStudentNisn = nisn;
  window.currentStudentDataCache = siswa;
  tampilkanTranskripAlumni(siswa, nisn);
  updateFabLaporanBug();
}

const LABEL_AKSI_ADMIN = {
  RESET_DAILY_GLOBAL: "Reset poin harian (semua)",
  RESET_DAILY_CLASS: "Reset poin harian (kelas)",
  RESET_DAILY_INDIVIDUAL: "Reset poin harian (individu)",
  RESET_FULL_GLOBAL: "Pemutihan penuh (semua)",
  RESET_FULL_CLASS: "Pemutihan penuh (kelas)",
  RESET_FULL_INDIVIDUAL: "Pemutihan penuh (individu)",
  RESET_PIN_SISWA: "Reset PIN siswa",
  UNDO_POIN_INDIVIDUAL: "Batalkan input poin terakhir",
};
window.muatRiwayatAdmin = async function () {
  const box = $("adminRiwayatList");
  if (!box) return;
  box.innerHTML = '<div class="rk-kosong">Memuat...</div>';
  try {
    const { collection, query, orderBy, limit, getDocs } = window.fbFirestore;
    const snap = await getDocs(
      query(collection(window.db, "admin_logs"), orderBy("waktu", "desc"), limit(15)),
    );
    if (snap.empty) {
      box.innerHTML = '<div class="rk-kosong">Belum ada tindakan tercatat.</div>';
      return;
    }
    let html = "";
    snap.forEach((d) => {
      const x = d.data();
      const siswa = x.nisn ? masterDataSiswa.find((s) => String(s.nisn) === String(x.nisn)) : null;
      const target = siswa ? `${siswa.nama} (${siswa.kelas})` : x.scope || "";
      const berat = String(x.aksi || "").startsWith("RESET_FULL");
      html += `<div class="adm-riwayat-item${berat ? " merah" : ""}">
        <b>${escapeHtml(LABEL_AKSI_ADMIN[x.aksi] || x.aksi || "-")}</b> — ${escapeHtml(target)}<br>
        “${escapeHtml(x.catatan || "-")}”
        <small>${escapeHtml(x.oleh || "-")} • ${escapeHtml(x.waktuStr || "")}</small>
      </div>`;
    });
    box.innerHTML = html;
  } catch (err) {
    console.warn("Gagal memuat riwayat admin:", err);
    box.innerHTML = '<div class="rk-kosong">Gagal memuat riwayat.</div>';
  }
};

// Membatalkan SATU input poin terakhir (salah pilih kejadian/siswa).
// Aman karena memakai HP/Shield sebelum-sesudah yang dicatat saat input:
// hanya boleh jika nilai siswa sekarang masih persis hasil input itu.
async function batalkanInputPoinTerakhir(nisn, catatan, ts) {
  const { doc, runTransaction } = window.fbFirestore;
  let ringkas = "";
  await runTransaction(window.db, async (tx) => {
    const ref = doc(window.db, "siswa", nisn);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Siswa tidak ditemukan");
    const d = snap.data();
    const rw = d.riwayat || [];
    const idx = rw.findIndex((r) => r && r.k && r.p !== 0);
    if (idx < 0) throw new Error("Tidak ada input poin yang bisa dibatalkan.");
    const r = rw[idx];
    if (r.hb === undefined || r.ha === undefined)
      throw new Error(
        "Input terakhir dibuat sebelum fitur ini ada (tidak tercatat HP/Shield-nya), jadi tidak bisa dibatalkan otomatis.",
      );
    const hpNow = d.hp !== undefined && d.hp !== null ? d.hp : 200;
    if (idx !== 0 && rw.slice(0, idx).some((x) => x && x.hb !== undefined))
      throw new Error("Sudah ada perubahan poin setelah input itu.");
    if (hpNow !== r.ha || (d.shield || 0) !== r.sa)
      throw new Error(
        "HP/Shield siswa sudah berubah sejak input itu (mis. pemutihan), jadi tidak aman dibatalkan otomatis.",
      );
    const up = {
      hp: r.hb,
      shield: r.sb,
      riwayat: [
        {
          t: `DIBATALKAN: ${r.t} — ${catatan}`,
          p: 0,
          loc: "Ruang BK / Admin",
          d: ts,
        },
        ...rw.filter((_, i) => i !== idx),
      ].slice(0, MAX_RIWAYAT),
    };
    if (r.k === "Prestasi")
      up.totalPrestasi = Math.max(0, (d.totalPrestasi || 0) - Math.abs(r.p));
    else if (r.k === "Pelanggaran")
      up.totalPelanggaran = Math.max(0, (d.totalPelanggaran || 0) - Math.abs(r.p));
    else if (r.k === "TugasHarian")
      up.dailyScore = Math.max(0, (d.dailyScore || 0) - Math.abs(r.p));
    tx.update(ref, up);
    ringkas = `↩️ Dibatalkan: "${r.t}" (${r.p > 0 ? "+" : ""}${r.p}). HP ${hpNow}→${r.hb}, Shield ${r.sa}→${r.sb}.`;
  });
  return ringkas;
}

window.prosesActionAdminWithLoading = async function () {
  const act = $("adminActionType").value;
  const kelasTarget = $("adminKelasSelect").value;
  const nisnTarget = $("adminSiswaSelect").value;
  const notes = $("adminNotes").value.trim();

  if (!notes) return window.customAlert("Catatan sidang wajib diisi!");
  if (act.includes("CLASS") && !kelasTarget)
    return window.customAlert("Pilih kelas target terlebih dahulu!");
  if ((act.includes("INDIVIDUAL") || act === "RESET_PIN_SISWA") && !nisnTarget)
    return window.customAlert("Pilih siswa target terlebih dahulu!");

  // Tindakan luas / merusak data wajib dikonfirmasi ulang, dengan menyebut jumlah yang terdampak
  const jumlahTarget = act.includes("GLOBAL")
    ? masterDataSiswa.length
    : act.includes("CLASS")
      ? masterDataSiswa.filter((s) => s.kelas === kelasTarget).length
      : 1;
  const namaAksi = {
    RESET_DAILY_GLOBAL: "Reset poin harian SEMUA siswa",
    RESET_DAILY_CLASS: `Reset poin harian kelas ${kelasTarget}`,
    RESET_DAILY_INDIVIDUAL: "Reset poin harian 1 siswa",
    RESET_FULL_GLOBAL: "PEMUTIHAN PENUH SEMUA siswa",
    RESET_FULL_CLASS: `PEMUTIHAN PENUH kelas ${kelasTarget}`,
    RESET_FULL_INDIVIDUAL: "PEMUTIHAN PENUH 1 siswa",
    RESET_PIN_SISWA: "Reset PIN 1 siswa ke 123456",
    UNDO_POIN_INDIVIDUAL: "Batalkan input poin terakhir 1 siswa",
  }[act] || act;
  const butuhKetik = act.startsWith("RESET_FULL") || act === "RESET_DAILY_GLOBAL";
  if (butuhKetik) {
    const kata = act.startsWith("RESET_FULL") ? "PUTIHKAN" : "RESET";
    const dampak = act.startsWith("RESET_FULL")
      ? "HP, shield, poin prestasi/pelanggaran, dan seluruh riwayat akan dihapus"
      : "poin harian akan dikembalikan ke 0";
    const ok = await window.konfirmasiKetik(
      `${namaAksi}\nDampak: ${jumlahTarget} siswa — ${dampak}.\nTIDAK DAPAT DIBATALKAN.\n\nKetik ${kata} untuk melanjutkan:`,
      "⚠️ KONFIRMASI ADMIN",
      kata,
    );
    if (!ok) return;
  } else if (act === "UNDO_POIN_INDIVIDUAL") {
    const ok = await window.customConfirm(
      "Batalkan input poin TERAKHIR siswa ini?\nHP, Shield, dan total poin dikembalikan seperti sebelum input itu. Catatan pembatalan tetap tersimpan di riwayat.",
      "↩️ KONFIRMASI PEMBATALAN",
    );
    if (!ok) return;
  } else if (act.includes("GLOBAL") || act.includes("CLASS")) {
    const ok = await window.customConfirm(
      `${namaAksi}\nDampak: ${jumlahTarget} siswa.\nLanjutkan eksekusi?`,
      "⚠️ KONFIRMASI ADMIN",
    );
    if (!ok) return;
  }

  showGamePreloader("EXECUTING ADMIN OVERRIDE...", async (done) => {
    try {
      const ts = localDateTimeStr();
      const mkEntry = (t) => ({ t, p: 0, loc: "Ruang BK / Admin", d: ts });

      let targets;
      let scope;
      if (act.includes("GLOBAL")) {
        targets = [...masterDataSiswa];
        scope = "Global";
      } else if (act.includes("CLASS")) {
        targets = masterDataSiswa.filter((s) => s.kelas === kelasTarget);
        scope = `Kelas ${kelasTarget}`;
      } else {
        targets = [{ nisn: nisnTarget }];
        scope = "Individu";
      }

      let pesanSukses = "";

      if (act.startsWith("RESET_DAILY")) {
        const entry = mkEntry(`RESET POIN HARIAN (${scope}): ${notes}`);
        await batchUpdateSiswa(targets, (d) => ({
          dailyScore: 0,
          riwayat: tambahRiwayat(d.riwayat, entry),
        }));
        pesanSukses = `⭐ Poin harian (${scope}) berhasil di-reset jadi 0!`;
      } else if (act.startsWith("RESET_FULL")) {
        const entry = mkEntry(`PEMUTIHAN (${scope}): ${notes}`);
        await batchUpdateSiswa(targets, () => ({
          hp: 200,
          shield: 0,
          totalPrestasi: 0,
          totalPelanggaran: 0,
          riwayat: [entry],
        }));
        pesanSukses = `👑 Pemutihan penuh (${scope}) berhasil dieksekusi!`;
      } else if (act === "UNDO_POIN_INDIVIDUAL") {
        pesanSukses = await batalkanInputPoinTerakhir(nisnTarget, notes, ts);
      } else if (act === "RESET_PIN_SISWA") {
        const entry = mkEntry(`RESET PIN AKUN: ${notes}`);
        await batchUpdateSiswa(targets, (d) => ({
          pin: "123456",
          hasChangedPin: false,
          riwayat: tambahRiwayat(d.riwayat, entry),
        }));
        pesanSukses = `🔑 PIN siswa berhasil di-reset menjadi '123456'!`;
      } else {
        throw new Error("Aksi admin tidak dikenal: " + act);
      }

      // Jejak audit (gagal menulis log tidak membatalkan aksi)
      try {
        const { collection, addDoc } = window.fbFirestore;
        await addDoc(collection(window.db, "admin_logs"), {
          aksi: act,
          scope,
          kelas: kelasTarget || "",
          nisn: nisnTarget || "",
          catatan: notes,
          oleh: currentUser?.nama || "-",
          waktu: Date.now(),
          waktuStr: ts,
        });
      } catch (e) {
        console.warn("Audit log tidak tersimpan:", e);
      }

      await refreshMasterSiswa();
      done();
      window.customAlert(pesanSukses);
      $("formAdminAction").reset();
      window.handleAdminActionTypeChange();
      muatRiwayatAdmin();
    } catch (err) {
      done();
      console.error("Gagal menjalankan aksi Admin:", err);
      window.customAlert(
        act === "UNDO_POIN_INDIVIDUAL" && err && err.message
          ? err.message
          : "Gagal mengeksekusi perintah ke database Firestore.",
      );
    }
  });
};

// ==========================================
// PANDUAN (dulu Papan Quest): Prestasi, Pelanggaran, Poin Harian, Visi & Misi
// ==========================================
window.renderQuestUI = function (tipe) {
  const container = $("questContainerUI");
  if (!container) return;
  // Tombol tab: [id, tipe, warna]
  const TAB = [
    ["tabQuestPrestasi", "prestasi", "#3498db"],
    ["tabQuestPelanggaran", "pelanggaran", "#e74c3c"],
    ["tabQuestHarian", "harian", "#f39c12"],
    ["tabQuestVisi", "visi", "#8e44ad"],
  ];
  TAB.forEach(([id, t, warna]) => {
    const btn = $(id);
    if (!btn) return;
    const aktif = t === tipe;
    btn.className = aktif ? "" : "btn-outline";
    btn.style.background = aktif ? warna : "transparent";
    btn.style.color = aktif ? "white" : warna;
    btn.style.borderColor = warna;
  });

  if (tipe === "prestasi") {
    let html = `<div class="quest-aturan">🛡️ <b>Cara kerja:</b> prestasi <b>mengisi HP dulu</b> sampai penuh (200), setelah itu baru menjadi <b>Shield</b> (maks. ${SHIELD_MAKS}).</div>
    <div class="accordion">
              <div class="accordion-header" onclick="toggleAccordion(this)"><span>⭐ Daftar Penghargaan (Reward)</span><span>▼</span></div>
              <div class="accordion-body active">`;
    dataPilihan.Prestasi.forEach((item) => {
      html += `<div class="q-item"><span>${escapeHtml(item.t)}</span> <span class="badge-poin-plus">+${item.p}</span></div>`;
    });
    html += `</div></div>`;
    container.innerHTML = html;
  } else if (tipe === "pelanggaran") {
    let html = `<div class="quest-aturan">🛡️ <b>Cara kerja:</b> pelanggaran <b>mengurangi Shield dulu</b>. Kalau Shield habis, sisanya baru <b>mengurangi HP</b>.</div>`;
    ["Ringan", "Sedang", "Berat"].forEach((k, idx) => {
      html += `<div class="accordion">
               <div class="accordion-header" onclick="toggleAccordion(this)"><span>⚠️ Pelanggaran ${k}</span><span>▼</span></div>
               <div class="accordion-body ${idx === 0 ? "active" : ""}">`;
      dataPilihan.Pelanggaran[k].forEach((item) => {
        html += `<div class="q-item"><span>${escapeHtml(item.t)}</span> <span class="badge-poin-min">-${item.p}</span></div>`;
      });
      html += `</div></div>`;
    });
    container.innerHTML = html;
  } else if (tipe === "harian") {
    let html = `<div class="quest-aturan" style="border-left-color:#f39c12">⭐ <b>Poin Harian</b> didapat dari kegiatan belajar sehari-hari (daftar di bawah) dan diberikan oleh guru. Jumlahnya tampil sebagai <b>⭐ Pts di bawah foto profilmu</b> dan dipakai untuk peringkat <b>Top Global Rank</b>. Poin harian <b>tidak mengubah HP maupun Shield</b>.</div>
    <div class="accordion">
              <div class="accordion-header" onclick="toggleAccordion(this)"><span>⭐ Cara Mendapat Poin Harian</span><span>▼</span></div>
              <div class="accordion-body active">`;
    dataPilihan.TugasHarian.forEach((item) => {
      html += `<div class="q-item"><span>${escapeHtml(item.t)}</span> <span class="badge-poin-harian">+${item.p}</span></div>`;
    });
    html += `</div></div>`;
    container.innerHTML = html;
  } else {
    const misi = visiMisi.misi.map((m) => `<li>${escapeHtml(m)}</li>`).join("");
    container.innerHTML = `<div class="visimisi-box"><h4>🎯 Visi</h4>${escapeHtml(visiMisi.visi)}</div>
      <div class="visimisi-box"><h4>🚀 Misi</h4><ol>${misi}</ol></div>`;
  }
};

window.toggleAccordion = function (header) {
  const body = header.nextElementSibling;
  if (body.classList.contains("active")) {
    body.classList.remove("active");
  } else {
    header.parentElement.parentElement
      .querySelectorAll(".accordion-body")
      .forEach((b) => b.classList.remove("active"));
    body.classList.add("active");
  }
};

// ==========================================
// SISTEM CETAK & EKSPOR LAPORAN ADMIN
// ==========================================
window.handleCetakKategoriChange = function () {
  const kategori = $("cetakKategori").value;
  $("boxCetakKelas").classList.add("hidden");
  $("boxCetakSiswa").classList.add("hidden");

  if (kategori === "kelas") {
    $("boxCetakKelas").classList.remove("hidden");
  } else if (kategori === "siswa") {
    $("boxCetakSiswa").classList.remove("hidden");
    renderPilihanSiswaCetak(masterDataSiswa);
  }
};

function renderPilihanSiswaCetak(dataArray) {
  const selectEl = $("cetakSiswaSelect");
  if (!selectEl) return;
  const html = dataArray
    .map(
      (s) =>
        `<option value="${escapeHtml(s.nisn)}">${escapeHtml(s.nama)} (${escapeHtml(s.kelas)})</option>`,
    )
    .join("");
  selectEl.innerHTML =
    html || '<option value="">Tidak ada siswa ditemukan</option>';
}

window.filterPilihanSiswaCetak = function () {
  const keyword = $("searchSiswaInput").value.toLowerCase();
  const filtered = masterDataSiswa.filter(
    (s) =>
      String(s.nama).toLowerCase().includes(keyword) ||
      String(s.nisn).includes(keyword),
  );
  renderPilihanSiswaCetak(filtered);
};

async function ambilRiwayatSiswa(nisn) {
  try {
    const { doc, getDoc } = window.fbFirestore;
    const snap = await getDoc(doc(window.db, "siswa", nisn));
    return snap.exists() ? snap.data().riwayat || [] : [];
  } catch (e) {
    console.error("Gagal mengambil riwayat:", e);
    return [];
  }
}

window.prosesCetakLaporanWithLoading = async function () {
  const kategori = $("cetakKategori").value;
  let targetData = [...masterDataSiswa];
  let judulLaporan = "REKAPITULASI KESELURUHAN SISWA - SMK WIRAGUNA";
  let detailNisn = null;

  if (kategori === "kelas") {
    const kelasPilih = $("cetakKelasSelect").value;
    targetData = masterDataSiswa.filter((s) => s.kelas === kelasPilih);
    judulLaporan = `REKAPITULASI KEDISIPLINAN KELAS ${kelasPilih} - SMK WIRAGUNA`;
  } else if (kategori === "siswa") {
    const nisnPilih = $("cetakSiswaSelect").value;
    if (!nisnPilih) return window.customAlert("Pilih siswa terlebih dahulu!");
    const siswaObj = masterDataSiswa.find((s) => s.nisn === nisnPilih);
    if (!siswaObj) return window.customAlert("Data siswa tidak ditemukan.");
    targetData = [siswaObj];
    detailNisn = nisnPilih;
    judulLaporan = `LAPORAN DETAIL SISWA: ${String(siswaObj.nama).toUpperCase()} (${siswaObj.kelas})`;
  }

  if (targetData.length === 0) {
    return window.customAlert(
      "Tidak ada data untuk dicetak berdasarkan filter tersebut.",
    );
  }

  // Jendela HARUS dibuka langsung saat klik (sebelum proses async),
  // kalau tidak akan diblokir popup-blocker (terutama Safari/iOS).
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    return window.customAlert(
      "Popup diblokir browser. Izinkan popup untuk situs ini lalu coba lagi.",
    );
  }
  printWindow.document.write(
    "<p style='font-family:sans-serif'>Menyiapkan dokumen laporan...</p>",
  );

  showGamePreloader("MENYIAPKAN DOKUMEN LAPORAN...", async (done) => {
    try {
      const riwayat = detailNisn ? await ambilRiwayatSiswa(detailNisn) : null;
      cetakLaporanKeJendelaBaru(printWindow, targetData, judulLaporan, riwayat);
    } finally {
      done();
    }
  });
};

function cetakLaporanKeJendelaBaru(printWindow, dataSiswa, judul, riwayat) {
  const tanggalCetak = new Date().toLocaleDateString("id-ID");
  const baris = dataSiswa
    .map(
      (s, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(s.nisn || "-")}</td>
        <td><b>${escapeHtml(s.nama)}</b></td>
        <td>${escapeHtml(s.kelas)}</td>
        <td>HP: ${s.hp ?? 200} | Shld: ${s.shield || 0}</td>
        <td>${s.totalPrestasi || 0} Pts</td>
        <td>${s.totalPelanggaran || 0} Pts</td>
      </tr>`,
    )
    .join("");

  let riwayatHtml = "";
  if (riwayat) {
    const rows = riwayat.length
      ? riwayat
          .map(
            (r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(r.d || "-")}</td>
          <td>${escapeHtml(r.t)}</td>
          <td>${escapeHtml(r.loc || "-")}</td>
          <td>${Number(r.p) > 0 ? "+" + Number(r.p) : Number(r.p) || 0}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" style="text-align:center">Tidak ada catatan riwayat.</td></tr>`;
    riwayatHtml = `
      <h4 style="text-align:left; margin-top:20px">Riwayat Kejadian & Poin</h4>
      <table>
        <thead><tr><th>No</th><th>Waktu</th><th>Kejadian</th><th>Tempat</th><th>Poin</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  const htmlContent = `<!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(judul)}</title>
      <style>
        body { font-family: 'Poppins', Arial, sans-serif; padding: 20px; color: #111; }
        h2, h4 { text-align: center; margin: 4px 0; }
        .header { margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
        th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
        th { background: #f2f2f2; color: #000; }
        .footer { margin-top: 30px; display: flex; justify-content: space-between; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2>PEMERINTAH PROVINSI JAWA BARAT</h2>
        <h2>YAYASAN PENDIDIKAN SMK WIRAGUNA LIMBANGAN</h2>
        <h4>${escapeHtml(judul)}</h4>
        <p style="text-align: center; font-size: 10px; color: #555; margin-top: 5px;">Dicetak otomatis melalui Sistem Tatib SMK Wiraguna pada ${tanggalCetak}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>No</th><th>NISN</th><th>Nama Siswa</th><th>Kelas</th>
            <th>HP / Shield</th><th>Total Prestasi</th><th>Total Pelanggaran</th>
          </tr>
        </thead>
        <tbody>${baris}</tbody>
      </table>
      ${riwayatHtml}
      <div class="footer">
        <div><br><br>Mengetahui,<br><b>Kepala Sekolah / Tim BK</b></div>
        <div>Garut, ${tanggalCetak}<br><br><b>Petugas / Admin</b></div>
      </div>
      <script>
        window.onload = function() { window.print(); }
      <\/script>
    </body>
    </html>`;

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

// ==========================================
// FITUR GANTI FOTO PROFIL SISWA & CROPPER
// ==========================================
let cropperInstance = null;
let sedangSimpanFoto = false;
const MAX_FOTO_BYTES = 8 * 1024 * 1024;

function buatCropper(imageElement, aspectRatio = 1) {
  if (typeof Cropper === "undefined") {
    // pustaka dimuat saat pertama kali dibutuhkan
    muatCropperLuar()
      .then(() => buatCropper(imageElement, aspectRatio))
      .catch(() =>
        window.customAlert("Pemotong foto gagal dimuat. Periksa koneksi internet lalu coba lagi."),
      );
    return;
  }
  if (cropperInstance) cropperInstance.destroy();
  cropperInstance = new Cropper(imageElement, {
    aspectRatio: aspectRatio,
    viewMode: 1,
    dragMode: "move",
    autoCropArea: 0.8,
    restore: false,
    guides: false,
    center: true,
    highlight: false,
    cropBoxMovable: true,
    cropBoxResizable: true,
    toggleDragModeOnDblclick: false,
  });
}

window.cekBatasGantiAvatar = async function (nisnSiswa) {
  try {
    const { doc, getDoc } = window.fbFirestore;
    const docSnap = await getDoc(doc(window.db, "siswa", nisnSiswa));
    if (!docSnap.exists()) return false;

    const lastChange = docSnap.data().lastAvatarChange || 0;
    const enamBulanMs = 180 * 24 * 60 * 60 * 1000;
    const sekarang = Date.now();

    if (lastChange === 0 || sekarang - lastChange >= enamBulanMs) return true;

    const sisaHari = Math.ceil(
      (enamBulanMs - (sekarang - lastChange)) / (1000 * 60 * 60 * 24),
    );
    window.customAlert(
      `⚠️ Maaf, jatah ganti foto mandiri baru bisa digunakan lagi dalam ${sisaHari} hari ke depan (1x per semester). Silakan hubungi Wali Kelas jika ingin mengubahnya sekarang.`,
    );
    return false;
  } catch (e) {
    console.error("Gagal cek batas ganti avatar:", e);
    window.customAlert("Gagal memeriksa jatah ganti foto. Coba lagi.");
    return false;
  }
};

window.bukaModalGantiFoto = async function () {
  const myNisn = getMyNisn();
  if (!myNisn) {
    window.customAlert("⚠️ Silakan login terlebih dahulu!");
    return;
  }

  const bolehGanti = await window.cekBatasGantiAvatar(myNisn);
  if (!bolehGanti) return;

  // Tampilkan foto saat ini saja. Cropper baru aktif SETELAH siswa memilih
  // berkas, supaya jatah 1x/semester tidak terpakai untuk foto bawaan.
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  $("imageToCrop").src = avatarFor(window.currentStudentDataCache);
  $("inputFileFotoSiswa").value = "";
  $("modalGantiFoto").classList.remove("hidden");
};

window.tutupModalGantiFoto = function () {
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  $("modalGantiFoto").classList.add("hidden");
  $("inputFileFotoSiswa").value = "";
};

window.handleFileSelectedForCrop = function (input) {
  const file = input.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    window.customAlert(
      "⚠️ Format file harus berupa gambar (JPG, PNG, atau WEBP)!",
    );
    input.value = "";
    return;
  }
  if (file.size > MAX_FOTO_BYTES) {
    window.customAlert("⚠️ Ukuran foto terlalu besar (maksimal 8 MB)!");
    input.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = function (event) {
    const imageElement = $("imageToCrop");
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }
    imageElement.onload = () => {
      imageElement.onload = null;
      buatCropper(imageElement);
    };
    imageElement.src = event.target.result;
  };
  reader.onerror = () =>
    window.customAlert("⚠️ Gagal membaca berkas foto. Coba berkas lain.");
  reader.readAsDataURL(file);
};

window.simpanFotoProfilBaru = async function () {
  if (!cropperInstance) {
    window.customAlert("⚠️ Silakan pilih berkas foto terlebih dahulu!");
    return;
  }
  if (sedangSimpanFoto) return;

  const myNisn = getMyNisn();
  if (!myNisn) return;

  const canvas = cropperInstance.getCroppedCanvas({ width: 256, height: 256 });
  if (!canvas) {
    window.customAlert("⚠️ Gagal memproses foto. Coba pilih foto lain.");
    return;
  }

  // Safari lama tidak mendukung WEBP -> otomatis jatuh ke JPEG
  let croppedDataUrl = canvas.toDataURL("image/webp", 0.8);
  if (!croppedDataUrl.startsWith("data:image/webp")) {
    croppedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
  }

  sedangSimpanFoto = true;
  try {
    const { doc, updateDoc } = window.fbFirestore;
    const lastAvatarChange = Date.now();

    await updateDoc(doc(window.db, "siswa", myNisn), {
      fotoUrl: croppedDataUrl,
      lastAvatarChange,
    });

    if (window.currentStudentDataCache) {
      window.currentStudentDataCache.fotoUrl = croppedDataUrl;
      window.currentStudentDataCache.lastAvatarChange = lastAvatarChange;
    }

    const avatarMain =
      $("avatarSiswaMain") || document.querySelector(".rpg-avatar-box img");
    if (avatarMain) avatarMain.src = croppedDataUrl;

    invalidateMasterCache();
    window.tutupModalGantiFoto();
    window.customAlert(
      "🎉 Berhasil! Foto profil kamu telah dipaskan dan diperbarui.",
    );
  } catch (error) {
    console.error("Gagal menyimpan foto:", error);
    window.customAlert(
      "❌ Terjadi kesalahan saat menyimpan foto ke server. Silakan coba lagi.",
    );
  } finally {
    sedangSimpanFoto = false;
  }
};

// ==========================================
// FITUR RESET FOTO OLEH WALI KELAS (PANEL GURU)
// ==========================================
const RESET_FOTO_SEMUA = "__SEMUA_KELAS__";

window.handleWaliKelasPilihKelas = function () {
  const kelas = $("waliKelasSelectKelas").value;
  const selSiswa = $("waliKelasSelectSiswa");

  if (!kelas) {
    selSiswa.innerHTML =
      '<option value="">-- Pilih siswa setelah pilih kelas --</option>';
    return;
  }

  const daftar = masterDataSiswa
    .filter((s) => s.kelas === kelas)
    .sort((a, b) => String(a.nama).localeCompare(String(b.nama)));
  let siswaHtml = '<option value="">-- Pilih Siswa --</option>';
  if (daftar.length > 0)
    siswaHtml += `<option value="${RESET_FOTO_SEMUA}">👥 SEMUA SISWA KELAS INI (${daftar.length} siswa)</option>`;
  daftar.forEach((s) => {
    siswaHtml += `<option value="${escapeHtml(s.nisn)}">${escapeHtml(s.nama)} (NISN: ${escapeHtml(s.nisn)})</option>`;
  });
  selSiswa.innerHTML = siswaHtml;
};

// Reset foto SELURUH kelas binaan. Hanya siswa yang memang punya foto kustom / masa tunggu
// yang ditulis ulang, supaya hemat penulisan Firestore.
async function resetFotoSeluruhKelas() {
  const kelas = $("waliKelasSelectKelas").value;
  if (!kelas || !kelasBinaanList(currentUser).includes(kelas)) {
    return window.customAlert("⛔ Kamu hanya bisa mereset foto siswa di kelas binaanmu.");
  }
  const semua = masterDataSiswa.filter((s) => s.kelas === kelas);
  const target = semua.filter((s) => s.fotoUrl || (s.lastAvatarChange || 0) > 0);
  if (target.length === 0) {
    return window.customAlert(
      `ℹ️ Tidak ada siswa ${kelas} yang perlu direset. Semua belum mengganti foto profil.`,
    );
  }
  const konfirmasi = await window.customConfirm(
    `Reset foto profil SELURUH kelas ${kelas}?\n${target.length} dari ${semua.length} siswa punya foto kustom dan akan dikembalikan ke avatar bawaan. Mereka bisa mengganti foto lagi secara mandiri.`,
  );
  if (!konfirmasi) return;

  showGamePreloader("MENGEKSEKUSI RESET FOTO KELAS...", async (done) => {
    try {
      const { doc, writeBatch } = window.fbFirestore;
      for (let i = 0; i < target.length; i += BATCH_CHUNK) {
        const batch = writeBatch(window.db);
        target.slice(i, i + BATCH_CHUNK).forEach((s) => {
          batch.update(doc(window.db, "siswa", String(s.nisn)), { fotoUrl: "", lastAvatarChange: 0 });
        });
        await batch.commit();
      }
      await refreshMasterSiswa();
      done();
      window.customAlert(`✅ Berhasil! Foto profil ${target.length} siswa kelas ${kelas} telah di-reset.`);
      terapkanFiturWaliKelas();
    } catch (error) {
      done();
      console.error("Gagal mereset foto satu kelas:", error);
      window.customAlert("❌ Terjadi kesalahan saat mereset foto kelas ke database.");
    }
  });
}

window.eksekusiResetFotoOlehWaliKelas = async function () {
  const nisnTarget = $("waliKelasSelectSiswa").value;

  if (!nisnTarget) {
    return window.customAlert(
      "⚠️ Silakan pilih kelas dan nama siswa terlebih dahulu!",
    );
  }

  if (nisnTarget === RESET_FOTO_SEMUA) return resetFotoSeluruhKelas();

  // Pengaman: hanya wali kelas, dan hanya untuk siswa di kelas binaannya
  const siswaTarget = masterDataSiswa.find((s) => s.nisn === nisnTarget);
  if (
    !siswaTarget ||
    !kelasBinaanList(currentUser).includes(siswaTarget.kelas)
  ) {
    return window.customAlert(
      "⛔ Kamu hanya bisa mereset foto siswa di kelas binaanmu.",
    );
  }

  const namaSiswa = namaDariNisn(nisnTarget);
  const konfirmasi = await window.customConfirm(
    `Apakah Anda yakin ingin mereset foto profil untuk siswa ${namaSiswa}? Siswa akan dapat mengganti fotonya kembali secara mandiri.`,
  );
  if (!konfirmasi) return;

  showGamePreloader("MENGEKSEKUSI RESET FOTO...", async (done) => {
    try {
      const { doc, updateDoc } = window.fbFirestore;
      await updateDoc(doc(window.db, "siswa", nisnTarget), {
        fotoUrl: "",
        lastAvatarChange: 0,
      });

      await refreshMasterSiswa();
      done();
      window.customAlert(
        `✅ Berhasil! Foto profil untuk ${namaSiswa} telah di-reset oleh Wali Kelas.`,
      );

      terapkanFiturWaliKelas();
    } catch (error) {
      done();
      console.error("Gagal mereset foto siswa:", error);
      window.customAlert(
        "❌ Terjadi kesalahan saat mereset foto siswa ke database.",
      );
    }
  });
};

// ==========================================
// FITUR PREVIEW FOTO PROFIL (FACEBOOK STYLE)
// ==========================================
window.bukaPreviewFoto = function () {
  const currentAvatar =
    window.currentStudentDataCache?.fotoUrl ||
    $("avatarSiswaMain")?.src ||
    avatarFor(window.currentStudentDataCache);

  $("imgPreviewBesar").src = currentAvatar;
  $("modalPreviewFoto").classList.remove("hidden");
};

window.tutupPreviewFoto = function () {
  $("modalPreviewFoto").classList.add("hidden");
};

// ==========================================
// SISTEM GLOBAL CHAT SEKOLAH (RPG CHATBOX) - TAB GLOBAL
// ==========================================
let globalChatActiveListener = null;
let lastGlobalSendAt = 0;
let globalOnlineUnsub = null;
let globalOnlineTimer = null;
let globalOnlineDocs = {};

function markGlobalSeen() {
  globalSeenTs = Date.now();
  globalUnread = 0;
  try {
    localStorage.setItem(`globalSeen_${getMyNisn()}`, String(globalSeenTs));
  } catch (e) {
    /* abaikan */
  }
  updateTabBadges();
}

function stopGlobalOnlineListener() {
  if (globalOnlineUnsub) {
    globalOnlineUnsub();
    globalOnlineUnsub = null;
  }
  if (globalOnlineTimer) {
    clearInterval(globalOnlineTimer);
    globalOnlineTimer = null;
  }
  if (globalOnlinePollTimer) {
    clearInterval(globalOnlinePollTimer);
    globalOnlinePollTimer = null;
  }
  globalOnlineDocs = {};
  globalOnlineTotal = 0;
}

function renderGlobalOnline() {
  const countEl = $("globalOnlineCount");
  const listEl = $("globalOnlineList");
  if (!countEl || !listEl) return;

  const now = Date.now();
  const me = getMyNisn();
  const online = Object.entries(globalOnlineDocs)
    .filter(
      ([, d]) =>
        d.state === "online" && now - (d.lastActive || 0) < ONLINE_THRESHOLD_MS,
    )
    .map(([nisn]) => nisn);
  if (me && !online.includes(me)) online.push(me); // diri sendiri jelas online

  online.sort((a, b) => {
    if (a === me) return -1;
    if (b === me) return 1;
    return namaDariNisn(a).localeCompare(namaDariNisn(b));
  });

  const totalOnline = Math.max(online.length, globalOnlineTotal || 0);
  countEl.textContent = `${totalOnline} siswa online`;

  const MAX = 30;
  let html = online
    .slice(0, MAX)
    .map((nisn) => {
      const s = cariSiswa(nisn);
      const nama = nisn === me ? "Kamu" : namaDariNisn(nisn);
      return `<span class="online-chip ${nisn === me ? "me" : ""}"><img src="${escapeHtml(avatarFor(s))}" alt="" onerror="${AVATAR_ONERROR}"><span class="nm">${escapeHtml(nama)}</span></span>`;
    })
    .join("");
  if (totalOnline > MAX) {
    html += `<span class="online-chip"><span class="nm">+${totalOnline - MAX} lainnya</span></span>`;
  }
  listEl.innerHTML = html;
}

// Daftar siswa online di Global Chat: DIAMBIL berkala (bukan listener real-time).
// Listener lama mengirim tiap tanda aktif tiap siswa online ke tiap penonton
// (100 online x 40 penonton = ribuan baca per menit). Sekarang: ambil saat tab dibuka,
// lalu tiap 3 menit selama tab terlihat; hanya 30 yang paling baru aktif + hitungan total.
const GLOBAL_ONLINE_POLL_MS = 180000;
const GLOBAL_ONLINE_MAKS = 30;
let globalOnlinePollTimer = null;
let globalOnlineTotal = 0;
let globalOnlineAmbil = false;

async function ambilGlobalOnline() {
  if (globalOnlineAmbil || document.hidden) return;
  globalOnlineAmbil = true;
  try {
    const { collection, query, where, orderBy, limit, getDocs, getCountFromServer } = window.fbFirestore;
    const batas = Date.now() - ONLINE_THRESHOLD_MS;
    const dasar = collection(window.db, "status");
    const snap = await getDocs(
      query(dasar, where("lastActive", ">", batas), orderBy("lastActive", "desc"), limit(GLOBAL_ONLINE_MAKS)),
    );
    const baru = {};
    snap.forEach((d) => {
      baru[d.id] = d.data();
    });
    globalOnlineDocs = baru;
    globalOnlineTotal = 0;
    if (snap.size >= GLOBAL_ONLINE_MAKS) {
      // lebih banyak dari yang ditampilkan: hitung total tanpa membaca dokumennya
      try {
        const cnt = await getCountFromServer(query(dasar, where("lastActive", ">", batas)));
        globalOnlineTotal = cnt.data().count || 0;
      } catch (e) {
        globalOnlineTotal = 0;
      }
    }
    renderGlobalOnline();
  } catch (err) {
    console.error("Gagal memuat siswa online:", err);
  } finally {
    globalOnlineAmbil = false;
  }
}

function startGlobalOnlineListener() {
  stopGlobalOnlineListener();
  ambilGlobalOnline();
  // ambil ulang berkala & evaluasi ulang (yang berhenti tanda aktif hilang sendiri)
  globalOnlinePollTimer = setInterval(ambilGlobalOnline, GLOBAL_ONLINE_POLL_MS);
  globalOnlineTimer = setInterval(renderGlobalOnline, 30000);
  renderGlobalOnline();
}

// Hapus pesan Global Chat yang sudah lebih dari 7 hari, samakan dengan chat pribadi.
// Dipanggil sekali tiap siswa login (bukan tiap buka tab), jadi tidak boros kuota.
async function bersihkanGlobalChatKedaluwarsa() {
  const { collection, query, where, getDocs } = window.fbFirestore;
  const tujuhHariLalu = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const expiredSnap = await getDocs(
    query(
      collection(window.db, "global_chat"),
      where("timestamp", "<", tujuhHariLalu),
    ),
  );
  if (!expiredSnap.empty) {
    await deleteDocsInChunks(expiredSnap.docs.map((d) => d.ref));
  }
}

window.initGlobalChat = function (siswaAktif) {
  const container = $("globalChatContainer");
  const inputEl = $("inputGlobalChat");
  const btnKirim = $("btnKirimGlobalChat");

  if (!container || !inputEl || !btnKirim) return;

  bersihkanGlobalChatKedaluwarsa().catch((e) =>
    console.log("Lewati pembersihan global chat lama:", e),
  );

  if (globalChatActiveListener) {
    globalChatActiveListener();
    globalChatActiveListener = null;
  }

  // Penanda "terakhir dilihat" untuk badge pesan baru
  const seenKey = `globalSeen_${siswaAktif.nisn}`;
  const saved = Number(localStorage.getItem(seenKey) || 0);
  globalSeenTs = saved || Date.now();
  if (!saved) localStorage.setItem(seenKey, String(globalSeenTs));
  globalUnread = 0;

  try {
    const { collection, query, limit, orderBy, onSnapshot, addDoc } =
      window.fbFirestore;
    // 50 pesan TERBARU
    const q = query(
      collection(window.db, "global_chat"),
      orderBy("timestamp", "desc"),
      limit(50),
    );

    container.innerHTML = `<div class="empty-note">Memuat obrolan global...</div>`;

    globalChatActiveListener = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = `<div class="empty-note">Belum ada percakapan global hari ini. Yuk mulai sapa teman-temanmu! 👋</div>`;
          return;
        }

        const messages = [];
        snapshot.forEach((docSnap) => messages.push(docSnap.data()));
        messages.reverse(); // urut lama -> baru

        container.innerHTML = messages
          .map((msg) => {
            const isMe = msg.nisn === siswaAktif.nisn;
            return `
          <div class="bubble ${isMe ? "me" : "them"}">
            <div class="bubble-name">${isMe ? "Kamu" : escapeHtml(msg.nama || "Siswa")}<span class="bubble-class">${escapeHtml(msg.kelas || "-")}</span></div>
            <div class="bubble-text">${escapeHtml(msg.text)}</div>
            <div class="bubble-meta"><span>${escapeHtml(msg.time || "")}</span></div>
          </div>`;
          })
          .join("");

        if (siswaActiveTab === "global") {
          markGlobalSeen();
          container.scrollTop = container.scrollHeight;
        } else {
          globalUnread = messages.filter(
            (m) =>
              m.nisn !== siswaAktif.nisn && (m.timestamp || 0) > globalSeenTs,
          ).length;
          updateTabBadges();
        }
      },
      (error) => {
        console.error("Error listener global chat:", error);
        container.innerHTML = `<div class="empty-note" style="color:#e74c3c">Gagal memuat Global Chat. Periksa koneksi internet.</div>`;
      },
    );

    btnKirim.onclick = async function () {
      const text = inputEl.value.trim();
      if (!text) return;

      if (text.length > CHAT_MAX_LEN) {
        return window.customAlert(
          `⚠️ Pesan terlalu panjang (${text.length}/${CHAT_MAX_LEN} karakter). Maksimal ${CHAT_MAX_LEN} karakter per pesan agar terhindar dari spam!`,
        );
      }
      if (Date.now() - lastGlobalSendAt < CHAT_COOLDOWN_MS) return;
      lastGlobalSendAt = Date.now();

      try {
        await addDoc(collection(window.db, "global_chat"), {
          nisn: siswaAktif.nisn,
          nama: siswaAktif.nama,
          kelas: siswaAktif.kelas || "-",
          text,
          time: localTimeStr(),
          timestamp: Date.now(),
        });
        inputEl.value = "";
      } catch (err) {
        console.error("Gagal mengirim pesan global:", err);
        window.customAlert("Gagal mengirim pesan. Periksa koneksi internetmu.");
      }
    };

    inputEl.onkeydown = function (e) {
      if (e.key === "Enter") btnKirim.click();
    };
  } catch (err) {
    console.error("Gagal menginisialisasi global chat:", err);
    container.innerHTML = `<div class="empty-note" style="color:#e74c3c">Gagal memuat Global Chat.</div>`;
  }
};

// ==========================================
// MONITORING GLOBAL CHAT OLEH ADMIN
// ==========================================
let adminGlobalChatListener = null;

window.loadAdminGlobalChat = function () {
  const container = $("adminGlobalChatContainer");
  if (!container) return;
  container.innerHTML = `<div style="text-align: center; color: #888;">Memuat Global Chat...</div>`;

  try {
    const { collection, query, limit, orderBy, onSnapshot } =
      window.fbFirestore;
    const q = query(
      collection(window.db, "global_chat"),
      orderBy("timestamp", "desc"),
      limit(100),
    );

    if (adminGlobalChatListener) adminGlobalChatListener();

    adminGlobalChatListener = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = `<div style="text-align: center; color: #888;">Belum ada pesan di Global Chat.</div>`;
          return;
        }

        const messages = [];
        snapshot.forEach((docSnap) => messages.push(docSnap.data()));
        messages.reverse();

        container.innerHTML = messages
          .map(
            (msg) => `
        <div style="background: #1a2536; border: 1px solid #34495e; padding: 6px 8px; border-radius: 6px; margin-bottom: 4px;">
          <div style="display: flex; justify-content: space-between; font-weight: bold; color: #f1c40f; font-size: 9.5px; margin-bottom: 2px;">
            <span>👤 ${escapeHtml(msg.nama || "Siswa")} (${escapeHtml(msg.kelas || "-")} - ${escapeHtml(msg.nisn)})</span>
            <span style="color: #94a3b8; font-size: 8px;">${escapeHtml(msg.time || "")}</span>
          </div>
          <div style="color: #fff; font-size: 10.5px;">${escapeHtml(msg.text)}</div>
        </div>`,
          )
          .join("");
        container.scrollTop = container.scrollHeight;
      },
      (err) => {
        console.error("Gagal memuat admin global chat:", err);
        container.innerHTML = `<div style="text-align: center; color: #e74c3c;">Gagal memuat data Global Chat.</div>`;
      },
    );
  } catch (err) {
    console.error("Gagal memuat admin global chat:", err);
    container.innerHTML = `<div style="text-align: center; color: #e74c3c;">Gagal memuat data Global Chat.</div>`;
  }
};

window.adminHapusSemuaGlobalChat = async function () {
  const yakin = await window.customConfirm(
    "Yakin ingin menghapus SEMUA pesan di Global Chat Sekolah?",
  );
  if (!yakin) return;

  showGamePreloader("MENDELETING GLOBAL CHAT...", async (done) => {
    try {
      const { collection, getDocs } = window.fbFirestore;
      const snapshot = await getDocs(collection(window.db, "global_chat"));
      await deleteDocsInChunks(snapshot.docs.map((d) => d.ref));
      done();
      window.customAlert(
        "✅ Seluruh isi Global Chat berhasil dibersihkan oleh Admin!",
      );
    } catch (err) {
      done();
      console.error("Gagal menghapus global chat:", err);
      window.customAlert("Gagal menghapus pesan Global Chat.");
    }
  });
};

// ==========================================
// INISIALISASI APLIKASI
// ==========================================
const LAYAR_BUTUH_LOGIN = ["entry", "admin"];

async function initApp() {
  window.history.replaceState({ screen: "menu" }, "", "#menu");
  mulaiPantauMaintenance();

  // Pasang Enter pada form login siswa
  ["nisnSiswaInput", "pinSiswaInput", "inputNisnTeman"].forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        if (id === "inputNisnTeman") window.tambahTeman();
        else window.loginSiswaWithPin();
      });
    }
  });

  // Hanya perangkat dengan sesi staf yang butuh seluruh daftar siswa saat dibuka.
  // Siswa/tamu memakai roster ringan (lihat pastikanRoster) -> hemat ratusan baca.
  const adaSesiStaf = !!localStorage.getItem("loggedInUser");
  const [authUser] = await Promise.all([
    authReady,
    adaSesiStaf ? new Promise((res) => loadMasterSiswaFromCloud(res)) : Promise.resolve(),
  ]);

  loadTugasAktif();

  // Pulihkan sesi guru/admin HANYA jika sesi Firebase Auth masih valid
  const savedUser = localStorage.getItem("loggedInUser");
  if (savedUser) {
    if (authUser) {
      try {
        const userObj = JSON.parse(savedUser);
        // Pastikan email selalu ada & akurat (sesi lama sebelum fitur ini
        // mungkin belum menyimpannya) — ambil dari Firebase Auth yang aktif.
        userObj.email = authUser.email || userObj.email;
        currentUser = userObj;
        currentRole = userObj.role;
        sinkronRoster(masterDataSiswa); // sesi staf dipulihkan: pastikan roster siswa mutakhir
        if (userObj.role === "Super Admin") {
          $("txtNamaAdmin").innerText = userObj.nama;
          pasangSapaanStaf(userObj);
          showScreen("admin");
          window.switchAdminTab("rekap");
          cekBadgeLaporanBugAwal();
        } else {
          $("txtNamaGuru").innerText = userObj.nama;
          $("txtRoleGuru").innerText = "Jabatan: " + labelJabatan(userObj);
          pasangSapaanStaf(userObj);
          mulaiPresenceGuru(userObj);
          showScreen("entry");
          initFormEntry();
          window.switchTeacherTab("profil");
          loadTugasAktif();
        }
        return;
      } catch (e) {
        localStorage.removeItem("loggedInUser");
      }
    } else {
      localStorage.removeItem("loggedInUser");
    }
  }

  // Pulihkan sesi siswa (berlaku 12 jam)
  const savedNisn = localStorage.getItem("activeUser");
  if (savedNisn) {
    const expiry = Number(localStorage.getItem("activeUserExpiry") || 0);
    if (expiry && Date.now() < expiry && validNisnFormat(savedNisn)) {
      showScreen("siswa");
      $("nisnSiswaInput").value = savedNisn;
      autoLoginSiswa(savedNisn);
    } else {
      localStorage.removeItem("activeUser");
      localStorage.removeItem("activeUserExpiry");
    }
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

window.addEventListener("popstate", (event) => {
  let screen = event.state && event.state.screen ? event.state.screen : "menu";
  // Cegah masuk ke halaman guru/admin lewat tombol back/forward tanpa login
  if (LAYAR_BUTUH_LOGIN.includes(screen) && !currentUser) screen = "menu";
  showScreen(screen, false);
});
