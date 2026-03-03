import http from "http";
import express from "express";
import cors from "cors";
import { createContainerRouter } from "./routes/container.routes.js";
import { problemRouter } from "./routes/problem.routes.js";
import { executionRouter } from "./routes/execution.routes.js";
import { ContainerService } from "./services/container.service.js";
import { setupTerminalWebSocket } from "./terminal-ws.js";

const app = express();
const httpServer = http.createServer(app);

const containerService = new ContainerService();
setupTerminalWebSocket(httpServer, containerService);

app.use(cors());
app.use(express.json());

app.use("/api/containers", createContainerRouter(containerService));
app.use("/api/problems", problemRouter);
app.use("/api/executions", executionRouter);

app.get("/", (req, res) => {
  res.send("API running");
});

httpServer.listen(3000, () => {
  console.log("Server running on port 3000");
});
