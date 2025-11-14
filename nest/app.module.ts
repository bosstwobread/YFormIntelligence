import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DemoController } from './demo.controller';
import { ManagerV2Controller } from './manager-v2.controller';
import { FliService } from './fli.service';

/**
 * Root NestJS module
 * Imports FLI service and controllers
 */
@Module({
    controllers: [
        HealthController,
        DemoController,
        ManagerV2Controller
    ],
    providers: [
        FliService
    ],
    exports: [
        FliService
    ]
})
export class AppModule {}
