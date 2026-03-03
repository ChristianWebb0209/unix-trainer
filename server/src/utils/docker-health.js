import Docker from "dockerode";
import { exec } from "child_process";

const docker = new Docker();

function pingDocker() {
  return new Promise((resolve, reject) => {
    docker.ping((err, _data) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryStartDockerDaemon() {
  if (process.platform !== "win32") {
    console.error(
      "[Docker] Docker daemon is not reachable and automatic startup is only implemented for Windows. Please start Docker manually and restart the server."
    );
    throw new Error("Docker daemon not running");
  }

  console.warn("[Docker] Docker daemon is not reachable. Attempting to start Windows service 'com.docker.service'...");

  await new Promise((resolve, reject) => {
    exec(
      'powershell -Command "Start-Service com.docker.service"',
      (err, _stdout, stderr) => {
        if (err) {
          console.error("[Docker] Failed to start com.docker.service:", stderr || err.message);
          reject(err);
          return;
        }
        resolve(true);
      }
    );
  });

  // Wait for the daemon to come up, polling ping() for up to ~30 seconds.
  const start = Date.now();
  const timeoutMs = 30_000;
  let delay = 1000;

  while (Date.now() - start < timeoutMs) {
    try {
      await pingDocker();
      console.log("[Docker] Docker daemon is now reachable.");
      return;
    } catch {
      await sleep(delay);
      delay = Math.min(delay + 1000, 5000);
    }
  }

  throw new Error("Docker daemon did not become ready in time after start attempt");
}

export async function ensureDockerRunning() {
  try {
    await pingDocker();
    console.log("[Docker] Docker daemon is reachable.");
    return;
  } catch (err) {
    console.warn("[Docker] Initial ping failed:", err?.message ?? err);
  }

  // Try to start Docker and wait for it to be healthy.
  await tryStartDockerDaemon();
}

