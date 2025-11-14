import { Controller, Get } from '@nestjs/common';

/**
 * Health check controller - simple endpoint to verify Nest is running
 */
@Controller('health')
export class HealthController {
    @Get()
    check() {
        return {
            status: 'ok',
            service: 'NestJS',
            timestamp: new Date().toISOString(),
            port: 8090
        };
    }

    @Get('ping')
    ping() {
        return { pong: true };
    }
}
