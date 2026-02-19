require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { errorHandler } = require('./middleware/errorHandler');
const { requestLogger } = require('./middleware/requestLogger');
const logger = require('./utils/logger');

// Routes
const authRoutes = require('./routes/auth');
const fahrzeugRoutes = require('./routes/fahrzeuge');
const standortRoutes = require('./routes/standorte');
const stellplatzRoutes = require('./routes/stellplaetze');
const kundenRoutes = require('./routes/kunden');
const leadRoutes = require('./routes/leads');
const provisionRoutes = require('./routes/provisionen');
const dokumentRoutes = require('./routes/dokumente');
const schadenRoutes = require('./routes/schaeden');
const nutzerRoutes = require('./routes/nutzer');
const exportRoutes = require('./routes/export');
const fotoRoutes = require('./routes/fotos');

const app = express();
const PORT = process.env.PORT || 3001;

// Security
app.use(helmet({
  contentSecurityPolicy: false, // Disable for API
}));

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(requestLogger);

// Static files (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/fahrzeuge', fahrzeugRoutes);
app.use('/api/standorte', standortRoutes);
app.use('/api/stellplaetze', stellplatzRoutes);
app.use('/api/kunden', kundenRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/provisionen', provisionRoutes);
app.use('/api/dokumente', dokumentRoutes);
app.use('/api/schaeden', schadenRoutes);
app.use('/api/nutzer', nutzerRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/fotos', fotoRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`DMS Server running on port ${PORT} [${process.env.NODE_ENV}]`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
