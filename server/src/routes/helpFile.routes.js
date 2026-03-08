/**
 * Help File Routes
 * ----------------
 * GET /api/help-files       → { helpFiles: [{ id, name }] }
 * GET /api/help-files/:id  → { helpFile: { id, name, content } }
 */

import { Router } from "express";
import { HelpFileController } from "../controllers/helpFile.controller.js";

const router = Router();
const helpFileController = new HelpFileController();

router.get("/", (req, res) => helpFileController.list(req, res));
router.get("/:id", (req, res) => helpFileController.get(req, res));

export const helpFileRouter = router;
