'use strict';

import { promisify } from 'util';
import createError from 'http-errors';
import express, { Request, Response, NextFunction, Application } from 'express';
import session from 'express-session';
import MemoryStore from 'memorystore';
import * as redis from 'redis';
import helmet from 'helmet';
import compression from 'compression';
import fileUpload from 'express-fileupload';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import connectRedis from 'connect-redis';

// @ts-ignore
const CONFIG = require('./config/config');
// @ts-ignore
const appRouter = require('./routes/app');
const managerRouter = require('./routes/manager');

const MemoryStoreSession = MemoryStore(session);
const RedisStore = connectRedis(session);
const redisClient = redis.createClient();

const app: Application = express();

// use helmet
// This disables the `contentSecurityPolicy` middleware but keeps the rest.
app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(fileUpload({
    createParentPath: true,
    useTempFiles: true,
}));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(compression());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(session({ resave: true, secret: '123456', saveUninitialized: true }));

// 使用 express-session 中间件
const sess: session.SessionOptions = {
    store: new MemoryStoreSession({
        checkPeriod: 86400000 // prune expired entries every 24h
    }),
    secret: '{02205947-247A-41D9-9369-050F1FFB2DEC} - app-2021-06-21', // 对session id 相关的cookie 进行签名
    resave: false,  // 这个一定要设置为false，否则会发生session覆盖的情况，参考 https://segmentfault.com/q/1010000016232684
    rolling: true,
    saveUninitialized: true,
    cookie: {
        maxAge: 26 * 3600 * 1000, // 设置 session 的有效时间，单位毫秒
    },
    name: "JSESSIONID"
};

// 生成环境和开发环境有些区别
if (app.get('env') === 'production') {
    console.log("production");
    // 这里需要设置nginx反向代理：proxy_set_header X-Forwarded-Proto $scheme;
    app.set('trust proxy', 1); // trust first proxy

    // 必须写在路由定义的上面，否则req.session为空，无法使用
    app.use(session(sess));
    app.use('/api/v1/', appRouter);
    app.use('/manager/v1/', managerRouter);
} else {
    console.log("un_production");
    // 非生产模式需要设置nodejs静态目录，生成环境下使用nginx处理静态资源
    app.use(express.static(path.join(__dirname, 'public'), { maxAge: 6 * 3600 * 1000 }));

    // 必须写在路由定义的上面，否则req.session为空，无法使用
    app.use(session(sess));
    app.use('/appservice/api/v1/', appRouter);
    app.use('/appservice/manager/v1/', managerRouter);
}

// 设置HTTP Header字段Server: cloudflare-nginx，混淆视听，注意这句话需要放这路由前面
app.all('*', (req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Server", "nginx");

    // 调试环境下不能设置Content-Type, 静态资源拉取JS文件不能执行。
    // 而生产环境静态资源由nginx支持，不存在这个问题
    if (app.get('env') === 'production') {
        res.setHeader("Content-Type", "text/html;charset=utf-8");
    }
    next();
});

// catch 404 and forward to error handler
app.use(function (req: Request, res: Response, next: NextFunction) {
    next(createError(404));
});

// error handler
app.use(function (err: any, req: Request, res: Response, next: NextFunction) {
    // 处理post请求，json数据不合法的情况
    if (req.method.toUpperCase() === 'POST' && err.type === 'entity.parse.failed') {
        res.end('{code:1}'); // 1 参数错误。（参数缺失，参数格式错误，JSON格式错误等）
        return;
    }

    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

// 初始化redis数据
setTimeout(async () => {
    const redisGetAsync = promisify(redisClient.get).bind(redisClient);

    // 初始化售后服务
    let res = await redisGetAsync('mysql:service');
    if (!res) {
        redisClient.set('mysql:service', JSON.stringify({
            code: 0,
            tel: CONFIG.serviceTell,
            qrcode: "qrcode-string",
            text: "please edit service text"
        }));
    }
}, 1);

export = app;
