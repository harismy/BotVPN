const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();
const axios = require('axios');
const { buildPayload, headers, API_URL } = require('./api-cekpayment-orkut');
const { isUserReseller, addReseller, removeReseller, listResellersSync } = require('./modules/reseller');
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: 'bot-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'bot-combined.log' }),
  ],
});
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { 
  createssh, 
  createvmess, 
  createvless, 
  createtrojan, 
  createshadowsocks 
} = require('./modules/create');

const { 
  trialssh, 
  trialvmess, 
  trialvless, 
  trialtrojan, 
  trialshadowsocks 
} = require('./modules/trial');

const { 
  renewssh, 
  renewvmess, 
  renewvless, 
  renewtrojan, 
  renewshadowsocks 
} = require('./modules/renew');

const { 
  delssh, 
  delvmess, 
  delvless, 
  deltrojan, 
  delshadowsocks 
} = require('./modules/del');

const { 
  lockssh, 
  lockvmess, 
  lockvless, 
  locktrojan, 
  lockshadowsocks 
} = require('./modules/lock');

const { 
  unlockssh, 
  unlockvmess, 
  unlockvless, 
  unlocktrojan, 
  unlockshadowsocks 
} = require('./modules/unlock');

const fsPromises = require('fs/promises');
const path = require('path');
const trialFile = path.join(__dirname, 'trial.db');

// Mengecek apakah user sudah pakai trial hari ini
async function checkTrialAccess(userId) {
  try {
    const data = await fsPromises.readFile(trialFile, 'utf8');
    const trialData = JSON.parse(data);
    const lastAccess = trialData[userId];

    const today = new Date().toISOString().slice(0, 10); // format YYYY-MM-DD
    return lastAccess === today;
  } catch (err) {
    return false; // anggap belum pernah pakai kalau file belum ada
  }
}
/////////
async function checkServerAccess(serverId, userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT is_reseller_only FROM Server WHERE id = ?', [serverId], async (err, row) => {
      if (err) return reject(err);
      // jika server tidak ada => tolak (caller menangani pesan)
      if (!row) return resolve({ ok: false, reason: 'not_found' });
      const flag = row.is_reseller_only === 1 || row.is_reseller_only === '1';
      if (!flag) return resolve({ ok: true }); // publik
      // jika reseller-only, cek apakah user terdaftar reseller
      try {
        const isR = await isUserReseller(userId);
        if (isR) return resolve({ ok: true });
        return resolve({ ok: false, reason: 'reseller_only' });
      } catch (e) {
        // fallback: tolak akses
        return resolve({ ok: false, reason: 'reseller_only' });
      }
    });
  });
}

// Menyimpan bahwa user sudah pakai trial hari ini
async function saveTrialAccess(userId) {
  let trialData = {};
  try {
    const data = await fsPromises.readFile(trialFile, 'utf8');
    trialData = JSON.parse(data);
  } catch (err) {
    // file belum ada, lanjut
  }

  const today = new Date().toISOString().slice(0, 10);
  trialData[userId] = today;
  await fsPromises.writeFile(trialFile, JSON.stringify(trialData, null, 2));
}

const fs = require('fs');
const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));

const BOT_TOKEN = vars.BOT_TOKEN;
const port = vars.PORT || 6969;
const ADMIN = vars.USER_ID; 
const NAMA_STORE = vars.NAMA_STORE || '@ARI_VPN_STORE';
const DATA_QRIS = vars.DATA_QRIS;
const MERCHANT_ID = vars.MERCHANT_ID;
const API_KEY = vars.API_KEY;
const GROUP_ID = vars.GROUP_ID;

const bot = new Telegraf(BOT_TOKEN);
let ADMIN_USERNAME = '';
const adminIds = ADMIN;
logger.info('Bot initialized');

(async () => {
  try {
    const adminId = Array.isArray(adminIds) ? adminIds[0] : adminIds;
    const chat = await bot.telegram.getChat(adminId);
    ADMIN_USERNAME = chat.username ? `@${chat.username}` : 'Admin';
    logger.info(`Admin username detected: ${ADMIN_USERNAME}`);
  } catch (e) {
    ADMIN_USERNAME = 'Admin';
    logger.warn('Tidak bisa ambil username admin otomatis.');
  }
})();
/////
const db = new sqlite3.Database('./sellvpn.db', (err) => {
  if (err) {
    logger.error('Kesalahan koneksi SQLite3:', err.message);
  } else {
    logger.info('Terhubung ke SQLite3');
  }
});

db.run(`CREATE TABLE IF NOT EXISTS pending_deposits (
  unique_code TEXT PRIMARY KEY,
  user_id INTEGER,
  amount INTEGER,
  original_amount INTEGER,
  timestamp INTEGER,
  status TEXT,
  qr_message_id INTEGER
)`, (err) => {
  if (err) {
    logger.error('Kesalahan membuat tabel pending_deposits:', err.message);
  }
});

db.run(`CREATE TABLE IF NOT EXISTS Server (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT,
  auth TEXT,
  harga INTEGER,
  nama_server TEXT,
  quota INTEGER,
  iplimit INTEGER,
  batas_create_akun INTEGER,
  total_create_akun INTEGER,
  is_reseller_only INTEGER DEFAULT 0
)`, (err) => {
  if (err) {
    logger.error('Kesalahan membuat tabel Server:', err.message);
  } else {
    logger.info('Server table created or already exists');
  }
});

db.run("UPDATE Server SET total_create_akun = 0 WHERE total_create_akun IS NULL", function(err) {
  if (err) {
    logger.error('Error fixing NULL total_create_akun:', err.message);
  } else {
    if (this.changes > 0) {
      logger.info(`✅ Fixed ${this.changes} servers with NULL total_create_akun`);
    }
  }
});

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  saldo INTEGER DEFAULT 0,
  CONSTRAINT unique_user_id UNIQUE (user_id)
)`, (err) => {
  if (err) {
    logger.error('Kesalahan membuat tabel users:', err.message);
  } else {
    logger.info('Users table created or already exists');
  }
});

db.run(`CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  amount INTEGER,
  type TEXT,
  reference_id TEXT,
  timestamp INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
)`, (err) => {
  if (err) {
    logger.error('Kesalahan membuat tabel transactions:', err.message);
  } else {
    logger.info('Transactions table created or already exists');
    
    // Add reference_id column if it doesn't exist
    db.get("PRAGMA table_info(transactions)", (err, rows) => {
      if (err) {
        logger.error('Kesalahan memeriksa struktur tabel:', err.message);
        return;
      }
      
      db.get("SELECT * FROM transactions WHERE reference_id IS NULL LIMIT 1", (err, row) => {
        if (err && err.message.includes('no such column')) {
          // Column doesn't exist, add it
          db.run("ALTER TABLE transactions ADD COLUMN reference_id TEXT", (err) => {
            if (err) {
              logger.error('Kesalahan menambahkan kolom reference_id:', err.message);
            } else {
              logger.info('Kolom reference_id berhasil ditambahkan ke tabel transactions');
            }
          });
        } else if (row) {
          // Update existing transactions with reference_id
          db.all("SELECT id, user_id, type, timestamp FROM transactions WHERE reference_id IS NULL", [], (err, rows) => {
            if (err) {
              logger.error('Kesalahan mengambil transaksi tanpa reference_id:', err.message);
              return;
            }
            
            rows.forEach(row => {
              const referenceId = `account-${row.type}-${row.user_id}-${row.timestamp}`;
              db.run("UPDATE transactions SET reference_id = ? WHERE id = ?", [referenceId, row.id], (err) => {
                if (err) {
                  logger.error(`Kesalahan mengupdate reference_id untuk transaksi ${row.id}:`, err.message);
                } else {
                  logger.info(`Berhasil mengupdate reference_id untuk transaksi ${row.id}`);
                }
              });
            });
          });
        }
      });
    });
  }
});

const userState = {};
logger.info('User state initialized');

bot.command(['start', 'menu'], async (ctx) => {
  logger.info('Start or Menu command received');
  
  const userId = ctx.from.id;
  db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      logger.error('Kesalahan saat memeriksa user_id:', err.message);
      return;
    }

    if (row) {
      logger.info(`User ID ${userId} sudah ada di database`);
    } else {
      db.run('INSERT INTO users (user_id) VALUES (?)', [userId], (err) => {
        if (err) {
          logger.error('Kesalahan saat menyimpan user_id:', err.message);
        } else {
          logger.info(`User ID ${userId} berhasil disimpan`);
        }
      });
    }
  });

  await sendMainMenu(ctx);
});
////////////////
// Manual admin command: /addsaldo <user_id> <jumlah>
bot.command('addsaldo', async (ctx) => {
  try {
    const userId = ctx.message.from.id;

    // hanya admin
    if (!adminIds || !adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
    }

    const args = ctx.message.text.trim().split(/\s+/);
    if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah.\nGunakan:\n`/addsaldo <user_id> <jumlah>`', { parse_mode: 'Markdown' });
    }

    const targetUserId = args[1].trim();
    const amount = parseInt(args[2], 10);

    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('⚠️ Jumlah saldo harus berupa angka dan lebih dari 0.');
    }

    // Cek apakah user ada
    db.get('SELECT saldo FROM users WHERE user_id = ?', [targetUserId], (err, row) => {
      if (err) {
        logger.error('❌ Gagal memeriksa user_id:', err.message);
        return ctx.reply('❌ Terjadi kesalahan saat memeriksa user.');
      }

      if (!row) {
        return ctx.reply(`⚠️ User dengan ID ${targetUserId} belum terdaftar di database.`);
      }

      // Lakukan update saldo
      db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetUserId], function (err) {
        if (err) {
          logger.error('❌ Gagal menambah saldo:', err.message);
          return ctx.reply('❌ Gagal menambah saldo.');
        }

        // pastikan ada perubahan (this.changes tersedia karena function)
        if (this.changes === 0) {
          return ctx.reply('⚠️ Tidak ada user yang diupdate. Pastikan ID benar.');
        }

// Ambil saldo terbaru dan kirim ke Telegram + log
db.get('SELECT saldo FROM users WHERE user_id = ?', [targetId], (err2, updatedRow) => {
  if (err2 || !updatedRow) {
    logger.info(`Admin ${ctx.from.id} menambah saldo Rp${amount} ke user ${targetId}, namun gagal membaca saldo terbaru.`);
    return ctx.reply(`✅ Saldo sebesar Rp${amount.toLocaleString()} berhasil ditambahkan ke user ${targetId}.`);
  }

          // Kirim pesan ke Telegram dengan saldo akhir
          ctx.reply(
            `✅ Saldo sebesar *Rp${amount.toLocaleString()}* berhasil ditambahkan ke user \`${targetUserId}\`.\n💰 Saldo user sekarang: *Rp${updatedRow.saldo.toLocaleString()}*`,
            { parse_mode: 'Markdown' }
          );

          // Log di file
          logger.info(`Admin ${ctx.from.id} menambah saldo Rp${amount} ke user ${targetUserId}. Saldo user sekarang: Rp${updatedRow.saldo}`);
        });
      });
    });
  } catch (e) {
    logger.error('❌ Error in /addsaldo command:', e);
    return ctx.reply('❌ Terjadi kesalahan internal saat memproses perintah.');
  }
});

//////////////////
bot.command('admin', async (ctx) => {
  logger.info('Admin menu requested');
  
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('🚫 Anda tidak memiliki izin untuk mengakses menu admin.');
    return;
  }

  await sendAdminMenu(ctx);
});
async function sendMainMenu(ctx) {
  // Ambil data user
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || '-';
  let saldo = 0;
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });
    saldo = row ? row.saldo : 0;
  } catch (e) { saldo = 0; }

  // Statistik user
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let userToday = 0, userWeek = 0, userMonth = 0;
  let globalToday = 0, globalWeek = 0, globalMonth = 0;
  try {
    userToday = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND timestamp >= ? AND type IN ("ssh","vmess","vless","trojan","shadowsocks")', [userId, todayStart], (err, row) => resolve(row ? row.count : 0));
    });
    userWeek = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND timestamp >= ? AND type IN ("ssh","vmess","vless","trojan","shadowsocks")', [userId, weekStart], (err, row) => resolve(row ? row.count : 0));
    });
    userMonth = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM transactions WHERE user_id = ? AND timestamp >= ? AND type IN ("ssh","vmess","vless","trojan","shadowsocks")', [userId, monthStart], (err, row) => resolve(row ? row.count : 0));
    });
    globalToday = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM transactions WHERE timestamp >= ? AND type IN ("ssh","vmess","vless","trojan","shadowsocks")', [todayStart], (err, row) => resolve(row ? row.count : 0));
    });
    globalWeek = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM transactions WHERE timestamp >= ? AND type IN ("ssh","vmess","vless","trojan","shadowsocks")', [weekStart], (err, row) => resolve(row ? row.count : 0));
    });
    globalMonth = await new Promise((resolve) => {
      db.get('SELECT COUNT(*) as count FROM transactions WHERE timestamp >= ? AND type IN ("ssh","vmess","vless","trojan","shadowsocks")', [monthStart], (err, row) => resolve(row ? row.count : 0));
    });
  } catch (e) {}

  // Jumlah pengguna bot
  let jumlahPengguna = 0;
  let isReseller = false;
if (fs.existsSync(resselFilePath)) {
  const resellerList = fs.readFileSync(resselFilePath, 'utf8').split('\n').map(x => x.trim());
  isReseller = resellerList.includes(userId.toString());
}
const statusReseller = isReseller ? 'Reseller' : 'Bukan Reseller';
  try {
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) AS count FROM users', (err, row) => { if (err) reject(err); else resolve(row); });
    });
    jumlahPengguna = row.count;
  } catch (e) { jumlahPengguna = 0; }

  // Latency (dummy, bisa diubah sesuai kebutuhan)
  const latency = (Math.random() * 0.1 + 0.01).toFixed(2);

const messageText = `
<code>╭────────────────────╮</code>
<b>⚡ BOT VPN ${NAMA_STORE} ⚡</b>
<code>╰────────────────────╯</code>

<i>🌐 Koneksi cepat, aman, dan stabil.
   ᯓ★ Bot VPN Premium 
   ᯓ★ Layanan Bot Otomatis
   ᯓ★ Server aman dan terpercaya !
</i>

<code>╭────────────────────╮</code>
<code>👤 USER INFO</code>
• Nama   : <b>${userName}</b>  
• ID     : <code>${userId}</code>  
• Saldo  : <code>Rp ${saldo}</code>  
• Status : <code>${statusReseller}</code>
<code>╰────────────────────╯</code>
<code>📊 STATISTIK HARI INI</code>
• Hari Ini   : <b>${userToday}</b> akun  
• Minggu Ini : <b>${userWeek}</b> akun  
• Bulan Ini  : <b>${userMonth}</b> akun  
<code>╰────────────────────╯</code>
<code>🌍 STATISTIK KESELURUHAN</code>
• Hari Ini   : <b>${globalToday}</b> akun  
• Minggu Ini : <b>${globalWeek}</b> akun  
• Bulan Ini  : <b>${globalMonth}</b> akun  
<code>╰────────────────────╯</code>

<code>⚙️ COMMAND PANEL</code>
🏠 /start       → Menu Utama  
🔑 /admin       → Menu Admin  
🛡️ /helpadmin  → Panel Admin  
<b>『••Edited by 1FORCR••』</b>

<code>╭────────────────────╮</code>
👥 <b>Users:</b> ${jumlahPengguna}  
⏱️ <b>Latency:</b> ${latency} ms  
<code>╰────────────────────╯</code>
`;

  const keyboard = [
    [
      { text: '➕ Buat Akun', callback_data: 'service_create' },
      { text: '♻️ Perpanjang Akun', callback_data: 'service_renew' }
    ],
    [
      { text: '❌ Hapus Akun', callback_data: 'service_del' },
      { text: '📶 Cek Server', callback_data: 'cek_service' }
    ],
    [
      { text: '🗝️ Kunci Akun', callback_data: 'service_lock' },
      { text: '🔐 Buka Kunci Akun', callback_data: 'service_unlock' }
    ],    
    [
      { text: '⌛ Trial Akun', callback_data: 'service_trial' },
    ],
    [
      { text: '🤝 Jadi Reseller harga lebih murah!!', callback_data: 'jadi_reseller' }
    ],
    [
      { text: '💰 TopUp Saldo Otomatis', callback_data: 'topup_saldo' }
    ],
    [
      { text: '💰 TopUp Saldo Manual via (QRIS)', callback_data: 'topup_manual' }
    ],


  ];

  try {
    if (ctx.updateType === 'callback_query') {
      try {
      await ctx.editMessageText(messageText, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard }
        });
      } catch (error) {
        // Jika error karena message sudah diedit/dihapus, abaikan
        if (error && error.response && error.response.error_code === 400 &&
            (error.response.description.includes('message is not modified') ||
             error.response.description.includes('message to edit not found') ||
             error.response.description.includes('message can\'t be edited'))
        ) {
          logger.info('Edit message diabaikan karena pesan sudah diedit/dihapus atau tidak berubah.');
    } else {
          logger.error('Error saat mengedit menu utama:', error);
        }
      }
    } else {
      try {
        await ctx.reply(messageText, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard }
        });
      } catch (error) {
        logger.error('Error saat mengirim menu utama:', error);
      }
    }
    logger.info('Main menu sent');
  } catch (error) {
    logger.error('Error umum saat mengirim menu utama:', error);
  }
}

bot.command('hapuslog', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) return ctx.reply('Tidak ada izin!');
  try {
    if (fs.existsSync('bot-combined.log')) fs.unlinkSync('bot-combined.log');
    if (fs.existsSync('bot-error.log')) fs.unlinkSync('bot-error.log');
    ctx.reply('Log berhasil dihapus.');
    logger.info('Log file dihapus oleh admin.');
  } catch (e) {
    ctx.reply('Gagal menghapus log: ' + e.message);
    logger.error('Gagal menghapus log: ' + e.message);
  }
});

bot.command('helpadmin', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }
  const helpMessage = `
*📋 Daftar Perintah Admin:*

1. /addsaldo - Menambahkan saldo ke akun pengguna.
2. /addserver - Menambahkan server baru.
3. /addressel - Menambahkan Ressel baru.
4. /delressel- Menghapus id Ressel.
5. /broadcast - Mengirim pesan siaran ke semua pengguna.
6. /editharga - Mengedit harga layanan.
7. /editauth - Mengedit auth server.
8. /editdomain - Mengedit domain server.
9. /editlimitcreate - Mengedit batas pembuatan akun server.
10. /editlimitip - Mengedit batas IP server.
11. /editlimitquota - Mengedit batas quota server.
12. /editnama - Mengedit nama server.
13. /edittotalcreate - Mengedit total pembuatan akun server.
14. /hapuslog - Menghapus log bot.

Gunakan perintah ini dengan format yang benar untuk menghindari kesalahan.
`;
  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

//////////
bot.command('addserver_reseller', async (ctx) => {
  try {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length < 7) {
      return ctx.reply('⚠️ Format salah!\n\nGunakan:\n/addserver_reseller <domain> <auth> <harga> <nama_server> <quota> <iplimit> <batas_create_akun>');
    }

    const [domain, auth, harga, nama_server, quota, iplimit, batas_create_akun] = args;
    
    // ✅ TAMBAHKAN total_create_akun di VALUES
    db.run(`INSERT INTO Server (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun, is_reseller_only, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [domain, auth, harga, nama_server, quota, iplimit, batas_create_akun],
      function (err) {
        if (err) {
          logger.error('❌ Gagal menambah server reseller:', err.message);
          return ctx.reply('❌ *Gagal menambah server reseller.*', { parse_mode: 'Markdown' });
        }
        ctx.reply('✅ *Server khusus reseller berhasil ditambahkan!*', { parse_mode: 'Markdown' });
      }
    );
  } catch (e) {
    logger.error('Error di /addserver_reseller:', e);
    ctx.reply('❌ *Terjadi kesalahan.*', { parse_mode: 'Markdown' });
  }
});
//////////
bot.command('broadcast', async (ctx) => {
  const userId = ctx.message.from.id;
  logger.info(`Broadcast command received from user_id: ${userId}`);
  if (!adminIds.includes(userId)) {
      logger.info(`⚠️ User ${userId} tidak memiliki izin untuk menggunakan perintah ini.`);
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const message = ctx.message.reply_to_message ? ctx.message.reply_to_message.text : ctx.message.text.split(' ').slice(1).join(' ');
  if (!message) {
      logger.info('⚠️ Pesan untuk disiarkan tidak diberikan.');
      return ctx.reply('⚠️ Mohon berikan pesan untuk disiarkan.', { parse_mode: 'Markdown' });
  }

  db.all("SELECT user_id FROM users", [], (err, rows) => {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengambil daftar pengguna:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengambil daftar pengguna.', { parse_mode: 'Markdown' });
      }

      rows.forEach((row) => {
          const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
          axios.post(telegramUrl, {
              chat_id: row.user_id,
              text: message
          }).then(() => {
              logger.info(`✅ Pesan siaran berhasil dikirim ke ${row.user_id}`);
          }).catch((error) => {
              logger.error(`⚠️ Kesalahan saat mengirim pesan siaran ke ${row.user_id}`, error.message);
          });
      });

      ctx.reply('✅ Pesan siaran berhasil dikirim.', { parse_mode: 'Markdown' });
  });
});

bot.command('addserver', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 8) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/addserver <domain> <auth> <harga> <nama_server> <quota> <iplimit> <batas_create_account>`', { parse_mode: 'Markdown' });
  }

  const [domain, auth, harga, nama_server, quota, iplimit, batas_create_akun] = args.slice(1);

  const numberOnlyRegex = /^\d+$/;
  if (!numberOnlyRegex.test(harga) || !numberOnlyRegex.test(quota) || !numberOnlyRegex.test(iplimit) || !numberOnlyRegex.test(batas_create_akun)) {
      return ctx.reply('⚠️ `harga`, `quota`, `iplimit`, dan `batas_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  // ✅ QUERY YANG BENAR
  db.run("INSERT INTO Server (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, 0)", 
      [domain, auth, parseInt(harga), nama_server, parseInt(quota), parseInt(iplimit), parseInt(batas_create_akun)], 
      function(err) {
          if (err) {
              logger.error('⚠️ Kesalahan saat menambahkan server:', err.message);
              return ctx.reply('⚠️ Kesalahan saat menambahkan server.', { parse_mode: 'Markdown' });
          }
          ctx.reply(`✅ Server \`${nama_server}\` berhasil ditambahkan.`, { parse_mode: 'Markdown' });
      }
  );
});

bot.command('editharga', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editharga <domain> <harga>`', { parse_mode: 'Markdown' });
  }

  const [domain, harga] = args.slice(1);

  if (!/^\d+$/.test(harga)) {
      return ctx.reply('⚠️ `harga` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("INSERT INTO Server (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, 0)", 
      [domain, auth, parseInt(harga), nama_server, parseInt(quota), parseInt(iplimit), parseInt(batas_create_akun)], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat menambahkan server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat menambahkan server.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Server \`${nama_server}\` berhasil ditambahkan.`, { parse_mode: 'Markdown' });
  });
});


bot.command('editnama', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editnama <domain> <nama_server>`', { parse_mode: 'Markdown' });
  }

  const [domain, nama_server] = args.slice(1);

  db.run("UPDATE Server SET nama_server = ? WHERE domain = ?", [nama_server, domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit nama server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit nama server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Nama server \`${domain}\` berhasil diubah menjadi \`${nama_server}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editdomain', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editdomain <old_domain> <new_domain>`', { parse_mode: 'Markdown' });
  }

  const [old_domain, new_domain] = args.slice(1);

  db.run("UPDATE Server SET domain = ? WHERE domain = ?", [new_domain, old_domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit domain server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit domain server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Domain server \`${old_domain}\` berhasil diubah menjadi \`${new_domain}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editauth', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editauth <domain> <auth>`', { parse_mode: 'Markdown' });
  }

  const [domain, auth] = args.slice(1);

  db.run("UPDATE Server SET auth = ? WHERE domain = ?", [auth, domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit auth server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit auth server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Auth server \`${domain}\` berhasil diubah menjadi \`${auth}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitquota', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitquota <domain> <quota>`', { parse_mode: 'Markdown' });
  }

  const [domain, quota] = args.slice(1);

  if (!/^\d+$/.test(quota)) {
      return ctx.reply('⚠️ `quota` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET quota = ? WHERE domain = ?", [parseInt(quota), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit quota server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit quota server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Quota server \`${domain}\` berhasil diubah menjadi \`${quota}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitip', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitip <domain> <iplimit>`', { parse_mode: 'Markdown' });
  }

  const [domain, iplimit] = args.slice(1);

  if (!/^\d+$/.test(iplimit)) {
      return ctx.reply('⚠️ `iplimit` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET iplimit = ? WHERE domain = ?", [parseInt(iplimit), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit iplimit server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit iplimit server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Iplimit server \`${domain}\` berhasil diubah menjadi \`${iplimit}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitcreate', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitcreate <domain> <batas_create_akun>`', { parse_mode: 'Markdown' });
  }

  const [domain, batas_create_akun] = args.slice(1);

  if (!/^\d+$/.test(batas_create_akun)) {
      return ctx.reply('⚠️ `batas_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET batas_create_akun = ? WHERE domain = ?", [parseInt(batas_create_akun), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit batas_create_akun server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit batas_create_akun server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Batas create akun server \`${domain}\` berhasil diubah menjadi \`${batas_create_akun}\`.`, { parse_mode: 'Markdown' });
  });
});
bot.command('edittotalcreate', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/edittotalcreate <domain> <total_create_akun>`', { parse_mode: 'Markdown' });
  }

  const [domain, total_create_akun] = args.slice(1);

  if (!/^\d+$/.test(total_create_akun)) {
      return ctx.reply('⚠️ `total_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET total_create_akun = ? WHERE domain = ?", [parseInt(total_create_akun), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit total_create_akun server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit total_create_akun server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Total create akun server \`${domain}\` berhasil diubah menjadi \`${total_create_akun}\`.`, { parse_mode: 'Markdown' });
  });
});
async function handleServiceAction(ctx, action) {
  let keyboard;
  if (action === 'create') {
    keyboard = [
      [{ text: 'Buat Ssh/Ovpn', callback_data: 'create_ssh' }],      
      [{ text: 'Buat Vmess', callback_data: 'create_vmess' }, { text: 'Buat Vless', callback_data: 'create_vless' }],
      [{ text: 'Buat Trojan', callback_data: 'create_trojan' }, /*{ text: 'Buat Shadowsocks', callback_data: 'create_shadowsocks' }*/{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'trial') {
    keyboard = [
      [{ text: 'Trial Ssh/Ovpn', callback_data: 'trial_ssh' }],      
      [{ text: 'Trial Vmess', callback_data: 'trial_vmess' }, { text: 'Trial Vless', callback_data: 'trial_vless' }],
      [{ text: 'Trial Trojan', callback_data: 'trial_trojan' }, /*{ text: 'Trial Shadowsocks', callback_data: 'renew_shadowsocks' }*/{ text: '🔙 Kembali', callback_data: 'send_main_menu' }],
    ];
  } else if (action === 'renew') {
    keyboard = [
      [{ text: 'Perpanjang Ssh/Ovpn', callback_data: 'renew_ssh' }],      
      [{ text: 'Perpanjang Vmess', callback_data: 'renew_vmess' }, { text: 'Perpanjang Vless', callback_data: 'renew_vless' }],
      [{ text: 'Perpanjang Trojan', callback_data: 'renew_trojan' }, /*{ text: 'Perpanjang Shadowsocks', callback_data: 'renew_shadowsocks' }*/{ text: '🔙 Kembali', callback_data: 'send_main_menu' }],
    ];
  } else if (action === 'del') {
    keyboard = [
      [{ text: 'Hapus Ssh/Ovpn', callback_data: 'del_ssh' }],      
      [{ text: 'Hapus Vmess', callback_data: 'del_vmess' }, { text: 'Hapus Vless', callback_data: 'del_vless' }],
      [{ text: 'Hapus Trojan', callback_data: 'del_trojan' }, /*{ text: 'Perpanjang Shadowsocks', callback_data: 'renew_shadowsocks' }*/{ text: '🔙 Kembali', callback_data: 'send_main_menu' }],
    ];
  } else if (action === 'lock') {
    keyboard = [
      [{ text: 'Lock Ssh/Ovpn', callback_data: 'lock_ssh' }],      
      [{ text: 'Lock Vmess', callback_data: 'lock_vmess' }, { text: 'Lock Vless', callback_data: 'lock_vless' }],
      [{ text: 'Lock Trojan', callback_data: 'lock_trojan' }, /*{ text: 'Perpanjang Shadowsocks', callback_data: 'renew_shadowsocks' }*/{ text: '🔙 Kembali', callback_data: 'send_main_menu' }],
    ];
  } else if (action === 'unlock') {
    keyboard = [
      [{ text: 'Unlock Ssh/Ovpn', callback_data: 'unlock_ssh' }],      
      [{ text: 'Unlock Vmess', callback_data: 'unlock_vmess' }, { text: 'Unlock Vless', callback_data: 'unlock_vless' }],
      [{ text: 'Unlock Trojan', callback_data: 'unlock_trojan' }, /*{ text: 'Perpanjang Shadowsocks', callback_data: 'renew_shadowsocks' }*/{ text: '🔙 Kembali', callback_data: 'send_main_menu' }],
    ];
  } 
  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: keyboard
    });
    logger.info(`${action} service menu sent`);
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      await ctx.reply(`Pilih jenis layanan yang ingin Anda ${action}:`, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      logger.info(`${action} service menu sent as new message`);
    } else {
      logger.error(`Error saat mengirim menu ${action}:`, error);
    }
  }
}
async function sendAdminMenu(ctx) {
  const adminKeyboard = [

[
  { text: ' Tambah Server Reseller', callback_data: 'addserver_reseller' }
],
[
  { text: '🖼️ Upload Gambar QRIS |Top up manual', callback_data: 'upload_qris' }
],

    [
{ text: '💳 Lihat Saldo User', callback_data: 'cek_saldo_user'}
    ],
    [
  { text: '📦 Backup Database', callback_data: 'backup_db' }
    ],

    [
      { text: '➕ Tambah Server', callback_data: 'addserver' },
      { text: '❌ Hapus Server', callback_data: 'deleteserver' }
    ],
    [
      { text: '💲 Edit Harga', callback_data: 'editserver_harga' },
      { text: '📝 Edit Nama', callback_data: 'nama_server_edit' }
    ],
    [
      { text: '🌐 Edit Domain', callback_data: 'editserver_domain' },
      { text: '🔑 Edit Auth', callback_data: 'editserver_auth' }
    ],
    [
      { text: '📊 Edit Quota', callback_data: 'editserver_quota' },
      { text: '📶 Edit Limit IP', callback_data: 'editserver_limit_ip' }
    ],
    [
      { text: '🔢 Edit Batas Create', callback_data: 'editserver_batas_create_akun' },
      { text: '🔢 Edit Total Create', callback_data: 'editserver_total_create_akun' }
    ],
    [
      { text: '💵 Tambah Saldo', callback_data: 'tambah_saldo' },
      { text: '📋 List Server', callback_data: 'listserver' }
    ],
    [
      { text: '♻️ Reset Server', callback_data: 'resetdb' },
      { text: 'ℹ️ Detail Server', callback_data: 'detailserver' }
    ],
    [
      { text: '🔙 Kembali', callback_data: 'send_main_menu' }
    ]
  ];

  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: adminKeyboard
    });
    logger.info('Admin menu sent');
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      await ctx.reply('Menu Admin:', {
        reply_markup: {
          inline_keyboard: adminKeyboard
        }
      });
      logger.info('Admin menu sent as new message');
    } else {
      logger.error('Error saat mengirim menu admin:', error);
    }
  }
}

const resselFilePath = path.join(__dirname, 'ressel.db');

bot.command('addressel', async (ctx) => {
  try {
    const requesterId = ctx.from.id;

    // Hanya admin yang bisa menjalankan perintah ini
    if (!adminIds.includes(requesterId)) {
      return ctx.reply('🚫 Anda tidak memiliki izin untuk melakukan tindakan ini.');
    }

    // Ambil ID Telegram dari argumen
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('❌ Format salah. Gunakan perintah:\n/addressel <id_telegram_user>');
    }

    const targetId = args[1];

    // Baca file ressel.db jika ada, kalau tidak, buat file baru
    let resellerList = [];
    if (fs.existsSync(resselFilePath)) {
      const fileContent = fs.readFileSync(resselFilePath, 'utf8');
      resellerList = fileContent.split('\n').filter(line => line.trim() !== '');
    }

    // Cek apakah ID sudah ada
    if (resellerList.includes(targetId)) {
      return ctx.reply(`⚠️ User dengan ID ${targetId} sudah menjadi reseller.`);
    }

    // Tambahkan ID ke file
    fs.appendFileSync(resselFilePath, `${targetId}\n`);
    ctx.reply(`✅ User dengan ID ${targetId} berhasil dijadikan reseller.`);

  } catch (e) {
    logger.error('❌ Error di command /addressel:', e.message);
    ctx.reply('❌ Terjadi kesalahan saat menjalankan perintah.');
  }
});

bot.command('delressel', async (ctx) => {
  try {
    const requesterId = ctx.from.id;

    // Hanya admin yang bisa menjalankan perintah ini
    if (!adminIds.includes(requesterId)) {
      return ctx.reply('🚫 Anda tidak memiliki izin untuk melakukan tindakan ini.');
    }

    // Ambil ID Telegram dari argumen
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply('❌ Format salah. Gunakan perintah:\n/delressel <id_telegram_user>');
    }

    const targetId = args[1];

    // Cek apakah file ressel.db ada
    if (!fs.existsSync(resselFilePath)) {
      return ctx.reply('📁 File reseller belum dibuat.');
    }

    // Baca file dan filter ulang tanpa targetId
    const fileContent = fs.readFileSync(resselFilePath, 'utf8');
    const resellerList = fileContent.split('\n').filter(line => line.trim() !== '' && line.trim() !== targetId);

    // Tulis ulang file dengan data yang sudah difilter
    fs.writeFileSync(resselFilePath, resellerList.join('\n') + (resellerList.length ? '\n' : ''));

    ctx.reply(`✅ User dengan ID ${targetId} berhasil dihapus dari daftar reseller.`);

  } catch (e) {
    logger.error('❌ Error di command /delressel:', e.message);
    ctx.reply('❌ Terjadi kesalahan saat menjalankan perintah.');
  }
});

///////
// Saat admin mengirim foto QRIS
bot.on('photo', async (ctx) => {
  const adminId = ctx.from.id;
  const state = userState[adminId];
  if (!state || state.step !== 'upload_qris') return;

  const fileId = ctx.message.photo.pop().file_id;
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const filePath = path.join(__dirname, 'qris.jpg');

  const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, Buffer.from(response.data));

  await ctx.reply('✅ Gambar QRIS berhasil diunggah!');
  logger.info('🖼️ QRIS image uploaded by admin');
  delete userState[adminId];
});
// === 🖼️ UPLOAD GAMBAR QRIS ===
bot.action('upload_qris', async (ctx) => {
  const adminId = ctx.from.id;
  if (!adminIds.includes(adminId)) {
    return ctx.reply('🚫 Kamu tidak punya izin untuk ini.');
  }

  await ctx.reply('📸 Kirim gambar QRIS yang ingin digunakan:');
  userState[adminId] = { step: 'upload_qris' };
});

// Saat admin mengirim foto QRIS
bot.on('photo', async (ctx) => {
  const adminId = ctx.from.id;
  const state = userState[adminId];
  if (!state || state.step !== 'upload_qris') return;

  const fileId = ctx.message.photo.pop().file_id;
  const fileLink = await ctx.telegram.getFileLink(fileId);
  const filePath = path.join(__dirname, 'qris.jpg');

  const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, Buffer.from(response.data));

  await ctx.reply('✅ Gambar QRIS berhasil diunggah!');
  logger.info('🖼️ QRIS image uploaded by admin');
  delete userState[adminId];
});
///////////////////////
bot.action('topup_manual', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const qrisPath = path.join(__dirname, 'qris.jpg');

    const captionText =
      `📲 *Top Up Saldo Manual via QRIS*\n\n` +
      `💬 Silakan transfer menggunakan QRIS di atas.\n\n` +
      `Setelah transfer, kirim bukti pembayaran ke admin:\n` +
      `🧑‍💻 @MYCAN20\n` +
      `atau hubungi via WhatsApp: [Klik di sini](http://wa.me/6289527159281)\n\n` +
      `📝 *Kirim bukti pembayaran dan sertakan format pesan seperti ini:*\n` +
      `\`\`\`\nSaya sudah top up via QRIS min dan ini ID Telegram saya ${ctx.from.id}\n\`\`\`\n\n` +
      `_Pastikan nominal sesuai dengan saldo yang ingin ditambahkan._`;

    if (fs.existsSync(qrisPath)) {
      await ctx.replyWithPhoto(
        { source: qrisPath },
        {
          caption: captionText,
          parse_mode: 'Markdown',
        }
      );
    } else {
      await ctx.reply('⚠️ QRIS belum diunggah oleh admin. Silakan hubungi @MYCAN20.');
    }
  } catch (err) {
    logger.error('❌ Error di topup_manual:', err.message);
    ctx.reply('❌ Terjadi kesalahan saat menampilkan QRIS.');
  }
});

/////

// === 🗂️ BACKUP DATABASE DAN KIRIM KE ADMIN ===
bot.action('backup_db', async (ctx) => {
  try {
    const adminId = ctx.from.id;

    // Hanya admin yang bisa pakai
    if (!adminIds.includes(adminId)) {
      return ctx.reply('🚫 Kamu tidak memiliki izin untuk melakukan tindakan ini.');
    }

    const dbPath = path.join(__dirname, 'sellvpn.db');
    if (!fs.existsSync(dbPath)) {
      return ctx.reply('⚠️ File database tidak ditemukan.');
    }

    // Kirim file sellvpn.db ke admin
    await ctx.replyWithDocument({ source: dbPath, filename: 'sellvpn.db' }, { 
      caption: '📦 Backup database berhasil dikirim!',
    });

    logger.info(`📤 Backup database dikirim ke admin ${adminId}`);
  } catch (error) {
    logger.error('❌ Gagal mengirim file backup ke admin:', error);
    ctx.reply('❌ Terjadi kesalahan saat mengirim file backup.');
  }
});

// === 💳 CEK SALDO USER ===
bot.action('cek_saldo_user', async (ctx) => {
  const adminId = ctx.from.id;

  if (!adminIds.includes(adminId)) {
    return ctx.reply('🚫 Anda tidak memiliki izin untuk menggunakan fitur ini.');
  }

  await ctx.answerCbQuery();
  await ctx.reply('🔍 Masukkan ID Telegram user yang ingin dicek saldonya:');
  userState[adminId] = { step: 'cek_saldo_userid' };
});
///////////////

bot.action('jadi_reseller', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {});
  const userId = ctx.from.id;

  await ctx.reply(
    `📩 Hubungi admin ${ADMIN_USERNAME} untuk menjadi Reseller.\n\n` +
    `Kirim pesan ke admin dengan format pesan:\n\`Mau jadi reseller  ${userId}\``,
    { parse_mode: 'Markdown' }
  );
});

///////
bot.action('addserver_reseller', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userState[ctx.chat.id] = { step: 'reseller_domain' };
  await ctx.reply('🌐 Masukkan domain server reseller:');
});

////////
bot.action('tambah_saldo', async (ctx) => {
  const adminId = ctx.from.id;

  // Pastikan hanya admin
  if (!adminIds.includes(adminId)) {
    return ctx.reply('🚫 Kamu tidak memiliki izin untuk menggunakan menu ini.');
  }

  userState[adminId] = { step: 'addsaldo_userid' };
  await ctx.reply('🆔 Masukkan ID Telegram user yang ingin ditambah saldonya:');
});

////////

bot.action('sendMainMenu', async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {});
    await sendMainMenu(ctx);
  } catch (error) {
    console.error('❌ Error saat kembali ke menu utama:', error);
    await ctx.reply('⚠️ Terjadi kesalahan saat membuka menu utama.');
  }
});

bot.action('addserver_reseller', async (ctx) => {
  await ctx.answerCbQuery().catch(()=>{});
  userState[ctx.chat.id] = { step: 'addserver_reseller' };
  await ctx.reply(
    '🪄 Silakan kirim data server reseller dengan format:\n\n' +
    '/addserver_reseller <domain> <auth> <harga> <nama_server> <quota> <iplimit> <batas_create_akun>'
  );
});

bot.action('service_trial', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'trial');
});

bot.action('service_create', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'create');
});

bot.action('service_renew', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'renew');
});

bot.action('service_del', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'del');
});

bot.action('service_lock', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'lock');
});

bot.action('service_unlock', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  } 
  await handleServiceAction(ctx, 'unlock');
});

const { exec } = require('child_process');

bot.action('cek_service', async (ctx) => {
  try {
    const resselDbPath = './ressel.db';
    const idUser = ctx.from.id.toString().trim();

    // 🔍 Cek apakah user termasuk reseller
    fs.readFile(resselDbPath, 'utf8', async (err, data) => {
      if (err) {
        console.error('❌ Gagal membaca file ressel.db:', err.message);
        return ctx.reply('❌ *Terjadi kesalahan saat membaca data reseller.*', { parse_mode: 'Markdown' });
      }

      const resselList = data.split('\n').map(line => line.trim()).filter(Boolean);
      const isRessel = resselList.includes(idUser);

      if (!isRessel) {
        return ctx.reply('❌ *Fitur ini hanya untuk Ressel VPN.*', { parse_mode: 'Markdown' });
      }

      // ✅ Jika reseller, lanjut jalankan cek service
      const message = await ctx.reply('⏳ Sedang mengecek status server...');

      exec('chmod +x cek-port.sh && bash cek-port.sh', (error, stdout, stderr) => {
        if (error) {
          console.error(`Gagal menjalankan skrip: ${error.message}`);
          return ctx.reply('❌ Terjadi kesalahan saat menjalankan pengecekan.');
        }

        if (stderr) {
          console.error(`Error dari skrip: ${stderr}`);
          return ctx.reply('❌ Ada output error dari skrip pengecekan.');
        }

        // Bersihkan kode warna ANSI agar output rapi
        const cleanOutput = stdout.replace(/\x1b\[[0-9;]*m/g, '');

        ctx.reply(`📡 *Hasil Cek Port:*\n\n\`\`\`\n${cleanOutput}\n\`\`\``, {
          parse_mode: 'Markdown'
        });
      });
    });
  } catch (err) {
    console.error(err);
    ctx.reply('❌ Gagal menjalankan pengecekan server.');
  }
});

bot.action('send_main_menu', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await sendMainMenu(ctx);
});

bot.action('trial_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'trial', 'vmess');
});

bot.action('trial_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'trial', 'vless');
});

bot.action('trial_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'trial', 'trojan');
});

bot.action('trial_shadowsocks', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'trial', 'shadowsocks');
});

bot.action('trial_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'trial', 'ssh');
});


bot.action('create_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'vmess');
});

bot.action('create_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'vless');
});

bot.action('create_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'trojan');
});

bot.action('create_shadowsocks', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'shadowsocks');
});

bot.action('create_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'ssh');
});

//DELETE SSH
bot.action('del_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'del', 'ssh');
});

bot.action('del_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'del', 'vmess');
});

bot.action('del_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'del', 'vless');
});

bot.action('del_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'del', 'trojan');
});
//DELETE BREAK

//LOCK
bot.action('lock_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'lock', 'ssh');
});

bot.action('lock_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'lock', 'vmess');
});

bot.action('lock_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'lock', 'vless');
});

bot.action('lock_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'lock', 'trojan');
});
//LOCK BREAK
//UNLOCK
bot.action('unlock_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'unlock', 'ssh');
});

bot.action('unlock_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'unlock', 'vmess');
});

bot.action('unlock_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'unlock', 'vless');
});

bot.action('unlock_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'unlock', 'trojan');
});
//UNLOCK BREAK

bot.action('renew_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'vmess');
});

bot.action('renew_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'vless');
});

bot.action('renew_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'trojan');
});

bot.action('renew_shadowsocks', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'shadowsocks');
});

bot.action('renew_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'ssh');
});
async function startSelectServer(ctx, action, type, page = 0) {

try {
  const isR = await isUserReseller(ctx.from.id);
  const query = isR
    ? 'SELECT * FROM Server'
    : 'SELECT * FROM Server WHERE is_reseller_only = 0 OR is_reseller_only IS NULL';

  db.all(query, [], (err, servers) => {
    if (err) {
      logger.error('⚠️ Error fetching servers:', err.message);
      return ctx.reply('⚠️ Tidak ada server yang tersedia saat ini.', { parse_mode: 'HTML' });
    }

    // ==== mulai logika pagination di bawah ini ====
    const serversPerPage = 6;
    const totalPages = Math.ceil(servers.length / serversPerPage);
    const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = currentPage * serversPerPage;
    const end = start + serversPerPage;
    const currentServers = servers.slice(start, end);

    const keyboard = [];
    for (let i = 0; i < currentServers.length; i += 2) {
      const row = [];
      const server1 = currentServers[i];
      const server2 = currentServers[i + 1];
      row.push({ text: server1.nama_server, callback_data: `${action}_username_${type}_${server1.id}` });
      if (server2) {
        row.push({ text: server2.nama_server, callback_data: `${action}_username_${type}_${server2.id}` });
      }
      keyboard.push(row);
    }

    const navButtons = [];
    if (totalPages > 1) {
      if (currentPage > 0) {
        navButtons.push({ text: '⬅️ Back', callback_data: `navigate_${action}_${type}_${currentPage - 1}` });
      }
      if (currentPage < totalPages - 1) {
        navButtons.push({ text: '➡️ Next', callback_data: `navigate_${action}_${type}_${currentPage + 1}` });
      }
    }
    if (navButtons.length > 0) keyboard.push(navButtons);
    keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'sendMainMenu' }]);

    const serverList = currentServers.map(server => {
      const hargaPer30Hari = server.harga * 30;
      const isFull = server.total_create_akun >= server.batas_create_akun;
      return `🌐 *${server.nama_server}*\n` +
             `💰 Harga per hari: Rp${server.harga}\n` +
             `📅 Harga per 30 hari: Rp${hargaPer30Hari}\n` +
             `📊 Quota: ${server.quota}GB\n` +
             `🔢 Limit IP: ${server.iplimit} IP\n` +
             (isFull ? `⚠️ *Server Penuh*` : `👥 Total Create Akun: ${server.total_create_akun}/${server.batas_create_akun}`);
    }).join('\n\n');
    if (ctx.updateType === 'callback_query') {
      ctx.editMessageText(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages})*\n\n${serverList}`, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      });
    } else {
      ctx.reply(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages})*\n\n${serverList}`, {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      });
    }

    userState[ctx.chat.id] = { step: `${action}_username_${type}`, page: currentPage };
  });
} catch (error) {
  logger.error(`❌ Error saat memulai proses ${action} untuk ${type}:`, error);
  await ctx.reply(`❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan.`, { parse_mode: 'Markdown' });
}
}

bot.action(/navigate_(\w+)_(\w+)_(\d+)/, async (ctx) => {
  const [, action, type, page] = ctx.match;
  await startSelectServer(ctx, action, type, parseInt(page, 10));
});


bot.action(/(create|renew)_username_(vmess|vless|trojan|shadowsocks|ssh)_(.+)/, async (ctx) => {
  const action = ctx.match[1];
  const type = ctx.match[2];
  const serverId = ctx.match[3];
  userState[ctx.chat.id] = { step: `username_${action}_${type}`, serverId, type, action };

  db.get('SELECT batas_create_akun, total_create_akun FROM Server WHERE id = ?', [serverId], async (err, server) => {
    if (err) {
      logger.error('⚠️ Error fetching server details:', err.message);
      return ctx.reply('❌ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
    }

    if (!server) {
      return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    const batasCreateAkun = server.batas_create_akun;
    const totalCreateAkun = server.total_create_akun;

    if (totalCreateAkun >= batasCreateAkun) {
      return ctx.reply('❌ *Server penuh. Tidak dapat membuat akun baru di server ini.*', { parse_mode: 'Markdown' });
    }

    await ctx.reply('👤 *Masukkan username:*', { parse_mode: 'Markdown' });
  });
});

// === ⚡️ KONFIRMASI TRIAL (semua tipe) ===
bot.action(/(trial)_username_(vmess|vless|trojan|shadowsocks|ssh)_(\d+)/, async (ctx) => {
  const [action, type, serverId] = [ctx.match[1], ctx.match[2], ctx.match[3]];

  // Ambil nama server dari database
  db.get('SELECT * FROM Server WHERE id = ?', [serverId], async (err, server) => {
    if (err) {
      logger.error('❌ Gagal mengambil data server:', err.message);
      return ctx.reply('⚠️ Terjadi kesalahan saat mengambil data server.');
    }

    if (!server) {
      return ctx.reply('⚠️ Server tidak ditemukan di database.');
    }

    // Simpan state seperti semula
    userState[ctx.chat.id] = {
      step: `username_${action}_${type}`,
      serverId, type, action,
      serverName: server.nama_server || server.domain
    };

    // Pesan konfirmasi seperti versi lama, tapi pakai nama server
    await ctx.reply(
      `⚠️ *PERHATIAN*\n\n` +
      `Anda sedang membuat akun *TRIAL ${type.toUpperCase()}* di server *${server.nama_server || server.domain}*.\n\n` +
      `Layanan trial hanya berlaku *1x per hari* dan akan aktif selama *3 Jam*.\n\n` +
      `Kecuali User *RESSELLER VPN*.\n\n` +
      `Lanjutkan hanya jika Anda sudah yakin.`,
      { parse_mode: 'Markdown' }
    );

    await ctx.reply(' *Konfirmasi (yes) hurufnya kecil semua:*', { parse_mode: 'Markdown' });
  });
});

bot.action(/(del)_username_(vmess|vless|trojan|shadowsocks|ssh)_(.+)/, async (ctx) => {
  const [action, type, serverId] = [ctx.match[1], ctx.match[2], ctx.match[3]];

  userState[ctx.chat.id] = {
    step: `username_${action}_${type}`,
    serverId, type, action
  };
  await ctx.reply('👤 *Masukkan username yang ingin dihapus:*', { parse_mode: 'Markdown' });
});
bot.action(/(unlock)_username_(vmess|vless|trojan|shadowsocks|ssh)_(.+)/, async (ctx) => {
  const [action, type, serverId] = [ctx.match[1], ctx.match[2], ctx.match[3]];

  userState[ctx.chat.id] = {
    step: `username_${action}_${type}`,
    serverId, type, action
  };
  await ctx.reply('👤 *Masukkan username yang ingin dibuka:*', { parse_mode: 'Markdown' });
});
bot.action(/(lock)_username_(vmess|vless|trojan|shadowsocks|ssh)_(.+)/, async (ctx) => {
  const [action, type, serverId] = [ctx.match[1], ctx.match[2], ctx.match[3]];

  userState[ctx.chat.id] = {
    step: `username_${action}_${type}`,
    serverId, type, action
  };
  await ctx.reply('👤 *Masukkan username yang ingin dikunci:*', { parse_mode: 'Markdown' });
});

bot.on('text', async (ctx) => {
  const state = userState[ctx.chat.id];

  if (!state) return; 
    const text = ctx.message.text.trim();

//////
  if (state.step === 'cek_saldo_userid') {
    const targetId = ctx.message.text.trim();
    db.get('SELECT saldo FROM users WHERE user_id = ?', [targetId], (err, row) => {
      if (err) {
        logger.error('❌ Gagal mengambil saldo:', err.message);
        return ctx.reply('❌ Terjadi kesalahan saat mengambil data saldo.');
      }

      if (!row) {
        return ctx.reply(`⚠️ User dengan ID ${targetId} belum terdaftar di database.`);
      }

      ctx.reply(`💰 Saldo user ${targetId}: Rp${row.saldo.toLocaleString()}`);
      logger.info(`Admin ${ctx.from.id} mengecek saldo user ${targetId}: Rp${row.saldo}`);
      delete userState[ctx.from.id];
    });
  }
///////
    if (state.step.startsWith('username_trial_')) {
  const username = text;

  // Validasi username
  if (!/^[a-z0-9]{3,20}$/.test(username)) {
    return ctx.reply('❌ *Username tidak valid. Gunakan huruf kecil dan angka (3–20 karakter).*', { parse_mode: 'Markdown' });
  }

 const resselDbPath = './ressel.db';
const idUser = ctx.from.id.toString().trim();

// Baca file reseller
fs.readFile(resselDbPath, 'utf8', async (err, data) => {
  if (err) {
    logger.error('❌ Gagal membaca file ressel.db:', err.message);
    return ctx.reply('❌ *Terjadi kesalahan saat membaca data reseller.*', { parse_mode: 'Markdown' });
  }

  const resselList = data.split('\n').map(line => line.trim()).filter(Boolean);
  const isRessel = resselList.includes(idUser);

  // Cek jika bukan reseller, maka periksa apakah sudah pernah trial hari ini
  if (!isRessel) {
    const sudahPakai = await checkTrialAccess(ctx.from.id);
    if (sudahPakai) {
      return ctx.reply('❌ *Anda sudah menggunakan fitur trial hari ini. Silakan coba lagi besok.*', { parse_mode: 'Markdown' });
    }
  }

    // Lanjut buat trial
    const { type, serverId } = state;
    delete userState[ctx.chat.id];

    try {
      const password = 'none', exp = 'none', iplimit = 'none';

      const delFunctions = {
        vmess: trialvmess,
        vless: trialvless,
        trojan: trialtrojan,
        shadowsocks: trialshadowsocks,
        ssh: trialssh
      };

      if (delFunctions[type]) {
        const msg = await delFunctions[type](username, password, exp, iplimit, serverId);
        await recordAccountTransaction(ctx.from.id, type);
        await saveTrialAccess(ctx.from.id); // Simpan tanggal trial
        await ctx.reply(msg, { parse_mode: 'Markdown' });
        logger.info(`✅ Trial ${type} oleh ${ctx.from.id}`);
      }

    } catch (err) {
      logger.error('❌ Gagal hapus akun:', err.message);
      await ctx.reply('❌ *Terjadi kesalahan saat menghapus akun.*', { parse_mode: 'Markdown' });
    }
  });
  return;
}

    if (state.step.startsWith('username_unlock_')) {
    const username = text;
    // Validasi username (hanya huruf kecil dan angka, 3-20 karakter)
    if (!/^[a-z0-9]{3,20}$/.test(username)) {
      return ctx.reply('❌ *Username tidak valid. Gunakan huruf kecil dan angka (3–20 karakter).*', { parse_mode: 'Markdown' });
    }
       //izin ressel saja
    const resselDbPath = './ressel.db';
    fs.readFile(resselDbPath, 'utf8', async (err, data) => {
      if (err) {
        logger.error('❌ Gagal membaca file ressel.db:', err.message);
        return ctx.reply('❌ *Terjadi kesalahan saat membaca data reseller.*', { parse_mode: 'Markdown' });
      }

      const idUser = ctx.from.id.toString().trim();
      const resselList = data.split('\n').map(line => line.trim()).filter(Boolean);

      console.log('🧪 ID Pengguna:', idUser);
      console.log('📂 Daftar Ressel:', resselList);

      const isRessel = resselList.includes(idUser);

      if (!isRessel) {
        return ctx.reply('❌ *Fitur ini hanya untuk Ressel VPN.*', { parse_mode: 'Markdown' });
      }
  //izin ressel saja
    const { type, serverId } = state;
    delete userState[ctx.chat.id];

    let msg = 'none';
    try {
      const password = 'none', exp = 'none', iplimit = 'none';

      const delFunctions = {
        vmess: unlockvmess,
        vless: unlockvless,
        trojan: unlocktrojan,
        shadowsocks: unlockshadowsocks,
        ssh: unlockssh
      };

      if (delFunctions[type]) {
        msg = await delFunctions[type](username, password, exp, iplimit, serverId);
        await recordAccountTransaction(ctx.from.id, type);
      }

      await ctx.reply(msg, { parse_mode: 'Markdown' });
      logger.info(`✅ Akun ${type} berhasil unlock oleh ${ctx.from.id}`);
    } catch (err) {
      logger.error('❌ Gagal hapus akun:', err.message);
      await ctx.reply('❌ *Terjadi kesalahan saat menghapus akun.*', { parse_mode: 'Markdown' });
    }});
    return; // Penting! Jangan lanjut ke case lain
  }
    if (state.step.startsWith('username_lock_')) {
    const username = text;
    // Validasi username (hanya huruf kecil dan angka, 3-20 karakter)
    if (!/^[a-z0-9]{3,20}$/.test(username)) {
      return ctx.reply('❌ *Username tidak valid. Gunakan huruf kecil dan angka (3–20 karakter).*', { parse_mode: 'Markdown' });
    }
       //izin ressel saja
    const resselDbPath = './ressel.db';
    fs.readFile(resselDbPath, 'utf8', async (err, data) => {
      if (err) {
        logger.error('❌ Gagal membaca file ressel.db:', err.message);
        return ctx.reply('❌ *Terjadi kesalahan saat membaca data reseller.*', { parse_mode: 'Markdown' });
      }

      const idUser = ctx.from.id.toString().trim();
      const resselList = data.split('\n').map(line => line.trim()).filter(Boolean);

      console.log('🧪 ID Pengguna:', idUser);
      console.log('📂 Daftar Ressel:', resselList);

      const isRessel = resselList.includes(idUser);

      if (!isRessel) {
        return ctx.reply('❌ *Fitur ini hanya untuk Ressel VPN.*', { parse_mode: 'Markdown' });
      }
  //izin ressel saja
    const { type, serverId } = state;
    delete userState[ctx.chat.id];

    let msg = 'none';
    try {
      const password = 'none', exp = 'none', iplimit = 'none';

      const delFunctions = {
        vmess: lockvmess,
        vless: lockvless,
        trojan: locktrojan,
        shadowsocks: lockshadowsocks,
        ssh: lockssh
      };

      if (delFunctions[type]) {
        msg = await delFunctions[type](username, password, exp, iplimit, serverId);
        await recordAccountTransaction(ctx.from.id, type);
      }

      await ctx.reply(msg, { parse_mode: 'Markdown' });
      logger.info(`✅ Akun ${type} berhasil di kunci oleh ${ctx.from.id}`);
    } catch (err) {
      logger.error('❌ Gagal hapus akun:', err.message);
      await ctx.reply('❌ *Terjadi kesalahan saat menghapus akun.*', { parse_mode: 'Markdown' });
    }});
    return; // Penting! Jangan lanjut ke case lain
  }
  if (state.step.startsWith('username_del_')) {
    const username = text;
    // Validasi username (hanya huruf kecil dan angka, 3-20 karakter)
    if (!/^[a-z0-9]{3,20}$/.test(username)) {
      return ctx.reply('❌ *Username tidak valid. Gunakan huruf kecil dan angka (3–20 karakter).*', { parse_mode: 'Markdown' });
    }
       //izin ressel saja
    const resselDbPath = './ressel.db';
    fs.readFile(resselDbPath, 'utf8', async (err, data) => {
      if (err) {
        logger.error('❌ Gagal membaca file ressel.db:', err.message);
        return ctx.reply('❌ *Terjadi kesalahan saat membaca data reseller.*', { parse_mode: 'Markdown' });
      }

      const idUser = ctx.from.id.toString().trim();
      const resselList = data.split('\n').map(line => line.trim()).filter(Boolean);

      console.log('🧪 ID Pengguna:', idUser);
      console.log('📂 Daftar Ressel:', resselList);

      const isRessel = resselList.includes(idUser);

      if (!isRessel) {
        return ctx.reply('❌ *Fitur ini hanya untuk Ressel VPN.*', { parse_mode: 'Markdown' });
      }
  //izin ressel saja
    const { type, serverId } = state;
    delete userState[ctx.chat.id];

    let msg = 'none';
    try {
      const password = 'none', exp = 'none', iplimit = 'none';

      const delFunctions = {
        vmess: delvmess,
        vless: delvless,
        trojan: deltrojan,
        shadowsocks: delshadowsocks,
        ssh: delssh
      };

      if (delFunctions[type]) {
        msg = await delFunctions[type](username, password, exp, iplimit, serverId);
        await recordAccountTransaction(ctx.from.id, type);
      }

      await ctx.reply(msg, { parse_mode: 'Markdown' });
      logger.info(`✅ Akun ${type} berhasil dihapus oleh ${ctx.from.id}`);
    } catch (err) {
      logger.error('❌ Gagal hapus akun:', err.message);
      await ctx.reply('❌ *Terjadi kesalahan saat menghapus akun.*', { parse_mode: 'Markdown' });
    }});
    return; // Penting! Jangan lanjut ke case lain
  }
  if (state.step.startsWith('username_')) {
    state.username = text;

    if (!state.username) {
      return ctx.reply('❌ *Username tidak valid. Masukkan username yang valid.*', { parse_mode: 'Markdown' });
    }
    if (state.username.length < 4 || state.username.length > 20) {
      return ctx.reply('❌ *Username harus terdiri dari 4 hingga 20 karakter.*', { parse_mode: 'Markdown' });
    }
    if (/[A-Z]/.test(state.username)) {
      return ctx.reply('❌ *Username tidak boleh menggunakan huruf kapital. Gunakan huruf kecil saja.*', { parse_mode: 'Markdown' });
    }
    if (/[^a-z0-9]/.test(state.username)) {
      return ctx.reply('❌ *Username tidak boleh mengandung karakter khusus atau spasi. Gunakan huruf kecil dan angka saja.*', { parse_mode: 'Markdown' });
    }
    const { type, action } = state;
    if (action === 'create') {
      if (type === 'ssh') {
        state.step = `password_${state.action}_${state.type}`;
        await ctx.reply('🔑 *Masukkan password:*', { parse_mode: 'Markdown' });
      } else {
        state.step = `exp_${state.action}_${state.type}`;
        await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
      }
    } else if (action === 'renew') {
      state.step = `exp_${state.action}_${state.type}`;
      await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
    }
  } else if (state.step.startsWith('password_')) {
    state.password = ctx.message.text.trim();
    if (!state.password) {
      return ctx.reply('❌ *Password tidak valid. Masukkan password yang valid.*', { parse_mode: 'Markdown' });
    }
    if (state.password.length < 3) {
      return ctx.reply('❌ *Password harus terdiri dari minimal 3 karakter.*', { parse_mode: 'Markdown' });
    }
    if (/[^a-zA-Z0-9]/.test(state.password)) {
      return ctx.reply('❌ *Password tidak boleh mengandung karakter khusus atau spasi.*', { parse_mode: 'Markdown' });
    }
    state.step = `exp_${state.action}_${state.type}`;
    await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
  } else if (state.step.startsWith('exp_')) {
    const expInput = ctx.message.text.trim();
    if (!/^\d+$/.test(expInput)) {
      return ctx.reply('❌ *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
    }
// Cek hanya angka
if (!/^\d+$/.test(expInput)) {
  return ctx.reply('❌ *Masa aktif hanya boleh angka, contoh: 30*', { parse_mode: 'Markdown' });
}

const exp = parseInt(expInput, 10);

if (isNaN(exp) || exp <= 0) {
  return ctx.reply('❌ *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
}

if (exp > 365) {
  return ctx.reply('❌ *Masa aktif tidak boleh lebih dari 365 hari.*', { parse_mode: 'Markdown' });
}
    state.exp = exp;

    db.get('SELECT quota, iplimit FROM Server WHERE id = ?', [state.serverId], async (err, server) => {
      if (err) {
        logger.error('⚠️ Error fetching server details:', err.message);
        return ctx.reply('❌ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
      }

      if (!server) {
        return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      }

      state.quota = server.quota;
      state.iplimit = server.iplimit;

      const { username, password, exp, quota, iplimit, serverId, type, action } = state;
      let msg;

      db.get('SELECT harga FROM Server WHERE id = ?', [serverId], async (err, server) => {
        if (err) {
          logger.error('⚠️ Error fetching server price:', err.message);
          return ctx.reply('❌ *Terjadi kesalahan saat mengambil harga server.*', { parse_mode: 'Markdown' });
        }

        if (!server) {
          return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
        }

        const harga = server.harga;
        const totalHarga = harga * state.exp; 
        db.get('SELECT saldo FROM users WHERE user_id = ?', [ctx.from.id], async (err, user) => {
          if (err) {
            logger.error('⚠️ Kesalahan saat mengambil saldo pengguna:', err.message);
            return ctx.reply('❌ *Terjadi kesalahan saat mengambil saldo pengguna.*', { parse_mode: 'Markdown' });
          }

          if (!user) {
            return ctx.reply('❌ *Pengguna tidak ditemukan.*', { parse_mode: 'Markdown' });
          }

          const saldo = user.saldo;
          if (saldo < totalHarga) {
            return ctx.reply('❌ *Saldo Anda tidak mencukupi untuk melakukan transaksi ini.*', { parse_mode: 'Markdown' });
          }
          if (action === 'create') {
            if (type === 'vmess') {
              msg = await createvmess(username, exp, quota, iplimit, serverId);
              await recordAccountTransaction(ctx.from.id, 'vmess');
            } else if (type === 'vless') {
              msg = await createvless(username, exp, quota, iplimit, serverId);
              await recordAccountTransaction(ctx.from.id, 'vless');
            } else if (type === 'trojan') {
              msg = await createtrojan(username, exp, quota, iplimit, serverId);
              await recordAccountTransaction(ctx.from.id, 'trojan');
            } else if (type === 'shadowsocks') {
              msg = await createshadowsocks(username, exp, quota, iplimit, serverId);
              await recordAccountTransaction(ctx.from.id, 'shadowsocks');
            } else if (type === 'ssh') {
              msg = await createssh(username, password, exp, iplimit, serverId);
              await recordAccountTransaction(ctx.from.id, 'ssh');
            }
            logger.info(`Account created and transaction recorded for user ${ctx.from.id}, type: ${type}`);
          } else if (action === 'renew') {
            if (type === 'vmess') {
              msg = await renewvmess(username, exp, quota, iplimit, serverId);
              await recordAccountTransaction(ctx.from.id, 'vmess');
            } else if (type === 'vless') {
              msg = await renewvless(username, exp, quota, iplimit, serverId);
              await recordAccountTransaction(ctx.from.id, 'vless');
            } else if (type === 'trojan') {
              msg = await renewtrojan(username, exp, quota, iplimit, serverId);
              await recordAccountTransaction(ctx.from.id, 'trojan');
            } else if (type === 'shadowsocks') {
              msg = await renewshadowsocks(username, exp, quota, iplimit, serverId);
              await recordAccountTransaction(ctx.from.id, 'shadowsocks');
            } else if (type === 'ssh') {
              msg = await renewssh(username, exp, iplimit, serverId);
              await recordAccountTransaction(ctx.from.id, 'ssh');
            }
            logger.info(`Account renewed and transaction recorded for user ${ctx.from.id}, type: ${type}`);
          }
//SALDO DATABES
// setelah bikin akun (create/renew), kita cek hasilnya
if (msg.includes('❌')) {
  logger.error(`🔄 Rollback saldo user ${ctx.from.id}, type: ${type}, server: ${serverId}, respon: ${msg}`);
  return ctx.reply(msg, { parse_mode: 'Markdown' });
}

// kalau sampai sini artinya tidak ada ❌, transaksi sukses
logger.info(`✅ Transaksi sukses untuk user ${ctx.from.id}, type: ${type}, server: ${serverId}`);

db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [totalHarga, ctx.from.id], (err) => {
  if (err) {
    logger.error('⚠️ Kesalahan saat mengurangi saldo pengguna:', err.message);
    return ctx.reply('❌ *Terjadi kesalahan saat mengurangi saldo pengguna.*', { parse_mode: 'Markdown' });
  }
});

db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [serverId], (err) => {
  if (err) {
    logger.error('⚠️ Kesalahan saat menambahkan total_create_akun:', err.message);
  }
});

await ctx.reply(msg, { parse_mode: 'Markdown' });
delete userState[ctx.chat.id];
//SALDO DATABES
          });
        });
      });
    } 
  else if (state.step === 'addserver') {
    const domain = ctx.message.text.trim();
    if (!domain) {
      await ctx.reply('⚠️ *Domain tidak boleh kosong.* Silakan masukkan domain server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_auth';
    state.domain = domain;
    await ctx.reply('🔑 *Silakan masukkan auth server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_auth') {
    const auth = ctx.message.text.trim();
    if (!auth) {
      await ctx.reply('⚠️ *Auth tidak boleh kosong.* Silakan masukkan auth server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_nama_server';
    state.auth = auth;
    await ctx.reply('🏷️ *Silakan masukkan nama server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_nama_server') {
    const nama_server = ctx.message.text.trim();
    if (!nama_server) {
      await ctx.reply('⚠️ *Nama server tidak boleh kosong.* Silakan masukkan nama server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_quota';
    state.nama_server = nama_server;
    await ctx.reply('📊 *Silakan masukkan quota server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_quota') {
    const quota = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(quota)) {
      await ctx.reply('⚠️ *Quota tidak valid.* Silakan masukkan quota server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_iplimit';
    state.quota = quota;
    await ctx.reply('🔢 *Silakan masukkan limit IP server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_iplimit') {
    const iplimit = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(iplimit)) {
      await ctx.reply('⚠️ *Limit IP tidak valid.* Silakan masukkan limit IP server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_batas_create_akun';
    state.iplimit = iplimit;
    await ctx.reply('🔢 *Silakan masukkan batas create akun server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_batas_create_akun') {
    const batas_create_akun = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(batas_create_akun)) {
      await ctx.reply('⚠️ *Batas create akun tidak valid.* Silakan masukkan batas create akun server yang valid.', { parse_mode: 'Markdown' });
      return;
    }

    state.step = 'addserver_harga';
    state.batas_create_akun = batas_create_akun;
    await ctx.reply('💰 *Silakan masukkan harga server:*', { parse_mode: 'Markdown' });
  } else if (state.step === 'addserver_harga') {
    const harga = parseFloat(ctx.message.text.trim());
    if (isNaN(harga) || harga <= 0) {
      await ctx.reply('⚠️ *Harga tidak valid.* Silakan masukkan harga server yang valid.', { parse_mode: 'Markdown' });
      return;
    }
    const { domain, auth, nama_server, quota, iplimit, batas_create_akun } = state;

  try {
    db.run('INSERT INTO Server (domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, 0], function(err) {        if (err) {
          logger.error('Error saat menambahkan server:', err.message);
          ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
        } else {
          ctx.reply(`✅ *Server baru dengan domain ${domain} telah berhasil ditambahkan.*\n\n📄 *Detail Server:*\n- Domain: ${domain}\n- Auth: ${auth}\n- Nama Server: ${nama_server}\n- Quota: ${quota}\n- Limit IP: ${iplimit}\n- Batas Create Akun: ${batas_create_akun}\n- Harga: Rp ${harga}`, { parse_mode: 'Markdown' });
        }
      });
    } catch (error) {
      logger.error('Error saat menambahkan server:', error);
      await ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
  }
// === 🏷️ TAMBAH SERVER UNTUK RESELLER ===
if (state && state.step === 'reseller_domain') {
  state.domain = text;
  state.step = 'reseller_auth';
  return ctx.reply('🔑 Masukkan auth server:');
}

if (state && state.step === 'reseller_auth') {
  state.auth = text;
  state.step = 'reseller_harga';
  return ctx.reply('💰 Masukkan harga server (angka):');
}

if (state && state.step === 'reseller_harga') {
  state.harga = text;
  state.step = 'reseller_nama';
  return ctx.reply('📝 Masukkan nama server:');
}

if (state && state.step === 'reseller_nama') {
  state.nama_server = text;
  state.step = 'reseller_quota';
  return ctx.reply('📊 Masukkan quota (GB):');
}

if (state && state.step === 'reseller_quota') {
  state.quota = text;
  state.step = 'reseller_iplimit';
  return ctx.reply('📶 Masukkan IP limit:');
}

if (state && state.step === 'reseller_iplimit') {
  state.iplimit = text;
  state.step = 'reseller_batas';
  return ctx.reply('🔢 Masukkan batas create akun:');
}

if (state && state.step === 'reseller_batas') {
  state.batas_create_akun = text;

  db.run(
    `INSERT INTO Server (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun, total_create_akun, is_reseller_only)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)`,
    [
      state.domain,
      state.auth,
      parseInt(state.harga),
      state.nama_server,
      parseInt(state.quota),
      parseInt(state.iplimit),
      parseInt(state.batas_create_akun),
    ],
    (err) => {
      if (err) {
        logger.error('❌ Gagal menambah server reseller:', err.message);
        ctx.reply('❌ Gagal menambah server reseller.');
      } else {
        ctx.reply(
          `✅ Server reseller *${state.nama_server}* berhasil ditambahkan!`,
          { parse_mode: 'Markdown' }
        );
      }
      delete userState[ctx.chat.id];
    }
  );
  return;
}
// === 💰 TAMBAH SALDO (LANGKAH 1: INPUT USER ID) ===
if (state && state.step === 'addsaldo_userid') {
  state.targetId = text.trim();
  state.step = 'addsaldo_amount';
  return ctx.reply('💰 Masukkan jumlah saldo yang ingin ditambahkan:');
}

// === 💰 TAMBAH SALDO (LANGKAH 1: INPUT USER ID) ===
if (state && state.step === 'addsaldo_userid') {
  state.targetId = text.trim();
  state.step = 'addsaldo_amount';
  return ctx.reply('💰 Masukkan jumlah saldo yang ingin ditambahkan:');
}

// === 💰 TAMBAH SALDO (LANGKAH 2: INPUT JUMLAH SALDO) ===
if (state && state.step === 'addsaldo_amount') {
  const amount = parseInt(text.trim());
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('⚠️ Jumlah saldo harus berupa angka dan lebih dari 0.');
  }

  const targetId = state.targetId;

// Tambahkan saldo
db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetId], (err) => {
  if (err) {
    logger.error('❌ Gagal menambah saldo:', err.message);
    return ctx.reply('❌ Gagal menambah saldo ke user.');
  }

  // Ambil saldo terbaru
  db.get('SELECT saldo FROM users WHERE user_id = ?', [targetId], (err2, updated) => {
    if (err2 || !updated) {
      ctx.reply(`✅ Saldo sebesar Rp${amount} berhasil ditambahkan ke user ${targetId}.`);
      logger.info(`Admin ${ctx.from.id} menambah saldo Rp${amount} ke user ${targetId}.`);
    } else {
      ctx.reply(`✅ Saldo sebesar Rp${amount} berhasil ditambahkan ke user ${targetId}.\n💳 Saldo sekarang: Rp${updated.saldo}`);
      logger.info(`Admin ${ctx.from.id} menambah saldo Rp${amount} ke user ${targetId} (Saldo akhir: Rp${updated.saldo}).`);
    }
  });

  delete userState[ctx.from.id];
});

  return;
}
});
////////
bot.action('addserver', async (ctx) => {
  try {
    logger.info('📥 Proses tambah server dimulai');
    await ctx.answerCbQuery();
    await ctx.reply('🌐 *Silakan masukkan domain/ip server:*', { parse_mode: 'Markdown' });
    userState[ctx.chat.id] = { step: 'addserver' };
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses tambah server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});
bot.action('detailserver', async (ctx) => {
  try {
    logger.info('📋 Proses detail server dimulai');
    await ctx.answerCbQuery();
    
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      logger.info('⚠️ Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    const buttons = [];
    for (let i = 0; i < servers.length; i += 2) {
      const row = [];
      row.push({
        text: `${servers[i].nama_server}`,
        callback_data: `server_detail_${servers[i].id}`
      });
      if (i + 1 < servers.length) {
        row.push({
          text: `${servers[i + 1].nama_server}`,
          callback_data: `server_detail_${servers[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    await ctx.reply('📋 *Silakan pilih server untuk melihat detail:*', {
      reply_markup: { inline_keyboard: buttons },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

bot.action('listserver', async (ctx) => {
  try {
    logger.info('📜 Proses daftar server dimulai');
    await ctx.answerCbQuery();
    
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      logger.info('⚠️ Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    let serverList = '📜 *Daftar Server* 📜\n\n';
    servers.forEach((server, index) => {
      serverList += `🔹 ${index + 1}. ${server.domain}\n`;
    });

    serverList += `\nTotal Jumlah Server: ${servers.length}`;

    await ctx.reply(serverList, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil daftar server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
  }
});
bot.action('resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('🚨 *PERHATIAN! Anda akan menghapus semua server yang tersedia. Apakah Anda yakin?*', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Ya', callback_data: 'confirm_resetdb' }],
          [{ text: '❌ Tidak', callback_data: 'cancel_resetdb' }]
        ]
      },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Error saat memulai proses reset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('confirm_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM Server', (err) => {
        if (err) {
          logger.error('❌ Error saat mereset tabel Server:', err.message);
          return reject('❗️ *PERHATIAN! Terjadi KESALAHAN SERIUS saat mereset database. Harap segera hubungi administrator!*');
        }
        resolve();
      });
    });
    await ctx.reply('🚨 *PERHATIAN! Database telah DIRESET SEPENUHNYA. Semua server telah DIHAPUS TOTAL.*', { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('❌ Error saat mereset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('cancel_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('❌ *Proses reset database dibatalkan.*', { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('❌ Error saat membatalkan reset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('deleteserver', async (ctx) => {
  try {
    logger.info('🗑️ Proses hapus server dimulai');
    await ctx.answerCbQuery();
    
    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        logger.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
      }

      if (servers.length === 0) {
        logger.info('⚠️ Tidak ada server yang tersedia');
        return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
      }

      const keyboard = servers.map(server => {
        return [{ text: server.nama_server, callback_data: `confirm_delete_server_${server.id}` }];
      });
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'kembali_ke_menu' }]);

      ctx.reply('🗑️ *Pilih server yang ingin dihapus:*', {
        reply_markup: {
          inline_keyboard: keyboard
        },
        parse_mode: 'Markdown'
      });
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses hapus server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});


const getUsernameById = async (userId) => {
  try {
    const telegramUser = await bot.telegram.getChat(userId);
    return telegramUser.username || telegramUser.first_name;
  } catch (err) {
    logger.error('❌ Kesalahan saat mengambil username dari Telegram:', err.message);
    throw new Error('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil username dari Telegram.*');
  }
};
/////////////
bot.action('tambah_saldo', async (ctx) => {
  await ctx.answerCbQuery();
  const adminId = ctx.from.id;
  userState[adminId] = { step: 'addsaldo_userid' };
  await ctx.reply('🔢 Masukkan ID Telegram user yang ingin ditambahkan saldo:');
});
//////
bot.action(/next_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = currentPage * 20;

  try {
    logger.info(`Next users process started for page ${currentPage + 1}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT user_id FROM users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const keyboard = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].user_id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].user_id}`
        });
      }
      keyboard.push(row);
    }

    const replyMarkup = {
      inline_keyboard: [...keyboard]
    };

    const navigationButtons = [];
    if (currentPage > 0) {
      navigationButtons.push([{
        text: '⬅️ Back',
        callback_data: `prev_users_${currentPage - 1}`
      }]);
    }
    if (offset + 20 < totalUsers) {
      navigationButtons.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage + 1}`
      }]);
    }

    replyMarkup.inline_keyboard.push(...navigationButtons);

    await ctx.editMessageReplyMarkup(replyMarkup);
  } catch (error) {
    logger.error('❌ Kesalahan saat memproses next users:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action(/prev_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = (currentPage - 1) * 20; 

  try {
    logger.info(`Previous users process started for page ${currentPage}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT user_id FROM users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const keyboard = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].user_id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].user_id}`
        });
      }
      keyboard.push(row);
    }

    const replyMarkup = {
      inline_keyboard: [...keyboard]
    };

    const navigationButtons = [];
    if (currentPage > 0) {
      navigationButtons.push([{
        text: '⬅️ Back',
        callback_data: `prev_users_${currentPage - 1}`
      }]);
    }
    if (offset + 20 < totalUsers) {
      navigationButtons.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage}`
      }]);
    }

    replyMarkup.inline_keyboard.push(...navigationButtons);

    await ctx.editMessageReplyMarkup(replyMarkup);
  } catch (error) {
    logger.error('❌ Kesalahan saat memproses previous users:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_limit_ip', async (ctx) => {
  try {
    logger.info('Edit server limit IP process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_limit_ip_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit limit IP:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit limit IP server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_batas_create_akun', async (ctx) => {
  try {
    logger.info('Edit server batas create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_batas_create_akun_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit batas create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit batas create akun server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_total_create_akun', async (ctx) => {
  try {
    logger.info('Edit server total create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_total_create_akun_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit total create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit total create akun server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_quota', async (ctx) => {
  try {
    logger.info('Edit server quota process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_quota_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silakan pilih server untuk mengedit quota:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit quota server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_auth', async (ctx) => {
  try {
    logger.info('Edit server auth process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_auth_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🌐 *Silakan pilih server untuk mengedit auth:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit auth server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_harga', async (ctx) => {
  try {
    logger.info('Edit server harga process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_harga_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('💰 *Silakan pilih server untuk mengedit harga:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit harga server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_domain', async (ctx) => {
  try {
    logger.info('Edit server domain process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_domain_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🌐 *Silakan pilih server untuk mengedit domain:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit domain server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('nama_server_edit', async (ctx) => {
  try {
    logger.info('Edit server nama process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_nama_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🏷️ *Silakan pilih server untuk mengedit nama:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit nama server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('topup_saldo', async (ctx) => {
  try {
    await ctx.answerCbQuery(); 
    const userId = ctx.from.id;
    logger.info(`🔍 User ${userId} memulai proses top-up saldo.`);
    

    if (!global.depositState) {
      global.depositState = {};
    }
    global.depositState[userId] = { action: 'request_amount', amount: '' };
    
    logger.info(`🔍 User ${userId} diminta untuk memasukkan jumlah nominal saldo.`);
    

    const keyboard = keyboard_nomor();
    
    await ctx.editMessageText('💰 *Silakan masukkan jumlah nominal saldo yang Anda ingin tambahkan ke akun Anda:*', {
      reply_markup: {
        inline_keyboard: keyboard
      },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses top-up saldo:', error);
    await ctx.editMessageText('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});

bot.action(/edit_harga_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit harga server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_harga', serverId: serverId };

  await ctx.reply('💰 *Silakan masukkan harga server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/add_saldo_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk menambahkan saldo user dengan ID: ${userId}`);
  userState[ctx.chat.id] = { step: 'add_saldo', userId: userId };

  await ctx.reply('📊 *Silakan masukkan jumlah saldo yang ingin ditambahkan:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_batas_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit batas create akun server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_batas_create_akun', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan batas create akun server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_total_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit total create akun server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_total_create_akun', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan total create akun server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_limit_ip_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit limit IP server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_limit_ip', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan limit IP server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_quota_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit quota server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_quota', serverId: serverId };

  await ctx.reply('📊 *Silakan masukkan quota server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_auth_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit auth server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_auth', serverId: serverId };

  await ctx.reply('🌐 *Silakan masukkan auth server baru:*', {
    reply_markup: { inline_keyboard: keyboard_full() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_domain_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit domain server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_domain', serverId: serverId };

  await ctx.reply('🌐 *Silakan masukkan domain server baru:*', {
    reply_markup: { inline_keyboard: keyboard_full() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_nama_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit nama server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_nama', serverId: serverId };

  await ctx.reply('🏷️ *Silakan masukkan nama server baru:*', {
    reply_markup: { inline_keyboard: keyboard_abc() },
    parse_mode: 'Markdown'
  });
});
bot.action(/confirm_delete_server_(\d+)/, async (ctx) => {
  try {
    db.run('DELETE FROM Server WHERE id = ?', [ctx.match[1]], function(err) {
      if (err) {
        logger.error('Error deleting server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat menghapus server.*', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
        logger.info('Server tidak ditemukan');
        return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      }

      logger.info(`Server dengan ID ${ctx.match[1]} berhasil dihapus`);
      ctx.reply('✅ *Server berhasil dihapus.*', { parse_mode: 'Markdown' });
    });
  } catch (error) {
    logger.error('Kesalahan saat menghapus server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});

bot.action(/server_detail_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  try {
    const server = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(server);
      });
    });

    if (!server) {
      logger.info('⚠️ Server tidak ditemukan');
      return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    const serverDetails = `📋 *Detail Server* 📋\n\n` +
      `🌐 *Domain:* \`${server.domain}\`\n` +
      `🔑 *Auth:* \`${server.auth}\`\n` +
      `🏷️ *Nama Server:* \`${server.nama_server}\`\n` +
      `📊 *Quota:* \`${server.quota}\`\n` +
      `📶 *Limit IP:* \`${server.iplimit}\`\n` +
      `🔢 *Batas Create Akun:* \`${server.batas_create_akun}\`\n` +
      `📋 *Total Create Akun:* \`${server.total_create_akun}\`\n` +
      `💵 *Harga:* \`Rp ${server.harga}\`\n\n`;

    await ctx.reply(serverDetails, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  const userStateData = userState[ctx.chat.id];

  if (global.depositState && global.depositState[userId] && global.depositState[userId].action === 'request_amount') {
    await handleDepositState(ctx, userId, data);
  } else if (userStateData) {
    switch (userStateData.step) {
case 'addsaldo_userid':
  state.targetId = ctx.message.text.trim();
  state.step = 'addsaldo_jumlah';
  return ctx.reply('💰 Masukkan jumlah saldo yang ingin ditambahkan:');

case 'addsaldo_amount':
  const amount = parseInt(ctx.message.text.trim());
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply('⚠️ Jumlah saldo harus berupa angka dan lebih dari 0.');
  }

  const targetId = state.targetId;
  db.get('SELECT * FROM users WHERE user_id = ?', [targetId], (err, row) => {
    if (err) {
      logger.error('❌ Kesalahan saat memeriksa user_id:', err.message);
      return ctx.reply('❌ Terjadi kesalahan saat memeriksa user.');
    }

    if (!row) {
      return ctx.reply(`⚠️ User dengan ID ${targetId} belum terdaftar di database.`);
    }

    db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetId], function (err) {
      if (err) {
        logger.error('❌ Gagal menambah saldo:', err.message);
        return ctx.reply('❌ Gagal menambah saldo.');
      }

      // 🔥 Perbaikan di bawah ini
      db.get('SELECT saldo FROM users WHERE user_id = ?', [targetId], (err2, updatedRow) => {
        if (err2 || !updatedRow) {
          logger.info(`Admin ${ctx.from.id} menambah saldo Rp${amount} ke user ${targetId}, namun gagal membaca saldo terbaru.`);
          return ctx.reply(`✅ Saldo sebesar Rp${amount.toLocaleString()} berhasil ditambahkan ke user ${targetId}.`);
        }

        ctx.reply(`✅ Saldo sebesar Rp${amount.toLocaleString()} berhasil ditambahkan ke user ${targetId}.\n💰 Saldo user sekarang: Rp${updatedRow.saldo.toLocaleString()}`);
        logger.info(`Admin ${ctx.from.id} menambah saldo Rp${amount} ke user ${targetId}. Saldo user sekarang: Rp${updatedRow.saldo}`);
      });

      delete userState[ctx.from.id];
    });
  });
  break;

  default:
    await ctx.reply('❓ Perintah tidak dikenali.');
        break;
///////////////////////////
      case 'edit_batas_create_akun':
        await handleEditBatasCreateAkun(ctx, userStateData, data);
        break;
      case 'edit_limit_ip':
        await handleEditiplimit(ctx, userStateData, data);
        break;
      case 'edit_quota':
        await handleEditQuota(ctx, userStateData, data);
        break;
      case 'edit_auth':
        await handleEditAuth(ctx, userStateData, data);
        break;
      case 'edit_domain':
        await handleEditDomain(ctx, userStateData, data);
        break;
      case 'edit_harga':
        await handleEditHarga(ctx, userStateData, data);
        break;
      case 'edit_nama':
        await handleEditNama(ctx, userStateData, data);
        break;
      case 'edit_total_create_akun':
        await handleEditTotalCreateAkun(ctx, userStateData, data);
        break;
    }
  }
});


async function handleDepositState(ctx, userId, data) {
  let currentAmount = global.depositState[userId].amount;

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ Jumlah tidak boleh kosong!', { show_alert: true });
    }
    if (parseInt(currentAmount) < 5000) {
      return await ctx.answerCbQuery('⚠️ Jumlah minimal adalah 5.000 !', { show_alert: true });
    }
    global.depositState[userId].action = 'confirm_amount';
    await processDeposit(ctx, currentAmount);
    return;
  } else {
    if (currentAmount.length < 12) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery('⚠️ Jumlah maksimal adalah 12 digit!', { show_alert: true });
    }
  }

  global.depositState[userId].amount = currentAmount;
  const newMessage = `💰 *Silakan masukkan jumlah nominal saldo yang Anda ingin tambahkan ke akun Anda:*\n\nJumlah saat ini: *Rp ${currentAmount || '0'}*`;
  
  try {
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
    } else {
      await ctx.answerCbQuery();
    }
  } catch (error) {
    await ctx.answerCbQuery();
    logger.error('Error editing message:', error.message);
  }
}

async function handleAddSaldo(ctx, userStateData, data) {
  let currentSaldo = userStateData.saldo || '';

  if (data === 'backspace') {
    currentSaldo = currentSaldo.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentSaldo.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak boleh kosong!*', { show_alert: true });
    }

    try {
      await updateUserBalance(userStateData.userId, currentSaldo);
      ctx.reply(`✅ *Saldo user berhasil ditambahkan.*\n\n📄 *Detail Saldo:*\n- Jumlah Saldo: *Rp ${currentSaldo}*`, { parse_mode: 'Markdown' });
    } catch (error) {
      ctx.reply('❌ *Terjadi kesalahan saat menambahkan saldo user.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else if (data === 'cancel') {
    delete userState[ctx.chat.id];
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak valid!*', { show_alert: true });
  } else {
    if (currentSaldo.length < 10) {
      currentSaldo += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo maksimal adalah 10 karakter!*', { show_alert: true });
    }
  }

  userStateData.saldo = currentSaldo;
  const newMessage = `📊 *Silakan masukkan jumlah saldo yang ingin ditambahkan:*\n\nJumlah saldo saat ini: *${currentSaldo}*`;
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
}

async function handleEditBatasCreateAkun(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'batasCreateAkun', 'batas create akun', 'UPDATE Server SET batas_create_akun = ? WHERE id = ?');
}

async function handleEditTotalCreateAkun(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'totalCreateAkun', 'total create akun', 'UPDATE Server SET total_create_akun = ? WHERE id = ?');
}

async function handleEditiplimit(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'iplimit', 'limit IP', 'UPDATE Server SET limit_ip = ? WHERE id = ?');
}

async function handleEditQuota(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'quota', 'quota', 'UPDATE Server SET quota = ? WHERE id = ?');
}

async function handleEditAuth(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'auth', 'auth', 'UPDATE Server SET auth = ? WHERE id = ?');
}

async function handleEditDomain(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'domain', 'domain', 'UPDATE Server SET domain = ? WHERE id = ?');
}

async function handleEditHarga(ctx, userStateData, data) {
  let currentAmount = userStateData.amount || '';

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah tidak boleh kosong!*', { show_alert: true });
    }
    const hargaBaru = parseFloat(currentAmount);
    if (isNaN(hargaBaru) || hargaBaru <= 0) {
      return ctx.reply('❌ *Harga tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
    }
    try {
      await updateServerField(userStateData.serverId, hargaBaru, 'UPDATE Server SET harga = ? WHERE id = ?');
      ctx.reply(`✅ *Harga server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Harga Baru: *Rp ${hargaBaru}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('❌ *Terjadi kesalahan saat mengupdate harga server.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^\d+$/.test(data)) {
      return await ctx.answerCbQuery('⚠️ *Hanya angka yang diperbolehkan!*', { show_alert: true });
    }
    if (currentAmount.length < 12) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah maksimal adalah 12 digit!*', { show_alert: true });
    }
  }

  userStateData.amount = currentAmount;
  const newMessage = `💰 *Silakan masukkan harga server baru:*\n\nJumlah saat ini: *Rp ${currentAmount}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}

async function handleEditNama(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'name', 'nama server', 'UPDATE Server SET nama_server = ? WHERE id = ?');
}

async function handleEditField(ctx, userStateData, data, field, fieldName, query) {
  let currentValue = userStateData[field] || '';

  if (data === 'delete') {
    currentValue = currentValue.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentValue.length === 0) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak boleh kosong!*`, { show_alert: true });
    }
    try {
      await updateServerField(userStateData.serverId, currentValue, query);
      ctx.reply(`✅ *${fieldName} server berhasil diupdate.*\n\n📄 *Detail Server:*\n- ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}: *${currentValue}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`❌ *Terjadi kesalahan saat mengupdate ${fieldName} server.*`, { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^[a-zA-Z0-9.-]+$/.test(data)) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak valid!*`, { show_alert: true });
    }
    if (currentValue.length < 253) {
      currentValue += data;
    } else {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} maksimal adalah 253 karakter!*`, { show_alert: true });
    }
  }

  userStateData[field] = currentValue;
  const newMessage = `📊 *Silakan masukkan ${fieldName} server baru:*\n\n${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} saat ini: *${currentValue}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}
async function updateUserSaldo(userId, saldo) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [saldo, userId], function (err) {
      if (err) {
        logger.error('⚠️ Kesalahan saat menambahkan saldo user:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function updateServerField(serverId, value, query) {
  return new Promise((resolve, reject) => {
    db.run(query, [value, serverId], function (err) {
      if (err) {
        logger.error(`⚠️ Kesalahan saat mengupdate ${fieldName} server:`, err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function generateRandomAmount(baseAmount) {
  const random = Math.floor(Math.random() * 99) + 1;
  return baseAmount + random;
}

global.depositState = {};
global.pendingDeposits = {};
let lastRequestTime = 0;
const requestInterval = 1000; 

db.all('SELECT * FROM pending_deposits WHERE status = "pending"', [], (err, rows) => {
  if (err) {
    logger.error('Gagal load pending_deposits:', err.message);
    return;
  }
  rows.forEach(row => {
    global.pendingDeposits[row.unique_code] = {
      amount: row.amount,
      originalAmount: row.original_amount,
      userId: row.user_id,
      timestamp: row.timestamp,
      status: row.status,
      qrMessageId: row.qr_message_id
    };
  });
  logger.info('Pending deposit loaded:', Object.keys(global.pendingDeposits).length);
});

/*
    const qris = new QRISPayment({
    merchantId: MERCHANT_ID,
    apiKey: API_KEY,
    baseQrString: DATA_QRIS,
    logoPath: 'logo.png'
});
*/
function generateRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function processDeposit(ctx, amount) {
  const currentTime = Date.now();

  if (currentTime - lastRequestTime < requestInterval) {
    await ctx.editMessageText('⚠️ *Terlalu banyak permintaan. Silakan tunggu sebentar sebelum mencoba lagi.*', { parse_mode: 'Markdown' });
    return;
  }

  lastRequestTime = currentTime;
  const userId = ctx.from.id;
  const uniqueCode = `user-${userId}-${Date.now()}`;

  // Generate final amount with random suffix
  const finalAmount = Number(amount) + generateRandomNumber(1, 300);
  const adminFee = finalAmount - Number(amount)
  try {
    const urlQr = DATA_QRIS; // QR destination
   // console.log('🔍 CEK DATA_QRIS:', urlQr);
    const axios = require('axios');
//const sharp = require('sharp'); // opsional kalau mau resize

const bayar = await axios.get(`https://api.serverpremium.web.id/orderkuota/createpayment?apikey=AriApiPaymetGetwayMod&amount=${finalAmount}&codeqr=${urlQr}`);
const get = bayar.data;

if (get.status !== 'success') {
  throw new Error('Gagal membuat QRIS: ' + JSON.stringify(get));
}

const qrImageUrl = get.result.imageqris?.url;

if (!qrImageUrl || qrImageUrl.includes('undefined')) {
  throw new Error('URL QRIS tidak valid: ' + qrImageUrl);
}

// Download gambar QR
const qrResponse = await axios.get(qrImageUrl, { responseType: 'arraybuffer' });
const qrBuffer = Buffer.from(qrResponse.data);

    const caption =
      `📝 *Detail Pembayaran:*\n\n` +
                  `💰 Jumlah: Rp ${finalAmount}\n` +
      `- Nominal Top Up: Rp ${amount}\n` +
      `- Admin Fee : Rp ${adminFee}\n` +
                  `⚠️ *Penting:* Mohon transfer sesuai nominal\n` +
      `⏱️ Waktu: 5 menit\n\n` +
                  `⚠️ *Catatan:*\n` +
                  `- Pembayaran akan otomatis terverifikasi\n` +
      `- Jika pembayaran berhasil, saldo akan otomatis ditambahkan`;

    const qrMessage = await ctx.replyWithPhoto({ source: qrBuffer }, {
      caption: caption,
          parse_mode: 'Markdown'
        }); 
    // Hapus pesan input nominal setelah QR code dikirim
    try {
      await ctx.deleteMessage();
    } catch (e) {
      logger.error('Gagal menghapus pesan input nominal:', e.message);
    }

        global.pendingDeposits[uniqueCode] = {
          amount: finalAmount,
          originalAmount: amount,
          userId,
          timestamp: Date.now(),
      status: 'pending',
      qrMessageId: qrMessage.message_id
    };

    db.run(
      `INSERT INTO pending_deposits (unique_code, user_id, amount, original_amount, timestamp, status, qr_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uniqueCode, userId, finalAmount, amount, Date.now(), 'pending', qrMessage.message_id],
      (err) => {
        if (err) logger.error('Gagal insert pending_deposits:', err.message);
      }
    );
        delete global.depositState[userId];

  } catch (error) {
    logger.error('❌ Kesalahan saat memproses deposit:', error);
    await ctx.editMessageText('❌ *GAGAL! Terjadi kesalahan saat memproses pembayaran. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
    delete global.depositState[userId];
    delete global.pendingDeposits[uniqueCode];
    db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
      if (err) logger.error('Gagal hapus pending_deposits (error):', err.message);
    });
  }
}

async function checkQRISStatus() {
  try {
    const pendingDeposits = Object.entries(global.pendingDeposits);

    for (const [uniqueCode, deposit] of pendingDeposits) {
      if (deposit.status !== 'pending') continue;

      const depositAge = Date.now() - deposit.timestamp;
      if (depositAge > 5 * 60 * 1000) {
        try {
          if (deposit.qrMessageId) {
            await bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId);
          }
          await bot.telegram.sendMessage(
            deposit.userId,
            '❌ *Pembayaran Expired*\n\n' +
              'Waktu pembayaran telah habis. Silakan klik Top Up lagi untuk mendapatkan QR baru.',
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          logger.error('Error deleting expired payment messages:', error);
        }

        delete global.pendingDeposits[uniqueCode];
        db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
          if (err) logger.error('Gagal hapus pending_deposits (expired):', err.message);
        });
        continue;
      }

      try {
        const data = buildPayload(); // payload selalu fresh
        const resultcek = await axios.post(API_URL, data, { headers, timeout: 5000 });

        // API balik teks (bukan JSON)
        const responseText = resultcek.data;
        //console.log('📦 Raw response from API:\n', responseText);

        // Parse teks jadi array transaksi
        const transaksiList = [];
        const blocks = responseText.split('------------------------').filter(Boolean);

        for (const block of blocks) {
          const kreditMatch = block.match(/Kredit\s*:\s*([\d.]+)/);
          const tanggalMatch = block.match(/Tanggal\s*:\s*(.+)/);
          const brandMatch = block.match(/Brand\s*:\s*(.+)/);
          if (kreditMatch) {
            transaksiList.push({
              tanggal: tanggalMatch ? tanggalMatch[1].trim() : '-',
              kredit: Number(kreditMatch[1].replace(/\./g, '')),
              brand: brandMatch ? brandMatch[1].trim() : '-'
            });
          }
        }

        // Debug hasil parsing
        console.log('✅ Parsed transaksi:', transaksiList);

        // Cocokkan nominal
        const expectedAmount = deposit.amount;
        const matched = transaksiList.find(t => t.kredit === expectedAmount);

        if (matched) {
          const success = await processMatchingPayment(deposit, matched, uniqueCode);
          if (success) {
            logger.info(`Payment processed successfully for ${uniqueCode}`);
            delete global.pendingDeposits[uniqueCode];
            db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
              if (err) logger.error('Gagal hapus pending_deposits (success):', err.message);
            });
          }
        }
      } catch (error) {
        logger.error(`Error checking payment status for ${uniqueCode}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('Error in checkQRISStatus:', error);
  }
}

function keyboard_abc() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

function keyboard_nomor() {
  const alphabet = '1234567890';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

function keyboard_full() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

global.processedTransactions = new Set();
async function updateUserBalance(userId, amount) {
  return new Promise((resolve, reject) => {
    db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?", [amount, userId], function(err) {
        if (err) {
        logger.error('⚠️ Kesalahan saat mengupdate saldo user:', err.message);
          reject(err);
      } else {
        resolve();
        }
    });
  });
}

async function getUserBalance(userId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT saldo FROM users WHERE user_id = ?", [userId], function(err, row) {
        if (err) {
        logger.error('⚠️ Kesalahan saat mengambil saldo user:', err.message);
          reject(err);
      } else {
        resolve(row ? row.saldo : 0);
        }
    });
  });
}

async function sendPaymentSuccessNotification(userId, deposit, currentBalance) {
  try {
    // Hitung admin fee
    const adminFee = deposit.amount - deposit.originalAmount;
    await bot.telegram.sendMessage(userId,
      `✅ *Pembayaran Berhasil!*\n\n` +
      `💰 Jumlah Deposit: Rp ${deposit.originalAmount}\n` +
      `💰 Biaya Admin: Rp ${adminFee}\n` +
      `💰 Total Pembayaran: Rp ${deposit.amount}\n` +
      `💳 Saldo Sekarang: Rp ${currentBalance}`,
      { parse_mode: 'Markdown' }
    );
    return true;
  } catch (error) {
    logger.error('Error sending payment notification:', error);
    return false;
  }
}

async function processMatchingPayment(deposit, matchingTransaction, uniqueCode) {
  const transactionKey = `${matchingTransaction.reference_id || uniqueCode}_${matchingTransaction.amount}`;
  // Use a database transaction to ensure atomicity
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      // First check if transaction was already processed
      db.get('SELECT id FROM transactions WHERE reference_id = ? AND amount = ?', 
        [matchingTransaction.reference_id || uniqueCode, matchingTransaction.amount], 
        (err, row) => {
          if (err) {
            db.run('ROLLBACK');
            logger.error('Error checking transaction:', err);
            reject(err);
            return;
          }
          if (row) {
            db.run('ROLLBACK');
    logger.info(`Transaction ${transactionKey} already processed, skipping...`);
            resolve(false);
            return;
          }
          // Update user balance
          db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', 
            [deposit.originalAmount, deposit.userId], 
            function(err) {
              if (err) {
                db.run('ROLLBACK');
                logger.error('Error updating balance:', err);
                reject(err);
                return;
              }
    // Record the transaction
      db.run(
                'INSERT INTO transactions (user_id, amount, type, reference_id, timestamp) VALUES (?, ?, ?, ?, ?)',
                [deposit.userId, deposit.originalAmount, 'deposit', matchingTransaction.reference_id || uniqueCode, Date.now()],
        (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    logger.error('Error recording transaction:', err);
                    reject(err);
                    return;
                  }
                  // Get updated balance
                  db.get('SELECT saldo FROM users WHERE user_id = ?', [deposit.userId], async (err, user) => {
                    if (err) {
                      db.run('ROLLBACK');
                      logger.error('Error getting updated balance:', err);
                      reject(err);
                      return;
                    }
                    // Send notification using sendPaymentSuccessNotification
    const notificationSent = await sendPaymentSuccessNotification(
      deposit.userId,
      deposit,
                      user.saldo
                    );
                    // Delete QR code message after payment success
                    if (deposit.qrMessageId) {
                      try {
                        await bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId);
                      } catch (e) {
                        logger.error("Gagal menghapus pesan QR code:", e.message);
                      }
                    }
    if (notificationSent) {
      // Notifikasi ke grup untuk top up
      try {
        // Pada notifikasi ke grup (top up dan pembelian/renew), ambil info user:
        let userInfo;
        try {
          userInfo = await bot.telegram.getChat(deposit ? deposit.userId : (ctx ? ctx.from.id : ''));
        } catch (e) {
          userInfo = {};
        }
        const username = userInfo.username ? `@${userInfo.username}` : (userInfo.first_name || (deposit ? deposit.userId : (ctx ? ctx.from.id : '')));
        const userDisplay = userInfo.username
          ? `${username} (${deposit ? deposit.userId : (ctx ? ctx.from.id : '')})`
          : `${username}`;
        await bot.telegram.sendMessage(
          GROUP_ID,
          `<blockquote>
✅ <b>Top Up Berhasil</b>
👤 User: ${userDisplay}
💰 Nominal: <b>Rp ${deposit.originalAmount}</b>
🏦 Saldo Sekarang: <b>Rp ${user.saldo}</b>
🕒 Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
</blockquote>`,
          { parse_mode: 'HTML' }
        );
      } catch (e) { logger.error('Gagal kirim notif top up ke grup:', e.message); }
      // Hapus semua file di receipts setelah pembayaran sukses
      try {
        const receiptsDir = path.join(__dirname, 'receipts');
        if (fs.existsSync(receiptsDir)) {
          const files = fs.readdirSync(receiptsDir);
          for (const file of files) {
            fs.unlinkSync(path.join(receiptsDir, file));
          }
        }
      } catch (e) { logger.error('Gagal menghapus file di receipts:', e.message); }
      db.run('COMMIT');
      global.processedTransactions.add(transactionKey);
      delete global.pendingDeposits[uniqueCode];
      db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
      resolve(true);
    } else {
      db.run('ROLLBACK');
      reject(new Error('Failed to send payment notification.'));
    }
                  });
                }
              );
            }
          );
        }
      );
    });
  });
}

setInterval(checkQRISStatus, 10000);

async function recordAccountTransaction(userId, type) {
  return new Promise((resolve, reject) => {
    const referenceId = `account-${type}-${userId}-${Date.now()}`;
    db.run(
      'INSERT INTO transactions (user_id, type, reference_id, timestamp) VALUES (?, ?, ?, ?)',
      [userId, type, referenceId, Date.now()],
      (err) => {
        if (err) {
          logger.error('Error recording account transaction:', err.message);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}



app.listen(port, () => {
  bot.launch().then(() => {
      logger.info('Bot telah dimulai');
  }).catch((error) => {
      logger.error('Error saat memulai bot:', error);
  });
  logger.info(`Server berjalan di port ${port}`);
});

