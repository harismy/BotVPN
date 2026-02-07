const axios = require('axios');
const { exec } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

async function renewssh(username, exp, limitip, serverId) {
  console.log(`Renewing SSH account for ${username} with expiry ${exp} days, limit IP ${limitip} on server ${serverId}`);

  // Validasi username
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return 'âŒ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        console.error('âŒ Error fetching server:', err?.message || 'server null');
        return resolve('âŒ Server tidak ditemukan. Silakan coba lagi.');
      }

      const domain = server.domain;
      const param = `/vps/renewsshvpn`;
      const web_URL = `http://${domain}${param}`; // Contoh: http://domainmu.com/vps/sshvpn
      const AUTH_TOKEN = server.auth;
      const days = exp;

      const curlCommand = `curl -s -X PATCH "${web_URL}/${username}/${days}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json" \
-H "Content-Type: application/json" \
-d '{"kuota": 0}'`;

      exec(curlCommand, (_, stdout) => {
        let d;
        try {
          d = JSON.parse(stdout);
        } catch (e) {
          console.error('âŒ Gagal parsing JSON:', e.message);
          console.error('ðŸªµ Output:', stdout);
          return resolve('âŒ Format respon dari server tidak valid.');
        }

        if (d?.meta?.code !== 200 || !d.data) {
          console.error('âŒ Respons error:', d);
          const errMsg = d?.message || d?.meta?.message || JSON.stringify(d, null, 2);
          return resolve(`âŒ Respons error:\n${errMsg}`);
        }

        const s = d.data;
        const msg = `âœ… *Renew SSH Account Success!*

ðŸ”„ *Akun berhasil diperpanjang*
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ðŸ‘¤ *Username*     : \`${s.username}\`
ðŸ“† *Masa Aktif*   :
ðŸ•’ Dari: \`${s.from}\`
ðŸ•’ Sampai: \`${s.to}\`
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

âœ¨ Terima kasih telah memperpanjang layanan kami!
*Â© Telegram Bots - 2025*`;

        return resolve(msg);
      });
    });
  });
}

async function renewudphttp(username, exp, limitip, serverId) {
  console.log(`Renewing UDP HTTP Custom account for ${username} with expiry ${exp} days, limit IP ${limitip} on server ${serverId}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        console.error('❌ Error fetching server:', err?.message || 'server null');
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      const domain = server.domain;
      const param = `/vps/renewsshvpn`;
      const web_URL = `http://${domain}${param}`;
      const AUTH_TOKEN = server.auth;
      const days = exp;

      const curlCommand = `curl -s -X PATCH "${web_URL}/${username}/${days}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json" \
-H "Content-Type: application/json" \
-d '{"kuota": 0}'`;

      exec(curlCommand, (_, stdout) => {
        let d;
        try {
          d = JSON.parse(stdout);
        } catch (e) {
          console.error('❌ Gagal parsing JSON:', e.message);
          console.error('🪵 Output:', stdout);
          return resolve('❌ Format respon dari server tidak valid.');
        }

        if (d?.meta?.code !== 200 || !d.data) {
          console.error('❌ Respons error:', d);
          const errMsg = d?.message || d?.meta?.message || JSON.stringify(d, null, 2);
          return resolve(`❌ Respons error:\n${errMsg}`);
        }

        const s = d.data;
        const msg = `✅ *Renew UDP HTTP Custom Success!*

*Username* : \`${s.username}\`
*Expired*  : \`${s.to || s.exp || 'N/A'}\``;

        return resolve(msg);
      });
    });
  });
}
async function renewvmess(username, exp, quota, limitip, serverId) {
  console.log(`Renewing VMess account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip}`);

  // Validasi username
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return 'âŒ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        console.error('âŒ Error fetching server:', err?.message || 'server null');
        return resolve('âŒ Server tidak ditemukan. Silakan coba lagi.');
      }

      const domain = server.domain;
      const param = `/vps/renewvmess`;
      const web_URL = `http://${domain}${param}`; // contoh: http://domain.com/vps/vmess
      const AUTH_TOKEN = server.auth;
      const days = exp;
      const KUOTA = quota;

      const curlCommand = `curl -s -X PATCH "${web_URL}/${username}/${days}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json" \
-H "Content-Type: application/json" \
-d '{"kuota": ${KUOTA}}'`;

      exec(curlCommand, (_, stdout) => {
        let d;
        try {
          d = JSON.parse(stdout);
        } catch (e) {
          console.error('âŒ Gagal parsing JSON:', e.message);
          console.error('ðŸªµ Output:', stdout);
          return resolve('âŒ Format respon dari server tidak valid.');
        }

        if (d?.meta?.code !== 200 || !d.data) {
          console.error('âŒ Respons error:', d);
          const errMsg = d?.message || d?.meta?.message || JSON.stringify(d, null, 2);
          return resolve(`âŒ Respons error:\n${errMsg}`);
        }

        const s = d.data;
        const msg = `âœ… *Renew VMess Account Success!*

ðŸ”„ *Akun berhasil diperpanjang*
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ðŸ‘¤ *Username*    : \`${s.username}\`
ðŸ“¦ *Quota*       : \`${s.quota === "0" ? "Unlimited" : s.quota} GB\`
ðŸ“… *Masa Aktif*  :
ðŸ•’ Dari   : \`${s.from}\`
ðŸ•’ Sampai : \`${s.to}\`
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

âœ¨ Terima kasih telah memperpanjang layanan kami!
*Â© Telegram Bots - 2025*`;

        return resolve(msg);
      });
    });
  });
}
async function renewvless(username, exp, quota, limitip, serverId) {
  console.log(`Renewing VLESS account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip}`);

  // Validasi username
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return 'âŒ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        console.error('âŒ Error fetching server:', err?.message || 'server null');
        return resolve('âŒ Server tidak ditemukan. Silakan coba lagi.');
      }

      const domain = server.domain;
      const param = `/vps/renewvless`;
      const web_URL = `http://${domain}${param}`;        // Contoh: http://domain.com/vps/vless
      const AUTH_TOKEN = server.auth;
      const days = exp;
      const KUOTA = quota;

      const curlCommand = `curl -s -X PATCH "${web_URL}/${username}/${days}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json" \
-H "Content-Type: application/json" \
-d '{"kuota": ${KUOTA}}'`;

      exec(curlCommand, (_, stdout) => {
        let d;
        try {
          d = JSON.parse(stdout);
        } catch (e) {
          console.error('âŒ Gagal parsing JSON:', e.message);
          console.error('ðŸªµ Output:', stdout);
          return resolve('âŒ Format respon dari server tidak valid.');
        }

        if (d?.meta?.code !== 200 || !d.data) {
          console.error('âŒ Respons error:', d);
          const errMsg = d?.message || d?.meta?.message || JSON.stringify(d, null, 2);
          return resolve(`âŒ Respons error:\n${errMsg}`);
        }

        const s = d.data;
        const msg = `âœ… *Renew VLESS Account Success!*

ðŸ”„ *Akun berhasil diperpanjang*
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ðŸ‘¤ *Username*    : \`${s.username}\`
ðŸ“¦ *Quota*       : \`${s.quota === "0" ? "Unlimited" : s.quota} GB\`
ðŸ“… *Masa Aktif*  :
ðŸ•’ Dari   : \`${s.from}\`
ðŸ•’ Sampai : \`${s.to}\`
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

âœ¨ Terima kasih telah memperpanjang layanan kami!
*Â© Telegram Bots - 2025*`;

        return resolve(msg);
      });
    });
  });
}
async function renewtrojan(username, exp, quota, limitip, serverId) {
  console.log(`Renewing TROJAN account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip}`);

  // Validasi username
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return 'âŒ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        console.error('âŒ Error fetching server:', err?.message || 'server null');
        return resolve('âŒ Server tidak ditemukan. Silakan coba lagi.');
      }

      const domain = server.domain;
      const param = `/vps/renewtrojan`;
      const web_URL = `http://${domain}${param}`;         // Contoh: http://domain.com/vps/trojan
      const AUTH_TOKEN = server.auth;
      const days = exp;
      const KUOTA = quota;

      const curlCommand = `curl -s -X PATCH "${web_URL}/${username}/${days}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json" \
-H "Content-Type: application/json" \
-d '{"kuota": ${KUOTA}}'`;

      exec(curlCommand, (_, stdout) => {
        let d;
        try {
          d = JSON.parse(stdout);
        } catch (e) {
          console.error('âŒ Gagal parsing JSON:', e.message);
          console.error('ðŸªµ Output:', stdout);
          return resolve('âŒ Format respon dari server tidak valid.');
        }

        if (d?.meta?.code !== 200 || !d.data) {
          console.error('âŒ Respons error:', d);
          const errMsg = d?.message || d?.meta?.message || JSON.stringify(d, null, 2);
          return resolve(`âŒ Respons error:\n${errMsg}`);
        }

        const s = d.data;
        const msg = `âœ… *Renew TROJAN Account Success!*

ðŸ”„ *Akun berhasil diperpanjang*
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
ðŸ‘¤ *Username*    : \`${s.username}\`
ðŸ“¦ *Quota*       : \`${s.quota === "0" ? "Unlimited" : s.quota} GB\`
ðŸ“… *Masa Aktif*  :
ðŸ•’ Dari   : \`${s.from}\`
ðŸ•’ Sampai : \`${s.to}\`
â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

âœ¨ Terima kasih telah memperpanjang layanan kami!
*Â© Telegram Bots - 2025*`;

        return resolve(msg);
      });
    });
  });
}
//create shadowsocks ga ada di potato
  async function renewshadowsocks(username, exp, quota, limitip, serverId) {
    console.log(`Renewing Shadowsocks account for ${username} with expiry ${exp} days, quota ${quota} GB, limit IP ${limitip} on server ${serverId}`);
    
    // Validasi username
    if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
      return 'âŒ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
    }
  
    // Ambil domain dari database
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
        if (err) {
          console.error('Error fetching server:', err.message);
          return resolve('âŒ Server tidak ditemukan. Silakan coba lagi.');
        }
  
        if (!server) return resolve('âŒ Server tidak ditemukan. Silakan coba lagi.');
  
        const domain = server.domain;
        const auth = server.auth;
        const param = `:5888/renewshadowsocks?user=${username}&exp=${exp}&quota=${quota}&iplimit=${limitip}&auth=${auth}`;
        const url = `http://${domain}${param}`;
        axios.get(url)
          .then(response => {
            if (response.data.status === "success") {
              const shadowsocksData = response.data.data;
              const msg = `
  ðŸŒŸ *RENEW SHADOWSOCKS PREMIUM* ðŸŒŸ
  
  ðŸ”¹ *Informasi Akun*
  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  â”‚ Username: \`${username}\`
  â”‚ Kadaluarsa: \`${vmessData.exp}\`
  â”‚ Kuota: \`${vmessData.quota}\`
  â”‚ Batas IP: \`${shadowsocksData.limitip} IP\`
  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  âœ… Akun ${username} berhasil diperbarui
  âœ¨ Selamat menggunakan layanan kami! âœ¨
  `;
           
                console.log('Shadowsocks account renewed successfully');
                return resolve(msg);
              } else {
                console.log('Error renewing Shadowsocks account');
                return resolve(`âŒ Terjadi kesalahan: ${response.data.message}`);
              }
            })
          .catch(error => {
            console.error('Error saat memperbarui Shadowsocks:', error);
            return resolve('âŒ Terjadi kesalahan saat memperbarui Shadowsocks. Silakan coba lagi nanti.');
          });
      });
    });
  }
  

async function renewzivpn(username, exp, limitip, serverId) {
  console.log(`Renewing ZIVPN account for ${username} with expiry ${exp} days, limit IP ${limitip} on server ${serverId}`);

  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return '❌ Username tidak valid. Mohon gunakan hanya huruf dan angka tanpa spasi.';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        console.error('❌ Error fetching server:', err?.message || 'server null');
        return resolve('❌ Server tidak ditemukan. Silakan coba lagi.');
      }

      const domain = server.domain;
      const param = `/vps/renewsshvpn`;
      const web_URL = `http://${domain}${param}`;
      const AUTH_TOKEN = server.auth;
      const days = exp;

      const curlCommand = `curl -s -X PATCH "${web_URL}/${username}/${days}" \
-H "Authorization: ${AUTH_TOKEN}" \
-H "accept: application/json" \
-H "Content-Type: application/json" \
-d '{"kuota": 0}'`;

      exec(curlCommand, (_, stdout) => {
        let d;
        try {
          d = JSON.parse(stdout);
        } catch (e) {
          console.error('❌ Gagal parsing JSON:', e.message);
          console.error('🪵 Output:', stdout);
          return resolve('❌ Format respon dari server tidak valid.');
        }

        if (d?.meta?.code !== 200 || !d.data) {
          console.error('❌ Respons error:', d);
          const errMsg = d?.message || d?.meta?.message || JSON.stringify(d, null, 2);
          return resolve(`❌ Respons error:\n${errMsg}`);
        }

        const s = d.data;
        const msg = `✅ *Renew ZIVPN Success!*

*Username* : \`${s.username}\`
*Expired*  : \`${s.to || s.exp || 'N/A'}\``;

        return resolve(msg);
      });
    });
  });
}

module.exports = { renewshadowsocks, renewtrojan, renewvless, renewvmess, renewssh, renewudphttp, renewzivpn };




