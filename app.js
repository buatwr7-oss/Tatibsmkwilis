import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
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
};
console.log("🔥 Firebase Firestore & Auth Terhubung ke Tatib SMK Wiraguna!");

// ==========================================
// CUSTOM MODAL (CUSTOM ALERT & CONFIRM)
// ==========================================
function injectCustomModalStyles() {
  if (document.getElementById("customModalStyles")) return;
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
      font-size: 12px; color: #cbd5e1; line-height: 1.5; margin-bottom: 20px; word-break: break-word;
    }
    #customPopupButtons {
      display: flex; gap: 10px; justify-content: center;
    }
    .custom-popup-btn {
      padding: 8px 18px; border-radius: 8px; font-size: 11px; font-weight: bold; cursor: pointer; border: none; transition: transform 0.1s;
    }
    .custom-popup-btn:active { transform: scale(0.95); }
    #customPopupBtnOk {
      background: linear-gradient(135deg, #f1c40f, #d4ac0d); color: #111; box-shadow: 0 4px 10px rgba(241,196,15,0.4);
    }
    #customPopupBtnCancel {
      background: #334155; color: #cbd5e1;
    }
    @keyframes fadeInModal { from { opacity: 0; } to { opacity: 1; } }
    @keyframes scaleInModal { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  `;
  document.head.appendChild(style);
}

window.customAlert = function (message, title = "INFORMASI SISTEM") {
  return new Promise((resolve) => {
    injectCustomModalStyles();
    const existing = document.getElementById("customPopupOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "customPopupOverlay";
    overlay.innerHTML = `
      <div id="customPopupBox">
        <div id="customPopupTitle">${title}</div>
        <div id="customPopupMessage">${message}</div>
        <div id="customPopupButtons">
          <button id="customPopupBtnOk" class="custom-popup-btn">OK</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("customPopupBtnOk").onclick = () => {
      overlay.remove();
      resolve(true);
    };
  });
};

window.customConfirm = function (message, title = "KONFIRMASI TINDAKAN") {
  return new Promise((resolve) => {
    injectCustomModalStyles();
    const existing = document.getElementById("customPopupOverlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "customPopupOverlay";
    overlay.innerHTML = `
      <div id="customPopupBox">
        <div id="customPopupTitle">${title}</div>
        <div id="customPopupMessage">${message}</div>
        <div id="customPopupButtons">
          <button id="customPopupBtnCancel" class="custom-popup-btn">Batal</button>
          <button id="customPopupBtnOk" class="custom-popup-btn">Ya, Lanjutkan</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById("customPopupBtnOk").onclick = () => {
      overlay.remove();
      resolve(true);
    };
    document.getElementById("customPopupBtnCancel").onclick = () => {
      overlay.remove();
      resolve(false);
    };
  });
};

let currentRole = "";
let isMultiMode = true;

// ==========================================
// FUNGSI PEMBERSIH TEKS DARI INJEKSI HTML (ESCAPE)
// ==========================================
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
    if (typeof window.bukaModalGantiFoto === "function") {
      window.bukaModalGantiFoto();
    }
  } else {
    if (typeof window.bukaPreviewFoto === "function") {
      window.bukaPreviewFoto();
    }
  }
};

// ==========================================
// SISTEM ONLINE STATUS (BERBASIS FIRESTORE)
// ==========================================
let heartbeatInterval = null;

function initOnlineStatusEngine() {
  const myNisn = getMyNisn();
  if (!myNisn) return;

  const { doc, setDoc } = window.fbFirestore;
  const userStatusRef = doc(window.db, "status", myNisn);

  const updatePresence = async (state) => {
    try {
      await setDoc(
        userStatusRef,
        {
          state: state,
          lastActive: Date.now(),
        },
        { merge: true },
      );
    } catch (e) {
      console.error("Gagal update status online:", e);
    }
  };

  updatePresence("online");

  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    updatePresence("online");
  }, 10000);

  window.addEventListener("beforeunload", () => {
    updatePresence("offline");
  });
}

let friendStatusListeners = {};

function listenToFriendStatus(friendNisn, callback) {
  if (friendStatusListeners[friendNisn]) {
    friendStatusListeners[friendNisn]();
  }

  const { doc, onSnapshot } = window.fbFirestore;
  const friendStatusRef = doc(window.db, "status", friendNisn);

  friendStatusListeners[friendNisn] = onSnapshot(friendStatusRef, (docSnap) => {
    if (!docSnap.exists()) {
      callback({ state: "offline", text: "Offline", isOnline: false });
      return;
    }

    const data = docSnap.data();
    const timeElapsed = Date.now() - (data.lastActive || 0);

    if (data.state === "online" && timeElapsed < 20000) {
      callback({ state: "online", text: "Online", isOnline: true });
    } else {
      callback({
        state: "offline",
        text: formatLastActive(data.lastActive),
        isOnline: false,
      });
    }
  });
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

// ==========================================
// SISTEM PERTEMANAN & SQUAD (CLOUD FIRESTORE)
// ==========================================
function getMyNisn() {
  const inputVal = document.getElementById("nisnSiswaInput")
    ? document.getElementById("nisnSiswaInput").value.trim()
    : "";
  return inputVal || localStorage.getItem("activeUser") || "";
}

let activeStudentDocListener = null;

function initStudentRealtimeListener(nisn) {
  if (activeStudentDocListener) activeStudentDocListener();
  try {
    const { doc, onSnapshot } = window.fbFirestore;
    activeStudentDocListener = onSnapshot(
      doc(window.db, "siswa", nisn),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          window.currentStudentDataCache = data;
          window.currentStudentNisn = nisn;
          renderDaftarTeman(data.friends || [], data.requests || []);
        }
      },
    );
  } catch (e) {
    console.error("Gagal listen student doc:", e);
  }
}

window.tambahTeman = async function () {
  const targetNisn = document.getElementById("inputNisnTeman").value.trim();
  const myNisn = getMyNisn();
  if (!targetNisn)
    return window.customAlert("Ketik NISN teman yang mau di-invite!");
  if (targetNisn === myNisn)
    return window.customAlert("Tidak bisa mengundang diri sendiri ke Squad!");

  const temanObj = masterDataSiswa.find((s) => s.nisn === targetNisn);
  if (!temanObj)
    return window.customAlert(
      "NISN teman tidak ditemukan di database sekolah!",
    );

  if (
    window.currentStudentDataCache &&
    window.currentStudentDataCache.friends &&
    window.currentStudentDataCache.friends.includes(targetNisn)
  ) {
    return window.customAlert("Teman ini sudah ada di daftar Squad kamu!");
  }

  try {
    const { doc, getDoc, updateDoc, arrayUnion } = window.fbFirestore;
    const targetRef = doc(window.db, "siswa", targetNisn);
    const targetSnap = await getDoc(targetRef);

    if (!targetSnap.exists())
      return window.customAlert("Data siswa tujuan tidak ditemukan di cloud.");
    const targetData = targetSnap.data();
    const targetRequests = targetData.requests || [];

    if (targetRequests.includes(myNisn)) {
      return window.customAlert(
        "Undangan ke teman ini sudah dikirim dan sedang menunggu konfirmasi!",
      );
    }

    await updateDoc(targetRef, {
      requests: arrayUnion(myNisn),
    });

    document.getElementById("inputNisnTeman").value = "";
    window.customAlert(
      `📨 Undangan Squad berhasil dikirim ke ${temanObj.nama}! Menunggu konfirmasi.`,
    );
  } catch (err) {
    console.error("Gagal kirim undangan:", err);
    window.customAlert("Gagal mengirim undangan. Periksa koneksi internet.");
  }
};

window.terimaUndangan = async function (senderNisn) {
  const myNisn = getMyNisn();
  try {
    const { doc, updateDoc, arrayUnion, arrayRemove } = window.fbFirestore;
    const myRef = doc(window.db, "siswa", myNisn);
    const senderRef = doc(window.db, "siswa", senderNisn);

    await updateDoc(myRef, {
      requests: arrayRemove(senderNisn),
      friends: arrayUnion(senderNisn),
    });

    await updateDoc(senderRef, {
      friends: arrayUnion(myNisn),
    });

    window.customAlert(
      "✅ Undangan diterima! Kalian sekarang resmi berteman di Squad.",
    );
  } catch (err) {
    console.error("Gagal menerima undangan:", err);
    window.customAlert("Gagal memproses penerimaan undangan.");
  }
};

window.tolakUndangan = async function (senderNisn) {
  const myNisn = getMyNisn();
  try {
    const { doc, updateDoc, arrayRemove } = window.fbFirestore;
    await updateDoc(doc(window.db, "siswa", myNisn), {
      requests: arrayRemove(senderNisn),
    });
  } catch (err) {
    console.error("Gagal menolak undangan:", err);
  }
};

window.hapusTeman = async function (targetNisn) {
  const yakin = await window.customConfirm(
    "Yakin ingin menghapus teman ini dari Squad?",
  );
  if (!yakin) return;
  const myNisn = getMyNisn();
  try {
    const { doc, updateDoc, arrayRemove } = window.fbFirestore;
    const myRef = doc(window.db, "siswa", myNisn);
    const targetRef = doc(window.db, "siswa", targetNisn);

    await updateDoc(myRef, { friends: arrayRemove(targetNisn) });
    await updateDoc(targetRef, { friends: arrayRemove(myNisn) });

    window.customAlert("Teman berhasil dihapus dari Squad.");
  } catch (err) {
    console.error("Gagal menghapus teman:", err);
    window.customAlert("Gagal menghapus teman.");
  }
};

let friendListeners = {};

function renderDaftarTeman(friendsArray, requestsArray) {
  if (!friendsArray && window.currentStudentDataCache) {
    friendsArray = window.currentStudentDataCache.friends || [];
  }
  if (!requestsArray && window.currentStudentDataCache) {
    requestsArray = window.currentStudentDataCache.requests || [];
  }
  friendsArray = friendsArray || [];
  requestsArray = requestsArray || [];

  Object.values(friendListeners).forEach((unsub) => unsub());
  friendListeners = {};

  const container = document.getElementById("listTemanContainer");
  const containerUndangan = document.getElementById("containerUndanganMasuk");
  const counterTxt = document.getElementById("jumlahTemanTxt");
  if (!container) return;

  if (containerUndangan) {
    containerUndangan.innerHTML = "";
    if (requestsArray.length > 0) {
      let reqHtml = `<div style="font-size: 10px; color: #f1c40f; font-weight: bold; margin-bottom: 4px;">📩 Undangan Masuk (${requestsArray.length}):</div>`;
      requestsArray.forEach((senderNisn) => {
        const sender = masterDataSiswa.find((s) => s.nisn === senderNisn);
        const senderName = sender ? sender.nama : `NISN: ${senderNisn}`;
        reqHtml += `
        <div style="background: rgba(241, 196, 15, 0.1); border: 1px solid #f1c40f; border-radius: 6px; padding: 6px 8px; display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px;">
          <span style="font-size: 10px; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><strong>${senderName}</strong> mengundangmu</span>
          <div style="display: flex; gap: 4px; flex-shrink: 0;">
            <button type="button" onclick="terimaUndangan('${senderNisn}')" style="margin-top: 0; padding: 3px 6px; font-size: 8.5px; background: #2ecc71; color: #fff; width: auto; border-radius: 4px; box-shadow: none;">Terima</button>
            <button type="button" onclick="tolakUndangan('${senderNisn}')" style="margin-top: 0; padding: 3px 6px; font-size: 8.5px; background: #e74c3c; color: #fff; width: auto; border-radius: 4px; box-shadow: none;">Tolak</button>
          </div>
        </div>
        `;
      });
      containerUndangan.innerHTML = reqHtml;
    }
  }

  counterTxt.innerText = `${friendsArray.length} Teman`;

  if (friendsArray.length === 0) {
    container.innerHTML = `<div style="font-size: 10px; color: #95a5a6; text-align: center; padding: 10px;">Belum ada teman di Squad. Yuk invite temanmu!</div>`;
    return;
  }

  let friendsHtml = "";

  friendsArray.forEach((nisn) => {
    const teman = masterDataSiswa.find((s) => s.nisn === nisn);
    const namaTeman = teman ? teman.nama : `NISN: ${nisn}`;
    const kelasTeman = teman ? teman.kelas : "-";
    const avatarFile =
      teman && teman.fotoUrl
        ? teman.fotoUrl
        : teman && teman.jk && teman.jk.toUpperCase() === "P"
          ? "assets/foto_siswa/avatar_p.webp"
          : "assets/foto_siswa/avatar_l.webp";

    friendsHtml += `
    <div style="background: #111823; border: 1px solid #34495e; border-radius: 8px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 8px; overflow: hidden; flex: 1;">
        <div style="width: 32px; height: 32px; border-radius: 6px; overflow: hidden; background: #2c3e50; flex-shrink: 0; border: 1px solid #f1c40f;">
          <img src="${avatarFile}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='assets/foto_siswa/avatar.webp'">
        </div>
        <div style="overflow: hidden; flex: 1;">
          <div style="display: flex; align-items: center; gap: 5px; overflow: hidden;">
            <div style="font-size: 11px; font-weight: bold; color: #f1c40f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${namaTeman}</div>
            <span id="badge_unread_${nisn}" style="display: none; background: #e74c3c; color: #fff; font-size: 8px; font-weight: bold; padding: 1px 5px; border-radius: 10px;">0</span>
          </div>
          <div style="font-size: 9px; color: #bdc3c7;">Kelas: ${kelasTeman}</div>
          <div id="status_container_${nisn}" style="font-size: 8.5px; color: #e74c3c; display: flex; align-items: center; gap: 4px; margin-top: 1px;">
            <span id="status_dot_${nisn}" style="width: 6px; height: 6px; border-radius: 50%; background: #e74c3c; display: inline-block;"></span>
            <span id="status_txt_${nisn}">Memuat status...</span>
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 4px; flex-shrink: 0;">
        <button type="button" onclick="bukaChatTeman('${nisn}', '${namaTeman}')" style="margin-top: 0; padding: 4px 8px; font-size: 9px; background: #3498db; color: #fff; width: auto; border-radius: 6px; border: none; cursor: pointer; box-shadow: none;">Chat 💬</button>
        <button type="button" onclick="hapusTeman('${nisn}')" style="margin-top: 0; padding: 4px 8px; font-size: 9px; background: #e74c3c; color: #fff; width: auto; border-radius: 6px; border: none; cursor: pointer; box-shadow: none;">Hapus</button>
      </div>
    </div>
    `;

    listenToFriendStatus(nisn, (statusInfo) => {
      const dotEl = document.getElementById(`status_dot_${nisn}`);
      const txtEl = document.getElementById(`status_txt_${nisn}`);
      if (dotEl && txtEl) {
        dotEl.style.background = statusInfo.isOnline ? "#2ecc71" : "#e74c3c";
        txtEl.style.color = statusInfo.isOnline ? "#2ecc71" : "#bdc3c7";
        txtEl.innerText = statusInfo.text;
      }
    });

    try {
      const { collection, onSnapshot } = window.fbFirestore;
      const roomQuery = collection(
        window.db,
        "chats",
        getChatRoomId(getMyNisn(), nisn),
        "messages",
      );
      const unsub = onSnapshot(roomQuery, (snapshot) => {
        let unreadCount = 0;
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.senderNisn === nisn && data.read === false) {
            unreadCount++;
          }
        });
        const badgeEl = document.getElementById(`badge_unread_${nisn}`);
        if (badgeEl) {
          if (unreadCount > 0) {
            badgeEl.style.display = "inline-block";
            badgeEl.innerText = unreadCount;
          } else {
            badgeEl.style.display = "none";
          }
        }
      });
      friendListeners[nisn] = unsub;
    } catch (e) {
      console.error("Gagal melacak unread:", e);
    }
  });

  container.innerHTML = friendsHtml;
}

// ==========================================
// SISTEM CHAT PERORANGAN (MESSENGER 1-ON-1)
// ==========================================
let activeChatListener = null;
let currentChatTargetNisn = "";

window.bukaChatTeman = function (targetNisn, targetNama) {
  currentChatTargetNisn = targetNisn;
  document.getElementById("chatTitleNama").innerText = targetNama;
  document.getElementById("modalChatTeman").classList.remove("hidden");
  loadPesanChatRealtime(targetNisn);
};

window.tutupChatTeman = function () {
  document.getElementById("modalChatTeman").classList.add("hidden");

  if (activeChatListener) {
    activeChatListener();
    activeChatListener = null;
  }

  if (window.currentStudentDataCache) {
    renderDaftarTeman(
      window.currentStudentDataCache.friends,
      window.currentStudentDataCache.requests,
    );
  } else {
    renderDaftarTeman();
  }
};

function getChatRoomId(nisn1, nisn2) {
  return [nisn1, nisn2].sort().join("_");
}

async function loadPesanChatRealtime(targetNisn) {
  const myNisn = getMyNisn();
  const roomId = getChatRoomId(myNisn, targetNisn);
  const container = document.getElementById("chatMessageContainer");
  container.innerHTML = `<div style="font-size: 11px; color: #888; text-align: center; margin: auto;">Menghubungkan ke ruang aman...</div>`;

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
    const qExpired = query(messagesRef, where("timestamp", "<", tujuhHariLalu));
    const expiredSnap = await getDocs(qExpired);

    expiredSnap.forEach((docSnap) => {
      deleteDoc(doc(window.db, "chats", roomId, "messages", docSnap.id)).catch(
        (err) => console.log("Gagal hapus pesan lama:", err),
      );
    });

    const qValid = query(
      messagesRef,
      where("timestamp", ">=", tujuhHariLalu),
      orderBy("timestamp", "asc"),
    );

    if (activeChatListener) activeChatListener();

    activeChatListener = onSnapshot(qValid, (snapshot) => {
      if (snapshot.empty) {
        container.innerHTML = `<div style="font-size: 11px; color: #888; text-align: center; margin: auto;">Belum ada riwayat pesan. Mulai sapa temanmu sekarang! 👋</div>`;
        return;
      }

      let chatHtml = "";

      snapshot.forEach((docSnap) => {
        const msg = docSnap.data();
        const msgId = docSnap.id;
        const isMe = msg.senderNisn === myNisn;

        if (!isMe && !msg.read) {
          updateDoc(doc(window.db, "chats", roomId, "messages", msgId), {
            read: true,
          });
        }

        let bubbleStyle = isMe
          ? "align-self: flex-end; background: #1e3c72; color: #fff; border-bottom-right-radius: 2px;"
          : "align-self: flex-start; background: #ffffff; color: #333; border: 1.5px solid #e2e8f0; border-bottom-left-radius: 2px;";

        let timeFormatted = msg.time || "";
        let tickStatus = "";

        if (isMe) {
          tickStatus = msg.read
            ? `<span style="color: #38bdf8; margin-left: 4px; font-weight: bold;" title="Sudah Dibaca">✓✓</span>`
            : `<span style="color: #cbd5e1; margin-left: 4px;" title="Terkirim">✓</span>`;
        }

        chatHtml += `
        <div style="${bubbleStyle} padding: 8px 12px; border-radius: 12px; max-width: 75%; font-size: 11px; word-break: break-word; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
          <div>${escapeHtml(msg.text)}</div>
          <div style="font-size: 7.5px; opacity: 0.8; text-align: right; margin-top: 3px; display: flex; justify-content: flex-end; align-items: center; gap: 2px;">
            <span>${timeFormatted}</span>
            ${tickStatus}
          </div>
        </div>
        `;
      });

      container.innerHTML = chatHtml;
      container.scrollTop = container.scrollHeight;
    });
  } catch (err) {
    console.error("Gagal memuat chat:", err);
    container.innerHTML = `<div style="font-size: 11px; color: #e74c3c; text-align: center; margin: auto;">Gagal memuat ruang obrolan.</div>`;
  }
}

window.kirimPesanChat = async function () {
  const inputEl = document.getElementById("inputPesanChat");
  const text = inputEl.value.trim();
  if (!text) return;

  // BATASAN ANTI-SPAM: Maksimal 250 karakter untuk Chat 1-on-1
  if (text.length > 250) {
    return window.customAlert(
      `⚠️ Pesan terlalu panjang (${text.length}/250 karakter). Maksimal 250 karakter per pesan agar terhindar dari spam!`,
    );
  }

  const myNisn = getMyNisn();
  const targetNisn = currentChatTargetNisn;
  const roomId = getChatRoomId(myNisn, targetNisn);

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  try {
    const { collection, addDoc, doc, setDoc } = window.fbFirestore;
    await setDoc(
      doc(window.db, "chats", roomId),
      {
        roomId: roomId,
        nisn1: myNisn,
        nisn2: targetNisn,
        lastUpdated: Date.now(),
      },
      { merge: true },
    );

    await addDoc(collection(window.db, "chats", roomId, "messages"), {
      senderNisn: myNisn,
      text: text,
      time: timeStr,
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
// SISTEM MONITORING CHAT ADMIN (GLOBAL)
// ==========================================
let adminActiveChatListener = null;
let currentAdminSelectedRoomId = "";

window.loadAdminChatRooms = async function () {
  const roomListContainer = document.getElementById("adminRoomList");
  if (!roomListContainer) return;
  roomListContainer.innerHTML = `<div style="font-size: 10px; color: #888; text-align: center; margin: auto;">Memuat seluruh daftar percakapan...</div>`;

  try {
    const { collection, getDocs } = window.fbFirestore;
    const chatsRef = collection(window.db, "chats");
    const snapshot = await getDocs(chatsRef);

    let roomsHtml = "";
    let count = 0;

    snapshot.forEach((docSnap) => {
      const roomId = docSnap.id;
      const [nisn1, nisn2] = roomId.split("_");
      count++;

      roomsHtml += `
      <div onclick="monitorAdminRoom('${roomId}')" style="padding: 8px 10px; background: #fff; border: 1.5px solid #cbd5e1; border-radius: 8px; cursor: pointer; transition: background 0.2s; margin-bottom: 4px;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#fff'">
        <div style="font-size: 10px; font-weight: bold; color: #1e3c72;">💬 Chat:</div>
        <div style="font-size: 9px; color: #334155; margin-top: 1px; font-weight: 500;">${nisn1} & ${nisn2}</div>
      </div>
      `;
    });

    if (count === 0) {
      roomListContainer.innerHTML = `<div style="font-size: 10px; color: #888; text-align: center; margin: auto;">Belum ada ruang chat aktif dari siswa.</div>`;
    } else {
      roomListContainer.innerHTML = roomsHtml;
    }
  } catch (err) {
    console.error("Gagal memuat room chat admin:", err);
    roomListContainer.innerHTML = `<div style="font-size: 10px; color: #e74c3c; text-align: center; margin: auto;">Gagal memuat data chat.</div>`;
  }
};

window.monitorAdminRoom = function (roomId) {
  currentAdminSelectedRoomId = roomId;
  const headerEl = document.getElementById("adminChatHeader");
  const container = document.getElementById("adminMessageContainer");
  if (!headerEl || !container) return;

  headerEl.innerText = `Memantau Ruang: ${roomId}`;

  try {
    const { collection, query, orderBy, onSnapshot } = window.fbFirestore;
    const messagesRef = collection(window.db, "chats", roomId, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    if (adminActiveChatListener) adminActiveChatListener();

    adminActiveChatListener = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        container.innerHTML = `<div style="font-size: 11px; color: #888; text-align: center; margin: auto;">Belum ada pesan di ruang ini.</div>`;
        return;
      }

      let adminChatHtml = "";

      snapshot.forEach((docSnap) => {
        const msg = docSnap.data();
        const siswaObj = masterDataSiswa.find((s) => s.nisn === msg.senderNisn);
        const namaPengirim = siswaObj ? siswaObj.nama : "Siswa";

        adminChatHtml += `
        <div style="background: #ffffff; color: #1e293b; border: 1.5px solid #e2e8f0; padding: 10px 14px; border-radius: 10px; width: 100%; font-size: 11px; word-break: break-word; box-shadow: 0 1px 3px rgba(0,0,0,0.04); margin-bottom: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; border-bottom: 1px solid #f1f5f9; padding-bottom: 3px;">
            <span style="font-size: 9.5px; font-weight: bold; color: #1e3c72;">👤 ${namaPengirim} - ${msg.senderNisn}</span>
            <span style="font-size: 8.5px; color: #64748b;">${msg.time || ""}</span>
          </div>
          <div style="font-size: 11.5px; color: #334155; line-height: 1.4;">${escapeHtml(msg.text)}</div>
        </div>
        `;
      });

      container.innerHTML = adminChatHtml;
      container.scrollTop = container.scrollHeight;
    });
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
  const yakin = await window.customConfirm(
    `Yakin ingin menghapus SEMUA pesan di ruang chat ${currentAdminSelectedRoomId}?`,
  );
  if (!yakin) {
    return;
  }

  showGamePreloader("MENDELETING ALL MESSAGES...", async (done) => {
    try {
      const { collection, getDocs, doc, deleteDoc } = window.fbFirestore;
      const messagesRef = collection(
        window.db,
        "chats",
        currentAdminSelectedRoomId,
        "messages",
      );
      const snapshot = await getDocs(messagesRef);

      const deletePromises = [];
      snapshot.forEach((docSnap) => {
        deletePromises.push(
          deleteDoc(
            doc(
              window.db,
              "chats",
              currentAdminSelectedRoomId,
              "messages",
              docSnap.id,
            ),
          ),
        );
      });

      await Promise.all(deletePromises);
      done();
      window.customAlert(
        "✅ Semua pesan di ruang chat ini berhasil dihapus oleh Admin!",
      );
    } catch (err) {
      done();
      console.error("Gagal menghapus semua chat:", err);
      window.customAlert("Gagal menghapus pesan chat.");
    }
  });
};

let masterDataSiswa = [];
let masterDataTugas = [];

async function loadMasterSiswaFromCloud(callback) {
  const cachedData = sessionStorage.getItem("master_siswa_cache");
  if (cachedData) {
    masterDataSiswa = JSON.parse(cachedData);
    masterDataSiswa.forEach((s) => {
      if (s.dailyScore === undefined) s.dailyScore = 0;
    });
    if (callback) callback();
    return;
  }

  try {
    const { collection, getDocs } = window.fbFirestore;
    const querySnapshot = await getDocs(collection(window.db, "siswa"));
    masterDataSiswa = [];
    querySnapshot.forEach((doc) => {
      let sData = doc.data();
      if (sData.dailyScore === undefined) sData.dailyScore = 0;
      masterDataSiswa.push(sData);
    });
    sessionStorage.setItem(
      "master_siswa_cache",
      JSON.stringify(masterDataSiswa),
    );
    if (callback) callback();
  } catch (err) {
    console.error("Gagal memuat data siswa:", err);
    if (callback) callback();
  }
}

async function loadTugasAktif() {
  const container = document.getElementById("mainTaskBoardList");
  const teacherContainer = document.getElementById("teacherTaskList");

  try {
    const { collection, getDocs } = window.fbFirestore;
    const querySnapshot = await getDocs(collection(window.db, "tugas"));

    masterDataTugas = [];
    const now = Date.now();
    const satuMingguMs = 7 * 24 * 60 * 60 * 1000;

    querySnapshot.forEach((docSnap) => {
      let tData = docSnap.data();
      if (tData.timestamp && now - tData.timestamp < satuMingguMs) {
        masterDataTugas.push(tData);
      }
    });

    if (container) {
      if (masterDataTugas.length === 0) {
        container.innerHTML = `<div style="font-size: 10.5px; color: #888; text-align: center; padding: 10px;">Belum ada tugas atau PR aktif minggu ini.</div>`;
      } else {
        let tugasHtml = "";
        masterDataTugas.forEach((t) => {
          tugasHtml += `
          <div style="background: #f8f9fa; border-left: 3px solid #f1c40f; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; margin-bottom: 6px;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; color: #1e3c72; margin-bottom: 2px;">
              <span>📌 ${t.judul}</span>
              <span style="font-size: 8.5px; background: #e2e8f0; padding: 2px 5px; border-radius: 4px; color: #555;">${t.targetKelas}</span>
            </div>
            <div style="font-size: 10px; color: #444; line-height: 1.4; margin-bottom: 4px;">${t.isi}</div>
            <div style="font-size: 8.5px; color: #888; display: flex; justify-content: space-between;">
              <span>👨‍🏫 Oleh: ${t.namaGuru}</span>
              <span>📅 ${t.tanggal}</span>
            </div>
          </div>
          `;
        });
        container.innerHTML = tugasHtml;
      }
    }

    if (teacherContainer) {
      if (masterDataTugas.length === 0) {
        teacherContainer.innerHTML = `<div style="font-size: 10px; color: #888; text-align: center; padding: 8px;">Tidak ada tugas aktif yang bisa dikelola.</div>`;
      } else {
        let teacherTugasHtml = "";
        masterDataTugas.forEach((t) => {
          teacherTugasHtml += `
          <div style="background: #111823; border: 1px solid #34495e; border-radius: 8px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <div style="overflow: hidden;">
              <div style="font-size: 11px; font-weight: bold; color: #f1c40f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.judul}</div>
              <div style="font-size: 9px; color: #bdc3c7;">Target: ${t.targetKelas} | ${t.tanggal}</div>
            </div>
            <button type="button" onclick="hapusTugas('${t.id}')" style="margin-top: 0; padding: 4px 8px; font-size: 9px; background: #e74c3c; color: #fff; width: auto; border-radius: 6px; box-shadow: none; flex-shrink: 0;">Hapus</button>
          </div>
          `;
        });
        teacherContainer.innerHTML = teacherTugasHtml;
      }
    }
  } catch (err) {
    console.error("Gagal memuat daftar tugas:", err);
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
function showScreen(screenId, pushHistory = true) {
  document.getElementById("menuWrapper").classList.add("hidden");
  document.getElementById("mainMenuCard").classList.add("hidden");
  document.getElementById("loginCard").classList.add("hidden");
  document.getElementById("siswaCard").classList.add("hidden");
  document.getElementById("entryCard").classList.add("hidden");
  document.getElementById("adminCard").classList.add("hidden");
  document.getElementById("questBoardCard").classList.add("hidden");
  document.getElementById("leaderboardCard").classList.add("hidden");

  if (screenId === "menu") {
    document.getElementById("menuWrapper").classList.remove("hidden");
    document.getElementById("mainMenuCard").classList.remove("hidden");
    loadTugasAktif();
  } else if (screenId === "login") {
    document.getElementById("loginCard").classList.remove("hidden");
  } else if (screenId === "siswa") {
    document.getElementById("siswaCard").classList.remove("hidden");
    document.getElementById("hasilPoinSiswa").classList.add("hidden");
    document.getElementById("boxInputNisnSiswa").classList.remove("hidden");
    document.getElementById("nisnSiswaInput").value = "";
    if (document.getElementById("pinSiswaInput")) {
      document.getElementById("pinSiswaInput").value = "";
    }
  } else if (screenId === "quest") {
    document.getElementById("questBoardCard").classList.remove("hidden");
    renderQuestUI("prestasi");
  } else if (screenId === "leaderboard") {
    document.getElementById("leaderboardCard").classList.remove("hidden");
    loadMasterSiswaFromCloud(() => renderGlobalLeaderboard());
  } else if (screenId === "entry") {
    document.getElementById("entryCard").classList.remove("hidden");
  } else if (screenId === "admin") {
    document.getElementById("adminCard").classList.remove("hidden");
    handleAdminActionTypeChange();
  }

  if (pushHistory) {
    window.history.pushState({ screen: screenId }, "", `#${screenId}`);
  }
}

function showGamePreloader(customTitle, callback) {
  const preloader = document.getElementById("gamePreloader");
  document.getElementById("loadingTitleText").innerText = customTitle;
  const fillEl = document.getElementById("progressBarFill");
  const percentEl = document.getElementById("loadingPercentText");

  preloader.classList.remove("hidden");
  let currentPercent = 0;
  fillEl.style.width = "0%";
  percentEl.innerText = "0%";

  let progressInterval = setInterval(() => {
    if (currentPercent < 85) {
      currentPercent += 15;
      fillEl.style.width = currentPercent + "%";
      percentEl.innerText = currentPercent + "%";
    }
  }, 80);

  const finishLoading = () => {
    clearInterval(progressInterval);
    fillEl.style.width = "100%";
    percentEl.innerText = "100%";
    setTimeout(() => {
      preloader.classList.add("hidden");
    }, 300);
  };
  if (callback) callback(finishLoading);
}

window.togglePassword = function () {
  const pwd = document.getElementById("password");
  pwd.type = pwd.type === "password" ? "text" : "password";
};

window.bukaPortal = function (tipe) {
  if (tipe === "guru") {
    showScreen("login");
  } else if (tipe === "siswa") {
    showScreen("siswa");
    document.getElementById("hasilPoinSiswa").classList.add("hidden");
    document.getElementById("boxInputNisnSiswa").classList.remove("hidden");
    document.getElementById("nisnSiswaInput").value = "";
    if (document.getElementById("pinSiswaInput")) {
      document.getElementById("pinSiswaInput").value = "";
    }
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

window.keluarSiswa = function () {
  if (activeStudentDocListener) {
    activeStudentDocListener();
    activeStudentDocListener = null;
  }

  if (typeof friendListeners === "object") {
    Object.values(friendListeners).forEach((unsub) => {
      if (typeof unsub === "function") unsub();
    });
    friendListeners = {};
  }

  localStorage.removeItem("activeUser");
  showScreen("menu");
};

window.logout = function () {
  localStorage.removeItem("loggedInUser");
  showScreen("menu");
};

function renderGlobalLeaderboard() {
  const filter = document.getElementById("filterLeaderboardKelas").value;
  const container = document.getElementById("globalLeaderboardList");
  if (!container) return;

  let filtered =
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
    const avatarFile = s.fotoUrl
      ? s.fotoUrl
      : s.jk && s.jk.toUpperCase() === "P"
        ? "assets/foto_siswa/avatar_p.webp"
        : "assets/foto_siswa/avatar_l.webp";

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
    <div style="${rowStyle} border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px;">
      <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
        <div style="font-size: 13px; font-weight: bold; color: ${nameColor}; width: 32px; text-align: center; flex-shrink: 0;">${rankBadge}</div>
        <div style="width: 36px; height: 36px; border-radius: 8px; overflow: hidden; background: #2c3e50; flex-shrink: 0; border: 1.5px solid ${nameColor};">
          <img src="${avatarFile}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='assets/foto_siswa/avatar.webp'">
        </div>
        <div style="overflow: hidden;">
          <div style="font-size: 12px; font-weight: bold; color: ${nameColor}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.nama}</div>
          <div style="font-size: 9.5px; color: #cbd5e1;">Kelas: ${s.kelas}</div>
        </div>
      </div>
      <div style="text-align: right; flex-shrink: 0;">
        <div style="font-size: 13px; font-weight: bold; color: ${scoreColor};">${score} Pts</div>
        <div style="font-size: 8px; color: #94a3b8;">Poin Tugas</div>
      </div>
    </div>
    `;
  });

  container.innerHTML = leaderboardHtml;
}

window.login = async function () {
  const usernameIn = document.getElementById("namaGuruInput").value.trim();
  const passIn = document.getElementById("password").value.trim();

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
      const teacherDocSnap = await getDoc(
        doc(window.db, "teachers", emailLogin),
      );

      let userData = { nama: "Petugas Sekolah", role: "Guru Mapel" };
      if (teacherDocSnap.exists()) {
        userData = teacherDocSnap.data();
      }

      localStorage.setItem("loggedInUser", JSON.stringify(userData));
      prosesMasukUser(userData, done);
    } catch (err) {
      done();
      console.error("Login gagal:", err);
      document.getElementById("pesanEror").style.display = "block";
    }
  });
};

function prosesMasukUser(user, doneCallback) {
  currentRole = user.role;
  document.getElementById("pesanEror").style.display = "none";

  if (user.role === "Super Admin") {
    loadMasterSiswaFromCloud(() => {
      setTimeout(() => {
        if (doneCallback) doneCallback();
        document.getElementById("txtNamaAdmin").innerText = user.nama;
        showScreen("admin");
        window.switchAdminTab("rekap");
      }, 400);
    });
  } else {
    document.getElementById("txtNamaGuru").innerText = user.nama;
    document.getElementById("txtRoleGuru").innerText = "Jabatan: " + user.role;
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
  const tabPoin = document.getElementById("teacherTabPoin");
  const tabPosting = document.getElementById("teacherTabPosting");
  const btnPoin = document.getElementById("navBtnInputPoin");
  const btnPosting = document.getElementById("navBtnPostTugas");

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

window.simpanPengumumanTugas = async function () {
  const targetKelas = document.getElementById("postKelasTarget").value;
  const judul = document.getElementById("postJudul").value.trim();
  const isi = document.getElementById("postIsi").value.trim();
  const namaGuru = document.getElementById("txtNamaGuru").innerText;

  if (!judul || !isi)
    return window.customAlert("Judul dan isi tugas wajib diisi!");

  showGamePreloader("PUBLISHING TASK TO CLOUD...", async (done) => {
    try {
      const { doc: firestoreDoc, setDoc: firestoreSetDoc } = window.fbFirestore;
      const tugasId = "tugas_" + Date.now();

      await firestoreSetDoc(firestoreDoc(window.db, "tugas", tugasId), {
        id: tugasId,
        targetKelas: targetKelas,
        judul: judul,
        isi: isi,
        namaGuru: namaGuru,
        tanggal: new Date().toISOString().split("T")[0],
        timestamp: Date.now(),
      });

      done();
      window.customAlert("✅ Tugas & PR berhasil dipublikasikan!");
      document.getElementById("formPostTugas").reset();
      loadTugasAktif();
    } catch (err) {
      done();
      console.error("Gagal mempublikasikan tugas:", err);
      window.customAlert("Gagal menyimpan tugas ke database.");
    }
  });
};

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

window.loginSiswaWithPin = async function () {
  const nisnInput = document.getElementById("nisnSiswaInput").value.trim();
  const pinInput = document.getElementById("pinSiswaInput").value.trim();

  if (!nisnInput) return window.customAlert("Silakan ketik nomor NISN kamu!");
  if (!pinInput) return window.customAlert("Silakan ketik PIN keamanan kamu!");

  showGamePreloader("MEMVERIFIKASI AKUN SISWA...", async (done) => {
    try {
      const { doc, getDoc } = window.fbFirestore;
      const docRef = doc(window.db, "siswa", nisnInput);
      const docSnap = await getDoc(docRef);
      done();

      if (docSnap.exists()) {
        const siswa = docSnap.data();

        const serverPin =
          siswa.pin !== undefined ? String(siswa.pin) : "123456";

        if (pinInput !== serverPin) {
          return window.customAlert(
            "❌ PIN yang kamu masukkan salah! Periksa kembali PIN kamu.",
          );
        }

        if (siswa.dailyScore === undefined) siswa.dailyScore = 0;
        localStorage.setItem("activeUser", nisnInput);
        initStudentRealtimeListener(nisnInput);
        initOnlineStatusEngine();

        document.getElementById("boxInputNisnSiswa").classList.add("hidden");
        document.getElementById("hasilPoinSiswa").classList.remove("hidden");

        const avatarImg =
          document.getElementById("avatarSiswaMain") ||
          document.querySelector(".rpg-avatar-box img");
        if (avatarImg) {
          avatarImg.src = siswa.fotoUrl
            ? siswa.fotoUrl
            : siswa.jk && siswa.jk.toUpperCase() === "P"
              ? "assets/foto_siswa/avatar_p.webp"
              : "assets/foto_siswa/avatar_l.webp";
        }

        document.getElementById("txtNamaSiswaHasil").innerHTML = (
          siswa.nama || ""
        ).toUpperCase();
        document.getElementById("txtKelasSiswaHasil").innerText =
          `Kelas: ${siswa.kelas || "-"} | NISN: ${siswa.nisn || nisnInput}`;

        const rankInfo = getTierRank(siswa.shield || 0);
        document.getElementById("txtTierRankContainer").innerHTML = `
        <span style="display: inline-block; background: ${rankInfo.bg}; color: ${rankInfo.color}; padding: 2px 8px; border-radius: 5px; font-size: 10px; font-weight: 700; margin-top: 1px;">
          ${rankInfo.title}
        </span>
        `;

        let hpValue = siswa.hp !== undefined ? siswa.hp : 200;
        document.getElementById("barHpFill").style.width =
          `${Math.max(0, Math.min(100, (hpValue / 200) * 100))}%`;
        document.getElementById("txtHpPercent").innerText =
          `${Math.max(0, hpValue)}/200`;

        let shieldValue = siswa.shield || 0;
        document.getElementById("txtShieldPercent").innerText =
          `${shieldValue} Pts`;
        document.getElementById("barShieldFill").style.width =
          `${Math.max(0, Math.min(100, (shieldValue / 300) * 100))}%`;

        let dailyValue = siswa.dailyScore || 0;
        document.getElementById("txtDailyScoreTextOnly").innerText =
          `⭐ ${dailyValue} Pts`;

        const statusHukum = getStatusPembinaan(siswa.totalPelanggaran || 0);
        document.getElementById("txtStatusKondisi").innerText =
          `STATUS: ${statusHukum.title}`;
        document.getElementById("txtStatusPenanganan").innerText =
          statusHukum.desc;

        document.getElementById("txtCountPrestasi").innerText =
          `${siswa.totalPrestasi || 0} Pts`;
        document.getElementById("txtCountPelanggaran").innerText =
          `${siswa.totalPelanggaran || 0} Pts`;

        let historyListContainer = document.getElementById("historyListSiswa");
        if (!siswa.riwayat || siswa.riwayat.length === 0) {
          historyListContainer.innerHTML = `<div style="font-size: 10px; color: #95a5a6; text-align: center; padding: 6px;">Tidak ada catatan riwayat.</div>`;
        } else {
          let riwayatHtml = "";
          siswa.riwayat.forEach((r) => {
            let isPlus = Number(r.p) > 0;
            let borderColor = isPlus ? "#2ecc71" : "#e74c3c";
            riwayatHtml += `
            <div style="background: #1a2536; border-left: 3px solid ${borderColor}; padding: 8px 10px; border-radius: 0 6px 6px 0; font-size: 10.5px; color: #ecf0f1; border: 1px solid #34495e; margin-bottom: 6px;">
              <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 2px;">
                <span style="color: ${borderColor};">${r.t}</span>
                <span style="color: ${borderColor};">${isPlus ? "+" + r.p : r.p} Pts</span>
              </div>
              <div style="font-size: 9.5px; color: #bdc3c7; display: flex; justify-content: space-between;">
                <span>📍 ${r.loc || "-"}</span>
                <span>📅 ${r.d || "-"}</span>
              </div>
            </div>
            `;
          });
          historyListContainer.innerHTML = riwayatHtml;
        }

        const oldPinInputEl = document.getElementById("oldPinInput");
        const cardGantiPin = oldPinInputEl
          ? oldPinInputEl.closest(".rpg-card-container")
          : null;
        if (cardGantiPin) {
          if (siswa.hasChangedPin || serverPin !== "123456") {
            cardGantiPin.style.display = "none";
          } else {
            cardGantiPin.style.display = "block";
            oldPinInputEl.value = "";
            const newPinEl = document.getElementById("newPinInput");
            if (newPinEl) newPinEl.value = "";
          }
        }

        // PEMANGGILAN FITUR GLOBAL CHAT RPG
        if (typeof window.initGlobalChat === "function") {
          window.initGlobalChat(siswa);
        }
      } else {
        document.getElementById("modalErrorSiswa").classList.remove("hidden");
      }
    } catch (err) {
      done();
      console.error("Gagal verifikasi login siswa:", err);
    }
  });
};

// ==========================================
// FUNGSI AUTO LOGIN SISWA (UNTUK REFRESH HALAMAN)
// ==========================================
async function autoLoginSiswa(nisnInput) {
  showGamePreloader("MEMULIHKAN SESI SISWA...", async (done) => {
    try {
      const { doc, getDoc } = window.fbFirestore;
      const docRef = doc(window.db, "siswa", nisnInput);
      const docSnap = await getDoc(docRef);
      done();

      if (docSnap.exists()) {
        const siswa = docSnap.data();

        if (siswa.dailyScore === undefined) siswa.dailyScore = 0;
        localStorage.setItem("activeUser", nisnInput);
        initStudentRealtimeListener(nisnInput);
        initOnlineStatusEngine();

        document.getElementById("boxInputNisnSiswa").classList.add("hidden");
        document.getElementById("hasilPoinSiswa").classList.remove("hidden");

        const avatarImg =
          document.getElementById("avatarSiswaMain") ||
          document.querySelector(".rpg-avatar-box img");
        if (avatarImg) {
          avatarImg.src = siswa.fotoUrl
            ? siswa.fotoUrl
            : siswa.jk && siswa.jk.toUpperCase() === "P"
              ? "assets/foto_siswa/avatar_p.webp"
              : "assets/foto_siswa/avatar_l.webp";
        }

        document.getElementById("txtNamaSiswaHasil").innerHTML = (
          siswa.nama || ""
        ).toUpperCase();
        document.getElementById("txtKelasSiswaHasil").innerText =
          `Kelas: ${siswa.kelas || "-"} | NISN: ${siswa.nisn || nisnInput}`;

        const rankInfo = getTierRank(siswa.shield || 0);
        document.getElementById("txtTierRankContainer").innerHTML = `
        <span style="display: inline-block; background: ${rankInfo.bg}; color: ${rankInfo.color}; padding: 2px 8px; border-radius: 5px; font-size: 10px; font-weight: 700; margin-top: 1px;">
          ${rankInfo.title}
        </span>
        `;

        let hpValue = siswa.hp !== undefined ? siswa.hp : 200;
        document.getElementById("barHpFill").style.width =
          `${Math.max(0, Math.min(100, (hpValue / 200) * 100))}%`;
        document.getElementById("txtHpPercent").innerText =
          `${Math.max(0, hpValue)}/200`;

        let shieldValue = siswa.shield || 0;
        document.getElementById("txtShieldPercent").innerText =
          `${shieldValue} Pts`;
        document.getElementById("barShieldFill").style.width =
          `${Math.max(0, Math.min(100, (shieldValue / 300) * 100))}%`;

        let dailyValue = siswa.dailyScore || 0;
        document.getElementById("txtDailyScoreTextOnly").innerText =
          `⭐ ${dailyValue} Pts`;

        const statusHukum = getStatusPembinaan(siswa.totalPelanggaran || 0);
        document.getElementById("txtStatusKondisi").innerText =
          `STATUS: ${statusHukum.title}`;
        document.getElementById("txtStatusPenanganan").innerText =
          statusHukum.desc;

        document.getElementById("txtCountPrestasi").innerText =
          `${siswa.totalPrestasi || 0} Pts`;
        document.getElementById("txtCountPelanggaran").innerText =
          `${siswa.totalPelanggaran || 0} Pts`;

        let historyListContainer = document.getElementById("historyListSiswa");
        if (!siswa.riwayat || siswa.riwayat.length === 0) {
          historyListContainer.innerHTML = `<div style="font-size: 10px; color: #95a5a6; text-align: center; padding: 6px;">Tidak ada catatan riwayat.</div>`;
        } else {
          let riwayatHtml = "";
          siswa.riwayat.forEach((r) => {
            let isPlus = Number(r.p) > 0;
            let borderColor = isPlus ? "#2ecc71" : "#e74c3c";
            riwayatHtml += `
            <div style="background: #1a2536; border-left: 3px solid ${borderColor}; padding: 8px 10px; border-radius: 0 6px 6px 0; font-size: 10.5px; color: #ecf0f1; border: 1px solid #34495e; margin-bottom: 6px;">
              <div style="display: flex; justify-content: space-between; font-weight: bold; margin-bottom: 2px;">
                <span style="color: ${borderColor};">${r.t}</span>
                <span style="color: ${borderColor};">${isPlus ? "+" + r.p : r.p} Pts</span>
              </div>
              <div style="font-size: 9.5px; color: #bdc3c7; display: flex; justify-content: space-between;">
                <span>📍 ${r.loc || "-"}</span>
                <span>📅 ${r.d || "-"}</span>
              </div>
            </div>
            `;
          });
          historyListContainer.innerHTML = riwayatHtml;
        }

        const serverPin =
          siswa.pin !== undefined ? String(siswa.pin) : "123456";
        const oldPinInputEl = document.getElementById("oldPinInput");
        const cardGantiPin = oldPinInputEl
          ? oldPinInputEl.closest(".rpg-card-container")
          : null;
        if (cardGantiPin) {
          if (siswa.hasChangedPin || serverPin !== "123456") {
            cardGantiPin.style.display = "none";
          } else {
            cardGantiPin.style.display = "block";
            oldPinInputEl.value = "";
            const newPinEl = document.getElementById("newPinInput");
            if (newPinEl) newPinEl.value = "";
          }
        }

        // PEMANGGILAN FITUR GLOBAL CHAT RPG
        if (typeof window.initGlobalChat === "function") {
          window.initGlobalChat(siswa);
        }
      } else {
        localStorage.removeItem("activeUser");
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
  const oldPin = document.getElementById("oldPinInput").value.trim();
  const newPin = document.getElementById("newPinInput").value.trim();

  if (!oldPin || !newPin) {
    return window.customAlert("⚠️ Mohon isi PIN lama dan PIN baru Anda!");
  }

  if (newPin.length < 4) {
    return window.customAlert(
      "⚠️ PIN baru minimal harus terdiri dari 4 karakter/angka!",
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

      await updateDoc(docRef, {
        pin: newPin,
        hasChangedPin: true,
      });

      done();
      window.customAlert(
        "✅ PIN berhasil diubah! Kotak ganti PIN disembunyikan untuk keamanan.",
      );

      const oldPinEl = document.getElementById("oldPinInput");
      const cardGantiPin = oldPinEl
        ? oldPinEl.closest(".rpg-card-container")
        : null;
      if (cardGantiPin) {
        cardGantiPin.style.display = "none";
      }

      if (oldPinEl) oldPinEl.value = "";
      const newPinEl = document.getElementById("newPinInput");
      if (newPinEl) newPinEl.value = "";
    } catch (err) {
      done();
      console.error("Gagal mengganti PIN:", err);
      window.customAlert(
        "Gagal memperbarui PIN. Periksa koneksi internet Anda.",
      );
    }
  });
};

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
  document.getElementById("hari").value = namaHari[now.getDay()];
  document.getElementById("tanggal").value = now.toISOString().split("T")[0];
  document.getElementById("jam").value =
    `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  window.handleKategoriChange();
  window.updateEntrySiswaList();
}

window.handleKategoriChange = function () {
  const kat = document.getElementById("kategori").value;
  const boxSub = document.getElementById("boxSubKategori");
  const container = document.getElementById("containerOpsi");
  const label = document.getElementById("lblDetailOpsi");
  container.innerHTML = "";

  if (kat === "Pelanggaran") {
    boxSub.classList.remove("hidden");
    const subKategori = document.getElementById("subKategori");
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
  const kat = document.getElementById("kategori").value;
  const sub = document.getElementById("subKategori")
    ? document.getElementById("subKategori").value
    : "";
  const container = document.getElementById("containerOpsi");
  const label = document.getElementById("lblDetailOpsi");
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
    listTampil = dataPilihan.Pelanggaran[sub];
  }

  let opsiHtml = "";
  listTampil.forEach((item) => {
    let labelPrefix =
      kat === "Prestasi" ? "+" : kat === "TugasHarian" ? "+" : "-";
    opsiHtml += `<label class="option-item"><input type="radio" name="opsiPoin" value="${item.t}" data-poin="${item.p}" required>
                <span>${item.t} <strong>(${labelPrefix}${item.p} Pts)</strong></span></label>`;
  });
  container.innerHTML = opsiHtml;
};

window.updateEntrySiswaList = function () {
  const kelas = document.getElementById("kelas").value;
  const singleSelect = document.getElementById("selectSingleSiswa");
  const multiBox = document.getElementById("boxMultiSiswa");
  singleSelect.innerHTML = '<option value="">-- Pilih Siswa --</option>';

  if (!kelas) {
    multiBox.innerHTML =
      '<span style="font-size:11px; color:#888;">Pilih kelas dulu...</span>';
    return;
  }

  let singleHtml = '<option value="">-- Pilih Siswa --</option>';
  let multiHtml = "";

  masterDataSiswa
    .filter((s) => s.kelas === kelas)
    .forEach((s) => {
      singleHtml += `<option value="${s.nama}">${s.nama}</option>`;
      multiHtml += `<label class="checkbox-item"><input type="checkbox" name="multiSiswa" value="${s.nama}"> ${s.nama}</label>`;
    });

  singleSelect.innerHTML = singleHtml;
  multiBox.innerHTML = multiHtml;
};

window.toggleModeSiswa = function () {
  isMultiMode = !isMultiMode;
  document.getElementById("txtModeSiswa").innerText = isMultiMode
    ? "Mode: Banyak Siswa"
    : "Mode: Satu Siswa";
  document
    .getElementById("selectSingleSiswa")
    .classList.toggle("hidden", isMultiMode);
  document.getElementById("selectSingleSiswa").required = !isMultiMode;
  document
    .getElementById("boxMultiSiswa")
    .classList.toggle("hidden", !isMultiMode);
};

window.konfirmasiSimpan = function () {
  const selectedRadio = document.querySelector(
    'input[name="opsiPoin"]:checked',
  );
  if (!selectedRadio)
    return window.customAlert("Pilih detail jenis kejadian terlebih dahulu!");

  let daftarSiswaDipilih = [];
  if (isMultiMode) {
    document
      .querySelectorAll('input[name="multiSiswa"]:checked')
      .forEach((cb) => daftarSiswaDipilih.push(cb.value));
    if (daftarSiswaDipilih.length === 0)
      return window.customAlert("Pilih minimal 1 siswa!");
  } else {
    const val = document.getElementById("selectSingleSiswa").value;
    if (!val) return window.customAlert("Pilih nama siswa terlebih dahulu!");
    daftarSiswaDipilih.push(val);
  }

  const kat = document.getElementById("kategori").value;
  let efekText =
    kat === "TugasHarian"
      ? `+${selectedRadio.getAttribute("data-poin")} Poin Harian (Leaderboard)`
      : kat === "Prestasi"
        ? `+${selectedRadio.getAttribute("data-poin")} Prestasi`
        : `-${selectedRadio.getAttribute("data-poin")} Pelanggaran`;

  document.getElementById("modalDetailContent").innerHTML = `
  <strong>Target Siswa (${daftarSiswaDipilih.length}):</strong><br>${daftarSiswaDipilih.join(", ")}<br><br>
  <strong>Aktivitas:</strong> ${selectedRadio.value}<br>
  <strong>Dampak:</strong> ${efekText}<br>
  <strong>Guru Pelapor:</strong> ${document.getElementById("txtNamaGuru").innerText}
  `;
  document.getElementById("modalKonfirmasi").classList.remove("hidden");
};

window.tutupModal = function () {
  document.getElementById("modalKonfirmasi").classList.add("hidden");
};

window.eksekusiSimpanWithLoading = async function () {
  window.tutupModal();
  const selectedRadio = document.querySelector(
    'input[name="opsiPoin"]:checked',
  );
  if (!selectedRadio) return;

  const desc = selectedRadio.value;
  const poin = parseInt(selectedRadio.getAttribute("data-poin"));
  const kat = document.getElementById("kategori").value;
  const tempat = document.getElementById("tempat").value || "Sekolah";
  const waktuGabung =
    document.getElementById("tanggal").value +
    " " +
    (document.getElementById("jam").value || "00:00");

  let daftarSiswaDipilih = [];
  if (isMultiMode) {
    document
      .querySelectorAll('input[name="multiSiswa"]:checked')
      .forEach((cb) => daftarSiswaDipilih.push(cb.value));
  } else {
    const val = document.getElementById("selectSingleSiswa").value;
    if (val) daftarSiswaDipilih.push(val);
  }

  showGamePreloader("SAVING TO CLOUD DB...", async (done) => {
    try {
      const { doc, getDoc, updateDoc } = window.fbFirestore;

      for (let namaSiswa of daftarSiswaDipilih) {
        const siswaObj = masterDataSiswa.find((s) => s.nama === namaSiswa);
        if (!siswaObj || !siswaObj.nisn) continue;

        const docRef = doc(window.db, "siswa", siswaObj.nisn);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const dataSiswa = docSnap.data();
          let hpBaru = dataSiswa.hp !== undefined ? dataSiswa.hp : 200;
          let shieldBaru = dataSiswa.shield || 0;
          let totalPres = dataSiswa.totalPrestasi || 0;
          let totalPel = dataSiswa.totalPelanggaran || 0;
          let dailyScoreBaru = dataSiswa.dailyScore || 0;
          let riwayatList = dataSiswa.riwayat || [];

          let poinDampak = kat === "Pelanggaran" ? -poin : poin;

          if (kat === "TugasHarian") {
            dailyScoreBaru += poin;
          } else if (kat === "Prestasi") {
            totalPres += poin;
            let sisaPoin = poin;
            let kekuranganHp = 200 - hpBaru;
            if (kekuranganHp > 0) {
              hpBaru = sisaPoin >= kekuranganHp ? 200 : hpBaru + sisaPoin;
              sisaPoin -= kekuranganHp;
            }
            if (sisaPoin > 0) shieldBaru += sisaPoin;
          } else {
            totalPel += poin;
            let sisaPelanggaran = poin;
            if (shieldBaru > 0) {
              if (sisaPelanggaran >= shieldBaru) {
                sisaPelanggaran -= shieldBaru;
                shieldBaru = 0;
              } else {
                shieldBaru -= sisaPelanggaran;
                sisaPelanggaran = 0;
              }
            }
            if (sisaPelanggaran > 0) {
              hpBaru = Math.max(0, hpBaru - sisaPelanggaran);
            }
          }

          riwayatList.unshift({
            t: desc,
            p: poinDampak,
            loc: tempat,
            d: waktuGabung,
          });

          await updateDoc(docRef, {
            hp: hpBaru,
            shield: shieldBaru,
            totalPrestasi: totalPres,
            totalPelanggaran: totalPel,
            dailyScore: dailyScoreBaru,
            riwayat: riwayatList,
          });
        }
      }

      done();
      sessionStorage.removeItem("master_siswa_cache");
      window.customAlert(
        "✅ Poin Berhasil Disimpan & Disinkronkan ke Leaderboard!",
      );
      document.getElementById("formEntry").reset();
      initFormEntry();
      loadMasterSiswaFromCloud();
    } catch (err) {
      done();
      console.error("Gagal menyimpan poin:", err);
      window.customAlert("Gagal menyimpan data ke Firestore.");
    }
  });
};

window.switchAdminTab = function (tabName) {
  ["Rekap", "Kontrol", "Cetak", "Chat"].forEach((n) => {
    const el = document.getElementById("adminTab" + n);
    const btn = document.getElementById(
      "navBtn" + (n === "Chat" ? "ChatAdmin" : n),
    );
    if (el) el.classList.add("hidden");
    if (btn) {
      btn.className = "btn-outline";
      btn.style.background = "transparent";
    }
  });

  const activeEl = document.getElementById(
    "adminTab" +
      (tabName === "chat"
        ? "Chat"
        : tabName.charAt(0).toUpperCase() + tabName.slice(1)),
  );
  const activeBtn = document.getElementById(
    "navBtn" +
      (tabName === "chat"
        ? "ChatAdmin"
        : tabName.charAt(0).toUpperCase() + tabName.slice(1)),
  );

  if (activeEl) activeEl.classList.remove("hidden");
  if (activeBtn) {
    activeBtn.className = "";
    activeBtn.style.background = "#1e3c72";
  }

  if (tabName === "rekap") renderTabelRekap();
  if (tabName === "kontrol") handleAdminActionTypeChange();
  if (tabName === "chat") window.loadAdminChatRooms();
};

let statistikChartInstance = null;

function renderTabelRekap() {
  const filter = document.getElementById("filterKelasRekap").value;
  const tbody = document.getElementById("tabelRekapBody");
  const data =
    filter === "SEMUA"
      ? masterDataSiswa
      : masterDataSiswa.filter((s) => s.kelas === filter);

  let rekapHtml = "";

  data.forEach((s) => {
    let badge = `<span style="color:#2ecc71; font-weight:bold">${s.hp} HP</span>`;
    if (s.shield > 0)
      badge += ` <span style="color:#3498db; font-size:9px">+${s.shield} Shld</span>`;
    let hukum = getStatusPembinaan(s.totalPelanggaran || 0);

    rekapHtml += `<tr>
    <td><strong>${s.nama}</strong></td>
    <td>${s.kelas}</td>
    <td>${badge}</td>
    <td>
      <span style="font-size: 9px; padding: 3px 6px; background: ${hukum.color}; color: #fff; border-radius: 4px; font-weight: bold;">${s.totalPelanggaran || 0} Pts</span>
    </td>
    </tr>`;
  });

  tbody.innerHTML = rekapHtml;

  const ctx = document.getElementById("statistikChart").getContext("2d");
  let labels = ["10 SMK", "11 SMK", "12 SMK"];
  let pelanggaranPerKelas = [0, 0, 0];
  let prestasiPerKelas = [0, 0, 0];

  masterDataSiswa.forEach((s) => {
    let idx = labels.indexOf(s.kelas);
    if (idx !== -1) {
      pelanggaranPerKelas[idx] += s.totalPelanggaran || 0;
      prestasiPerKelas[idx] += s.totalPrestasi || 0;
    }
  });

  if (statistikChartInstance) {
    statistikChartInstance.destroy();
  }

  statistikChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
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
}

window.handleAdminActionTypeChange = function () {
  const act = document.getElementById("adminActionType").value;
  const boxKelas = document.getElementById("boxAdminKelas");
  const boxSiswa = document.getElementById("boxAdminSiswa");

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
  const kelas = document.getElementById("adminKelasSelect").value;
  const sel = document.getElementById("adminSiswaSelect");
  if (!kelas) {
    sel.innerHTML = '<option value="">-- Pilih Siswa --</option>';
    return;
  }
  let siswaHtml = '<option value="">-- Pilih Siswa --</option>';
  masterDataSiswa
    .filter((s) => s.kelas === kelas)
    .forEach((s) => {
      siswaHtml += `<option value="${s.nisn}">${s.nama} (${s.dailyScore || 0} Pts Tugas)</option>`;
    });
  sel.innerHTML = siswaHtml;
};

window.prosesActionAdminWithLoading = async function () {
  const act = document.getElementById("adminActionType").value;
  const kelasTarget = document.getElementById("adminKelasSelect").value;
  const nisnTarget = document.getElementById("adminSiswaSelect").value;
  const notes = document.getElementById("adminNotes").value.trim();

  if (!notes) return window.customAlert("Catatan sidang wajib diisi!");
  if (act.includes("CLASS") && !kelasTarget)
    return window.customAlert("Pilih kelas target terlebih dahulu!");
  if ((act.includes("INDIVIDUAL") || act === "RESET_PIN_SISWA") && !nisnTarget)
    return window.customAlert("Pilih siswa target terlebih dahulu!");

  showGamePreloader("EXECUTING ADMIN OVERRIDE...", async (done) => {
    try {
      const { doc, getDoc, updateDoc } = window.fbFirestore;
      const timestampStr = new Date()
        .toISOString()
        .replace("T", " ")
        .substring(0, 16);

      if (act === "RESET_DAILY_GLOBAL") {
        for (let s of masterDataSiswa) {
          if (!s.nisn) continue;
          const docRef = doc(window.db, "siswa", s.nisn);
          const docSnap = await getDoc(docRef);
          let riwayatList = docSnap.exists()
            ? docSnap.data().riwayat || []
            : [];
          riwayatList.unshift({
            t: `RESET POIN HARIAN (Global): ${notes}`,
            p: 0,
            loc: "Ruang BK / Admin",
            d: timestampStr,
          });
          await updateDoc(docRef, {
            dailyScore: 0,
            riwayat: riwayatList,
          });
        }
        done();
        sessionStorage.removeItem("master_siswa_cache");
        window.customAlert(
          "⭐ Poin harian SELURUH SISWA berhasil di-reset jadi 0!",
        );
      } else if (act === "RESET_DAILY_CLASS") {
        const targetList = masterDataSiswa.filter(
          (s) => s.kelas === kelasTarget,
        );
        for (let s of targetList) {
          if (!s.nisn) continue;
          const docRef = doc(window.db, "siswa", s.nisn);
          const docSnap = await getDoc(docRef);
          let riwayatList = docSnap.exists()
            ? docSnap.data().riwayat || []
            : [];
          riwayatList.unshift({
            t: `RESET POIN HARIAN (Kelas ${kelasTarget}): ${notes}`,
            p: 0,
            loc: "Ruang BK / Admin",
            d: timestampStr,
          });
          await updateDoc(docRef, {
            dailyScore: 0,
            riwayat: riwayatList,
          });
        }
        done();
        sessionStorage.removeItem("master_siswa_cache");
        window.customAlert(
          `⭐ Poin harian kelas ${kelasTarget} berhasil di-reset jadi 0!`,
        );
      } else if (act === "RESET_DAILY_INDIVIDUAL") {
        const docRef = doc(window.db, "siswa", nisnTarget);
        const docSnap = await getDoc(docRef);
        let riwayatList = docSnap.exists() ? docSnap.data().riwayat || [] : [];
        riwayatList.unshift({
          t: `RESET POIN HARIAN: ${notes}`,
          p: 0,
          loc: "Ruang BK / Admin",
          d: timestampStr,
        });
        await updateDoc(docRef, { dailyScore: 0, riwayat: riwayatList });
        done();
        sessionStorage.removeItem("master_siswa_cache");
        window.customAlert(`⭐ Poin harian siswa berhasil di-reset jadi 0!`);
      } else if (act === "RESET_FULL_GLOBAL") {
        for (let s of masterDataSiswa) {
          if (!s.nisn) continue;
          const docRef = doc(window.db, "siswa", s.nisn);
          await updateDoc(docRef, {
            hp: 200,
            shield: 0,
            totalPrestasi: 0,
            totalPelanggaran: 0,
            riwayat: [
              {
                t: `PEMUTIHAN (Global): ${notes}`,
                p: 0,
                loc: "Ruang BK / Admin",
                d: timestampStr,
              },
            ],
          });
        }
        done();
        sessionStorage.removeItem("master_siswa_cache");
        window.customAlert(
          "👑 Pemutihan penuh SELURUH SISWA berhasil dieksekusi!",
        );
      } else if (act === "RESET_FULL_CLASS") {
        const targetList = masterDataSiswa.filter(
          (s) => s.kelas === kelasTarget,
        );
        for (let s of targetList) {
          if (!s.nisn) continue;
          const docRef = doc(window.db, "siswa", s.nisn);
          await updateDoc(docRef, {
            hp: 200,
            shield: 0,
            totalPrestasi: 0,
            totalPelanggaran: 0,
            riwayat: [
              {
                t: `PEMUTIHAN (Kelas ${kelasTarget}): ${notes}`,
                p: 0,
                loc: "Ruang BK / Admin",
                d: timestampStr,
              },
            ],
          });
        }
        done();
        sessionStorage.removeItem("master_siswa_cache");
        window.customAlert(
          `👑 Pemutihan penuh kelas ${kelasTarget} berhasil dieksekusi!`,
        );
      } else if (act === "RESET_FULL_INDIVIDUAL") {
        const docRef = doc(window.db, "siswa", nisnTarget);
        await updateDoc(docRef, {
          hp: 200,
          shield: 0,
          totalPrestasi: 0,
          totalPelanggaran: 0,
          riwayat: [
            {
              t: `PEMUTIHAN (Individu): ${notes}`,
              p: 0,
              loc: "Ruang BK / Admin",
              d: timestampStr,
            },
          ],
        });
        done();
        sessionStorage.removeItem("master_siswa_cache");
        window.customAlert(`👑 Pemutihan siswa perorangan berhasil!`);
      } else if (act === "RESET_PIN_SISWA") {
        const docRef = doc(window.db, "siswa", nisnTarget);
        const docSnap = await getDoc(docRef);
        let riwayatList = docSnap.exists() ? docSnap.data().riwayat || [] : [];

        riwayatList.unshift({
          t: `RESET PIN AKUN: ${notes}`,
          p: 0,
          loc: "Ruang BK / Admin",
          d: timestampStr,
        });

        await updateDoc(docRef, {
          pin: "123456",
          hasChangedPin: false,
          riwayat: riwayatList,
        });

        done();
        sessionStorage.removeItem("master_siswa_cache");
        window.customAlert(`🔑 PIN siswa berhasil di-reset menjadi '123456'!`);
      }

      document.getElementById("formAdminAction").reset();
      window.handleAdminActionTypeChange();
      loadMasterSiswaFromCloud();
    } catch (err) {
      done();
      console.error("Gagal menjalankan aksi Admin:", err);
      window.customAlert("Gagal mengeksekusi perintah ke database Firestore.");
    }
  });
};

window.renderQuestUI = function (tipe) {
  const btnPres = document.getElementById("tabQuestPrestasi");
  const btnPelang = document.getElementById("tabQuestPelanggaran");
  const container = document.getElementById("questContainerUI");

  if (tipe === "prestasi") {
    btnPres.style.background = "#3498db";
    btnPres.style.color = "white";
    btnPelang.className = "btn-outline";
    btnPelang.style.color = "#e74c3c";

    let html = `<div class="accordion">
              <div class="accordion-header" onclick="toggleAccordion(this)"><span>⭐ Daftar Penghargaan (Reward)</span><span>▼</span></div>
              <div class="accordion-body active">`;
    dataPilihan.Prestasi.forEach((item) => {
      html += `<div class="q-item"><span>${item.t}</span> <span class="badge-shield">+${item.p}</span></div>`;
    });
    html += `</div></div>`;
    container.innerHTML = html;
  } else {
    btnPelang.style.background = "#e74c3c";
    btnPelang.style.color = "white";
    btnPres.className = "btn-outline";
    btnPres.style.color = "#3498db";

    let html = "";
    ["Ringan", "Sedang", "Berat"].forEach((k, idx) => {
      html += `<div class="accordion">
               <div class="accordion-header" onclick="toggleAccordion(this)"><span>⚠️ Pelanggaran ${k}</span><span>▼</span></div>
               <div class="accordion-body ${idx === 0 ? "active" : ""}">`;
      dataPilihan.Pelanggaran[k].forEach((item) => {
        html += `<div class="q-item"><span>${item.t}</span> <span class="badge-hp">-${item.p}</span></div>`;
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

window.addEventListener("DOMContentLoaded", () => {
  loadMasterSiswaFromCloud(() => {
    loadTugasAktif();

    const savedUser = localStorage.getItem("loggedInUser");
    if (savedUser) {
      try {
        const userObj = JSON.parse(savedUser);
        currentRole = userObj.role;
        if (userObj.role === "Super Admin") {
          document.getElementById("txtNamaAdmin").innerText = userObj.nama;
          showScreen("admin");
          window.switchAdminTab("rekap");
        } else {
          document.getElementById("txtNamaGuru").innerText = userObj.nama;
          document.getElementById("txtRoleGuru").innerText =
            "Jabatan: " + userObj.role;
          showScreen("entry");
          initFormEntry();
          window.switchTeacherTab("poin");
          loadTugasAktif();
        }
        return;
      } catch (e) {
        localStorage.removeItem("loggedInUser");
      }
    }

    const savedNisn = localStorage.getItem("activeUser");
    if (savedNisn) {
      showScreen("siswa");
      document.getElementById("nisnSiswaInput").value = savedNisn;
      autoLoginSiswa(savedNisn);
    }
  });
});

window.addEventListener("popstate", (event) => {
  if (event.state && event.state.screen) {
    showScreen(event.state.screen, false);
  } else {
    showScreen("menu", false);
  }
});

// ==========================================
// SISTEM CETAK & EKSPOR LAPORAN ADMIN
// ==========================================
window.handleCetakKategoriChange = function () {
  const kategori = document.getElementById("cetakKategori").value;
  const boxKelas = document.getElementById("boxCetakKelas");
  const boxSiswa = document.getElementById("boxCetakSiswa");

  boxKelas.classList.add("hidden");
  boxSiswa.classList.add("hidden");

  if (kategori === "kelas") {
    boxKelas.classList.remove("hidden");
  } else if (kategori === "siswa") {
    boxSiswa.classList.remove("hidden");
    renderPilihanSiswaCetak(masterDataSiswa);
  }
};

function renderPilihanSiswaCetak(dataArray) {
  const selectEl = document.getElementById("cetakSiswaSelect");
  if (!selectEl) return;

  let html = "";
  dataArray.forEach((s) => {
    html += `<option value="${s.nisn}">${s.nama} (${s.kelas})</option>`;
  });
  selectEl.innerHTML =
    html || '<option value="">Tidak ada siswa ditemukan</option>';
}

window.filterPilihanSiswaCetak = function () {
  const keyword = document
    .getElementById("searchSiswaInput")
    .value.toLowerCase();
  const filtered = masterDataSiswa.filter(
    (s) => s.nama.toLowerCase().includes(keyword) || s.nisn.includes(keyword),
  );
  renderPilihanSiswaCetak(filtered);
};

window.prosesCetakLaporanWithLoading = async function () {
  const kategori = document.getElementById("cetakKategori").value;
  let targetData = [...masterDataSiswa];
  let judulLaporan = "REKAPITULASI KESELURUHAN SISWA - SMK WIRAGUNA";

  if (kategori === "kelas") {
    const kelasPilih = document.getElementById("cetakKelasSelect").value;
    targetData = masterDataSiswa.filter((s) => s.kelas === kelasPilih);
    judulLaporan = `REKAPITULASI KEDISIPLINAN KELAS ${kelasPilih} - SMK WIRAGUNA`;
  } else if (kategori === "siswa") {
    const nisnPilih = document.getElementById("cetakSiswaSelect").value;
    if (!nisnPilih) return window.customAlert("Pilih siswa terlebih dahulu!");
    const siswaObj = masterDataSiswa.find((s) => s.nisn === nisnPilih);
    if (!siswaObj) return window.customAlert("Data siswa tidak ditemukan.");
    targetData = [siswaObj];
    judulLaporan = `LAPORAN DETAIL SISWA: ${siswaObj.nama.toUpperCase()} (${siswaObj.kelas})`;
  }

  if (targetData.length === 0) {
    return window.customAlert(
      "Tidak ada data untuk dicetak berdasarkan filter tersebut.",
    );
  }

  showGamePreloader("MENYIAPKAN DOKUMEN LAPORAN...", (done) => {
    setTimeout(() => {
      done();
      cetakLaporanKeJendelaBaru(targetData, judulLaporan);
    }, 600);
  });
};

function cetakLaporanKeJendelaBaru(dataSiswa, judul) {
  let printWindow = window.open("", "_blank");
  let htmlContent = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>${judul}</title>
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
        <h4>${judul}</h4>
        <p style="text-align: center; font-size: 10px; color: #555; margin-top: 5px;">Dicetak otomatis melalui Sistem Tatib SMK Wiraguna pada ${new Date().toLocaleDateString("id-ID")}</p>
      </div>
      <table>
        <thead>
          <tr>
            <th>No</th>
            <th>NISN</th>
            <th>Nama Siswa</th>
            <th>Kelas</th>
            <th>HP / Shield</th>
            <th>Total Prestasi</th>
            <th>Total Pelanggaran</th>
          </tr>
        </thead>
        <tbody>
  `;

  dataSiswa.forEach((s, idx) => {
    htmlContent += `
      <tr>
        <td>${idx + 1}</td>
        <td>${s.nisn || "-"}</td>
        <td><b>${s.nama}</b></td>
        <td>${s.kelas}</td>
        <td>HP: ${s.hp || 200} | Shld: ${s.shield || 0}</td>
        <td>${s.totalPrestasi || 0} Pts</td>
        <td>${s.totalPelanggaran || 0} Pts</td>
      </tr>
    `;
  });

  htmlContent += `
        </tbody>
      </table>
      <div class="footer">
        <div><br><br>Mengetahui,<br><b>Kepala Sekolah / Tim BK</b></div>
        <div>Garut, ${new Date().toLocaleDateString("id-ID")}<br><br><b>Petugas / Admin</b></div>
      </div>
      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

// ==========================================
// FITUR GANTI FOTO PROFIL SISWA & CROPPER
// ==========================================
let cropperInstance = null;

window.cekBatasGantiAvatar = async function (nisnSiswa) {
  const { doc, getDoc } = window.fbFirestore;
  const docRef = doc(window.db, "siswa", nisnSiswa);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) return false;

  const data = docSnap.data();
  const lastChange = data.lastAvatarChange || 0;
  const enamBulanMs = 180 * 24 * 60 * 60 * 1000;
  const sekarang = Date.now();

  if (lastChange === 0 || sekarang - lastChange >= enamBulanMs) {
    return true;
  } else {
    const sisaHari = Math.ceil(
      (enamBulanMs - (sekarang - lastChange)) / (1000 * 60 * 60 * 24),
    );
    window.customAlert(
      `⚠️ Maaf, jatah ganti foto mandiri baru bisa digunakan lagi dalam ${sisaHari} hari ke depan (1x per semester). Silakan hubungi Wali Kelas jika ingin mengubahnya sekarang.`,
    );
    return false;
  }
};

window.bukaModalGantiFoto = async function () {
  const myNisn =
    window.currentStudentNisn ||
    document.getElementById("nisnSiswaInput")?.value;
  if (!myNisn) {
    window.customAlert("⚠️ Silakan login terlebih dahulu!");
    return;
  }

  const bolehGanti = await window.cekBatasGantiAvatar(myNisn);
  if (bolehGanti) {
    document.getElementById("modalGantiFoto").classList.remove("hidden");

    const currentAvatar =
      window.currentStudentDataCache?.fotoUrl ||
      (window.currentStudentDataCache?.jk?.toUpperCase() === "P"
        ? "assets/foto_siswa/avatar_p.webp"
        : "assets/foto_siswa/avatar_l.webp");

    const imageElement = document.getElementById("imageToCrop");
    imageElement.src = currentAvatar;

    if (cropperInstance) {
      cropperInstance.destroy();
    }

    setTimeout(() => {
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
    }, 100);
  }
};

window.tutupModalGantiFoto = function () {
  if (cropperInstance) {
    cropperInstance.destroy();
    cropperInstance = null;
  }
  document.getElementById("modalGantiFoto").classList.add("hidden");
  document.getElementById("inputFileFotoSiswa").value = "";
};

window.handleFileSelectedForCrop = function (input) {
  const file = input.files[0];
  if (!file) return;

  if (!file.type.match(/image.*/)) {
    window.customAlert(
      "⚠️ Format file harus berupa gambar (JPG, PNG, atau WEBP)!",
    );
    return;
  }

  const reader = new FileReader();
  reader.onload = function (event) {
    const imageElement = document.getElementById("imageToCrop");
    imageElement.src = event.target.result;

    if (cropperInstance) {
      cropperInstance.destroy();
    }

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
  };
  reader.readAsDataURL(file);
};

window.simpanFotoProfilBaru = async function () {
  if (!cropperInstance) {
    window.customAlert("⚠️ Silakan pilih berkas foto terlebih dahulu!");
    return;
  }

  const canvas = cropperInstance.getCroppedCanvas({
    width: 300,
    height: 300,
  });

  const croppedDataUrl = canvas.toDataURL("image/webp", 0.8);

  const myNisn =
    window.currentStudentNisn ||
    document.getElementById("nisnSiswaInput")?.value;
  if (!myNisn) return;

  try {
    const { doc, updateDoc } = window.fbFirestore;
    const docRef = doc(window.db, "siswa", myNisn);

    const dataUpdate = {
      fotoUrl: croppedDataUrl,
      lastAvatarChange: Date.now(),
    };

    await updateDoc(docRef, dataUpdate);

    if (window.currentStudentDataCache) {
      window.currentStudentDataCache.fotoUrl = croppedDataUrl;
      window.currentStudentDataCache.lastAvatarChange =
        dataUpdate.lastAvatarChange;
    }

    const avatarMain =
      document.getElementById("avatarSiswaMain") ||
      document.querySelector(".rpg-avatar-box img");
    if (avatarMain) {
      avatarMain.src = croppedDataUrl;
    }

    window.customAlert(
      "🎉 Berhasil! Foto profil kamu telah dipaskan dan diperbarui.",
    );
    window.tutupModalGantiFoto();
  } catch (error) {
    console.error("Gagal menyimpan foto:", error);
    window.customAlert(
      "❌ Terjadi kesalahan saat menyimpan foto ke server. Silakan coba lagi.",
    );
  }
};

// ==========================================
// FITUR RESET FOTO OLEH WALI KELAS (PANEL GURU)
// ==========================================
window.handleWaliKelasPilihKelas = function () {
  const kelas = document.getElementById("waliKelasSelectKelas").value;
  const selSiswa = document.getElementById("waliKelasSelectSiswa");

  if (!kelas) {
    selSiswa.innerHTML =
      '<option value="">-- Pilih siswa setelah pilih kelas --</option>';
    return;
  }

  let siswaHtml = '<option value="">-- Pilih Siswa --</option>';
  masterDataSiswa
    .filter((s) => s.kelas === kelas)
    .forEach((s) => {
      siswaHtml += `<option value="${s.nisn}">${s.nama} (NISN: ${s.nisn})</option>`;
    });
  selSiswa.innerHTML = siswaHtml;
};

window.eksekusiResetFotoOlehWaliKelas = async function () {
  const nisnTarget = document.getElementById("waliKelasSelectSiswa").value;

  if (!nisnTarget) {
    return window.customAlert(
      "⚠️ Silakan pilih kelas dan nama siswa terlebih dahulu!",
    );
  }

  const siswaObj = masterDataSiswa.find((s) => s.nisn === nisnTarget);
  const namaSiswa = siswaObj ? siswaObj.nama : nisnTarget;

  const konfirmasi = await window.customConfirm(
    `Apakah Anda yakin ingin mereset foto profil untuk siswa **${namaSiswa}**? Siswa akan dapat mengganti fotonya kembali secara mandiri.`,
  );
  if (!konfirmasi) return;

  showGamePreloader("MENGEKSEKUSI RESET FOTO...", async (done) => {
    try {
      const { doc, updateDoc } = window.fbFirestore;
      const docRef = doc(window.db, "siswa", nisnTarget);

      await updateDoc(docRef, {
        fotoUrl: "",
        lastAvatarChange: 0,
      });

      done();
      sessionStorage.removeItem("master_siswa_cache");

      window.customAlert(
        `✅ Berhasil! Foto profil untuk ${namaSiswa} telah di-reset oleh Wali Kelas.`,
      );

      document.getElementById("waliKelasSelectKelas").value = "";
      document.getElementById("waliKelasSelectSiswa").innerHTML =
        '<option value="">-- Pilih siswa setelah pilih kelas --</option>';

      loadMasterSiswaFromCloud();
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
    document.getElementById("avatarSiswaMain")?.src ||
    (window.currentStudentDataCache?.jk?.toUpperCase() === "P"
      ? "assets/foto_siswa/avatar_p.webp"
      : "assets/foto_siswa/avatar_l.webp");

  document.getElementById("imgPreviewBesar").src = currentAvatar;
  document.getElementById("modalPreviewFoto").classList.remove("hidden");
};

window.tutupPreviewFoto = function (event) {
  document.getElementById("modalPreviewFoto").classList.add("hidden");
};

// ==========================================
// SISTEM GLOBAL CHAT SEKOLAH (RPG CHATBOX)
// ==========================================
let globalChatActiveListener = null;

window.toggleGlobalChat = function () {
  const bodyEl = document.getElementById("globalChatBody");
  const iconEl = document.getElementById("chatToggleIcon");
  if (!bodyEl || !iconEl) return;

  if (bodyEl.style.display === "none") {
    bodyEl.style.display = "block";
    iconEl.innerText = "▲ Sembunyikan";
  } else {
    bodyEl.style.display = "none";
    iconEl.innerText = "▼ Tampilkan";
  }
};

window.initGlobalChat = function (siswaAktif) {
  const container = document.getElementById("globalChatContainer");
  const inputEl = document.getElementById("inputGlobalChat");
  const btnKirim = document.getElementById("btnKirimGlobalChat");

  if (!container || !inputEl || !btnKirim) return;

  if (globalChatActiveListener) {
    globalChatActiveListener();
    globalChatActiveListener = null;
  }

  try {
    const { collection, query, limit, onSnapshot, addDoc } = window.fbFirestore;
    const globalChatRef = collection(window.db, "global_chat");
    const q = query(globalChatRef, limit(50));

    container.innerHTML = `<div style="font-size: 10px; color: #888; text-align: center; margin-top: 50px;">Memuat obrolan global...</div>`;

    globalChatActiveListener = onSnapshot(
      q,
      (snapshot) => {
        if (snapshot.empty) {
          container.innerHTML = `<div style="font-size: 10px; color: #888; text-align: center; margin-top: 50px;">Belum ada percakapan global hari ini. Yuk mulai sapa teman-temanmu! 👋</div>`;
          return;
        }

        let messages = [];
        snapshot.forEach((docSnap) => {
          messages.push(docSnap.data());
        });

        messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        let chatHtml = "";
        messages.forEach((msg) => {
          const isMe = msg.nisn === siswaAktif.nisn;
          const bubbleBg = isMe
            ? "background: #1e3c72; color: #fff; margin-left: auto;"
            : "background: #1a2536; color: #cbd5e1; border: 1px solid #34495e;";
          const namaPengirim = isMe ? "Kamu" : msg.nama || "Siswa";
          const waktuStr = msg.time || "";

          chatHtml += `
        <div style="${bubbleBg} padding: 6px 10px; border-radius: 8px; margin-bottom: 6px; max-width: 85%; font-size: 10.5px; word-break: break-word;">
          <div style="font-size: 9px; font-weight: bold; color: ${isMe ? "#f1c40f" : "#38bdf8"}; margin-bottom: 2px; display: flex; justify-content: space-between;">
            <span>${namaPengirim} (${msg.kelas || "-"})</span>
            <span style="font-size: 7.5px; opacity: 0.7; color: #fff;">${waktuStr}</span>
          </div>
          <div>${escapeHtml(msg.text)}</div>
        </div>
        `;
        });

        container.innerHTML = chatHtml;
        container.scrollTop = container.scrollHeight;
      },
      (error) => {
        console.error("Error listener global chat:", error);
        container.innerHTML = `<div style="font-size: 10px; color: #e74c3c; text-align: center; margin-top: 50px;">Gagal memuat Global Chat. Periksa console (F12).</div>`;
      },
    );

    btnKirim.onclick = async function () {
      const text = inputEl.value.trim();
      if (!text) return;

      // BATASAN ANTI-SPAM: Maksimal 250 karakter untuk Global Chat Sekolah
      if (text.length > 250) {
        return window.customAlert(
          `⚠️ Pesan terlalu panjang (${text.length}/250 karakter). Maksimal 250 karakter per pesan agar terhindar dari spam!`,
        );
      }

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      try {
        await addDoc(collection(window.db, "global_chat"), {
          nisn: siswaAktif.nisn,
          nama: siswaAktif.nama,
          kelas: siswaAktif.kelas || "-",
          text: text,
          time: timeStr,
          timestamp: Date.now(),
        });
        inputEl.value = "";
      } catch (err) {
        console.error("Gagal mengirim pesan global:", err);
        window.customAlert("Gagal mengirim pesan. Periksa koneksi internetmu.");
      }
    };

    inputEl.onkeydown = function (e) {
      if (e.key === "Enter") {
        btnKirim.click();
      }
    };
  } catch (err) {
    console.error("Gagal menginisialisasi global chat:", err);
    container.innerHTML = `<div style="font-size: 10px; color: #e74c3c; text-align: center; margin-top: 50px;">Gagal memuat Global Chat.</div>`;
  }
};

// ==========================================
// MONITORING GLOBAL CHAT OLEH ADMIN
// ==========================================
let adminGlobalChatListener = null;

window.loadAdminGlobalChat = function () {
  const container = document.getElementById("adminGlobalChatContainer");
  if (!container) return;
  container.innerHTML = `<div style="text-align: center; color: #888;">Memuat Global Chat...</div>`;

  try {
    const { collection, query, limit, onSnapshot } = window.fbFirestore;
    const globalChatRef = collection(window.db, "global_chat");
    const q = query(globalChatRef, limit(100));

    if (adminGlobalChatListener) adminGlobalChatListener();

    adminGlobalChatListener = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        container.innerHTML = `<div style="text-align: center; color: #888;">Belum ada pesan di Global Chat.</div>`;
        return;
      }

      let messages = [];
      snapshot.forEach((docSnap) => {
        messages.push({ id: docSnap.id, ...docSnap.data() });
      });

      // Urutkan berdasarkan waktu
      messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      let html = "";
      messages.forEach((msg) => {
        html += `
        <div style="background: #1a2536; border: 1px solid #34495e; padding: 6px 8px; border-radius: 6px; margin-bottom: 4px;">
          <div style="display: flex; justify-content: space-between; font-weight: bold; color: #f1c40f; font-size: 9.5px; margin-bottom: 2px;">
            <span>👤 ${msg.nama || "Siswa"} (${msg.kelas || "-"} - ${msg.nisn})</span>
            <span style="color: #94a3b8; font-size: 8px;">${msg.time || ""}</span>
          </div>
          <div style="color: #fff; font-size: 10.5px;">${escapeHtml(msg.text)}</div>
        </div>
        `;
      });

      container.innerHTML = html;
      container.scrollTop = container.scrollHeight;
    });
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
      const { collection, getDocs, doc, deleteDoc } = window.fbFirestore;
      const globalChatRef = collection(window.db, "global_chat");
      const snapshot = await getDocs(globalChatRef);

      const deletePromises = [];
      snapshot.forEach((docSnap) => {
        deletePromises.push(
          deleteDoc(doc(window.db, "global_chat", docSnap.id)),
        );
      });

      await Promise.all(deletePromises);
      done();
      window.customAlert(
        "✅ Seluruh isi Global Chat berhasil dibersihkan oleh Admin!",
      );
      loadAdminGlobalChat();
    } catch (err) {
      done();
      console.error("Gagal menghapus global chat:", err);
      window.customAlert("Gagal menghapus pesan Global Chat.");
    }
  });
};
