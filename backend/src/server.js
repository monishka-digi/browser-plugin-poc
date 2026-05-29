const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const loggerMiddleware = require("./middleware/loggerMiddleware");
const errorMiddleware = require("./middleware/errorMiddleware");

const authRoutes = require("./routes/authRoutes");
const recordsRoutes = require("./routes/recordsRoutes");

const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const app = express();

const swaggerDocument = YAML.load(
  path.resolve(__dirname, "./docs/swagger.yaml")
);

// Enable CORS
app.use(cors());


// Parse JSON
app.use(express.json());


// Request Logger
app.use(loggerMiddleware);

// Swagger UI
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument)
);

// Routes
app.use("/", authRoutes);
app.use("/records", recordsRoutes);


// Health Check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Grace Mock API Running"
  });
});


// Error Middleware
app.use(errorMiddleware);

module.exports = app;
