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

const menuPrincipal = `¡Hola! 👋
Bienvenido al asistente virtual de UPEA TV 📺

¿En qué podemos ayudarte?

1. 📡 Programación y horarios
2. 📰 Noticias y novedades
3. 🎬 Información de programas
4. 📍 Ubicación y contacto
5. 💬 Contactar con un administrador

Escribe el número de la opción que necesitas.`;

function obtenerRespuesta(texto) {
  const opcion = texto.trim().toLowerCase();

  switch (opcion) {
    case "1":
      return `📡 PROGRAMACIÓN Y HORARIOS

Consulta aquí la programación de UPEA TV.

Los horarios actualizados estarán disponibles cuando se incorpore la programación oficial del canal.

Escribe MENU para volver al menú principal.`;

    case "2":
      return `📰 NOTICIAS Y NOVEDADES

Bienvenido a la sección de noticias de UPEA TV.

Próximamente podrás consultar las últimas novedades del canal.

Escribe MENU para volver al menú principal.`;

    case "3":
      return `🎬 PROGRAMAS DE UPEA TV

Aquí podrás consultar información sobre los programas, sus contenidos y horarios.

La información oficial de cada programa se añadirá posteriormente.

Escribe MENU para volver al menú principal.`;

    case "4":
      return `📍 CONTACTO DE UPEA TV

Para mostrar la dirección, los teléfonos y las redes sociales oficiales, debemos registrar los datos confirmados del canal.

Escribe MENU para volver al menú principal.`;

    case "5":
      return `💬 ATENCIÓN AL USUARIO

Has seleccionado contactar con un administrador.

Por el momento, este chatbot no transfiere automáticamente la conversación a una persona. Puedes dejar tu consulta para que se implemente un mecanismo de atención.

Escribe MENU para volver al menú principal.`;

    case "menu":
    case "hola":
    case "buenas":
    case "inicio":
      return menuPrincipal;

    default:
      return `No reconocí esa opción. 🤔

${menuPrincipal}`;
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
  res.send("Chatbot UPEA TV funcionando");
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

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const entradas = req.body.entry || [];

    for (const entrada of entradas) {
      for (const cambio of entrada.changes || []) {
        const datos = cambio.value;

        if (!datos.messages) continue;

        for (const mensaje of datos.messages) {
          if (mensaje.type !== "text") continue;

          const numero = mensaje.from;
          const texto = mensaje.text.body;

          await guardarMensaje(numero, "entrada", texto);

          const respuesta = obtenerRespuesta(texto);

          try {
            await enviarWhatsApp(numero, respuesta);
            await guardarMensaje(numero, "salida", respuesta);
          } catch (error) {
            console.error("Error respondiendo a WhatsApp:", error.message);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error procesando webhook:", error.message);
  }
});

const PORT = process.env.PORT || 3000;

prepararBaseDatos();

app.listen(PORT, () => {
  console.log(`Servidor funcionando en el puerto ${PORT}`);
});