
require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || "v26.0";

const menuPrincipal = `¡Hola! 👋
Bienvenido al asistente virtual de UPEA TV 📺

¿En qué podemos ayudarte?

1. 📡 Programación y horarios
2. 📰 Noticias y novedades
3. 🎬 Nuestros programas
4. 📍 Ubicación y contacto
5. 💬 Atención al usuario

Escribe el número o el nombre de una opción.

Escribe MENU para regresar al inicio.`;

const respuestas = {
  programacion: `📡 PROGRAMACIÓN Y HORARIOS
UPEA TV

Estos horarios son ficticios y sirven únicamente para probar el chatbot.

🕗 08:00 - Noticias de la mañana
🕙 10:00 - Revista universitaria
🕛 12:00 - Resumen informativo
🕒 15:00 - Cultura y sociedad
🕕 18:00 - Actualidad universitaria
🕗 20:00 - Noticias de la noche

Los horarios reales se incorporarán posteriormente.

Escribe MENU para volver al inicio.`,

  noticias: `📰 NOTICIAS Y NOVEDADES

Bienvenido a la sección informativa de UPEA TV.

Aquí podrás consultar:
• Noticias universitarias
• Información educativa
• Actualidad de El Alto
• Cultura y acontecimientos sociales

Esta es una descripción de demostración. Las noticias reales se incorporarán posteriormente.

Escribe MENU para volver al inicio.`,

  programas: `🎬 PROGRAMAS DE UPEA TV

Estos son nombres de ejemplo para la demostración:

1. UPEA Noticias
2. Revista Universitaria
3. Cultura Viva
4. Jóvenes en Acción
5. Deportes Universitarios

Los nombres son ficticios y pueden cambiarse cuando tengas la programación oficial.

Escribe MENU para volver al inicio.`,

  contacto: `📍 UBICACIÓN Y CONTACTO

UPEA TV
Canal de televisión de temática universitaria.

Información disponible para completar:
• Dirección: pendiente de confirmar
• Teléfono: pendiente de confirmar
• Facebook: pendiente de confirmar
• YouTube: pendiente de confirmar
• Horarios de atención: pendiente de confirmar

No se muestran datos de contacto ficticios para evitar confusiones.

Escribe MENU para volver al inicio.`,

  atencion: `💬 ATENCIÓN AL USUARIO

Gracias por comunicarte con UPEA TV.

Puedes escribir tu consulta en este chat. Por el momento, el sistema registra el mensaje, pero no transfiere automáticamente la conversación a un administrador.

Escribe MENU para volver al inicio.`
};

function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:]+$/g, "");
}

function obtenerRespuesta(texto) {
  const mensaje = normalizar(texto);

  if (
    ["hola", "hi", "hello", "buenas", "buenos dias",
     "buenas tardes", "buenas noches", "menu", "inicio",
     "volver", "principal", "0"].includes(mensaje)
  ) {
    return menuPrincipal;
  }

  if (
    ["1", "programacion", "horarios", "horario"].includes(mensaje)
  ) {
    return respuestas.programacion;
  }

  if (
    ["2", "noticias", "novedades", "informacion"].includes(mensaje)
  ) {
    return respuestas.noticias;
  }

  if (
    ["3", "programas", "programa", "television"].includes(mensaje)
  ) {
    return respuestas.programas;
  }

  if (
    ["4", "contacto", "ubicacion", "direccion", "redes"].includes(mensaje)
  ) {
    return respuestas.contacto;
  }

  if (
    ["5", "atencion", "administrador", "ayuda", "consulta"].includes(mensaje)
  ) {
    return respuestas.atencion;
  }

  return `No pude identificar tu consulta. 🤔

Puedes escribir una de estas opciones:

1. Programación y horarios
2. Noticias y novedades
3. Nuestros programas
4. Ubicación y contacto
5. Atención al usuario

Escribe MENU para regresar al inicio.`;
}

async function guardarMensaje(numero, tipo, mensaje) {
  try {
    await pool.query(
      `INSERT INTO mensajes_whatsapp
       (numero_usuario, tipo, mensaje)
       VALUES ($1, $2, $3)`,
      [numero, tipo, mensaje]
    );
  } catch (error) {
    console.error("Error al guardar mensaje:", error.message);
  }
}

async function prepararBaseDatos() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS mensajes_whatsapp (
        id BIGSERIAL PRIMARY KEY,
        numero_usuario VARCHAR(30) NOT NULL,
        tipo VARCHAR(10) NOT NULL,
        mensaje TEXT NOT NULL,
        fecha TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("Tabla de mensajes lista");
  } catch (error) {
    console.error("Error al preparar la base de datos:", error.message);
  }
}

async function enviarWhatsApp(numero, mensaje) {
  const url =
    `https://graph.facebook.com/${GRAPH_API_VERSION}/` +
    `${PHONE_NUMBER_ID}/messages`;

  const respuesta = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: numero,
      type: "text",
      text: { body: mensaje }
    })
  });

  const resultado = await respuesta.json();

  if (!respuesta.ok) {
    console.error("Error de Meta:", JSON.stringify(resultado));
    throw new Error("No se pudo enviar el mensaje por WhatsApp");
  }

  return resultado;
}

app.get("/", (req, res) => {
  res.send("Chatbot UPEA TV funcionando correctamente");
});

app.get("/db-test", async (req, res) => {
  try {
    const resultado = await pool.query("SELECT NOW() AS fecha");

    res.json({
      conectado: true,
      fecha: resultado.rows[0].fecha
    });
  } catch (error) {
    res.status(500).json({
      conectado: false,
      error: error.message
    });
  }
});

app.get("/webhook", (req, res) => {
  const modo = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const desafio = req.query["hub.challenge"];

  if (modo === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(desafio);
  }

  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  res.sendStatus(200);

  procesarWebhook(req.body).catch(error => {
    console.error("Error procesando webhook:", error.message);
  });
});

async function procesarWebhook(cuerpo) {
  for (const entrada of cuerpo.entry || []) {
    for (const cambio of entrada.changes || []) {
      const datos = cambio.value;

      for (const mensaje of datos.messages || []) {
        if (mensaje.type !== "text") continue;

        const numero = mensaje.from;
        const texto = mensaje.text.body;

        await guardarMensaje(numero, "entrada", texto);

        const respuesta = obtenerRespuesta(texto);

        try {
          await enviarWhatsApp(numero, respuesta);
          await guardarMensaje(numero, "salida", respuesta);
        } catch (error) {
          console.error(
            "Error respondiendo a WhatsApp:",
            error.message
          );
        }
      }
    }
  }
}

const PORT = process.env.PORT || 3000;

prepararBaseDatos();

app.listen(PORT, () => {
  console.log(`Servidor funcionando en el puerto ${PORT}`);
});
