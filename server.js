
require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");

const app = express();

app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL
        ? { rejectUnauthorized: false }
        : undefined
});

app.get("/", (req, res) => {
    res.send("Chatbot UPEA TV funcionando correctamente");
});

app.get("/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS fecha_servidor");

        res.json({
            conectado: true,
            mensaje: "Conexión con PostgreSQL exitosa",
            fecha_servidor: result.rows[0].fecha_servidor
        });
    } catch (error) {
        console.error("Error PostgreSQL:", error.message);

        res.status(500).json({
            conectado: false,
            mensaje: "No se pudo conectar con la base de datos"
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});
