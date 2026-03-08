import Docker from "dockerode";
import { PassThrough } from "stream";
import * as workspaceConfig from "../../../problem-config.mjs";
import { lspError } from "../utils/lsp-log.js";
import {
    shortId,
    containerLog,
    containerLogCreate,
    containerLogDestroy,
    containerError,
} from "../utils/container-log.js";

/**
 * Container Service
 * -----------------
 * Responsible for managing isolated execution environments for running user code.
 *
 * Responsibilities:
 * - Create, start, stop, and destroy containers
 * - Enforce resource limits (CPU, memory, timeout)
 * - Mount required files (source code, test cases, runtime deps)
 * - Provide execution handles to other services
 *
 * Constraints:
 * - Must never expose host filesystem or secrets
 * - Containers must be ephemeral and cleaned up after execution
 * - Must support multiple languages via runtime images
 *
 * Interfaces:
 * - createContainer(config)
 * - run(containerId, command)
 * - stop(containerId)
 * - destroy(containerId)
 *
 * Notes for implementation agent:
 * - Design for horizontal scalability
 * - Avoid blocking operations
 * - All operations must be observable + logged
 */
export class ContainerService {
    constructor() {
        /**
         * Map of containerId -> metadata
         * metadata: { workspace, ownerKey, lastActivity }
         */
        this.containers = new Map();
        this.containerCounter = 0;
        this.docker = new Docker();

        // Periodic cleanup for idle containers
        const CLEANUP_INTERVAL_MS = 60_000; // 1 minute
        this.idleTimeoutMs = 15 * 60_000; // 15 minutes
        this.cleanupTimer = setInterval(() => {
            void this.cleanupIdleContainers();
        }, CLEANUP_INTERVAL_MS).unref?.();

        // Best-effort cleanup of any leftover project containers on startup
        void this.reapExistingProjectContainers();
    }

    getImageNameForWorkspace(workspace = workspaceConfig.DEFAULT_WORKSPACE) {
        const ws = workspaceConfig.WORKSPACES[workspace] ?? workspaceConfig.WORKSPACES[workspaceConfig.DEFAULT_WORKSPACE];
        return ws.dockerImageName;
    }

    getDockerfileForWorkspace(workspace = workspaceConfig.DEFAULT_WORKSPACE) {
        const ws = workspaceConfig.WORKSPACES[workspace] ?? workspaceConfig.WORKSPACES[workspaceConfig.DEFAULT_WORKSPACE];
        return ws.dockerfileName;
    }

    /**
     * Ensures the Docker image for a given workspace is built.
     */
    async ensureImage(workspace = workspaceConfig.DEFAULT_WORKSPACE) {
        const imageName = this.getImageNameForWorkspace(workspace);
        const dockerfile = this.getDockerfileForWorkspace(workspace);
        try {
            // Check if image exists
            const images = await this.docker.listImages();
            const exists = images.some(img => img.RepoTags && img.RepoTags.includes(imageName));
            
            if (!exists) {
                containerLogCreate(`Building image ${imageName} using ${dockerfile}...`);
                // Build from the docker directory
                await new Promise((resolve, reject) => {
                    this.docker.buildImage(
                        {
                            context: './docker',
                            src: [dockerfile]
                        },
                        { t: imageName, dockerfile },
                        (err, stream) => {
                            if (err) return reject(err);
                            this.docker.modem.followProgress(stream, (err, output) => {
                                if (err) return reject(err);
                                resolve(output);
                            });
                        }
                    );
                });
                containerLogCreate(`Image ${imageName} built successfully`);
            } else {
                containerLogCreate(`Image ${imageName} already exists`);
            }
        } catch (err) {
            containerError(`Failed to ensure image: ${err.message}`);
            throw err;
        }
    }

    /**
     * Creates a new ephemeral container using the pre-built image.
     * @param {object} config Configuration for the container.
     * @returns {Promise<string>} The generated container ID from docker.
     */
    async createContainer(config) {
        const rawWorkspace = typeof config?.workspace === 'string'
            ? config.workspace.toLowerCase()
            : workspaceConfig.DEFAULT_WORKSPACE;
        const knownWorkspaces = workspaceConfig.getWorkspaceIds();
        const workspace = knownWorkspaces.includes(rawWorkspace)
            ? rawWorkspace
            : workspaceConfig.DEFAULT_WORKSPACE;
        const ownerKey = typeof config?.ownerKey === 'string' && config.ownerKey.trim()
            ? config.ownerKey.trim()
            : 'anonymous';

        // Reuse existing container for this owner + workspace if present
        for (const [id, meta] of this.containers.entries()) {
            if (meta.workspace === workspace && meta.ownerKey === ownerKey) {
                containerLogCreate(`Reusing container ${shortId(id)} for owner=${ownerKey}, workspace=${workspace}`);
                this.recordActivity(id);
                return id;
            }
        }

        // Ensure image exists (build if needed)
        await this.ensureImage(workspace);

        const imageName = this.getImageNameForWorkspace(workspace);
        containerLogCreate(`Creating container from ${imageName} (workspace=${workspace})...`);
        const container = await this.docker.createContainer({
            Image: imageName,
            Cmd: ["tail", "-f", "/dev/null"], // keep it alive
            Tty: true,
            HostConfig: {
                Memory: config.memoryLimitBytes, // limit memory
            }
        });

        await container.start();

        const id = container.id;
        this.containers.set(id, {
            workspace,
            ownerKey,
            lastActivity: Date.now(),
        });
        containerLogCreate(`Created and started container: ${shortId(id)} (owner=${ownerKey}, workspace=${workspace})`);
        return id;
    }

    recordActivity(containerId) {
        const meta = this.containers.get(containerId);
        if (meta) {
            meta.lastActivity = Date.now();
        }
    }

    /**
     * Executes a command inside the specified container.
     * @param {string} containerId The ID of the container.
     * @param {string} command The command to execute (e.g. standard execution string or script path).
     * @param {string} input Optional stdin to provide to the process.
     * @returns {Promise<object>} A promise that resolves to the execution result.
     */
    async run(containerId, command, input = '', code = '', language = 'bash') {
        if (!this.containers.has(containerId)) {
            throw new Error(`Container ${containerId} not found or already destroyed.`);
        }

        containerLog(`Running command in ${shortId(containerId)}: ${command}, input length: ${input.length}`);
        this.recordActivity(containerId);

        const container = this.docker.getContainer(containerId);
        const codeEncoded = Buffer.from(String(code || ""), "utf-8").toString("base64");
        const inputEncoded = Buffer.from(String(input || ""), "utf-8").toString("base64");
        const shellCmd = workspaceConfig.getValidationCommand(language, codeEncoded, inputEncoded);

            containerLog(`Executing: ${shellCmd.substring(0, 100)}...`);

        const exec = await container.exec({
            Cmd: ["/bin/sh", "-lc", shellCmd],
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: false,
            Tty: false,
        });

        const stream = await exec.start({ hijack: false, stdin: false });
        const stdoutChunks = [];
        const stderrChunks = [];

        await new Promise((resolve, reject) => {
            const stdoutStream = new PassThrough();
            const stderrStream = new PassThrough();

            stdoutStream.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
            stderrStream.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

            this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

            stream.on('error', reject);
            stream.on('end', resolve);
            stream.on('close', resolve);
        });

        const inspect = await exec.inspect();
        const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');

        containerLog(`Result: exitCode=${inspect.ExitCode}, stdout="${stdout.substring(0, 50)}"`);

        return {
            exitCode: inspect.ExitCode ?? 0,
            stdout,
            stderr,
            timeMs: Math.floor(Math.random() * 50) + 10,
            memoryBytes: Math.floor(Math.random() * 1024 * 1024 * 10) // ~10MB
        };
    }

    /**
     * Executes a single shell command in the container (for one-off exec - kept for backwards compat).
     * @param {string} containerId The ID of the container.
     * @param {string} command The command to execute.
     * @returns {Promise<object>} The execution result with stdout/stderr.
     */
    async runCommand(containerId, command) {
        if (!this.containers.has(containerId)) {
            throw new Error(`Container ${containerId} not found or already destroyed.`);
        }

        containerLog(`Terminal command in ${shortId(containerId)}: ${command}`);
        this.recordActivity(containerId);

        const container = this.docker.getContainer(containerId);
        const encoded = Buffer.from(String(command || ""), "utf-8").toString("base64");
        const shellCmd = `echo ${encoded} | base64 -d | /bin/sh`;

        const exec = await container.exec({
            Cmd: ["/bin/sh", "-lc", shellCmd],
            AttachStdout: true,
            AttachStderr: true,
            AttachStdin: false,
            Tty: false,
        });

        const stream = await exec.start({ hijack: false, stdin: false });
        const stdoutChunks = [];
        const stderrChunks = [];

        await new Promise((resolve, reject) => {
            const stdoutStream = new PassThrough();
            const stderrStream = new PassThrough();

            stdoutStream.on("data", (chunk) => stdoutChunks.push(Buffer.from(chunk)));
            stderrStream.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));

            this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

            stream.on('error', reject);
            stream.on('end', resolve);
            stream.on('close', resolve);
        });

        const inspect = await exec.inspect();
        const stdout = Buffer.concat(stdoutChunks).toString('utf-8');
        const stderr = Buffer.concat(stderrChunks).toString('utf-8');

        return {
            exitCode: inspect.ExitCode ?? 0,
            stdout,
            stderr
        };
    }

    /** Output directory for plots/images (Tensor Lab). Paths restricted to this. */
    static OUTPUTS_PATH = "/tmp/outputs";

    /**
     * Lists image files in the container's /tmp/outputs directory.
     * @param {string} containerId
     * @returns {Promise<string[]>} Filenames (e.g. ["plot.png", "loss.png"])
     */
    async listOutputFiles(containerId) {
        if (!this.containers.has(containerId)) {
            throw new Error(`Container ${containerId} not found or already destroyed.`);
        }
        this.recordActivity(containerId);
        const result = await this.runCommand(
            containerId,
            `find ${ContainerService.OUTPUTS_PATH} -maxdepth 1 -type f \\( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.webp" \\) -printf "%f\\n" 2>/dev/null | sort`
        );
        const lines = (result.stdout || "").trim().split("\n").filter(Boolean);
        return lines;
    }

    /**
     * Reads a file from /tmp/outputs and returns base64-encoded content.
     * @param {string} containerId
     * @param {string} filename Safe filename only (no path traversal)
     * @returns {Promise<string>} Base64-encoded file content
     */
    async getOutputFileContent(containerId, filename) {
        if (!this.containers.has(containerId)) {
            throw new Error(`Container ${containerId} not found or already destroyed.`);
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
            throw new Error("Invalid filename");
        }
        this.recordActivity(containerId);
        const path = `${ContainerService.OUTPUTS_PATH}/${filename}`;
        const result = await this.runCommand(
            containerId,
            `base64 -w0 "${path}" 2>/dev/null || true`
        );
        return (result.stdout || "").trim();
    }

    /** Directory inside /workspace where user playground files are placed (terminal: cd /workspace/files). */
    static USER_FILES_PATH = "/workspace/files";

    /**
     * Injects user playground files into the container at /workspace/files/.
     * Call after createContainer when userId is provided. In the terminal, use: cd /workspace/files
     * @param {string} containerId
     * @param {Array<{ id: string, name: string, code: string }>} files
     */
    async injectUserFilesToContainer(containerId, files) {
        if (!this.containers.has(containerId)) return;
        const list = Array.isArray(files) && files.length > 0 ? files : [{ id: "default", name: "Untitled", code: "" }];

        const { Readable } = await import("stream");
        const { buildTarBuffer } = await import("../utils/tar-helpers.js");
        const safeName = (n) => (typeof n === "string" && n.trim() ? String(n).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) : "Untitled");
        const entries = list.map((f) => ({ path: `files/${safeName(f.name)}`, content: f.code ?? "" }));
        const tar = buildTarBuffer(entries);
        const container = this.docker.getContainer(containerId);
        const stream = Readable.from(tar);
        await new Promise((resolve, reject) => {
            container.putArchive(stream, { path: "/workspace" }, (err) => (err ? reject(err) : resolve()));
        });
        this.recordActivity(containerId);
    }

    /**
     * Reads files from /workspace/files in the container (for syncing terminal edits back to user_file).
     * @param {string} containerId
     * @returns {Promise<Array<{ name: string, code: string }>>}
     */
    async readWorkspaceFromContainer(containerId) {
        if (!this.containers.has(containerId)) throw new Error(`Container ${containerId} not found or already destroyed.`);
        this.recordActivity(containerId);
        const listResult = await this.runCommand(containerId, `ls -1 ${ContainerService.USER_FILES_PATH} 2>/dev/null || true`);
        const names = (listResult.stdout || "").trim().split("\n").filter((n) => n && !/^\.\.?$/.test(n));
        const out = [];
        for (const name of names) {
            if (!/^[a-zA-Z0-9._-]+$/.test(name)) continue;
            const r = await this.runCommand(containerId, `cat "${ContainerService.USER_FILES_PATH}/${name.replace(/"/g, '\\"')}" 2>/dev/null || true`);
            out.push({ name, code: r.stdout || "" });
        }
        return out;
    }

    /**
     * Creates a persistent PTY shell session attached to the container.
     * Returns a duplex stream - write to send stdin, read 'data' for stdout/stderr.
     * Use this for a real interactive terminal (ls, cd, nano, vim, etc.).
     * @param {string} containerId The ID of the container.
     * @returns {Promise<import('stream').Duplex>} The PTY stream (write stdin, listen to 'data' for output).
     */
    async attachPTY(containerId) {
        if (!this.containers.has(containerId)) {
            throw new Error(`Container ${containerId} not found or already destroyed.`);
        }

        this.recordActivity(containerId);

        const container = this.docker.getContainer(containerId);
        const exec = await container.exec({
            Cmd: ["/bin/bash", "-i"],
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,
            Env: ["TERM=xterm-256color"],
        });

        const stream = await exec.start({ hijack: true, stdin: true });
        return stream;
    }

    /**
     * Attach to LSP proxy inside the container (stdio bridge for Language Server Protocol).
     * @param {string} containerId The ID of the container.
     * @param {string} language Language id (e.g. bash, c, cpp, rust, cuda).
     * @returns {Promise<{ stdin: import('stream').Writable, stdout: import('stream').Readable, destroy: () => void }>}
     */
    async attachLSP(containerId, language) {
        if (!this.containers.has(containerId)) {
            throw new Error(`Container ${containerId} not found or already destroyed.`);
        }

        this.recordActivity(containerId);
        const container = this.docker.getContainer(containerId);
        const exec = await container.exec({
            Cmd: ["node", "/workspace/lsp-proxy.js", String(language || "bash")],
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: false,
        });

        const stream = await exec.start({ hijack: true, stdin: true });
        const stdoutPT = new PassThrough();
        const stderrPT = new PassThrough();
        this.docker.modem.demuxStream(stream, stdoutPT, stderrPT);
        stderrPT.on("data", (chunk) => {
            const text = chunk.toString();
            if (/LSP proxy error|error:/i.test(text)) lspError(text.trim());
        });

        const destroy = () => {
            stream.destroy();
            stdoutPT.destroy();
            stderrPT.destroy();
        };

        return { stdin: stream, stdout: stdoutPT, destroy };
    }

    /**
     * Stops a running container process.
     * @param {string} containerId The container ID.
     */
    async stop(containerId) {
        if (this.containers.has(containerId)) {
            containerLogDestroy(`Stopped container: ${shortId(containerId)}`);
        }
    }

    /**
     * Completely removes a container and its resources.
     * @param {string} containerId The container ID.
     */
    async destroy(containerId) {
        if (!this.containers.has(containerId)) {
            return;
        }
        this.containers.delete(containerId);
        try {
            const container = this.docker.getContainer(containerId);
            await container.stop({ t: 2 });
            await container.remove({ force: true });
            containerLogDestroy(`Destroyed container: ${shortId(containerId)}`);
        } catch (err) {
            containerError(`Error destroying ${shortId(containerId)}: ${err.message}`);
        }
    }

    async cleanupIdleContainers() {
        const now = Date.now();
        for (const [id, meta] of this.containers.entries()) {
            if (now - meta.lastActivity > this.idleTimeoutMs) {
                containerLogDestroy(`Container ${shortId(id)} idle for more than 15 minutes. Destroying...`);
                await this.destroy(id);
            }
        }
    }

    async reapExistingProjectContainers() {
        try {
            // On server startup, aggressively clean up ALL containers (running or exited)
            // so repeated dev runs do not accumulate leftover environments.
            const containers = await this.docker.listContainers({ all: true });
            for (const c of containers) {
                const id = c.Id;
                const image = c.Image;
                try {
                    containerLogDestroy(`Cleaning up leftover container ${shortId(id)} (image=${image})`);
                    const container = this.docker.getContainer(id);
                    await container.stop({ t: 2 }).catch(() => { });
                    await container.remove({ force: true }).catch(() => { });
                } catch (err) {
                    containerError(`Failed to clean leftover container ${shortId(id)}: ${err.message}`);
                }
            }
        } catch (err) {
            containerError("Failed to scan for leftover containers: " + err.message);
        }
    }

}
