# 🛡️ Tatib SMK Wiraguna Limbangan

> Modern Student Discipline & Character Management System with a Gamification Twist.

[![Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)]()
[![Version](https://img.shields.io/badge/Version-5.0.0%20Beta-informational?style=flat-square)]()
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20PWA-blue?style=flat-square)]()
[![Tech](https://img.shields.io/badge/Tech-HTML5%20%7C%20CSS3%20%7C%20JavaScript-orange?style=flat-square)]()
[![Backend](https://img.shields.io/badge/Backend-Firebase%20Firestore-yellow?style=flat-square&logo=firebase)]()

---

## 📌 About Project

**Tatib SMK Wiraguna** adalah aplikasi web interaktif yang dirancang khusus untuk mengelola tata tertib, catatan prestasi, dan pelanggaran siswa secara digital. Mengusung konsep *Gamification* ala game RPG (*Role-Playing Game*), sistem ini memvisualisasikan kedisiplinan siswa ke dalam bentuk **Health Point (HP)**, **Shield Point**, serta status penanganan yang dinamis untuk menciptakan pengalaman monitoring yang transparan dan menarik.

---

## ✨ Core Features

### 1. 🛡️ RPG Character Status Portal (Siswa)
* Cek status kedisiplinan secara *real-time* menggunakan Nomor NIS / NISN & PIN Keamanan.
* Visualisasi bar *Health Point* (HP) dan *Shield Point* layaknya game klasik.
* Sistem tier rank/badge otomatis (seperti *Novice*, *Iron Squire*, hingga *Mythic Legend*).
* **Riwayat Kejadian & Poin** periode berjalan, lengkap dengan perubahan HP/Shield sebelum dan sesudah.
* **Auto-Login Sesi:** Siswa tidak akan terlempar ke halaman login saat halaman di-*refresh*.

### 2. 👥 Squad & Real-Time Chat (Fitur Sosial)
* **Sistem Squad:** Undang teman se-sekolah menggunakan NISN untuk membentuk kelompok pertemanan.
* **Online Status Engine:** Deteksi status *Online/Offline* teman di Squad berbasis sinkronisasi Cloud Firestore (hemat kuota baca, hanya aktif saat tab dibuka).
* **Messenger 1-on-1 & Chat Global:** Ruang obrolan pribadi dan global dilengkapi indikator centang terkirim (`✓`) & terbaca (`✓✓`). Pesan otomatis dibersihkan setelah 7 hari demi privasi.
* **Duel Arena:** Game Tic-Tac-Toe antar siswa dengan sistem matchmaking.

### 3. 📸 Profile Customization & Cropper.js
* Ganti foto profil mandiri (dibatasi 1x per semester) dengan fitur potong (*crop*) bentuk lingkaran interaktif menggunakan *Cropper.js*.
* **Preview Foto Gaya Facebook:** Klik avatar untuk melihat foto profil dalam ukuran besar.
* Fitur reset foto oleh Wali Kelas, per siswa maupun satu kelas sekaligus.

### 4. 📜 Halaman Panduan
* Penjelasan **Poin Prestasi** dan **Poin Pelanggaran** beserta nilainya.
* **Poin Harian:** penjelasan bintang harian yang tampil di bawah foto profil.
* **Visi & Misi** sekolah.
* Isi aturan dan poin dikelola lewat berkas pengaturan sekolah (`aturan.js`), sehingga mudah disesuaikan.

### 5. 🌤️ Latar Dinamis Mengikuti Waktu & Cuaca
* Latar berganti otomatis mengikuti **waktu** (pagi, siang, sore, malam) lengkap dengan matahari, bulan, bintang, dan awan.
* Mengikuti **cuaca nyata** lokasi sekolah lewat [Open-Meteo](https://open-meteo.com/): *cerah*, *mendung*, *hujan ringan*, dan *hujan lebat*, lengkap dengan tulisan cuaca terkini (misalnya "Sore ini hujan ringan").
* **Mode Ambient:** setelah 5 menit tanpa aktivitas, menu memudar perlahan sehingga hanya pemandangan cuaca yang tampil. Ketuk layar untuk kembali.
* **Mode Ringan** otomatis di HP lemah (animasi dikurangi, efek kaca tanpa blur), dan bisa diatur manual dari panel admin.

### 6. 🏠 Tampilan Home Kaca (Glassmorphism)
* Jam dan tanggal, kartu transparan di atas latar cuaca, serta menu Portal Guru, Portal Siswa, Panduan, Top Global Rank, dan Papan Tugas.
* Tampil rapi dan berada di tengah layar, baik di HP maupun desktop.
* **Papan Tugas & Pengumuman:** PR aktif dari guru (berlaku ±1 minggu).

### 7. 👨‍🏫 Teacher & Staff Portal (Petugas/Guru)
* Pencatatan input poin prestasi atau pelanggaran secara terstruktur (berdasarkan mode satu siswa atau banyak siswa sekaligus / *Multi-Mode*).
* Publikasi Tugas & PR kelas yang langsung terintegrasi dengan *Task Board* siswa.
* **Wali Kelas:** fitur dibatasi pada kelas binaannya sendiri.
* **Tab Online:** melihat siswa yang sedang aktif.
* **Cetak & Ekspor Laporan:** Pembuatan laporan rekapitulasi kedisiplinan siap cetak (*Print-Ready*) per kelas atau per siswa.

### 8. 🏫 Portal Kepala Sekolah
* Role khusus `Kepala Sekolah` (field `role` pada dokumen `teachers/{email}` di Firestore) untuk memantau tanpa menginput data.
* **Monitoring Siswa:** melihat HP, Shield, poin harian, prestasi, dan pelanggaran siswa dari seluruh kelas (atau per kelas).
* **Monitoring Guru:** rekap per guru semester berjalan: jumlah poin harian, prestasi, pelanggaran yang diinput, tugas yang diposting (7 hari terakhir), serta tanggal input terakhir. Guru yang belum pernah input ditandai merah.

### 9. 👑 Super Admin Panel
* **Pemutihan & Reset Data:** Kontrol penuh untuk melakukan pemutihan penuh (*Full Reset*) atau reset poin harian (*Daily Reset*) secara global, per kelas, maupun perorangan, dengan konfirmasi ketik untuk aksi berbahaya dan riwayat tindakan.
* **Siklus Akademik:** *Ganti Semester*, *Kenaikan Kelas* (bisa dibatalkan), *Tambah Siswa Baru* secara massal, dan *Proses Kelulusan* ke status alumni.
* **Mode Maintenance:** menampilkan pemberitahuan di halaman awal dan mengeluarkan semua pengguna (kecuali Super Admin) selama pemeliharaan.
* **Monitoring Chat Global:** Panel khusus bagi admin untuk memantau dan mengelola seluruh percakapan aktif siswa.
* **Laporan Bug & Masukan:** pengguna dapat mengirim laporan, admin mengelolanya dari panel.
* **Rekap & Pratinjau:** ringkasan data dengan pencarian, pengurutan, dan filter, serta tab Pratinjau untuk mencoba suasana, cuaca, bingkai tier, dan simulasi HP/Shield.
* Reset PIN akun siswa kembali ke default (`123456`) jika mengalami kendala akses.

### 10. 🎓 Mode Alumni
* Siswa yang sudah lulus tetap dapat masuk dan melihat halaman perpisahan berisi satu pesan penyemangat dari guru ("masih keluarga SMK Wiraguna Limbangan").
* Data alumni tetap tersimpan.

---

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3 (Modern Flexbox/Grid, Glassmorphism UI), Vanilla JavaScript (ES6 Modules), PWA (Service Worker).
* **Backend & Database:** Firebase Authentication & Cloud Firestore (paket gratis Spark, dengan optimasi jatah baca: daftar siswa ringan, polling berkala, dan *lazy-load* pustaka).
* **Libraries:** Cropper.js (Image Cropping), Chart.js (Admin Analytics) — dimuat saat dibutuhkan.
* **Data Cuaca:** [Open-Meteo](https://open-meteo.com/).

---

## 🧩 Struktur & Pengaturan Sekolah

Pengaturan yang bersifat khusus sekolah dipisah dari kode utama:

| Berkas | Fungsi |
|---|---|
| `fitur.js` | Saklar fitur (mis. Mode Ambient, riwayat siswa, mode alumni) dan lama diam Mode Ambient |
| `aturan.js` | Daftar prestasi/pelanggaran beserta poin, serta Visi & Misi |
| `afirmasi.js` | Kalimat afirmasi harian untuk siswa dan guru |
| `pesan-alumni.js` | Pesan perpisahan untuk alumni |
| `ambient.js`, `ambient.css` | Latar dinamis waktu & cuaca |
| `sw.js` | Service Worker (cache & PWA) |

---

## 🔐 Hak Akses & Keamanan
* **Siswa:** Login menggunakan NISN & PIN (Default: `123456`, dapat diubah mandiri).
* **Guru / Petugas:** Login menggunakan kredensial email resmi yang terdaftar di sistem Firebase Auth.
* **Kepala Sekolah:** Login seperti guru (email Firebase Auth), hanya bisa melihat Monitoring Siswa & Monitoring Guru.
* **Super Admin:** Akses kontrol penuh atas pemeliharaan dan pemutihan data kedisiplinan sekolah.

---

## 🙏 Kredit
* Data cuaca oleh [Open-Meteo](https://open-meteo.com/) (CC BY 4.0).
