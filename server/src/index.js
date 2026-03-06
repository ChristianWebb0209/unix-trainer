import dotenv from "dotenv";
import http from "http";
import express from "express";
import cors from "cors";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import { createContainerRouter } from "./routes/container.routes.js";
import { problemRouter } from "./routes/problem.routes.js";
import { createValidationRouter } from "./routes/validation.routes.js";
import { completionRouter } from "./routes/completion.routes.js";
import { ContainerService } from "./services/container.service.js";
import { seedProblemsToSupabase } from "./services/problem-seeder.js";
import { setupLSPWebSocket } from "./lsp-ws.js";
import { setupTerminalWebSocket } from "./terminal-ws.js";
import { ensureDockerRunning } from "./utils/docker-health.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  // Ensure Docker is up before we create any containers or accept API traffic.
  try {
    await ensureDockerRunning();
  } catch (err) {
    console.error("[Server] Docker daemon is not available:", err?.message ?? err);
    process.exit(1);
  }

  const app = express();
  const httpServer = http.createServer(app);

  let hasRetriedPort = false;

  const startListening = () => {
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  };

  httpServer.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
      console.error(`[Server] Port ${PORT} is already in use.`);

      if (hasRetriedPort) {
        console.error("[Server] Already tried reclaiming the port. Exiting.");
        process.exit(1);
        return;
      }

      hasRetriedPort = true;

      if (process.platform === "win32") {
        console.error("[Server] Attempting to free port on Windows...");
        const psCommand =
          `Get-NetTCPConnection -LocalPort ${PORT} -State Listen ` +
          "| Select-Object -First 1 -ExpandProperty OwningProcess";

        exec(`powershell -Command "${psCommand}"`, (lookupErr, stdout) => {
          if (lookupErr || !stdout.trim()) {
            console.error("[Server] Could not find owning process for port", PORT);
            console.error("[Server] Please close the other process and restart.");
            process.exit(1);
            return;
          }

          const pid = parseInt(stdout.trim(), 10);
          if (!Number.isFinite(pid)) {
            console.error("[Server] Failed to parse PID from:", stdout);
            process.exit(1);
            return;
          }

          console.error(`[Server] Killing process using port ${PORT} (PID ${pid})...`);
          exec(`taskkill /PID ${pid} /F`, (killErr) => {
            if (killErr) {
              console.error("[Server] Failed to kill process on port", PORT, killErr.message);
              process.exit(1);
              return;
            }

            console.log("[Server] Successfully freed port, restarting listener...");
            setTimeout(() => {
              startListening();
            }, 500);
          });
        });
      } else {
        console.error(
          `[Server] Automatic port recovery is only implemented for Windows. Please free port ${PORT} and restart.`
        );
        process.exit(1);
      }
    } else {
      throw err;
    }
  });

  const containerService = new ContainerService();
  setupTerminalWebSocket(httpServer, containerService);
  setupLSPWebSocket(httpServer, containerService);

  app.use(cors());
  app.use(express.json());

  app.use("/api/containers", createContainerRouter(containerService));
  app.use("/api/problems", problemRouter);
  app.use("/api/problems", createValidationRouter(containerService));
  app.use("/api/completions", completionRouter);

  app.get("/", (req, res) => {
    res.send("API running");
  });

  // Sync problems from local JSON into Supabase on startup (upsert: insert new, update existing by id)
  void seedProblemsToSupabase().catch((err) => {
    console.error("[Server] Problem seed failed:", err?.message ?? err);
  }).finally(() => {
    startListening();
  });

  process.on("SIGINT", () => {
    console.log("Shutting down...");
    httpServer.close(() => {
      process.exit(0);
    });
  });
}

void bootstrap();
