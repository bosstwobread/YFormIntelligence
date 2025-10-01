'use strict'
var express = require('express');
var app = express();
// const isDev = app.get('env') === 'production' ? false : true;
const isDev = true;
console.log({ isDev: isDev });
const config = {
    isDev: isDev,
    http_port: 8090,
    server: "https://phone.xxoo.com",
    database: {
        DATABASE: 'smart',
        USERNAME: isDev ? 'dev' : 'dev',
        PASSWORD: isDev ? 'xxoo' : 'xxoo',
        PORT: '3306',
        HOST: isDev ? 'xxoo' : 'xxoo'
    },
    apk_folder: 'apks',
    version: {
        android: {
            url: "android_url",
            version_name: "0.1.0",
            version_code: 1
        },
        ios: {
            url: "ios_url",
            version_name: "0.1.0",
            version_code: 1
        }
    }
};
module.exports = config;