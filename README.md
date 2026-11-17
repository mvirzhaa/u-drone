# udrone — Simulator Drone FPV (Web + Android)

Simulator balap dan freestyle drone FPV yang terinspirasi VelociDrone. Dibuat dengan Three.js (web) dan Capacitor (Android). Satu basis kode untuk kedua platform.

## Fitur
- **7 drone**: 5" Freestyle, 5" Race, 3" Cinewhoop, Tiny Whoop 65 mm, 3" Toothpick, 7" Long Range, X-Class. Masing-masing punya massa, dorong, hambatan, respons motor, otoritas sudut, uptilt kamera, dan rates sendiri.
- **6 peta**:
  - **Stadion Balap**: 8 gerbang.
  - **Lapangan Terbuka**: padang rumput 320 × 320 m berpagar dengan batas tak terlihat (dinding dan langit-langit 150 m). Isinya lumbung, silo, 2 kincir angin dengan bilah berputar yang bisa ditabrak, jerami, pohon, cone slalom, dan bando. 8 gerbang.
  - **Pantai**: terrain pasir hingga laut, air beranimasi (jatuh ke air = crash), dermaga, 6 perahu layar yang bergoyang, pulau kecil, tanjung berbatu, pohon kelapa, payung, menara penjaga, pondok, dan pelampung. 8 gerbang, sebagian di atas air.
  - **Pegunungan**: lembah dikelilingi gunung bersalju, danau, sekitar 380 pinus, batu, 2 pondok, dan 6 beruang (5 berjalan, 1 diam di tepi danau; semuanya bisa ditabrak). 7 gerbang.
  - **Kawasan Industri**: gedung, jembatan, kontainer, pohon. 7 gerbang.
  - **Gudang Whoop**: ruang tertutup, 7 gerbang kecil.
- **Mode balap**: gerbang berurutan dengan penanda gerbang berikutnya, waktu lap, rekor per peta dan drone, serta **ghost** lap terbaik (mirip mode Nemesis, tetapi lokal).
- **Mode freestyle**: terbang bebas.
- **Mode terbang**: Acro, Angle, dan bantuan ketinggian opsional untuk pemula.
- **Kamera**: FPV (uptilt dan FOV bisa diatur), Chase, LOS (dari posisi pilot), efek video analog.
- **Kontrol**: stik layar sentuh (Mode 1/2), radio transmitter via USB OTG (mode joystick HID), gamepad USB/Bluetooth, dan keyboard. Tersedia wizard kalibrasi dan pemetaan saklar ARM.
- **OSD**: tegangan baterai per sel, waktu terbang, kecepatan, ketinggian, throttle, mode, dan status arm.
- **PWA**: bisa dipasang dari peramban dan dimainkan luring.

## Model fisika (`src/physics.js`)
- Integrasi tetap 400 Hz, terpisah dari frame rate.
- Kurva rate Betaflight (RC Rate, Super Rate, Expo).
- Pengendali laju sudut dengan batas percepatan sudut per drone (otoritas motor).
- Respons motor orde-1 (spool-up), kurva dorong mendekati kuadrat.
- Dorong berkurang seiring kecepatan aliran masuk, sehingga ada batas kecepatan alami.
- Hambatan udara kuadratik dan linear, berbeda per sumbu badan (depan, samping, atas).
- Airmode, prop wash, serta sag dan kapasitas baterai.
- Tumbukan bola vs kotak berotasi atau silinder: pantulan, gesekan, putaran. Crash bila benturan melewati batas drone (whoop tahan banting).

Hasil `npm run test:physics`:

| Drone | TWR | Hover | Puncak (miring 65°) | Rate maks | Respons 90% |
|---|---|---|---|---|---|
| 5" Freestyle | 6,9 | 27% | 110 km/j | 667°/s | 60 ms |
| 5" Race | 10,2 | 20% | 130 km/j | 625°/s | 48 ms |
| 3" Cinewhoop | 3,8 | 42% | 49 km/j | 340°/s | 92 ms |
| Tiny Whoop 65 | 3,3 | 46% | 29 km/j | 400°/s | 108 ms |
| 3" Toothpick | 5,2 | 34% | 70 km/j | 571°/s | 68 ms |
| 7" Long Range | 3,7 | 43% | 93 km/j | 340°/s | 106 ms |
| X-Class | 4,2 | 39% | 112 km/j | 291°/s | 196 ms |

Waktu terbang hover 5" Freestyle sekitar 6 menit.

## Menjalankan versi web
```bash
npm install
npm run dev        # server pengembangan (http://localhost:5173, juga bisa dibuka dari HP di jaringan yang sama)
npm run build      # hasil di dist/
npm run preview
```

## Android (proyek sudah dibuat, APK belum dibangun)
Folder `android/` adalah proyek Android Studio (Capacitor 6, ID aplikasi `com.udrone.app`): orientasi landscape, layar penuh imersif, dan layar tetap menyala.
```bash
npm run android:sync   # build web + salin ke android/
npm run android:open   # buka di Android Studio, lalu Run atau Build APK
```
Butuh Android Studio dengan JDK 17 dan Android SDK.

## Membuat APK
**Cara 1 — GitHub Actions (tanpa memasang apa pun):** unggah folder ini ke repositori GitHub. Workflow `.github/workflows/build-apk.yml` akan berjalan otomatis, atau jalankan manual dari tab **Actions → Build APK udrone → Run workflow**. Setelah selesai (sekitar 5–8 menit), unduh **udrone-apk** di bagian Artifacts, ekstrak, lalu pasang `udrone.apk` di HP (izinkan "instal dari sumber tidak dikenal").

**Cara 2 — Android Studio:** `npm install`, `npm run android:sync`, `npm run android:open`, lalu pilih **Build → Build APK(s)**.

APK yang dihasilkan adalah versi *debug*: bisa langsung dipasang dan dimainkan, tetapi belum ditandatangani untuk Google Play.

## Berkas web siap pakai
- `npm run build` menghasilkan folder `dist/` untuk diunggah ke hosting statis apa pun (Netlify, GitHub Pages, Vercel, hosting kampus). Di Android versi ini bisa dipasang ke layar utama (PWA) dan dimainkan luring.
- `npx vite build -c vite.single.config.js` menghasilkan satu berkas `dist-single/index.html` yang bisa dibuka langsung tanpa server.

## Menyambungkan radio di Android
1. Di radio (EdgeTX/OpenTX): sambungkan kabel USB lalu pilih **USB Joystick (HID)**.
2. Sambungkan ke ponsel dengan kabel/adaptor **OTG**.
3. Gerakkan stik, buka **Menu → Kontrol**, lalu jalankan **Kalibrasi kontroler**.

## Struktur
```
src/physics.js   model fisika quad + tumbukan
src/drones.js    preset 7 drone
src/world.js     peta dasar, gerbang, collider
src/maps-extra.js  Lapangan Terbuka, Pantai, Pegunungan + aset (perahu, beruang, pohon, dll.)
src/terrain.js   heightfield (tumbukan = mesh), noise, air
src/race.js      urutan gerbang, lap, ghost
src/input.js     stik sentuh, gamepad/radio, keyboard, wizard kalibrasi
src/model.js     model 3D drone prosedural
src/main.js      loop utama, kamera, OSD, menu
tests/physics.test.js
```
