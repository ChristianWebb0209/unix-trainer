import { Router } from 'express';
import { ProblemService } from '../services/problem.service.js';
import { VerificationService } from '../services/verification.service.js';

/**
 * @param {import('../services/container.service.js').ContainerService} containerService
 * @returns {import('express').Router}
 */
export function createValidationRouter(containerService) {
  const problemService = new ProblemService();
  const verificationService = new VerificationService(containerService, problemService);
  const router = Router();

  router.post('/:problemId/validate', async (req, res) => {
    const problemId = req.params.problemId;
    const { solutionCode, containerId, language, testOutputs } = req.body ?? {};

    if (!problemId) {
      return res.status(400).json({ error: 'Problem ID is required' });
    }
    if (typeof solutionCode !== 'string') {
      return res.status(400).json({ error: 'solutionCode is required' });
    }

    try {
      const result = await verificationService.validate({
        problemId,
        solutionCode,
        userId: req.user?.id ?? null,
        containerId: containerId ?? null,
        language: language ?? null,
        testOutputs: Array.isArray(testOutputs) ? testOutputs : null,
      });
      return res.json(result);
    } catch (err) {
      console.error('[Validation] Error:', err?.message ?? err);
      if (err.message?.includes('not found')) {
        return res.status(404).json({ error: err.message });
      }
      if (err.message?.includes('validation.kind') || err.message?.includes('Unknown validation kind')) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({ error: 'Validation failed' });
    }
  });

  return router;
}
