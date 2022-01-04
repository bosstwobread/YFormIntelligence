'use strict'
const { promisify } = require("util");
var createError = require('http-errors');
var express = require('express');
var session = require('express-session')
var redis = require('redis');
var helmet = require('helmet')
var compression = require('compression');

var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var RedisStore = require('connect-redis')(session);
var redisClient = redis.createClient();

var testRouter = require('./routes/test');
const CONFIG = require('./config/config')

var app = express();

// use helmet
// This disables the `contentSecurityPolicy` middleware but keeps the rest.
app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(compression());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// 使用 express-session 中间件
const sess = {
    store: new RedisStore({ client: redisClient }),
    secret: '{02205947-247A-41D9-9369-050F1FFB2DEC} - app-2021-06-21', // 对session id 相关的cookie 进行签名
    resave: false,  // 这个一定要设置为false，否则会发生session覆盖的情况，参考 https://segmentfault.com/q/1010000016232684
    rolling: true,
    saveUninitialized: true,
    cookie: {
        maxAge: 26 * 3600 * 1000, // 设置 session 的有效时间，单位毫秒
    },
    name: "JSESSIONID"
}

// 非https连接不会收到set-cookie
// if (app.get('env') === 'production') {
//     sess.cookie.secure = true
// }

// 生成环境和开发环境有些区别
if (app.get('env') === 'production') {
    console.log("production");
    // 这里需要设置nginx反向代理：proxy_set_header X-Forwarded-Proto $scheme;
    app.set('trust proxy', 1) // trust first proxy

    app.use('/test/', testRouter);

    // 必须写在路由定义的上面，否则req.session为空，无法使用
    app.use(session(sess));
} else {
    console.log("un_production");
    // 非生产模式需要设置nodejs静态目录，生成环境下使用nginx处理静态资源
    app.use(express.static(path.join(__dirname, 'public'), { maxAge: 6 * 3600 * 1000 }));
    app.use('/appservice/test/v1/', testRouter);

    // 必须写在路由定义的上面，否则req.session为空，无法使用
    app.use(session(sess));
}

// 设置HTTP Header字段Server: cloudflare-nginx，混淆视听，注意这句话需要放这路由前面
app.all('*', (req, res, next) => {
    res.setHeader("Server", "nginx");

    // 调试环境下不能设置Content-Type, 静态资源拉取JS文件不能执行。
    // 而生产环境静态资源由nginx支持，不存在这个问题
    if (app.get('env') === 'production') {
        res.setHeader("Content-Type", "text/html;charset=utf-8");
    }
    next();
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    // 处理post请求，json数据不合法的情况
    if (req.method.toUpperCase() === 'POST' && err.type === 'entity.parse.failed') {
        res.end('{code:1}') // 1 参数错误。（参数缺失，参数格式错误，JSON格式错误等）
        return
    }

    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;