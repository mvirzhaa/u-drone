# Panduan Deployment & Setup udrone

Dokumen ini berisi panduan setup lokal, push ke GitHub, serta konfigurasi Nginx untuk domain `utility.uika-bogor.ac.id/u-drone`.

---

## 1. Menjalankan di Lokal

### Development Mode
Untuk memodifikasi kode dengan fitur *hot reload*:
```bash
npm run dev
```
Akses di browser: `http://localhost:5173` (dapat juga dibuka dari HP pada jaringan Wi-Fi yang sama).

### Test Fisika
Untuk memvalidasi integritas model fisika quadcopter, kurva rate, dan collision:
```bash
npm run test:physics
```

### Build Web Produksi
Hasil kompilasi akan masuk ke folder `dist/` (dan disinkronkan ke folder `web/`):
```bash
npm run build
```

### Build Single File HTML
Untuk menghasilkan 1 berkas HTML mandiri yang dapat dibuka langsung tanpa server (klik ganda di Windows):
```bash
npx vite build -c vite.single.config.js
```
Hasil berada di `dist-single/index.html`.

### Sinkronisasi ke Android Studio (Capacitor)
```bash
npm run android:sync
npm run android:open
```

---

## 2. Push ke GitHub

1. Buat repositori baru di GitHub (misal: `u-drone`).
2. Sambungkan remote dan push branch `main`:
   ```bash
   git remote add origin https://github.com/<username-github>/u-drone.git
   git push -u origin main
   ```
3. GitHub Actions otomatis mem-build APK Android via workflow `.github/workflows/build-apk.yml`.
   APK siap dipasang dapat diunduh pada tab **Actions** → pilih run terbaru → bagian **Artifacts** (`udrone-apk`).

---

## 3. Deployment ke Server (`server-utility`)

### 3.1. Clone Repositori di Server
Masuk ke server via SSH:
```bash
ssh root@server-utility
cd /var/www
git clone https://github.com/<username-github>/u-drone.git
```
*(Bila repo berstatus private, gunakan SSH key atau Personal Access Token GitHub)*.

Pastikan permission direktori sudah sesuai untuk web server Nginx:
```bash
chown -R www-data:www-data /var/www/u-drone/web
chmod -R 755 /var/www/u-drone/web
```

---

## 4. Konfigurasi Nginx Server

Edit konfigurasi Nginx di server:
```bash
nano /etc/nginx/sites-enabled/utility.uika-bogor.ac.id
```

Tambahkan blok berikut tepat setelah blok `# 5. UIKA Form (U-Form)`:

```nginx
    # =========================================================
    # 6. UIKA Drone (U-Drone - Simulator FPV 3D)
    # =========================================================
    location = /u-drone {
        return 301 /u-drone/;
    }
    location /u-drone/ {
        alias /var/www/u-drone/web/;
        index index.html;

        # Cache static assets untuk performa maksimal
        location ~* \.(?:css|js|svg|png|jpg|webp|woff2?)$ {
            expires 30d;
            add_header Cache-Control "public, no-transform";
        }

        # Service worker & manifest agar update selalu terdeteksi
        location ~* (sw\.js|manifest\.webmanifest)$ {
            expires -1;
            add_header Cache-Control "no-store, no-cache, must-revalidate";
        }
    }
```

Uji dan reload Nginx:
```bash
nginx -t
systemctl reload nginx
```

Setelah di-reload, akses langsung via browser:
`https://utility.uika-bogor.ac.id/u-drone/`
