
require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })
  : null;

app.get("/", (req, res) => {
  res.send("Chatbot UPEA TV funcionando");
});

app.get("/db-test", async (req, res) => {
  if (!pool) {
    return res.status(500).json({
      success: false,
      message: "Falta configurar DATABASE_URL",
    });
  }

  try {
    const result = await pool.query("SELECT NOW() AS fecha");
    res.json({
      success: true,
      message: "Conexión con PostgreSQL correcta",
      fecha: result.rows[0].fecha,
    });
  } catch (error) {
    console.error("Error de PostgreSQL:", error.message);
    res.status(500).json({
      success: false,
      message: "No se pudo conectar con PostgreSQL",
    });
  }
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token === process.env.VERIFY_TOKEN &&
    challenge
  ) {
    console.log("Webhook verificado correctamente");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

async function sendWhatsAppMessage(to, message) {
  const token = process.env.META_ACCESS_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const version = process.env.GRAPH_API_VERSION;

  if (!token || !phoneNumberId || !version) {
    console.error("Faltan variables de configuración de Meta");
    return;
  }

  const url =
    `https://graph.facebook.com/${version}/` +
    `${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: message },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(
      "Meta no pudo enviar el mensaje:",
      JSON.stringify(data)
    );
    return;
  }

  console.log("Respuesta enviada correctamente");
}

app.post("/webhook", (req, res) => {
  const body = req.body;

  // Confirmar la recepción antes de procesar el mensaje.
  res.sendStatus(200);

  if (body.object !== "whatsapp_business_account") {
    return;
  }

  const entries = body.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const messages = value.messages || [];

      for (const message of messages) {
        if (message.type !== "text") {
          continue;
        }

        const from = message.from;
        const text = message.text?.body?.trim() || "";

        if (!from || !text) {
          continue;
        }

        console.log("Mensaje de WhatsApp recibido");

        const reply =
          "¡Hola! Soy el asistente virtual de UPEA TV. " +
          "Puedo ayudarte con información sobre nuestros " +
          "programas, horarios y contacto. ¿Qué deseas consultar?";

        sendWhatsAppMessage(from, reply).catch((error) => {
          console.error("Error procesando el mensaje:", error.message);
        });
      }
    }
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Chatbot UPEA TV activo en el puerto ${PORT}`);
});
