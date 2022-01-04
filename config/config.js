'use strict'
var express = require('express');
var app = express();
// const isDev = app.get('env') === 'production' ? false : true;
const isDev = true;
console.log({ isDev: isDev });
const config = {
    isDev: isDev,
    http_port: 8021,
    server: "https://phone.yunchengjutech.com",
    database: {
        DATABASE: 'smart',
        USERNAME: isDev ? 'dev' : 'dev',
        PASSWORD: isDev ? 'WheatEK233' : 'WheatEK233',
        PORT: '3306',
        HOST: isDev ? 'rm-2vc397git8own2x14wo.mysql.cn-chengdu.rds.aliyuncs.com' : 'rm-2vc397git8own2x14wo.mysql.cn-chengdu.rds.aliyuncs.com'
    },
    token_expire: 7 * 24 * 3600
};
module.exports = config;