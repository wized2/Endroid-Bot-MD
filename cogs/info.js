module.exports = {
    name: 'info',
    run: async (sock, msg, args, config) => {
        const text = `🤖 *Bot Info*
┌─────────────────
│ Name: ${config.botName}
│ Prefix: ${config.prefix}
│ Commands: ping, info
└─────────────────`;
        await sock.sendMessage(msg.key.remoteJid, { text });
    }
};
