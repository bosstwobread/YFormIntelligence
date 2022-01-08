
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
                 * 方法虽然是异步但支持同步执行的无需设置true，系统会自动识别同步执行
                 * 设置成真异步后方法参数将自动在最后一个位置增加callback回调函数，在执行完毕传入返回数据即可；如callback({ code: error_code.ERROR_SUCCESS });
                */
                async: false,
                //路由执行前置条件，暂未实现
                condition,
                //路由单元关键说明，获取该单元返回值可用该名称
                key: "routerUnitName",
                //执行函数委托
                fun: mysql.iExist,
                /** 执行函数所需参数，将在函数执行时自动替换相关值
                 * 系统参数使用 {{keyword}}
                 * #开头表示post请求体参数
                 * ~开头表示系统内置参数;含如下系统参数
                 *  ~user 用户信息 也可~user.tel
                 *  ~lastResult 上一步骤执行返回的数据 也可 ~lastResult.key
                 * 支持字符串拼接操作，如"{{#tel}}"+"{{~user.name}}""
                 */
                args: ["user", { tel: "{{#tel}}" }],
                /**  如果想在函数执行后直接抛出错误，可定义该参数
                 * condition 满足条件则抛错误,如未定义默认值为false
                 * error_code 错误代码
                 * error_msg 错误消息
                */
                showError: {
                    condition: true,
                    error_code: ERROR_CODE.ERROR_PARAMETER,
                    error_msg: "子账号已存在"
                }
            }
        ]
    },
}
```



# YFormIntelligence
后台接口配置化  
node版本:v16.0.0  
微信:bosstwobread  
钉钉:boss520  
邮箱:boss520@dingtalk.com 
