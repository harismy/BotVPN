# BotVPN 1FORCR
Bot Telegram untuk manajemen layanan VPN yang terintegrasi dengan API AutoScript Potato.  
Referensi awal dari [arivpnstores](https://github.com/arivpnstores), based BOT: Fightertunnel.

---

## 🚀 Instalasi Otomatis
Rekomendasi OS: Ubuntu 24 / Debian 12

```bash
sysctl -w net.ipv6.conf.all.disable_ipv6=1 && sysctl -w net.ipv6.conf.default.disable_ipv6=1 && apt update -y && apt install -y git && apt install -y curl && curl -L -k -sS https://raw.githubusercontent.com/harismy/BotVPN/main/start -o start && bash start sellvpn && [ $? -eq 0 ] && rm -f start
```

---

## 🤖 Bot Telegram
[Menuju Bot Cihuyyyyy](https://t.me/BOT1FORCR_STORE_bot)

---

## ✨ Fitur Utama

### Untuk User
- Pembelian akun otomatis: SSH, VMESS, VLESS, TROJAN, ZiVPN, dan UDP HTTP Custom
- Trial akun
- Deposit saldo + pembayaran QRIS otomatis
- Top up manual via QRIS (bisa diaktif/nonaktifkan admin)

### Untuk Admin
- Dashboard admin berbasis menu (Server/Saldo/Reseller/Tools)
- Manajemen user & saldo (tambah/hapus/cek saldo)
- Manajemen server (add/edit/list/detail/hapus/reset)
- Backup database manual + auto backup 24 jam
- Statistik reseller lengkap: `/resellerstats` & `/allresellerstats`
- Help admin dari menu atau `/helpadmin`

### Untuk Reseller
- Akses server khusus reseller
- Statistik penjualan bulanan
- Tools reseller (hapus/lock/unlock akun)

---

## 🔥 Update Terbaru
- **Support UDP HTTP Custom**
  - Tipe akun baru dengan output ringkas dan format copy
- **Support Server Flag**
  - `support_zivpn` dan `support_udp_http` di tabel `Server`
  - Filter server otomatis berdasarkan support
- **Syarat Reseller Dinamis**
  - Admin set minimal akun & minimal top up per bulan
  - Otomatis demote reseller jika tidak memenuhi syarat (dengan notifikasi)
- **Top Up Manual Toggle**
  - Tombol top up manual muncul/hilang dari menu user
- **Perbaikan Statistik**
  - Pendapatan reseller dihitung dari transaksi deposit
  - `/allresellerstats` diurutkan dari pendapatan terbesar
- **ZiVPN UX**
  - Jika username sudah ada, user diminta input ulang
  - Password ZiVPN dibuat random (user hanya input username + hari)

---

## 💳 Sistem Pembayaran (Top Up Otomatis)

### Data QRIS
Gunakan tools berikut untuk extract data QRIS:  
https://qreader.online/

### Setup API Cek Payment
Edit file `api-cekpayment-orkut.js`:

```javascript
const qs = require('qs');

function buildPayload() {
  return qs.stringify({
    username: 'your_username_here',
    token: 'your_auth_token_here',
    jenis: 'masuk'
  });
}

const headers = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept-Encoding': 'gzip',
  'User-Agent': 'okhttp/4.12.0'
};

const API_URL = 'https://orkutapi.andyyuda41.workers.dev/api/qris-history';

module.exports = { buildPayload, headers, API_URL };
```

Jika `username/token` belum diisi:
- Menu top up otomatis akan nonaktif
- Bot menampilkan notifikasi ke user

---

## 🗄️ Database
Database utama: `sellvpn.db`

Auto-migrasi saat bot start:
- Buat tabel `pending_deposits` bila belum ada
- Tambah kolom `support_zivpn` dan `support_udp_http` di tabel `Server`

---

## 📌 Catatan
Pastikan file disimpan UTF-8 agar emoji tampil normal.
