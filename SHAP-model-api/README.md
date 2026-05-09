# Dokumentasi Skenario Pengujian API (Hybrid SHAP)
Gunakan kumpulan JSON di bawah ini untuk menguji endpoint /predict pada API. Seluruh skenario didasarkan pada ambang batas matematis (tipping points) yang diekstraksi dari analisis dan pemodelan rule based SHAP.

## Skenario 1: Community Unsafe & Tanda dalam Trust Index
Contoh Kondisi: Komunitas memiliki karakteristik perilaku tidak aman dan melaporkan tanda alam dengan validitas tinggi (WN-3).

```JSON
{
  "lik_codes": ["wn-3"],
  "beach_location": "pantai_depok",
}
```

Ekspektasi return:

```JSON
{
    "community_risk_behaviour": "Unsafe",
    "description": "Komunitas diklasifikasikan berisiko tinggi karena terdeteksi karakteristik: Frekuensi Penggunaan Tanda Alam Rendah, Durasi Penggunaan Tanda Alam Rendah, Pengetahuan Tanda Alam Lokal Kurang. Terdeteksi tanda alam dengan tingkat kepercayaan tinggi: WN-3.",
    "detected_signs": [
        {
            "code": "WN-3",
            "description": "Kilat muncul di salah satu sisi langit ataupun saling berbalas antara dua sisi"
        }
    ]
}
```

## Skenario 2: Community Safe & Tanda dalam Trust Index
Contoh Kondisi: Komunitas tidak memiliki karakteristik perilaku tidak aman dan melaporkan tanda alam dengan validitas tinggi (WN-3).

```JSON
{
    "lik_codes": ["wn-3"],
    "beach_location": "pantai_lampuuk"
}
```

Ekspektasi return:

```JSON
{
    "community_risk_behaviour": "Safe",
    "description": "Komunitas tidak memenuhi kriteria risiko tinggi pada profil demografis/behavior. Terdeteksi tanda alam dengan tingkat kepercayaan tinggi: WN-3.",
    "detected_signs": [
        {
            "code": "WN-3",
            "description": "Kilat muncul di salah satu sisi langit ataupun saling berbalas antara dua sisi"
        }
    ]
}
```

## Skenario 3: Terdeteksi 3 tanda alam atau lebih

```JSON
{
    "lik_codes": ["wn-3", "wn-1", "wn-12"],
    "beach_location": "pantai_lampuuk"
}
```

Ekspektasi return:

```JSON
{
    "community_risk_behaviour": "Safe",
    "description": "Komunitas tidak memenuhi kriteria risiko tinggi pada profil demografis/behavior. Harap berhati-hati, terdeteksi 3 atau lebih tanda alam pengetahuan lokal. Terdeteksi tanda alam dengan tingkat kepercayaan tinggi: WN-3, WN-1.",
    "detected_signs": [
        {
            "code": "WN-3",
            "description": "Kilat muncul di salah satu sisi langit ataupun saling berbalas antara dua sisi"
        },
        {
            "code": "WN-1",
            "description": "Awan tampak turun ke bawah membentuk gumpalan 3 kali"
        },
        {
            "code": "WN-12",
            "description": "Banyak bintang di malam hari berkelap kelip, saat angin barat"
        }
    ]
}
```

## Catatan Implementasi untuk Developer
**community_risk_behaviour**: Jika Unsafe, pengembang disarankan untuk memicu Extra Warning pada antarmuka pengguna.

**Multimodal Detection**: Deteksi lebih dari 3 tanda alam (seperti skenario 5-8) secara teknis meningkatkan level bahaya meskipun profil user aman.