
require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json());
const path = require("path");

app.use("/media", express.static(path.join(__dirname, "public")));
app.use("/media", express.static(path.join(__dirname, "media")));
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const FACEBOOK = "https://www.facebook.com/upeatelevisioncanal25";
const TIKTOK = "https://www.tiktok.com/@upeatelevisionoficial";
const YOUTUBE = "https://www.youtube.com/@UPEATELEVISI%C3%93NOFICIAL";
const WEB = "https://tv.upea.bo/";
const CORREO = "upeatelevisioncanal25@gmail.com";
const MAPS = "https://maps.app.goo.gl/LfoYfLBZW5JiC6Vm8";

const programas = [
    {
        nombre: "Apoyo Legal",
        dia: "Horario pendiente de confirmación",
        horario: "Horario pendiente de confirmación",
        redes: "Enlace pendiente de confirmación",
        contacto: "Contacto pendiente de confirmación",
        descripcion: "Programa de información y orientación legal. Descripción provisional.",
        grabaciones: []
    },
    {
        nombre: "Mente y Corazón",
        dia: "Todos los viernes",
        horario: "19:30",
        redes: "Enlace pendiente de confirmación",
        contacto: "Contacto pendiente de confirmación",
        descripcion: "Espacio dedicado a temas relacionados con la mente y las emociones.",
        grabaciones: []
    },
    {
        nombre: "ElectroIngenio",
        dia: "Horario pendiente de confirmación",
        horario: "Horario pendiente de confirmación",
        redes: "Enlace pendiente de confirmación",
        contacto: "Contacto pendiente de confirmación",
        descripcion: "Descripción pendiente de confirmación.",
        grabaciones: []
    },
    {
        nombre: "IUS EX Catedrá",
        dia: "Horario pendiente de confirmación",
        horario: "Horario pendiente de confirmación",
        redes: "Enlace pendiente de confirmación",
        contacto: "Contacto pendiente de confirmación",
        descripcion: "Descripción pendiente de confirmación.",
        grabaciones: []
    },
    {
        nombre: "Raíces Vivas",
        dia: "Horario pendiente de confirmación",
        horario: "Horario pendiente de confirmación",
        redes: "Enlace pendiente de confirmación",
        contacto: "Contacto pendiente de confirmación",
        descripcion: "Descripción pendiente de confirmación.",
        grabaciones: []
    },
    {
        nombre: "Toda Mi Gente",
        dia: "Horario pendiente de confirmación",
        horario: "Horario pendiente de confirmación",
        redes: "Enlace pendiente de confirmación",
        contacto: "Contacto pendiente de confirmación",
        descripcion: "Descripción pendiente de confirmación.",
        grabaciones: []
    },
    {
        nombre: "Campeones con Altura",
        dia: "Horario pendiente de confirmación",
        horario: "Horario pendiente de confirmación",
        redes: "Enlace pendiente de confirmación",
        contacto: "Contacto pendiente de confirmación",
        descripcion: "Descripción pendiente de confirmación.",
        grabaciones: []
    },
    {
        nombre: "Educa Parvulitos",
        dia: "Horario pendiente de confirmación",
        horario: "Horario pendiente de confirmación",
        redes: "Enlace pendiente de confirmación",
        contacto: "Contacto pendiente de confirmación",
        descripcion: "Descripción pendiente de confirmación.",
        grabaciones: []
    }
];

const periodicos = Array.from({ length: 16 }, (_, i) => ({
    nombre: `Periódico ${i + 1}`,
    url: ""
}));

function menuPrincipal() {
    return `📺 *ASISTENTE VIRTUAL DE UPEA TV*

¡Hola! 👋
Bienvenido al asistente virtual de UPEA TV 📺

¿En qué podemos ayudarte?

1. 📡 Programación y horarios
2. 📰 Noticias y novedades
3. 🎬 Información de programas
4. 📍 Ubicación y contacto
5. 💬 Contactar con un administrador

Escribe el número de la opción que necesitas.

Escribe *MENU* en cualquier momento para volver al menú principal.`;
}

function menuProgramas(tipo) {
    const titulo = tipo === "horarios"
        ? "📡 *PROGRAMACIÓN Y HORARIOS*"
        : "🎬 *INFORMACIÓN DE PROGRAMAS*";

    return `${titulo}

Selecciona el programa que deseas consultar:

${programas.map((p, i) => `${i + 1}. ${p.nombre}`).join("\n")}
9. Volver al menú principal`;
}

function detalleHorario(indice) {
    const p = programas[indice];

    return `📺 *${p.nombre.toUpperCase()}*

📅 Día de emisión: ${p.dia}
🕒 Horario: ${p.horario}

📱 Redes sociales:
${p.redes}

📞 Contactos:
${p.contacto}

0. Volver al menú principal`;
}


function menuNoticias() {
    return `📰 *NOTICIAS Y NOVEDADES*

¡Mantente informado con UPEA TV!

Estas son las portadas de los periódicos del día. 🗞️

Te compartimos las portadas disponibles.

Escribe 0 para volver al menú principal.`;
}


function detallePrograma(indice) {
    const p = programas[indice];

    const grabaciones = p.grabaciones.length
        ? p.grabaciones.map((g, i) =>
            `${i + 1}. ${g.titulo}\n🔗 ${g.url}`
        ).join("\n\n")
        : "Las grabaciones se publicarán próximamente.";

    return `🎬 *${p.nombre.toUpperCase()}*

📝 Descripción:
${p.descripcion}

🎥 *Grabaciones disponibles*
${grabaciones}

🔗 Página oficial de Facebook de UPEA TV:
${FACEBOOK}

0. Volver al menú principal`;
}

function menuContacto() {
    return `📍 *UBICACIÓN Y CONTACTO*

📺 ¡Visítanos! Te mostramos cómo llegar a UPEA TV.

📍 *Ubicación del canal*
🔗 Google Maps:
${MAPS}

🎥 *Video de cómo llegar*
A continuación recibirás un video para orientarte.

📸 *Fotografías de la entrada*
También te enviaremos fotografías de referencia.

📞 *Contactos y redes sociales*

📘 Facebook:
${FACEBOOK}

🎵 TikTok:
${TIKTOK}

▶️ YouTube:
${YOUTUBE}

🌐 Página web:
${WEB}

✉️ Correo electrónico:
${CORREO}

0. Volver al menú principal`;
}

function menuAdministrador() {
    return `💬 *CONTACTAR CON UN ADMINISTRADOR*

¡Estamos aquí para ayudarte! 👋

Selecciona una opción:

1. ❓ Preguntas frecuentes
2. 📝 Dejar una consulta para el equipo de UPEA TV
3. 🌐 Ver nuestras redes sociales y contactos
4. Volver al menú principal`;
}

function preguntasFrecuentes() {
    return `❓ *PREGUNTAS FRECUENTES*

1. ¿Cómo puedo conocer los horarios de los programas?
Consulta la opción 1 del menú principal.

2. ¿Dónde puedo ver las grabaciones?
Ingresa a Información de programas.

3. ¿Cómo puedo consultar las portadas de los periódicos?
Selecciona Noticias y novedades.

4. ¿Cómo puedo llegar a UPEA TV?
Consulta Ubicación y contacto.

5. ¿Cómo puedo contactar con UPEA TV?
Consulta las redes sociales y el correo electrónico en Ubicación y contacto.

6. Volver al menú de administrador`;
}

function menuRedes() {
    return `🌐 *REDES SOCIALES Y CONTACTOS*

📘 Facebook:
${FACEBOOK}

🎵 TikTok:
${TIKTOK}

▶️ YouTube:
${YOUTUBE}

🌐 Página web:
${WEB}

✉️ Correo electrónico:
${CORREO}

0. Volver al menú principal`;
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
        console.error("Error guardando mensaje:", error.message);
    }
}

async function prepararBaseDatos() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS sesiones_bot (
            numero_usuario VARCHAR(30) PRIMARY KEY,
            estado VARCHAR(60) NOT NULL DEFAULT 'inicio',
            datos JSONB NOT NULL DEFAULT '{}'::jsonb,
            actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS consultas_bot (
            id SERIAL PRIMARY KEY,
            numero_usuario VARCHAR(30) NOT NULL,
            nombre VARCHAR(150),
            motivo VARCHAR(200),
            mensaje TEXT,
            estado VARCHAR(30) NOT NULL DEFAULT 'pendiente',
            creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS contenido_bot (
            id SERIAL PRIMARY KEY,
            categoria VARCHAR(50) NOT NULL,
            titulo VARCHAR(150) NOT NULL,
            contenido TEXT NOT NULL,
            activo BOOLEAN NOT NULL DEFAULT TRUE,
            orden INTEGER NOT NULL DEFAULT 1,
            actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log("Base de datos preparada.");
}

async function obtenerSesion(numero) {
    const r = await pool.query(
        `SELECT estado, datos
         FROM sesiones_bot
         WHERE numero_usuario = $1`,
        [numero]
    );

    if (r.rows.length === 0) {
        return { estado: "inicio", datos: {} };
    }

    return r.rows[0];
}

async function guardarSesion(numero, estado, datos = {}) {
    await pool.query(
        `INSERT INTO sesiones_bot
         (numero_usuario, estado, datos, actualizado_en)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (numero_usuario)
         DO UPDATE SET
           estado = EXCLUDED.estado,
           datos = EXCLUDED.datos,
           actualizado_en = CURRENT_TIMESTAMP`,
        [numero, estado, JSON.stringify(datos)]
    );
}

async function enviarWhatsApp(numero, texto) {
    const token = process.env.META_ACCESS_TOKEN;
    const phoneId = process.env.PHONE_NUMBER_ID;
    const version = process.env.GRAPH_API_VERSION || "v26.0";

    if (!token || !phoneId) {
        throw new Error("Faltan META_ACCESS_TOKEN o PHONE_NUMBER_ID.");
    }

    const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

    const respuesta = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: numero,
            type: "text",
            text: { body: texto }
        })
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
        console.error("Error de WhatsApp:", JSON.stringify(resultado));
        throw new Error("No se pudo enviar el mensaje a WhatsApp.");
    }

    return resultado;
}


async function enviarImagenWhatsApp(numero, url, descripcion) {
    return enviarMultimediaWhatsApp(numero, "image", url, descripcion);
}

async function enviarVideoWhatsApp(numero, url, descripcion) {
    return enviarMultimediaWhatsApp(numero, "video", url, descripcion);
}

async function enviarMultimediaWhatsApp(numero, tipo, url, descripcion) {
    const version = process.env.GRAPH_API_VERSION || "v26.0";
    const endpoint =
        `https://graph.facebook.com/${version}/${process.env.PHONE_NUMBER_ID}/messages`;

    const respuesta = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: numero,
            type: tipo,
            [tipo]: {
                link: url,
                caption: descripcion
            }
        })
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
        console.error("Error enviando multimedia:", resultado);
        throw new Error("No se pudo enviar el archivo multimedia.");
    }

    return resultado;
}

async function guardarConsulta(numero, datos) {
    await pool.query(
        `INSERT INTO consultas_bot
         (numero_usuario, nombre, motivo, mensaje)
         VALUES ($1, $2, $3, $4)`,
        [numero, datos.nombre, datos.motivo, datos.mensaje]
    );
}

async function obtenerRespuesta(numero, texto) {
    const mensaje = texto.trim();
    const normalizado = mensaje.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    if (["menu", "inicio", "hola", "buenas", "hi", "hello",
         "buenos dias", "buenas tardes", "buenas noches"].includes(normalizado)) {
        await guardarSesion(numero, "inicio", {});
        return menuPrincipal();
    }

    const sesion = await obtenerSesion(numero);
    const estado = sesion.estado;
    const datos = sesion.datos || {};

    if (normalizado === "0") {
        await guardarSesion(numero, "inicio", {});
        return menuPrincipal();
    }

    if (estado === "inicio") {
        if (normalizado === "1") {
            await guardarSesion(numero, "horarios", {});
            return menuProgramas("horarios");
        }

        if (normalizado === "2") {
            await guardarSesion(numero, "noticias", {});
            return menuNoticias();
        }

        if (normalizado === "3") {
            await guardarSesion(numero, "programas", {});
            return menuProgramas("programas");
        }

        if (normalizado === "4") {
            await guardarSesion(numero, "inicio", {});
            return menuContacto();
        }

        if (normalizado === "5") {
            await guardarSesion(numero, "administrador", {});
            return menuAdministrador();
        }

        return menuPrincipal();
    }

    if (estado === "horarios" || estado === "programas") {
        if (normalizado === "9") {
            await guardarSesion(numero, "inicio", {});
            return menuPrincipal();
        }

        const indice = Number(normalizado) - 1;

        if (!Number.isInteger(indice) || indice < 0 || indice >= programas.length) {
            return `Selecciona un número del 1 al 8 o escribe 9 para volver al menú principal.\n\n${menuProgramas(estado)}`;
        }

        await guardarSesion(
            numero,
            estado === "horarios" ? "detalle_horario" : "detalle_programa",
            { programa: indice }
        );

        return estado === "horarios"
            ? detalleHorario(indice)
            : detallePrograma(indice);
    }

    if (estado === "detalle_horario" || estado === "detalle_programa") {
        if (estado === "detalle_horario") {
            await guardarSesion(numero, "horarios", {});
            return menuProgramas("horarios");
        }

        await guardarSesion(numero, "programas", {});
        return menuProgramas("programas");
    }

    if (estado === "noticias") {
        return `${menuNoticias()}\n\nEscribe 0 para volver al menú principal.`;
    }

    if (estado === "administrador") {
        if (normalizado === "1") {
            await guardarSesion(numero, "faq", {});
            return preguntasFrecuentes();
        }

        if (normalizado === "2") {
            await guardarSesion(numero, "consulta_nombre", {});
            return `📝 *DEJAR UNA CONSULTA*\n\nPor favor, escribe tu nombre.`;
        }

        if (normalizado === "3") {
            await guardarSesion(numero, "redes", {});
            return menuRedes();
        }

        if (normalizado === "4") {
            await guardarSesion(numero, "inicio", {});
            return menuPrincipal();
        }

        return menuAdministrador();
    }

    if (estado === "faq") {
        await guardarSesion(numero, "administrador", {});
        return `${preguntasFrecuentes()}\n\nEscribe un número para volver a consultar o 6 para volver al menú de administrador.`;
    }

    if (estado === "redes") {
        await guardarSesion(numero, "administrador", {});
        return menuAdministrador();
    }

    if (estado === "consulta_nombre") {
        if (mensaje.length < 2 || mensaje.length > 150) {
            return "Escribe un nombre válido de hasta 150 caracteres.";
        }

        await guardarSesion(numero, "consulta_motivo", { nombre: mensaje });
        return "📌 Ahora escribe el motivo de tu consulta.";
    }

    if (estado === "consulta_motivo") {
        if (mensaje.length < 2 || mensaje.length > 200) {
            return "Escribe un motivo válido de hasta 200 caracteres.";
        }

        await guardarSesion(numero, "consulta_mensaje", {
            ...datos,
            motivo: mensaje
        });

        return "💬 Ahora escribe tu mensaje o consulta para el equipo de UPEA TV.";
    }

    if (estado === "consulta_mensaje") {
        if (mensaje.length < 2 || mensaje.length > 3000) {
            return "Escribe un mensaje de entre 2 y 3000 caracteres.";
        }

        const consulta = {
            ...datos,
            mensaje
        };

        await guardarConsulta(numero, consulta);
        await guardarSesion(numero, "inicio", {});

        return `¡Gracias por comunicarte con UPEA TV! 📺

Tu consulta ha sido registrada para que el equipo pueda revisarla y responderte cuando esté disponible.

La atención no es inmediata ni está disponible las 24 horas.

Escribe MENU para volver al menú principal.`;
    }

    await guardarSesion(numero, "inicio", {});
    return menuPrincipal();
}

app.get("/", (req, res) => {
    res.send("Chatbot UPEA TV funcionando correctamente.");
});

app.get("/webhook", (req, res) => {
    const modo = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (modo === "subscribe" && token === process.env.VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
    res.sendStatus(200);

    procesarWebhook(req.body).catch(error => {
        console.error("Error procesando webhook:", error.message);
    });
});


async function procesarWebhook(body) {
    const entradas = body.entry || [];

    for (const entrada of entradas) {
        for (const cambio of entrada.changes || []) {
            const mensajes = cambio.value?.messages || [];

            for (const mensaje of mensajes) {
                if (mensaje.type !== "text") {
                    continue;
                }

                const numero = mensaje.from;
                const texto = mensaje.text?.body || "";

                await guardarMensaje(numero, "entrada", texto);

                let respuesta;
                let estadoAnterior = "inicio";

                try {
                    const sesionAnterior = await obtenerSesion(numero);
                    estadoAnterior = sesionAnterior.estado;

                    respuesta = await obtenerRespuesta(numero, texto);
                } catch (error) {
                    console.error(
                        "Error generando respuesta:",
                        error.message
                    );

                    respuesta =
                        "Ocurrió un problema al procesar tu solicitud. Inténtalo nuevamente o escribe MENU.";
                }

                try {
                    // Primero enviar la respuesta de texto
                    await enviarWhatsApp(numero, respuesta);
                    await guardarMensaje(numero, "salida", respuesta);

                    const opcion = texto.trim();

                    // Enviar la imagen de Mente y Corazón
// cuando se selecciona dentro de Programación y horarios
if (
    estadoAnterior === "horarios" &&
    opcion === "2"
) {
    const urlImagen =
        "https://chatbot-upeatv.onrender.com/media/mente-corazon.jpg";

    try {
        await enviarImagenWhatsApp(
            numero,
            urlImagen,
            "📺 MENTE Y CORAZÓN\n\n" +
            "📅 Día de emisión: Todos los viernes\n" +
            "🕒 Horario: 19:30\n\n" +
            "📱 Redes sociales: Enlace pendiente de confirmación\n" +
            "📞 Contacto: Pendiente de confirmación\n\n" +
            "Escribe 0 para volver al menú principal."
        );

        await guardarMensaje(
            numero,
            "salida",
            "Imagen del programa Mente y Corazón"
        );
    } catch (error) {
        console.error(
            "Error enviando imagen de Mente y Corazón:",
            error.message
        );
    }
}

                    // OPCIÓN 2: enviar las 16 portadas
                    if (
                        estadoAnterior === "inicio" &&
                        opcion === "2"
                    ) {
                        const baseUrl =
                            "https://chatbot-upeatv.onrender.com/media/periodicos/";

                        for (let i = 1; i <= 16; i++) {
                            const urlPortada =
                                `${baseUrl}periodico${i}.jpg`;

                            try {
                                await enviarImagenWhatsApp(
                                    numero,
                                    urlPortada,
                                    `🗞️ Portada del periódico ${i} - UPEA TV`
                                );

                                await guardarMensaje(
                                    numero,
                                    "salida",
                                    `Portada del periódico ${i}`
                                );
                            } catch (error) {
                                console.error(
                                    `Error enviando la portada ${i}:`,
                                    error.message
                                );
                            }
                        }
                    }

                    // OPCIÓN 4: enviar el video y las fotos
                    if (
                        estadoAnterior === "inicio" &&
                        opcion === "4"
                    ) {
                        const baseUrl =
                            "https://chatbot-upeatv.onrender.com/media/ubicacion/";

                        // Enviar video de cómo llegar
                        try {
                            await enviarVideoWhatsApp(
                                numero,
                                `${baseUrl}video1.mp4`,
                                "📍 ¿Cómo llegar a UPEA TV? Mira este video para conocer el recorrido hasta nuestras instalaciones."
                            );

                            await guardarMensaje(
                                numero,
                                "salida",
                                "Video de cómo llegar a UPEA TV"
                            );
                        } catch (error) {
                            console.error(
                                "Error enviando el video:",
                                error.message
                            );
                        }

                        // Enviar fotografías de la entrada
                        const fotos = [
                            {
                                archivo: "fotoentrada1.jpg",
                                descripcion: "📸 Entrada de UPEA TV - Foto 1"
                            },
                            {
                                archivo: "fotoentrada2.jpg",
                                descripcion: "📸 Referencia de ingreso - Foto 2"
                            },
                            {
                                archivo: "fotoentrada3.jpg",
                                descripcion: "📸 Referencia de ingreso - Foto 3"
                            },
                            {
                                archivo: "fotoentrada4.jpg",
                                descripcion: "📸 Referencia de ingreso - Foto 4"
                            }
                        ];

                        for (const foto of fotos) {
                            try {
                                await enviarImagenWhatsApp(
                                    numero,
                                    `${baseUrl}${foto.archivo}`,
                                    foto.descripcion
                                );

                                await guardarMensaje(
                                    numero,
                                    "salida",
                                    foto.descripcion
                                );
                            } catch (error) {
                                console.error(
                                    `Error enviando ${foto.archivo}:`,
                                    error.message
                                );
                            }
                        }
                    }
                } catch (error) {
                    console.error(
                        "Error enviando respuesta de WhatsApp:",
                        error.message
                    );
                }
            }
        }
    }
}


app.get("/db-test", async (req, res) => {
    try {
        const resultado = await pool.query("SELECT NOW() AS fecha");
        res.json({
            estado: "conectado",
            baseDatos: resultado.rows[0]
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "No se pudo conectar con la base de datos." });
    }
});

prepararBaseDatos()
    .then(() => {
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Chatbot UPEA TV activo en el puerto ${PORT}`);
        });
    })
    .catch(error => {
        console.error("No se pudo preparar la base de datos:", error.message);
        process.exit(1);
    });
