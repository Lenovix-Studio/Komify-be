install depedensi:
bun i

run development:
bun run dev:bun

run build:
bun run build

run production:
bun run start:bun


# Panduan Pengembangan dan Produksi

Dokumentasi ini berisi perintah-perintah penting untuk menjalankan aplikasi dalam mode pengembangan (development), produksi (production), serta pengelolaan basis data menggunakan Prisma.

## 🚀 Perintah Menjalankan Aplikasi

### Mode Pengembangan (Development)

Untuk menjalankan aplikasi dalam lingkungan lokal/pengembangan:

```bash
npm run start:dev
```

### Mode Produksi (Production)

Untuk menjalankan aplikasi dalam lingkungan produksi:

```bash
npm run start:prod
```

---

## ◮ Manajemen Prisma ORM

> ⚠️ **PENTING:** Matikan layanan (_service_) NestJS terlebih dahulu sebelum melakukan registrasi ulang atau pembuatan ulang (_generate_) Prisma.

### 1. Sinkronisasi Skema (DB Pull)

Pilih salah satu perintah di bawah ini sesuai dengan konfigurasi lingkungan Anda:

```bash
# Menggunakan env default
npx prisma db pull

# Menggunakan env spesifik (Development)
dotenv -e .env.development -- npx prisma db pull
```

### 2. Pembuatan Klien Prisma (Generate)

Pilih salah satu perintah di bawah ini setelah melakukan perubahan skema:

```bash
# Menggunakan env default
npx prisma generate

# Menggunakan env spesifik (Development)
dotenv -e .env.development -- npx prisma generate
```

---

## 🏗️ Alur Memulai di Lingkungan Produksi (Flow Starting Production)

Ikuti langkah-langkah di bawah ini secara berurutan untuk menerapkan aplikasi di lingkungan produksi:

1. **Pasang Dependensi**

   ```bash
   npm install
   ```

2. **Konfigurasi Ekstensi PostgreSQL**  
   Jalankan kueri SQL berikut pada basis data PostgreSQL Anda:

   ```sql
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```

3. **Penerapan Skema Prisma**  
   Dorong perubahan skema database ke lingkungan produksi:

   ```bash
   npm run prisma:prod:push
   ```

4. **Jalankan Aplikasi**  
   Mulai aplikasi dalam mode produksi:
   ```bash
   npm run start:prod
   ```
