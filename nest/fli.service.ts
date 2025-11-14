import { Injectable } from '@nestjs/common';

/**
 * FLI Service - Wraps existing FirstLogicIntelligence JS module for NestJS DI
 * Provides access to all FLI plugs (mysql, cache, encrypt, etc.) without modifying original code
 */
@Injectable()
export class FliService {
    private fli: any;
    private initialized = false;

    constructor() {
        // Delay FLI import to avoid early loading issues
    }

    private ensureInitialized() {
        if (!this.initialized) {
            // Import existing vanilla JS FLI module on-demand
            const { FLI } = require('../common/FirstLogicIntelligence');
            this.fli = FLI;
            this.initialized = true;
        }
    }

    /**
     * Get MySQL plug for database operations
     * Usage: await fliService.mysql().select('account', 'id,name')
     */
    mysql() {
        this.ensureInitialized();
        return this.fli.plug.mysql;
    }

    /**
     * Get Cache plug (Redis operations)
     * Usage: await fliService.cache().set('key', ttl, value)
     */
    cache() {
        this.ensureInitialized();
        return this.fli.plug.cache;
    }

    /**
     * Get Encrypt plug
     * Usage: fliService.encrypt().encode(password, salt)
     */
    encrypt() {
        this.ensureInitialized();
        return this.fli.plug.encrypt;
    }

    /**
     * Get User plug (UUID generation, etc.)
     */
    user() {
        this.ensureInitialized();
        return this.fli.plug.user;
    }

    /**
     * Get HTTP response plug
     */
    http() {
        this.ensureInitialized();
        return this.fli.plug.http;
    }

    /**
     * Get Date formatting plug
     */
    date() {
        this.ensureInitialized();
        return this.fli.plug.date;
    }

    /**
     * Get Business plug (custom business logic)
     */
    business() {
        this.ensureInitialized();
        return this.fli.plug.business;
    }

    /**
     * Get CommonFilter plug (authentication, etc.)
     */
    commonFilter() {
        this.ensureInitialized();
        return this.fli.plug.commonFilter;
    }

    /**
     * Direct access to raw FLI instance for advanced use cases
     */
    getRawFLI() {
        this.ensureInitialized();
        return this.fli;
    }
}
