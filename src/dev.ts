// Local development runs API and background processing under one watch command.
// Production/Docker still use server.ts and worker.ts as separate entry points.
import './server.js';
void import('./worker.js');
