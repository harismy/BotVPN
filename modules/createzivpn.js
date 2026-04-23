const { exec } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sellvpn.db');

function normalizeApiBase(rawDomain) {
  const value = String(rawDomain || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, '');
  return `http://${value}`.replace(/\/+$/, '');
}

function parseJsonFromCurlOutput(stdout) {
  const raw = String(stdout || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

async function createzivpn(username, password, exp, iplimit, serverId, telegramUserId = '', telegramChatId = '') {
  if (/\s/.test(username) || /[^a-zA-Z0-9]/.test(username)) {
    return 'Username hanya boleh huruf & angka (tanpa spasi)';
  }

  return new Promise((resolve) => {
    db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
      if (err || !server) {
        return resolve('Server tidak ditemukan');
      }

      const baseUrl = normalizeApiBase(server.domain);
      const url = `${baseUrl}/vps/sshvpn`;
      const cmd = `curl -sS -L --connect-timeout 10 --max-time 30 -X POST "${url}" \
      -H "Authorization: ${server.auth}" \
      -H "X-Telegram-User-Id: ${telegramUserId}" \
      -H "X-Telegram-Chat-Id: ${telegramChatId}" \
      -H "Content-Type: application/json" \
      -H "Accept: application/json" \
      -d '{"expired":${exp},"limitip":"${iplimit}","password":"${password}","username":"${username}","telegram_user_id":"${telegramUserId}","telegram_chat_id":"${telegramChatId}"}'`;

      exec(cmd, (errExec, stdout, stderr) => {
        const res = parseJsonFromCurlOutput(stdout);
        if (!res) {
          if (errExec) console.error('ZIVPN curl error:', errExec.message);
          if (stderr) console.error('ZIVPN curl stderr:', stderr);
          console.error('ZIVPN raw output:', stdout);
          return resolve('Response server tidak valid');
        }

        if (res?.meta?.code !== 200) {
          const rawMessage = String(res?.message || res?.meta?.message || 'unknown error');
          const haystack = (rawMessage || JSON.stringify(res) || '').toLowerCase();
          if (
            (haystack.includes('username') || haystack.includes('client')) &&
            (haystack.includes('exist') || haystack.includes('exists') || haystack.includes('already') || haystack.includes('try another'))
          ) {
            return resolve('username sudah ada mohon ulangi dengan username yang unik');
          }
          return resolve(`Gagal membuat akun ZIVPN: ${rawMessage}`);
        }

        const s = res.data || {};
        const msg = `
ZIVPN SSH ACCOUNT

- udp password : \`${s.username || username}\`
- Hostname : \`${s.hostname || '-'}\`
- Expired  : \`${s.exp || s.expired || '-'}\`
- IP Limit : ${iplimit} device
`;
        resolve(msg);
      });
    });
  });
}

module.exports = { createzivpn };
