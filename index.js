const {
  default: Baileys,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const { imageSync } = require("qr-image");
const { Boom } = require("@hapi/boom");
const express = require("express");
const fs = require("fs-extra");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const xlsx = require("xlsx");

const app = express();
const port = 8000;
const verification = new Map();

app.set("json spaces", 2);
app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, file.originalname),
});

const upload = multer({ storage });
let workbook;

const verifyPhoneNumber = async (phoneNumber, currentUrl) => {
  try {
    const response = await axios.get(`${currentUrl}/verifyNumber`, {
      params: { phone: phoneNumber },
    });
    return response.data ? "WhatsApp Number" : "Not a WhatsApp Number";
  } catch (error) {
    console.error("Error verifying phone number:", error);
    return "Verification Error";
  }
};

app.post("/upload", upload.single("xlsxFile"), async (req, res) => {
  console.log("uploading...");
  if (!req.file) {
    return res.status(400).send("No file uploaded");
  }

  workbook = xlsx.readFile(`uploads/${req.file.filename.replace("'", "")}`);
  const sheet_name_list = workbook.SheetNames;
  const xlData = xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]);
  xlData.forEach((row) => (row["status"] = ""));

  const currentUrl = `https://spanel.tekcify.com`;
  for (let i = 0; i < xlData.length; i++) {
    const row = xlData[i];
    console.log(row);
    if (!row.hasOwnProperty("Number")) {
      return res
        .status(400)
        .send("Error: Missing 'Number' column in the uploaded file");
    }
    const phoneNumber = "65" + row["Number"];
    xlData[i]["status"] = await verifyPhoneNumber(phoneNumber, currentUrl);
  }

  const newSheet = xlsx.utils.json_to_sheet(xlData);
  const newWorkbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(newWorkbook, newSheet, "Sheet1");

  if (sheet_name_list.length > 1) {
    const xlData2 = xlsx.utils.sheet_to_json(
      workbook.Sheets[sheet_name_list[1]]
    );
    xlData2.forEach((row) => (row["status"] = ""));
    for (let i = 0; i < xlData2.length; i++) {
      const phoneNumber = "65" + xlData2[i]["Number"];
      xlData2[i]["status"] = await verifyPhoneNumber(phoneNumber, currentUrl);
    }
    const newSheet2 = xlsx.utils.json_to_sheet(xlData2);
    xlsx.utils.book_append_sheet(newWorkbook, newSheet2, "Sheet2");
  }

  try {
    xlsx.writeFile(newWorkbook, `uploads/updated_file.xlsx`);
    res.send("File uploaded successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send(`Error writing the file ${err}`);
  }
});

app.delete("/deleteFiles", (req, res) => {
  fs.readdir("uploads", (err, files) => {
    if (err) {
      console.error("Error reading uploads folder:", err);
      return res.status(500).send("Error reading uploads folder");
    }

    const filesToDelete = files.filter((file) => file !== "update_file.xlsx");
    Promise.all(filesToDelete.map((file) => fs.unlink(`uploads/${file}`)))
      .then(() => {
        console.log("Files deleted successfully");
        res.status(200).send("Files deleted successfully");
      })
      .catch((err) => {
        console.error("Error deleting files:", err);
        res.status(500).send("Error deleting files");
      });
  });
});

app.get("/progress", (req, res) => {
  const sheet_name_list = workbook.SheetNames;
  const sheet1Data = xlsx.utils.sheet_to_json(
    workbook.Sheets[sheet_name_list[0]]
  );
  let sheet2Data = [];
  if (sheet_name_list.length > 1) {
    sheet2Data = xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[1]]);
  }

  const xlData = [...sheet1Data, ...sheet2Data];
  const totalRows = xlData.length;
  const totalChecked = xlData.filter((row) => row.status !== "").length;

  console.log(`${totalChecked}/${totalRows}`);
  const progress = (totalChecked / totalRows) * 100;
  res.json({ totalRows, totalChecked, progress });
});

app.get("/download", (req, res) => {
  const filePath = __dirname + "/uploads/updated_file.xlsx";
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.send("File not found");
  }
});

const start = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const client = Baileys({
    version: (await fetchLatestBaileysVersion()).version,
    printQRInTerminal: true,
    auth: state,
    logger: P({ level: "fatal" }),
    browser: ["AuthGuard-Bot", "fatal", "1.0.0"],
  });

  client.session = "123";

  client.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (update.qr) {
      console.log(
        `QR code generated. Scan it to continue | You can also authenticate in http://localhost:${port}`
      );
      client.QR = imageSync(update.qr);
    }
    if (connection === "close") {
      const { statusCode } = new Boom(lastDisconnect?.error).output;
      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("Reconnecting...");
        setTimeout(start, 3000);
      } else {
        console.log("Disconnected.");
        fs.removeSync("session");
        console.log("Starting...");
        setTimeout(start, 3000);
      }
    }
    if (connection === "connecting") {
      client.condition = "connecting";
      console.log("Connecting to WhatsApp...");
    }
    if (connection === "open") {
      client.condition = "connected";
      console.log("Connected to WhatsApp");
    }
  });

  const correctJid = (str) =>
    (/\d/.test(str) ? str.replace(/\D/g, "") : 123) + "@s.whatsapp.net";
  const validWhatsApp = async (phone) =>
    (await client.onWhatsApp(phone))[0]?.exists || false;

  app.get("/wa/qr", async (req, res) => {
    const { session } = req.query;
    if (!session || !client || client.session !== req.query.session) {
      return res
        .status(404)
        .setHeader("Content-Type", "text/plain")
        .send("Invalid Session")
        .end();
    }
    if (!client || !client.QR) {
      return res
        .status(404)
        .setHeader("Content-Type", "text/plain")
        .send(
          client.condition === "connected"
            ? "You are already connected to WhatsApp"
            : "QR not generated"
        )
        .end();
    }
    res.status(200).contentType("image/png").send(client.QR);
  });

  app.all("/verifyNumber", async (req, res) => {
    const { phone } = req.method === "GET" ? req.query : req.body;
    if (!phone) return res.sendStatus(404);
    const jid = correctJid(phone);
    const valid = await validWhatsApp(jid);
    res.json(valid);
  });

  app.all("*", (req, res) => res.sendStatus(404));

  client.ev.on("creds.update", saveCreds);
  return client;
};

start();
app.listen(port, () =>
  console.log(`Server started on PORT: http://localhost:${port}`)
);
