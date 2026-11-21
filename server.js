require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { Pool } = require("pg");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/media", express.static(path.join(__dirname, "public")));
app.use("/media", express.static(path.join(__dirname, "media")));
const PORT = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const ADMIN_COOKIE = "upea_admin_session";
const ADMIN_SESSION_MS = 8 * 60 * 60 * 1000;
const ADMIN_CATEGORIES = ["programa", "menu", "noticia", "faq", "contacto"];
const loginAttempts = new Map();
const directorioImagenes = path.join(__dirname, "media", "uploads");
fs.mkdirSync(directorioImagenes, { recursive: true });

const FACEBOOK = "https://www.facebook.com/upeatelevisioncanal25";
const TIKTOK = "https://www.tiktok.com/@upeatelevisionoficial";
const YOUTUBE = "https://www.youtube.com/@UPEATELEVISI%C3%93NOFICIAL";
const WEB = "https://tv.upea.bo/";
const CORREO = "upeatelevisioncanal25@gmail.com";
const MAPS = "https://maps.app.goo.gl/LfoYfLBZW5JiC6Vm8";

let configuracionCache = {
  nombre_bot: "Asistente Virtual UPEA TV",
  mensaje_bienvenida: "¡Hola! 👋 Bienvenido al asistente virtual de UPEA TV 📺",
  mensaje_despedida: "¡Gracias por comunicarte con UPEA TV! 📺 ¡Hasta pronto!",
  mensaje_sin_respuesta: "No pude reconocer tu opción. Por favor, intenta nuevamente."
};
let programas = [];
let contenidoCache = { menu: {}, menuItems: [], noticias: [], faqs: [], contacto: {} };

const programasIniciales = [
  { nombre: "Apoyo Legal", dia: "Horario pendiente de confirmación", horario: "Horario pendiente de confirmación", redes: "Enlace pendiente de confirmación", contacto: "Contacto pendiente de confirmación", descripcion: "Programa de información y orientación legal. Descripción provisional.", grabaciones: [] },
  { nombre: "Mente y Corazón", dia: "Todos los viernes", horario: "19:30", redes: "Enlace pendiente de confirmación", contacto: "Contacto pendiente de confirmación", descripcion: "Espacio dedicado a temas relacionados con la mente y las emociones.", grabaciones: [] },
  { nombre: "ElectroIngenio", dia: "Horario pendiente de confirmación", horario: "Horario pendiente de confirmación", redes: "Enlace pendiente de confirmación", contacto: "Contacto pendiente de confirmación", descripcion: "Descripción pendiente de confirmación.", grabaciones: [] },
  { nombre: "IUS EX Catedrá", dia: "Horario pendiente de confirmación", horario: "Horario pendiente de confirmación", redes: "Enlace pendiente de confirmación", contacto: "Contacto pendiente de confirmación", descripcion: "Descripción pendiente de confirmación.", grabaciones: [] },
  { nombre: "Raíces Vivas", dia: "Horario pendiente de confirmación", horario: "Horario pendiente de confirmación", redes: "Enlace pendiente de confirmación", contacto: "Contacto pendiente de confirmación", descripcion: "Descripción pendiente de confirmación.", grabaciones: [] },
  { nombre: "Toda Mi Gente", dia: "LUNES A VIERNES", horario: "10:30 A 12:30", redes: "https://www.facebook.com/todamigentetv/", contacto: "Contacto pendiente de confirmación", descripcion: "Descripción pendiente de confirmación.", grabaciones: [] },
  { nombre: "Campeones con Altura", dia: "Horario pendiente de confirmación", horario: "Horario pendiente de confirmación", redes: "Enlace pendiente de confirmación", contacto: "Contacto pendiente de confirmación", descripcion: "Descripción pendiente de confirmación.", grabaciones: [] },
  { nombre: "Educa Parvulitos", dia: "Horario pendiente de confirmación", horario: "Horario pendiente de confirmación", redes: "Enlace pendiente de confirmación", contacto: "Contacto pendiente de confirmación", descripcion: "Descripción pendiente de confirmación.", grabaciones: [] }
];

function leerContenido(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}
function normalizar(texto) {
  return String(texto || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function firmarSesion(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const firma = crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(data).digest("base64url");
  return `${data}.${firma}`;
}
function validarSesion(token) {
  if (!token || !process.env.ADMIN_SESSION_SECRET) return false;
  const partes = token.split(".");
  if (partes.length !== 2) return false;
  const esperada = crypto.createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(partes[0]).digest();
  let recibida;
  try { recibida = Buffer.from(partes[1], "base64url"); } catch { return false; }
  if (recibida.length !== esperada.length || !crypto.timingSafeEqual(recibida, esperada)) return false;
  try {
    const payload = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8"));
    return payload.usuario === process.env.ADMIN_USER && payload.exp > Date.now();
  } catch { return false; }
}
function exigirAdministrador(req, res, next) {
  const raw = req.headers.cookie || "";
  const token = raw.split(";").map(x => x.trim()).find(x => x.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  if (!validarSesion(token)) return res.status(401).json({ error: "Sesión no válida. Inicia sesión nuevamente." });
  next();
}

const almacenamientoImagenes = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, directorioImagenes),
  filename: (_req, file, cb) => {
    const extension = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" }[file.mimetype];
    if (!extension) return cb(new Error("Formato de imagen no permitido."));
    cb(null, `${crypto.randomUUID()}${extension}`);
  }
});
const subirImagen = multer({
  storage: almacenamientoImagenes,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)
    ? cb(null, true) : cb(new Error("Solo se permiten imágenes JPG, PNG o WEBP."))
});

async function prepararBaseDatos() {
  await pool.query(`CREATE TABLE IF NOT EXISTS sesiones_bot (
    numero_usuario VARCHAR(30) PRIMARY KEY, estado VARCHAR(60) NOT NULL DEFAULT 'inicio',
    datos JSONB NOT NULL DEFAULT '{}'::jsonb, actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS consultas_bot (
    id SERIAL PRIMARY KEY, numero_usuario VARCHAR(30) NOT NULL, nombre VARCHAR(150), motivo VARCHAR(200),
    mensaje TEXT, estado VARCHAR(30) NOT NULL DEFAULT 'pendiente', creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`ALTER TABLE consultas_bot ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await pool.query(`CREATE TABLE IF NOT EXISTS consulta_imagenes (
    id BIGSERIAL PRIMARY KEY, consulta_id INTEGER NOT NULL REFERENCES consultas_bot(id) ON DELETE CASCADE,
    mimetype VARCHAR(80) NOT NULL, nombre_archivo VARCHAR(180) NOT NULL, imagen BYTEA NOT NULL,
    tamano INTEGER NOT NULL DEFAULT 0, creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS chatbot_config (
    clave VARCHAR(80) PRIMARY KEY, valor TEXT NOT NULL DEFAULT '', actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS configuracion_bot (
    id INTEGER PRIMARY KEY CHECK (id = 1), nombre_bot VARCHAR(80) NOT NULL, mensaje_bienvenida TEXT NOT NULL,
    mensaje_despedida TEXT NOT NULL, mensaje_sin_respuesta TEXT NOT NULL, actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`INSERT INTO configuracion_bot (id,nombre_bot,mensaje_bienvenida,mensaje_despedida,mensaje_sin_respuesta)
    VALUES (1,'Asistente Virtual UPEA TV','¡Hola! 👋 Bienvenido al asistente virtual de UPEA TV 📺','¡Gracias por comunicarte con UPEA TV! 📺 ¡Hasta pronto!','No pude reconocer tu opción. Por favor, intenta nuevamente.') ON CONFLICT (id) DO NOTHING`);
  await pool.query(`CREATE TABLE IF NOT EXISTS contenido_bot (
    id SERIAL PRIMARY KEY, categoria VARCHAR(50) NOT NULL, titulo VARCHAR(150) NOT NULL,
    contenido TEXT NOT NULL, activo BOOLEAN NOT NULL DEFAULT TRUE, orden INTEGER NOT NULL DEFAULT 1,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await pool.query(`ALTER TABLE contenido_bot ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES contenido_bot(id) ON DELETE CASCADE`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_contenido_bot_categoria_orden ON contenido_bot(categoria, orden, id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_consultas_bot_estado_fecha ON consultas_bot(estado, creado_en DESC)`);
  console.log("Base de datos preparada.");
}

async function cargarConfiguracionBot() {
  const r = await pool.query("SELECT clave, valor FROM chatbot_config");
  const data = Object.fromEntries(r.rows.map(x => [x.clave, x.valor]));
  const legacy = await pool.query("SELECT nombre_bot,mensaje_bienvenida,mensaje_despedida,mensaje_sin_respuesta FROM configuracion_bot WHERE id=1");
  const old = legacy.rows[0] || {};
  configuracionCache = {
    nombre_bot: data.nombre_bot || old.nombre_bot || configuracionCache.nombre_bot,
    mensaje_bienvenida: data.mensaje_bienvenida || old.mensaje_bienvenida || configuracionCache.mensaje_bienvenida,
    mensaje_despedida: data.mensaje_despedida || old.mensaje_despedida || configuracionCache.mensaje_despedida,
    mensaje_sin_respuesta: data.mensaje_sin_respuesta || old.mensaje_sin_respuesta || configuracionCache.mensaje_sin_respuesta
  };
}

async function sincronizarSubmenusProgramas() {
  const roots = await pool.query("SELECT id,contenido FROM contenido_bot WHERE categoria='menu' AND parent_id IS NULL AND activo=TRUE ORDER BY orden,id");
  const root = roots.rows.find(row => leerContenido(row.contenido)?.accion === "programas");
  if (!root) return;

  const childrenResult = await pool.query("SELECT id,titulo,contenido,activo FROM contenido_bot WHERE categoria='menu' AND parent_id=$1 ORDER BY orden,id", [root.id]);
  const children = childrenResult.rows.map(row => ({ ...row, data: leerContenido(row.contenido) || {} }));
  const names = new Set(programas.map(p => p.nombre));

  for (let i = 0; i < programas.length; i++) {
    const p = programas[i];
    const existing = children.find(child => child.data.accion === "programa" && child.data.programa === p.nombre);
    const data = JSON.stringify({ accion: "programa", programa: p.nombre, descripcion: "Consulta horario, descripción y grabaciones." });
    if (existing) {
      await pool.query("UPDATE contenido_bot SET titulo=$1,contenido=$2,activo=TRUE,orden=$3,actualizado_en=CURRENT_TIMESTAMP WHERE id=$4", [p.nombre, data, i + 1, existing.id]);
    } else {
      await pool.query("INSERT INTO contenido_bot (categoria,titulo,contenido,activo,orden,parent_id) VALUES ('menu',$1,$2,TRUE,$3,$4)", [p.nombre, data, i + 1, root.id]);
    }
  }

  for (const child of children) {
    if (child.data.accion === "programa" && !names.has(child.data.programa)) {
      await pool.query("UPDATE contenido_bot SET activo=FALSE,actualizado_en=CURRENT_TIMESTAMP WHERE id=$1", [child.id]);
    }
  }
}

async function refrescarContenido() {
  await cargarContenidoBot();
  await sincronizarSubmenusProgramas();
  await cargarContenidoBot();
}

async function inicializarContenidoBot() {
  const programasCount = await pool.query("SELECT COUNT(*)::int total FROM contenido_bot WHERE categoria='programa'");
  if (!programasCount.rows[0].total) {
    for (let i = 0; i < programasIniciales.length; i++) {
      const p = programasIniciales[i];
      const { nombre, ...data } = p;
      await pool.query("INSERT INTO contenido_bot (categoria,titulo,contenido,activo,orden) VALUES ('programa',$1,$2,TRUE,$3)", [nombre, JSON.stringify(data), i + 1]);
    }
  }
  const contactosCount = await pool.query("SELECT COUNT(*)::int total FROM contenido_bot WHERE categoria='contacto'");
  if (!contactosCount.rows[0].total) {
    const contactos = [["facebook", FACEBOOK], ["tiktok", TIKTOK], ["youtube", YOUTUBE], ["web", WEB], ["correo", CORREO], ["maps", MAPS]];
    for (let i = 0; i < contactos.length; i++) await pool.query("INSERT INTO contenido_bot (categoria,titulo,contenido,activo,orden) VALUES ('contacto',$1,$2,TRUE,$3)", [contactos[i][0], contactos[i][1], i + 1]);
  }
  const faqsCount = await pool.query("SELECT COUNT(*)::int total FROM contenido_bot WHERE categoria='faq'");
  if (!faqsCount.rows[0].total) {
    const faqs = [
      ["¿Cómo puedo conocer los horarios de los programas?", "Consulta Programación y programas en el menú principal."],
      ["¿Dónde puedo ver las grabaciones?", "Selecciona el programa que deseas consultar en Programación y programas."],
      ["¿Cómo puedo consultar las portadas de los periódicos?", "Selecciona Noticias y novedades."],
      ["¿Cómo puedo llegar a UPEA TV?", "Consulta Ubicación y contacto."],
      ["¿Cómo puedo contactar con UPEA TV?", "Consulta las redes sociales y el correo en Ubicación y contacto."]
    ];
    for (let i = 0; i < faqs.length; i++) await pool.query("INSERT INTO contenido_bot (categoria,titulo,contenido,activo,orden) VALUES ('faq',$1,$2,TRUE,$3)", [faqs[i][0], faqs[i][1], i + 1]);
  }
  const noticiasCount = await pool.query("SELECT COUNT(*)::int total FROM contenido_bot WHERE categoria='noticia'");
  if (!noticiasCount.rows[0].total) {
    for (let i = 1; i <= 16; i++) await pool.query("INSERT INTO contenido_bot (categoria,titulo,contenido,activo,orden) VALUES ('noticia',$1,$2,TRUE,$3)", [`Periódico ${i}`, JSON.stringify({ url: "" }), i]);
  }

  // Desactiva los menús antiguos para evitar opciones duplicadas, sin borrar el contenido histórico.
  await pool.query("UPDATE contenido_bot SET activo=FALSE WHERE categoria='menu' AND parent_id IS NULL AND titulo = ANY($1::varchar[])", [["principal", "noticias", "contacto", "redes", "admin"]]);
  const defaults = [
    { titulo: "📡 Programación", accion: "programas", descripcion: "Horarios, información y grabaciones." },
    { titulo: "📰 Noticias", accion: "noticias", descripcion: "Portadas y publicaciones de UPEA TV." },
    { titulo: "📍 Ubicación y contacto", accion: "contacto", descripcion: "Cómo llegar, redes sociales y contacto." },
    { titulo: "💬 Consultas e info", accion: "consulta", descripcion: "Consultas e información: envía un mensaje o imágenes." }
  ];
  for (let i = 0; i < defaults.length; i++) {
    const item = defaults[i];
    const exists = await pool.query("SELECT id FROM contenido_bot WHERE categoria='menu' AND parent_id IS NULL AND contenido LIKE $1 LIMIT 1", [`%\"accion\":\"${item.accion}\"%`]);
    if (!exists.rowCount) await pool.query("INSERT INTO contenido_bot (categoria,titulo,contenido,activo,orden) VALUES ('menu',$1,$2,TRUE,$3)", [item.titulo, JSON.stringify({ accion: item.accion, descripcion: item.descripcion }), i + 1]);
    else await pool.query("UPDATE contenido_bot SET activo=TRUE, orden=$1 WHERE id=$2", [i + 1, exists.rows[0].id]);
  }
  await cargarContenidoBot();
  await sincronizarSubmenusProgramas();
  await cargarContenidoBot();
}

async function cargarContenidoBot() {
  const r = await pool.query("SELECT id,categoria,titulo,contenido,activo,orden,parent_id,actualizado_en FROM contenido_bot ORDER BY orden,id");
  const activos = r.rows.filter(x => x.activo);
  programas = activos.filter(x => x.categoria === "programa").map(x => {
    const d = leerContenido(x.contenido) || {};
    return { id: x.id, nombre: x.titulo, dia: d.dia || "Horario pendiente de confirmación", horario: d.horario || "Horario pendiente de confirmación", redes: d.redes || "", contacto: d.contacto || "", descripcion: d.descripcion || "", grabaciones: Array.isArray(d.grabaciones) ? d.grabaciones : [] };
  });
  contenidoCache.menuItems = activos.filter(x => x.categoria === "menu").map(x => ({ ...x, data: leerContenido(x.contenido) }));
  contenidoCache.menu = {};
  for (const x of activos.filter(x => x.categoria === "menu")) contenidoCache.menu[x.titulo] = x.contenido;
  contenidoCache.noticias = activos.filter(x => x.categoria === "noticia").map(x => ({ id: x.id, nombre: x.titulo, ...(leerContenido(x.contenido) || {}) }));
  contenidoCache.faqs = activos.filter(x => x.categoria === "faq").map(x => ({ id: x.id, pregunta: x.titulo, respuesta: x.contenido }));
  contenidoCache.contacto = Object.fromEntries(activos.filter(x => x.categoria === "contacto").map(x => [x.titulo, x.contenido]));
}

async function obtenerSesion(numero) {
  const r = await pool.query("SELECT estado,datos FROM sesiones_bot WHERE numero_usuario=$1", [numero]);
  return r.rows[0] || { estado: "inicio", datos: {} };
}
async function guardarSesion(numero, estado, datos = {}) {
  await pool.query(`INSERT INTO sesiones_bot (numero_usuario,estado,datos,actualizado_en) VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
    ON CONFLICT (numero_usuario) DO UPDATE SET estado=EXCLUDED.estado,datos=EXCLUDED.datos,actualizado_en=CURRENT_TIMESTAMP`, [numero, estado, JSON.stringify(datos)]);
}
async function guardarMensaje(numero, tipo, mensaje) {
  try {
    await pool.query("INSERT INTO mensajes_whatsapp (numero_usuario,tipo,mensaje) VALUES ($1,$2,$3)", [numero, tipo, mensaje]);
  } catch (e) { if (e.code !== "42P01") console.error("Error guardando mensaje:", e.message); }
}
async function guardarConsulta(numero, datos) {
  const r = await pool.query("INSERT INTO consultas_bot (numero_usuario,nombre,motivo,mensaje) VALUES ($1,$2,$3,$4) RETURNING id", [numero, datos.nombre, datos.motivo, datos.mensaje]);
  return r.rows[0].id;
}

async function llamadaMeta(endpoint, options = {}) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("Falta META_ACCESS_TOKEN en las variables de entorno.");
  const response = await fetch(endpoint, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Meta API respondió ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response;
}
async function enviarWhatsApp(numero, texto) {
  const version = process.env.GRAPH_API_VERSION || "v26.0";
  const phoneId = process.env.PHONE_NUMBER_ID;
  if (!phoneId) throw new Error("Falta PHONE_NUMBER_ID.");
  const response = await llamadaMeta(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: numero, type: "text", text: { body: texto } })
  });
  return response.json();
}
async function enviarListaWhatsApp(numero, bodyText, sectionTitle, rows, button = "Ver opciones") {
  const version = process.env.GRAPH_API_VERSION || "v26.0";
  const phoneId = process.env.PHONE_NUMBER_ID;
  if (!phoneId) throw new Error("Falta PHONE_NUMBER_ID.");
  if (!rows.length) return enviarWhatsApp(numero, bodyText);
  const response = await llamadaMeta(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: numero, type: "interactive", interactive: {
      type: "list", body: { text: bodyText.slice(0, 1024) }, action: { button: button.slice(0, 20), sections: [{ title: sectionTitle.slice(0, 24), rows: rows.slice(0, 10).map(row => ({ id: String(row.id).slice(0, 200), title: String(row.title).slice(0, 24), description: String(row.description || "").slice(0, 72) })) }] }
    } })
  });
  return response.json();
}
async function enviarMenuPrincipalWhatsApp(numero) {
  const items = contenidoCache.menuItems.filter(x => x.parent_id === null).slice(0, 10);
  const rows = items.map(x => ({ id: `menu_${x.id}`, title: x.titulo, description: x.data?.descripcion || "Selecciona esta opción." }));
  return enviarListaWhatsApp(numero, `${configuracionCache.nombre_bot}\n\n${configuracionCache.mensaje_bienvenida}\n\n¿En qué podemos ayudarte?`, "Menú principal", rows, "Abrir menú");
}
async function enviarSubmenuWhatsApp(numero, parentId) {
  const parent = contenidoCache.menuItems.find(x => x.id === parentId);
  const children = contenidoCache.menuItems.filter(x => x.parent_id === parentId).slice(0, 10);
  const rows = children.map(x => ({ id: `submenu_${x.id}`, title: x.titulo, description: x.data?.descripcion || "Consultar información." }));
  rows.push({ id: "volver_menu", title: "↩ Volver al menú", description: "Regresar al menú principal." });
  return enviarListaWhatsApp(numero, `${parent?.titulo || "Opciones"}\n\nSelecciona una opción para continuar.`, "Opciones disponibles", rows, "Elegir opción");
}
async function enviarImagenWhatsApp(numero, url, descripcion) {
  const version = process.env.GRAPH_API_VERSION || "v26.0";
  const response = await llamadaMeta(`https://graph.facebook.com/${version}/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: numero, type: "image", image: { link: url, caption: descripcion } })
  });
  return response.json();
}
async function enviarVideoWhatsApp(numero, url, descripcion) {
  const version = process.env.GRAPH_API_VERSION || "v26.0";
  const response = await llamadaMeta(`https://graph.facebook.com/${version}/${process.env.PHONE_NUMBER_ID}/messages`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: numero, type: "video", video: { link: url, caption: descripcion } })
  });
  return response.json();
}

function menuPrincipalTexto() {
  return `📺 *${configuracionCache.nombre_bot.toUpperCase()}*\n\n${configuracionCache.mensaje_bienvenida}\n\n¿En qué podemos ayudarte?\n\n${contenidoCache.menuItems.filter(x => x.parent_id === null).map((x, i) => `${i + 1}. ${x.titulo}`).join("\n")}\n\nEscribe el número de la opción o selecciona una opción del menú.\nEscribe *MENU* en cualquier momento para volver al inicio.`;
}
function detallePrograma(indice) {
  const p = programas[indice];
  if (!p) return "No se encontró el programa solicitado.";
  const grabaciones = p.grabaciones.length ? p.grabaciones.map((g, i) => `${i + 1}. ${g.titulo || `Grabación ${i + 1}`}\n🔗 ${g.url || "Enlace pendiente"}`).join("\n\n") : "Las grabaciones se publicarán próximamente.";
  return `📺 *${p.nombre.toUpperCase()}*\n\n📅 Día de emisión: ${p.dia}\n🕒 Horario: ${p.horario}\n\n📝 *Descripción*\n${p.descripcion || "Información pendiente de actualización."}\n\n🎥 *Grabaciones disponibles*\n${grabaciones}${p.redes ? `\n\n🔗 Enlace del programa: ${p.redes}` : ""}${p.contacto ? `\n📞 Contacto: ${p.contacto}` : ""}\n\nEscribe *0* para volver a Programación y programas o *MENU* para el menú principal.`;
}
function menuContacto() {
  const c = contenidoCache.contacto;
  return `📍 *UBICACIÓN Y CONTACTO*\n\n📺 ¡Visítanos!\n\n📍 *Ubicación del canal*\n🔗 Google Maps:\n${c.maps || MAPS}\n\n🎥 *Video de cómo llegar*\nA continuación recibirás un video para orientarte.\n\n📸 *Fotografías de la entrada*\nTambién te enviaremos fotografías de referencia.\n\n📞 *Contactos y redes sociales*\n\n📘 Facebook:\n${c.facebook || FACEBOOK}\n\n🎵 TikTok:\n${c.tiktok || TIKTOK}\n\n▶️ YouTube:\n${c.youtube || YOUTUBE}\n\n🌐 Página web:\n${c.web || WEB}\n\n✉️ Correo electrónico:\n${c.correo || CORREO}\n\nEscribe *0* para volver al menú principal.`;
}
function menuNoticias() {
  return `📰 *NOTICIAS Y NOVEDADES*\n\n¡Mantente informado con UPEA TV!\n\nTe compartimos las portadas disponibles. 🗞️\n\nEscribe *0* para volver al menú principal.`;
}

async function procesarTexto(numero, texto) {
  const mensaje = String(texto || "").trim();
  const n = normalizar(mensaje);
  let sesion = await obtenerSesion(numero);
  let estado = sesion.estado;
  let datos = sesion.datos || {};

  if (["menu", "inicio", "hola", "buenas", "hi", "hello", "buenos dias", "buenas tardes", "buenas noches"].includes(n)) {
    await guardarSesion(numero, "inicio", {}); return { texto: menuPrincipalTexto(), tipo: "principal" };
  }
  if (["adios", "hasta luego", "hasta pronto"].includes(n)) {
    await guardarSesion(numero, "inicio", {}); return { texto: configuracionCache.mensaje_despedida };
  }
  if (estado === "consulta_adjuntos") {
    if (n === "listo" || n === "terminar" || n === "finalizar" || n === "no") {
      await guardarSesion(numero, "inicio", {});
      return { texto: `${configuracionCache.mensaje_despedida}\n\nTu consulta quedó registrada para que el equipo de UPEA TV pueda revisarla. La atención no es inmediata ni está disponible las 24 horas.\n\nEscribe MENU para volver al menú principal.` };
    }
    return { texto: "Puedes adjuntar una o varias imágenes a esta conversación. Cuando termines, escribe *LISTO* para finalizar." };
  }
  if (n === "0" && estado !== "inicio") {
    if (estado === "detalle_programa") { await guardarSesion(numero, "programas", {}); return { texto: menuProgramasTexto(), tipo: "programas" }; }
    await guardarSesion(numero, "inicio", {}); return { texto: menuPrincipalTexto(), tipo: "principal" };
  }

  if (estado === "inicio") {
    const main = contenidoCache.menuItems.filter(x => x.parent_id === null);
    const index = Number(n) - 1;
    const selected = Number.isInteger(index) ? main[index] : null;
    if (selected) return procesarMenuSeleccion(numero, selected);
    return { texto: menuPrincipalTexto(), tipo: "principal" };
  }

  if (estado === "programas") {
    const index = Number(n) - 1;
    if (Number.isInteger(index) && index >= 0 && index < programas.length) {
      await guardarSesion(numero, "detalle_programa", { programa: index });
      return { texto: detallePrograma(index), tipo: "detalle_programa", indice: index };
    }
    return { texto: "Selecciona un programa de la lista o escribe MENU para volver al menú principal." };
  }
  if (estado === "detalle_programa") {
    await guardarSesion(numero, "programas", {});
    return { texto: menuProgramasTexto(), tipo: "programas" };
  }
  if (estado === "noticias") return { texto: `${menuNoticias()}\n\nEscribe MENU para volver al menú principal.` };
  if (estado === "consulta_nombre") {
    if (mensaje.length < 2 || mensaje.length > 150) return { texto: "Escribe un nombre válido de hasta 150 caracteres." };
    await guardarSesion(numero, "consulta_motivo", { nombre: mensaje });
    return { texto: "📌 Ahora escribe el motivo de tu consulta." };
  }
  if (estado === "consulta_motivo") {
    if (mensaje.length < 2 || mensaje.length > 200) return { texto: "Escribe un motivo válido de hasta 200 caracteres." };
    await guardarSesion(numero, "consulta_mensaje", { ...datos, motivo: mensaje });
    return { texto: "💬 Ahora escribe tu mensaje o consulta para el equipo de UPEA TV." };
  }
  if (estado === "consulta_mensaje") {
    if (mensaje.length < 2 || mensaje.length > 3000) return { texto: "Escribe un mensaje de entre 2 y 3000 caracteres." };
    const consultaId = await guardarConsulta(numero, { ...datos, mensaje });
    await guardarSesion(numero, "consulta_adjuntos", { consulta_id: consultaId });
    return { texto: "✅ Tu consulta fue registrada.\n\nSi deseas, ahora puedes enviar una o varias imágenes para complementar tu consulta. Cuando termines, escribe *LISTO*. Si no necesitas adjuntar imágenes, escribe LISTO para finalizar." };
  }
  if (estado === "faq") {
    const faqs = contenidoCache.faqs;
    const volver = faqs.length + 1;
    if (n === String(volver)) { await guardarSesion(numero, "inicio", {}); return { texto: menuPrincipalTexto(), tipo: "principal" }; }
    return { texto: `${faqs.map((f, i) => `${i + 1}. ${f.pregunta}\n${f.respuesta}`).join("\n\n")}\n\nEscribe ${volver} para volver.` };
  }
  await guardarSesion(numero, "inicio", {});
  return { texto: configuracionCache.mensaje_sin_respuesta };
}
function menuProgramasTexto() {
  return `📡 *PROGRAMACIÓN Y PROGRAMAS*\n\nSelecciona el programa que deseas consultar:\n\n${programas.map((p, i) => `${i + 1}. ${p.nombre}`).join("\n")}\n\nEscribe MENU para volver al menú principal.`;
}
async function procesarMenuSeleccion(numero, item) {
  const action = item.data?.accion || "texto";
  if (action === "programas") {
    await guardarSesion(numero, "programas", {});
    return { texto: menuProgramasTexto(), tipo: "programas", parentId: item.id };
  }
  if (action === "noticias") {
    await guardarSesion(numero, "noticias", {});
    return { texto: menuNoticias(), tipo: "noticias" };
  }
  if (action === "contacto") {
    await guardarSesion(numero, "inicio", {});
    return { texto: menuContacto(), tipo: "contacto" };
  }
  if (action === "consulta") {
    await guardarSesion(numero, "consulta_nombre", {});
    return { texto: "💬 *CONSULTAS E INFORMACIÓN*\n\nEstamos aquí para ayudarte. Para registrar tu consulta, primero escribe tu nombre." };
  }
  if (action === "faq") {
    await guardarSesion(numero, "faq", {});
    const faqs = contenidoCache.faqs;
    return { texto: `❓ *PREGUNTAS FRECUENTES*\n\n${faqs.map((f, i) => `${i + 1}. ${f.pregunta}\n${f.respuesta}`).join("\n\n")}\n\n${faqs.length + 1}. Volver al menú principal` };
  }
  if (action === "programa") {
    const index = programas.findIndex(p => p.nombre === item.data?.programa);
    if (index >= 0) {
      await guardarSesion(numero, "detalle_programa", { programa: index });
      return { texto: detallePrograma(index), tipo: "detalle_programa", indice: index };
    }
    await guardarSesion(numero, "inicio", {});
    return { texto: "Este programa ya no está disponible." };
  }
  if (action === "submenu") {
    await guardarSesion(numero, "submenu", { parent_id: item.id });
    return { texto: item.data?.texto || "Selecciona una opción.", tipo: "submenu", parentId: item.id };
  }
  await guardarSesion(numero, "inicio", {});
  return { texto: item.data?.texto || "Información pendiente de actualización.\n\nEscribe MENU para volver al menú principal." };
}

async function descargarImagenMeta(mediaId) {
  const version = process.env.GRAPH_API_VERSION || "v26.0";
  const metadataResponse = await llamadaMeta(`https://graph.facebook.com/${version}/${mediaId}`);
  const metadata = await metadataResponse.json();
  if (!metadata.url) throw new Error("Meta no devolvió la dirección de la imagen.");
  const imageResponse = await llamadaMeta(metadata.url);
  const arrayBuffer = await imageResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > 5 * 1024 * 1024) throw new Error("La imagen supera el límite permitido de 5 MB.");
  const mimetype = metadata.mime_type || "image/jpeg";
  if (!mimetype.startsWith("image/")) throw new Error("El archivo recibido no es una imagen.");
  return { buffer, mimetype, nombre: `${mediaId}.${mimetype.split("/")[1] || "jpg"}` };
}
async function guardarImagenConsulta(consultaId, mediaId) {
  const total = await pool.query("SELECT COUNT(*)::int total FROM consulta_imagenes WHERE consulta_id=$1", [consultaId]);
  if (total.rows[0].total >= 5) throw new Error("Cada consulta puede incluir como máximo 5 imágenes.");
  const { buffer, mimetype, nombre } = await descargarImagenMeta(mediaId);
  await pool.query("INSERT INTO consulta_imagenes (consulta_id,mimetype,nombre_archivo,imagen,tamano) VALUES ($1,$2,$3,$4,$5)", [consultaId, mimetype, nombre, buffer, buffer.length]);
}

async function enviarContenidoSeleccionado(numero, resultado, estadoAnterior, opcion) {
  if (resultado.tipo === "principal") return enviarMenuPrincipalWhatsApp(numero);
  if (resultado.tipo === "programas") {
    const parentId = resultado.parentId || contenidoCache.menuItems.find(x => x.parent_id === null && x.data?.accion === "programas")?.id;
    if (parentId) return enviarSubmenuWhatsApp(numero, parentId);
    return enviarWhatsApp(numero, resultado.texto);
  }
  if (resultado.tipo === "submenu") return enviarSubmenuWhatsApp(numero, resultado.parentId);
  if (resultado.tipo === "detalle_programa") {
    const p = programas[resultado.indice];
    const imagenes = {
      "Apoyo Legal": "apoyo-legal.jpg", "Mente y Corazón": "mente-corazon.jpg", "ElectroIngenio": "electroingenio.jpg",
      "IUS EX Catedrá": "ius-ex-catedra.jpg", "Raíces Vivas": "raices-vivas.jpg", "Toda Mi Gente": "toda-mi-gente.jpg",
      "Campeones con Altura": "campeones-con-altura.jpg", "Educa Parvulitos": "educa-parvulitos.jpg"
    };
    const archivo = imagenes[p?.nombre];
    if (archivo) {
      try { await enviarImagenWhatsApp(numero, `https://chatbot-upeatv.onrender.com/media/${archivo}`, resultado.texto); return; }
      catch (e) { console.error("No se pudo enviar imagen del programa:", e.message); }
    }
  }
  await enviarWhatsApp(numero, resultado.texto);
  if (resultado.tipo === "noticias") {
    const base = "https://chatbot-upeatv.onrender.com/media/periodicos/";
    for (let i = 0; i < contenidoCache.noticias.length; i++) {
      const noticia = contenidoCache.noticias[i];
      const url = noticia.url || `${base}periodico${i + 1}.jpeg`;
      if (!url) continue;
      try { await enviarImagenWhatsApp(numero, url, `🗞️ ${noticia.nombre} - UPEA TV`); }
      catch (e) { console.error(`Error enviando portada ${i + 1}:`, e.message); }
    }
  }
  if (resultado.tipo === "contacto") {
    const base = "https://chatbot-upeatv.onrender.com/media/ubicacion/";
    try { await enviarVideoWhatsApp(numero, `${base}video1.mp4`, "📍 ¿Cómo llegar a UPEA TV? Mira este video para conocer el recorrido hasta nuestras instalaciones."); }
    catch (e) { console.error("Error enviando video de ubicación:", e.message); }
    for (const foto of ["fotoentrada1.jpg", "fotoentrada2.jpg", "fotoentrada3.jpg", "fotoentrada4.jpg"]) {
      try { await enviarImagenWhatsApp(numero, `${base}${foto}`, `📸 ${foto.replace(".jpg", "")}`); }
      catch (e) { console.error(`Error enviando ${foto}:`, e.message); }
    }
  }
}

// PANEL ADMINISTRATIVO
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/api/admin/session", (req, res) => {
  const token = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  res.json({ autenticado: validarSesion(token) });
});
app.post("/api/admin/login", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
  if (now > attempt.until) { attempt.count = 0; attempt.until = now + 15 * 60 * 1000; }
  if (attempt.count >= 8) return res.status(429).json({ error: "Demasiados intentos. Espera 15 minutos." });
  const user = String(req.body.usuario || "");
  const password = String(req.body.password || "");
  const realUser = String(process.env.ADMIN_USER || "");
  const realPassword = String(process.env.ADMIN_PASSWORD || "");
  const equal = (a, b) => { const aa = Buffer.from(a); const bb = Buffer.from(b); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb); };
  if (!realUser || !realPassword || !process.env.ADMIN_SESSION_SECRET) return res.status(500).json({ error: "Configura ADMIN_USER, ADMIN_PASSWORD y ADMIN_SESSION_SECRET en Render." });
  if (!equal(user, realUser) || !equal(password, realPassword)) { attempt.count++; loginAttempts.set(ip, attempt); return res.status(401).json({ error: "Usuario o contraseña incorrectos." }); }
  loginAttempts.delete(ip);
  const token = firmarSesion({ usuario: realUser, exp: Date.now() + ADMIN_SESSION_MS });
  res.cookie(ADMIN_COOKIE, token, { httpOnly: true, secure: req.secure, sameSite: "strict", maxAge: ADMIN_SESSION_MS, path: "/" });
  res.json({ ok: true });
});
app.post("/api/admin/logout", exigirAdministrador, (req, res) => { res.clearCookie(ADMIN_COOKIE, { httpOnly: true, secure: req.secure, sameSite: "strict", path: "/" }); res.json({ ok: true }); });
app.get("/api/admin/dashboard", exigirAdministrador, async (_req, res) => {
  try {
    const counts = await pool.query("SELECT categoria,COUNT(*)::int total FROM contenido_bot WHERE activo=TRUE GROUP BY categoria");
    const data = Object.fromEntries(counts.rows.map(x => [x.categoria, x.total]));
    const pending = await pool.query("SELECT COUNT(*)::int total FROM consultas_bot WHERE estado='pendiente'");
    const total = await pool.query("SELECT COUNT(*)::int total FROM consultas_bot");
    res.json({ programas: data.programa || 0, noticias: data.noticia || 0, preguntas: data.faq || 0, menus: data.menu || 0, consultasPendientes: pending.rows[0].total, consultas: total.rows[0].total });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo cargar el resumen." }); }
});
app.get("/api/admin/config", exigirAdministrador, async (_req, res) => { await cargarConfiguracionBot(); res.json(configuracionCache); });
app.put("/api/admin/config", exigirAdministrador, async (req, res) => {
  const keys = ["nombre_bot", "mensaje_bienvenida", "mensaje_despedida", "mensaje_sin_respuesta"];
  const values = req.body || {};
  for (const key of keys) {
    if (typeof values[key] !== "string" || !values[key].trim()) return res.status(400).json({ error: `El campo ${key} es obligatorio.` });
    if (values[key].length > (key === "nombre_bot" ? 80 : 2000)) return res.status(400).json({ error: `El campo ${key} supera la longitud permitida.` });
  }
  try {
    for (const key of keys) await pool.query("INSERT INTO chatbot_config (clave,valor,actualizado_en) VALUES ($1,$2,CURRENT_TIMESTAMP) ON CONFLICT (clave) DO UPDATE SET valor=EXCLUDED.valor,actualizado_en=CURRENT_TIMESTAMP", [key, values[key].trim()]);
    await pool.query("UPDATE configuracion_bot SET nombre_bot=$1,mensaje_bienvenida=$2,mensaje_despedida=$3,mensaje_sin_respuesta=$4,actualizado_en=CURRENT_TIMESTAMP WHERE id=1", keys.map(k => values[k].trim()));
    await cargarConfiguracionBot(); res.json({ ok: true, mensaje: "Configuración guardada." });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo guardar la configuración." }); }
});
app.get("/api/admin/content", exigirAdministrador, async (req, res) => {
  const categoria = String(req.query.categoria || "");
  if (!ADMIN_CATEGORIES.includes(categoria)) return res.status(400).json({ error: "Categoría no válida." });
  try {
    const r = await pool.query("SELECT id,categoria,titulo,contenido,activo,orden,parent_id,actualizado_en FROM contenido_bot WHERE categoria=$1 ORDER BY parent_id NULLS FIRST,orden,id", [categoria]);
    res.json(r.rows.map(x => ({ ...x, contenido: leerContenido(x.contenido) })));
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo consultar el contenido." }); }
});
app.post("/api/admin/content", exigirAdministrador, async (req, res) => {
  const { categoria, titulo, contenido, activo = true, orden = 1, parent_id = null } = req.body || {};
  if (!ADMIN_CATEGORIES.includes(categoria)) return res.status(400).json({ error: "Categoría no válida." });
  if (!String(titulo || "").trim()) return res.status(400).json({ error: "El título es obligatorio." });
  if (categoria === "menu" && String(titulo).trim().length > 24) return res.status(400).json({ error: "El título del menú o submenú debe tener máximo 24 caracteres para WhatsApp." });
  if (categoria === "programa" && String(titulo).trim().length > 24) return res.status(400).json({ error: "El nombre del programa debe tener máximo 24 caracteres para WhatsApp." });
  if (categoria === "programa") {
    const count = await pool.query("SELECT COUNT(*)::int total FROM contenido_bot WHERE categoria='programa' AND activo=TRUE");
    if (count.rows[0].total >= 8) return res.status(400).json({ error: "WhatsApp permite hasta 8 programas activos en este menú." });
  }
  if (categoria === "menu") {
    const data = typeof contenido === "string" ? leerContenido(contenido) : (contenido || {});
    const action = data?.accion || "texto";
    if (!["programas", "noticias", "contacto", "consulta", "submenu", "faq", "programa", "texto"].includes(action)) return res.status(400).json({ error: "Selecciona un tipo de acción válido." });
    if (action === "programa" && (parent_id === null || !String(data.programa || "").trim())) return res.status(400).json({ error: "Vincula el submenú con un programa y un menú principal." });
    if (["programas", "submenu"].includes(action) && parent_id !== null) return res.status(400).json({ error: "Esta acción debe configurarse en un menú principal." });
    if (parent_id !== null) {
      const parent = await pool.query("SELECT id FROM contenido_bot WHERE id=$1 AND categoria='menu' AND parent_id IS NULL AND activo=TRUE", [Number(parent_id)]);
      if (!parent.rowCount) return res.status(400).json({ error: "Selecciona un menú principal válido para el submenú." });
    }
    const count = await pool.query("SELECT COUNT(*)::int total FROM contenido_bot WHERE categoria='menu' AND activo=TRUE AND parent_id IS NOT DISTINCT FROM $1", [parent_id === null ? null : Number(parent_id)]);
    const limit = parent_id === null ? 10 : 9;
    if (count.rows[0].total >= limit && activo) return res.status(400).json({ error: `WhatsApp permite hasta ${limit} opciones activas en este nivel.` });
  }
  const text = typeof contenido === "string" ? contenido : JSON.stringify(contenido ?? {});
  try {
    const r = await pool.query("INSERT INTO contenido_bot (categoria,titulo,contenido,activo,orden,parent_id,actualizado_en) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP) RETURNING id", [categoria, String(titulo).trim(), text, Boolean(activo), Number(orden) || 1, categoria === "menu" && parent_id ? Number(parent_id) : null]);
    await refrescarContenido();
    res.status(201).json({ ok: true, id: r.rows[0].id });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo guardar el registro." }); }
});
app.put("/api/admin/content/:id", exigirAdministrador, async (req, res) => {
  const id = Number(req.params.id);
  const { titulo, contenido, activo = true, orden = 1, parent_id = null } = req.body || {};
  if (!Number.isInteger(id) || id < 1 || !String(titulo || "").trim()) return res.status(400).json({ error: "Datos no válidos." });
  try {
    const existing = await pool.query("SELECT categoria,parent_id FROM contenido_bot WHERE id=$1", [id]);
    if (!existing.rowCount) return res.status(404).json({ error: "Registro no encontrado." });
    const category = existing.rows[0].categoria;
    if (category === "programa" && String(titulo).trim().length > 24) return res.status(400).json({ error: "El nombre del programa debe tener máximo 24 caracteres para WhatsApp." });
    if (category === "menu" && String(titulo).trim().length > 24) return res.status(400).json({ error: "El título del menú o submenú debe tener máximo 24 caracteres para WhatsApp." });
    if (category === "programa" && Boolean(req.body.activo) === true) {
      const count = await pool.query("SELECT COUNT(*)::int total FROM contenido_bot WHERE categoria='programa' AND activo=TRUE AND id<>$1", [id]);
      if (count.rows[0].total >= 8) return res.status(400).json({ error: "WhatsApp permite hasta 8 programas activos." });
    }
    if (category === "menu") {
      const data = typeof contenido === "string" ? leerContenido(contenido) : (contenido || {});
      const action = data?.accion || "texto";
      if (!["programas", "noticias", "contacto", "consulta", "submenu", "faq", "programa", "texto"].includes(action)) return res.status(400).json({ error: "Selecciona un tipo de acción válido." });
      if (action === "programa" && (parent_id === null || !String(data.programa || "").trim())) return res.status(400).json({ error: "Vincula el submenú con un programa y un menú principal." });
      if (["programas", "submenu"].includes(action) && parent_id !== null) return res.status(400).json({ error: "Esta acción debe configurarse en un menú principal." });
      if (parent_id !== null && Number(parent_id) === id) return res.status(400).json({ error: "Un menú no puede ser su propio submenú." });
      if (parent_id !== null) {
        const parent = await pool.query("SELECT id FROM contenido_bot WHERE id=$1 AND categoria='menu' AND parent_id IS NULL AND activo=TRUE", [Number(parent_id)]);
        if (!parent.rowCount) return res.status(400).json({ error: "El menú principal seleccionado no es válido." });
      }
      if (Boolean(activo)) {
        const count = await pool.query("SELECT COUNT(*)::int total FROM contenido_bot WHERE categoria='menu' AND activo=TRUE AND parent_id IS NOT DISTINCT FROM $1 AND id<>$2", [parent_id === null ? null : Number(parent_id), id]);
        const limit = parent_id === null ? 10 : 9;
        if (count.rows[0].total >= limit) return res.status(400).json({ error: `WhatsApp permite hasta ${limit} opciones activas en este nivel.` });
      }
    }
    const text = typeof contenido === "string" ? contenido : JSON.stringify(contenido ?? {});
    await pool.query("UPDATE contenido_bot SET titulo=$1,contenido=$2,activo=$3,orden=$4,parent_id=$5,actualizado_en=CURRENT_TIMESTAMP WHERE id=$6", [String(titulo).trim(), text, Boolean(activo), Number(orden) || 1, category === "menu" && parent_id ? Number(parent_id) : null, id]);
    await refrescarContenido(); res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo actualizar el registro." }); }
});
app.delete("/api/admin/content/:id", exigirAdministrador, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Identificador no válido." });
  try {
    const r = await pool.query("DELETE FROM contenido_bot WHERE id=$1 AND categoria=ANY($2::varchar[])", [id, ADMIN_CATEGORIES]);
    if (!r.rowCount) return res.status(404).json({ error: "Registro no encontrado." });
    await refrescarContenido(); res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo eliminar el registro." }); }
});

app.get("/api/admin/consultas", exigirAdministrador, async (req, res) => {
  const estado = String(req.query.estado || "todas");
  try {
    const values = [];
    let where = "";
    if (["pendiente", "atendida", "archivada"].includes(estado)) { values.push(estado); where = "WHERE c.estado=$1"; }
    const r = await pool.query(`SELECT c.id,c.numero_usuario,c.nombre,c.motivo,c.mensaje,c.estado,c.creado_en,
      (SELECT COUNT(*)::int FROM consulta_imagenes i WHERE i.consulta_id=c.id) AS imagenes
      FROM consultas_bot c ${where} ORDER BY c.creado_en DESC LIMIT 200`, values);
    res.json(r.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudieron cargar las consultas." }); }
});
app.patch("/api/admin/consultas/:id", exigirAdministrador, async (req, res) => {
  const id = Number(req.params.id);
  const estado = String(req.body.estado || "");
  if (!Number.isInteger(id) || !["pendiente", "atendida", "archivada"].includes(estado)) return res.status(400).json({ error: "Estado o identificador no válido." });
  try {
    const r = await pool.query("UPDATE consultas_bot SET estado=$1,actualizado_en=CURRENT_TIMESTAMP WHERE id=$2 RETURNING id", [estado, id]);
    if (!r.rowCount) return res.status(404).json({ error: "Consulta no encontrada." });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudo actualizar la consulta." }); }
});
app.get("/api/admin/consultas/:id/imagenes", exigirAdministrador, async (req, res) => {
  const id = Number(req.params.id);
  try {
    const r = await pool.query("SELECT id,nombre_archivo,mimetype,tamano,creado_en FROM consulta_imagenes WHERE consulta_id=$1 ORDER BY id", [id]);
    res.json(r.rows.map(x => ({ ...x, url: `/api/admin/consultas/${id}/imagenes/${x.id}` })));
  } catch (e) { console.error(e); res.status(500).json({ error: "No se pudieron consultar las imágenes." }); }
});
app.get("/api/admin/consultas/:id/imagenes/:imagenId", exigirAdministrador, async (req, res) => {
  try {
    const r = await pool.query("SELECT mimetype,nombre_archivo,imagen FROM consulta_imagenes WHERE id=$1 AND consulta_id=$2", [Number(req.params.imagenId), Number(req.params.id)]);
    if (!r.rowCount) return res.sendStatus(404);
    res.setHeader("Content-Type", r.rows[0].mimetype);
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(r.rows[0].nombre_archivo)}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(r.rows[0].imagen);
  } catch (e) { console.error(e); res.sendStatus(500); }
});

app.post("/api/admin/upload", exigirAdministrador, (req, res, next) => subirImagen.single("imagen")(req, res, e => e ? res.status(400).json({ error: e.message }) : next()), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Selecciona una imagen." });
  res.status(201).json({ ok: true, nombre: req.file.filename, url: `/media/uploads/${req.file.filename}` });
});
app.get("/api/admin/imagenes", exigirAdministrador, (_req, res) => {
  try { res.json(fs.readdirSync(directorioImagenes).filter(n => /\.(jpg|jpeg|png|webp)$/i.test(n)).map(nombre => ({ nombre, url: `/media/uploads/${nombre}` })).reverse()); }
  catch (e) { console.error(e); res.status(500).json({ error: "No se pudieron consultar las imágenes." }); }
});
app.delete("/api/admin/imagenes/:nombre", exigirAdministrador, (req, res) => {
  const nombre = path.basename(req.params.nombre);
  if (nombre !== req.params.nombre) return res.status(400).json({ error: "Nombre de archivo no válido." });
  const file = path.join(directorioImagenes, nombre);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "La imagen no existe." });
  fs.unlinkSync(file); res.json({ ok: true });
});

app.get("/", (_req, res) => res.send("Chatbot UPEA TV funcionando correctamente. Panel: /admin"));
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) return res.status(200).send(req.query["hub.challenge"]);
  res.sendStatus(403);
});
app.post("/webhook", (req, res) => {
  res.sendStatus(200);
  procesarWebhook(req.body).catch(e => console.error("Error procesando webhook:", e));
});

async function procesarWebhook(body) {
  for (const entry of body.entry || []) for (const change of entry.changes || []) for (const mensaje of change.value?.messages || []) {
    const numero = mensaje.from;
    if (!numero) continue;
    try {
      const sesion = await obtenerSesion(numero);
      if (mensaje.type === "image") {
        if (sesion.estado !== "consulta_adjuntos" || !sesion.datos?.consulta_id) {
          await enviarWhatsApp(numero, "Para adjuntar imágenes, primero inicia una consulta desde *Consultas e información* y escribe tu mensaje.");
          continue;
        }
        try {
          await guardarImagenConsulta(sesion.datos.consulta_id, mensaje.image?.id);
          await guardarMensaje(numero, "entrada_imagen", `Imagen recibida para consulta ${sesion.datos.consulta_id}`);
          await enviarWhatsApp(numero, "📸 Imagen recibida y adjuntada a tu consulta. Puedes enviar otra imagen o escribir *LISTO* para finalizar.");
        } catch (e) {
          console.error("Error guardando imagen recibida:", e);
          await enviarWhatsApp(numero, "No pude guardar esa imagen. Intenta enviarla nuevamente o escribe LISTO para finalizar.");
        }
        continue;
      }
      if (mensaje.type !== "text" && mensaje.type !== "interactive") continue;
      let texto = mensaje.text?.body || "";
      let selectedMenuId = null;
      let selectedSubmenuId = null;
      if (mensaje.type === "interactive") {
        const id = mensaje.interactive?.list_reply?.id || "";
        if (id === "volver_menu") texto = "MENU";
        else if (id.startsWith("menu_")) selectedMenuId = Number(id.slice(5));
        else if (id.startsWith("submenu_")) selectedSubmenuId = Number(id.slice(8));
        else continue;
      }
      await guardarMensaje(numero, "entrada", texto || (selectedMenuId ? `menu_${selectedMenuId}` : `submenu_${selectedSubmenuId}`));
      let resultado;
      const estadoAnterior = sesion.estado;
      if (selectedMenuId) {
        const item = contenidoCache.menuItems.find(x => x.id === selectedMenuId && x.parent_id === null);
        if (!item) { resultado = { texto: menuPrincipalTexto(), tipo: "principal" }; await guardarSesion(numero, "inicio", {}); }
        else resultado = await procesarMenuSeleccion(numero, item);
      } else if (selectedSubmenuId) {
        const item = contenidoCache.menuItems.find(x => x.id === selectedSubmenuId && x.parent_id !== null);
        if (item) resultado = await procesarMenuSeleccion(numero, item);
        else resultado = { texto: "No encontré esa opción. Escribe MENU para volver." };
      } else resultado = await procesarTexto(numero, texto);
      await enviarContenidoSeleccionado(numero, resultado, estadoAnterior, texto);
      await guardarMensaje(numero, "salida", resultado.texto || "Respuesta enviada.");
    } catch (e) {
      console.error("Error procesando mensaje de WhatsApp:", e);
      try { await enviarWhatsApp(numero, "Ocurrió un problema al procesar tu mensaje. Intenta nuevamente o escribe MENU."); } catch {}
    }
  }
}

app.get("/db-test", async (_req, res) => {
  try { const r = await pool.query("SELECT NOW() fecha"); res.json({ estado: "conectado", baseDatos: r.rows[0] }); }
  catch (e) { console.error(e); res.status(500).json({ error: "No se pudo conectar con la base de datos." }); }
});

prepararBaseDatos()
  .then(inicializarContenidoBot)
  .then(cargarConfiguracionBot)
  .then(() => app.listen(PORT, "0.0.0.0", () => console.log(`Chatbot UPEA TV activo en el puerto ${PORT}`)))
  .catch(error => { console.error("No se pudo preparar la base de datos:", error); process.exit(1); });
