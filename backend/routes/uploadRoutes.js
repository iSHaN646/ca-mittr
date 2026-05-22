import express from 'express';
import multer from 'multer';
import { parsePDF } from '../controllers/uploadController.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are accepted.'));
  },
});

// POST /api/upload/parse  — parse a bank statement PDF
router.post('/parse', upload.single('pdf'), parsePDF);

export default router;
