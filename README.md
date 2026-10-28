# 🛡️ Tatib SMK Wiraguna Limbangan

> Modern Student Discipline & Character Management System with a Gamification Twist.

[![Status](https://img.shields.io/badge/Status-Active-success?style=flat-square)]()
[![Platform](https://img.shields.io/badge/Platform-Web-blue?style=flat-square)]()
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
* **Auto-Login Sesi:** Siswa tidak akan terlempar ke halaman login saat halaman di-*refresh*.

### 2. 👥 Squad & Real-Time Chat (Fitur Sosial)
* **Sistem Squad:** Undang teman se-sekolah menggunakan NISN untuk membentuk kelompok pertemanan.
* **Online Status Engine:** Deteksi status *Online/Offline* teman di Squad secara *real-time* berbasis sinkronisasi Cloud Firestore.
* **Messenger 1-on-1:** Ruang obrolan pribadi antar siswa dilengkapi indikator centang terkirim (`✓`) & terbaca (`✓✓`), serta pembersihan pesan otomatis demi privasi.

### 3. 📸 Profile Customization & Cropper.js
* Ganti foto profil mandiri (dibatasi 1x per semester) dengan fitur potong (*crop*) bentuk lingkaran interaktif menggunakan *Cropper.js*.
* **Preview Foto Gaya Facebook:** Klik avatar untuk melihat foto profil dalam ukuran besar.
* Fitur reset foto khusus oleh Wali Kelas.

### 4. 👨‍🏫 Teacher & Staff Portal (Petugas/Guru)
* Pencatatan input poin prestasi atau pelanggaran secara terstruktur (berdasarkan mode satu siswa atau banyak siswa sekaligus / *Multi-Mode*).
* Publikasi Tugas & PR kelas yang langsung terintegrasi dengan *Task Board* siswa.
* **Cetak & Ekspor Laporan:** Pembuatan laporan rekapitulasi kedisiplinan siap cetak (*Print-Ready*) per kelas atau per siswa.

### 5. 👑 Super Admin Panel
* **Pemutihan & Reset Data:** Kontrol penuh untuk melakukan pemutihan penuh (*Full Reset*) atau reset poin harian (*Daily Reset*) secara global, per kelas, maupun perorangan.
* **Monitoring Chat Global:** Panel khusus bagi admin untuk memantau dan mengelola seluruh percakapan aktif siswa.
* Reset PIN akun siswa kembali ke default (`123456`) jika mengalami kendala akses.

---

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3 (Modern Flexbox/Grid, Glassmorphism UI), Vanilla JavaScript (ES6 Modules).
* **Backend & Database:** Firebase Authentication & Cloud Firestore.
* **Libraries:** Cropper.js (Image Cropping), Chart.js (Admin Analytics).

---

## 🔐 Hak Akses & Keamanan
* **Siswa:** Login menggunakan NISN & PIN (Default: `123456`, dapat diubah mandiri).
* **Guru / Petugas:** Login menggunakan kredensial email resmi yang terdaftar di sistem Firebase Auth.
* **Super Admin:** Akses kontrol penuh atas pemeliharaan dan pemutihan data kedisiplinan sekolah.
