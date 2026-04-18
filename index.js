const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const readline = require('readline');

// Simple input function
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

// Auto-load all cogs (files starting with letter + ending with .js)
const cogs = new Map();
const cogFiles = fs.readdirSync('./cogs').filter(f => /^[a-zA-Z].*\.js$/.test(f));

for (const file of cogFiles) {
    const cog = require(`./cogs/${file}`);
    cogs.set(cog.name, cog);
    console.log(`✅ Loaded cog: ${cog.name}`);
}
console.log(`📦 Total cogs loaded: ${cogs.size}\n`);

// Bot settings (edit these or change via commands later)
let prefix = '!';
let botName = 'Endroid Bot';

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        // Get pairing code
        if (connection === 'connecting' && !sock.authState.creds.registered) {
            const number = await ask('📱 Enter your phone number (country code + number, no + or spaces): ');
            const clean = number.replace(/\D/g, '');
            console.log('🔑 Requesting pairing code...');
            const code = await sock.requestPairingCode(clean);
            console.log(`\n⭐ YOUR PAIRING CODE: ${code} ⭐`);
            console.log('📲 Go to WhatsApp > Settings > Linked Devices > Link with phone number instead\n');
        }
        
        if (connection === 'open') {
            console.log('✅ Bot connected! Ready to use.');
            rl.close();
        }
        
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            if (reason !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconnecting...');
                start();
            } else {
                console.log('❌ Logged out. Delete "auth" folder and restart.');
            }
        }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;
        
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        if (!text || !text.startsWith(prefix)) return;
        
        const args = text.slice(prefix.length).trim().split(/\s+/);
        const command = args.shift().toLowerCase();
        
        if (cogs.has(command)) {
            try {
                await cogs.get(command).run(sock, msg, args, { prefix, botName });
            } catch (err) {
                console.error('Command error:', err);
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Error executing command' });
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Create cogs folder if it doesn't exist
if (!fs.existsSync('./cogs')) fs.mkdirSync('./cogs');
start();
