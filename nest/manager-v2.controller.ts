import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { FliService } from './fli.service';

/**
 * Example migration of routes from routes_config/manager.ts
 * Shows how to convert FLI JSON config to NestJS controllers
 */
@Controller('manager-v2')
export class ManagerV2Controller {
    constructor(private readonly fliService: FliService) {}

    /**
     * Migrated from routes_config/manager.ts: getAppConfig
     * Original route: POST /manager/getAppConfig
     * New route: GET /manager-v2/config
     */
    @Get('config')
    async getAppConfig() {
        try {
            const mysql = this.fliService.mysql();
            const config = await mysql.select('goods', '*');
            
            return {
                code: 0,
                message: 'success',
                data: config,
                source: 'NestJS migration from FLI'
            };
        } catch (error) {
            return {
                code: 1,
                message: error.message
            };
        }
    }

    /**
     * Migrated from routes_config/manager.ts: saveAppConfig
     * Original route: POST /manager/saveAppConfig
     * New route: POST /manager-v2/config
     * 
     * Original FLI config had filters: [FLI.plug.commonFilter.authenticationManage, "{{#yearCost}}", "{{#monthCost}}"]
     * TODO: Add @UseGuards(AuthGuard) when auth is ready
     */
    @Post('config')
    async saveAppConfig(@Body() body: { activeCost?: number; yearCost: number; monthCost: number }) {
        // Validation (replaces filter checks)
        if (!body.yearCost || !body.monthCost) {
            return {
                code: 1,
                message: 'yearCost and monthCost are required'
            };
        }

        try {
            const mysql = this.fliService.mysql();
            
            // Execute the same operations as original FLI config
            await mysql.insert('goods', { good_type: 'monthCost', good_cost: body.monthCost });
            await mysql.insert('goods', { good_type: 'yearCost', good_cost: body.yearCost });
            
            if (body.activeCost) {
                await mysql.insert('goods', { good_type: 'activeCost', good_cost: body.activeCost });
            }

            return {
                code: 0,
                message: 'Configuration saved successfully'
            };
        } catch (error) {
            return {
                code: 1,
                message: error.message
            };
        }
    }

    /**
     * Example showing how to migrate a complex route with pagination
     * Migrated pattern from getUserList
     */
    @Post('users/list')
    async getUserList(@Body() body: {
        name?: string;
        type?: number;
        create_time?: string;
        orderProp?: string;
        orderAsc?: boolean;
        current?: number;
        size?: number;
    }) {
        try {
            const mysql = this.fliService.mysql();
            
            // Replicate FLI expression.ask logic for defaults
            const orderField = body.orderProp === undefined ? 'create_time' : body.orderProp;
            const orderDir = body.orderAsc === true ? 'ASC' : 'DESC';
            const page = body.current === undefined ? undefined : body.current;
            const pageSize = body.size === undefined ? undefined : body.size;

            // Build filters array exactly like FLI config
            const filters = [
                { field: 'name', value: body.name, compareSymbol: 'like' },
                { field: 'type', value: body.type },
                { field: 'create_time', value: body.create_time, compareSymbol: 'between' }
            ];

            // Call FLI MySQL plug method
            const result = await mysql.getPageDataBySelect(
                'account',
                "id,'' password,name,type,create_time",
                filters,
                `${orderField} ${orderDir}`,
                page,
                pageSize
            );

            return {
                code: 0,
                message: 'success',
                ...result,
                source: 'NestJS + FLI'
            };
        } catch (error) {
            return {
                code: 1,
                message: error.message
            };
        }
    }

    /**
     * Example showing how to migrate encryption operations
     * Migrated from addUser password encryption step
     */
    @Post('encrypt-password')
    async encryptPassword(@Body('password') password: string) {
        if (!password) {
            return { code: 1, message: 'Password is required' };
        }

        try {
            // Password complexity validation (replaces FLI "verify the password" step)
            const reg = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[~!@#$%^&*()_+`\-={}:";'<>?,.\/]).{8,64}$/;
            const isValid = reg.test(password);

            if (!isValid) {
                return {
                    code: 1,
                    message: '密码必须包括长度8位以上，包含字母、数字及特殊符号'
                };
            }

            // Encrypt using FLI plug (replaces FLI "encrypt the password" step)
            const CONFIG = require('../config/config');
            const encrypt = this.fliService.encrypt();
            const encoded = encrypt.encode(password, CONFIG.server_salt);

            return {
                code: 0,
                encrypted: encoded
            };
        } catch (error) {
            return {
                code: 1,
                message: error.message
            };
        }
    }

    /**
     * Example showing cache operations
     * Pattern usable for login token management
     */
    @Post('cache/set')
    async setCache(@Body() body: { key: string; value: any; ttl?: number }) {
        try {
            const cache = this.fliService.cache();
            await cache.set(body.key, body.ttl || 3600, body.value);
            
            return {
                code: 0,
                message: 'Cache set successfully',
                key: body.key,
                ttl: body.ttl || 3600
            };
        } catch (error) {
            return {
                code: 1,
                message: error.message
            };
        }
    }

    @Get('cache/:key')
    async getCache(@Body('key') key: string) {
        try {
            const cache = this.fliService.cache();
            const value = await cache.get(key);
            
            return {
                code: 0,
                key: key,
                value: value
            };
        } catch (error) {
            return {
                code: 1,
                message: error.message
            };
        }
    }
}
