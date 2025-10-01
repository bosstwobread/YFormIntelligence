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