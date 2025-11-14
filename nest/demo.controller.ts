import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { FliService } from './fli.service';

/**
 * Demo controller showing how to use FLI plugs from NestJS
 * Replicates some existing Express routes to prove integration
 */
@Controller('api')
export class DemoController {
    constructor(private readonly fliService: FliService) {}

    /**
     * GET /api/users - List users from database using FLI MySQL plug
     * Example: curl http://localhost:8090/api/users
     */
    @Get('users')
    async getUsers() {
        try {
            const mysql = this.fliService.mysql();
            const users = await mysql.select('account', 'id,name,type,create_time');
            return {
                code: 0,
                message: 'success',
                data: users,
                source: 'NestJS + FLI'
            };
        } catch (error) {
            return {
                code: 1,
                message: error.message,
                source: 'NestJS + FLI'
            };
        }
    }

    /**
     * GET /api/cache-test - Test Redis cache via FLI
     * Example: curl "http://localhost:8090/api/cache-test?key=test&value=hello"
     */
    @Get('cache-test')
    async cacheTest(@Query('key') key: string, @Query('value') value: string) {
        const cache = this.fliService.cache();
        
        if (value) {
            // Set value with 60s TTL
            await cache.set(key || 'demo-key', 60, value);
            return {
                code: 0,
                action: 'set',
                key: key || 'demo-key',
                value: value
            };
        } else {
            // Get value
            const cached = await cache.get(key || 'demo-key');
            return {
                code: 0,
                action: 'get',
                key: key || 'demo-key',
                value: cached
            };
        }
    }

    /**
     * POST /api/encrypt - Test encryption via FLI
     * Example: curl -X POST http://localhost:8090/api/encrypt -H "Content-Type: application/json" -d '{"text":"password123"}'
     */
    @Post('encrypt')
    encryptText(@Body('text') text: string) {
        const CONFIG = require('../config/config');
        const encrypt = this.fliService.encrypt();
        const encoded = encrypt.encode(text, CONFIG.server_salt);
        
        return {
            code: 0,
            original: text,
            encrypted: encoded,
            source: 'NestJS + FLI encrypt plug'
        };
    }

    /**
     * GET /api/time - Test date formatting via FLI
     */
    @Get('time')
    getFormattedTime() {
        const date = this.fliService.date();
        const formatted = date.getFormat('YYYY-MM-DD HH:mm:ss');
        
        return {
            code: 0,
            formatted: formatted,
            raw: new Date().toISOString()
        };
    }

    /**
     * GET /api/uuid - Generate UUID via FLI
     */
    @Get('uuid')
    generateUuid() {
        const user = this.fliService.user();
        const uuid = user.uuidv4();
        
        return {
            code: 0,
            uuid: uuid
        };
    }
}
