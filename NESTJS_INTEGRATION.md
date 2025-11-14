# NestJS Integration Guide

## Overview

This project now runs **two servers simultaneously**:
- **Express (port 8080)** - Original FLI routes, untouched
- **NestJS (port 8090)** - New framework with FLI integration via DI

Both servers share:
- MySQL connections (via FLI plugs)
- Redis cache
- Config files
- Business logic modules

---

## Quick Start

### Start NestJS Server (port 8090)
```bash
npm run nest
```

### Start NestJS with Auto-Reload (development)
```bash
npm run nest:dev
```

### Start Express Server (port 8080 - original)
```bash
npm start
# or for development:
npm run dev
```

---

## Architecture

### File Structure
```
nest/
├── collections-fix.ts        # Workaround for excel-export library conflict
├── main.ts                   # NestJS bootstrap (port 8090)
├── app.module.ts             # Root module
├── fli.service.ts            # Wrapper for vanilla JS FLI module
├── health.controller.ts      # Simple health check
└── demo.controller.ts        # Example FLI integration routes
```

### FLI Service Wrapper

The `FliService` provides dependency injection access to all FLI plugs:

```typescript
@Controller('api')
export class MyController {
  constructor(private readonly fliService: FliService) {}

  @Get('users')
  async getUsers() {
    const mysql = this.fliService.mysql();
    return mysql.select('account', 'id,name,type');
  }
}
```

**Available methods:**
- `mysql()` - Database operations
- `cache()` - Redis operations
- `encrypt()` - Encryption/decryption
- `user()` - UUID generation
- `date()` - Date formatting
- `http()` - HTTP response helpers
- `business()` - Custom business logic
- `commonFilter()` - Authentication filters

---

## Testing the Integration

### 1. Health Check
```bash
curl http://localhost:8090/health
# Returns: {"status":"ok","service":"NestJS","timestamp":"2025-11-14T...","port":8090}
```

### 2. FLI MySQL Integration (fetch users from database)
```bash
curl http://localhost:8090/api/users
# Returns: {"code":0,"message":"success","data":[...],"source":"NestJS + FLI"}
```

### 3. FLI UUID Generation
```bash
curl http://localhost:8090/api/uuid
# Returns: {"code":0,"uuid":"5a64d563-364e-4023-b4db-f008241fa231"}
```

### 4. FLI Date Formatting
```bash
curl http://localhost:8090/api/time
# Returns: {"code":0,"formatted":"2025-11-14 20:47:05","raw":"2025-11-14T12:47:05.523Z"}
```

### 5. FLI Encryption
```bash
curl -X POST http://localhost:8090/api/encrypt \
  -H "Content-Type: application/json" \
  -d '{"text":"password123"}'
# Returns: {"code":0,"original":"password123","encrypted":"70e5ff1867bc512889b7e6bdc8fbdd86"}
```

### 6. FLI Cache (Redis)
```bash
# Set value
curl "http://localhost:8090/api/cache-test?key=demo&value=hello"
# Get value
curl "http://localhost:8090/api/cache-test?key=demo"
```

---

## Migration Strategy

### Phase 1: Dual-Port Operation ✅ **(Current)**
- Express on 8080 serves production traffic
- NestJS on 8090 for new features/testing
- Both share same database/cache
- Zero risk to existing users

### Phase 2: Gradual Route Migration
Pick one route at a time from `routes/manager.ts` and replicate in NestJS:

**Example: Migrate `getUserList`**

1. Create controller:
```typescript
@Controller('manager')
export class ManagerController {
  constructor(private readonly fliService: FliService) {}

  @Post('getUserList')
  async getUserList(@Body() body: any) {
    const mysql = this.fliService.mysql();
    
    // Replicate logic from routes_config/manager.ts
    const orderField = body.orderProp || 'create_time';
    const orderDir = body.orderAsc === true ? 'ASC' : 'DESC';
    
    const users = await mysql.getPageDataBySelect(
      'account',
      "id,'' password,name,type,create_time",
      [
        { field: 'name', value: body.name, compareSymbol: 'like' },
        { field: 'type', value: body.type },
        { field: 'create_time', value: body.create_time, compareSymbol: 'between' }
      ],
      `${orderField} ${orderDir}`,
      body.current,
      body.size
    );
    
    return users;
  }
}
```

2. Test new endpoint:
```bash
curl -X POST http://localhost:8090/manager/getUserList \
  -H "Content-Type: application/json" \
  -d '{"current":1,"size":10}'
```

3. Once verified, update frontend to call port 8090 for that route

### Phase 3: Advanced Patterns (Optional)

**A. Convert FLI route configs to Nest Guards/Interceptors:**
```typescript
// Instead of filters array in JSON, use:
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor)
@Post('addUser')
async addUser(@Body() userData: any) {
  // Business logic here
}
```

**B. Create Nest modules per domain:**
```
nest/
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   └── users.service.ts
├── devices/
│   ├── devices.module.ts
│   ├── devices.controller.ts
│   └── devices.service.ts
```

---

## Debugging

### NestJS on port 8090
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug NestJS",
  "runtimeArgs": ["-r", "ts-node/register"],
  "args": ["nest/main.ts"],
  "cwd": "${workspaceFolder}",
  "protocol": "inspector",
  "sourceMaps": true
}
```

### View Logs
```bash
# NestJS startup logs show all registered routes:
[RouterExplorer] Mapped {/health, GET} route
[RouterExplorer] Mapped {/api/users, GET} route
```

---

## Known Issues & Fixes

### 1. Collections Library Conflict
**Problem:** `excel-export` dep brings in old `collections@3.0.0` that breaks `Array.from`

**Solution:** `nest/collections-fix.ts` patches this before Nest loads

### 2. FLI Lazy Loading
**Problem:** Loading FLI too early caused init failures

**Solution:** `FliService` uses lazy initialization—FLI loads on first use, not during DI

---

## Next Steps

1. **Pick one Express route to migrate** (recommend starting with simple ones like `/api/getAppConfig`)
2. **Create corresponding Nest controller** using `FliService`
3. **Test side-by-side** (old route on 8080, new on 8090)
4. **Switch frontend** to new endpoint once verified
5. **Repeat** for more routes

---

## Rollback Plan

If NestJS causes issues:
```bash
# Stop Nest server
pkill -f "nest/main.ts"

# Remove Nest dependencies (optional)
npm uninstall @nestjs/core @nestjs/common @nestjs/platform-express

# Express on 8080 keeps working—no changes needed
```

---

## Support

- NestJS docs: https://docs.nestjs.com
- FLI service usage: See `nest/demo.controller.ts` for examples
- Express routes unchanged: See `routes/manager.ts`, `routes/app.ts`
