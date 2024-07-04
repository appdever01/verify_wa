import { Client } from "whatsapp-web.js";
const client = new Client({
  // client configuration if any
});
const isNumberOnWhatsapp = async (number) => {
  return await client.isRegisteredUser(number);
};

client.initialize();
isNumberOnWhatsapp("2347049972537");
