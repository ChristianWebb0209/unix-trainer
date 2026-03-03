/**
 * Container Controller
 * --------------------
 * Handles HTTP requests related to container operations.
 *
 * Responsibilities:
 * - Parse request body + params
 * - Call ContainerService
 * - Handle errors
 * - Format HTTP responses
 *
 * Must NOT:
 * - Contain container logic
 * - Execute shell commands
 * - Manage Docker directly
 *
 * Output Requirements:
 * - Consistent JSON response format
 * - Proper HTTP status codes
 *
 * Agent rules:
 * - All methods must be async
 * - Wrap service calls in try/catch
 * - Never expose raw errors
 */
export class ContainerController {
    constructor(containerService) {
        this.containerService = containerService;
    }

    async createContainer(req, res) {
        try {
            const { EXECUTION_DEFAULTS, ALLOWED_LANGUAGES } = await import('../config/execution.config.js');
            const body = req.body || {};
            const rawLang = body.language;
            const rawClientId = body.clientId;
            const rawWorkspace = body.workspace;
            const candidateLang = typeof rawLang === 'string' ? rawLang.toLowerCase() : '';
            const language = ALLOWED_LANGUAGES.includes(candidateLang) ? candidateLang : EXECUTION_DEFAULTS.language;

            const workspace = rawWorkspace === 'cuda' ? 'cuda' : 'unix';

            const memoryLimitBytes = EXECUTION_DEFAULTS.memoryLimitBytes;
            const timeLimitMs = EXECUTION_DEFAULTS.timeLimitMs;

            const containerId = await this.containerService.createContainer({
                language,
                memoryLimitBytes,
                timeLimitMs,
                workspace,
                ownerKey: typeof rawClientId === 'string' && rawClientId.trim() ? rawClientId.trim() : undefined,
            });

            res.status(200).json({ containerId });
        } catch (error) {
            console.error('[ContainerController] Error creating container:', error);
            res.status(500).json({ error: 'Failed to create container' });
        }
    }

    async destroyContainer(req, res) {
        try {
            const rawContainerId = req.params.containerId;
            const containerId = typeof rawContainerId === 'string' ? rawContainerId : (Array.isArray(rawContainerId) ? rawContainerId[0] : null);

            if (!containerId) {
                res.status(400).json({ error: 'Container ID is required' });
                return;
            }

            await this.containerService.destroy(containerId);
            // 204 No Content is appropriate for successful deletion
            res.status(204).send();
        } catch (error) {
            console.error('[ContainerController] Error destroying container:', error);
            res.status(500).json({ error: 'Failed to destroy container' });
        }
    }
}
