/**
 * ENKAI CCTV Edge Agent Core Service
 * Handles camera connections, event detection, and local buffering.
 */
import { EventEmitter } from 'events';

export class AgentCore extends EventEmitter {
  constructor() {
    super();
    console.log('CCTV Edge Agent Core initialized.');
  }

  async start() {
    console.log('Starting Edge Agent services...');
    // Initialize SQLite store, RTSP streams, and detection engine
  }

  async stop() {
    console.log('Stopping Edge Agent services...');
  }
}
