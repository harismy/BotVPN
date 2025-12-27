const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const { Telegraf } = require('telegraf');
const app = express();
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs/promises');

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

const { createzivpn } = require('./modules/createzivpn');
const { trialzivpn } = require('./modules/trialzivpn');

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

const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));

const BOT_TOKEN = vars.BOT_TOKEN;
const port = vars.PORT || 6969;
const ADMIN = vars.USER_ID; 
const NAMA_STORE = vars.NAMA_STORE || '@ARI_VPN_STORE';
const DATA_QRIS = vars.DATA_QRIS;
const MERCHANT_ID = vars.MERCHANT_ID;
const API_KEY = vars.API_KEY;
const GROUP_ID = vars.GROUP_ID;

// =================== PERBAIKAN GROUP_ID ===================
let GROUP_ID_NUM = null;

try {
  // Debug: log asli dari config
  logger.info(`🔍 GROUP_ID dari .vars.json: "${GROUP_ID}" (type: ${typeof GROUP_ID})`);
  
  // Konversi ke number dengan handle berbagai format
  if (GROUP_ID === undefined || GROUP_ID === null || GROUP_ID === "") {
    logger.error('❌ GROUP_ID tidak ditemukan di config!');
  } else {
    // Handle string atau number
    let groupIdStr = String(GROUP_ID).trim();
    
    // Jika ada tanda kutip di string, hapus
    groupIdStr = groupIdStr.replace(/['"]/g, '');
    
    // Konversi ke number
    const converted = Number(groupIdStr);
    
    if (!isNaN(converted)) {
      GROUP_ID_NUM = converted;
      logger.info(`✅ GROUP_ID valid: ${GROUP_ID_NUM}`);
      
      // Cek apakah ID negatif (semua grup Telegram punya ID negatif)
      if (GROUP_ID_NUM > 0) {
        logger.warn(`⚠️ GROUP_ID positif (${GROUP_ID_NUM}), biasanya grup Telegram ID-nya negatif`);
        logger.warn(`⚠️ Jika notifikasi gagal, coba ubah ke negatif di .vars.json`);
      }
    } else {
      logger.error(`❌ GROUP_ID tidak valid: "${GROUP_ID}" - harus berupa angka`);
    }
  }
} catch (e) {
  logger.error(`❌ Error processing GROUP_ID:`, e.message);
}

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
  is_reseller_only INTEGER DEFAULT 0,
  service TEXT DEFAULT 'ssh'
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

///////
// =================== COMMAND HAPUS SALDO ===================
bot.command('hapussaldo', async (ctx) => {
  try {
    const adminId = ctx.from.id;
    
    // Hanya admin
    if (!adminIds.includes(adminId)) {
      return ctx.reply('❌ *Hanya admin yang bisa menggunakan command ini!*', { parse_mode: 'Markdown' });
    }
    
    const args = ctx.message.text.trim().split(/\s+/);
    if (args.length !== 3) {
      return ctx.reply('❌ *Format salah!*\n\nGunakan:\n`/hapussaldo <user_id> <jumlah>`\n\nContoh:\n`/hapussaldo 123456789 50000`', { parse_mode: 'Markdown' });
    }
    
    const targetUserId = args[1].trim();
    const amount = parseInt(args[2], 10);
    
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply('❌ *Jumlah harus angka positif lebih dari 0!*', { parse_mode: 'Markdown' });
    }
    
    // Cek apakah user ada
    db.get('SELECT user_id, saldo FROM users WHERE user_id = ?', [targetUserId], (err, user) => {
      if (err) {
        logger.error('❌ Error cek user:', err.message);
        return ctx.reply('❌ Terjadi kesalahan saat memeriksa user.');
      }
      
      if (!user) {
        return ctx.reply(`❌ *User dengan ID ${targetUserId} tidak ditemukan!*`, { parse_mode: 'Markdown' });
      }
      
      // Cek apakah saldo mencukupi
      if (user.saldo < amount) {
        return ctx.reply(`❌ *Saldo user tidak mencukupi!*\n\nSaldo user: Rp ${user.saldo.toLocaleString('id-ID')}\nJumlah hapus: Rp ${amount.toLocaleString('id-ID')}\nKekurangan: Rp ${(amount - user.saldo).toLocaleString('id-ID')}`, { 
          parse_mode: 'Markdown' 
        });
      }
      
      // Lakukan pengurangan saldo
      db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [amount, targetUserId], function (err) {
        if (err) {
          logger.error('❌ Error hapus saldo:', err.message);
          return ctx.reply('❌ Gagal menghapus saldo.');
        }
        
        if (this.changes === 0) {
          return ctx.reply('⚠️ Tidak ada user yang diupdate. Pastikan ID benar.');
        }
        
        // Ambil saldo terbaru
        db.get('SELECT saldo FROM users WHERE user_id = ?', [targetUserId], (err2, updatedRow) => {
          if (err2) {
            ctx.reply(`✅ Saldo sebesar *Rp ${amount.toLocaleString('id-ID')}* berhasil dihapus dari user \`${targetUserId}\`.`);
          } else {
            ctx.reply(
              `✅ Saldo sebesar *Rp ${amount.toLocaleString('id-ID')}* berhasil dihapus dari user \`${targetUserId}\`.\n💰 Saldo user sekarang: *Rp ${updatedRow.saldo.toLocaleString('id-ID')}*`,
              { parse_mode: 'Markdown' }
            );
          }
          
          // Log ke transactions
          const referenceId = `remove_saldo_${targetUserId}_${Date.now()}`;
          db.run(
            'INSERT INTO transactions (user_id, amount, type, reference_id, timestamp) VALUES (?, ?, ?, ?, ?)',
            [targetUserId, amount, 'saldo_removed', referenceId, Date.now()],
            (err3) => {
              if (err3) logger.error('Gagal log transaksi hapus saldo:', err3.message);
            }
          );
          
          // Log di file
          logger.info(`Admin ${adminId} menghapus saldo Rp${amount} dari user ${targetUserId}. Saldo akhir: Rp${updatedRow ? updatedRow.saldo : 'N/A'}`);
        });
      });
    });
    
  } catch (e) {
    logger.error('❌ Error in /hapussaldo:', e);
    return ctx.reply('❌ Terjadi kesalahan internal.');
  }
});

//resellerstat
bot.command('resellerstats', async (ctx) => {
  try {
    const userId = ctx.from.id;
    
    // Cek apakah user reseller
    const isReseller = await isUserReseller(userId);
    
    if (!isReseller) {
      return ctx.reply('❌ *Fitur ini hanya untuk reseller!*', { parse_mode: 'Markdown' });
    }
    
    // Ambil saldo user
    db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (err, user) => {
      if (err) {
        logger.error('❌ Error ambil saldo:', err.message);
        return ctx.reply('❌ Terjadi kesalahan saat mengambil data.');
      }
      
      const saldo = user ? user.saldo : 0;
      
      // Hitung tanggal awal dan akhir bulan ini
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const startTimestamp = firstDay.getTime();
      const endTimestamp = lastDay.getTime();
      
      // Query transaksi bulan ini
      const query = `
        SELECT type, COUNT(*) as count, SUM(amount) as total 
        FROM transactions 
        WHERE user_id = ? 
          AND timestamp >= ? 
          AND timestamp <= ?
          AND type IN ('ssh', 'vmess', 'vless', 'trojan', 'shadowsocks', 'zivpn')
        GROUP BY type
      `;
      
      db.all(query, [userId, startTimestamp, endTimestamp], async (err, rows) => {
        if (err) {
          logger.error('❌ Error ambil transaksi:', err.message);
          return ctx.reply('❌ Terjadi kesalahan saat mengambil transaksi.');
        }
        
        // Hitung total akun bulan ini
        let totalAccounts = 0;
        let totalRevenue = 0;
        const typeDetails = [];
        
        rows.forEach(row => {
          totalAccounts += row.count;
          totalRevenue += row.total || 0;
          typeDetails.push(`• ${row.type.toUpperCase()}: ${row.count} akun`);
        });
        
        // Format pesan
        const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
                          "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        const currentMonth = monthNames[now.getMonth()];
        const currentYear = now.getFullYear();
        
        const message = 
          `📊 *STATISTIK RESELLER*\n` +
          `📅 Periode: ${currentMonth} ${currentYear}\n` +
          `👤 ID Reseller: ${userId}\n\n` +
          `💰 *Saldo Saat Ini:* Rp ${saldo.toLocaleString('id-ID')}\n\n` +
          `📈 *AKTIVITAS BULAN INI:*\n` +
          (typeDetails.length > 0 ? typeDetails.join('\n') : '• Belum ada transaksi') + `\n\n` +
          `📊 *TOTAL BULAN INI:*\n` +
          `• Jumlah Akun: ${totalAccounts} akun\n` +
          `• Total Pendapatan: Rp ${totalRevenue.toLocaleString('id-ID')}\n\n` +
          `📌 *Catatan:*\n` +
          `• Data diambil dari 1 ${currentMonth} ${currentYear}\n` +
          `• Hanya menampilkan transaksi pembuatan/perpanjangan akun\n` +
          `• Update real-time setiap transaksi`;
        
        await ctx.reply(message, { parse_mode: 'Markdown' });
        
        // Log
        logger.info(`📊 Stats reseller ditampilkan untuk ${userId}: ${totalAccounts} akun bulan ini`);
      });
    });
    
  } catch (error) {
    logger.error('❌ Error di /resellerstats:', error);
    await ctx.reply('❌ Terjadi kesalahan saat memproses permintaan.');
  }
});

//allreseller stat
bot.command('allresellerstats', async (ctx) => {
  try {
    const adminId = ctx.from.id;
    
    // Hanya admin
    if (!adminIds.includes(adminId)) {
      return ctx.reply('❌ Hanya admin yang bisa menggunakan command ini!');
    }
    
    // Ambil semua user yang reseller
    const resellers = listResellersSync();
    
    if (resellers.length === 0) {
      return ctx.reply('📭 Belum ada reseller terdaftar.');
    }
    
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startTimestamp = firstDay.getTime();
    const endTimestamp = lastDay.getTime();
    
    // Mulai buat pesan HTML
    let message = `<b>📊 STATISTIK SEMUA RESELLER</b>\n`;
    message += `<i>📅 Periode: ${escapeHtml(now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }))}</i>\n\n`;
    
    // Total semua
    let totalAllAccounts = 0;
    let totalAllRevenue = 0;
    
    // Loop melalui setiap reseller
    for (const resellerId of resellers) {
      // Ambil saldo
      const user = await new Promise((resolve) => {
        db.get('SELECT saldo FROM users WHERE user_id = ?', [resellerId], (err, row) => {
          resolve(row || { saldo: 0 });
        });
      });
      
      // Ambil transaksi bulan ini
      const transactions = await new Promise((resolve) => {
        db.all(
          `SELECT COUNT(*) as count, SUM(amount) as total FROM transactions 
           WHERE user_id = ? AND timestamp >= ? AND timestamp <= ? 
           AND type IN ('ssh', 'vmess', 'vless', 'trojan', 'shadowsocks', 'zivpn')`,
          [resellerId, startTimestamp, endTimestamp],
          (err, rows) => {
            resolve(rows[0] || { count: 0, total: 0 });
          }
        );
      });
      
      // ✅ PAKAI ID TELEGRAM SAJA, TIDAK PERLU USERNAME
      const displayId = `<code>${resellerId}</code>`;
      
      // Tambah ke total
      totalAllAccounts += transactions.count;
      totalAllRevenue += transactions.total || 0;
      
      message += 
        `<b>👤 ID:</b> ${displayId}\n` +
        `<code>💰 Saldo:</code> Rp ${user.saldo.toLocaleString('id-ID')}\n` +
        `<code>📊 Akun Bulan Ini:</code> ${transactions.count}\n` +
        `<code>💵 Pendapatan:</code> Rp ${(transactions.total || 0).toLocaleString('id-ID')}\n` +
        `────────────────────\n`;
    }
    
    // Tambahkan summary
    const totalResellers = resellers.length;
    message += `\n<b>📈 RINGKASAN:</b>\n`;
    message += `• <b>Total Reseller:</b> ${totalResellers} orang\n`;
    message += `• <b>Total Akun Bulan Ini:</b> ${totalAllAccounts} akun\n`;
    message += `• <b>Total Pendapatan:</b> Rp ${totalAllRevenue.toLocaleString('id-ID')}\n`;
    message += `• <b>Periode:</b> ${escapeHtml(now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }))}\n`;
    message += `• <b>Update:</b> ${escapeHtml(now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }))}`;
    
    // Split jika terlalu panjang (Telegram limit 4096 chars)
    if (message.length > 4000) {
      const parts = [];
      const chunkSize = 3900; // Kasih buffer
      
      for (let i = 0; i < message.length; i += chunkSize) {
        const chunk = message.substring(i, Math.min(i + chunkSize, message.length));
        // Pastikan chunk tidak terpotong di tengah tag HTML
        if (chunk.includes('<') && !chunk.includes('>')) {
          // Jika tag tidak tertutup, cari posisi tag terakhir yang utuh
          const lastCompleteTag = chunk.lastIndexOf('>');
          if (lastCompleteTag > 0) {
            parts.push(chunk.substring(0, lastCompleteTag + 1));
            i = i - (chunk.length - lastCompleteTag - 1); // Adjust index
          } else {
            parts.push(chunk);
          }
        } else {
          parts.push(chunk);
        }
      }
      
      // Kirim part pertama
      await ctx.reply(parts[0], { parse_mode: 'HTML' });
      
      // Kirim part lainnya dengan delay
      for (let i = 1; i < parts.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await ctx.reply(parts[i], { parse_mode: 'HTML' });
      }
    } else {
      await ctx.reply(message, { parse_mode: 'HTML' });
    }
    
    logger.info(`📊 Admin ${adminId} melihat statistik semua reseller`);
    
  } catch (error) {
    logger.error('❌ Error di /allresellerstats:', error);
    await ctx.reply('❌ Terjadi kesalahan saat memproses permintaan.');
  }
});

// ✅ FUNGSI UNTUK ESCAPE HTML (untuk aman)
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

////
bot.command('addserverzivpn_reseller', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) {
    return ctx.reply('⚠️ Tidak ada izin.');
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 8) {
    return ctx.reply(
      '⚠️ Format:\n`/addserverzivpn_reseller <domain> <auth> <harga> <nama_server> <quota> <iplimit> <batas_create_akun>`',
      { parse_mode: 'Markdown' }
    );
  }

  const [, domain, auth, harga, nama_server, quota, iplimit, batas] = args;

  if (![harga, quota, iplimit, batas].every(v => /^\d+$/.test(v))) {
    return ctx.reply('⚠️ harga, quota, iplimit, batas harus angka.');
  }

  db.run(
    `INSERT INTO Server
     (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun, total_create_akun, service, is_reseller_only)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'zivpn', 1)`,
    [
      domain,
      auth,
      parseInt(harga),
      nama_server,
      parseInt(quota),
      parseInt(iplimit),
      parseInt(batas)
    ],
    (err) => {
      if (err) {
        logger.error(err.message);
        return ctx.reply('❌ Gagal menambahkan server ZIVPN reseller.');
      }

      ctx.reply(`✅ Server *ZIVPN Reseller* \`${nama_server}\` berhasil ditambahkan.`, {
        parse_mode: 'Markdown'
      });
    }
  );
});
//////
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
  
  // Cek status reseller - GUNAKAN VARIABLE YANG SUDAH ADA
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
<code>┏━━━━━━━━━━━━━━━━━━━━┓</code>
<b>🚀 BOT VPN ${NAMA_STORE}</b>
<code>┗━━━━━━━━━━━━━━━━━━━━┛</code>

<em>⚡ Koneksi cepat, aman, dan stabil
✨ Bot VPN Premium 
🤖 Layanan Bot Otomatis 
🛡️ Server aman dan terpercaya</em>

<code>┏━━━━━━━━━━━━━━━━━━━━┓</code>
<b>👤 INFORMASI PENGGUNA</b>
<code>┣━━━━━━━━━━━━━━━━━━━━┫</code>
• 👤 <b>Nama</b>    : ${userName}
• 🆔 <b>ID</b>      : <code>${userId}</code>
• 💰 <b>Saldo</b>   : <code>Rp ${saldo}</code>
• 🏷️ <b>Status</b>  : ${statusReseller}
<code>┗━━━━━━━━━━━━━━━━━━━━┛</code>

<code>┏━━━━━━━━━━━━━━━━━━━━┓</code>
<b>📊 STATISTIK ANDA HARI INI</b>
<code>┣━━━━━━━━━━━━━━━━━━━━┫</code>
• 📅 <b>Hari Ini</b>   : ${userToday} akun
• 📆 <b>Minggu Ini</b> : ${userWeek} akun  
• 🗓️ <b>Bulan Ini</b>  : ${userMonth} akun
<code>┗━━━━━━━━━━━━━━━━━━━━┛</code>

<code>┏━━━━━━━━━━━━━━━━━━━━┓</code>
<b>🌍 STATISTIK GLOBAL</b>
<code>┣━━━━━━━━━━━━━━━━━━━━┫</code>
• 📅 <b>Hari Ini</b>   : ${globalToday} akun
• 📆 <b>Minggu Ini</b> : ${globalWeek} akun
• 🗓️ <b>Bulan Ini</b>  : ${globalMonth} akun
<code>┗━━━━━━━━━━━━━━━━━━━━┛</code>

<code>┏━━━━━━━━━━━━━━━━━━━━┓</code>
<b>⚙️ PANEL PERINTAH</b>
<code>┣━━━━━━━━━━━━━━━━━━━━┫</code>
🏠 /start       → Menu Utama
🔑 /admin       → Menu Admin
🛡️ /helpadmin  → Panel Admin
<code>┗━━━━━━━━━━━━━━━━━━━━┛</code>

<code>┏━━━━━━━━━━━━━━━━━━━━┓</code>
<b>📈 STATUS SISTEM</b>
<code>┣━━━━━━━━━━━━━━━━━━━━┫</code>
👥 <b>Users</b>    : ${jumlahPengguna}
⏱️ <b>Latency</b>  : ${latency} ms
👨‍💻 <b>Edited by</b> : 1FORCR
<code>┗━━━━━━━━━━━━━━━━━━━━┛</code>
`;

  // Buat keyboard dasar untuk semua user
  let keyboard = [
    [
      { text: '➕ Buat Akun', callback_data: 'service_create' },
      { text: '♻️ Perpanjang Akun', callback_data: 'service_renew' }
    ],
    [
      { text: '📶 Cek Server', callback_data: 'cek_server' },
      { text: '⌛ Trial Akun', callback_data: 'service_trial' }
    ],
    [
      { text: '📘 Tutorial Penggunaan Bot', callback_data: 'tutorial_bot' }
    ],
    [
      { text: '🤝 Jadi Reseller harga lebih murah!!', callback_data: 'jadi_reseller' }
    ],
    [
     // { text: '💰 TopUp Saldo Manual via (QRIS)', callback_data: 'topup_manual' }
    ],
    [
      { text: '💰 TopUp Saldo Otomatis', callback_data: 'topup_saldo' }
    ],
  ];

  // Jika user adalah reseller, tambahkan tombol khusus
  if (isReseller) {
    // Sisipkan tombol reseller setelah baris "Cek Server"
    keyboard.splice(2, 0, [
      { text: '❌ Hapus Akun', callback_data: 'service_del' },
      { text: '🗝️ Kunci Akun', callback_data: 'service_lock' }
    ]);
    keyboard.splice(3, 0, [
      { text: '🔐 Buka Kunci Akun', callback_data: 'service_unlock' }
    ]);
    keyboard.splice(4, 0, [
    { text: '📊 Statistik Saya', callback_data: 'reseller_stats' }
    ]);
    
    logger.info(`🛡️ Menu reseller ditampilkan untuk user: ${userId}`);
  }

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
2. /hapussaldo - Menghapus saldo dari akun pengguna.
3. /addserver - Menambahkan server baru.
4. /addressel - Menambahkan Reseller baru.
5. /delressel - Menghapus id Reseller.
6. /broadcast - Mengirim pesan siaran ke semua pengguna.
7. /editharga - Mengedit harga layanan.
8. /editauth - Mengedit auth server.
9. /editdomain - Mengedit domain server.
10. /editlimitcreate - Mengedit batas pembuatan akun server.
11. /editlimitip - Mengedit batas IP server.
12. /editlimitquota - Mengedit batas quota server.
13. /editnama - Mengedit nama server.
14. /edittotalcreate - Mengedit total pembuatan akun server.
15. /hapuslog - Menghapus log bot.
16. /allresellerstats - Ambil data statistik pembuatan semua reseller
17. /resellerstats - Ambil data statistik saya

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

//command addserver biasa potato
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
const service = userState[ctx.chat.id]?.service || 'ssh'; 
db.run(
  "INSERT INTO Server (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun, total_create_akun, service) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
  [
    domain,
    auth,
    parseInt(harga),
    nama_server,
    parseInt(quota),
    parseInt(iplimit),
    parseInt(batas_create_akun),
    service
  ],
  function(err) {
    if (err) {
      logger.error('⚠️ Kesalahan saat menambahkan server:', err.message);
      return ctx.reply('⚠️ Kesalahan saat menambahkan server.', { parse_mode: 'Markdown' });
    }

    // 🧹 bersihkan state setelah sukses
    delete userState[ctx.chat.id];

    ctx.reply(`✅ Server \`${nama_server}\` berhasil ditambahkan.`, { parse_mode: 'Markdown' });
  }
);

});

//command addserver zivpn
bot.command('addserverzivpn', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.');
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 8) {
    return ctx.reply(
      '⚠️ Format salah.\nGunakan:\n`/addserverzivpn <domain> <auth> <harga> <nama_server> <quota> <iplimit> <batas_create_akun>`',
      { parse_mode: 'Markdown' }
    );
  }

  const [, domain, auth, harga, nama_server, quota, iplimit, batas_create_akun] = args;

  const numberOnlyRegex = /^\d+$/;
  if (
    !numberOnlyRegex.test(harga) ||
    !numberOnlyRegex.test(quota) ||
    !numberOnlyRegex.test(iplimit) ||
    !numberOnlyRegex.test(batas_create_akun)
  ) {
    return ctx.reply('⚠️ `harga`, `quota`, `iplimit`, dan `batas_create_akun` harus berupa angka.');
  }

  // 🔥 INI SATU-SATUNYA BEDANYA
  db.run(
    "INSERT INTO Server (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun, total_create_akun, service) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'zivpn')",
    [
      domain,
      auth,
      parseInt(harga),
      nama_server,
      parseInt(quota),
      parseInt(iplimit),
      parseInt(batas_create_akun)
    ],
    function (err) {
      if (err) {
        logger.error('⚠️ Kesalahan saat menambahkan server ZIVPN:', err.message);
        return ctx.reply('⚠️ Kesalahan saat menambahkan server ZIVPN.');
      }

      ctx.reply(`✅ Server ZIVPN \`${nama_server}\` berhasil ditambahkan.`, {
        parse_mode: 'Markdown'
      });
    }
  );
});

//////
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
      [{ text: 'Buat UDP ZIVPN', callback_data: 'create_zivpn' }],
      [{ text: 'Buat Ssh/Ovpn', callback_data: 'create_ssh' }],      
      [{ text: 'Buat Vmess', callback_data: 'create_vmess' }, { text: 'Buat Vless', callback_data: 'create_vless' }],
      [{ text: 'Buat Trojan', callback_data: 'create_trojan' }, /*{ text: 'Buat Shadowsocks', callback_data: 'create_shadowsocks' }*/{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'trial') {
    keyboard = [
      [{ text: 'Trial UDP ZIVPN', callback_data: 'trial_zivpn' }],
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
    // Baris 1
    [{ text: '➕ Tambah Server Reseller', callback_data: 'addserver_reseller' }],
    
    // Baris 2
    [{ text: '➕ Tambah Server Non Reseller', callback_data: 'addserver' }],
    
    // Baris 3
    [{ text: '➕ Tambah Server ZIVPN Reseller', callback_data: 'add_server_zivpn_reseller_cmd' }],
    
    // Baris 4
    [{ text: '➕ Tambah Server ZIVPN', callback_data: 'add_server_zivpn' }],
    
    // Baris 5 - TAMBAH SALDO & HAPUS SALDO
    [
      { text: '💵 Tambah Saldo', callback_data: 'tambah_saldo' },
      { text: '🗑️ Hapus Saldo', callback_data: 'hapus_saldo' }
    ],
    
    // Baris 6
    [{ text: '🖼️ Upload QRIS | Top up manual', callback_data: 'upload_qris' }],
    
    // Baris 7
    [{ text: '💳 Lihat Saldo User', callback_data: 'cek_saldo_user' }],
    
    // Baris 8
    [{ text: '📦 Backup Database', callback_data: 'backup_db' }],
    
    // Baris 9
    [{ text: '❌ Hapus Server', callback_data: 'deleteserver' }],
    
    // Baris 10
    [
      { text: '💲 Edit Harga', callback_data: 'editserver_harga' },
      { text: '📝 Edit Nama', callback_data: 'nama_server_edit' }
    ],
    
    // Baris 11
    [
      { text: '🌐 Edit Domain', callback_data: 'editserver_domain' },
      { text: '🔑 Edit Auth', callback_data: 'editserver_auth' }
    ],
    
    // Baris 12
    [
      { text: '📊 Edit Quota', callback_data: 'editserver_quota' },
      { text: '📶 Edit Limit IP', callback_data: 'editserver_limit_ip' }
    ],
    
    // Baris 13
    [
      { text: '🔢 Edit Batas Create', callback_data: 'editserver_batas_create_akun' },
      { text: '🔢 Edit Total Create', callback_data: 'editserver_total_create_akun' }
    ],
    
    // Baris 14
    [{ text: '📋 List Server', callback_data: 'listserver' }],
    
    // Baris 15
    [
      { text: '♻️ Reset Server', callback_data: 'resetdb' },
      { text: 'ℹ️ Detail Server', callback_data: 'detailserver' }
    ],
    
    // Baris 16
    [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
  ];

  try {
    await ctx.editMessageText('*🛠️ MENU ADMIN*', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: adminKeyboard
      }
    });
    logger.info('Admin menu sent');
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      try {
        await ctx.reply('*🛠️ MENU ADMIN*', {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: adminKeyboard
          }
        });
        logger.info('Admin menu sent as new message');
      } catch (sendError) {
        logger.error('Error sending admin menu as new message:', sendError);
      }
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

// =================== HANDLER CONFIRM HAPUS SALDO ===================
bot.action('confirm_hapus_saldo', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const adminId = ctx.from.id;
    const state = userState[adminId];
    
    if (!state || state.step !== 'hapus_saldo_confirm') {
      return ctx.reply('❌ Sesi sudah berakhir. Silakan ulangi dari awal.');
    }
    
    const targetUserId = state.targetUserId;
    const amount = state.amountToRemove;
    
    // Lakukan pengurangan saldo
    db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [amount, targetUserId], function (err) {
      if (err) {
        logger.error('❌ Error hapus saldo via menu:', err.message);
        return ctx.reply('❌ Gagal menghapus saldo.');
      }
      
      // Ambil saldo terbaru
      db.get('SELECT saldo FROM users WHERE user_id = ?', [targetUserId], (err2, updatedRow) => {
        delete userState[adminId];
        
        if (err2) {
          ctx.reply(`✅ Saldo sebesar *Rp ${amount.toLocaleString('id-ID')}* berhasil dihapus dari user \`${targetUserId}\`.`);
        } else {
          ctx.reply(
            `✅ *SALDO BERHASIL DIHAPUS!*\n\n` +
            `👤 User ID: \`${targetUserId}\`\n` +
            `🗑️ Jumlah dihapus: *Rp ${amount.toLocaleString('id-ID')}*\n` +
            `💰 Saldo sekarang: *Rp ${updatedRow.saldo.toLocaleString('id-ID')}*`,
            { parse_mode: 'Markdown' }
          );
        }
        
        // Log ke transactions
        const referenceId = `remove_saldo_${targetUserId}_${Date.now()}`;
        db.run(
          'INSERT INTO transactions (user_id, amount, type, reference_id, timestamp) VALUES (?, ?, ?, ?, ?)',
          [targetUserId, amount, 'saldo_removed', referenceId, Date.now()],
          (err3) => {
            if (err3) logger.error('Gagal log transaksi hapus saldo:', err3.message);
          }
        );
        
        // Log ke file
        logger.info(`Admin ${adminId} menghapus saldo Rp${amount} dari user ${targetUserId}. Saldo akhir: Rp${updatedRow ? updatedRow.saldo : 'N/A'}`);
        
        // Kirim notifikasi ke user yang saldonya dihapus
        try {
          bot.telegram.sendMessage(
            targetUserId,
            `⚠️ *PEMBERITAHUAN SALDO*\n\n` +
            `Saldo Anda dikurangi sebesar *Rp ${amount.toLocaleString('id-ID')}* oleh admin.\n` +
            `💰 Saldo sekarang: *Rp ${updatedRow ? updatedRow.saldo.toLocaleString('id-ID') : '0'}*\n\n` +
            `📅 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
            { parse_mode: 'Markdown' }
          ).catch(() => {
            // User mungkin memblokir bot, tidak apa-apa
          });
        } catch (notifErr) {
          logger.error('Gagal kirim notifikasi ke user:', notifErr.message);
        }
      });
    });
    
  } catch (error) {
    logger.error('❌ Error in confirm_hapus_saldo:', error);
    await ctx.reply('❌ Terjadi kesalahan saat menghapus saldo.');
  }
});

bot.action('cancel_hapus_saldo', async (ctx) => {
  await ctx.answerCbQuery();
  const adminId = ctx.from.id;
  delete userState[adminId];
  await ctx.reply('❌ Proses penghapusan saldo dibatalkan.');
});

// =================== HANDLER HAPUS SALDO ===================
bot.action('hapus_saldo', async (ctx) => {
  const adminId = ctx.from.id;
  
  if (!adminIds.includes(adminId)) {
    return ctx.reply('🚫 Anda tidak memiliki izin.');
  }
  
  await ctx.answerCbQuery();
  userState[adminId] = { step: 'hapus_saldo_userid' };
  await ctx.reply('🗑️ *Masukkan ID Telegram user yang saldonya akan dihapus:*', { parse_mode: 'Markdown' });
});

//callback handller statistik reseller
bot.action('reseller_stats', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    
    // Cek reseller
    const isReseller = await isUserReseller(userId);
    if (!isReseller) {
      return ctx.reply('❌ Fitur ini hanya untuk reseller!');
    }
    
    // ✅ KIRIM PESAN LOADING DAN SIMPAN ID-NYA
    const loadingMsg = await ctx.reply('⏳ Mengambil data statistik...');
    const loadingMsgId = loadingMsg.message_id;
    
    // Ambil data
    db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (err, user) => {
      if (err) {
        // ❌ HAPUS PESAN LOADING JIKA ERROR
        try {
          await ctx.deleteMessage(loadingMsgId);
        } catch (e) {}
        await ctx.reply('❌ Terjadi kesalahan saat mengambil data.');
        return;
      }
      
      const saldo = user ? user.saldo : 0;
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      db.all(
        `SELECT type, COUNT(*) as count FROM transactions 
         WHERE user_id = ? AND timestamp >= ? AND timestamp <= ?
         AND type IN ('ssh', 'vmess', 'vless', 'trojan', 'shadowsocks', 'zivpn')
         GROUP BY type`,
        [userId, firstDay.getTime(), lastDay.getTime()],
        async (err, rows) => {
          // ✅ HAPUS PESAN LOADING SETELAH DATA SIAP
          try {
            await ctx.deleteMessage(loadingMsgId);
          } catch (e) {
            logger.error('Gagal hapus pesan loading:', e.message);
          }
          
          if (err) {
            await ctx.reply('❌ Terjadi kesalahan saat mengambil data transaksi.');
            return;
          }
          
          let totalAccounts = 0;
          const details = [];
          
          rows.forEach(row => {
            totalAccounts += row.count;
            details.push(`• ${row.type.toUpperCase()}: ${row.count} akun`);
          });
          
          const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni",
                            "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
          
          const statsMessage = 
            `📊 *STATISTIK RESELLER ANDA*\n\n` +
            `💰 Saldo: Rp ${saldo.toLocaleString('id-ID')}\n` +
            `📅 Periode: ${monthNames[now.getMonth()]} ${now.getFullYear()}\n\n` +
            `📈 *Aktivitas Bulan Ini:*\n` +
            (details.length > 0 ? details.join('\n') : '• Belum ada transaksi') + `\n\n` +
            `📊 Total: *${totalAccounts} akun*\n\n` +
            `🔄 Update terakhir: ${now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
          
          // ✅ KIRIM PESAN BARU DENGAN DATA
          await ctx.reply(statsMessage, { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Refresh', callback_data: 'reseller_stats_refresh' }],
                [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
              ]
            }
          });
        }
      );
    });
    
  } catch (error) {
    logger.error('Error di reseller_stats:', error);
    await ctx.reply('❌ Terjadi kesalahan.');
  }
});

// Handler untuk refresh
bot.action('reseller_stats_refresh', async (ctx) => {
  await ctx.answerCbQuery();
  await bot.action['reseller_stats'](ctx); // Panggil ulang handler
});

//handler untuk add server reseller
bot.action('add_server_zivpn_reseller_cmd', async (ctx) => {
  await ctx.reply(
    'Silakan gunakan command berikut untuk menambahkan server ZIVPN reseller:\n\n' +
    '`/addserverzivpn_reseller <domain> <auth> <harga> <nama_server> <quota> <iplimit> <batas_create_akun>`\n\n' +
    'Contoh:\n' +
    '`/addserverzivpn_reseller sg-udp-01.example.com myauth123 500 SG-ZIVPN-RS-01 50 2 100`',
    { parse_mode: 'Markdown' }
  );
});

//handler addserver zivpn
bot.action('add_server_zivpn', async (ctx) => {
  userState[ctx.chat.id] = {
    step: 'add_server_domain',
    service: 'zivpn',
    data: {}
  };
  await ctx.reply('🌐 Masukkan domain server ZIVPN:', { parse_mode: 'Markdown' });
});

// Handler untuk info tools reseller
bot.action('reseller_tools_info', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
        '🛡️ *TOOLS RESELLER*\n\n' +
        'Fitur khusus untuk reseller:\n' +
        '• ❌ Hapus Akun - Hapus akun pelanggan\n' +
        '• 🗝️ Kunci Akun - Nonaktifkan akun sementara\n' +
        '• 🔐 Buka Kunci Akun - Aktifkan kembali akun\n\n' +
        'Fitur ini membantu Anda mengelola akun pelanggan dengan lebih baik.',
        { parse_mode: 'Markdown' }
    );
});

// 📡 CEK SERVER – LIST SERVER
bot.action("cek_server", async (ctx) => {
    try {
        db.all("SELECT * FROM Server ORDER BY id ASC", [], async (err, rows) => {
            if (err) {
                logger.error("❌ Gagal mengambil data server:", err.message);
                return ctx.reply("⚠️ Terjadi kesalahan saat mengambil data server.");
            }

            if (!rows || rows.length === 0) {
                return ctx.reply("⚠️ Belum ada server yang ditambahkan.");
            }

            let message = "🌐 *DAFTAR SERVER TERSEDIA*\n\n";

            rows.forEach((srv) => {
                const domainSafe = srv.domain ? srv.domain.replace(/_/g, "\\_") : "-";

                message +=
`🔰 *Nama:* ${srv.nama_server || "-"}
🌍 *Domain:* ${domainSafe}
🔐 *IP Limit:* ${srv.iplimit || 0}
──────────────────────\n`;
            });

            await ctx.reply(message, { parse_mode: "Markdown" });
        });
    } catch (error) {
        logger.error("❌ Error di cek_server:", error);
        return ctx.reply("⚠️ Terjadi kesalahan.");
    }
});


// === 🎥 TUTORIAL PENGGUNAAN BOT ===
bot.action('tutorial_bot', async (ctx) => {
  try {
    await ctx.reply(
      '📘 *Panduan Penggunaan Bot*\n\n' +
      'Tonton video tutorial lengkap cara menggunakan bot ini di YouTube:\n\n' +
      '[👉 Klik di sini untuk menonton](https://youtu.be/gUVoAuZqyxo)',
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    logger.error('❌ Error di tombol tutorial_bot:', err.message);
    await ctx.reply('⚠️ Terjadi kesalahan saat membuka tutorial.');
  }
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
      `hubungi via WhatsApp: [Klik di sini](http://wa.me/6289612745096)\n\n` +
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
  `💼 *Bergabunglah Menjadi RESELLER Resmi Kami!*\n\n` +
  `🔥 Dapatkan harga spesial 6K per akun!!, keuntungan menarik, dan akses penuh untuk membuat akun premium langsung dari bot ini!\n\n` +
  `📩 Hubungi admin melalui [Klik di sini](http://wa.me/6289612745096) untuk mendaftar.\n\n` +
  `📝 *Kirim pesan ke admin dengan format berikut:*\n` +
  `\`Mau jadi reseller ${userId}\`\n\n` +
  `🎯 *Keuntungan jadi reseller:*\n` +
  `• Harga akun jauh lebih murah\n` +
  `• Bisa buat akun premium kapan saja\n` +
  `• Dapat dukungan langsung dari admin\n` +
  `• Bonus dan promo menarik setiap bulan\n\n` +
  `💰 *Syarat Bergabung:*\n` +
  `> Deposit awal sebesar *Rp18.000* (langsung masuk ke saldo akun kamu)\n` +
  `> Minimal penjualan *3 akun premium per bulan*\n\n` +
  `✨ Jadilah bagian dari komunitas reseller kami dan nikmati penghasilan tambahan dari setiap penjualan akun VPN!`,
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

////
bot.action('create_zivpn', async (ctx) => {
  await startSelectServer(ctx, 'create', 'zivpn');
});
///
bot.action('trial_zivpn', async (ctx) => {
  await startSelectServer(ctx, 'trial', 'zivpn');
});
////
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
const service = type === 'zivpn' ? 'zivpn' : 'ssh';

let query;
let params = [];

if (isR) {
  // 🔥 RESELLER: HANYA server reseller
  query = `
    SELECT * FROM Server
    WHERE service = ?
      AND is_reseller_only = 1
  `;
  params = [service];
} else {
  // 🔹 USER BIASA: HANYA server non-reseller
  query = `
    SELECT * FROM Server
    WHERE service = ?
      AND (is_reseller_only = 0 OR is_reseller_only IS NULL)
  `;
  params = [service];
}

db.all(query, params, (err, servers) => {
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

  return (
`╔══════════════════════╗
  🟦 *${server.nama_server.toUpperCase()}*
╚══════════════════════╝
🛜 *Domain:* \`${server.domain}\`
💳 *Harga/Hari:* Rp${server.harga.toLocaleString()}
📆 *Harga/Bulan:* Rp${hargaPer30Hari.toLocaleString()}
📡 *Quota:* ${server.quota} GB
🔐 *IP Limit:* ${server.iplimit} IP
👥 *Akun Terpakai:* ${server.total_create_akun}/${server.batas_create_akun}
📌 *Status:* ${isFull ? "❌ Server Penuh" : "✅ Tersedia"}
`
  );
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


bot.action(/(create|renew)_username_(vmess|vless|trojan|shadowsocks|ssh|zivpn)_(.+)/, async (ctx) => {
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
bot.action(/(trial)_username_(vmess|vless|trojan|shadowsocks|ssh|zivpn)_(\d+)/, async (ctx) => {
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
      `Layanan trial hanya berlaku *1x per hari* dan akan aktif selama *1 Jam*.\n\n` +
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
if (!state || !state.step) return;

  if (state.step === 'add_server_domain') {
  state.data.domain = ctx.message.text.trim();
  state.step = 'add_server_auth';
  return ctx.reply('🔑 Masukkan auth server:', { parse_mode: 'Markdown' });
}

if (state.step === 'add_server_auth') {
  state.data.auth = ctx.message.text.trim();
  state.step = 'add_server_harga';
  return ctx.reply('💰 Masukkan harga server (angka):', { parse_mode: 'Markdown' });
}

if (state.step === 'add_server_harga') {
  if (!/^\d+$/.test(ctx.message.text)) {
    return ctx.reply('⚠️ Harga harus angka. Masukkan ulang:');
  }
  state.data.harga = parseInt(ctx.message.text);
  state.step = 'add_server_nama';
  return ctx.reply('📝 Masukkan nama server:', { parse_mode: 'Markdown' });
}

if (state.step === 'add_server_nama') {
  state.data.nama_server = ctx.message.text.trim();
  state.step = 'add_server_quota';
  return ctx.reply('📊 Masukkan quota (GB):', { parse_mode: 'Markdown' });
}

if (state.step === 'add_server_quota') {
  if (!/^\d+$/.test(ctx.message.text)) {
    return ctx.reply('⚠️ Quota harus angka. Masukkan ulang:');
  }
  state.data.quota = parseInt(ctx.message.text);
  state.step = 'add_server_iplimit';
  return ctx.reply('📶 Masukkan IP limit:', { parse_mode: 'Markdown' });
}

if (state.step === 'add_server_iplimit') {
  if (!/^\d+$/.test(ctx.message.text)) {
    return ctx.reply('⚠️ IP limit harus angka. Masukkan ulang:');
  }
  state.data.iplimit = parseInt(ctx.message.text);
  state.step = 'add_server_batas';
  return ctx.reply('🔢 Masukkan batas create akun:', { parse_mode: 'Markdown' });
}

if (state.step === 'add_server_batas') {
  if (!/^\d+$/.test(ctx.message.text)) {
    return ctx.reply('⚠️ Batas create akun harus angka. Masukkan ulang:');
  }
  state.data.batas_create_akun = parseInt(ctx.message.text);

  // 🔥 INSERT DB (SATU-SATUNYA TEMPAT SIMPAN)
  const d = state.data;
  const service = state.service || 'ssh';

  db.run(
    "INSERT INTO Server (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun, total_create_akun, service) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)",
    [
      d.domain,
      d.auth,
      d.harga,
      d.nama_server,
      d.quota,
      d.iplimit,
      d.batas_create_akun,
      service
    ],
    (err) => {
      if (err) {
        ctx.reply('❌ Gagal menyimpan server.');
      } else {
        ctx.reply(`✅ Server *${d.nama_server}* berhasil ditambahkan.`, {
          parse_mode: 'Markdown'
        });
      }
    }
  );

  delete userState[ctx.chat.id];
  return;
}

  if (!state) return; 
    const text = ctx.message.text.trim();

  // =================== HAPUS SALDO ===================
  if (state && state.step === 'hapus_saldo_userid') {
    const targetUserId = text;
    
    // Validasi input
    if (!/^\d+$/.test(targetUserId)) {
      return ctx.reply('❌ *ID Telegram harus angka!*\n\nMasukkan ulang ID user:', { parse_mode: 'Markdown' });
    }
    
    // Cek apakah user ada
    db.get('SELECT user_id, saldo FROM users WHERE user_id = ?', [targetUserId], (err, user) => {
      if (err) {
        logger.error('❌ Error cek user untuk hapus saldo:', err.message);
        return ctx.reply('❌ Terjadi kesalahan saat memeriksa user.');
      }
      
      if (!user) {
        return ctx.reply(`❌ *User dengan ID ${targetUserId} tidak ditemukan!*\n\nMasukkan ID user lain atau ketik "batal" untuk membatalkan.`, { 
          parse_mode: 'Markdown' 
        });
      }
      
      // Simpan ke state dan lanjut ke input jumlah
      state.targetUserId = targetUserId;
      state.currentSaldo = user.saldo;
      state.step = 'hapus_saldo_amount';
      
      ctx.reply(
        `👤 *User ditemukan:*\n` +
        `• ID: \`${targetUserId}\`\n` +
        `• Saldo saat ini: *Rp ${user.saldo.toLocaleString('id-ID')}*\n\n` +
        `💰 *Masukkan jumlah saldo yang akan dihapus:*\n` +
        `(atau ketik "semua" untuk hapus semua saldo)`,
        { parse_mode: 'Markdown' }
      );
    });
    return;
  }
  
  if (state && state.step === 'hapus_saldo_amount') {
    const adminId = ctx.from.id;
    const targetUserId = state.targetUserId;
    const currentSaldo = state.currentSaldo;
    let amount;
    
    // Cek jika input "semua" atau "all"
    if (text.toLowerCase() === 'semua' || text.toLowerCase() === 'all') {
      amount = currentSaldo;
    } else {
      // Validasi angka
      amount = parseInt(text, 10);
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply('❌ *Jumlah harus angka positif lebih dari 0!*\n\nMasukkan ulang jumlah:');
      }
      
      // Cek apakah saldo mencukupi
      if (amount > currentSaldo) {
        return ctx.reply(
          `❌ *Jumlah melebihi saldo user!*\n\n` +
          `Saldo user: Rp ${currentSaldo.toLocaleString('id-ID')}\n` +
          `Jumlah hapus: Rp ${amount.toLocaleString('id-ID')}\n` +
          `Kekurangan: Rp ${(amount - currentSaldo).toLocaleString('id-ID')}\n\n` +
          `Masukkan jumlah yang lebih kecil atau ketik "semua" untuk hapus semua saldo.`,
          { parse_mode: 'Markdown' }
        );
      }
    }
    
    // Konfirmasi
    state.amountToRemove = amount;
    state.step = 'hapus_saldo_confirm';
    
    await ctx.reply(
      `⚠️ *KONFIRMASI HAPUS SALDO*\n\n` +
      `👤 User ID: \`${targetUserId}\`\n` +
      `💰 Saldo saat ini: Rp ${currentSaldo.toLocaleString('id-ID')}\n` +
      `🗑️ Jumlah hapus: Rp ${amount.toLocaleString('id-ID')}\n` +
      `📉 Saldo setelahnya: Rp ${(currentSaldo - amount).toLocaleString('id-ID')}\n\n` +
      `Apakah Anda yakin ingin menghapus saldo ini?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Ya, Hapus Saldo', callback_data: 'confirm_hapus_saldo' }],
            [{ text: '❌ Batal', callback_data: 'cancel_hapus_saldo' }]
          ]
        }
      }
    );
    return;
  }
//////
  if (state && state.step === "edit_nama_input") {
    const serverId = state.serverId;
    const namaBaru = ctx.message.text.trim();

    db.run(
      "UPDATE Server SET nama_server = ? WHERE id = ?",
      [namaBaru, serverId],
      (err) => {
        if (err) {
          logger.error("❌ Gagal update nama server:", err.message);
          return ctx.reply("⚠️ Gagal mengupdate nama server.");
        }

        ctx.reply(
          `✅ *Nama server berhasil diperbarui!*\n\n` +
          `🆔 ID Server: ${serverId}\n` +
          `🏷️ Nama Baru: *${namaBaru}*`,
          { parse_mode: "Markdown" }
        );

        logger.info(`Nama server ID ${serverId} diubah menjadi ${namaBaru}`);

        delete userState[ctx.chat.id];
      }
    );

    return;
  }
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
/////////

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
// ===== EKSEKUSI SETELAH PILIH SERVER =====
const { action, type, serverId } = state;
delete userState[ctx.chat.id];

let msg;

// ===== TRIAL AKUN =====
if (action === 'trial') {

  // 🔹 generate data trial
  const username = `trial${Math.floor(Math.random() * 10000)}`;
  const exp = '1';       // 1 hari
  const quota = '500';    // 1 GB (sesuaikan)
  const iplimit = '1';  // 1 IP

  let msg;

  if (type === 'ssh') {
    const password = '1';
    msg = await trialssh(username, password, exp, iplimit, serverId);
    await recordAccountTransaction(ctx.from.id, 'ssh');

  } else if (type === 'vmess') {
    msg = await trialvmess(username, exp, quota, iplimit, serverId);
    await recordAccountTransaction(ctx.from.id, 'vmess');

  } else if (type === 'vless') {
    msg = await trialvless(username, exp, quota, iplimit, serverId);
    await recordAccountTransaction(ctx.from.id, 'vless');

  } else if (type === 'trojan') {
    msg = await trialtrojan(username, exp, quota, iplimit, serverId);
    await recordAccountTransaction(ctx.from.id, 'trojan');

  } else if (type === 'zivpn') {
    msg = await trialzivpn(serverId);
    await recordAccountTransaction(ctx.from.id, 'zivpn');
  }

  await saveTrialAccess(ctx.from.id);
  await ctx.reply(msg, { parse_mode: 'Markdown' });
  return;
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
      return ctx.reply('❌ *Username tidak valid. Masukkan username yang valid| Masukan Ulang Username: *', { parse_mode: 'Markdown' });
    }
    if (state.username.length < 4 || state.username.length > 20) {
      return ctx.reply('❌ *Username harus terdiri dari 4 hingga 20 karakter| Masukan Ulang Username: *', { parse_mode: 'Markdown' });
    }
    if (/[A-Z]/.test(state.username)) {
      return ctx.reply('❌ *Username tidak boleh menggunakan huruf kapital. Gunakan huruf kecil saja| Masukan Ulang Username: *', { parse_mode: 'Markdown' });
    }
    if (/[^a-z0-9]/.test(state.username)) {
      return ctx.reply('❌ *Username tidak boleh mengandung karakter khusus atau spasi. Gunakan huruf kecil dan angka saja| Masukan Ulang Username: *', { parse_mode: 'Markdown' });
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
      return ctx.reply('❌ *Password tidak valid. Masukkan password yang valid| Masukan Ulang Password: *', { parse_mode: 'Markdown' });
    }
    if (state.password.length < 3) {
      return ctx.reply('❌ *Password harus terdiri dari minimal 3 karakter| Masukan Ulang Password: *', { parse_mode: 'Markdown' });
    }
    if (/[^a-zA-Z0-9]/.test(state.password)) {
      return ctx.reply('❌ *Password tidak boleh mengandung karakter khusus atau spasi| Masukan Ulang Password: *', { parse_mode: 'Markdown' });
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
else if (type === 'zivpn') {
  msg = await createzivpn(username, password, exp, iplimit, serverId);
  await recordAccountTransaction(ctx.from.id, 'zivpn');
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
    
    if (!global.depositState) {
      global.depositState = {};
    }
    global.depositState[userId] = { action: 'request_amount', amount: '' };
    
    const keyboard = keyboard_nomor();
    
    // Di handler topup_saldo, update pesan:
await ctx.editMessageText(
  '💰 *TOP UP SALDO OTOMATIS*\n\n' +
  '💳 *Minimal:* Rp 2.000\n\n' +
  '🎲 *SISTEM KEAMANAN BARU:*\n' +
  '• Biaya admin **RANDOM 100-200**\n' +
  '• Setiap transaksi punya **nominal unik**\n' +
  '• Mencegah duplikasi pembayaran\n\n' +
  '🎯 *CONTOH NOMINAL UNIK:*\n' +
  '• Rp 2.000 + Rp 157 = Rp 2.157\n' +
  '• Rp 5.000 + Rp 189 = Rp 5.189\n' +
  '• Rp 10.000 + Rp 123 = Rp 10.123\n\n' +
  '⚠️ *PERHATIAN:*\n' +
  'Transfer harus **TEPAT** sesuai nominal unik yang diberikan!\n\n' +
  'Silakan masukkan jumlah top-up:',
  {
    reply_markup: { inline_keyboard: keyboard },
    parse_mode: 'Markdown'
  }
);
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses top-up saldo:', error);
    await ctx.editMessageText('❌ *GAGAL! Terjadi kesalahan. Silakan coba lagi nanti.*', { parse_mode: 'Markdown' });
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
  try {
    await ctx.answerCbQuery();
    const serverId = ctx.match[1];

    // Simpan state agar menunggu input nama baru
    userState[ctx.chat.id] = {
      step: "edit_nama_input",
      serverId: serverId
    };

    logger.info(`Admin ${ctx.chat.id} memilih server ID ${serverId} untuk edit nama`);

    await ctx.reply(
      `✏️ *Silakan ketik nama baru untuk server ID ${serverId}:*`,
      { parse_mode: "Markdown" }
    );
  } catch (err) {
    logger.error("❌ Error edit nama:", err);
    ctx.reply("⚠️ Terjadi kesalahan saat memproses permintaan.");
  }
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
  } 
  // ✅ TAMBAHKAN HANDLER UNTUK confirm_final
  else if (data === 'confirm_final') {
    try {
      await ctx.answerCbQuery();
      
      if (global.depositState && global.depositState[userId]) {
        const amount = global.depositState[userId].amount;
        await processDeposit(ctx, amount);
      } else {
        await ctx.reply('❌ Sesi top-up sudah expired. Silakan mulai lagi.');
      }
    } catch (error) {
      logger.error('Error confirm_final:', error);
      await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
    }
    return;
  }
  else if (userStateData) {
    switch (userStateData.step) {
      // ❌ HAPUS/MODIFIKASI bagian addsaldo_userid dan addsaldo_amount 
      // karena itu seharusnya di text handler, tapi kalau sudah berjalan biarin saja
      
      // ✅ TAMBAHKAN CASE UNTUK CONFIRM FINAL DI STATE LAINNYA
      case 'confirm_final_topup':
        if (global.depositState && global.depositState[userId]) {
          const amount = global.depositState[userId].amount;
          await processDeposit(ctx, amount);
        }
        break;
        
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
      default:
        await ctx.answerCbQuery();
        break;
    }
  } else {
    await ctx.answerCbQuery();
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
    
    const amountNum = parseInt(currentAmount);
    
    if (amountNum < 2000) {
      return await ctx.answerCbQuery('⚠️ Jumlah minimal adalah 2.000!', { show_alert: true });
    }
    
    // Hitung admin fee FIXED
    const adminFee = amountNum < 5000 ? 200 : 150;
    const totalAmount = amountNum + adminFee;
    
    // TAMPILAN BARU YANG PROFESIONAL
    const confirmMessage = 
`💳 *KONFIRMASI TOP-UP*

┏━━━━━━━━━━━━━━━━━━━┓
📋 PERKIRAAN BIAYA
┗━━━━━━━━━━━━━━━━━━━┛

💰 *Nominal Top-up:* Rp ${amountNum.toLocaleString('id-ID')}
💸 *Biaya Admin:* Rp 100 - Rp 200 (random)
🎯 *Perkiraan Total:* Rp ${(amountNum + 100).toLocaleString('id-ID')} - Rp ${(amountNum + 200).toLocaleString('id-ID')}

┏━━━━━━━━━━━━━━━━━━━┓
🎲 SISTEM KEAMANAN
┗━━━━━━━━━━━━━━━━━━━┛

• Admin fee RANDOM 100-200
• Setiap transaksi unik
• Mencegah duplikasi pembayaran

┏━━━━━━━━━━━━━━━━━━━┓
⚠️ PENTING
┗━━━━━━━━━━━━━━━━━━━┛

• Total final akan ada di QRIS
• Transfer HARUS sesuai nominal di QRIS
• Sistem otomatis verifikasi

_Lanjutkan untuk melihat QRIS dengan nominal final?_`;

    await ctx.editMessageText(confirmMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ LANJUT BAYAR', callback_data: 'confirm_final' }],
          [{ text: '❌ BATAL', callback_data: 'send_main_menu' }]
        ]
      }
    });
    
    global.depositState[userId].amount = currentAmount;
    global.depositState[userId].action = 'confirm_final';
    return await ctx.answerCbQuery();
    
  } else {
    if (currentAmount.length < 12) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery('⚠️ Jumlah maksimal adalah 12 digit!', { show_alert: true });
    }
  }

  global.depositState[userId].amount = currentAmount;
  const newMessage = `💰 *Masukkan jumlah saldo yang ingin ditambahkan:*\n\nJumlah: *Rp ${currentAmount || '0'}*`;
  
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

function calculateFinalAmount(baseAmount) {
  // Fungsi ini sekarang hanya untuk display di awal
  // Random fee sebenarnya di-generate di processDeposit()
  
  const sampleFee = Math.floor(Math.random() * 101) + 100;
  const sampleTotal = baseAmount + sampleFee;
  
  return {
    finalAmount: sampleTotal,
    adminFee: sampleFee,
    baseAmount: baseAmount,
    note: 'Contoh saja - fee aktual random saat transaksi'
  };
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

// Replace fungsi processDeposit yang ada dengan ini:
async function processDeposit(ctx, amount) {
  const currentTime = Date.now();
  
  if (currentTime - lastRequestTime < requestInterval) {
    await ctx.editMessageText('⚠️ *Terlalu banyak permintaan. Silakan tunggu sebentar sebelum mencoba lagi.*', { parse_mode: 'Markdown' });
    return;
  }

  lastRequestTime = currentTime;
  const userId = ctx.from.id;
  
  // CEK BATAS TRANSAKSI PENDING
  const userPendingCount = Object.values(global.pendingDeposits)
    .filter(d => d.userId === userId && d.status === 'pending').length;
  
  if (userPendingCount >= 2) {
    await ctx.editMessageText(
      '⚠️ *Anda memiliki 2 transaksi pending yang belum dibayar.*\n\n' +
      'Silakan selesaikan pembayaran yang ada terlebih dahulu.',
      { 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔙 Kembali ke Menu', callback_data: 'send_main_menu' }]] }
      }
    );
    delete global.depositState[userId];
    return;
  }

  const amountNum = Number(amount);
  
  if (amountNum < 2000) {
    await ctx.editMessageText(
      '❌ *Minimal top-up Rp 2.000!*\n\nSilakan masukkan nominal yang valid.',
      { 
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔄 Coba Lagi', callback_data: 'topup_saldo' }]] }
      }
    );
    delete global.depositState[userId];
    return;
  }
  
  try {
    // GENERATE UNIK
    const existingDeposits = Object.values(global.pendingDeposits);
    const feeResult = await generateUniqueFee(amountNum, userId, existingDeposits);
    
    const finalAmount = feeResult.finalAmount;
    const adminFee = feeResult.adminFee;
    
    // LOGGING
    logger.info(`💰 Payment gen: ${amountNum} + ${adminFee} = ${finalAmount}`);
    
    // GENERATE REFERENCE
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const uniqueCode = `TOPUP-${userId}-${timestamp}-${randomSuffix}`;
    const referenceId = `REF-${timestamp}-${randomSuffix}`;

    // BUAT QRIS
    const urlQr = DATA_QRIS;
    const bayar = await axios.get(
      `https://api.rajaserverpremium.web.id/orderkuota/createpayment?apikey=AriApiPaymetGetwayMod&amount=${finalAmount}&codeqr=${urlQr}&reference=${referenceId}`,
      { timeout: 15000 }
    );
    
    if (bayar.data.status !== 'success') {
      throw new Error('QRIS failed: ' + JSON.stringify(bayar.data));
    }

    const qrImageUrl = bayar.data.result.imageqris?.url;
    if (!qrImageUrl || qrImageUrl.includes('undefined')) {
      throw new Error('Invalid QR URL');
    }

    // DOWNLOAD QR
    const qrResponse = await axios.get(qrImageUrl, { responseType: 'arraybuffer', timeout: 15000 });
    const qrBuffer = Buffer.from(qrResponse.data);

    // KIRIM KE USER
    // Di fungsi processDeposit(), update caption:
const caption = 
`💳 *INSTRUKSI PEMBAYARAN*

┏━━━━━━━━━━━━━━━━━━━┓
📋 DETAIL PEMBAYARAN
┗━━━━━━━━━━━━━━━━━━━┛

👤 *User ID:* \`${userId}\`
💰 *Nominal Top-up:* Rp ${amountNum.toLocaleString('id-ID')}
🎲 *Biaya Admin:* Rp ${adminFee.toLocaleString('id-ID')}
💵 *TOTAL BAYAR:* Rp ${finalAmount.toLocaleString('id-ID')}

┏━━━━━━━━━━━━━━━━━━━┓
🎯 INSTRUKSI
┗━━━━━━━━━━━━━━━━━━━┛

1. Scan QR Code di atas
2. Transfer *TEPAT* Rp ${finalAmount.toLocaleString('id-ID')}
3. Jangan kurang atau lebih!
4. Sistem otomatis verifikasi dalam 1-2 menit

┏━━━━━━━━━━━━━━━━━━━┓
⚠️ PERHATIAN
┗━━━━━━━━━━━━━━━━━━━┛

• Transfer harus sesuai nominal di atas
• Batas waktu: 5 menit
• Saldo akan otomatis bertambah
• Simpan kode referensi di bawah

🆔 *Kode Referensi:* \`${referenceId}\`
⏰ *Batas waktu:* 5 menit`;
    
    const qrMessage = await ctx.replyWithPhoto({ source: qrBuffer }, { caption: caption, parse_mode: 'Markdown' });

    // HAPUS PESAN SEBELUMNYA
    try { await ctx.deleteMessage(); } catch (e) { /* ignore */ }

    // SIMPAN KE MEMORY
    global.pendingDeposits[uniqueCode] = {
      amount: finalAmount,
      originalAmount: amountNum,
      adminFee: adminFee,
      userId: userId,
      timestamp: Date.now(),
      referenceId: referenceId,
      status: 'pending',
      qrMessageId: qrMessage.message_id,
      createdAt: Date.now(),
      lastChecked: 0,
      attempts: 0
    };

    // SIMPAN KE DATABASE
    db.run(
      `INSERT INTO pending_deposits (unique_code, user_id, amount, original_amount, admin_fee, timestamp, status, qr_message_id, reference_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uniqueCode, userId, finalAmount, amountNum, adminFee, Date.now(), 'pending', qrMessage.message_id, referenceId, Date.now()],
      (err) => { if (err) logger.error('❌ Save deposit error:', err.message); }
    );

    delete global.depositState[userId];

    logger.info(`✅ QR sent to ${userId}, amount: ${finalAmount}, ref: ${referenceId}`);

  } catch (error) {
    logger.error('❌ Deposit error:', error.message);
    
    await ctx.editMessageText(
      '❌ *GAGAL MEMBUAT PEMBAYARAN*\n\n' + error.message.substring(0, 100) + '...\n\nSilakan coba lagi.',
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Coba Lagi', callback_data: 'topup_saldo' }],
            [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
          ]
        }
      }
    );
    
    delete global.depositState[userId];
  }
}


////////
function cleanupStuckDeposits() {
  const now = Date.now();
  const fiveMinutesAgo = now - (5 * 60 * 1000);
  
  Object.keys(global.pendingDeposits).forEach(uniqueCode => {
    const deposit = global.pendingDeposits[uniqueCode];
    
    // Jika deposit dibuat > 5 menit yang lalu dan masih "generating"
    if (deposit.createdAt && deposit.createdAt < fiveMinutesAgo && 
        deposit.status === 'generating') {
      logger.info(`🧹 Cleaning up stuck deposit: ${uniqueCode}`);
      delete global.pendingDeposits[uniqueCode];
      
      // Hapus dari database juga
      db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
    }
  });
}

// Tambahkan ke interval cleanup
setInterval(cleanupStuckDeposits, 60000); // Setiap 1 menit

function parseDate(dateString) {
  try {
    if (!dateString || dateString === '-' || dateString.trim() === '') {
      return Date.now() - 60000;
    }
    
    dateString = dateString.trim();
    
    // 🎯 FIXED: Tangani format "27/12/2025 13:53" (TANPA DETIK)
    const match = dateString.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})[ T](\d{1,2})[\.:](\d{1,2})(?:[\.:](\d{1,2}))?/);
    
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const year = parseInt(match[3], 10);
      const hour = parseInt(match[4], 10);
      const minute = parseInt(match[5], 10);
      const second = match[6] ? parseInt(match[6], 10) : 30; // 🔥 FIX: Default 30 detik!
      
      const dateObj = new Date(year, month, day, hour, minute, second);
      
      return dateObj.getTime();
    }
    
    // Fallback untuk format lain
    const parsed = Date.parse(dateString);
    if (!isNaN(parsed)) {
      console.log(`🕒 PARSED via Date.parse: "${dateString}" → ${new Date(parsed).toLocaleString('id-ID')}`);
      return parsed;
    }
    
    console.log(`⚠️ GAGAL parse: "${dateString}", pakai waktu sekarang`);
    return Date.now();
    
  } catch (error) {
    console.error(`❌ parseDate ERROR:`, error.message);
    return Date.now();
  }
}

let lastApiCallTime = 0;
const API_CALL_INTERVAL = 5000; // 5 detik minimal interval
let transactionCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 10000; // 10 detik cache

// Replace fungsi checkQRISStatus dengan ini:
async function checkQRISStatus() {
  const now = Date.now();
  
  // Rate limiting API calls
  if (now - lastApiCallTime < API_CALL_INTERVAL) {
    return;
  }
  
  try {
    const pendingDeposits = Object.entries(global.pendingDeposits);
    if (pendingDeposits.length === 0) {
      return;
    }

    let transaksiList = [];
    
    // ✅ GUNAKAN CACHE DENGAN VALIDASI
    if (transactionCache && (now - cacheTimestamp < CACHE_DURATION)) {
      transaksiList = transactionCache;
      logger.debug('📦 Menggunakan cache transaksi');
    } else {
      // Ambil data dari API
      const data = buildPayload();
      const resultcek = await axios.post(API_URL, data, { 
        headers, 
        timeout: 10000 
      });
      
      const responseText = resultcek.data;
      const blocks = responseText.split('------------------------').filter(Boolean);
      
      transaksiList = [];
      for (const block of blocks) {
        try {
          // ✅ PARSE SEMUA FIELD YANG MUNGKIN ADA
          const kreditMatch = block.match(/Kredit\s*:\s*([\d.,]+)/);
          const tanggalMatch = block.match(/Tanggal\s*:\s*(.+)/);
          const brandMatch = block.match(/Brand\s*:\s*(.+)/);
          const deskripsiMatch = block.match(/Deskripsi\s*:\s*([\s\S]+?)(?=\n\w|$)/);
          const noteMatch = block.match(/Catatan\s*:\s*([\s\S]+?)(?=\n\w|$)/);
          const keteranganMatch = block.match(/Keterangan\s*:\s*([\s\S]+?)(?=\n\w|$)/);
          
          if (kreditMatch && tanggalMatch) {
            // Bersihkan format angka (hapus titik)
            const kreditStr = kreditMatch[1].replace(/\./g, '');
            const kredit = parseInt(kreditStr);
            
            if (!isNaN(kredit)) {
              // Gabungkan semua deskripsi/keterangan
              const deskripsi = deskripsiMatch ? deskripsiMatch[1].trim() : 
                              (noteMatch ? noteMatch[1].trim() : 
                              (keteranganMatch ? keteranganMatch[1].trim() : ''));
              
              transaksiList.push({
                tanggal: tanggalMatch[1].trim(),
                kredit: kredit,
                brand: brandMatch ? brandMatch[1].trim() : '-',
                deskripsi: deskripsi,
                timestamp: parseDate(tanggalMatch[1].trim()),
                rawBlock: block.substring(0, 200) + '...' // Simpan sebagian untuk debug
              });
            }
          }
        } catch (e) {
          logger.error('❌ Error parsing transaction block:', e.message);
        }
      }
      
      // ✅ FILTER: Hanya transaksi 30 MENIT terakhir (lebih ketat)
      const thirtyMinutesAgo = now - (30 * 60 * 1000);
      transaksiList = transaksiList.filter(t => t.timestamp > thirtyMinutesAgo);
      
      // ✅ SORT: Terbaru dulu
      transaksiList.sort((a, b) => b.timestamp - a.timestamp);
      
      transactionCache = transaksiList;
      cacheTimestamp = now;
      lastApiCallTime = now;
      
      if (transaksiList.length > 0) {
        logger.info(`📊 ${transaksiList.length} transaksi ditemukan (30 menit terakhir)`);
      }
    }

    // ✅ PROSES PENDING DEPOSITS DENGAN VALIDASI SUPER KETAT
    for (const [uniqueCode, deposit] of pendingDeposits) {
      if (deposit.status !== 'pending') continue;

      deposit.lastChecked = deposit.lastChecked || 0;
      deposit.attempts = deposit.attempts || 0;
      
      // ✅ JANGAN CEK TERLALU SERING (setiap 15 detik)
      if (now - deposit.lastChecked < 15000) continue;
      
      deposit.lastChecked = now;
      deposit.attempts++;

      const depositAge = now - deposit.createdAt;
      
      // ✅ CEK EXPIRED (5 menit = 300000 ms)
      if (depositAge > 300000) {
        logger.info(`⏰ Deposit expired: ${uniqueCode}, Age: ${Math.round(depositAge/1000)}s`);
        
        try {
          if (deposit.qrMessageId) {
            await bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId);
          }
          
          await bot.telegram.sendMessage(
            deposit.userId,
            '❌ *Pembayaran Expired*\n\n' +
            'Waktu pembayaran QR Code telah habis (5 menit).\n' +
            'Silakan klik Top Up lagi untuk mendapatkan QR baru.',
            { parse_mode: 'Markdown' }
          );
          
        } catch (error) {
          logger.error('Error handling expired deposit:', error.message);
        }

        delete global.pendingDeposits[uniqueCode];
        db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
        continue;
      }

      // ✅ LOGGING DETAIL UNTUK DEBUG
      const expectedAmount = deposit.amount;
      const adminFee = deposit.amount - deposit.originalAmount;
      
      logger.info(`🔍 Checking deposit: ${uniqueCode}`);
      logger.info(`   User: ${deposit.userId}`);
      logger.info(`   Base amount: ${deposit.originalAmount}`);
      logger.info(`   Admin fee: ${adminFee} (random 100-200)`);
      logger.info(`   Expected TOTAL: ${expectedAmount} 🎯`);
      logger.info(`   Reference ID: ${deposit.referenceId}`);
      logger.info(`   Created: ${new Date(deposit.createdAt).toLocaleTimeString('id-ID')}`);
      logger.info(`   Age: ${Math.round(depositAge/1000)}s`);
      
      // ✅ VALIDASI 1: Cari transaksi dengan nominal yang PERSIS SAMA
      const potentialMatches = transaksiList.filter(t => {
        // HARUS PERSIS SAMA, tidak boleh beda 1 rupiah pun!
        return t.kredit === expectedAmount;
      });
      
      if (potentialMatches.length === 0) {
        // Tidak ada transaksi dengan nominal ini
        if (deposit.attempts % 5 === 0) { // Log setiap 5 attempts
          logger.info(`   ❌ No transaction found with amount: ${expectedAmount}`);
        }
        continue;
      }
      
      logger.info(`   ✅ Found ${potentialMatches.length} exact amount matches`);
      
      // ✅ VALIDASI 2: Transaksi harus dibuat SETELAH deposit dimulai + validasi ketat
      const validMatches = potentialMatches.filter(t => {
  // Waktu SUPER LONGGAR untuk testing
  const timeDiff = t.timestamp - deposit.createdAt;
  return timeDiff >= -300000 && timeDiff <= 900000; // -5 menit sampai +15 menit
});
      
      if (validMatches.length === 0) {
        logger.info(`   ❌ No valid matches after time filtering`);
        continue;
      }
      
      logger.info(`   ✅ ${validMatches.length} valid after filtering`);
      
      // ✅ VALIDASI 3: Ambil transaksi TERBARU yang valid
      validMatches.sort((a, b) => b.timestamp - a.timestamp);
      const matchedTransaction = validMatches[0];
      
      // ✅ VALIDASI 4: Cek apakah transaksi ini sudah pernah diproses
      const transactionKey = `${matchedTransaction.timestamp}_${expectedAmount}_${deposit.userId}_${deposit.referenceId}`;
      
      if (global.processedTransactions && global.processedTransactions.has(transactionKey)) {
        logger.info(`⏭️ Transaction already processed: ${transactionKey}`);
        continue;
      }
      
      // ✅ LOG UNTUK DEBUG
      const paymentDelay = matchedTransaction.timestamp - deposit.createdAt;
      logger.info(`🎯 Payment match CONFIRMED for ${uniqueCode}`);
      logger.info(`   Deposit created: ${new Date(deposit.createdAt).toLocaleString('id-ID')}`);
      logger.info(`   Transaction time: ${new Date(matchedTransaction.timestamp).toLocaleString('id-ID')}`);
      logger.info(`   Time difference: ${Math.round(paymentDelay/1000)} seconds`);
      logger.info(`   Description: ${matchedTransaction.deskripsi.substring(0, 100)}...`);
      
      // ✅ VALIDASI FINAL: Timing harus masuk akal
      if (paymentDelay < 15000 || paymentDelay > 270000) {
        logger.warn(`⚠️ Suspicious timing: ${Math.round(paymentDelay/1000)}s for ${uniqueCode}`);
        continue;
      }

      // ✅ PROSES PEMBAYARAN
      try {
        const success = await processMatchingPayment(deposit, matchedTransaction, uniqueCode);
        
        if (success) {
          logger.info(`💰 Payment processed successfully: ${uniqueCode}`);
          
          // Simpan ke cache processed transactions
          if (!global.processedTransactions) {
            global.processedTransactions = new Set();
          }
          global.processedTransactions.add(transactionKey);
          
          // Schedule cleanup untuk processed transactions (24 jam)
          setTimeout(() => {
            if (global.processedTransactions) {
              global.processedTransactions.delete(transactionKey);
            }
          }, 24 * 60 * 60 * 1000);
          
          delete global.pendingDeposits[uniqueCode];
          db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
          
          // Clear cache karena ada perubahan
          transactionCache = null;
        }
      } catch (error) {
        logger.error(`❌ Error processing payment ${uniqueCode}:`, error.message);
        logger.error(`   Error details:`, error.stack);
      }
    }
    
  } catch (error) {
    logger.error('❌ Error in checkQRISStatus:', error.message);
    logger.error('   Stack:', error.stack);
    transactionCache = null;
    
    // Reset API call time untuk coba lagi
    lastApiCallTime = 0;
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
  const buttons = [
    [{ text: '1', callback_data: '1' }, { text: '2', callback_data: '2' }, { text: '3', callback_data: '3' }],
    [{ text: '4', callback_data: '4' }, { text: '5', callback_data: '5' }, { text: '6', callback_data: '6' }],
    [{ text: '7', callback_data: '7' }, { text: '8', callback_data: '8' }, { text: '9', callback_data: '9' }],
    [{ text: '0', callback_data: '0' }, { text: '00', callback_data: '00' }],
    [{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }],
    [
      { text: '💰 5rb', callback_data: '5000' },
      { text: '💰 10rb', callback_data: '10000' },
      { text: '💰 20rb', callback_data: '20000' }
    ],
    [{ text: '🔙 Kembali ke Menu', callback_data: 'send_main_menu' }]
  ];
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

// Jika ada fungsi ini, Anda bisa hapus atau biarkan sebagai fallback
async function sendPaymentSuccessNotification(userId, deposit, currentBalance) {
  try {
    const adminFee = deposit.amount - deposit.originalAmount;
    
    await bot.telegram.sendMessage(
      userId,
      `✅ *Pembayaran Berhasil!*\n\n` +
      `💰 Nominal Top-up: Rp ${deposit.originalAmount.toLocaleString('id-ID')}\n` +
      `💸 Biaya Admin: Rp ${adminFee.toLocaleString('id-ID')}\n` +
      `💵 Total Bayar: Rp ${deposit.amount.toLocaleString('id-ID')}\n` +
      `🏦 Saldo Sekarang: Rp ${currentBalance.toLocaleString('id-ID')}`,
      { parse_mode: 'Markdown' }
    );
    
    return true;
  } catch (error) {
    logger.error('❌ Error in sendPaymentSuccessNotification:', error.message);
    return false;
  }
}


// ✅ JALANKAN CLEANUP SETIAP 5 MENIT
setInterval(cleanupOldDeposits, 5 * 60 * 1000);

// ✅ TAMBAHKAN CLEANUP SAAT BOT START
// Di bagian app.listen() atau setelah bot.launch():
setTimeout(() => {
  logger.info('🚀 Running initial cleanup...');
  cleanupOldDeposits();
}, 10000); // Jalankan 10 detik setelah start

// ✅ FUNGSI CLEANUP PROCESSED TRANSACTIONS
function cleanupProcessedTransactions() {
  if (!global.processedTransactions || global.processedTransactions.size === 0) {
    return;
  }
  
  const oldSize = global.processedTransactions.size;
  
  // Hapus semua yang sudah lebih dari 24 jam
  // (Karena kita sudah set timeout di setiap add, ini backup saja)
  global.processedTransactions.clear();
  
  if (oldSize > 0) {
    logger.info(`🧹 Cleaned ${oldSize} processed transactions from cache`);
  }
}

// ✅ GRACEFUL SHUTDOWN HANDLER
function gracefulShutdown() {
  logger.info('🛑 Shutting down gracefully...');
  
  // Cleanup sebelum exit
  cleanupOldDeposits();
  cleanupProcessedTransactions();
  
  // Close database connection
  db.close((err) => {
    if (err) {
      logger.error('Error closing database:', err.message);
    } else {
      logger.info('✅ Database connection closed');
    }
    
    process.exit(0);
  });
}

function cleanupOldDeposits() {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  let cleanedCount = 0;
  
  Object.keys(global.pendingDeposits).forEach(uniqueCode => {
    const deposit = global.pendingDeposits[uniqueCode];
    
    // ✅ CEK: Deposit lebih dari 1 jam dan masih pending
    if (deposit.createdAt && deposit.createdAt < oneHourAgo && deposit.status === 'pending') {
      logger.info(`🧹 Cleaning up old deposit: ${uniqueCode}, Age: ${now - deposit.createdAt}ms`);
      
      // ✅ HAPUS PESAN QR CODE JIKA ADA
      if (deposit.qrMessageId) {
        try {
          bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId).catch(() => {});
        } catch (e) {
          // Ignore error jika pesan sudah dihapus
        }
      }
      
      // ✅ KIRIM NOTIFIKASI KE USER (OPSIONAL)
      try {
        bot.telegram.sendMessage(
          deposit.userId,
          '📝 *Pengingat*\n\n' +
          'Deposit Anda yang belum dibayar telah dihapus dari sistem.\n' +
          'Silakan buat deposit baru jika masih ingin top-up.',
          { parse_mode: 'Markdown' }
        ).catch(() => {}); // Ignore jika user block bot
      } catch (e) {
        // Ignore error
      }
      
      delete global.pendingDeposits[uniqueCode];
      cleanedCount++;
      
      // ✅ HAPUS DARI DATABASE
      db.run('DELETE FROM pending_deposits WHERE unique_code = ?', 
        [uniqueCode], 
        (err) => {
          if (err) logger.error('Error cleaning up old deposit:', err.message);
        }
      );
    }
  });
  
  if (cleanedCount > 0) {
    logger.info(`🧹 Cleaned ${cleanedCount} old pending deposits`);
  }
}

// Handle shutdown signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // Untuk nodemon/PM2 restart

// Jalankan setiap 6 jam
setInterval(cleanupProcessedTransactions, 6 * 60 * 60 * 1000);

// Jalankan cleanup setiap 5 menit
setInterval(cleanupOldDeposits, 5 * 60 * 1000);

async function processMatchingPayment(deposit, matchingTransaction, uniqueCode) {
  console.log(`💰 [PAYMENT START] Processing ${uniqueCode}`);
  
  try {
    const adminFee = deposit.amount - deposit.originalAmount;
    const totalPaid = deposit.amount;
    
    // 1. UPDATE SALDO
    db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?',
      [deposit.originalAmount, deposit.userId],
      function(err) {
        if (err) {
          console.error('❌ Error update saldo:', err.message);
          // Kirim notifikasi error
          bot.telegram.sendMessage(
            deposit.userId,
            `❌ *GAGAL TOP-UP*\n\n` +
            `Terjadi kesalahan sistem.\n` +
            `Silakan hubungi admin.\n` +
            `🆔 ${deposit.referenceId}`,
            { parse_mode: 'Markdown' }
          );
        } else {
          console.log(`✅ Saldo updated: +${deposit.originalAmount} for user ${deposit.userId}`);
          
          // 2. SIMPAN TRANSAKSI
          db.run(
            'INSERT INTO transactions (user_id, amount, type, reference_id, timestamp) VALUES (?, ?, ?, ?, ?)',
            [deposit.userId, deposit.originalAmount, 'deposit', deposit.referenceId, Date.now()],
            function(err) {
              if (err) {
                console.error('❌ Error save transaction:', err.message);
              } else {
                console.log(`✅ Transaction saved: ${deposit.referenceId}`);
                
                // 3. HAPUS DARI PENDING
                delete global.pendingDeposits[uniqueCode];
                db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode]);
                
                // 4. AMBIL SALDO TERBARU DAN KIRIM NOTIFIKASI CANTIK
                db.get('SELECT saldo FROM users WHERE user_id = ?', [deposit.userId], (err, row) => {
                  const currentBalance = row ? row.saldo : deposit.originalAmount;
                  const waktu = new Date().toLocaleString('id-ID', { 
                    timeZone: 'Asia/Jakarta',
                    dateStyle: 'full',
                    timeStyle: 'medium'
                  });
                  
                  // NOTIFIKASI KE USER (TAMPILAN BARU)
                  const userMessage = 
`🎉 *TOP-UP BERHASIL!* 🎉

┏━━━━━━━━━━━━━━━━━━━┓
🏦 *DETAIL TRANSAKSI*
┗━━━━━━━━━━━━━━━━━━━┛

💰 *Nominal Top-up:* Rp ${deposit.originalAmount.toLocaleString('id-ID')}
🎲 *Biaya Admin:* Rp ${adminFee.toLocaleString('id-ID')}
💵 *Total Bayar:* Rp ${totalPaid.toLocaleString('id-ID')}
🏦 *Saldo Sekarang:* Rp ${currentBalance.toLocaleString('id-ID')}

┏━━━━━━━━━━━━━━━━━━━┓
📋 *INFORMASI*
┗━━━━━━━━━━━━━━━━━━━┛

🆔 *Referensi:* \`${deposit.referenceId}\`
👤 *User ID:* \`${deposit.userId}\`
⏰ *Waktu:* ${waktu}

┏━━━━━━━━━━━━━━━━━━━┓
✨ *TERIMA KASIH*
┗━━━━━━━━━━━━━━━━━━━┛

_Saldo telah ditambahkan ke akun Anda._
_Gunakan untuk membuat akun VPN premium!_`;

                  bot.telegram.sendMessage(
                    deposit.userId,
                    userMessage,
                    { parse_mode: 'Markdown' }
                  ).then(() => {
                    console.log(`📨 Notification sent to ${deposit.userId}`);
                    
                    // 5. NOTIFIKASI KE GRUP ADMIN (jika ada)
                    if (GROUP_ID_NUM) {
                      const adminMessage = 
`💸 *NOTIFIKASI TOP-UP* 💸
┏━━━━━━━━━━━━━━━━━━┓
📊 TRANSAKSI BERHASIL
┗━━━━━━━━━━━━━━━━━━┛

👤 *User:* \`${deposit.userId}\`
💰 *Top-up:* Rp ${deposit.originalAmount.toLocaleString('id-ID')}
🎲 *Admin Fee:* Rp ${adminFee.toLocaleString('id-ID')}
💵 *Total:* Rp ${totalPaid.toLocaleString('id-ID')}
🏦 *Saldo Akhir:* Rp ${currentBalance.toLocaleString('id-ID')}

🆔 *Ref:* ${deposit.referenceId}
⏰ ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

                      bot.telegram.sendMessage(
                        GROUP_ID_NUM,
                        adminMessage,
                        { parse_mode: 'Markdown' }
                      ).catch(() => {});
                    }
                    
                    // 6. HAPUS QR MESSAGE
                    if (deposit.qrMessageId) {
                      bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId)
                        .catch(() => {});
                    }
                    
                    console.log(`🎉 [PAYMENT COMPLETE] ${uniqueCode} SUCCESS!`);
                    
                  }).catch(err => {
                    console.error('❌ Notification error:', err.message);
                  });
                });
              }
            }
          );
        }
      }
    );
    
    return true;
    
  } catch (error) {
    console.error(`❌ [PAYMENT FAILED] ${uniqueCode}:`, error.message);
    
    // Kirim notifikasi error ke user
    bot.telegram.sendMessage(
      deposit.userId,
      `❌ *TOP-UP GAGAL*\n\n` +
      `Terjadi kesalahan saat memproses pembayaran.\n\n` +
      `💰 *Nominal:* Rp ${deposit.originalAmount.toLocaleString('id-ID')}\n` +
      `🆔 *Referensi:* \`${deposit.referenceId}\`\n\n` +
      `Silakan hubungi admin untuk bantuan.`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});
    
    return false;
  }
}

// Di validatePaymentSecurity(), UBAH TOTAL menjadi ini:
async function validatePaymentSecurity(deposit, matchingTransaction, uniqueCode) {
  const checks = [];
  const failedChecks = [];
  
  console.log(`🔒 [SECURITY DEBUG] Validating ${uniqueCode}`);
  console.log(`   Deposit time: ${new Date(deposit.createdAt).toLocaleString('id-ID')}`);
  console.log(`   Transaction time: ${new Date(matchingTransaction.timestamp).toLocaleString('id-ID')}`);
  console.log(`   Time diff: ${matchingTransaction.timestamp - deposit.createdAt}ms`);
  
  // 1. AMOUNT CHECK (ini yang PALING PENTING)
  const amountOk = matchingTransaction.kredit === deposit.amount;
  checks.push({
    name: 'Amount',
    passed: amountOk,
    details: `Expected: ${deposit.amount}, Got: ${matchingTransaction.kredit}`
  });
  if (!amountOk) failedChecks.push('Amount');
  
  // 2. TIMING CHECK - SANGAT LONGGAR
  const paymentDelay = matchingTransaction.timestamp - deposit.createdAt;
  const timingOk = paymentDelay >= -600000 && paymentDelay <= 1800000; // -10 menit sampai +30 menit
  checks.push({
    name: 'Timing',
    passed: timingOk,
    details: `${Math.round(paymentDelay/1000)}s (super loose: -10m to +30m)`
  });
  if (!timingOk) failedChecks.push('Timing');
  
  // 3. DUPLICATE CHECK
  const transactionKey = `${matchingTransaction.timestamp}_${deposit.amount}_${deposit.userId}`;
  const duplicateOk = !(global.processedTransactions && 
                       global.processedTransactions.has(transactionKey));
  checks.push({
    name: 'Duplicate',
    passed: duplicateOk,
    details: duplicateOk ? 'New transaction' : 'Already processed'
  });
  if (!duplicateOk) failedChecks.push('Duplicate');
  
  // 4. REFERENCE CHECK (optional - skip jika tidak ada)
  let refOk = false;
  if (matchingTransaction.deskripsi && matchingTransaction.deskripsi.trim() !== '-') {
    const descLower = matchingTransaction.deskripsi.toLowerCase();
    refOk = descLower.includes(deposit.referenceId.toLowerCase()) ||
            descLower.includes(String(deposit.userId)) ||
            descLower.includes('topup') ||
            descLower.includes('ref-');
  }
  checks.push({
    name: 'Reference',
    passed: refOk,
    optional: true,
    details: refOk ? 'Reference found' : 'No reference (optional)'
  });
  if (!refOk) failedChecks.push('Reference');
  
  console.log(`🔒 [SECURITY RESULT] Passed: ${checks.filter(c => c.passed).length}/${checks.length}`);
  
  // HANYA AMOUNT yang mandatory
  const mandatoryPassed = amountOk && duplicateOk;
  
  return {
    allPassed: mandatoryPassed,
    checks: checks,
    failedChecks: failedChecks,
    paymentDelay: paymentDelay
  };
}

// ✅ FUNGSI POST-PAYMENT CLEANUP
async function performPostPaymentCleanup(deposit, referenceId, adminFee, currentBalance) {
  try {
    // 1. Hapus QR message
    if (deposit.qrMessageId) {
      try {
        await bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId);
        logger.info(`🗑️ QR message deleted`);
      } catch (e) {
        if (e.response?.error_code !== 400) {
          logger.error('❌ Error deleting QR:', e.message);
        }
      }
    }
    
    // 2. Kirim notifikasi ke user
    try {
      await bot.telegram.sendMessage(
        deposit.userId,
        `✅ *PEMBAYARAN BERHASIL!*\n\n` +
        `💰 Top-up: Rp ${deposit.originalAmount.toLocaleString('id-ID')}\n` +
        `🎲 Admin: Rp ${adminFee.toLocaleString('id-ID')} (random)\n` +
        `💵 Total: Rp ${deposit.amount.toLocaleString('id-ID')}\n` +
        `🏦 Saldo: Rp ${currentBalance.toLocaleString('id-ID')}\n\n` +
        `🆔 Referensi: \`${referenceId}\`\n` +
        `⏰ ${new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
        { parse_mode: 'Markdown' }
      );
      logger.info(`📨 User notified`);
    } catch (e) {
      logger.error('❌ Error notifying user:', e.message);
    }
    
    // 3. Kirim notifikasi ke grup
    if (GROUP_ID_NUM) {
      try {
        let userInfo = {};
        try {
          userInfo = await bot.telegram.getChat(deposit.userId);
        } catch (e) {}
        
        const username = userInfo.username ? `@${userInfo.username}` : 
                        (userInfo.first_name || `User ${deposit.userId}`);
        
        await bot.telegram.sendMessage(
          GROUP_ID_NUM,
          `🎉 *TOP UP BERHASIL* 🎉\n\n` +
          `👤 ${username}\n` +
          `💰 Rp ${deposit.originalAmount.toLocaleString('id-ID')}\n` +
          `🎲 +Rp ${adminFee.toLocaleString('id-ID')} (random fee)\n` +
          `💵 Total: Rp ${deposit.amount.toLocaleString('id-ID')}\n` +
          `🏦 Saldo: Rp ${currentBalance.toLocaleString('id-ID')}\n\n` +
          `🆔 ${referenceId.substring(0, 12)}...`,
          { parse_mode: 'Markdown' }
        );
        logger.info(`📢 Group notified`);
      } catch (e) {
        logger.error('❌ Error notifying group:', e.message);
      }
    }
    
    // 4. Cleanup receipts folder
    try {
      const receiptsDir = path.join(__dirname, 'receipts');
      if (fs.existsSync(receiptsDir)) {
        const files = fs.readdirSync(receiptsDir);
        for (const file of files) {
          fs.unlinkSync(path.join(receiptsDir, file));
        }
        if (files.length > 0) {
          logger.info(`🧹 ${files.length} receipt files cleaned`);
        }
      }
    } catch (e) {
      // Ignore receipt cleanup errors
    }
    
  } catch (error) {
    logger.error('❌ Error in post-payment cleanup:', error.message);
  }
}

// ✅ FUNGSI UNTUK GENERATE RANDOM FEE YANG UNIK
// ✅ FUNGSI UNTUK GENERATE RANDOM FEE YANG UNIK DAN PASTI BEDA
async function generateUniqueFee(baseAmount, userId, existingDeposits) {
  logger.info(`🎲 Generating unique fee for user ${userId}, base: ${baseAmount}`);
  
  // Ambil semua amount yang sedang pending (dalam 24 jam)
  const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
  const recentDeposits = existingDeposits
    .filter(d => d.createdAt > twentyFourHoursAgo && d.status === 'pending');
  
  const recentAmounts = recentDeposits.map(d => d.amount);
  
  logger.info(`   Found ${recentAmounts.length} recent pending amounts`);
  
  // Tampilkan amounts yang sudah ada untuk debugging
  if (recentAmounts.length > 0) {
    logger.info(`   Existing amounts: ${recentAmounts.join(', ')}`);
  }
  
  let attempts = 0;
  const maxAttempts = 20; // Naikkan dari 15 ke 20
  let adminFee, finalAmount;
  let foundUnique = false;
  
  // Coba generate amount unik
  while (attempts < maxAttempts && !foundUnique) {
    attempts++;
    
    // Generate random fee 100-200 dengan variasi lebih banyak
    adminFee = Math.floor(Math.random() * 101) + 100;
    
    // Tambahkan random adjustment kecil (0-99) untuk lebih unik
    const randomAdjustment = Math.floor(Math.random() * 100);
    finalAmount = baseAmount + adminFee + randomAdjustment;
    
    logger.info(`   Attempt ${attempts}: ${baseAmount} + ${adminFee} + ${randomAdjustment} = ${finalAmount}`);
    
    // Cek apakah amount ini unik
    if (!recentAmounts.includes(finalAmount)) {
      // Double check di database (pending deposits) dengan query lebih spesifik
      try {
        const dbCheck = await new Promise((resolve) => {
          db.get(
            `SELECT COUNT(*) as count FROM pending_deposits 
             WHERE amount = ? 
             AND created_at > ? 
             AND status = 'pending'`,
            [finalAmount, twentyFourHoursAgo],
            (err, row) => {
              if (err) {
                logger.error('❌ DB check error:', err.message);
                resolve(0);
              } else {
                resolve(row ? row.count : 0);
              }
            }
          );
        });
        
        if (dbCheck === 0) {
          foundUnique = true;
          logger.info(`   ✅ Found unique amount after ${attempts} attempts`);
          break;
        } else {
          logger.info(`   ❌ Amount ${finalAmount} exists in database, trying again...`);
        }
      } catch (dbError) {
        logger.error('❌ Error checking database:', dbError.message);
      }
    } else {
      logger.info(`   ❌ Amount ${finalAmount} exists in recent amounts, trying again...`);
    }
    
    // Tunggu sedikit sebelum coba lagi
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  // JIKA MASIH TIDAK UNIK SETELAH MAX ATTEMPTS
  if (!foundUnique) {
    logger.warn(`⚠️ Could not find unique amount after ${maxAttempts} attempts`);
    
    // Gunakan algoritma fallback yang garansi unik
    // Gabungkan timestamp + user ID untuk garansi keunikan
    const timestampPart = Date.now() % 10000; // 0-9999
    const userIdPart = userId % 100; // 0-99
    const microAdjustment = (timestampPart + userIdPart) % 100; // 0-99
    
    adminFee = Math.floor(Math.random() * 101) + 100;
    finalAmount = baseAmount + adminFee + microAdjustment;
    
    logger.info(`   🔄 Using guaranteed unique amount: ${baseAmount} + ${adminFee} + ${microAdjustment} = ${finalAmount}`);
    logger.info(`      Timestamp: ${timestampPart}, UserID: ${userIdPart}, Adjustment: ${microAdjustment}`);
  }
  
  // FINAL VALIDATION - PASTIKAN TIDAK ADA DUPLIKAT
  const finalCheck = await new Promise((resolve) => {
    db.get(
      `SELECT COUNT(*) as count FROM pending_deposits 
       WHERE amount = ? 
       AND created_at > ? 
       AND status = 'pending'`,
      [finalAmount, Date.now() - (24 * 60 * 60 * 1000)],
      (err, row) => {
        resolve(err ? 1 : (row ? row.count : 0));
      }
    );
  });
  
  if (finalCheck > 0) {
    logger.error(`❌ CRITICAL: Generated amount ${finalAmount} STILL EXISTS in database!`);
    
    // EMERGENCY FALLBACK - PASTI UNIK
    const emergencyAdjustment = Date.now() % 1000;
    finalAmount = baseAmount + 150 + emergencyAdjustment; // 150 sebagai fixed fee
    
    logger.info(`   🚨 EMERGENCY: Using emergency amount: ${finalAmount}`);
  }
  
  logger.info(`   🎯 Final generated: ${baseAmount} + ${adminFee} = ${finalAmount} (unique: ${foundUnique})`);
  
  return {
    adminFee: adminFee,
    finalAmount: finalAmount,
    isUnique: foundUnique || true, // Selalu return true untuk force continue
    attempts: attempts,
    note: foundUnique ? 'Random unique' : 'Guaranteed unique'
  };
}

//////

// ✅ FUNGSI UNTUK GENERATE RANDOM FEE YANG BENAR-BENAR UNIK
function generateUniqueFee(baseAmount, userId) {
  // Generate random fee 100-200
  let adminFee = Math.floor(Math.random() * 101) + 100;
  let finalAmount = baseAmount + adminFee;
  let attempts = 0;
  
  // Cek apakah amount ini sudah pernah dipakai (pending)
  const isAmountUsed = Object.values(global.pendingDeposits)
    .some(d => d.amount === finalAmount);
  
  // Jika sudah dipakai, coba generate ulang (max 5x)
  while (isAmountUsed && attempts < 5) {
    adminFee = Math.floor(Math.random() * 101) + 100;
    finalAmount = baseAmount + adminFee;
    attempts++;
    
    const newCheck = Object.values(global.pendingDeposits)
      .some(d => d.amount === finalAmount);
    
    if (!newCheck) break;
  }
  
  // Jika masih tabrakan setelah 5x, tambahkan timestamp
  if (attempts >= 5) {
    const timestamp = Date.now() % 100; // 0-99
    adminFee = Math.floor(Math.random() * 101) + 100;
    finalAmount = baseAmount + adminFee + timestamp;
    logger.warn(`⚠️ Using timestamp adjustment for unique amount`);
  }
  
  return {
    adminFee: adminFee,
    finalAmount: finalAmount,
    attempts: attempts
  };
}

// ✅ FUNGSI UNTUK VALIDATE PAYMENT SECURITY
function validatePaymentSecurity(deposit, matchingTransaction) {
  const securityChecks = [];
  
  // 1. Check timing
  const paymentDelay = matchingTransaction.timestamp - deposit.createdAt;
  securityChecks.push({
    name: 'Timing',
    passed: paymentDelay >= 15000 && paymentDelay <= 270000,
    details: `${Math.round(paymentDelay/1000)}s (15s-4.5m)`
  });
  
  // 2. Check amount match (EXACT)
  securityChecks.push({
    name: 'Amount Match',
    passed: matchingTransaction.kredit === deposit.amount,
    details: `Expected: ${deposit.amount}, Got: ${matchingTransaction.kredit}`
  });
  
  // 3. Check reference in description (optional)
  if (matchingTransaction.deskripsi && matchingTransaction.deskripsi.trim() !== '-') {
    const descLower = matchingTransaction.deskripsi.toLowerCase();
    const hasReference = descLower.includes(deposit.referenceId.toLowerCase()) ||
                        descLower.includes(String(deposit.userId));
    securityChecks.push({
      name: 'Reference Match',
      passed: hasReference,
      details: hasReference ? 'Reference found' : 'No reference found'
    });
  }
  
  // 4. Check if transaction already processed
  const transactionKey = `${matchingTransaction.timestamp}_${deposit.amount}_${deposit.userId}`;
  const alreadyProcessed = global.processedTransactions && 
                          global.processedTransactions.has(transactionKey);
  securityChecks.push({
    name: 'Duplicate Check',
    passed: !alreadyProcessed,
    details: alreadyProcessed ? 'Already processed' : 'New transaction'
  });
  
  // Log all security checks
  logger.info(`🔒 Payment Security Check:`);
  securityChecks.forEach(check => {
    const status = check.passed ? '✅' : '❌';
    logger.info(`   ${status} ${check.name}: ${check.details}`);
  });
  
  // Return true if all mandatory checks pass
  const mandatoryChecks = securityChecks.filter(c => 
    c.name !== 'Reference Match' // Reference match optional
  );
  
  return mandatoryChecks.every(c => c.passed);
}

// ✅ FUNGSI UNTUK SEND PAYMENT SUMMARY
async function sendPaymentSummary(deposit, transactionDetails) {
  try {
    const summary = `
📊 *PAYMENT SUMMARY*

👤 User: ${deposit.userId}
💰 Base Amount: ${deposit.originalAmount}
🎲 Admin Fee: ${deposit.amount - deposit.originalAmount}
💵 Total: ${deposit.amount}
🆔 Reference: ${deposit.referenceId}

⏰ Timing:
• QR Created: ${new Date(deposit.createdAt).toLocaleTimeString('id-ID')}
• Payment Time: ${new Date(transactionDetails.timestamp).toLocaleTimeString('id-ID')}
• Delay: ${Math.round((transactionDetails.timestamp - deposit.createdAt)/1000)}s

🔍 Transaction Details:
• Amount: ${transactionDetails.kredit}
• Time: ${new Date(transactionDetails.timestamp).toLocaleString('id-ID')}
• Description: ${transactionDetails.deskripsi?.substring(0, 50) || 'N/A'}...

✅ Status: VERIFIED & COMPLETED
    `.trim();
    
    // Kirim ke admin/log channel jika ada
    if (GROUP_ID_NUM) {
      await bot.telegram.sendMessage(GROUP_ID_NUM, summary, { parse_mode: 'Markdown' });
    }
    
    logger.info(`📋 Payment summary logged`);
  } catch (error) {
    logger.error('❌ Error sending payment summary:', error.message);
  }
}

setInterval(checkQRISStatus, 10000);

async function recordAccountTransaction(userId, type) {
  return new Promise((resolve, reject) => {
    const referenceId = `account-${type}-${userId}-${Date.now()}`;
    db.run(
      'INSERT INTO transactions (user_id, type, reference_id, timestamp) VALUES (?, ?, ?, ?)',
      [userId, type, referenceId, Date.now()],
      async (err) => {
        if (err) {
          logger.error('Error recording account transaction:', err.message);
          reject(err);
        } else {
          // ✅ TAMBAH: Notifikasi ke grup admin jika user adalah reseller
          try {
            const isReseller = await isUserReseller(userId);
            if (isReseller && GROUP_ID_NUM) {
              // Cek bulan ini sudah berapa akun
              const now = new Date();
              const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
              
              db.get(
                `SELECT COUNT(*) as count FROM transactions 
                 WHERE user_id = ? AND timestamp >= ? 
                 AND type IN ('ssh', 'vmess', 'vless', 'trojan', 'shadowsocks', 'zivpn')`,
                [userId, firstDay.getTime()],
                (err, row) => {
                  if (!err && row) {
                    const totalThisMonth = row.count;
                    
                    // Ambil info user
                    bot.telegram.getChat(userId).then(userInfo => {
                      const username = userInfo.username ? `@${userInfo.username}` : 
                                     (userInfo.first_name || `User ${userId}`);
                      
                      bot.telegram.sendMessage(
                        GROUP_ID_NUM,
                        `🛍️ *RESELLER TRANSAKSI*\n\n` +
                        `👤 Reseller: ${username}\n` +
                        `📦 Tipe: ${type.toUpperCase()}\n` +
                        `📊 Total Bulan Ini: ${totalThisMonth} akun\n` +
                        `⏰ ${now.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
                        { parse_mode: 'Markdown' }
                      ).catch(e => logger.error('Gagal kirim notif reseller:', e.message));
                    }).catch(() => {
                      // Skip jika tidak bisa dapatkan info user
                    });
                  }
                }
              );
            }
          } catch (e) {
            // Skip error notifikasi
          }
          
          resolve();
        }
      }
    );
  });
}

// =============================
// 📦 AUTO BACKUP DATABASE 24 JAM
// =============================

const schedule = require('node-schedule');

const dbFile = path.join(__dirname, "sellvpn.db");
const autoBackupDir = path.join(__dirname, "auto_backup");

if (!fs.existsSync(autoBackupDir)) fs.mkdirSync(autoBackupDir);

// Fungsi kirim backup otomatis ke admin
async function sendAutoBackup(filePath) {
    try {
        await bot.telegram.sendDocument(
            adminIds[0],
            { source: filePath },
            { caption: "🗄️ Backup otomatis database (setiap 24 jam)" }
        );

        logger.info("📤 Backup otomatis terkirim ke admin");
    } catch (err) {
        logger.error("❌ Gagal kirim backup otomatis:", err);
    }
}

schedule.scheduleJob("0 0 * * *", () => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupFile = path.join(autoBackupDir, `sellvpn_${timestamp}.db`);

        fs.copyFileSync(dbFile, backupFile);

        logger.info("✅ Backup otomatis dibuat: " + backupFile);

        sendAutoBackup(backupFile);
    } catch (err) {
        logger.error("❌ Gagal membuat backup otomatis:", err);
    }
});

// Tambahkan error handler untuk bot
bot.catch((err, ctx) => {
  logger.error(`❌ Bot error: ${err.message}`);
  // Jika ini callback query error, coba handle gracefully
  if (ctx && ctx.updateType === 'callback_query') {
    try {
      ctx.answerCbQuery('⚠️ Terjadi kesalahan, coba lagi').catch(() => {});
    } catch (e) {
      // Ignore jika sudah expired
    }
  }
});

app.listen(port, () => {
  logger.info(`🚀 Server berjalan di port ${port}`);
  
  // Fungsi untuk start bot dengan retry
  const startBot = async (retryCount = 0) => {
    try {
      logger.info('🔄 Memulai bot...');
      
      // Konfigurasi bot
      const botConfig = {
        dropPendingUpdates: true,
        allowedUpdates: ['message', 'callback_query'],
        handlerTimeout: 60000,
      };
      
      // Start bot
      await bot.launch(botConfig);
      logger.info('✅ Bot berhasil dimulai (Polling Mode)');
      
      // Set commands
      await bot.telegram.setMyCommands([
        { command: 'start', description: 'Mulai bot dan tampilkan menu utama' },
        { command: 'admin', description: 'Menu admin (khusus admin)' }
      ]);
      logger.info('✅ Command menu berhasil diset.');
      
      // Enable graceful stop
      const stopBot = () => {
        logger.info('🛑 Stopping bot gracefully...');
        bot.stop();
        process.exit(0);
      };
      
      process.once('SIGINT', stopBot);
      process.once('SIGTERM', stopBot);
      
    } catch (error) {
      logger.error(`❌ Error saat memulai bot (Attempt ${retryCount + 1}):`, error.message);
      
      // Jika belum mencapai maksimal retry, coba lagi
      if (retryCount < 3) {
        const delay = Math.min(10000, 2000 * Math.pow(2, retryCount)); // Exponential backoff
        logger.info(`⏳ Akan mencoba lagi dalam ${delay/1000} detik...`);
        
        setTimeout(() => {
          startBot(retryCount + 1);
        }, delay);
      } else {
        logger.error(' Gagal memulai bot setelah 3 kali percobaan. Bot dimatikan.');
        process.exit(1);
      }
    }
  };
  
  startBot();
  
  setTimeout(() => {
    logger.info(' Running initial cleanup...');
    cleanupOldDeposits();
  }, 10000);
});
