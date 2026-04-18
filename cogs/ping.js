module.exports = {
    name: 'ping',
    run: async (sock, msg, args, config) => {
        const start = Date.now();
        await sock.sendMessage(msg.key.remoteJid, { text: '🏓 Pong!' });
        const end = Date.now();
        await sock.sendMessage(msg.key.remoteJid, { text: `⚡ ${end - start}ms` });
    }
};
