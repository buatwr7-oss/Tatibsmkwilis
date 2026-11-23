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
// ==========================================================================
export const FITUR = {
  riwayatSiswa: true,
  riwayatKelasSebelumnya: false,
  alumniMode: "perpisahan",
};
