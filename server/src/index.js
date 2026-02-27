import express from "express";
import cors from "cors";
import { containerRouter } from "./routes/container.routes.js";
import { problemRouter } from "./routes/problem.routes.js";
import { executionRouter } from "./routes/execution.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/containers", containerRouter);
app.use("/api/problems", problemRouter);
app.use("/api/executions", executionRouter);

app.get("/", (req, res) => {
  res.send("API running");
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
