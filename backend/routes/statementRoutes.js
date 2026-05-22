import express from 'express';
import {
  getStatements,
  getStatementById,
  createStatement,
  updateStatement,
  deleteStatement,
  deleteStatements,
} from '../controllers/statementController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Protect all routes below this middleware
router.use(protect);

router.route('/')
  .get(getStatements)
  .post(createStatement)
  .delete(deleteStatements);

router.route('/:id')
  .get(getStatementById)
  .put(updateStatement)
  .delete(deleteStatement);

export default router;
