# Desain Sistem Peringatan Dini Bencana Berbasis Pengetahuan Lokal

**Judul Skripsi:** Integrasi Layanan Peringatan Bencana Berbasis Pengetahuan Lokal bagi Nelayan Desa Pesisir

**Tanggal:** 2026-05-08

---

## 1. Arsitektur Sistem

PWA sebagai **inti sistem** — bukan hanya receiver, tapi portal utama bagi nelayan untuk melaporkan dan menerima informasi.

### Komponen Utama

| Komponen | Teknologi | Fungsi |
|---|---|---|
| **Frontend** | Next.js 14+ (App Router) | PWA untuk nelayan |
| **Backend** | Hono + Bun (disaster-backend) | Distribution hub |
| **Database** | Redis | In-memory data store |
| **ML Service** | SHAP API | Prediksi risiko berbasis pengetahuan lokal |
| **WA Bridge** | OpenClaw | Integrasi WhatsApp |
| **IoT** | ESP32 | Trigger TOA masjid |
| **Cuaca** | BMKG API | Data cuaca resmi |

### Alur Data (dengan Reassurance Loop)

```
INPUT LAPORAN:
  PWA --> POST /api/report --> Backend (Hono)
  WA (OpenClaw) --> POST /api/report --> Backend (Hono)

PROSES (REASSURANCE LOOP):
  Step 1: Laporan masuk --> SHAP API (/predict) --> Prediksi risiko pengetahuan lokal
  Step 2: Backend ambil data BMKG untuk lokasi pantai yang sama
  Step 3: Reassurance -- bandingkan prediksi SHAP dengan data BMKG
  Step 4: Hasil reassurance --> update tingkat risiko & confidence
  Step 5: Simpan hasil final ke Redis --> distribusi ke semua channel

OUTPUT/DISTRIBUSI (hasil setelah reassurance):
  PWA (SSE real-time + histori + push notification)
  WA (OpenClaw --> notifikasi ke grup WA nelayan)
  TOA (ESP32 --> pengeras suara masjid, untuk risiko tinggi)
```

### Penjelasan Reassurance Loop

Reassurance Loop adalah mekanisme untuk **mengkonfirmasi ulang** prediksi pengetahuan lokal (SHAP) dengan data cuaca resmi (BMKG) agar output semakin akurat.

**Alur detail:**

1. **Prediksi Awal (SHAP API):**
   - Input: `lik_codes` (tanda alam yang dilaporkan) + `beach_location`
   - Output: `community_risk_behaviour` (Safe/Unsafe), `description`, `detected_signs`

2. **Reassurance (BMKG API):**
   - Backend fetch data BMKG untuk lokasi pantai yang sama
   - Data diambil: cuaca, kecepatan angin, tinggi gelombang, kelembaban, visibility
   - Bandingkan kondisi BMKG dengan prediksi SHAP

3. **Logika Reassurance:**

   | Prediksi SHAP | Data BMKG | Hasil Reassurance | Confidence |
   |---|---|---|---|
   | Unsafe | Cuaca buruk (angin >20kt, gelombang >2m, hujan) | **KONFIRMASI: BAHAYA** | Tinggi |
   | Unsafe | Cuaca normal | **TANDA ALAM TERDETEKSI** (peringatan rendah, catatan: BMKG aman) | Sedang |
   | Safe | Cuaca buruk | **PERINGATAN BMKG** (cuaca buruk meski tidak ada tanda alam) | Sedang |
   | Safe | Cuaca normal | **AMAN** | Tinggi |

4. **Output Update:**
   - Hasil reassurance meng-update `alertEvent` yang didistribusikan ke semua channel
   - Confidence level ditampilkan di PWA agar nelayan tahu seberapa yakin prediksi ini
   - Histori menyimpan kedua data (SHAP + BMKG) untuk analisis dan pembelajaran

5. **Feedback Loop (Opsional untuk riset lanjutan):**
   - Jika prediksi SHAP dan BMKG sering bertentangan, data ini bisa dijadikan bahan analisis untuk meningkatkan akurasi model SHAP di masa depan

---

## 2. Tech Stack

| Layer | Teknologi | Keterangan |
|---|---|---|
| Framework | Next.js 14+ (App Router) | PWA support, SSR, API routes |
| Styling | Tailwind CSS + shadcn/ui | Utility-first, mobile-first |
| State | Zustand | Lightweight state management |
| Peta | Leaflet + React-Leaflet | Open-source, gratis |
| Real-time | SSE (Server-Sent Events) | Backend Hono sudah support |
| Push | Web Push API | Service Worker background notification |
| Testing | Vitest + Playwright | Unit + E2E |
| Deployment | Docker + Nginx + PM2 | VPS Tencent |

---

## 3. Komponen PWA (Frontend)

### 3.1 Dashboard Utama
- Ringkasan kondisi cuaca saat ini (BMKG)
- Status peringatan aktif (alert banner) — berdasarkan **hasil reassurance**
- Quick action: tombol besar "LAPOR CUACA"

### 3.2 Form Laporan Cuaca
- Pilih pantai (dropdown): Depok, Parangtritis, Samas
- Pilih tanda alam yang dilihat (checkbox dari daftar pengetahuan lokal)
- Catatan tambahan (opsional, text field)
- Submit --> backend --> SHAP API --> BMKG Reassurance --> hasil final tampil

### 3.3 Peta Interaktif
- Peta wilayah pesisir Bantul (3 pantai)
- Marker per lokasi: status cuaca & peringatan
- Leaflet (open-source, tanpa API key)

### 3.4 Pengetahuan Lokal
- Daftar tanda-tanda alam + deskripsi + tingkat kepercayaan
- Search & filter berdasarkan kategori
- Sumber data dari database pengetahuan lokal (via SHAP API)

### 3.5 Histori Laporan
- Semua laporan (dari PWA maupun WA)
- Filter: tanggal, lokasi, sumber (PWA/WA), tingkat risiko, confidence level
- Detail laporan + hasil SHAP + hasil BMKG + **hasil reassurance final**

### 3.6 Notifikasi
- Push notification untuk peringatan darurat
- Badge icon untuk unread alerts

---

## 4. Desain UI

### Prinsip: "Klik-Klik Sederhana"
- Tombol besar (min 48px touch target)
- Warna kontras tinggi (cocok di bawah sinar matahari)
- Teks Bahasa Indonesia, singkat dan jelas
- Minimal form input, maksimum pilihan (dropdown, checkbox, radio)
- Ikon intuitif + label teks

### Upgrade dari SAMUDRA-fe
- **Bottom Navigation Bar** (5 tab: Beranda, Lapor, Peta, Pengetahuan, Riwayat)
- **Card-based Dashboard** (info cuaca dalam kartu besar)
- **One-tap Report** (tombol besar "LAPOR CUACA" di dashboard)
- **Visual Alert Banner** (banner merah/kuning di atas layar + suara notifikasi)
- **Gambar ilustrasi** untuk tanda alam (visual, bukan teks saja)
- **Large touch targets** untuk nelayan yang tidak terbiasa dengan smartphone
- **Dark/Light mode** (dark mode untuk malam hari)

### Navigasi
```
[Beranda]  [Lapor]  [Peta]  [Pengetahuan]  [Riwayat]
```

---

## 5. Integrasi Backend & Komunikasi

### 5.1 Backend (disaster-backend Hono)
- `POST /api/report` — kirim laporan dari PWA
- `GET /api/reports` — histori semua laporan
- `GET /api/alerts` — peringatan aktif
- SSE endpoint — real-time update
- `POST /api/ack` — acknowledge peringatan

### 5.2 SHAP API
- Dipanggil oleh backend (bukan langsung dari PWA)
- Input: `lik_codes` + `beach_location`
- Output: `community_risk_behaviour`, `description`, `detected_signs`
- Hasil prediksi **BUKAN output final** — harus melewati Reassurance Loop dulu (lihat Bagian 5.6)

### 5.3 OpenClaw (WhatsApp)
- Nelayan kirim pesan WA bebas format
- OpenClaw parse (NLP/keyword matching) → ekstrak lokasi & tanda alam
- OpenClaw kirim `POST /api/report` ke backend
- Backend saat risiko tinggi → webhook ke OpenClaw → broadcast ke grup WA

### 5.4 ESP32 (TOA Masjid)
- ESP32 terhubung via MQTT atau HTTP
- Backend publish ke topic `alerts/toa` saat risiko tinggi
- ESP32 trigger relay → aktifkan TOA

### 5.5 BMKG API
- Backend fetch data cuaca periodik (cron job)
- Data: suhu, kelembaban, kecepatan angin, cuaca, gelombang laut
- Digunakan untuk **reassurance** prediksi SHAP (lihat Bagian 5.6)
- Endpoint BMKG yang digunakan:
  - Cuaca: 'https://github.com/infoBMKG/data-cap.git',
  - Peringatan Cuaca: 'https://github.com/infoBMKG/data-cuaca.git',
  - Gelombang (berubah ubah tergantung waktu, webfetch saja): 'https://www.bmkg.go.id/cuaca/maritim/P.N.02', 

### 5.6 Reassurance Loop (Core Feature)

Pengetahuan lokal dari SHAP API **wajib** di-reassurance dengan data BMKG sebelum didistribusikan. Ini memastikan output semakin akurat.

**Alur Reassurance:**

```
1. Laporan masuk (PWA/WA)
       |
       v
2. Backend --> SHAP API (/predict)
       |  Output: community_risk_behaviour (Safe/Unsafe)
       |           + detected_signs
       |           + description
       v
3. Backend --> BMKG API (data cuaca pantai terkait)
       |  Output: cuaca, kecepatan_angin, tinggi_gelombang, kelembaban
       v
4. REASSURANCE ENGINE (backend logic)
       |
       |-- Jika SHAP = Unsafe + BMKG = cuaca buruk
       |     --> RISIKO TINGGI (konfirmasi kuat, confidence: tinggi)
       |     --> Distribusi: PWA + WA + TOA (aktifkan sirine)
       |
       |-- Jika SHAP = Unsafe + BMKG = cuaca aman
       |     --> RISIKO SEDANG (tanda alam terdeteksi, BMKG aman)
       |     --> Distribusi: PWA + WA saja (tanpa TOA)
       |     --> Catatan: "Tanda alam dilaporkan, namun data BMKG menunjukkan kondisi aman"
       |
       |-- Jika SHAP = Safe + BMKG = cuaca buruk
       |     --> RISIKO SEDANG (BMKG peringatan, komunitas aman)
       |     --> Distribusi: PWA + WA
       |     --> Catatan: "BMKG memberikan peringatan cuaca, tetapi komunitas dinilai aman"
       |
       |-- Jika SHAP = Safe + BMKG = cuaca aman
       |     --> RISIKO RENDAH
       |     --> Distribusi: PWA saja (tanpa notifikasi push/WA/TOA)
       v
5. Output reassurance disimpan ke Redis
   --> distribusi ke semua channel sesuai level risiko
```

**Matriks Reassurance:**

| SHAP API | BMKG API | Level Risiko | Distribusi |
|---|---|---|---|
| Unsafe | Cuaca buruk | **TINGGI** | PWA + WA + TOA |
| Unsafe | Cuaca aman | SEDANG | PWA + WA |
| Safe | Cuaca buruk | SEDANG | PWA + WA |
| Safe | Cuaca aman | RENDAH | PWA saja |

**Data yang dikirim ke PWA setelah reassurance:**

```json
{
  "report_id": "uuid",
  "shap_result": {
    "community_risk_behaviour": "Unsafe",
    "detected_signs": [{"code": "WN-3", "description": "Kilat muncul..."}],
    "description": "..."
  },
  "bmkg_data": {
    "weather": "Hujan Ringan",
    "wind_speed": "25 km/h",
    "wave_height": "2.5 m",
    "humidity": "85%",
    "temperature": "28°C"
  },
  "reassurance": {
    "risk_level": "TINGGI",
    "confidence": "tinggi",
    "reason": "Tanda alam WN-3 dikonfirmasi oleh data BMKG: cuaca hujan, angin 25 km/h, gelombang 2.5m",
    "source": "SHAP + BMKG"
  },
  "timestamp": "2026-05-08T15:30:00+07:00",
  "report_source": "pwa",
  "beach_location": "pantai_depok"
}
```

---

## 6. PWA & Service Worker

### PWA Manifest
- `name`: "Peringatan Cuaca - Desa Pesisir"
- `short_name`: "CuacaPesisir"
- `display`: `standalone`
- `theme_color`: biru laut
- `start_url`: `/`

### Service Worker (Workbox)
- **App Shell**: HTML, CSS, JS, font → precache (Cache First)
- **API Data**: laporan & peringatan → Network First (fallback cache saat offline)
- **Asset statis**: gambar peta/icons → Cache First
- **Offline fallback**: halaman offline + data terakhir dari cache

### Offline Support
- Form laporan offline → tersimpan di IndexedDB → auto-sync saat online
- Histori laporan terakhir tetap bisa diakses offline

### Install Prompt
- Custom banner: "Install CuacaPesisir untuk akses cepat"
- Tampilkan setelah kunjungan ke-2

---

## 7. Error Handling

| Skenario | Penanganan |
|---|---|
| Backend down | PWA tampilkan pesan gangguan, laporan simpan di localStorage, retry otomatis |
| SHAP API error | Reassurance gagal, tampilkan data BMKG saja, log error |
| BMKG API error | Reassurance gagal, output hanya dari SHAP (tanpa konfirmasi BMKG), tampilkan peringatan "Data BMKG tidak tersedia" |
| Offline | IndexedDB + cache, auto-sync saat online |
| OpenClaw down | WA tidak bisa terima/kirim, notifikasi hanya via PWA + TOA |
| ESP32 offline | TOA tidak aktif, notifikasi via PWA + WA saja |

---

## 8. Testing

| Jenis | Tools | Coverage |
|---|---|---|
| Unit Testing | Vitest | Fungsi utilitas, komponen UI, stores |
| Integration Testing | Vitest + Testing Library | Alur kirim laporan, SSE, offline sync |
| E2E Testing | Playwright | Alur lengkap: lapor → prediksi → notifikasi |
| Manual Testing | HP Android nyata | Koneksi lambat, user acceptance test |

---

## 9. Deployment (VPS Tencent - Manual)

### Step-by-step deployment guide akan disediakan terpisah
- Docker setup per komponen (bukan Docker Compose full)
- Nginx reverse proxy + SSL (Let's Encrypt)
- PM2 untuk process management
- Shared VPS considerations (port, resource isolation)

---

## 10. Struktur Proyek

```
peringatancuacav2/
├── frontend/                    # PWA (Next.js)
│   ├── src/
│   │   ├── app/                 # App Router
│   │   │   ├── layout.tsx       # Root layout + metadata PWA
│   │   │   ├── page.tsx         # Dashboard utama
│   │   │   ├── laporan/
│   │   │   │   ├── page.tsx     # Form laporan cuaca
│   │   │   │   └── riwayat/
│   │   │   │       └── page.tsx # Histori laporan
│   │   │   ├── peta/
│   │   │   │   └── page.tsx     # Peta interaktif
│   │   │   ├── pengetahuan-lokal/
│   │   │   │   └── page.tsx     # Daftar tanda alam
│   │   │   └── api/             # BFF API routes
│   │   ├── components/
│   │   │   ├── ui/              # shadcn/ui components
│   │   │   ├── map/             # Leaflet components
│   │   │   ├── report/          # Form & list components
│   │   │   └── alert/           # Alert banner & notification
│   │   ├── lib/
│   │   │   ├── api.ts           # API client
│   │   │   ├── sse.ts           # SSE connection helper
│   │   │   └── utils.ts         # Utility functions
│   │   ├── stores/              # Zustand stores
│   │   ├── hooks/               # Custom React hooks
│   │   ├── types/               # TypeScript types
│   │   └── public/
│   │       ├── manifest.json    # PWA manifest
│   │       ├── sw.js            # Service Worker
│   │       └── icons/           # PWA icons
│   ├── tailwind.config.ts
│   ├── next.config.ts
│   └── package.json
├── backend/                     # disaster-backend (Hono + Bun)
│   └── ...
├── docs/
│   └── plans/                   # Design documents
├── docker/                      # Docker configs per komponen
└── skills/                      # Superpowers skills
```

---

## 11. Peta Jalan Implementasi

### Fase 1 — Setup & Foundation
- Setup proyek Next.js + Tailwind + shadcn/ui
- Docker setup per komponen
- PWA setup (manifest, service worker, Workbox)
- Dasar UI (layout, bottom navigation, theme)

### Fase 2 — Core Features
- Dashboard utama (cuaca BMKG + alert banner)
- Form laporan cuaca
- Integrasi API backend
- Halaman pengetahuan lokal

### Fase 3 — Real-time & Peta
- SSE connection untuk real-time alerts
- Peta interaktif Leaflet
- Push notification (Web Push API)
- Histori laporan

### Fase 4 — Integrasi Ekosistem
- Integrasi OpenClaw (WA)
- Integrasi ESP32/TOA
- Offline support (IndexedDB + auto-sync)

### Fase 5 — Testing & Polish
- Vitest unit tests
- Playwright E2E tests
- Manual testing di HP Android
- Performance optimization
- User acceptance test

### Fase 6 — Deployment
- Step-by-step deployment guide untuk VPS Tencent
- Nginx + SSL (Let's Encrypt)
- Final testing di production

---

## 12. Lokasi Penelitian

- **Desa**: Parangtritis, Bantul, Yogyakarta
- **Pantai**: Pantai Depok, Pantai Parangtritis, Pantai Samas
- **Opsional**: Desa Lampuuk, Aceh Besar (untuk perbandingan)