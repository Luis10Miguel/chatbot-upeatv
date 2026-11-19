const $ = (selector) => document.querySelector(selector);
const state = { page: "dashboard", category: null, records: [], editingId: null };
const pages = {
  programa: { title: "Programas", description: "Actualiza horarios, descripciones, enlaces y grabaciones de los programas.", hint: "Los cambios se utilizan en Programación e Información de programas." },
  menu: { title: "Menús y mensajes", description: "Modifica los textos que reciben los usuarios en WhatsApp.", hint: "Edita el texto del menú principal y el mensaje de noticias." },
  noticia: { title: "Noticias y portadas", description: "Administra las portadas que se comparten en la opción Noticias y novedades.", hint: "Utiliza enlaces públicos HTTPS a las imágenes para que WhatsApp pueda descargarlas." },
  faq: { title: "Preguntas frecuentes", description: "Agrega y actualiza las respuestas automáticas a las dudas frecuentes.", hint: "Las preguntas se muestran en el menú de atención al usuario." },
  contacto: { title: "Contactos y redes", description: "Actualiza las redes sociales, el correo y la ubicación de UPEA TV.", hint: "Los enlaces se utilizan en Ubicación y contacto y Redes sociales." }
};

function notify(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  let data = {}; try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || "Ocurrió un error al comunicarse con el servidor.");
  return data;
}
function showLogin() { $("#loginView").classList.remove("hidden"); $("#appView").classList.add("hidden"); }
function showApp() { $("#loginView").classList.add("hidden"); $("#appView").classList.remove("hidden"); }
async function checkSession() {
  try { const r = await api("/api/admin/session"); if (r.autenticado) { showApp(); await loadDashboard(); } else showLogin(); }
  catch { showLogin(); }
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault(); $("#loginError").textContent = "";
  const button = event.submitter; if (button) button.disabled = true;
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ usuario: $("#username").value.trim(), password: $("#password").value }) });
    $("#password").value = ""; showApp(); await loadDashboard();
  } catch (error) { $("#loginError").textContent = error.message; }
  finally { if (button) button.disabled = false; }
});
$("#logoutBtn").addEventListener("click", async () => {
  try { await api("/api/admin/logout", { method: "POST", body: "{}" }); } catch {}
  showLogin(); notify("Sesión cerrada correctamente.");
});

async function loadDashboard() {
  try {
    const data = await api("/api/admin/dashboard");
    $("#statProgramas").textContent = data.programas;
    $("#statNoticias").textContent = data.noticias;
    $("#statFaq").textContent = data.preguntas;
    $("#statConsultas").textContent = data.consultasPendientes;
    showPage("dashboard");
  } catch (error) { notify(error.message); }
}
function showPage(page) {
  state.page = page;
  $("#dashboardPage").classList.toggle("hidden", page !== "dashboard");
  $("#contentPage").classList.toggle("hidden", page === "dashboard");
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.page === page));
  $("#topTitle").textContent = page === "dashboard" ? "Resumen general" : pages[page].title;
  if (page !== "dashboard") loadCategory(page);
}
async function loadCategory(category) {
  state.category = category;
  const config = pages[category];
  $("#contentTitle").textContent = config.title;
  $("#contentDescription").textContent = config.description;
  $("#contentEyebrow").textContent = "ADMINISTRACIÓN DE CONTENIDO";
  $("#addBtn").textContent = category === "contacto" ? "＋ Nuevo contacto" : "＋ Nuevo registro";
  try {
    state.records = await api(`/api/admin/content?categoria=${encodeURIComponent(category)}`);
    renderRecords();
  } catch (error) { notify(error.message); }
}
function displayContent(record) {
  const c = record.contenido;
  if (state.category === "programa") return [c.dia, c.horario, c.descripcion, c.redes].filter(Boolean).join(" · ");
  if (state.category === "noticia") return c?.url || "Sin enlace de imagen configurado";
  if (state.category === "faq") return c;
  if (state.category === "contacto") return c;
  return c;
}
function renderRecords() {
  const root = $("#records"); root.innerHTML = "";
  $("#emptyState").classList.toggle("hidden", state.records.length > 0);
  state.records.forEach(record => {
    const card = document.createElement("article"); card.className = "record-card";
    const info = document.createElement("div"); info.className = "record-info";
    const title = document.createElement("h3"); title.textContent = record.titulo;
    const desc = document.createElement("p"); desc.textContent = `${displayContent(record) || "Sin contenido"}${record.activo ? "" : " · Desactivado"}`;
    info.append(title, desc);
    const actions = document.createElement("div"); actions.className = "record-actions";
    const edit = document.createElement("button"); edit.className = "mini-btn"; edit.textContent = "Editar"; edit.addEventListener("click", () => openEditor(record));
    const del = document.createElement("button"); del.className = "mini-btn delete"; del.textContent = "Eliminar"; del.addEventListener("click", () => deleteRecord(record));
    actions.append(edit, del); card.append(info, actions); root.append(card);
  });
  const old = $("#contentNotice"); old.classList.remove("hidden"); old.innerHTML = `<span>ⓘ</span><p>${pages[state.category].hint}</p>`;
}

function addField(container, label, name, value = "", options = {}) {
  const wrap = document.createElement("div"); wrap.className = `field${options.wide ? " wide" : ""}`;
  const lab = document.createElement("label"); lab.textContent = label; lab.htmlFor = `field-${name}`;
  let input;
  if (options.textarea) { input = document.createElement("textarea"); input.value = value ?? ""; }
  else { input = document.createElement("input"); input.type = options.type || "text"; input.value = value ?? ""; }
  input.id = `field-${name}`; input.name = name; if (options.placeholder) input.placeholder = options.placeholder;
  if (options.required) input.required = true;
  if (options.readOnly) input.readOnly = true;
  wrap.append(lab, input);
  if (options.help) { const help = document.createElement("small"); help.textContent = options.help; wrap.append(help); }
  container.append(wrap); return input;
}
function openEditor(record = null) {
  state.editingId = record?.id ?? null;
  const category = state.category; const fields = $("#editorFields"); fields.innerHTML = "";
  const content = record?.contenido ?? (category === "programa" ? { dia: "", horario: "", redes: "", contacto: "", descripcion: "", grabaciones: [] } : category === "noticia" ? { url: "" } : "");
  $("#editorTitle").textContent = record ? `Editar: ${record.titulo}` : `Nuevo ${category === "programa" ? "programa" : category === "faq" ? "pregunta" : category === "noticia" ? "noticia" : category === "contacto" ? "contacto" : "mensaje"}`;
  addField(fields, category === "faq" ? "Pregunta" : category === "contacto" ? "Identificador del contacto" : category === "menu" ? "Identificador del mensaje" : "Título", "titulo", record?.titulo || "", { required: true, wide: true, readOnly: category === "menu" || (category === "contacto" && Boolean(record)), help: category === "contacto" && !record ? "Usa: facebook, tiktok, youtube, web, correo o maps." : category === "menu" ? "No cambies este identificador porque el chatbot lo utiliza internamente." : "" });
  if (category === "programa") {
    addField(fields, "Día de emisión", "dia", content.dia);
    addField(fields, "Horario", "horario", content.horario);
    addField(fields, "Enlace de redes del programa", "redes", content.redes, { wide: true });
    addField(fields, "Contacto del programa", "contacto", content.contacto, { wide: true });
    addField(fields, "Descripción", "descripcion", content.descripcion, { textarea: true, wide: true });
    addField(fields, "Grabaciones (formato JSON)", "grabaciones", JSON.stringify(content.grabaciones || [], null, 2), { textarea: true, wide: true, help: 'Ejemplo: [{"titulo":"Programa 1","url":"https://..."}]' });
  } else if (category === "noticia") {
    addField(fields, "URL pública de la imagen", "url", content.url || "", { wide: true, placeholder: "https://...", help: "Debe ser un enlace público HTTPS a una imagen." });
  } else if (category === "faq") {
    addField(fields, "Respuesta", "contenido", record?.contenido || "", { textarea: true, wide: true, required: true });
  } else if (category === "contacto") {
    addField(fields, "Enlace o dato de contacto", "contenido", record?.contenido || "", { wide: true, required: true });
  } else {
    addField(fields, "Texto que recibirá el usuario", "contenido", record?.contenido || "", { textarea: true, wide: true, required: true });
  }
  const activeWrap = document.createElement("label"); activeWrap.className = "check-field wide";
  const active = document.createElement("input"); active.type = "checkbox"; active.name = "activo"; active.checked = record ? record.activo : true;
  activeWrap.append(active, document.createTextNode("Registro activo")); fields.append(activeWrap);
  addField(fields, "Orden de visualización", "orden", record?.orden ?? state.records.length + 1, { type: "number" });
  $("#editorError").textContent = ""; $("#editorModal").classList.remove("hidden");
}
function closeEditor() { $("#editorModal").classList.add("hidden"); }
$("#addBtn").addEventListener("click", () => openEditor());
$("#closeModal").addEventListener("click", closeEditor);
$("#cancelEdit").addEventListener("click", closeEditor);
$("#editorModal").addEventListener("click", e => { if (e.target.dataset.close) closeEditor(); });
$("#editorForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = new FormData(event.currentTarget); const category = state.category;
  const titulo = String(form.get("titulo") || "").trim(); let contenido;
  if (category === "programa") {
    let grabaciones; try { grabaciones = JSON.parse(form.get("grabaciones") || "[]"); if (!Array.isArray(grabaciones)) throw new Error(); }
    catch { $("#editorError").textContent = "Las grabaciones deben estar en formato JSON válido y ser una lista."; return; }
    contenido = { dia: form.get("dia"), horario: form.get("horario"), redes: form.get("redes"), contacto: form.get("contacto"), descripcion: form.get("descripcion"), grabaciones };
  } else if (category === "noticia") contenido = { url: form.get("url") || "" };
  else contenido = String(form.get("contenido") || "").trim();
  const payload = { categoria: category, titulo, contenido, activo: form.get("activo") === "on", orden: Number(form.get("orden") || 1) };
  const button = $("#saveBtn"); button.disabled = true; button.textContent = "Guardando...";
  try {
    await api(state.editingId ? `/api/admin/content/${state.editingId}` : "/api/admin/content", { method: state.editingId ? "PUT" : "POST", body: JSON.stringify(payload) });
    closeEditor(); await loadCategory(category); await loadDashboardStatsOnly(); notify("Contenido guardado correctamente.");
  } catch (error) { $("#editorError").textContent = error.message; }
  finally { button.disabled = false; button.textContent = "Guardar cambios"; }
});
async function deleteRecord(record) {
  if (!confirm(`¿Seguro que deseas eliminar "${record.titulo}"? Esta acción no se puede deshacer.`)) return;
  try { await api(`/api/admin/content/${record.id}`, { method: "DELETE" }); await loadCategory(state.category); await loadDashboardStatsOnly(); notify("Registro eliminado."); }
  catch (error) { notify(error.message); }
}
async function loadDashboardStatsOnly() {
  const data = await api("/api/admin/dashboard");
  $("#statProgramas").textContent = data.programas; $("#statNoticias").textContent = data.noticias;
  $("#statFaq").textContent = data.preguntas; $("#statConsultas").textContent = data.consultasPendientes;
}

document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.page)));
document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => showPage(btn.dataset.go)));
checkSession();
