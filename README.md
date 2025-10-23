# BotVPN 
**Edited from [arivpnstores](https://github.com/arivpnstores)**

Bot Telegram untuk manajemen layanan VPN yang sudah terintegrasi dengan API AutoScript Potato| fitur lengkap untuk admin dan user.
## Installasi Otomatis
```bash
sysctl -w net.ipv6.conf.all.disable_ipv6=1 && sysctl -w net.ipv6.conf.default.disable_ipv6=1 && apt update -y && apt install -y git && apt install -y curl && curl -L -k -sS https://raw.githubusercontent.com/harismy/BotVPNEdited/main/start -o start && bash start sellvpn && [ $? -eq 0 ] && rm -f start
```


##  Fitur Utama

### Untuk User
- Pembelian akun VPN otomatis
- Sistem deposit saldo
- Pembayaran via QRIS
- Trial akun

###  Untuk Admin/Reseller
- Dashboard admin lengkap
- Manajemen user dan saldo
- Tambah server khusus reseller
- Backup database 
- Monitoring transaksi

## Tampilan Aplikasi

### Tampilan Menu Awal Instalasi
<img src="./ss.png" alt="Menu Instalasi" width="300"/>

### Tampilan Menu Bot
<img src="./ss2.jpg" alt="Menu Bot" width="300"/>

### Tampilan Menu Admin
<img src="./image.png" alt="Menu Admin" width="300"/>

## 🚀 Update Terbaru

### 🔥 Fitur Baru
- **Fitur Tambah Server Khusus Reseller** - Hanya reseller yang bisa melihat server khusus
- **Cek Saldo User** - Bisa mengecek saldo user dengan ID Telegram
- **Add Saldo Manual** - Admin bisa menambah saldo user manual via ID
- **Backup Database** - Fitur backup otomatis database `sellvpn.db`
- **Top Up saldo manual** - Fitur baru top up saldo manual via Qris
- **Upload Foto Qris** - Fitur upload foto qris untuk menambahkan foto qris ke menu Top Up saldo manual

###  Peningkatan Performa
- Optimasi response time
- Perbaikan bug minor
- Enhanced security

##  Sistem Pembayaran

### Data QRIS dari Foto QRIS Order Kuota
Gunakan tools berikut untuk extract data QRIS:
🔗 **https://qreader.online/**

### Setup API Cek Payment
Edit file `api-cekpayment-orkut.js`:

**Tutorial Ambil API Cek Pembayaran:**
[📹 Video Tutorial](https://drive.google.com/file/d/1ugR_N5gEtcLx8TDsf7ecTFqYY3zrlHn-/view?usp=drivesdk)

```javascript
// api-cekpayment-orkut.js
const qs = require('qs');

// Function agar tetap kompatibel dengan app.js
function buildPayload() {
  return qs.stringify({
    'username': 'your_username_here',
    'token': 'your_auth_token_here',
    'jenis': 'masuk'
  });
}

// Header tetap sama agar tidak error di app.js
const headers = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'Accept-Encoding': 'gzip',
  'User-Agent': 'okhttp/4.12.0'
};

// URL baru sesuai curl-mu
const API_URL = 'https://orkutapi.andyyuda41.workers.dev/api/qris-history';

// Ekspor agar app.js tetap bisa require dengan struktur lama
module.exports = { buildPayload, headers, API_URL };


