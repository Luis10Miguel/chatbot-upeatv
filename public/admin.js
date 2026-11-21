const $ = (selector) => document.querySelector(selector);
const state = { page: "dashboard", category: null, records: [], editingId: null, consultations: [], currentConsultation: null };
const pages = {
  programa: { title: "Programación y programas", description: "Administra horarios, descripciones, enlaces y grabaciones.", hint: "Toda la información de cada programa se muestra dentro de Programación y programas." },
  menu: { title: "Menús y submenús", description: "Crea, modifica, ordena y elimina las opciones que aparecen en WhatsApp.", hint: "Los menús principales aparecen al inicio. Puedes crear submenús seleccionando un menú principal. Los submenús automáticos de programas se actualizan desde Programación y programas." },
  noticia: { title: "Noticias y portadas", description: "Administra las portadas que se comparten en Noticias y novedades.", hint: "Las imágenes deben tener una dirección pública HTTPS para que WhatsApp pueda enviarlas." },
  contacto: { title: "Ubicación y contactos", description: "Actualiza la ubicación, redes sociales, correo y otros datos de contacto.", hint: "Las redes sociales se muestran únicamente en Ubicación y contacto." },
  faq: { title: "Preguntas frecuentes", description: "Agrega y actualiza respuestas para las dudas habituales.", hint: "Estas preguntas se mantienen como contenido administrable del chatbot." }
};

function notify(message) {
  const toast = $("#toast"); toast.textContent = message; toast.classList.add("show");
  clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}
async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(url, { credentials: "same-origin", ...options, headers });
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
  const button = $("#loginBtn"); button.disabled = true;
  try {
    await api("/api/admin/login", { method: "POST", body: JSON.stringify({ usuario: $("#username").value.trim(), password: $("#password").value }) });
    $("#password").value = ""; showApp(); await loadDashboard();
  } catch (e) { $("#loginError").textContent = e.message; }
  finally { button.disabled = false; }
});
$("#logoutBtn").addEventListener("click", async () => {
  try { await api("/api/admin/logout", { method: "POST", body: "{}" }); } catch {}
  showLogin(); notify("Sesión cerrada.");
});

document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => showPage(button.dataset.page)));
document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => showPage(button.dataset.go)));

async function loadDashboard() {
  try {
    const data = await api("/api/admin/dashboard");
    $("#statProgramas").textContent = data.programas;
    $("#statNoticias").textContent = data.noticias;
    $("#statFaq").textContent = data.preguntas;
    $("#statConsultas").textContent = data.consultasPendientes;
    $("#pendingBadge").textContent = data.consultasPendientes;
    showPage("dashboard");
  } catch (e) { notify(e.message); }
}
$("#refreshDashboard").addEventListener("click", loadDashboard);
function showPage(page) {
  state.page = page;
  $("#dashboardPage").classList.toggle("hidden", page !== "dashboard");
  $("#contentPage").classList.toggle("hidden", !pages[page]);
  $("#consultasPage").classList.toggle("hidden", page !== "consultas");
  $("#imagenesPage").classList.toggle("hidden", page !== "imagenes");
  $("#configPage").classList.toggle("hidden", page !== "config");
  document.querySelectorAll(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  const titles = { dashboard: "Resumen general", consultas: "Consultas recibidas", imagenes: "Biblioteca de imágenes", config: "Configuración" };
  $("#topTitle").textContent = pages[page]?.title || titles[page] || "Panel administrativo";
  if (pages[page]) loadCategory(page);
  if (page === "consultas") loadConsultas();
  if (page === "imagenes") cargarImagenes();
  if (page === "config") loadConfig();
}

async function loadCategory(category) {
  state.category = category;
  $("#contentTitle").textContent = pages[category].title;
  $("#contentDescription").textContent = pages[category].description;
  $("#contentEyebrow").textContent = "ADMINISTRACIÓN DE CONTENIDO";
  $("#addBtn").textContent = category === "menu" ? "＋ Nuevo menú o submenú" : category === "contacto" ? "＋ Nuevo contacto" : "＋ Nuevo registro";
  try {
    state.records = await api(`/api/admin/content?categoria=${encodeURIComponent(category)}`);
    renderRecords();
  } catch (e) { notify(e.message); }
}
function parseMenu(record) {
  if (typeof record.contenido === "object" && record.contenido) return record.contenido;
  try { return JSON.parse(record.contenido); } catch { return { accion: "texto", texto: record.contenido }; }
}
function displayContent(record) {
  const c = record.contenido;
  if (state.category === "programa") return [c.dia, c.horario, c.descripcion].filter(Boolean).join(" · ");
  if (state.category === "noticia") return c?.url || "Sin enlace de imagen configurado";
  if (state.category === "faq") return c;
  if (state.category === "contacto") return c;
  if (state.category === "menu") {
    const data = parseMenu(record);
    const actionNames = { programas: "Abre la lista de programas", noticias: "Muestra noticias y portadas", contacto: "Muestra ubicación y redes", consulta: "Inicia el formulario de consulta", programa: "Abre el detalle de un programa", texto: "Muestra un mensaje" };
    return `${record.parent_id ? "↳ Submenú" : "Menú principal"} · ${actionNames[data.accion] || "Opción"}${data.descripcion ? ` · ${data.descripcion}` : ""}`;
  }
  return c;
}
function renderRecords() {
  const root = $("#records"); root.innerHTML = "";
  const records = [...state.records];
  if (state.category === "menu") records.sort((a, b) => (a.parent_id ?? 0) - (b.parent_id ?? 0) || a.orden - b.orden);
  $("#emptyState").classList.toggle("hidden", records.length > 0);
  for (const record of records) {
    const card = document.createElement("article"); card.className = `record-card${state.category === "menu" && record.parent_id ? " child-record" : ""}`;
    const info = document.createElement("div"); info.className = "record-info";
    const title = document.createElement("h3"); title.textContent = `${record.parent_id ? "↳ " : ""}${record.titulo}`;
    const desc = document.createElement("p"); desc.textContent = `${displayContent(record) || "Sin contenido"}${record.activo ? "" : " · Desactivado"}`;
    info.append(title, desc);
    const actions = document.createElement("div"); actions.className = "record-actions";
    const edit = document.createElement("button"); edit.className = "mini-btn"; edit.textContent = "Editar"; edit.addEventListener("click", async () => { if (state.category === "menu") await loadProgramOptions(); openEditor(record); });
    const del = document.createElement("button"); del.className = "mini-btn delete"; del.textContent = "Eliminar"; del.addEventListener("click", () => deleteRecord(record));
    actions.append(edit, del); card.append(info, actions); root.append(card);
  }
  $("#contentNotice").classList.remove("hidden"); $("#contentNotice").textContent = pages[state.category].hint;
}

function addField(container, label, name, value = "", options = {}) {
  const wrap = document.createElement("div"); wrap.className = `field${options.wide ? " wide" : ""}`;
  const lab = document.createElement("label"); lab.textContent = label; lab.htmlFor = `field-${name}`;
  let input;
  if (options.select) {
    input = document.createElement("select");
    for (const opt of options.select) { const o = document.createElement("option"); o.value = opt.value; o.textContent = opt.label; input.append(o); }
    input.value = value ?? "";
  } else if (options.textarea) { input = document.createElement("textarea"); input.value = value ?? ""; }
  else { input = document.createElement("input"); input.type = options.type || "text"; input.value = value ?? ""; }
  input.id = `field-${name}`; input.name = name;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.required) input.required = true;
  if (options.maxlength) input.maxLength = options.maxlength;
  if (options.help) { const help = document.createElement("small"); help.textContent = options.help; wrap.append(lab, input, help); }
  else wrap.append(lab, input);
  container.append(wrap); return input;
}
function openEditor(record = null) {
  state.editingId = record?.id ?? null;
  const category = state.category; const fields = $("#editorFields"); fields.innerHTML = "";
  const content = record?.contenido ?? (category === "programa" ? { dia: "", horario: "", redes: "", contacto: "", descripcion: "", grabaciones: [] } : category === "noticia" ? { url: "" } : category === "menu" ? { accion: "texto", descripcion: "", texto: "" } : "");
  $("#editorTitle").textContent = record ? `Editar: ${record.titulo}` : `Nuevo registro · ${pages[category].title}`;
  if (category === "programa") {
    addField(fields, "Nombre del programa (máximo 24 caracteres)", "titulo", record?.titulo || "", { required: true, wide: true, maxlength: 24 });
    addField(fields, "Día de emisión", "dia", content.dia);
    addField(fields, "Horario", "horario", content.horario);
    addField(fields, "Enlace del programa", "redes", content.redes, { wide: true });
    addField(fields, "Contacto del programa", "contacto", content.contacto, { wide: true });
    addField(fields, "Descripción", "descripcion", content.descripcion, { textarea: true, wide: true });
    addField(fields, "Grabaciones (JSON)", "grabaciones", JSON.stringify(content.grabaciones || [], null, 2), { textarea: true, wide: true, help: 'Ejemplo: [{"titulo":"Programa 1","url":"https://..."}]' });
  } else if (category === "menu") {
    addField(fields, "Nombre que verá el usuario", "titulo", record?.titulo || "", { required: true, wide: true, maxlength: 24 });
    const parentOptions = [{ value: "", label: "Menú principal (sin padre)" }, ...state.records.filter(x => x.parent_id === null && x.activo && x.id !== record?.id).map(x => ({ value: String(x.id), label: x.titulo }))];
    addField(fields, "Ubicación", "parent_id", record?.parent_id ? String(record.parent_id) : "", { select: parentOptions, wide: true, help: "Elige un menú principal para crear un submenú. Déjalo vacío para crear una opción principal." });
    addField(fields, "Tipo de acción", "accion", content.accion || "texto", { select: [
      { value: "programas", label: "Mostrar programación y programas" }, { value: "noticias", label: "Mostrar noticias y portadas" },
      { value: "contacto", label: "Mostrar ubicación y contactos" }, { value: "consulta", label: "Iniciar consultas e información" },
      { value: "submenu", label: "Abrir un submenú" }, { value: "faq", label: "Mostrar preguntas frecuentes" },
      { value: "programa", label: "Mostrar detalle de un programa (submenú)" }, { value: "texto", label: "Mostrar un mensaje personalizado" }
    ], wide: true });
    addField(fields, "Descripción corta", "descripcion", content.descripcion || "", { wide: true, maxlength: 72 });
    addField(fields, "Programa vinculado (si corresponde)", "programa", content.programa || "", { select: [{ value: "", label: "No vincular" }, ...stateProgramOptions()], wide: true });
    addField(fields, "Mensaje personalizado", "texto", content.texto || "", { textarea: true, wide: true, help: "Se utiliza cuando el tipo de acción es Mostrar un mensaje personalizado." });
  } else if (category === "noticia") {
    addField(fields, "Nombre de la portada", "titulo", record?.titulo || "", { required: true, wide: true });
    addField(fields, "URL pública de la imagen", "url", content.url || "", { wide: true, placeholder: "https://..." });
  } else if (category === "faq") {
    addField(fields, "Pregunta", "titulo", record?.titulo || "", { required: true, wide: true });
    addField(fields, "Respuesta", "contenido", record?.contenido || "", { textarea: true, wide: true, required: true });
  } else if (category === "contacto") {
    addField(fields, "Identificador (facebook, tiktok, youtube, web, correo, maps)", "titulo", record?.titulo || "", { required: true, wide: true, help: "Utiliza una clave corta y única para identificar este dato." });
    addField(fields, "Enlace o dato de contacto", "contenido", record?.contenido || "", { wide: true, required: true });
  }
  const activeWrap = document.createElement("label"); activeWrap.className = "check-field wide";
  const active = document.createElement("input"); active.type = "checkbox"; active.name = "activo"; active.checked = record ? record.activo : true;
  activeWrap.append(active, document.createTextNode("Registro activo")); fields.append(activeWrap);
  addField(fields, "Orden de visualización", "orden", record?.orden ?? state.records.length + 1, { type: "number" });
  $("#editorError").textContent = ""; $("#editorModal").classList.remove("hidden");
}
function stateProgramOptions() {
  return state.programasForMenu || [];
}
async function loadProgramOptions() {
  try {
    const records = await api("/api/admin/content?categoria=programa");
    state.programasForMenu = records.filter(x => x.activo).map(x => ({ value: x.titulo, label: x.titulo }));
  } catch { state.programasForMenu = []; }
}
function closeEditor() { $("#editorModal").classList.add("hidden"); }
$("#addBtn").addEventListener("click", async () => { if (state.category === "menu") await loadProgramOptions(); openEditor(); });
$("#closeModal").addEventListener("click", closeEditor); $("#cancelEdit").addEventListener("click", closeEditor);
$("#editorModal").addEventListener("click", e => { if (e.target.dataset.close) closeEditor(); });
$("#editorForm").addEventListener("submit", async event => {
  event.preventDefault(); const form = new FormData(event.currentTarget); const category = state.category;
  const titulo = String(form.get("titulo") || "").trim(); let contenido; let parent_id = null;
  if (category === "programa") {
    let grabaciones; try { grabaciones = JSON.parse(form.get("grabaciones") || "[]"); if (!Array.isArray(grabaciones)) throw new Error(); }
    catch { $("#editorError").textContent = "Las grabaciones deben ser una lista JSON válida."; return; }
    contenido = { dia: form.get("dia"), horario: form.get("horario"), redes: form.get("redes"), contacto: form.get("contacto"), descripcion: form.get("descripcion"), grabaciones };
  } else if (category === "menu") {
    parent_id = form.get("parent_id") ? Number(form.get("parent_id")) : null;
    contenido = { accion: form.get("accion"), descripcion: form.get("descripcion"), texto: form.get("texto"), programa: form.get("programa") };
    if (contenido.accion === "programa" && !contenido.programa) { $("#editorError").textContent = "Selecciona el programa que se vinculará a este submenú."; return; }
  } else if (category === "noticia") contenido = { url: form.get("url") || "" };
  else contenido = String(form.get("contenido") || "").trim();
  const payload = { categoria: category, titulo, contenido, activo: form.get("activo") === "on", orden: Number(form.get("orden") || 1), parent_id };
  const button = $("#saveBtn"); button.disabled = true; button.textContent = "Guardando...";
  try {
    await api(state.editingId ? `/api/admin/content/${state.editingId}` : "/api/admin/content", { method: state.editingId ? "PUT" : "POST", body: JSON.stringify(payload) });
    closeEditor(); await loadCategory(category); await loadDashboardStats(); notify("Cambios guardados correctamente.");
  } catch (e) { $("#editorError").textContent = e.message; }
  finally { button.disabled = false; button.textContent = "Guardar cambios"; }
});
async function deleteRecord(record) {
  const extra = state.category === "menu" && record.parent_id === null ? " También se eliminarán sus submenús." : "";
  if (!confirm(`¿Eliminar "${record.titulo}"?${extra}`)) return;
  try { await api(`/api/admin/content/${record.id}`, { method: "DELETE" }); await loadCategory(state.category); await loadDashboardStats(); notify("Registro eliminado."); }
  catch (e) { notify(e.message); }
}
async function loadDashboardStats() {
  const d = await api("/api/admin/dashboard");
  $("#statProgramas").textContent = d.programas; $("#statNoticias").textContent = d.noticias; $("#statFaq").textContent = d.preguntas;
  $("#statConsultas").textContent = d.consultasPendientes; $("#pendingBadge").textContent = d.consultasPendientes;
}

async function loadConfig() {
  $("#configError").textContent = "";
  try { const d = await api("/api/admin/config"); $("#configNombre").value = d.nombre_bot || ""; $("#configBienvenida").value = d.mensaje_bienvenida || ""; $("#configDespedida").value = d.mensaje_despedida || ""; $("#configFallback").value = d.mensaje_sin_respuesta || ""; }
  catch (e) { $("#configError").textContent = e.message; }
}
$("#configForm").addEventListener("submit", async event => {
  event.preventDefault(); const button = $("#saveConfigBtn"); button.disabled = true; button.textContent = "Guardando...";
  const payload = { nombre_bot: $("#configNombre").value.trim(), mensaje_bienvenida: $("#configBienvenida").value.trim(), mensaje_despedida: $("#configDespedida").value.trim(), mensaje_sin_respuesta: $("#configFallback").value.trim() };
  try { await api("/api/admin/config", { method: "PUT", body: JSON.stringify(payload) }); notify("Configuración guardada."); }
  catch (e) { $("#configError").textContent = e.message; }
  finally { button.disabled = false; button.textContent = "Guardar configuración"; }
});

async function loadConsultas() {
  const list = $("#consultasList"); list.innerHTML = "<p class='muted'>Cargando consultas...</p>";
  try {
    const estado = $("#filterEstado").value;
    state.consultations = await api(`/api/admin/consultas?estado=${encodeURIComponent(estado)}`);
    list.innerHTML = ""; $("#emptyConsultas").classList.toggle("hidden", state.consultations.length > 0);
    for (const c of state.consultations) {
      const card = document.createElement("article"); card.className = "consultation-card";
      const left = document.createElement("div"); const title = document.createElement("h3"); title.textContent = c.nombre || "Usuario sin nombre";
      const desc = document.createElement("p"); desc.textContent = `${c.motivo || "Sin motivo"} · ${c.numero_usuario}`;
      const meta = document.createElement("small"); meta.textContent = `${new Date(c.creado_en).toLocaleString("es-BO")} · ${c.imagenes} imagen(es)`;
      left.append(title, desc, meta);
      const status = document.createElement("span"); status.className = `status-pill ${c.estado}`; status.textContent = c.estado;
      const open = document.createElement("button"); open.className = "mini-btn"; open.textContent = "Ver consulta"; open.addEventListener("click", () => openConsultation(c));
      card.append(left, status, open); list.append(card);
    }
  } catch (e) { list.innerHTML = ""; notify(e.message); }
}
$("#refreshConsultas").addEventListener("click", loadConsultas); $("#filterEstado").addEventListener("change", loadConsultas);
async function openConsultation(c) {
  state.currentConsultation = c; $("#consultationTitle").textContent = `Consulta #${c.id} · ${c.nombre || "Usuario"}`;
  const root = $("#consultationDetail"); root.innerHTML = "<p>Cargando detalle...</p>"; $("#consultationModal").classList.remove("hidden");
  try {
    const images = await api(`/api/admin/consultas/${c.id}/imagenes`);
    root.innerHTML = "";
    const details = document.createElement("div"); details.className = "consultation-detail";
    for (const [label, value] of [["Nombre", c.nombre], ["Número de WhatsApp", c.numero_usuario], ["Motivo", c.motivo], ["Mensaje", c.mensaje], ["Fecha", new Date(c.creado_en).toLocaleString("es-BO")]]) {
      const block = document.createElement("div"); block.className = "detail-field"; const b = document.createElement("b"); b.textContent = label; const p = document.createElement("p"); p.textContent = value || "—"; block.append(b, p); details.append(block);
    }
    root.append(details);
    const h = document.createElement("h3"); h.textContent = `Imágenes adjuntas (${images.length})`; root.append(h);
    if (images.length) {
      const gallery = document.createElement("div"); gallery.className = "consultation-images";
      for (const img of images) { const a = document.createElement("a"); a.href = img.url; a.target = "_blank"; a.rel = "noopener"; const image = document.createElement("img"); image.src = img.url; image.alt = img.nombre_archivo; a.append(image); gallery.append(a); }
      root.append(gallery);
    } else { const p = document.createElement("p"); p.className = "muted"; p.textContent = "Esta consulta no tiene imágenes adjuntas."; root.append(p); }
    const actions = document.createElement("div"); actions.className = "modal-actions";
    const status = document.createElement("select"); for (const value of ["pendiente", "atendida", "archivada"]) { const o = document.createElement("option"); o.value = value; o.textContent = value[0].toUpperCase() + value.slice(1); status.append(o); } status.value = c.estado;
    const save = document.createElement("button"); save.className = "primary"; save.textContent = "Guardar estado"; save.addEventListener("click", async () => { try { await api(`/api/admin/consultas/${c.id}`, { method: "PATCH", body: JSON.stringify({ estado: status.value }) }); notify("Estado actualizado."); $("#consultationModal").classList.add("hidden"); await loadConsultas(); await loadDashboardStats(); } catch (e) { notify(e.message); } });
    actions.append(status, save); root.append(actions);
  } catch (e) { root.textContent = e.message; }
}
function closeConsultation() { $("#consultationModal").classList.add("hidden"); }
$("#closeConsultation").addEventListener("click", closeConsultation); $("#consultationModal").addEventListener("click", e => { if (e.target.dataset.closeConsult) closeConsultation(); });

async function cargarImagenes() {
  const gallery = $("#imageGallery"); gallery.innerHTML = "<p class='muted'>Cargando imágenes...</p>";
  try {
    const images = await api("/api/admin/imagenes"); gallery.innerHTML = ""; $("#emptyImages").classList.toggle("hidden", images.length > 0);
    for (const item of images) {
      const card = document.createElement("article"); card.className = "image-card"; const img = document.createElement("img"); img.src = item.url; img.alt = item.nombre;
      const name = document.createElement("p"); name.textContent = item.nombre;
      const actions = document.createElement("div"); actions.className = "image-actions";
      const use = document.createElement("button"); use.className = "primary"; use.textContent = "Usar en portada"; use.addEventListener("click", async () => { await showPage("noticia"); await openEditor(); const input = document.querySelector('[name="url"]'); if (input) input.value = new URL(item.url, location.origin).href; });
      const del = document.createElement("button"); del.className = "mini-btn delete"; del.textContent = "Eliminar"; del.addEventListener("click", async () => { if (!confirm("¿Eliminar esta imagen?")) return; try { await api(`/api/admin/imagenes/${encodeURIComponent(item.nombre)}`, { method: "DELETE" }); await cargarImagenes(); notify("Imagen eliminada."); } catch (e) { notify(e.message); } });
      actions.append(use, del); card.append(img, name, actions); gallery.append(card);
    }
  } catch (e) { gallery.innerHTML = ""; notify(e.message); }
}
$("#refreshImages").addEventListener("click", cargarImagenes);
$("#imagenArchivo").addEventListener("change", event => {
  const file = event.target.files[0]; const preview = $("#previewImagen"); preview.innerHTML = "";
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { $("#uploadError").textContent = "La imagen supera el límite de 8 MB."; event.target.value = ""; return; }
  const img = document.createElement("img"); img.src = URL.createObjectURL(file); preview.append(img); $("#uploadError").textContent = "";
});
$("#uploadForm").addEventListener("submit", async event => {
  event.preventDefault(); const file = $("#imagenArchivo").files[0]; if (!file) return;
  const data = new FormData(); data.append("imagen", file); const button = $("#uploadBtn"); button.disabled = true; button.textContent = "Subiendo...";
  try { const response = await fetch("/api/admin/upload", { method: "POST", credentials: "same-origin", body: data }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "No se pudo subir la imagen."); $("#uploadForm").reset(); $("#previewImagen").innerHTML = ""; await cargarImagenes(); notify("Imagen subida correctamente."); }
  catch (e) { $("#uploadError").textContent = e.message; }
  finally { button.disabled = false; button.textContent = "Subir imagen"; }
});

checkSession();
