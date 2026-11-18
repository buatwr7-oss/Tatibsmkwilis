// ==========================================================================
// ATURAN & POIN — Tatib SMK Wiraguna
// ==========================================================================
// Satu-satunya tempat untuk mengubah daftar aturan. Aplikasi (app.js) hanya
// membacanya, jadi sekolah lain cukup mengganti isi file ini.
//
// Format setiap butir:  { t: "Teks kejadian", p: poin }
//   - Prestasi     : poin menambah (mengisi HP dulu, sisanya jadi Shield, maks 300)
//   - Pelanggaran  : dikelompokkan Ringan / Sedang / Berat; poin MENGURANGI
//                    (Shield dulu, sisanya baru HP)
//   - TugasHarian  : hanya menambah poin harian (leaderboard), tidak memengaruhi HP/Shield
//
// Catatan:
//   - Riwayat siswa menyimpan teks (t) apa adanya. Mengubah teks butir lama tidak
//     mengubah riwayat yang sudah tercatat. Menambah butir baru aman.
//   - Poin (p) selalu angka bulat positif; tanda tambah/kurang diatur oleh kategorinya.
//   - Setelah mengubah file ini, naikkan nomor versi (index.html, app.js, sw.js)
//     supaya HP pengguna memuat ulang.
// ==========================================================================

export const dataPilihan = {
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
