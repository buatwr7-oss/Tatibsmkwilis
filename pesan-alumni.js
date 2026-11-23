// ==========================================================================
// PESAN UNTUK ALUMNI — tampil di halaman alumni (setelah login)
// ==========================================================================
// CONTOH — silakan ganti dengan kata-kata asli dari para guru.
//
// Cara mengubah:
//   - "judul"  : tulisan besar di atas
//   - "pembuka": kalimat penyambung (boleh dikosongkan: "")
//   - "kata"   : daftar pesan; setiap butir { dari: "siapa", pesan: "isi pesan" }
//     Tambah / hapus / ganti butir sesuka hati; jumlahnya bebas.
//     Saran: tiap pesan maksimal ±220 karakter supaya enak dibaca di HP.
//   - Urutan daftar = urutan tampil.
//   - Setelah mengubah file ini, naikkan nomor versi (index.html, app.js, sw.js).
// ==========================================================================
export const PESAN_ALUMNI = {
  judul: "Kamu Tetap Bagian dari SMK Wiraguna Limbangan",
  pembuka:
    "Akun ini sudah tidak dipakai untuk poin dan catatan lagi, tapi pintu rumah ini tetap terbuka. Kamu alumni, dan kamu keluarga kami.",
  kata: [
    {
      dari: "Kepala Sekolah",
      pesan:
        "Di mana pun kamu melangkah, bawa nama baik sekolah dengan kejujuran dan kerja keras. Kami bangga pernah menjadi bagian dari perjalananmu.",
    },
    {
      dari: "Wali Kelas",
      pesan:
        "Kamu yang dulu sering kami ingatkan kini sudah siap menghadapi dunia. Jangan takut gagal, bangkit lagi itu yang membuat kamu kuat.",
    },
    {
      dari: "Guru Produktif",
      pesan:
        "Ilmu yang kamu pelajari di bengkel dan di kelas adalah bekalmu. Terus belajar, terus mencoba, dan jangan berhenti mengasah keterampilan.",
    },
    {
      dari: "Pembina Voli",
      pesan:
        "Semangat tim yang kamu pelajari di lapangan akan berguna di mana saja. Kemenangan datang dari kerja sama, kedisiplinan, dan tidak mudah menyerah.",
    },
    {
      dari: "Guru Mata Pelajaran",
      pesan:
        "Masa depanmu masih panjang dan terbuka lebar. Pegang disiplin, jaga sopan santun, dan jangan lupa berdoa dalam setiap langkah.",
    },
    {
      dari: "Seluruh Guru & Staf",
      pesan:
        "Sering-seringlah mampir ke sekolah. Ceritakan keberhasilanmu, karena itu kebanggaan terbesar kami. Sukses selalu, keluarga besar SMK Wiraguna Limbangan!",
    },
  ],
};
