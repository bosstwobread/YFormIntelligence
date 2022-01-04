'use strict'
const { YFI } = require('../common/YFormIntelligence')
const ERROR_CODE = require('../config/error_code.json')
const CONFIG = require('../config/config')

/** router 配置
 * #开头表示post请求体参数
 * ~开头表示系统内置参数;如~user 用户信息 / ~lastResult 上一步骤执行返回的数据
 */
module.exports = {
    /****** 用户管理 ******/
    //查询用户列表
    "getUserList": {
        routerOperate: [
            { key: "获取排序字段", fun: YFI.plug.expression.ask, args: [{ symbol: "===", left: "{{#orderProp}}", right: undefined, result: "create_time", then: "{{#orderProp}}" }] },//create_time
            { key: "获取正逆排序关键字", fun: YFI.plug.expression.ask, args: [{ symbol: "===", left: "{{#orderAsc}}", right: true, result: "ASC", then: "DESC" }] },//DESC
            { key: "获取页码", fun: YFI.plug.expression.ask, args: [{ symbol: "===", left: "{{#current}}", right: undefined, result: undefined, then: "{{#current}}" }] },//DESC
            { key: "获取单页总数", fun: YFI.plug.expression.ask, args: [{ symbol: "===", left: "{{#size}}", right: undefined, result: undefined, then: "{{#size}}" }] },//DESC
            { key: "获取用户集合", fun: YFI.plug.mysql.getPageDataBySelect, args: ["account", "id,'' password,name,type,create_time", [{ field: "name", value: "{{#name}}", compareSymbol: "like" }, { field: "type", value: "{{#type}}" }, { field: "create_time", value: "{{#create_time}}", compareSymbol: "between" }], "{{~results.获取排序字段}} {{~results.获取正逆排序关键字}}", "{{~results.获取页码}}", "{{~results.获取单页总数}}"] },
            { key: "返回用户集合", fun: YFI.plug.http.responseEnd, args: ["{{~lastResult}}"] }
        ],
        export: {
            fileName: "用户清单",
            fields: [{ key: "name", caption: '账号ID', field_type: 'string' },
            { key: "type", caption: '属性', field_type: 'int', dic: [{ value: 0, text: "超级管理员" }, { value: 1, text: "管理员" }] }, { key: "create_time", caption: '添加时间', field_type: 'date' }],
        }
    }
}
