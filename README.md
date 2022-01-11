#[易逻辑]介绍
通过配置即可实现后台逻辑实现，包含大量逻辑单元实现、可扩展插件式、单元错误处理、定义导出文件等；的以下是简单示例：
``` javascript
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
    },

```

#文件配置说明
``` javascript
const ERROR_CODE = require('../config/error_code.json')

module.exports = {
    "路由名称": {
        //路由执行前置过滤条件
        filters: [
            YFI.plug.commonFilter.authentication, "#tel", "#nickname", { field: "#tel", fun: YFI.plug.commonFilter.iInternationalTel },
            { field: "~user.parent", fun: YFI.plug.commonFilter.unEmpty, args: [ERROR_CODE.ERROR_CHILD_OPERATION_NOT_ALLOWED, "不能在子账号下添加账号"] }]
        ,
        /** 路由执行单元，按顺序执行
         * 每一个单元可获取上一个单元的执行结果作为参数
        */
        routerOperate: [
            {
                /**  方法是否异步
                 * 异步方法需要执行框架回调方法才能进行下一步，框架会将回调方法callback直接作为参数放到该方法最后一个参数中
                 * 调用举例：callback({ code: error_code.ERROR_SUCCESS });
                */
                async: false,

                //路由单元主键名,获取指定单元数据可使用此建名，后续会再次举例
                key: "routerUnitName",

                //路由单元执行主方法，框架提供大量方法来实现逻辑功能
                fun: YFI.plug.mysql.seleteSingle,

                /** 路由单元参数，参数按数组顺序传入逻辑执行单元方法中
                 * 系统参数使用 {{keyword}}
                 * 举例：{{#user_name}}
                 * #开头表示post/get请求体参数
                 * ~开头表示系统内置参数;如下：
                 *  ~user 用户信息 如： ~user.user_name
                 *  ~results 路由单元数据：如 ~results.key  这里的key为路由单元主键名
                 *  ~lastResult 上一单元执行返回的数据 如： ~lastResult.data
                 * 支持字符串拼接操作，如"{{#tel}}"+"{{~user.name}}"
                 */
                args: ["device", "device_id,device_tel", [{ field: "tel", value: "{{~user.tel}}" }]],

                /**  逻辑单元执行未符合预期，报错处理
                 * condition 满足条件则抛错误,如未定义默认值为false
                 * error_code 错误代码
                 * error_msg 错误消息
                */
                showError: {
                    condition: true,
                    error_code: ERROR_CODE.ERROR_PARAMETER,
                    error_msg: "参数有问题哦"
                },
                //路由执行前置条件，暂未实现
                condition
            }
        ]
    },
}
```

#路由函数

|  表头   | 表头  |
|  ----  | ----  |
| 单元格  | 单元格 |
| 单元格  | 单元格 |

# YFormIntelligence
后台接口配置化  
node版本:v16.0.0  
微信:bosstwobread  
钉钉:boss520  
邮箱:boss520@dingtalk.com 
