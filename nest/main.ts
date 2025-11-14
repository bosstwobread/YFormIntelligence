// CRITICAL: Fix collections library conflict FIRST
import './collections-fix';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * NestJS bootstrap - runs on port 8090
 * Separate from existing Express server on 8080
 */
async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        logger: ['log', 'error', 'warn', 'debug']
    });

    // Enable CORS if needed for frontend testing
    app.enableCors();

    const port = process.env.NEST_PORT || 8090;
    await app.listen(port);

    console.log(`🚀 NestJS server running on http://localhost:${port}`);
    console.log(`📋 Health check: http://localhost:${port}/health`);
    console.log(`🔗 API demo: http://localhost:${port}/api/users`);
    console.log(`📦 Express server still running on port 8080`);
}

bootstrap().catch(err => {
    console.error('❌ NestJS bootstrap failed:', err);
    process.exit(1);
});
