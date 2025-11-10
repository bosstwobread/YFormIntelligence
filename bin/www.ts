#!/usr/bin/env node
'use strict';

/**
 * Module dependencies.
 */

import type { Server } from 'http';
import * as http from 'http';
import * as fs from 'fs';

// Import app from TypeScript version
import app = require('../app');
// Using require for CommonJS modules
// @ts-ignore
const CONFIG = require('../config/config');

/**
 * Get port from environment and store in Express.
 */

const port: number = CONFIG.http_port;
app.set('port', port);

/**
 * Create HTTP server.
 */

const server = http.createServer(app);

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error: NodeJS.ErrnoException): void {
    if (error.syscall !== 'listen') {
        throw error;
    }

    const bind = typeof port === 'string'
        ? 'Pipe ' + port
        : 'Port ' + port;

    // handle specific listen errors with friendly messages
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use');
            process.exit(1);
            break;
        default:
            throw error;
    }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening(): void {
    console.log('Local Server: http://127.0.0.1:' + port);
}
