
require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));
app.use("/media", express.static(path.join(__dirname, "public")));
app.use("/media", express.static(path.join(__dirname, "media")));
const PORT = process.env.PORT || 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const ADMIN_COOKIE = "upea_admin_session";
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;
const ADMIN_CATEGORIES = ["programa", "menu", "noticia", "faq", "contacto"];
const loginAttempts = new Map();
let contenidoCache = { menu: {}, noticias: [], faqs: [], contacto: {}, config: {} };

function firmarSesion(payload) {
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const firma = crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(data).digest("base64url");
    return `${data}.${firma}`;
}

function validarSesion(token) {
    if (!token || !process.env.ADMIN_SESSION_SECRET) return false;
    const partes = token.split(".");
    if (partes.length !== 2) return false;
    const firmaEsperada = crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(partes[0]).digest();
    let firmaRecibida;
    try { firmaRecibida = Buffer.from(partes[1], "base64url"); } catch { return false; }
    if (firmaRecibida.length !== firmaEsperada.length || !crypto.timingSafeEqual(firmaRecibida, firmaEsperada)) return false;
    try {
        const payload = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8"));
        return payload.usuario === process.env.ADMIN_USER && payload.exp > Date.now();
    } catch { return false; }
}

function exigirAdministrador(req, res, next) {
    const token = req.cookies?.[ADMIN_COOKIE] || req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
    if (!validarSesion(token)) return res.status(401).json({ error: "Sesión no válida. Inicia sesión nuevamente." });
    next();
}

function leerContenido(contenido) {
    try { return JSON.parse(contenido); } catch { return contenido; }
}

async function cargarContenidoBot() {
    const r = await pool.query("SELECT id, categoria, titulo, contenido, activo, orden FROM contenido_bot ORDER BY orden, id");
    const filas = r.rows.filter(x => x.activo);
    const porCategoria = categoria => filas.filter(x => x.categoria === categoria);

    const programasDB = porCategoria("programa");
    {
        const lista = programasDB.map(x => {
            const data = leerContenido(x.contenido);
            return { nombre: x.titulo, dia: data.dia || "Horario pendiente de confirmación", horario: data.horario || "Horario pendiente de confirmación", redes: data.redes || "Enlace pendiente de confirmación", contacto: data.contacto || "Contacto pendiente de confirmación", descripcion: data.descripcion || "", grabaciones: Array.isArray(data.grabaciones) ? data.grabaciones : [] };
        });
        programas.splice(0, programas.length, ...lista);
    }

    contenidoCache.menu = {};
    for (const x of porCategoria("menu")) contenidoCache.menu[x.titulo] = x.contenido;
    contenidoCache.noticias = porCategoria("noticia").map(x => ({ id: x.id, nombre: x.titulo, ...((leerContenido(x.contenido) && typeof leerContenido(x.contenido) === "object") ? leerContenido(x.contenido) : { url: x.contenido }) }));
    contenidoCache.faqs = porCategoria("faq").map(x => ({ id: x.id, pregunta: x.titulo, respuesta: x.contenido }));
    contenidoCache.contacto = {};
    for (const x of porCategoria("contacto")) contenidoCache.contacto[x.titulo] = x.contenido;

    const config = await pool.query("SELECT clave, valor FROM chatbot_config");
    contenidoCache.config = Object.fromEntries(config.rows.map(x => [x.clave, x.valor]));
}

async function inicializarContenidoBot() {
    const contar = async categoria => {
        const r = await pool.query("SELECT COUNT(*)::int AS total FROM contenido_bot WHERE categoria = $1", [categoria]);
        return r.rows[0].total;
    };

    if ((await contar("programa")) === 0) {
        for (let i = 0; i < programas.length; i++) {
            const p = programas[i];
            const data = { dia: p.dia, horario: p.horario, redes: p.redes, contacto: p.contacto, descripcion: p.descripcion, grabaciones: p.grabaciones };
            await pool.query("INSERT INTO contenido_bot (categoria, titulo, contenido, activo, orden) VALUES ('programa', $1, $2, TRUE, $3)", [p.nombre, JSON.stringify(data), i + 1]);
        }
    }
    if ((await contar("menu")) === 0) {
        const menus = [
            ["principal", menuPrincipal()],
            ["noticias", "📰 *NOTICIAS Y NOVEDADES*\n\n¡Mantente informado con UPEA TV!\n\nEstas son las portadas de los periódicos disponibles. 🗞️\n\nEscribe 0 para volver al menú principal."],
            ["contacto", "📍 *UBICACIÓN Y CONTACTO*"],
            ["redes", "🌐 *REDES SOCIALES Y CONTACTOS*"],
            ["admin", "¡Estamos aquí para ayudarte! 👋\n\nSelecciona una opción para continuar."]
        ];
        for (let i = 0; i < menus.length; i++) await pool.query("INSERT INTO contenido_bot (categoria, titulo, contenido, activo, orden) VALUES ('menu', $1, $2, TRUE, $3)", [menus[i][0], menus[i][1], i + 1]);
    }
    if ((await contar("contacto")) === 0) {
        const contacts = [["facebook", FACEBOOK], ["tiktok", TIKTOK], ["youtube", YOUTUBE], ["web", WEB], ["correo", CORREO], ["maps", MAPS]];
        for (let i = 0; i < contacts.length; i++) await pool.query("INSERT INTO contenido_bot (categoria, titulo, contenido, activo, orden) VALUES ('contacto', $1, $2, TRUE, $3)", [contacts[i][0], contacts[i][1], i + 1]);
    }
    if ((await contar("faq")) === 0) {
        const faqs = [
            ["¿Cómo puedo conocer los horarios de los programas?", "Consulta la opción Programación y horarios del menú principal."],
            ["¿Dónde puedo ver las grabaciones?", "Ingresa a Información de programas."],
            ["¿Cómo puedo consultar las portadas de los periódicos?", "Selecciona Noticias y novedades."],
            ["¿Cómo puedo llegar a UPEA TV?", "Consulta Ubicación y contacto."],
            ["¿Cómo puedo contactar con UPEA TV?", "Consulta nuestras redes sociales y correo electrónico."]
        ];
        for (let i = 0; i < faqs.length; i++) await pool.query("INSERT INTO contenido_bot (categoria, titulo, contenido, activo, orden) VALUES ('faq', $1, $2, TRUE, $3)", [faqs[i][0], faqs[i][1], i + 1]);
    }
    if ((await contar("noticia")) === 0) {
        for (let i = 1; i <= 16; i++) await pool.query("INSERT INTO contenido_bot (categoria, titulo, contenido, activo, orden) VALUES ('noticia', $1, $2, TRUE, $3)", [`Periódico ${i}`, JSON.stringify({ url: "" }), i]);
    }
    await cargarContenidoBot();
}

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
        dia: "LUNES A VIERNES",
        horario: "10:30 A 12:30",
        redes: "https://www.facebook.com/todamigentetv/",
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
    if (contenidoCache.menu?.principal) {
        let guardado = contenidoCache.menu.principal;
        const nombre = contenidoCache.config?.nombre_bot;
        if (nombre) guardado = guardado.replace("*ASISTENTE VIRTUAL DE UPEA TV*", `*ASISTENTE VIRTUAL DE ${nombre.toUpperCase()}*`);
        const bienvenidaDefault = "¡Hola! 👋\nBienvenido al asistente virtual de UPEA TV 📺";
        const bienvenidaConfig = contenidoCache.config?.mensaje_bienvenida;
        return bienvenidaConfig ? guardado.replace(bienvenidaDefault, bienvenidaConfig) : guardado;
    }
    const nombre = contenidoCache.config?.nombre_bot || "UPEA TV";
    const bienvenida = contenidoCache.config?.mensaje_bienvenida || "¡Hola! 👋\nBienvenido al asistente virtual de UPEA TV 📺";
    return `📺 *ASISTENTE VIRTUAL DE ${nombre.toUpperCase()}*

${bienvenida}

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
    if (contenidoCache.menu?.noticias) return contenidoCache.menu.noticias;
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
${contenidoCache.contacto?.facebook || FACEBOOK}

0. Volver al menú principal`;
}

function menuContacto() {
    const c = contenidoCache.contacto || {};
    const encabezado = contenidoCache.menu?.contacto || "📍 *UBICACIÓN Y CONTACTO*";
    const facebook = c.facebook || FACEBOOK, tiktok = c.tiktok || TIKTOK, youtube = c.youtube || YOUTUBE;
    const web = c.web || WEB, correo = c.correo || CORREO, maps = c.maps || MAPS;
    return `${encabezado}

📺 ¡Visítanos! Te mostramos cómo llegar a UPEA TV.

📍 *Ubicación del canal*
🔗 Google Maps:
${maps}

🎥 *Video de cómo llegar*
A continuación recibirás un video para orientarte.

📸 *Fotografías de la entrada*
También te enviaremos fotografías de referencia.

📞 *Contactos y redes sociales*

📘 Facebook:
${facebook}

🎵 TikTok:
${tiktok}

▶️ YouTube:
${youtube}

🌐 Página web:
${web}

✉️ Correo electrónico:
${correo}

0. Volver al menú principal`;
}

function menuAdministrador() {
    return contenidoCache.menu?.admin || `💬 *CONTACTAR CON UN ADMINISTRADOR*

¡Estamos aquí para ayudarte! 👋

Selecciona una opción:

1. ❓ Preguntas frecuentes
2. 📝 Dejar una consulta para el equipo de UPEA TV
3. 🌐 Ver nuestras redes sociales y contactos
4. Volver al menú principal`;
}

function preguntasFrecuentes() {
    if (contenidoCache.faqs?.length) return `❓ *PREGUNTAS FRECUENTES*\n\n${contenidoCache.faqs.map((x, i) => `${i + 1}. ${x.pregunta}\n${x.respuesta}`).join("\n\n")}\n\n${contenidoCache.faqs.length + 1}. Volver al menú de administrador`;
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
    const c = contenidoCache.contacto || {};
    const encabezado = contenidoCache.menu?.redes || "🌐 *REDES SOCIALES Y CONTACTOS*";
    return `${encabezado}

📘 Facebook:
${c.facebook || FACEBOOK}

🎵 TikTok:
${c.tiktok || TIKTOK}

▶️ YouTube:
${c.youtube || YOUTUBE}

🌐 Página web:
${c.web || WEB}

✉️ Correo electrónico:
${c.correo || CORREO}

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
        CREATE TABLE IF NOT EXISTS chatbot_config (
            clave VARCHAR(80) PRIMARY KEY,
            valor TEXT NOT NULL DEFAULT '',
            actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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

async function enviarMenuPrincipalWhatsApp(numero) {
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
            type: "interactive",
            interactive: {
                type: "list",
                body: {
                    text: contenidoCache.menu?.principal || "¡Hola! 👋 Bienvenido al asistente virtual de UPEA TV 📺\n\n¿En qué podemos ayudarte? Selecciona una opción del menú."
                },
                action: {
                    button: "Abrir menú",
                    sections: [
                        {
                            title: "Menú principal",
                            rows: [
    {
        id: "principal_1",
        title: "📡 Programación",
        description: "Consulta horarios de programas."
    },
    {
        id: "principal_2",
        title: "📰 Noticias",
        description: "Consulta noticias y portadas."
    },
    {
        id: "principal_3",
        title: "🎬 Programas",
        description: "Consulta las grabaciones."
    },
    {
        id: "principal_4",
        title: "📍 Ubicación y contacto",
        description: "Dirección, mapas y contactos."
    },
    {
        id: "principal_5",
        title: "💬 Administrador",
        description: "Envía una consulta a UPEA TV."
    }
]
                        }
                    ]
                }
            }
        })
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
        console.error("Error enviando menú interactivo:", resultado);
        throw new Error("No se pudo enviar el menú interactivo.");
    }

    return resultado;
}
async function enviarListaProgramasWhatsApp(numero, tipo) {
    const version = process.env.GRAPH_API_VERSION || "v26.0";
    const endpoint =
        `https://graph.facebook.com/${version}/${process.env.PHONE_NUMBER_ID}/messages`;

    const titulo = tipo === "horarios"
        ? "Programación y horarios"
        : "Información de programas";

    const filas = programas.slice(0, 8).map((programa, indice) => ({
        id: `${tipo}_${indice + 1}`,
        title: programa.nombre.slice(0, 24),
        description: "Consulta información y horarios."
    }));
    filas.push({
        id: `${tipo}_9`,
        title: "Volver al menú",
        description: "Regresar al menú principal."
    });

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
            type: "interactive",
            interactive: {
                type: "list",
                body: {
                    text: `📺 ${titulo}\n\nSelecciona el programa que deseas consultar.`
                },
                action: {
                    button: "Elegir un programa",
                    sections: [
                        {
                            title: "Programas de UPEA TV",
                            rows: filas
                        }
                    ]
                }
            }
        })
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
        console.error("Error enviando submenú:", resultado);
        throw new Error("No se pudo enviar el submenú de programas.");
    }

    return resultado;
}

async function enviarMenuAdministradorWhatsApp(numero) {
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
            type: "interactive",
            interactive: {
                type: "list",
                body: {
                    text: contenidoCache.menu?.admin || "¡Estamos aquí para ayudarte! 👋\n\nSelecciona una opción para continuar."
                },
                action: {
                    button: "Ver opciones",
                    sections: [
                        {
                            title: "Atención al usuario",
                            rows: [
                                {
                                    id: "admin_1",
                                    title: "❓ Preguntas frecuentes",
                                    description: "Resuelve tus dudas sobre UPEA TV."
                                },
                                {
                                    id: "admin_2",
                                    title: "📝 Dejar una consulta",
                                    description: "Envía un mensaje al equipo de UPEA TV."
                                },
                                {
                                    id: "admin_3",
                                    title: "🌐 Redes y contactos",
                                    description: "Consulta nuestras redes y contactos."
                                },
                                {
                                    id: "admin_4",
                                    title: "↩️ Volver al menú",
                                    description: "Regresar al menú principal."
                                }
                            ]
                        }
                    ]
                }
            }
        })
    });

    const resultado = await respuesta.json();

    if (!respuesta.ok) {
        console.error("Error enviando menú de administrador:", resultado);
        throw new Error("No se pudo enviar el menú interactivo de administrador.");
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

        const despedida = contenidoCache.config?.mensaje_despedida || "¡Gracias por comunicarte con UPEA TV! 📺";
        return `${despedida}

Tu consulta ha sido registrada para que el equipo pueda revisarla y responderte cuando esté disponible.

La atención no es inmediata ni está disponible las 24 horas.

Escribe MENU para volver al menú principal.`;
    }

    await guardarSesion(numero, "inicio", {});
    return contenidoCache.config?.mensaje_sin_respuesta || "No pude identificar tu opción. Escribe MENU para ver las opciones disponibles.";
}

// ---------------- PANEL ADMINISTRATIVO UPEA TV ----------------
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/api/admin/session", (req, res) => {
    const raw = req.headers.cookie || "";
    const token = raw.split(";").map(x => x.trim()).find(x => x.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
    res.json({ autenticado: validarSesion(token) });
});

app.post("/api/admin/login", (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const ahora = Date.now();
    const intento = loginAttempts.get(ip) || { count: 0, until: ahora + 15 * 60 * 1000 };
    if (ahora > intento.until) { intento.count = 0; intento.until = ahora + 15 * 60 * 1000; }
    if (intento.count >= 8) return res.status(429).json({ error: "Demasiados intentos. Espera 15 minutos." });

    const usuario = String(req.body.usuario || "");
    const password = String(req.body.password || "");
    const realUser = String(process.env.ADMIN_USER || "");
    const realPassword = String(process.env.ADMIN_PASSWORD || "");
    const iguales = (a, b) => {
        const aa = Buffer.from(a), bb = Buffer.from(b);
        return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
    };
    if (!realUser || !realPassword || !process.env.ADMIN_SESSION_SECRET) {
        return res.status(500).json({ error: "Configura ADMIN_USER, ADMIN_PASSWORD y ADMIN_SESSION_SECRET en las variables de entorno." });
    }
    if (!iguales(usuario, realUser) || !iguales(password, realPassword)) {
        intento.count++;
        loginAttempts.set(ip, intento);
        return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    loginAttempts.delete(ip);
    const token = firmarSesion({ usuario: realUser, exp: Date.now() + ADMIN_SESSION_MS });
    res.cookie(ADMIN_COOKIE, token, { httpOnly: true, secure: req.secure, sameSite: "strict", maxAge: ADMIN_SESSION_MS, path: "/" });
    res.json({ ok: true, mensaje: "Sesión iniciada." });
});

app.post("/api/admin/logout", exigirAdministrador, (req, res) => {
    res.clearCookie(ADMIN_COOKIE, { httpOnly: true, secure: req.secure, sameSite: "strict", path: "/" });
    res.json({ ok: true });
});

app.get("/api/admin/dashboard", exigirAdministrador, async (req, res) => {
    try {
        const r = await pool.query("SELECT categoria, COUNT(*)::int AS total FROM contenido_bot WHERE activo = TRUE GROUP BY categoria");
        const counts = Object.fromEntries(r.rows.map(x => [x.categoria, x.total]));
        const q = await pool.query("SELECT COUNT(*)::int AS total FROM consultas_bot WHERE estado = 'pendiente'");
        res.json({ programas: counts.programa || 0, noticias: counts.noticia || 0, preguntas: counts.faq || 0, consultasPendientes: q.rows[0].total || 0 });
    } catch (e) { res.status(500).json({ error: "No se pudo cargar el resumen." }); }
});

app.get("/api/admin/config", exigirAdministrador, async (req, res) => {
    try {
        const r = await pool.query("SELECT clave, valor FROM chatbot_config ORDER BY clave");
        const config = Object.fromEntries(r.rows.map(x => [x.clave, x.valor]));
        res.json({
            nombre_bot: config.nombre_bot || "UPEA TV",
            mensaje_bienvenida: config.mensaje_bienvenida || "¡Hola! 👋\nBienvenido al asistente virtual de UPEA TV 📺",
            mensaje_despedida: config.mensaje_despedida || "Gracias por comunicarte con UPEA TV. ¡Hasta pronto! 📺",
            mensaje_sin_respuesta: config.mensaje_sin_respuesta || "No pude identificar tu opción. Escribe MENU para ver las opciones disponibles."
        });
    } catch (e) { res.status(500).json({ error: "No se pudo cargar la configuración." }); }
});

app.put("/api/admin/config", exigirAdministrador, async (req, res) => {
    const permitidas = ["nombre_bot", "mensaje_bienvenida", "mensaje_despedida", "mensaje_sin_respuesta"];
    const valores = req.body || {};
    for (const clave of permitidas) {
        if (typeof valores[clave] !== "string" || !valores[clave].trim()) {
            return res.status(400).json({ error: `El campo ${clave} es obligatorio.` });
        }
        if (valores[clave].length > (clave === "nombre_bot" ? 80 : 2000)) {
            return res.status(400).json({ error: `El campo ${clave} supera la longitud permitida.` });
        }
    }
    try {
        for (const clave of permitidas) {
            await pool.query(`INSERT INTO chatbot_config (clave, valor, actualizado_en) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor, actualizado_en = CURRENT_TIMESTAMP`, [clave, valores[clave].trim()]);
        }
        await cargarContenidoBot();
        res.json({ ok: true, mensaje: "Configuración actualizada." });
    } catch (e) { res.status(500).json({ error: "No se pudo guardar la configuración." }); }
});

app.get("/api/admin/content", exigirAdministrador, async (req, res) => {
    const categoria = String(req.query.categoria || "");
    if (!ADMIN_CATEGORIES.includes(categoria)) return res.status(400).json({ error: "Categoría no válida." });
    try {
        const r = await pool.query("SELECT id, categoria, titulo, contenido, activo, orden, actualizado_en FROM contenido_bot WHERE categoria = $1 ORDER BY orden, id", [categoria]);
        res.json(r.rows.map(x => ({ ...x, contenido: leerContenido(x.contenido) })));
    } catch (e) { res.status(500).json({ error: "No se pudo consultar el contenido." }); }
});

app.post("/api/admin/content", exigirAdministrador, async (req, res) => {
    const { categoria, titulo, contenido, activo = true, orden = 1 } = req.body || {};
    if (!ADMIN_CATEGORIES.includes(categoria)) return res.status(400).json({ error: "Categoría no válida." });
    if (!String(titulo || "").trim()) return res.status(400).json({ error: "El título es obligatorio." });
    if (categoria === "programa" && String(titulo).trim().length > 24) return res.status(400).json({ error: "El nombre del programa debe tener como máximo 24 caracteres para WhatsApp." });
    if (categoria === "programa") {
        const total = await pool.query("SELECT COUNT(*)::int AS total FROM contenido_bot WHERE categoria='programa' AND activo=TRUE");
        if (total.rows[0].total >= 8) return res.status(400).json({ error: "WhatsApp permite hasta 8 programas en este menú. Elimina o desactiva uno antes de agregar otro." });
    }
    const texto = typeof contenido === "string" ? contenido : JSON.stringify(contenido ?? {});
    try {
        const r = await pool.query("INSERT INTO contenido_bot (categoria, titulo, contenido, activo, orden, actualizado_en) VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) RETURNING id", [categoria, String(titulo).trim(), texto, Boolean(activo), Number(orden) || 1]);
        await cargarContenidoBot();
        res.status(201).json({ ok: true, id: r.rows[0].id });
    } catch (e) { res.status(500).json({ error: "No se pudo guardar el registro." }); }
});

app.put("/api/admin/content/:id", exigirAdministrador, async (req, res) => {
    const id = Number(req.params.id);
    const { titulo, contenido, activo = true, orden = 1 } = req.body || {};
    if (!Number.isInteger(id) || id < 1 || !String(titulo || "").trim()) return res.status(400).json({ error: "Datos no válidos." });
    const existente = await pool.query("SELECT categoria FROM contenido_bot WHERE id=$1", [id]);
    if (!existente.rowCount) return res.status(404).json({ error: "Registro no encontrado." });
    if (existente.rows[0].categoria === "programa" && String(titulo).trim().length > 24) return res.status(400).json({ error: "El nombre del programa debe tener como máximo 24 caracteres para WhatsApp." });
    if (existente.rows[0].categoria === "programa" && Boolean(req.body.activo) === true) {
        const total = await pool.query("SELECT COUNT(*)::int AS total FROM contenido_bot WHERE categoria='programa' AND activo=TRUE AND id<>$1", [id]);
        if (total.rows[0].total >= 8) return res.status(400).json({ error: "WhatsApp permite hasta 8 programas activos en este menú." });
    }
    const texto = typeof contenido === "string" ? contenido : JSON.stringify(contenido ?? {});
    try {
        const r = await pool.query("UPDATE contenido_bot SET titulo=$1, contenido=$2, activo=$3, orden=$4, actualizado_en=CURRENT_TIMESTAMP WHERE id=$5 RETURNING id", [String(titulo).trim(), texto, Boolean(activo), Number(orden) || 1, id]);
        if (!r.rowCount) return res.status(404).json({ error: "Registro no encontrado." });
        await cargarContenidoBot();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "No se pudo actualizar el registro." }); }
});

app.delete("/api/admin/content/:id", exigirAdministrador, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Identificador no válido." });
    try {
        const r = await pool.query("DELETE FROM contenido_bot WHERE id=$1 AND categoria = ANY($2::varchar[])", [id, ADMIN_CATEGORIES]);
        if (!r.rowCount) return res.status(404).json({ error: "Registro no encontrado." });
        await cargarContenidoBot();
        res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: "No se pudo eliminar el registro." }); }
});

app.get("/", (req, res) => {
    res.send("Chatbot UPEA TV funcionando correctamente. Panel: /admin");
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
    for (const entrada of body.entry || []) {
        for (const cambio of entrada.changes || []) {
            for (const mensaje of cambio.value?.messages || []) {
                if (!["text", "interactive"].includes(mensaje.type)) continue;

                const numero = mensaje.from;
                let texto = mensaje.text?.body || "";

                // Identificar la opción seleccionada en los menús interactivos.
                if (mensaje.type === "interactive") {
                    const id = mensaje.interactive?.list_reply?.id || "";
                    let coincidencia;

                    if ((coincidencia = id.match(/^principal_([1-5])$/))) {
                        await guardarSesion(numero, "inicio", {});
                        texto = coincidencia[1];
                    } else if ((coincidencia = id.match(/^horarios_([1-9])$/))) {
                        await guardarSesion(numero, "horarios", {});
                        texto = coincidencia[1];
                    
} else if ((coincidencia = id.match(/^programas_([1-9])$/))) {
    await guardarSesion(numero, "programas", {});
    texto = coincidencia[1];

} else if ((coincidencia = id.match(/^admin_([1-4])$/))) {
    await guardarSesion(numero, "administrador", {});
    texto = coincidencia[1];

} else {
    continue;
}

                }

                const opcion = texto.trim();
                const sesion = await obtenerSesion(numero);
                const estadoAnterior = sesion.estado;

                try {
                    await guardarMensaje(numero, "entrada", opcion);
                    const respuesta = await obtenerRespuesta(numero, opcion);

                    if (respuesta === menuPrincipal()) {
                        await enviarMenuPrincipalWhatsApp(numero);
                        await guardarMensaje(numero, "salida", "Menú principal interactivo enviado.");
                    } else if (respuesta === menuProgramas("horarios")) {
                        await enviarListaProgramasWhatsApp(numero, "horarios");
                        await guardarMensaje(numero, "salida", "Submenú interactivo de programación y horarios enviado.");
                    
} else if (respuesta === menuProgramas("programas")) {
    await enviarListaProgramasWhatsApp(numero, "programas");
    await guardarMensaje(numero, "salida", "Submenú interactivo de información de programas enviado.");

} else if (respuesta === menuAdministrador()) {
    await enviarMenuAdministradorWhatsApp(numero);
    await guardarMensaje(numero, "salida", "Menú interactivo de administrador enviado.");

} else if (estadoAnterior === "horarios" && /^[1-8]$/.test(opcion)) {

                        const imagenes = {
                            "Apoyo Legal": "apoyo-legal.jpg",
                            "Mente y Corazón": "mente-corazon.jpg",
                            "ElectroIngenio": "electroingenio.jpg",
                            "IUS EX Catedrá": "ius-ex-catedra.jpg",
                            "Raíces Vivas": "raices-vivas.jpg",
                            "Toda Mi Gente": "toda-mi-gente.jpg",
                            "Campeones con Altura": "campeones-con-altura.jpg",
                            "Educa Parvulitos": "educa-parvulitos.jpg"
                        };
                        const programaSeleccionado = programas[Number(opcion) - 1];
                        const archivo = imagenes[programaSeleccionado?.nombre];
                        if (archivo) {
                            const urlImagen = `https://chatbot-upeatv.onrender.com/media/${archivo}`;
                            await enviarImagenWhatsApp(numero, urlImagen, respuesta);
                            await guardarMensaje(numero, "salida", `Imagen del programa: ${archivo}. ${respuesta}`);
                        } else {
                            await enviarWhatsApp(numero, respuesta);
                            await guardarMensaje(numero, "salida", respuesta);
                        }
                    } else {
                        await enviarWhatsApp(numero, respuesta);
                        await guardarMensaje(numero, "salida", respuesta);
                    }

                    // Portadas de periódicos: opción 2 del menú principal.
                    if (estadoAnterior === "inicio" && opcion === "2") {
                        const baseUrl = "https://chatbot-upeatv.onrender.com/media/periodicos/";
                        const portadas = contenidoCache.noticias || [];
                        for (let i = 0; i < portadas.length; i++) {
                            try {
                                const urlPortada = portadas[i].url || `${baseUrl}periodico${i + 1}.jpeg`;
                                if (!urlPortada) continue;
                                await enviarImagenWhatsApp(numero, urlPortada, `🗞️ ${portadas[i].nombre} - UPEA TV`);
                                await guardarMensaje(numero, "salida", `Portada: ${portadas[i].nombre}`);
                            } catch (error) {
                                console.error(`Error enviando portada ${i + 1}:`, error.message);
                            }
                        }
                    }

                    // Video y fotografías: opción 4 del menú principal.
                    if (estadoAnterior === "inicio" && opcion === "4") {
                        const baseUrl = "https://chatbot-upeatv.onrender.com/media/ubicacion/";

                        try {
                            await enviarVideoWhatsApp(
                                numero,
                                `${baseUrl}video1.mp4`,
                                "📍 ¿Cómo llegar a UPEA TV? Mira este video para conocer el recorrido hasta nuestras instalaciones."
                            );
                            await guardarMensaje(numero, "salida", "Video de cómo llegar a UPEA TV");
                        } catch (error) {
                            console.error("Error enviando el video:", error.message);
                        }

                        const fotos = [
                            { archivo: "fotoentrada1.jpg", descripcion: "📸 Entrada de UPEA TV - Foto 1" },
                            { archivo: "fotoentrada2.jpg", descripcion: "📸 Referencia de ingreso - Foto 2" },
                            { archivo: "fotoentrada3.jpg", descripcion: "📸 Referencia de ingreso - Foto 3" },
                            { archivo: "fotoentrada4.jpg", descripcion: "📸 Referencia de ingreso - Foto 4" }
                        ];

                        for (const foto of fotos) {
                            try {
                                await enviarImagenWhatsApp(numero, `${baseUrl}${foto.archivo}`, foto.descripcion);
                                await guardarMensaje(numero, "salida", foto.descripcion);
                            } catch (error) {
                                console.error(`Error enviando ${foto.archivo}:`, error.message);
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error procesando mensaje de WhatsApp:", error.message);
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
    .then(inicializarContenidoBot)
    .then(() => {
        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Chatbot UPEA TV activo en el puerto ${PORT}`);
        });
    })
    .catch(error => {
    console.error("No se pudo preparar la base de datos:");
    console.error(error);
    console.error(error.stack);
    process.exit(1);
});