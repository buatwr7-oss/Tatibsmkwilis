// ==========================================================================
// SAKLAR FITUR — Tatib SMK Wiraguna
// ==========================================================================
// Satu tempat untuk menyalakan / mematikan fitur tanpa menghapus kode.
// Ubah nilainya, lalu naikkan nomor versi (index.html, app.js, sw.js)
// supaya HP pengguna memuat ulang.
//
//  riwayatSiswa : true  = siswa aktif melihat "Riwayat Kejadian & Poin" dan
//                         "Riwayat Kelas/Semester Sebelumnya" di profilnya
//                 false = bagian riwayat disembunyikan (data TETAP tersimpan,
//                         guru/admin tetap bisa melihatnya)
//  riwayatKelasSebelumnya : true  = siswa aktif melihat tombol "Riwayat
//                         Kelas/Semester Sebelumnya" (mis. di kelas 11 masih
//                         bisa membuka poin saat kelas 10)
//                 false = tombol itu disembunyikan
//  alumniMode   : "perpisahan" = alumni login lalu hanya melihat nama, status
//                                ALUMNI, dan kata-kata dari para guru
//                                (isi: pesan-alumni.js)
//                 "transkrip"  = tampilan lama (transkrip riwayat per periode)
//  easterEgg    : true  = Mode Ambient: bila pengunjung diam di menu utama selama
//                         AMBIENT_DIAM_MS, semua menu memudar pelan-pelan dan
//                         yang tampil hanya pemandangan cuaca (bulan/matahari,
//                         awan, hujan, dst). Ketuk / tekan tombol -> menu kembali.
//                 false = mati total
// ==========================================================================
export const AMBIENT_DIAM_MS = 70000; // 70 detik
export const FITUR = {
  easterEgg: true,
  riwayatSiswa: true,
  riwayatKelasSebelumnya: false,
  alumniMode: "perpisahan",
};
