# Peringatan Cuaca - Sistem Peringatan Dini Berbasis Pengetahuan Lokal

**Integrasi Layanan Peringatan Bencana Berbasis Pengetahuan Lokal bagi Nelayan Desa Pesisir**

Sistem peringatan dini cuaca untuk nelayan tradisional di Aceh dan Bantul, Yogyakarta. Menggabungkan pengetahuan lokal nelayan (tanda alam LIK) dengan model machine learning SHAP untuk menghasilkan peringatan cuaca yang akurat dan mudah dipahami.

## Tujuan

- Memberikan peringatan dini cuaca kepada nelayan tradisional yang memiliki literasi digital rendah
- Mengintegrasikan pengetahuan lokal (tanda-tanda alam) dengan data cuaca BMKG
- Menggunakan model SHAP untuk prediksi risiko berdasarkan karakteristik komunitas
- Menyebarkan peringatan melalui PWA, WhatsApp (OpenClaw), dan SSE real-time

## Arsitektur

```
PWA (Nelayan) --> POST /report --> Backend (Hono + Redis)
                                      |
                                      +--> SHAP ML API (prediksi risiko)
                                      +--> BMKG API (data cuaca)
                                      +--> OpenClaw (broadcast WhatsApp)
                                      +--> PWA (SSE real-time alerts)
```

## Folder

| Folder | Deskripsi |
|--------|-----------|
| `frontend/` | PWA Next.js — antarmuka untuk nelayan (Beranda, Lapor, Peta, Pengetahuan) |
| `disaster-backend/` | Backend Hono + Bun — distribution hub, report processing, Redis |
| `SHAP-model-api/` | ML service Python — prediksi risiko berbasis SHAP + pengetahuan lokal |
| `docs/` | Dokumentasi desain sistem dan spesifikasi |
| `assets/` | Logo dan aset proyek |

## Repositori Terkait

- **SHAP Model API:** [github.com/itsqal/SHAP-model-api](https://github.com/itsqal/SHAP-model-api.git)
- **Disaster Backend:** [github.com/ScaferuZ/disaster-backend](https://github.com/ScaferuZ/disaster-backend.git)

## Target User

Nelayan tradisional di desa pesisir (Aceh + Bantul, Yogyakarta), usia tua, pendidikan SD-SMP, literasi digital rendah. UI dirancang icon-first, minimal teks, target sentuh minimal 60px, tanpa typing.

## Fitur Utama

- **Laporan Cuaca** — Nelayan melaporkan tanda alam (WN-1 sampai WN-13) melalui PWA
- **Threshold Per Pantai** — Pantai Safe (Lampuuk, Ulee Lheue) trigger di 3 laporan, Unsafe (Depok, Samas, Lhoknga) di 5
- **Peringatan Real-time** — SSE push ke PWA + broadcast WhatsApp via OpenClaw
- **Peta Pantai** — Status cuaca 5 pantai dengan data BMKG + marker lokasi user
- **Reassurance Loop** — Jika cuaca aman, sistem mengirim pesan tenang ke komunitas
