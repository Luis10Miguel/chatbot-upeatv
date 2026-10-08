const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Chatbot UPEA TV funcionando correctamente");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});