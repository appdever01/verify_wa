const {
  default: Baileys,
  delay,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const { imageSync } = require("qr-image");
const { Boom } = require("@hapi/boom");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());
const P = require("pino");
const start = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const client = Baileys({
    version: (await fetchLatestBaileysVersion()).version,
    printQRInTerminal: true,
    auth: state,
    logger: P({ level: "fatal" }),
    browser: ["TG-WhatsApp", "fatal", "1.0.0"],
  });

  client.ev.on("connection.update", async (update) => {
    if (update.qr) {
      console.log(
        `QR code generated. Scan it to continue | You can also authenticate in http://localhost:3000`
      );
      client.QR = imageSync(update.qr);
    }
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const { statusCode } = new Boom(lastDisconnect?.error).output;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("Connecting...");
        setTimeout(() => start(), 3000);
      } else {
        client.log("Disconnected.", "red");
        await remove("session");
        console.log("Starting...");
        setTimeout(() => start(), 3000);
      }
    }
    if (connection === "connecting") console.log("Connecting to WhatsApp...");
    if (connection === "open") {
      console.log("Connected to WhatsApp");
    }
  });

  client.ev.on("messages.upsert", async ({ messages }) => {
    const formatArgs = (args) => args.slice(1).join(" ").trim();
    const M = messages[0];
    M.from = M.key.remoteJid || "";
    M.sender = M.key.participant || "";
    M.content = M.message?.conversation || "";
    M.reply = (text) => client.sendMessage(M.from, { text }, { quoted: M });
    const args = M.content.split(" ");
    const context = formatArgs(args);
    M.reply("text");
  });

  /**
   * @param {string}
   */

  client.makeWaJid = (str) =>
    (/\d/.test(str) ? str.replace(/\D/g, "") : 123) + "@s.whatsapp.net";

  /**
   * @param {string} phone
   * @returns {boolean}
   */

  client.isWaNumber = async (phone) =>
    (await client.onWhatsApp(phone))[0]?.exists || false;

  const jid = client.makeWaJid("2347049972537");
  const valid = await client.isWaNumber(jid);
  console.log(jid);

  console.log(valid);

  app.get("/", (req, res) =>
    res.status(200).contentType("image/png").send(client.QR)
  );

  client.ev.on("creds.update", saveCreds);
  return client;
};
app.listen(3000, () => {
  console.log(`Server started on PORT : 3000`);
  start();
});
