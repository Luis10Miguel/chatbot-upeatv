# Panel administrativo UPEA TV

Esta versión agrega el panel `/admin` al chatbot existente. Mantiene Node.js, Express, Neon PostgreSQL, Render y WhatsApp Cloud API. No requiere dependencias nuevas: utiliza `express`, `pg` y `dotenv`, que ya aparecen en el `package.json` recibido.

## Archivos incluidos

- `server.js`: servidor actual ampliado con autenticación y API administrativa.
- `public/admin.html`: pantalla del panel e inicio de sesión.
- `public/css/admin.css`: diseño adaptable.
- `public/js/admin.js`: formularios y comunicación con la API.
- `.env.example`: plantilla de variables; no contiene secretos reales.
- `.gitignore`: excluye `.env` y `node_modules`.

## Antes de reemplazar

1. Haz una copia de seguridad de tu proyecto actual.
2. Conserva tus carpetas `media/` y `public/` con las fotografías y portadas que ya utiliza WhatsApp.
3. Copia los archivos de este paquete sobre tu proyecto. Reemplaza `server.js`; agrega `admin.html`, `css/admin.css` y `js/admin.js` dentro de `public/` sin borrar tus imágenes.
4. Conserva tu `package.json` actual. El script `start` debe ser `node server.js` y las dependencias `dotenv`, `express` y `pg` deben estar instaladas.

## Variables locales

En el archivo `.env` que ya tienes, conserva las variables de Meta y Neon y agrega:

```ini
ADMIN_USER=admin
ADMIN_PASSWORD="CAMBIA_ESTA_POR_UNA_CONTRASENA_LARGA_Y_UNICA"
ADMIN_SESSION_SECRET=PEGA_AQUI_LA_CLAVE_ALEATORIA_GENERADA
```

Genera la clave de sesión en la terminal de VS Code:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Copia el resultado completo en `ADMIN_SESSION_SECRET`. Crea una contraseña larga y única para `ADMIN_PASSWORD`. No compartas esos valores ni los publiques en GitHub.

Comprueba que `.env` esté incluido en `.gitignore`. No reemplaces tu `.env` por `.env.example`: el archivo de ejemplo solo muestra los nombres de las variables.

## Probar localmente

En la terminal de VS Code, dentro de la carpeta del proyecto:

```bash
npm install
npm start
```

Abre `http://localhost:3000/admin`. Inicia sesión con `ADMIN_USER` y `ADMIN_PASSWORD`.

Al arrancar, el servidor crea las tablas que ya utilizaba el chatbot y completa `contenido_bot` con los contenidos iniciales que falten por categoría. Si ya existen filas en una categoría, no las sobrescribe.

## Publicar en Render

1. Abre tu servicio de Render.
2. En **Environment**, agrega `ADMIN_USER`, `ADMIN_PASSWORD` y `ADMIN_SESSION_SECRET` con los mismos valores usados localmente.
3. Verifica que `DATABASE_URL`, `VERIFY_TOKEN`, `META_ACCESS_TOKEN`, `PHONE_NUMBER_ID` y `GRAPH_API_VERSION` sigan configuradas.
4. Guarda los cambios.
5. Sube los archivos modificados a GitHub y espera el despliegue de Render.
6. Abre `https://TU-SERVICIO.onrender.com/admin`.

No cambies el webhook de Meta ni crees otro servicio de Render.

## Qué se puede administrar

- **Programas:** nombre, día, horario, redes, contacto, descripción y grabaciones.
- **Menús y mensajes:** texto principal, mensaje de noticias, encabezados de contacto/redes y texto introductorio del menú de administrador.
- **Noticias y portadas:** título y URL pública de cada imagen. Si la URL está vacía, el bot conserva el comportamiento anterior y busca la portada local `media/periodicos/periodicoN.jpeg`.
- **Preguntas frecuentes:** pregunta y respuesta.
- **Contactos:** Facebook, TikTok, YouTube, página web, correo y Google Maps.

Los cambios guardados actualizan la caché del proceso y se usan en los siguientes mensajes que reciba el chatbot. No hace falta volver a desplegar Render para editar contenido.

## Restricciones importantes de WhatsApp

- Mantén como máximo 8 programas activos en el menú interactivo.
- Los nombres de los programas deben tener hasta 24 caracteres para que se muestren completos en las listas de WhatsApp.
- Para cambiar el texto del menú principal, conserva las cinco opciones y sus números (1 a 5), porque el flujo del chatbot depende de esas opciones.
- Para las portadas, utiliza enlaces HTTPS públicos y directos a imágenes accesibles desde internet.
- El menú de administrador conserva sus opciones interactivas; modifica solo el texto introductorio.

## Seguridad y alcance de esta primera versión

- La contraseña y el secreto se leen desde variables de entorno.
- La sesión se firma con HMAC y se guarda en una cookie `HttpOnly`, `SameSite=Strict` con duración de 8 horas.
- Se limita a 8 intentos de inicio de sesión por IP durante una ventana de 15 minutos.
- El panel tiene un único usuario administrador configurado por variables de entorno.
- La limitación de intentos está en memoria del proceso; para despliegues con varias instancias o requisitos de seguridad superiores conviene incorporar almacenamiento persistente de sesiones y auditoría.

## Comprobaciones

Antes de publicar, ejecuta:

```bash
node --check server.js
```

Si el servidor no inicia, revisa los logs de Render y confirma que `DATABASE_URL` y las variables de entorno estén configuradas correctamente.
