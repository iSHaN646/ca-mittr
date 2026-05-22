import dns from 'node:dns';

// Force Node.js DNS resolver to use public DNS servers (handles MongoDB SRV lookups on restrictive ISP DNS)
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (dnsErr) {
  console.warn('[Warning] Could not set custom DNS servers:', dnsErr.message);
}

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import connectDB from './config/db.js';
import taskRoutes from './routes/taskRoutes.js';
import statementRoutes from './routes/statementRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import authRoutes from './routes/authRoutes.js';

// Load environment variables
dotenv.config();

console.log('\n--- ✉️  ACTIVE MAIL SERVER CONFIGURATION ---');
console.log('RESEND_API_KEY loaded:   ', process.env.RESEND_API_KEY ? '✅ YES' : '❌ NO');
console.log('SMTP_HOST loaded:        ', process.env.SMTP_HOST || '❌ NONE');
console.log('SMTP_USER loaded:        ', process.env.SMTP_USER || '❌ NONE');
console.log('SMTP_PASS loaded:        ', process.env.SMTP_PASS ? '✅ YES' : '❌ NO');
console.log('FROM_EMAIL loaded:       ', process.env.FROM_EMAIL || '❌ NONE');
console.log('-------------------------------------------\n');

// Connect to Database
connectDB();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// HTTP Request Logger
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// API Routes
app.use('/api/tasks', taskRoutes);
app.use('/api/statements', statementRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/auth', authRoutes);

// Root route
app.get('/', (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  res.json({
    message: 'Welcome to the Task Manager API',
    version: '1.0.0',
    database: {
      status: dbStatus === 1 ? 'connected' : dbStatus === 2 ? 'connecting' : 'disconnected',
      connected: dbStatus === 1
    },
    endpoints: {
      tasks: '/api/tasks',
      statements: '/api/statements',
    },
  });
});

// 404 Error handler
app.use((req, res, next) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Global Error handler
app.use((err, req, res, next) => {
  console.error(`[Error] Global handler caught: ${err.message}`);
  res.status(500).json({
    success: false,
    error: 'Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`[Server] Running in ${process.env.NODE_ENV || 'production'} mode on port ${PORT}`);
});

// Handle port-in-use and other listen errors cleanly
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Error] Port ${PORT} is already in use. Run: taskkill /IM node.exe /F`);
    process.exit(1); // Exit cleanly — nodemon won't loop on clean exit
  } else {
    console.error(`[Error] Server error: ${err.message}`);
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`[Error] Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

