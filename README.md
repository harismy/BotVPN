# BotVPN 1FORCR
**Bot awal ngambil referensi dari lalu di edit thanks to [arivpnstores](https://github.com/arivpnstores)**  
**Based BOT: Fightertunnel**

Bot Telegram untuk manajemen layanan VPN yang sudah terintegrasi dengan **API AutoScript Potato**, dengan fitur lengkap untuk **admin, user, dan reseller**.

---

## 🚀 Instalasi Otomatis
~ Rekomendasi OS: **Ubuntu 24 / Debian 12**

```bash
sysctl -w net.ipv6.conf.all.disable_ipv6=1 && sysctl -w net.ipv6.conf.default.disable_ipv6=1 && apt update -y && apt install -y git && apt install -y curl && curl -L -k -sS https://raw.githubusercontent.com/harismy/BotVPN/main/start -o start && bash start sellvpn && [ $? -eq 0 ] && rm -f start
```

---

## 🤖 Bot Telegram Utama Saya
[Menuju Bot Cihuyyyyy](https://t.me/BOT1FORCR_STORE_bot)

---

## ✨ Fitur Utama

### Untuk User
- Pembelian akun VPN otomatis SSH, VMESS, VLESS, TROJAN dan ZiVPN
- Sistem deposit saldo
- Pembayaran via QRIS
- Trial akun
- Tampilan Top Up saldo dibuat lebih menarik
- Setelah input nominal saldo akan muncul pilihan:
  - **Lanjut Bayar**
  - **Batal**

---

### Untuk Admin
- Dashboard admin lengkap
- Manajemen user dan saldo
- Tambah server khusus reseller
- Tambah server khusus ZiVPN
- Monitoring transaksi
- Cek saldo user via ID Telegram
- Tambah saldo manual via ID
- Hapus saldo user via command `/hapussaldo`
- Backup database manual
- Backup database otomatis setiap 24 jam (dikirim ke Telegram admin)

---

### Untuk Reseller
- Akses server khusus reseller
- Harga berbeda dengan server buyer
- Bisa melihat statistik penjualan
- Monitoring jumlah akun yang dibuat

---

## 🖥️ Tampilan Aplikasi

### Tampilan Menu Awal Instalasi
<img src="./tampilaninstalasi.png" alt="Menu Instalasi" width="300"/>

---

## 🔥 Update !!

- **ZiVPN Service**
  - Pembuatan akun dan trial ZiVPN via sc Potato
- **Fitur Tambah Server Khusus ZiVPN**
  - Karena service pembuatan akun berbeda
- **Server Berbasis Role**
  - Buyer hanya melihat server buyer
  - Reseller hanya melihat server reseller
  - Berlaku juga untuk ZiVPN
- **Fitur Tambah Server Khusus Reseller**
  - Hanya reseller yang bisa melihat server khusus
- **Cek Saldo User**
  - Berdasarkan ID Telegram
- **Add Saldo Manual**
  - Admin bisa menambah saldo user
- **Backup Database**
  - Backup manual database `sellvpn.db`
- **Top Up Saldo Manual**
  - Menggunakan QRIS
- **Upload Foto QRIS**
  - Untuk menu Top Up saldo manual
- **Lihat Saldo User**
  - Melihat sisa saldo user via ID Telegram

---

## 🔥 Update v2.5.0

- **Sistem Top-up Revolusi Baru**
  - Nominal unik dengan random fee 100–200
  - Mencegah duplikasi pembayaran
- **Statistik Reseller Lengkap**
  - `/resellerstats`
  - `/allresellerstats`
  - Melihat jumlah akun yang dibuat reseller pada bulan berjalan
- **Auto Backup Database**
  - Backup otomatis setiap 24 jam
  - Database dikirim ke admin melalui Telegram
- **Cleanup System**
  - Auto cleanup pending deposit & transaksi selesai
- **Graceful Shutdown**
  - Penanganan graceful shutdown untuk PM2
- **Enhanced Security**
  - Validasi timing & duplicate payment prevention

---

## ⚡ Peningkatan Performa
- Optimasi response time
- Perbaikan bug minor
- Enhanced security

---

## 💳 Sistem Pembayaran (Top Up Saldo Otomatis)

### Data QRIS dari Foto QRIS Order Kuota
Gunakan tools berikut untuk extract data QRIS:  
🔗 **https://qreader.online/**

---

### Setup API Cek Payment
Edit file `api-cekpayment-orkut.js`

⚠️ **PENTING**
- Jika `username` dan `token` belum di setting:
  - Menu **Top Up saldo tidak bisa diakses**
  - Akan muncul informasi bahwa sistem top up belum dikonfigurasi

#### Tutorial Ambil API Cek Pembayaran
[📹 Video Tutorial](https://drive.google.com/file/d/1ugR_N5gEtcLx8TDsf7ecTFqYY3zrlHn-/view?usp=drivesdk)

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

---

## 📌 Kesimpulan
BotVPN 1FORCR adalah bot Telegram untuk manajemen layanan VPN otomatis dengan sistem pembayaran QRIS, dukungan reseller, server berbasis role, serta backup dan keamanan yang siap digunakan untuk produksi.

