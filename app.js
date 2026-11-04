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
const HEARTBEAT_MS = 60000;
const ONLINE_THRESHOLD_MS = 150000;
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

const AVATAR_ONERROR = "this.onerror=null;this.src='assets/foto_siswa/avatar.webp'";

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

// ==========================================
// STATE GLOBAL
// ==========================================
let currentRole = "";
let currentUser = null; // data guru/admin yang sedang login
let isMultiMode = true;
let currentNisnSiswa = ""; // NISN siswa yang sedang login
let masterDataSiswa = [];
let masterDataTugas = [];

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
    console.warn("Preloader sedang berjalan, permintaan diabaikan (cegah entri ganda).");
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

async function updatePresence(state) {
  if (!presenceNisn) return;
  try {
    const { doc, setDoc } = window.fbFirestore;
    await setDoc(
      doc(window.db, "status", presenceNisn),
      { state, lastActive: Date.now() },
      { merge: true },
    );
  } catch (e) {
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

function getTierRank(shield) {
  if (shield >= 290)
    return {
      title: "🌌 MYTHIC LEGEND",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #ff0844, #ffb199)",
    };
  if (shield >= 251)
    return {
      title: "👑 MASTER CHAMPION",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #b224ef, #7579ff)",
    };
  if (shield >= 211)
    return {
      title: "💠 DIAMOND VANGUARD",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #00c6ff, #0072ff)",
    };
  if (shield >= 171)
    return {
      title: "💎 PLATINUM GUARDIAN",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #11998e, #38ef7d)",
    };
  if (shield >= 131)
    return {
      title: "🥇 GOLD PALADIN",
      color: "#1a2536",
      bg: "linear-gradient(135deg, #f7971e, #ffd200)",
    };
  if (shield >= 91)
    return {
      title: "🥈 SILVER WARRIOR",
      color: "#1a2536",
      bg: "linear-gradient(135deg, #e0eafc, #cfdef3)",
    };
  if (shield >= 51)
    return {
      title: "🥉 BRONZE KNIGHT",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #d38312, #a83279)",
    };
  if (shield >= 11)
    return {
      title: "🛡️ IRON SQUIRE",
      color: "#ffffff",
      bg: "linear-gradient(135deg, #485563, #29323c)",
    };
  return {
    title: "🔰 NOVICE",
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
      return `
      <div style="background: #1a2536; border-left: 3px solid ${borderColor}; padding: 8px 10px; border-radius: 0 6px 6px 0; font-size: 12.5px; color: #ecf0f1; border: 1px solid #34495e; margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 2px;">
          <span style="color: ${borderColor};">${escapeHtml(r.t)}</span>
          <span style="color: ${borderColor};">${isPlus ? "+" + p : p} Pts</span>
        </div>
        <div style="font-size: 11px; color: #bdc3c7; display: flex; justify-content: space-between;">
          <span>📍 ${escapeHtml(r.loc || "-")}</span>
          <span>📅 ${escapeHtml(r.d || "-")}</span>
        </div>
      </div>`;
    })
    .join("");
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

  const hpValue = siswa.hp !== undefined ? siswa.hp : 200;
  $("barHpFill").style.width =
    `${Math.max(0, Math.min(100, (hpValue / 200) * 100))}%`;
  $("txtHpPercent").innerText = `${Math.max(0, hpValue)}/200`;

  $("txtShieldPercent").innerText = `${shieldValue} Pts`;
  $("barShieldFill").style.width =
    `${Math.max(0, Math.min(100, (shieldValue / 300) * 100))}%`;

  $("txtDailyScoreTextOnly").innerText = `⭐ ${siswa.dailyScore || 0} Pts`;

  // Header mini (tampil di semua tab)
  const miniAv = $("miniAvatar");
  if (miniAv) miniAv.src = avatarFor(siswa);
  $("miniNama").textContent = siswa.nama || "-";
  $("miniKelas").textContent = siswa.kelas || "-";
  $("miniHp").textContent = `❤️ ${Math.max(0, hpValue)}`;
  $("miniDaily").textContent = `⭐ ${siswa.dailyScore || 0}`;

  const statusHukum = getStatusPembinaan(siswa.totalPelanggaran || 0);
  $("txtStatusKondisi").innerText = `STATUS: ${statusHukum.title}`;
  $("txtStatusPenanganan").innerText = statusHukum.desc;

  $("txtCountPrestasi").innerText = `${siswa.totalPrestasi || 0} Pts`;
  $("txtCountPelanggaran").innerText = `${siswa.totalPelanggaran || 0} Pts`;

  $("historyListSiswa").innerHTML = renderRiwayatHtml(siswa.riwayat);

  // Kartu ganti PIN: tampil hanya jika PIN masih default
  const serverPin = siswa.pin !== undefined ? String(siswa.pin) : "123456";
  const cardGantiPin = $("cardGantiPin");
  if (cardGantiPin) {
    if (siswa.hasChangedPin || serverPin !== "123456") {
      cardGantiPin.style.display = "none";
    } else if (cardGantiPin.style.display === "none") {
      cardGantiPin.style.display = "block";
      $("oldPinInput").value = "";
      $("newPinInput").value = "";
    }
  }
}

function startStudentSession(nisn, siswa) {
  localStorage.setItem("activeUser", nisn);
  localStorage.setItem("activeUserExpiry", String(Date.now() + SESSION_SISWA_MS));
  currentNisnSiswa = nisn;
  window.currentStudentNisn = nisn;
  window.currentStudentDataCache = siswa;

  initStudentRealtimeListener(nisn);
  initOnlineStatusEngine(nisn);

  $("boxInputNisnSiswa").classList.add("hidden");
  $("hasilPoinSiswa").classList.remove("hidden");

  const cardGantiPin = $("cardGantiPin");
  if (cardGantiPin) cardGantiPin.style.display = "block";

  tampilkanProfilSiswa(siswa, nisn);
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
        startStudentSession(nisnInput, siswa);
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
        } else {
          startStudentSession(nisnInput, siswa);
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
    return window.customAlert(
      "⚠️ PIN baru harus berupa 4 sampai 6 angka!",
    );
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
      window.customAlert(
        "✅ PIN berhasil diubah! Kotak ganti PIN disembunyikan untuk keamanan.",
      );

      const cardGantiPin = $("cardGantiPin");
      if (cardGantiPin) cardGantiPin.style.display = "none";
      $("oldPinInput").value = "";
      $("newPinInput").value = "";
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

  const temanObj = masterDataSiswa.find((s) => s.nisn === targetNisn);
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
};

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
const SISWA_TABS = ["profil", "teman", "chat", "global"];
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
    const sender = masterDataSiswa.find((s) => s.nisn === senderNisn);
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
    teman: masterDataSiswa.find((s) => s.nisn === nisn),
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
    teman: masterDataSiswa.find((s) => s.nisn === nisn),
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
        preview = (st.last.senderNisn === me ? "Kamu: " : "") + (st.last.text || "");
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
    friendStatusListeners[nisn] = subscribeStatus(nisn, (info) => {
      const st = friendState[nisn];
      if (!st) return;
      st.online = info.isOnline;
      st.statusText = info.text;
      scheduleFriendRender();
    });

    try {
      const roomRef = collection(
        window.db,
        "chats",
        getChatRoomId(myNisn, nisn),
        "messages",
      );

      // Hanya pesan teman yang belum dibaca
      const unsubUnread = onSnapshot(
        query(roomRef, where("senderNisn", "==", nisn), where("read", "==", false)),
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

  scheduleFriendRender();
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

  const teman = masterDataSiswa.find((s) => s.nisn === targetNisn);
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
    const { collection, query, orderBy, where, onSnapshot, doc, updateDoc, getDocs, deleteDoc } =
      window.fbFirestore;
    const messagesRef = collection(window.db, "chats", roomId, "messages");
    const tujuhHariLalu = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Bersihkan pesan kedaluwarsa (gagal tidak boleh menggagalkan chat)
    try {
      const expiredSnap = await getDocs(
        query(messagesRef, where("timestamp", "<", tujuhHariLalu)),
      );
      await Promise.all(
        expiredSnap.docs.map((docSnap) =>
          deleteDoc(doc(window.db, "chats", roomId, "messages", docSnap.id)).catch(
            (err) => console.log("Gagal hapus pesan lama:", err),
          ),
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
    if (siswaActiveTab !== "chat" || currentChatTargetNisn !== targetNisn) return;

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
  const s = masterDataSiswa.find((x) => x.nisn === nisn);
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
      rooms.push({ id: docSnap.id, lastUpdated: docSnap.data().lastUpdated || 0 });
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
    const { collection, query, orderBy, onSnapshot, limit } = window.fbFirestore;
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
      window.customAlert("✅ Ruang chat beserta semua pesannya berhasil dihapus!");
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
const dataPilihan = {
  Prestasi: [
    { t: "Juara tingkat Nasional", p: 30 },
    { t: "Juara tingkat Provinsi", p: 25 },
    { t: "Juara tingkat Kabupaten/Kota", p: 20 },
    { t: "Juara tingkat Sekolah", p: 10 },
    { t: "Menjadi Petugas Upacara terbaik", p: 5 },
    { t: "Menjadi Penggerak Kebersihan per minggu", p: 5 },
    { t: "Menjadi peserta didik teladan per minggu", p: 10 },
    { t: "Tidak melakukan pelanggaran selama 1 semester", p: 20 },
    { t: "Tidak melakukan pelanggaran selama 1 tahun", p: 40 },
    { t: "Kehadiran 100% di semua pelajaran", p: 30 },
    { t: "Aktif berpartisipasi dalam pembelajaran di kelas", p: 5 },
    { t: "Menerapkan 5S (Senyum, Salam, Sapa, Sopan, Santun)", p: 5 },
    { t: "Melaksanakan kegiatan pengabdian kepada masyarakat", p: 10 },
    { t: "Menjadi imam shalat di masjid", p: 10 },
    { t: "Mengumandangkan azan di masjid", p: 5 },
  ],
  TugasHarian: [
    { t: "Mengerjakan PR / Tugas Kelas dengan baik", p: 10 },
    { t: "Aktif berdiskusi / Tanya jawab di kelas", p: 5 },
    { t: "Membantu guru / piket kebersihan kelas", p: 5 },
    { t: "Nilai ulangan harian memuaskan", p: 15 },
    { t: "Menyelesaikan proyek praktikum tepat waktu", p: 20 },
  ],
  Pelanggaran: {
    Ringan: [
      { t: "Terlambat datang ke sekolah", p: 5 },
      { t: "Tidak memakai atribut lengkap", p: 5 },
      { t: "Tidak memakai kartu identitas", p: 5 },
      { t: "Seragam tidak sesuai ketentuan", p: 5 },
      { t: "Tidak memakai sepatu", p: 5 },
      { t: "Memainkan ponsel di jam pelajaran", p: 5 },
      { t: "Rambut tidak rapi", p: 5 },
      { t: "Kuku panjang/kotor", p: 5 },
      { t: "Membuang sampah sembarangan", p: 5 },
      { t: "Tidak mengikuti piket kelas", p: 10 },
      { t: "Tidak membawa perlengkapan belajar", p: 5 },
      { t: "Tidur saat pembelajaran", p: 5 },
      { t: "Makan/minum saat pembelajaran tanpa izin", p: 5 },
      { t: "Berbicara saat guru menjelaskan", p: 5 },
      { t: "Keluar kelas tanpa izin", p: 10 },
      { t: "Tidak mengikuti apel/upacara tanpa alasan", p: 10 },
      { t: "Bercanda berlebihan saat pembelajaran", p: 5 },
      { t: "Tidak menjaga kebersihan kelas", p: 10 },
      { t: "Telat memasuki kelas tanpa izin", p: 10 },
      { t: "Keluar lingkungan sekolah tanpa izin", p: 10 },
      { t: "Tidak membawa alat shalat", p: 5 },
      { t: "Memakai riasan berlebihan", p: 5 },
      { t: "Tidak melakukan shalat Dhuha", p: 10 },
      { t: "Tidak melakukan shalat Dzuhur berjamaah", p: 10 },
      { t: "Tidak melakukan shalat Ashar berjamaah", p: 10 },
      {
        t: "Melakukan live streaming / bermain game setelah pukul 21.00",
        p: 5,
      },
      { t: "mencukur alis (Sebit alis)", p: 5 },
      { t: "Terlambat datang latihan", p: 5 },
      { t: "Meninggalkan latihan tanpa izin", p: 10 },
    ],
    Sedang: [
      { t: "Membolos 1 jam pelajaran", p: 25 },
      { t: "Membawa aksesoris berlebihan", p: 25 },
      { t: "Membawa Vape/Rokok elektrik atau semua jenis rokok", p: 40 },
      { t: "Berkata kasar kepada teman", p: 30 },
      { t: "Menghina teman", p: 30 },
      { t: "Body shaming", p: 30 },
      { t: "Mencoret meja/kursi", p: 30 },
      { t: "Merusak tanaman", p: 25 },
      { t: "Memalsukan tanda tangan", p: 50 },
      { t: "Menyontek / Berlaku curang", p: 40 },
      { t: "Membantu teman menyontek", p: 40 },
      { t: "Mengganggu ketertiban kelas", p: 30 },
      { t: "Mengunggah konten sekolah tanpa izin", p: 40 },
      { t: "Tidak mengikuti pengajian Hari Kamis", p: 45 },
      { t: "Memisahkan diri atau membuat kelompok kecil", p: 30 },
      { t: "Mengikuti event/turnamen tanpa izin pelatih", p: 40 },
    ],
    Berat: [
      { t: "Bullying verbal", p: 75 },
      { t: "Bullying fisik", p: 100 },
      { t: "Cyberbullying", p: 100 },
      { t: "Perpeloncoan", p: 100 },
      { t: "Pemalakan", p: 100 },
      { t: "Perkelahian", p: 100 },
      { t: "Membawa senjata tajam/berbahaya", p: 150 },
      { t: "Mengancam guru/karyawan", p: 150 },
      { t: "Mengancam teman", p: 100 },
      { t: "Mencuri", p: 200 },
      {
        t: "Merusak fasilitas secara sengaja (termasuk denda penggantian)",
        p: 100,
      },
      { t: "Pornografi", p: 200 },
      { t: "Pelecehan seksual", p: 200 },
      { t: "Minum Minuman keras", p: 200 },
      { t: "Narkoba (rehabilitasi)", p: 200 },
      { t: "Judi", p: 200 },
      { t: "Pemalsuan dokumen sekolah", p: 200 },
      { t: "Provokasi/hasutan yang menyebabkan kerusuhan", p: 200 },
      { t: "Menyebarkan berita bohong yang merugikan sekolah", p: 100 },
      { t: "Tindakan yang mencemarkan nama baik sekolah", p: 100 },
      { t: "Tawuran", p: 150 },
      { t: "Sengaja menolak / meninggalkan kewajiban Shalat fardhu", p: 150 },
      {
        t: "Mengonsumsi makanan/minuman yang dilarang (dingin, pedas, asam)",
        p: 75,
      },
      { t: "Merokok di lingkungan latihan atau sekolah", p: 75 },
      { t: "Tidak mengenakan kerudung bagi siswi putri", p: 75 },
    ],
  },
};

// ==========================================
// PENGATURAN NAVIGASI LAYAR & HTML5 HISTORY API
// ==========================================
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
    loadMasterSiswaFromCloud(() => window.renderGlobalLeaderboard());
  } else if (screenId === "entry") {
    $("entryCard").classList.remove("hidden");
  } else if (screenId === "admin") {
    $("adminCard").classList.remove("hidden");
    window.handleAdminActionTypeChange();
  }

  updateFabLaporanBug();

  if (pushHistory) {
    window.history.pushState({ screen: screenId }, "", `#${screenId}`);
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
    showGamePreloader("LOADING KODE ETIK & TATIB...", (done) => {
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
    "Yakin ingin keluar dari akun ini? Kamu perlu login lagi dengan NISN dan PIN untuk masuk kembali.",
    "🚪 KONFIRMASI KELUAR",
  );
  if (!ok) return;

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

window.logout = function () {
  cleanupAdminListeners();
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

  const filtered =
    filter === "SEMUA"
      ? [...masterDataSiswa]
      : masterDataSiswa.filter((s) => s.kelas === filter);
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
  const kategori = $("laporanBugKategori") ? $("laporanBugKategori").value : "bug";

  let pelaporNama = "Anonim";
  let pelaporPeran = "Tidak diketahui";
  let pelaporId = "-";

  if (currentUser) {
    pelaporNama = currentUser.nama || "Guru/Admin";
    pelaporPeran = currentUser.role || "Guru/Admin";
    pelaporId = currentUser.email || pelaporNama;
  } else if (currentNisnSiswa) {
    const s = masterDataSiswa.find((x) => x.nisn === currentNisnSiswa);
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
      query(collection(window.db, "laporan_bug"), where("status", "==", "baru")),
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
        const teacherDocSnap = await getDoc(doc(window.db, "teachers", emailLogin));
        if (teacherDocSnap.exists()) userData = teacherDocSnap.data();
      } catch (e) {
        console.warn("Profil guru tidak terbaca, pakai peran default:", e);
      }

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
        showScreen("admin");
        window.switchAdminTab("rekap");
        cekBadgeLaporanBugAwal();
      }, 400);
    });
  } else {
    $("txtNamaGuru").innerText = user.nama;
    $("txtRoleGuru").innerText = "Jabatan: " + user.role;
    loadMasterSiswaFromCloud(() => {
      if (doneCallback) doneCallback();
      showScreen("entry");
      initFormEntry();
      window.switchTeacherTab("poin");
      loadTugasAktif();
    });
  }
}

window.switchTeacherTab = function (tab) {
  const tabPoin = $("teacherTabPoin");
  const tabPosting = $("teacherTabPosting");
  const btnPoin = $("navBtnInputPoin");
  const btnPosting = $("navBtnPostTugas");

  tabPoin.classList.add("hidden");
  tabPosting.classList.add("hidden");

  btnPoin.style.background = "transparent";
  btnPoin.className = "btn-outline";
  btnPosting.style.background = "transparent";
  btnPosting.className = "btn-outline";

  if (tab === "poin") {
    tabPoin.classList.remove("hidden");
    btnPoin.style.background = "#1e3c72";
    btnPoin.className = "";
  } else if (tab === "posting") {
    tabPosting.classList.remove("hidden");
    btnPosting.style.background = "#1e3c72";
    btnPosting.className = "";
    loadTugasAktif();
  }
};

// ==========================================
// FORM INPUT POIN (GURU)
// ==========================================
function initFormEntry() {
  const now = new Date();
  const namaHari = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jum'at", "Sabtu"];
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
      (item) => `<label class="option-item"><input type="radio" name="opsiPoin" value="${escapeHtml(item.t)}" data-poin="${item.p}" required>
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
  const selectedRadio = document.querySelector('input[name="opsiPoin"]:checked');
  if (!selectedRadio)
    return window.customAlert("Pilih detail jenis kejadian terlebih dahulu!");

  const daftar = getSelectedSiswa();
  if (daftar.length === 0)
    return window.customAlert(
      isMultiMode ? "Pilih minimal 1 siswa!" : "Pilih nama siswa terlebih dahulu!",
    );

  const kat = $("kategori").value;
  const poin = selectedRadio.getAttribute("data-poin");
  const efekText =
    kat === "TugasHarian"
      ? `+${poin} Poin Harian (Leaderboard)`
      : kat === "Prestasi"
        ? `+${poin} Prestasi`
        : `-${poin} Pelanggaran`;

  $("modalDetailContent").innerHTML = `
  <strong>Target Siswa (${daftar.length}):</strong><br>${escapeHtml(daftar.map((s) => s.nama).join(", "))}<br><br>
  <strong>Aktivitas:</strong> ${escapeHtml(selectedRadio.value)}<br>
  <strong>Dampak:</strong> ${escapeHtml(efekText)}<br>
  <strong>Guru Pelapor:</strong> ${escapeHtml($("txtNamaGuru").innerText)}
  `;
  $("modalKonfirmasi").classList.remove("hidden");
};

window.tutupModal = function () {
  $("modalKonfirmasi").classList.add("hidden");
};

// Perhitungan dampak poin (HP, shield, total) - fungsi murni
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
    if (sisa > 0) shield += sisa;
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
  const selectedRadio = document.querySelector('input[name="opsiPoin"]:checked');
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
          tx.update(ref, {
            ...baru,
            riwayat: tambahRiwayat(data.riwayat, entry),
          });
        });
        berhasil++;
      } catch (err) {
        console.error("Gagal menyimpan poin untuk", s.nama, err);
        gagal.push(s.nama);
      }
    }

    await refreshMasterSiswa();
    done();

    if (gagal.length === 0) {
      window.customAlert("✅ Poin Berhasil Disimpan & Disinkronkan ke Leaderboard!");
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
  ["Rekap", "Kontrol", "Akademik", "Cetak", "Chat", "Laporan"].forEach((n) => {
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
  }

  // Hentikan pemantauan chat saat keluar dari tab chat
  if (tabName !== "chat") cleanupAdminListeners();

  if (tabName === "rekap") window.renderTabelRekap();
  if (tabName === "kontrol") window.handleAdminActionTypeChange();
  if (tabName === "chat") window.loadAdminChatRooms();
  if (tabName === "akademik") {
    window.muatDaftarAlumni();
    window.muatPeriodeAktifAdmin();
    window.muatRiwayatTransisiUntukBatal();
  }
  if (tabName === "laporan") window.loadLaporanBugAdmin();
};

let statistikChartInstance = null;

window.renderTabelRekap = function () {
  const filter = $("filterKelasRekap").value;
  const tbody = $("tabelRekapBody");
  const data =
    filter === "SEMUA"
      ? masterDataSiswa
      : masterDataSiswa.filter((s) => s.kelas === filter);

  tbody.innerHTML = data
    .map((s) => {
      const hp = s.hp !== undefined ? s.hp : 200;
      let badge = `<span style="color:#2ecc71; font-weight:bold">${hp} HP</span>`;
      if (s.shield > 0)
        badge += ` <span style="color:#3498db; font-size:9px">+${s.shield} Shld</span>`;
      const hukum = getStatusPembinaan(s.totalPelanggaran || 0);
      return `<tr>
      <td><strong>${escapeHtml(s.nama)}</strong></td>
      <td>${escapeHtml(s.kelas)}</td>
      <td>${badge}</td>
      <td>
        <span style="font-size: 9px; padding: 3px 6px; background: ${hukum.color}; color: #fff; border-radius: 4px; font-weight: bold;">${s.totalPelanggaran || 0} Pts</span>
      </td>
      </tr>`;
    })
    .join("");

  if (typeof Chart === "undefined") {
    console.warn("Chart.js belum termuat, grafik dilewati.");
    return;
  }

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
        {
          label: "Total Pelanggaran",
          data: pelanggaranPerKelas,
          backgroundColor: "#e74c3c",
          borderRadius: 6,
        },
        {
          label: "Total Prestasi",
          data: prestasiPerKelas,
          backgroundColor: "#2ecc71",
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "top", labels: { font: { size: 10 } } },
      },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 10 } } },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  });
};

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

// Update banyak siswa sekaligus dengan batch (jauh lebih cepat & atomik per chunk)
async function batchUpdateSiswa(targetList, buildUpdate) {
  const { doc, getDoc, writeBatch } = window.fbFirestore;
  const valid = targetList.filter((s) => s.nisn);
  for (let i = 0; i < valid.length; i += BATCH_CHUNK) {
    const chunk = valid.slice(i, i + BATCH_CHUNK);
    const snaps = await Promise.all(
      chunk.map((s) => getDoc(doc(window.db, "siswa", s.nisn))),
    );
    const batch = writeBatch(window.db);
    snaps.forEach((snap) => {
      if (!snap.exists()) return;
      const upd = buildUpdate(snap.data());
      // buildUpdate boleh mengembalikan null/undefined/{} untuk melewati
      // siswa ini (misalnya karena sudah tidak memenuhi syarat lagi)
      if (upd && Object.keys(upd).length > 0) batch.update(snap.ref, upd);
    });
    await batch.commit();
  }
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

  if (!kelasDefault) return window.customAlert("Pilih kelas tujuan untuk siswa baru.");

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
      window.customAlert("Gagal menambahkan siswa baru. Periksa koneksi internet.");
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

// Entri arsip TERBARU milik seorang siswa (dipakai untuk memastikan undo
// hanya menimpa periode yang paling akhir, bukan periode lama yang sudah
// "ketiban" perubahan lebih baru).
function periodeIdTerbaru(d) {
  const arsip = d.arsipRiwayat || {};
  let terbaru = null;
  let waktuTerbaru = -1;
  Object.entries(arsip).forEach(([id, entry]) => {
    if ((entry.diarsipkanPada || 0) > waktuTerbaru) {
      waktuTerbaru = entry.diarsipkanPada || 0;
      terbaru = id;
    }
  });
  return terbaru;
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

// 1) Ganti Semester Baru: arsipkan riwayat berjalan, reset HP/Shield/Poin harian,
//    kelas TIDAK berubah.
async function jalankanGantiSemester(label, catatan) {
  const periodeId = `p${Date.now()}`;
  const ts = localDateTimeStr();
  const targets = masterDataSiswa.filter((s) => s.statusAkun !== "lulus");

  await batchUpdateSiswa(targets, (d) => ({
    arsipRiwayat: {
      ...(d.arsipRiwayat || {}),
      [periodeId]: buildArsipEntry(d, label),
    },
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
      arsipRiwayat: {
        ...(d.arsipRiwayat || {}),
        [periodeId]: buildArsipEntry(d, label),
      },
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
      window.customAlert("✅ Keterangan tahun ajaran tersimpan dan langsung tampil di Profil siswa.");
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
      if ($("inputTahunAjaran")) $("inputTahunAjaran").value = d.tahunAjaran || "";
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
      window.customAlert(`✅ ${checked.length} siswa dikembalikan menjadi Aktif.`);
      $("catatanBatalKelulusan").value = "";
    } catch (err) {
      done();
      console.error("Gagal batalkan kelulusan:", err);
      window.customAlert("Gagal mengembalikan status. Periksa koneksi internet.");
    }
  });
};


window.jalankanGantiSemesterUI = async function () {
  const label = $("labelGantiSemester").value.trim();
  const catatan = $("catatanGantiSemester").value.trim();
  if (!label)
    return window.customAlert("Isi nama semester yang sedang berjalan (akan jadi label arsip).");
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
      window.customAlert("Gagal menjalankan Ganti Semester. Periksa koneksi internet.");
    }
  });
};

window.jalankanKenaikanKelasUI = async function () {
  const label = $("labelKenaikanKelas").value.trim();
  const catatan = $("catatanKenaikanKelas").value.trim();
  if (!label)
    return window.customAlert("Isi nama semester/tahun ajaran yang diarsipkan.");
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
      window.customAlert("Gagal menjalankan Kenaikan Kelas. Periksa koneksi internet.");
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
    const { collection, query, where, orderBy, limit, getDocs } = window.fbFirestore;
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
        const nama = r.aksi === "GANTI_SEMESTER" ? "Ganti Semester" : "Kenaikan Kelas";
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

  const eligible = masterDataSiswa.filter(
    (s) => s.arsipRiwayat && s.arsipRiwayat[run.periodeId],
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
    listEl.innerHTML = '<div class="empty-note">Tidak ada siswa untuk proses ini.</div>';
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

function buildUndoTransisiUpdate(d, periodeId) {
  const arsip = { ...(d.arsipRiwayat || {}) };
  const entry = arsip[periodeId];
  if (!entry) return null;
  delete arsip[periodeId];
  return {
    arsipRiwayat: arsip,
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

  const nama = run.aksi === "GANTI_SEMESTER" ? "Ganti Semester" : "Kenaikan Kelas";
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

      await batchUpdateSiswa(targets, (d) => {
        // Cek ulang dari data server TERBARU (bukan dari tampilan/cache
        // browser): hanya batalkan kalau periode ini memang masih arsip
        // paling akhir milik siswa ini, supaya tidak menimpa perubahan
        // lebih baru yang mungkin terjadi sejak daftar ini ditampilkan.
        if (periodeIdTerbaru(d) !== run.periodeId) {
          dilewati++;
          return {};
        }
        const upd = buildUndoTransisiUpdate(d, run.periodeId);
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
          (dilewati ? ` ${dilewati} siswa dilewati karena sudah ada perubahan lebih baru.` : ""),
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
    return window.customAlert("Tidak ada siswa kelas 12 SMK yang berstatus aktif.");

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
      window.customAlert(`🎓 ${jumlah} siswa berhasil diluluskan menjadi Alumni.`);
      $("catatanKelulusan").value = "";
    } catch (err) {
      done();
      console.error("Gagal proses kelulusan:", err);
      window.customAlert("Gagal menjalankan Proses Kelulusan. Periksa koneksi internet.");
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

window.lihatArsipKelas = function () {
  const data = window.currentStudentDataCache;
  const arsip = (data && data.arsipRiwayat) || {};
  const items = Object.values(arsip).sort(
    (a, b) => (b.diarsipkanPada || 0) - (a.diarsipkanPada || 0),
  );

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

function tampilkanTranskripAlumni(siswa, nisn) {
  isAlumniSession = true;
  setSiswaAppMode(false);
  $("hasilPoinSiswa").classList.add("hidden");
  $("boxInputNisnSiswa").classList.add("hidden");
  $("alumniTranscriptView").classList.remove("hidden");

  const arsipList = Object.values(siswa.arsipRiwayat || {}).sort(
    (a, b) => (a.diarsipkanPada || 0) - (b.diarsipkanPada || 0),
  );
  const periodeAkhir = {
    label: `${siswa.kelas || siswa.kelasAktif || "Kelas Akhir"} (Tahun Terakhir)`,
    kelas: siswa.kelas || siswa.kelasAktif || "-",
    totalPrestasi: siswa.totalPrestasi || 0,
    totalPelanggaran: siswa.totalPelanggaran || 0,
    riwayat: siswa.riwayat || [],
  };
  const semuaPeriode = [...arsipList, periodeAkhir];

  const totalPrestasi = semuaPeriode.reduce((s, p) => s + (p.totalPrestasi || 0), 0);
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
  localStorage.setItem("activeUserExpiry", String(Date.now() + SESSION_SISWA_MS));
  currentNisnSiswa = nisn;
  window.currentStudentNisn = nisn;
  window.currentStudentDataCache = siswa;
  tampilkanTranskripAlumni(siswa, nisn);
  updateFabLaporanBug();
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

  // Tindakan luas / merusak data wajib dikonfirmasi ulang
  if (act.includes("GLOBAL") || act.includes("FULL")) {
    const ok = await window.customConfirm(
      "Tindakan ini berdampak luas dan TIDAK DAPAT DIBATALKAN.\nLanjutkan eksekusi?",
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
    } catch (err) {
      done();
      console.error("Gagal menjalankan aksi Admin:", err);
      window.customAlert("Gagal mengeksekusi perintah ke database Firestore.");
    }
  });
};

// ==========================================
// PAPAN QUEST
// ==========================================
window.renderQuestUI = function (tipe) {
  const btnPres = $("tabQuestPrestasi");
  const btnPelang = $("tabQuestPelanggaran");
  const container = $("questContainerUI");

  if (tipe === "prestasi") {
    btnPres.style.background = "#3498db";
    btnPres.style.color = "white";
    btnPelang.className = "btn-outline";
    btnPelang.style.background = "transparent";
    btnPelang.style.color = "#e74c3c";

    let html = `<div class="accordion">
              <div class="accordion-header" onclick="toggleAccordion(this)"><span>⭐ Daftar Penghargaan (Reward)</span><span>▼</span></div>
              <div class="accordion-body active">`;
    dataPilihan.Prestasi.forEach((item) => {
      html += `<div class="q-item"><span>${escapeHtml(item.t)}</span> <span class="badge-shield">+${item.p}</span></div>`;
    });
    html += `</div></div>`;
    container.innerHTML = html;
  } else {
    btnPelang.style.background = "#e74c3c";
    btnPelang.style.color = "white";
    btnPres.className = "btn-outline";
    btnPres.style.background = "transparent";
    btnPres.style.color = "#3498db";

    let html = "";
    ["Ringan", "Sedang", "Berat"].forEach((k, idx) => {
      html += `<div class="accordion">
               <div class="accordion-header" onclick="toggleAccordion(this)"><span>⚠️ Pelanggaran ${k}</span><span>▼</span></div>
               <div class="accordion-body ${idx === 0 ? "active" : ""}">`;
      dataPilihan.Pelanggaran[k].forEach((item) => {
        html += `<div class="q-item"><span>${escapeHtml(item.t)}</span> <span class="badge-hp">-${item.p}</span></div>`;
      });
      html += `</div></div>`;
    });
    container.innerHTML = html;
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
  selectEl.innerHTML = html || '<option value="">Tidak ada siswa ditemukan</option>';
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

function buatCropper(imageElement) {
  if (cropperInstance) cropperInstance.destroy();
  cropperInstance = new Cropper(imageElement, {
    aspectRatio: 1,
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
    window.customAlert("⚠️ Format file harus berupa gambar (JPG, PNG, atau WEBP)!");
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
    window.customAlert("🎉 Berhasil! Foto profil kamu telah dipaskan dan diperbarui.");
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
window.handleWaliKelasPilihKelas = function () {
  const kelas = $("waliKelasSelectKelas").value;
  const selSiswa = $("waliKelasSelectSiswa");

  if (!kelas) {
    selSiswa.innerHTML =
      '<option value="">-- Pilih siswa setelah pilih kelas --</option>';
    return;
  }

  let siswaHtml = '<option value="">-- Pilih Siswa --</option>';
  masterDataSiswa
    .filter((s) => s.kelas === kelas)
    .sort((a, b) => String(a.nama).localeCompare(String(b.nama)))
    .forEach((s) => {
      siswaHtml += `<option value="${escapeHtml(s.nisn)}">${escapeHtml(s.nama)} (NISN: ${escapeHtml(s.nisn)})</option>`;
    });
  selSiswa.innerHTML = siswaHtml;
};

window.eksekusiResetFotoOlehWaliKelas = async function () {
  const nisnTarget = $("waliKelasSelectSiswa").value;

  if (!nisnTarget) {
    return window.customAlert(
      "⚠️ Silakan pilih kelas dan nama siswa terlebih dahulu!",
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

      $("waliKelasSelectKelas").value = "";
      $("waliKelasSelectSiswa").innerHTML =
        '<option value="">-- Pilih siswa setelah pilih kelas --</option>';
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
  globalOnlineDocs = {};
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

  countEl.textContent = `${online.length} siswa online`;

  const MAX = 30;
  let html = online
    .slice(0, MAX)
    .map((nisn) => {
      const s = masterDataSiswa.find((x) => x.nisn === nisn);
      const nama = nisn === me ? "Kamu" : namaDariNisn(nisn);
      return `<span class="online-chip ${nisn === me ? "me" : ""}"><img src="${escapeHtml(avatarFor(s))}" alt="" onerror="${AVATAR_ONERROR}"><span class="nm">${escapeHtml(nama)}</span></span>`;
    })
    .join("");
  if (online.length > MAX) {
    html += `<span class="online-chip"><span class="nm">+${online.length - MAX} lainnya</span></span>`;
  }
  listEl.innerHTML = html;
}

function startGlobalOnlineListener() {
  stopGlobalOnlineListener();
  try {
    const { collection, query, where, onSnapshot } = window.fbFirestore;
    const q = query(
      collection(window.db, "status"),
      where("lastActive", ">", Date.now() - ONLINE_THRESHOLD_MS),
    );
    globalOnlineUnsub = onSnapshot(
      q,
      (snap) => {
        globalOnlineDocs = {};
        snap.forEach((d) => {
          globalOnlineDocs[d.id] = d.data();
        });
        renderGlobalOnline();
      },
      (err) => console.error("Gagal memuat siswa online:", err),
    );
    // Evaluasi ulang berkala: siswa yang berhenti heartbeat otomatis hilang
    globalOnlineTimer = setInterval(renderGlobalOnline, 30000);
  } catch (e) {
    console.error("Gagal memulai pemantauan siswa online:", e);
  }
  renderGlobalOnline();
}

// Hapus pesan Global Chat yang sudah lebih dari 7 hari, samakan dengan chat pribadi.
// Dipanggil sekali tiap siswa login (bukan tiap buka tab), jadi tidak boros kuota.
async function bersihkanGlobalChatKedaluwarsa() {
  const { collection, query, where, getDocs } = window.fbFirestore;
  const tujuhHariLalu = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const expiredSnap = await getDocs(
    query(collection(window.db, "global_chat"), where("timestamp", "<", tujuhHariLalu)),
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
            (m) => m.nisn !== siswaAktif.nisn && (m.timestamp || 0) > globalSeenTs,
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
    const { collection, query, limit, orderBy, onSnapshot } = window.fbFirestore;
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
      window.customAlert("✅ Seluruh isi Global Chat berhasil dibersihkan oleh Admin!");
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

  const [authUser] = await Promise.all([
    authReady,
    new Promise((res) => loadMasterSiswaFromCloud(res)),
  ]);

  loadTugasAktif();

  // Pulihkan sesi guru/admin HANYA jika sesi Firebase Auth masih valid
  const savedUser = localStorage.getItem("loggedInUser");
  if (savedUser) {
    if (authUser) {
      try {
        const userObj = JSON.parse(savedUser);
        currentUser = userObj;
        currentRole = userObj.role;
        if (userObj.role === "Super Admin") {
          $("txtNamaAdmin").innerText = userObj.nama;
          showScreen("admin");
          window.switchAdminTab("rekap");
          cekBadgeLaporanBugAwal();
        } else {
          $("txtNamaGuru").innerText = userObj.nama;
          $("txtRoleGuru").innerText = "Jabatan: " + userObj.role;
          showScreen("entry");
          initFormEntry();
          window.switchTeacherTab("poin");
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
