const { Telegraf, Markup } = require('telegraf');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const express = require('express'); // <-- Tambahkan ini
const bodyParser = require('body-parser'); // <-- Tambahkan ini

// --- START: Konfigurasi Firebase Admin SDK ---
const serviceAccountPath = path.resolve(__dirname, './server.json');
let serviceAccount;
try {
    serviceAccount = require(serviceAccountPath);
} catch (error) {
    console.error(`ERROR: Gagal memuat file serviceAccount.json dari ${serviceAccountPath}. Pastikan file ada dan formatnya benar.`);
    console.error(error);
    process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const auth = admin.auth();
// --- END: Konfigurasi Firebase Admin SDK ---


// --- START: Konfigurasi Bot Telegram dan CONFIG yang Bisa Diubah Owner ---
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN); // Ambil token dari environment variable

let CONFIG = {
    PAYMENT_API_BASE_URL: 'https://restapi-v2.simplebot.my.id/orderkuota',
    PAYMENT_API_KEY: 'new2025',
    PAYMENT_MERCHANT_ID: 'OK1579395',
    PAYMENT_QR_CODE_PARAM: '00020101021126670016COM.NOBUBANK.WWW01189360050300000879140214722594423275930303UMI51440014ID.CO.QRIS.WWW0215ID20243153071140303UMI5204541153033605802ID5922SISURYA SHOP OK15793956012LOMBOK TIMUR61058361162070703A016304AF59',
    PAYMENT_KEY_ORKUT: '968785117445314511579395OKCTEBEE6DBC7D3CC3677BD4CBBCA1854AE3',
    PRODUCT_NAME: "Surxrat Private v1.4",
    PRODUCT_PRICE: 1,
    ADMIN_FEE_MIN: 1,
    ADMIN_FEE_MAX: 3,
    DEFAULT_ACCOUNT_PASSWORD: "sisurya",
    DEFAULT_WARRANTY_CODE_PREFIX: "SRXWEB#",
    OWNER_TELEGRAM_CHAT_ID: "7570665912", // Pastikan ini ID owner yang benar!
    DOWNLOAD_URL: "https://chat.whatsapp.com/Dl9EZ5q7gebBkUYVwhq85U",
    YOUTUBE_TUTORIAL_URL: "https://youtube.com/shorts/AcZ2lk46Y_Q?si=uNdWRaihUPZLsxA5",
    OWNER_WHATSAPP_NUMBER: "62881037506097",
    OWNER_WHATSAPP_MESSAGE: "Halo, saya tertarik dengan Surxrat dan butuh bantuan.",
    OWNER_TELEGRAM_USERNAME: "sisuryaofficialkuu",
    WELCOME_PHOTO_PATH: './app.jpg',
    WELCOME_CAPTION: 'Selamat datang di bot order Surxrat otomatis!',
    PAYMENT_SUCCESS_PHOTO_PATH: './done.jpg',
    // --- Perubahan Caption Pembayaran Berhasil ---
    PAYMENT_SUCCESS_CAPTION: `
Pembayaran berhasil ✅

Silakan buat username untuk login Surxrat Anda.
Anda hanya dapat menggunakan huruf dan angka saja:
- Tanpa spasi
- Tanpa karakter spesial

Username usahakan yang susah tapi mudah diingat ya 😊

Silakan ketik username yang Anda inginkan:
`
};

const CONFIG_FILE = path.resolve(__dirname, './bot_config.json');

async function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            const loadedConfig = JSON.parse(data);
            CONFIG = { ...CONFIG, ...loadedConfig };
            console.log('Konfigurasi berhasil dimuat dari bot_config.json');
        } else {
            await saveConfig();
            console.log('bot_config.json tidak ditemukan, membuat file dengan konfigurasi default.');
        }
    } catch (error) {
        console.error('Gagal memuat konfigurasi:', error);
    }
}

async function saveConfig() {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG, null, 2), 'utf8');
        console.log('Konfigurasi berhasil disimpan ke bot_config.json');
    } catch (error) {
        console.error('Gagal menyimpan konfigurasi:', error);
    }
}

const userStates = {};

const isOwner = (ctx, next) => {
    if (ctx.from.id == CONFIG.OWNER_TELEGRAM_CHAT_ID) {
        return next();
    }
    ctx.reply('Maaf, perintah ini hanya untuk owner bot.');
};

// --- END: Konfigurasi Bot Telegram dan CONFIG yang Bisa Diubah Owner ---


// --- START: Perintah Utama Bot ---
bot.start(async (ctx) => {
    const welcomePhotoPath = path.resolve(__dirname, CONFIG.WELCOME_PHOTO_PATH);

    const commonKeyboard = [
        [Markup.button.callback('🛒 Beli Sekarang', 'beli_sekarang')],
        [Markup.button.callback('❓ Tutorial', 'tutorial'), Markup.button.callback('⬇️ Download', 'download')],
        [Markup.button.callback('📞 Kontak', 'kontak')]
    ];

    if (ctx.from.id == CONFIG.OWNER_TELEGRAM_CHAT_ID) {
        commonKeyboard.push([Markup.button.callback('⚙️ Panel Admin', 'admin_panel')]);
    }

    if (fs.existsSync(welcomePhotoPath)) {
        await ctx.replyWithPhoto({ source: welcomePhotoPath }, {
            caption: CONFIG.WELCOME_CAPTION,
            ...Markup.inlineKeyboard(commonKeyboard)
        });
    } else {
        await ctx.reply(CONFIG.WELCOME_CAPTION, {
            ...Markup.inlineKeyboard(commonKeyboard)
        });
        console.warn(`File foto selamat datang tidak ditemukan: ${welcomePhotoPath}`);
    }
});

bot.action('beli_sekarang', async (ctx) => {
    if (ctx.callbackQuery.message) {
        try {
            await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        } catch (error) {
            console.error("Gagal menghapus pesan tombol utama:", error);
        }
    }

    const adminFee = Math.floor(Math.random() * (CONFIG.ADMIN_FEE_MAX - CONFIG.ADMIN_FEE_MIN + 1)) + CONFIG.ADMIN_FEE_MIN;
    const totalAmount = CONFIG.PRODUCT_PRICE + adminFee;

    await ctx.reply('Membuat QRIS untuk pembayaran Anda, mohon tunggu...');

    try {
        const url = `${CONFIG.PAYMENT_API_BASE_URL}/createpayment?apikey=${CONFIG.PAYMENT_API_KEY}&amount=${totalAmount}&codeqr=${encodeURIComponent(CONFIG.PAYMENT_QR_CODE_PARAM)}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status) {
            const transactionId = data.result.idtransaksi;
            const qrUrl = data.result.imageqris.url;
            const expiredTime = new Date(data.result.expired).toISOString();

            userStates[ctx.from.id] = {
                step: 'waiting_payment',
                transactionId,
                amount: CONFIG.PRODUCT_PRICE,
                adminFee,
                totalAmount,
                qrUrl,
                expiredTime,
                paymentConfirmed: false
            };

            const qrMessage = await ctx.replyWithPhoto(qrUrl, {
                caption: `
*Pindai untuk Pembayaran*
Harga: ${formatRupiah(CONFIG.PRODUCT_PRICE)}
Biaya Admin: ${formatRupiah(adminFee)}
*Total: ${formatRupiah(totalAmount)}*

Sisa Waktu: Anda punya waktu sampai ${new Date(expiredTime).toLocaleTimeString('id-ID')} untuk membayar.

Tekan 'Refresh Status' setelah membayar.`,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('Refresh Status Pembayaran', `refresh_payment_${transactionId}`)],
                    [Markup.button.callback('Batalkan Pembayaran', `cancel_payment_${transactionId}`)]
                ])
            });

            userStates[ctx.from.id].qrMessageId = qrMessage.message_id;

            startPaymentPolling(ctx.from.id, transactionId, totalAmount);

        } else {
            await ctx.reply(`Gagal membuat QRIS: ${data.message || 'Error tidak dikenal.'}`);
        }
    } catch (error) {
        console.error("Error creating QRIS:", error);
        await ctx.reply('Terjadi kesalahan saat mencoba membuat pembayaran.');
    }
});

bot.action(/refresh_payment_(.+)/, async (ctx) => {
    const transactionId = ctx.match[1];
    const userState = userStates[ctx.from.id];

    if (!userState || userState.transactionId !== transactionId) {
        return ctx.reply('Sesi pembayaran tidak valid atau sudah berakhir.');
    }

    await ctx.reply('Mengecek status pembayaran Anda, mohon tunggu...');
    await performPaymentCheck(ctx, userState);
});

bot.action(/cancel_payment_(.+)/, async (ctx) => {
    const transactionId = ctx.match[1];
    const userState = userStates[ctx.from.id];

    if (userState && userState.transactionId === transactionId) {
        if (userState.pollingInterval) {
            clearInterval(userState.pollingInterval);
        }

        if (userState.qrMessageId) {
            try {
                await ctx.deleteMessage(userState.qrMessageId);
            } catch (err) {
                console.error("Gagal menghapus pesan QRIS:", err);
            }
        }
        
        delete userStates[ctx.from.id];
        await ctx.reply('Sesi pembayaran Anda telah dibatalkan.');
    } else {
        await ctx.reply('Tidak ada sesi pembayaran aktif yang bisa dibatalkan.');
    }
});

bot.action('tutorial', async (ctx) => {
    await ctx.reply(`
*Cara Order Surxrat:*

Ikuti langkah-langkah mudah berikut untuk melakukan pembelian:
1.  Klik "Beli Sekarang".
2.  Pindai QRIS menggunakan e-wallet atau m-banking Anda.
3.  Selesaikan pembayaran.
4.  Kirim username yang diinginkan dan nomor kontak saat diminta oleh bot.
5.  Akun Anda akan dibuat dan detailnya akan ditampilkan.
        `, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('▶️ Video Tutorial', CONFIG.YOUTUBE_TUTORIAL_URL)]
            ])
        });
});

bot.action('download', async (ctx) => {
    if (CONFIG.DOWNLOAD_URL) {
        await ctx.reply(`Link download aplikasi Surxrat: ${CONFIG.DOWNLOAD_URL}`);
    } else {
        await ctx.reply('Link download belum diatur oleh admin.');
    }
});

bot.action('kontak', async (ctx) => {
    await ctx.reply(`
*Kontak Owner*

Jika Anda memerlukan bantuan atau memiliki pertanyaan, jangan ragu untuk menghubungi kami:
        `, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url('📞 WhatsApp', `https://wa.me/${CONFIG.OWNER_WHATSAPP_NUMBER}?text=${encodeURIComponent(CONFIG.OWNER_WHATSAPP_MESSAGE)}`)],
                [Markup.button.url('✈️ Telegram', `https://t.me/${CONFIG.OWNER_TELEGRAM_USERNAME}`)]
            ])
        });
});

// --- END: Perintah Utama Bot ---


// --- START: Fungsi Pembayaran & Akun ---
async function performPaymentCheck(ctx, userState) {
    const url = `${CONFIG.PAYMENT_API_BASE_URL}/cekstatus?apikey=${CONFIG.PAYMENT_API_KEY}&merchant=${CONFIG.PAYMENT_MERCHANT_ID}&keyorkut=${CONFIG.PAYMENT_KEY_ORKUT}`;
    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.status && data.result && parseInt(data.result.amount) === userState.totalAmount) {
            userState.paymentConfirmed = true;
            clearInterval(userState.pollingInterval);

            if (userState.qrMessageId) {
                try {
                    await ctx.deleteMessage(userState.qrMessageId);
                } catch (err) {
                    console.error("Gagal menghapus pesan QRIS setelah sukses:", err);
                }
            }

            userStates[ctx.from.id] = { ...userState, step: 'waiting_username' };
            const successPhotoPath = path.resolve(__dirname, CONFIG.PAYMENT_SUCCESS_PHOTO_PATH);
            if (fs.existsSync(successPhotoPath)) {
                await ctx.replyWithPhoto({ source: successPhotoPath }, {
                    caption: CONFIG.PAYMENT_SUCCESS_CAPTION,
                });
            } else {
                await ctx.reply(CONFIG.PAYMENT_SUCCESS_CAPTION + ' (Catatan: Foto konfirmasi pembayaran tidak ditemukan: ' + CONFIG.PAYMENT_SUCCESS_PHOTO_PATH + ')');
                console.warn(`File foto konfirmasi pembayaran tidak ditemukan: ${successPhotoPath}`);
            }
        } else {
            await ctx.reply('Pembayaran belum terdeteksi. Silakan coba lagi nanti atau pastikan Anda sudah membayar.');
        }
    } catch (error) {
        console.error("Payment check error:", error);
        await ctx.reply('Gagal memeriksa status pembayaran. Mohon coba lagi.');
    }
}

function startPaymentPolling(userId, transactionId, expectedAmount) {
    if (userStates[userId].pollingInterval) clearInterval(userStates[userId].pollingInterval);

    userStates[userId].pollingInterval = setInterval(async () => {
        const currentUserState = userStates[userId];

        if (currentUserState && currentUserState.transactionId === transactionId && !currentUserState.paymentConfirmed) {
            if (new Date(currentUserState.expiredTime) < new Date()) {
                clearInterval(currentUserState.pollingInterval);
                if (currentUserState.qrMessageId) {
                    try {
                        await bot.telegram.deleteMessage(userId, currentUserState.qrMessageId);
                    } catch (err) {
                        console.error("Gagal menghapus pesan QRIS saat expired:", err);
                    }
                }
                bot.telegram.sendMessage(userId, 'Waktu pembayaran telah habis. Sesi dibatalkan.');
                delete userStates[userId];
                return;
            }

            const url = `${CONFIG.PAYMENT_API_BASE_URL}/cekstatus?apikey=${CONFIG.PAYMENT_API_KEY}&merchant=${CONFIG.PAYMENT_MERCHANT_ID}&keyorkut=${CONFIG.PAYMENT_KEY_ORKUT}`;
            try {
                const response = await fetch(url);
                const data = await response.json();
                if (data.status && data.result && parseInt(data.result.amount) === expectedAmount) {
                    currentUserState.paymentConfirmed = true;
                    clearInterval(currentUserState.pollingInterval);
                    if (currentUserState.qrMessageId) {
                        try {
                            await bot.telegram.deleteMessage(userId, currentUserState.qrMessageId);
                        } catch (err) {
                            console.error("Gagal menghapus pesan QRIS saat background sukses:", err);
                        }
                    }
                    currentUserState.step = 'waiting_username';
                    const successPhotoPathPolling = path.resolve(__dirname, CONFIG.PAYMENT_SUCCESS_PHOTO_PATH);
                    if (fs.existsSync(successPhotoPathPolling)) {
                        await bot.telegram.sendPhoto(userId, { source: successPhotoPathPolling }, {
                            caption: CONFIG.PAYMENT_SUCCESS_CAPTION,
                        });
                    } else {
                        await bot.telegram.sendMessage(userId, CONFIG.PAYMENT_SUCCESS_CAPTION + ' (Catatan: Foto konfirmasi pembayaran tidak ditemukan: ' + CONFIG.PAYMENT_SUCCESS_PHOTO_PATH + ')');
                        console.warn(`File foto konfirmasi pembayaran tidak ditemukan: ${successPhotoPathPolling}`);
                    }
                }
            } catch (error) {
                console.error("Background payment check error:", error);
            }
        } else if (currentUserState && currentUserState.paymentConfirmed) {
            clearInterval(userStates[userId].pollingInterval);
        } else if (!currentUserState) {
            clearInterval(userStates[userId].pollingInterval);
        }
    }, 15000);
}

// Menangani input teks dari pengguna (untuk username dan kontak)
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const userState = userStates[userId];

    // --- START: Logic Pengaturan Owner ---
    if (userId == CONFIG.OWNER_TELEGRAM_CHAT_ID && userState && userState.step === 'waiting_for_config_value') {
        const key = userState.configKey;
        let value = ctx.message.text.trim();

        if (['PRODUCT_PRICE', 'ADMIN_FEE_MIN', 'ADMIN_FEE_MAX'].includes(key)) {
            value = parseInt(value);
            if (isNaN(value)) {
                return ctx.reply('Input tidak valid. Harap masukkan angka.');
            }
        }
        
        CONFIG[key] = value;
        await saveConfig();
        delete userStates[userId];

        await ctx.reply(`✅ Nilai *${key}* berhasil diubah menjadi: \`${value}\``, { parse_mode: 'Markdown' });
        return;
    }
    // --- END: Logic Pengaturan Owner ---


    if (userState && userState.step === 'waiting_username') {
        const username = ctx.message.text.toLowerCase();
        if (!/^[a-zA-Z0-9]+$/.test(username)) {
            return ctx.reply('Format username tidak valid. Hanya huruf dan angka. Silakan coba lagi.');
        }

        userState.username = username;
        userState.step = 'waiting_contact_number';
        await ctx.reply('Bagus! Sekarang, kirim nomor WhatsApp/Telegram Anda (misal: 081234567890).');

    } else if (userState && userState.step === 'waiting_contact_number') {
        const contactNumber = ctx.message.text.trim();
        if (!/^\d{10,}$/.test(contactNumber)) {
            return ctx.reply('Format nomor kontak tidak valid. Minimal 10 digit angka. Silakan coba lagi.');
        }

        userState.contactNumber = contactNumber;
        await ctx.reply('Membuat akun Anda, mohon tunggu...');

        try {
            const email = `${userState.username}@gmail.com`;
            let userRecord;
            try {
                userRecord = await auth.createUser({
                    email: email,
                    password: CONFIG.DEFAULT_ACCOUNT_PASSWORD,
                    displayName: userState.username,
                });
            } catch (firebaseError) {
                if (firebaseError.code === 'auth/email-already-in-use') {
                    await ctx.reply('Nama pengguna ini sudah digunakan. Silakan mulai ulang proses pembelian dengan tombol "Beli Sekarang" dan pilih nama pengguna lain.');
                    delete userStates[userId];
                    return;
                }
                throw firebaseError;
            }

            const finalTxData = {
                transactionId: userState.transactionId,
                amount: userState.amount,
                adminFee: userState.adminFee,
                totalAmount: userState.totalAmount,
                productName: CONFIG.PRODUCT_NAME,
                username: userState.username, // Username Surxrat
                telegramUsername: ctx.from.username, // Username Telegram
                contactNumber: userState.contactNumber,
                uid: userRecord.uid,
                warrantyCode: `${CONFIG.DEFAULT_WARRANTY_CODE_PREFIX}${Date.now()}`,
                transactionDate: new Date().toISOString(),
                status: 'completed',
                telegramUserId: userId,
            };

            await sendTelegramNotificationToOwner(finalTxData);
            
            await ctx.reply(`
🎉 *Pembelian Berhasil! Akun Anda telah dibuat:* 🎉

*Nama Produk:* ${finalTxData.productName}
*Total Pembayaran:* ${formatRupiah(finalTxData.totalAmount)}
*Username Login Surxrat:* ${finalTxData.username}
*ID Aplikasi:* \`${finalTxData.uid}\`
*Nomor Kontak:* ${finalTxData.contactNumber}
*Kode Garansi:* \`${finalTxData.warrantyCode}\`
*Waktu Transaksi:* ${new Date(finalTxData.transactionDate).toLocaleString('id-ID')}

Silakan simpan informasi ini baik-baik. Kami tidak menyimpan riwayat pembelian Anda.
            `, { parse_mode: 'Markdown' });

            delete userStates[userId];

        } catch (error) {
            console.error("Error creating Firebase account:", error);
            await ctx.reply(`Terjadi kesalahan saat membuat akun Anda: ${error.message}. Mohon coba lagi atau hubungi admin.`);
            delete userStates[userId];
        }
    } else {
        if (!ctx.message.text.startsWith('/')) {
            await ctx.reply('Maaf, saya tidak mengerti. Silakan gunakan tombol atau perintah /start.');
        }
    }
});

// --- END: Fungsi Pembayaran & Akun ---


// --- START: Fungsi Helper ---
function formatRupiah(num) {
    return `Rp${(typeof num === 'number' ? num : 0).toLocaleString('id-ID')}`;
}

async function sendTelegramNotificationToOwner(txData) {
    if (!CONFIG.OWNER_TELEGRAM_CHAT_ID) {
        console.warn("Owner Telegram Chat ID not configured. Skipping notification.");
        return;
    }
    // --- Perubahan Format Notifikasi Owner ---
    const message = `
🔔 *NOTIFIKASI PEMBELIAN BARU!* 🔔

*Status Pembayaran:* ✅ *SUKSES* (Saldo Terdeteksi)
*Produk:* ${txData.productName}
*Total Bayar:* *${formatRupiah(txData.totalAmount)}*

--- Detail Pembeli ---
*Username Telegram:* ${txData.telegramUsername ? `@${txData.telegramUsername}` : 'Tidak Tersedia'}
*ID Telegram:* \`${txData.telegramUserId}\`
*Nomor Kontak:* \`${txData.contactNumber}\`

--- Detail Akun Surxrat ---
*Username Login:* \`${txData.username}\`
*ID Aplikasi:* \`${txData.uid}\`
*Kode Garansi:* \`${txData.warrantyCode}\`
*Waktu Transaksi:* ${new Date(txData.transactionDate).toLocaleString('id-ID')}
    `;
    try {
        await bot.telegram.sendMessage(CONFIG.OWNER_TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error("Gagal mengirim notifikasi Telegram ke owner:", error);
    }
}
// --- END: Fungsi Helper ---


// --- START: Perintah Admin (Owner Only) ---
bot.action('admin_panel', isOwner, async (ctx) => {
     if (ctx.callbackQuery.message) {
        try {
            await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
        } catch (error) {
            console.error("Gagal menghapus pesan start:", error);
        }
    }
    await ctx.reply('Panel Admin:\n\nPilih pengaturan yang ingin diubah:', {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('Set Harga Produk', 'set_product_price')],
            [Markup.button.callback('Set Min Admin Fee', 'set_min_admin_fee'), Markup.button.callback('Set Max Admin Fee', 'set_max_admin_fee')],
            [Markup.button.callback('Set Download URL', 'set_download_url')],
            [Markup.button.callback('Set YouTube Tutorial URL', 'set_youtube_tutorial_url')],
            [Markup.button.callback('Set WA Owner Number', 'set_owner_whatsapp_number')],
            [Markup.button.callback('Set WA Owner Message', 'set_owner_whatsapp_message')],
            [Markup.button.callback('Set Telegram Owner Username', 'set_owner_telegram_username')],
            [Markup.button.callback('Lihat Semua Konfigurasi', 'view_config')]
        ])
    });
});

bot.command('admin', isOwner, async (ctx) => {
    await ctx.reply('Panel Admin:\n\nPilih pengaturan yang ingin diubah:', {
        ...Markup.inlineKeyboard([
            [Markup.button.callback('Set Harga Produk', 'set_product_price')],
            [Markup.button.callback('Set Min Admin Fee', 'set_min_admin_fee'), Markup.button.callback('Set Max Admin Fee', 'set_max_admin_fee')],
            [Markup.button.callback('Set Download URL', 'set_download_url')],
            [Markup.button.callback('Set YouTube Tutorial URL', 'set_youtube_tutorial_url')],
            [Markup.button.callback('Set WA Owner Number', 'set_owner_whatsapp_number')],
            [Markup.button.callback('Set WA Owner Message', 'set_owner_whatsapp_message')],
            [Markup.button.callback('Set Telegram Owner Username', 'set_owner_telegram_username')],
            [Markup.button.callback('Lihat Semua Konfigurasi', 'view_config')]
        ])
    });
});


bot.action('set_product_price', isOwner, async (ctx) => {
    userStates[ctx.from.id] = { step: 'waiting_for_config_value', configKey: 'PRODUCT_PRICE' };
    await ctx.reply(`Masukkan harga produk baru (angka): (Saat ini: ${CONFIG.PRODUCT_PRICE})`);
});
bot.action('set_min_admin_fee', isOwner, async (ctx) => {
    userStates[ctx.from.id] = { step: 'waiting_for_config_value', configKey: 'ADMIN_FEE_MIN' };
    await ctx.reply(`Masukkan biaya admin minimum baru (angka): (Saat ini: ${CONFIG.ADMIN_FEE_MIN})`);
});
bot.action('set_max_admin_fee', isOwner, async (ctx) => {
    userStates[ctx.from.id] = { step: 'waiting_for_config_value', configKey: 'ADMIN_FEE_MAX' };
    await ctx.reply(`Masukkan biaya admin maksimum baru (angka): (Saat ini: ${CONFIG.ADMIN_FEE_MAX})`);
});
bot.action('set_download_url', isOwner, async (ctx) => {
    userStates[ctx.from.id] = { step: 'waiting_for_config_value', configKey: 'DOWNLOAD_URL' };
    await ctx.reply(`Masukkan URL download baru: (Saat ini: ${CONFIG.DOWNLOAD_URL})`);
});
bot.action('set_youtube_tutorial_url', isOwner, async (ctx) => {
    userStates[ctx.from.id] = { step: 'waiting_for_config_value', configKey: 'YOUTUBE_TUTORIAL_URL' };
    await ctx.reply(`Masukkan URL tutorial YouTube baru: (Saat ini: ${CONFIG.YOUTUBE_TUTORIAL_URL})`);
});
bot.action('set_owner_whatsapp_number', isOwner, async (ctx) => {
    userStates[ctx.from.id] = { step: 'waiting_for_config_value', configKey: 'OWNER_WHATSAPP_NUMBER' };
    await ctx.reply(`Masukkan nomor WhatsApp owner baru (format 62xxxxxxxxxxx): (Saat ini: ${CONFIG.OWNER_WHATSAPP_NUMBER})`);
});
bot.action('set_owner_whatsapp_message', isOwner, async (ctx) => {
    userStates[ctx.from.id] = { step: 'waiting_for_config_value', configKey: 'OWNER_WHATSAPP_MESSAGE' };
    await ctx.reply(`Masukkan pesan default WhatsApp owner baru: (Saat ini: ${CONFIG.OWNER_WHATSAPP_MESSAGE})`);
});
bot.action('set_owner_telegram_username', isOwner, async (ctx) => {
    userStates[ctx.from.id] = { step: 'waiting_for_config_value', configKey: 'OWNER_TELEGRAM_USERNAME' };
    await ctx.reply(`Masukkan username Telegram owner baru (tanpa @): (Saat ini: ${CONFIG.OWNER_TELEGRAM_USERNAME})`);
});

bot.action('view_config', isOwner, async (ctx) => {
    let configMessage = '*Konfigurasi Bot Saat Ini:*\n\n';
    for (const key in CONFIG) {
        if (key.includes('KEY') || key.includes('TOKEN') || key.includes('PASSWORD') || key.includes('SERVICE_ACCOUNT') || key.includes('PATH') || key.includes('PARAM')) {
            configMessage += `*${key}:* \`********\`\n`;
        } else {
            configMessage += `*${key}:* \`${CONFIG[key]}\`\n`;
        }
    }
    await ctx.reply(configMessage, { parse_mode: 'Markdown' });
});
// --- END: Perintah Admin ---


// --- Inisialisasi Bot untuk Vercel (Webhook) ---
// Ini akan menjadi entry point utama saat di-deploy ke Vercel
const app = express();
app.use(bodyParser.json());

// Main webhook endpoint
app.post('/webhook', (req, res) => {
    bot.handleUpdate(req.body)
        .then(() => res.sendStatus(200))
        .catch((err) => {
            console.error('Error handling update:', err);
            res.sendStatus(500);
        });
});

// Endpoint untuk mengatur webhook (hanya perlu dijalankan sekali setelah deploy)
app.get('/setwebhook', async (req, res) => {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
        return res.status(400).send('WEBHOOK_URL environment variable is not set.');
    }
    try {
        await bot.telegram.setWebhook(webhookUrl);
        res.send(`Webhook berhasil diatur ke: ${webhookUrl}`);
        console.log(`Webhook berhasil diatur ke: ${webhookUrl}`);
    } catch (error) {
        console.error('Gagal mengatur webhook:', error);
        res.status(500).send(`Gagal mengatur webhook: ${error.message}`);
    }
});

// Endpoint untuk menghapus webhook (opsional, untuk debugging)
app.get('/deletewebhook', async (req, res) => {
    try {
        await bot.telegram.deleteWebhook();
        res.send('Webhook berhasil dihapus.');
        console.log('Webhook berhasil dihapus.');
    } catch (error) {
        console.error('Gagal menghapus webhook:', error);
        res.status(500).send(`Gagal menghapus webhook: ${error.message}`);
    }
});

// Muat konfigurasi saat aplikasi dimulai
(async () => {
    await loadConfig();
    // Di Vercel, server akan otomatis dimulai.
    // Anda tidak perlu memanggil app.listen() di sini jika Anda menggunakan @vercel/node.
    // Vercel akan mengeksekusi file ini sebagai fungsi serverless.
    console.log('Bot siap menerima update via webhook.');
})();

// Export app untuk Vercel
module.exports = app;

// Untuk pengembangan lokal, Anda mungkin ingin menjalankan server secara manual:
// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//     console.log(`Server berjalan di port ${PORT}`);
// });