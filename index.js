const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');
const Pino = require('pino');

// Bot settings
const prefix = '!';
const botName = 'Endroid Bot';

// Load session from environment variable
const sessionBase64 = process.env.SESSION_ID;

if (!sessionBase64) {
    console.error('❌ SESSION_ID environment variable not set!');
    console.error('📋 Generate one using a session generator website or auth.js');
    process.exit(1);
}

// Create auth folder and convert session
if (!fs.existsSync('./auth')) fs.mkdirSync('./auth');

try {
    // Try to parse as-is (in case it's already valid JSON)
    let credsJson;
    if (sessionBase64.startsWith('{')) {
        credsJson = sessionBase64;
    } else {
        // Remove any bot name prefix if present (e.g., "BotName:base64data")
        const cleanBase64 = sessionBase64.includes(':') 
            ? sessionBase64.split(':').pop() 
            : sessionBase64;
        credsJson = Buffer.from(cleanBase64, 'base64').toString('utf-8');
    }
    fs.writeFileSync('./auth/creds.json', credsJson);
    console.log('✅ Session loaded successfully');
} catch (err) {
    console.error('❌ Failed to parse SESSION_ID:', err.message);
    console.error('📋 Make sure you copied the entire session string correctly');
    process.exit(1);
}

// Auto-load all cogs
const cogs = new Map();
if (fs.existsSync('./cogs')) {
    const cogFiles = fs.readdirSync('./cogs').filter(f => /^[a-zA-Z].*\.js$/.test(f));
    for (const file of cogFiles) {
        try {
            const cog = require(`./cogs/${file}`);
            cogs.set(cog.name, cog);
            console.log(`📦 Loaded cog: ${cog.name}`);
        } catch (err) {
            console.error(`❌ Failed to load cog ${file}:`, err.message);
        }
    }
    console.log(`📚 Total cogs loaded: ${cogs.size}\n`);
} else {
    fs.mkdirSync('./cogs');
    console.log('📁 Created "cogs" folder. Add your commands there.\n');
}

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        defaultQueryTimeoutMs: undefined,
        keepAliveIntervalMs: 30000,
        logger: Pino({ level: 'silent' }) // Reduces noise
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (connection === 'open') {
            console.log('\n' + '='.repeat(50));
            console.log(`✅ ${botName} is ONLINE and connected!`);
            console.log(`📱 Prefix: ${prefix}`);
            console.log(`🎯 Commands: ${Array.from(cogs.keys()).join(', ') || 'No cogs loaded'}`);
            console.log(`⏰ Time: ${new Date().toLocaleString()}`);
            console.log('='.repeat(50) + '\n');
            
            // Send a test message to yourself (optional - uncomment if you want)
            // const ownerJid = 'YOUR_NUMBER@s.whatsapp.net';
            // await sock.sendMessage(ownerJid, { text: `🤖 *${botName}* is now online!` });
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode !== DisconnectReason.loggedOut) {
                console.log(`⚠️ Connection closed. Reconnecting in 5 seconds... (Code: ${statusCode})`);
                setTimeout(start, 5000);
            } else {
                console.log('❌ Logged out! Generate a new SESSION_ID.');
                process.exit(1);
            }
        }
        
        if (qr) {
            console.log('📱 QR Code received (should not happen with pairing code)');
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
                console.log(`📨 Command: ${command} from ${msg.key.remoteJid}`);
                await cogs.get(command).run(sock, msg, args, { prefix, botName });
            } catch (err) {
                console.error(`❌ Error in ${command}:`, err);
                await sock.sendMessage(msg.key.remoteJid, { text: '❌ Command failed' }).catch(() => {});
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    process.exit(0);
});

start();
