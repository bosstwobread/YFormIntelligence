'use strict'
const { FLI } = require('../common/FirstLogicIntelligence')
const ERROR_CODE = require('../config/error_code.json')
const CONFIG = require('../config/config')

/** 内核测试
 */
module.exports = {
    /****** 缓存测试 ******/
    "catch": {
        routerOperate: [
            { key: "缓存凭据", fun: FLI.plug.cache.set, args: ["keyName", "10ddd", "value"] }
        ]
    }
}
