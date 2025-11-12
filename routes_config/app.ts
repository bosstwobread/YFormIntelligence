'use strict';

import { FLI } from '../common/FirstLogicIntelligence';
import * as ERROR_CODE_IMPORT from '../config/error_code.json';
import * as CONFIG from '../config/config';

const ERROR_CODE: any = ERROR_CODE_IMPORT;

let loginOperate: any[];
if (CONFIG.isDev) {
    loginOperate = [
        { key: "账号是否存在", fun: FLI.plug.mysql.iExist, args: ["user", [{ field: "tel", value: "{{#tel}}" }]], showError: { error_code: ERROR_CODE.ERROR_BAD_PHONE_NUMBER, error_msg: "用户名错误" } },
        { key: "获取密码加密", fun: FLI.plug.encrypt.encode, args: ["{{#password}}", CONFIG.server_salt] },
        { key: "账号是否存在及锁定", args: ["{{#tel}}", "{{~lastResult}}"] },
        { key: "生成登录凭据", fun: FLI.plug.user.uuidv4 },
        { key: "缓存token", fun: FLI.plug.cache.set, args: ["token:{{~lastResult}}", 7 * 24 * 3600, "{{#tel}}"] },
        { key: "返回登录凭据", fun: FLI.plug.http.responseEnd, args: [{ token: "{{~results.生成登录凭据}}" }] }
    ];
}
else {
    loginOperate = [
        { key: "账号是否存在", fun: FLI.plug.mysql.iExist, args: ["user", [{ field: "tel", value: "{{#tel}}" }]], showError: { error_code: ERROR_CODE.ERROR_BAD_PHONE_NUMBER, error_msg: "用户名错误" } },
        { key: "获取密码加密", fun: FLI.plug.encrypt.encode, args: ["{{#password}}", CONFIG.server_salt] },
        { key: "账号是否存在及锁定", args: ["{{#tel}}", "{{~lastResult}}"] },
        { key: "生成登录凭据", fun: FLI.plug.user.uuidv4 },
        { key: "缓存token", fun: FLI.plug.cache.set, args: ["token:{{~lastResult}}", 7 * 24 * 3600, "{{#tel}}"] },
        { key: "返回登录凭据", fun: FLI.plug.http.responseEnd, args: [{ token: "{{~results.生成登录凭据}}" }] }
    ];
}

const routes: any = {
    //通过post请求模拟设备绑定码播报请求
    "get-device-bindcode": null,
    //请求手机验证码
    "get-verify-code": null,
    //注册
    "sign": null,
    //登录
    "login": {
        filters: ["{{#tel}}", "{{#password}}", { field: "{{#tel}}", fun: FLI.plug.commonFilter.iInternationalTel }]
        ,
        routerOperate: loginOperate
    },
    //获取用户信息
    "get-user-info": {
        filters: [FLI.plug.commonFilter.authentication]
        ,
        routerOperate: [
            { key: "直接返回用户数据", fun: FLI.plug.http.responseEnd, args: ["{{~user}}", ["password"]] }
        ]
    },
    //注销账户
    "deleteUser": null,
    //忘记密码
    "forgot-password": null,
    //修改密码
    "modify-password": null,
    //绑定
    "bind-device": {
        filters: [FLI.plug.commonFilter.authentication, "{{#code}}",
        { field: "{{~user.parent}}", fun: FLI.plug.commonFilter.unEmpty, args: [ERROR_CODE.ERROR_CHILD_OPERATION_NOT_ALLOWED, "不能在子账号下添加账号"] }]
        ,
        routerOperate: [
            { key: "获取绑定码", fun: FLI.plug.cache.get, args: ["device-bind:{{#code}}"], showError: { condition: null, error_code: ERROR_CODE.ERROR_CHECK_VERIFY_CODE, error_msg: "绑定码不正确" } },
            { key: "阿里云绑定设备", args: ["{{~user}}", "{{#code}}", "{{~lastResult}}", "{{~un_connect_aliyun}}", "{{~res}}"], async: true }
        ]
    },
    //解除绑定
    "unbind-device": null,
    //设置历史轨迹
    "set_trail": {
        filters: [FLI.plug.commonFilter.authentication, "{{#open_trail}}"]
        ,
        routerOperate: [
            { key: "设置轨迹", fun: FLI.plug.mysql.insert, args: ["user", { i_open_trail: "{{#open_trail}}", tel: "{{~user.tel}}" }] }
        ]
    },
    //定位请求，只是开始去服务器轮训定位数据，存放到数据库
    "gps": null,
    //根据唯一标识符获取定位数据
    "getDataByGuid": {
        filters: [FLI.plug.commonFilter.authentication, "{{#guid}}"]
        ,
        routerOperate: [
            { key: "根据guid获取定位数据", fun: FLI.plug.mysql.seleteSingle, args: ["device_records", "data,ivalid", [{ field: "guid", value: "{{#guid}}" }]], showError: { condition: "non-existent", error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "定位数据未上报" } },
            { key: "JSON转换", fun: JSON.parse, args: ["{{~lastResult.data}}"] },
            { key: "输出定位数据", fun: FLI.plug.http.responseEnd, args: [{ gps: "{{~lastResult}}", ivalid: "{{~results.根据guid获取定位数据.ivalid}}" }] }
        ]
    },
    //通话
    "call": null,
    //新增子账号
    "add-child": {
        filters: [
            FLI.plug.commonFilter.authentication, "{{#tel}}", "{{#nickname}}", "{{#head}}", { field: "{{#tel}}", fun: FLI.plug.commonFilter.iInternationalTel },
            { field: "{{~user.parent}}", fun: FLI.plug.commonFilter.unEmpty, args: [ERROR_CODE.ERROR_CHILD_OPERATION_NOT_ALLOWED, "不能在子账号下添加账号"] }]
        ,
        routerOperate: [
            { key: "获取绑定设备ID", fun: FLI.plug.mysql.seleteSingle, args: ["device", "device_id,device_tel", [{ field: "tel", value: "{{~user.tel}}" }]], showError: { condition: "non-existent", error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "主账号未绑定" } },
            { key: "判断子账号是否注册", fun: FLI.plug.mysql.iExist, args: ["user", [{ field: "tel", value: "{{#tel}}" }, { field: "parent", value: "" }]], showError: { condition: true, error_code: ERROR_CODE.ERROR_ADD_CHILD_FAILED, error_msg: "不可添加主账号" } },
            { key: "获取子账号是否存在", fun: FLI.plug.mysql.iExist, args: ["user", [{ field: "tel", value: "{{#tel}}" }]], showError: { condition: true, error_code: ERROR_CODE.ERROR_ADD_CHILD_FAILED, error_msg: "子账号已存在" } },
            { key: "获取所有子账号", fun: FLI.plug.mysql.select, args: ["user", "tel", [{ field: "parent", value: "{{~user.tel}}" }]] },
            { key: "判断子账号是否超过限制", fun: FLI.plug.condition.if, args: [[">=", "{{~lastResult.length}}", 5]], showError: { condition: true, error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "子账号超过限制" } },
            { key: "获取当前时间", fun: FLI.plug.date.getFormat, args: ["YYYY-MM-DD HH:mm:ss"] },
            { key: "插入子账号", fun: FLI.plug.mysql.insert, args: ["user", { head: "{{#head}}", tel: "{{#tel}}", nickname: "{{#nickname}}", parent: "{{~user.tel}}", create_time: "{{~results.获取当前时间}}" }] },
            { key: "获取所有子账号", fun: FLI.plug.mysql.select, args: ["user", "tel", [{ field: "parent", value: "{{~user.tel}}" }]] },
            { key: "阿里云添加子账号", args: ["{{~results.获取绑定设备ID}}", "{{~user.tel}}", "{{~results.获取所有子账号}}", "{{#un_connect_aliyun}},", "{{#tel}}"], async: true }
        ]
    },
    //删除子账户
    "remove-child": null,
    //获取子账户列表
    "get-child": {
        filters: [FLI.plug.commonFilter.authentication, { field: "{{~user.parent}}", fun: FLI.plug.commonFilter.unEmpty, args: [ERROR_CODE.ERROR_CHILD_OPERATION_NOT_ALLOWED, "不能在子账号下添加账号"] }]
        ,
        routerOperate: [
            { key: "获取子账号", fun: FLI.plug.mysql.select, args: ["user", "tel,status,nickname,head", [{ field: "parent", value: "{{~user.tel}}" }]] },
            { key: "输出子账号", fun: FLI.plug.http.responseEnd, args: [{ childs: "{{~lastResult}}" }] }
        ]
    },
    //设备白名单获取(测试用)
    "get-device-whiteList": {
        filters: [FLI.plug.commonFilter.authentication, "{{#device_tel}}"]
        ,
        routerOperate: [
            { key: "获取联通白名单", args: ["{{#device_tel}}"] }
        ]
    },
    //关于设备
    "device-info": null,
    //设备信息修改
    "device-modify": {
        filters: [FLI.plug.commonFilter.authentication, "{{#device_id}}", "{{#nickname}}", "{{#head}}"]
        ,
        routerOperate: [
            { key: "获取唯一设备信息", fun: FLI.plug.mysql.seleteSingle, args: ["device", "tel", [{ field: "device_id", value: "{{#device_id}}" }]] },
            { key: "判断设备是否在用户下", fun: FLI.plug.condition.if, args: [["existent", "{{~lastResult}}"], ["==", "{{~lastResult.tel}}", "{{~user.tel}}"]], showError: { condition: false, error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "设备未在此用户名下" } },
            { key: "修改设备信息", fun: FLI.plug.mysql.insert, args: ["device", { device_id: "{{#device_id}}", nickname: "{{#nickname}}", head: "{{#head}}" }] }
        ]
    },
    //获取定时开关机信息
    "get-timer-switch": null,
    //设置定时开关机
    "set-timer-switch": null,
    //获取禁用模式
    "get-disable-settings": null,
    //设置禁用模式
    "set-disable-settings": null,
    //设置电量提醒
    "set-alarm-capacity": {
        filters: [FLI.plug.commonFilter.authentication, "{{#iOpen}}", "{{#device_id}}"]
        ,
        routerOperate: [
            { key: "设置阿里云电量提醒", args: ["{{#iOpen}}", "{{#device_id}}"] }
        ]
    },
    //获取设备音量
    "get-voice": {
        filters: [FLI.plug.commonFilter.authentication, "{{#device_id}}"]
        ,
        routerOperate: [
            { key: "获取唯一设备信息", fun: FLI.plug.mysql.seleteSingle, args: ["device", "tel", [{ field: "device_id", value: "{{#device_id}}" }]] },
            { key: "判断设备是否在用户下", fun: FLI.plug.condition.if, args: [["existent", "{{~lastResult}}"], ["==", "{{~lastResult.tel}}", "{{~user.tel}}"]], showError: { condition: false, error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "设备未在此用户名下" } },
            { key: "获取阿里云设备音量", args: ["{{#device_id}}", "{{#un_connect_aliyun}}"], async: true }
        ]
    },
    //设备音量调节
    "change-voice": {
        filters: [FLI.plug.commonFilter.authentication, "{{#device_id}}", "{{#voice}}", { field: "{{#voice}}", fun: FLI.plug.commonFilter.digit, args: [0, 11] }, { field: "{{~user.parent}}", fun: FLI.plug.commonFilter.unEmpty, args: [ERROR_CODE.ERROR_CHILD_OPERATION_NOT_ALLOWED, "子账号不能操作"] }]
        ,
        routerOperate: [
            { key: "获取唯一设备信息", fun: FLI.plug.mysql.seleteSingle, args: ["device", "tel", [{ field: "device_id", value: "{{#device_id}}" }]] },
            { key: "判断设备是否在用户下", fun: FLI.plug.condition.if, args: [["existent", "{{~lastResult}}", true], ["==", "{{~lastResult.tel}}", "{{~user.tel}}"]], showError: { condition: false, error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "设备未在此用户名下" } },
            //设备音量范围判断--------------------
            { key: "设置阿里云设备音量", args: ["{{#voice}}", "{{#device_id}}", "{{#un_connect_aliyun}}"], async: true }
        ]
    },
    //获取服务信息
    "service": null,
    //获取版本信息
    "version": null,
    //根据设备ID获取最近三天数据定位数据
    "getLocations": {
        filters: [FLI.plug.commonFilter.authentication, "{{#device_id}}"],
        routerOperate: [
            { key: "获取唯一设备信息", fun: FLI.plug.mysql.seleteSingle, args: ["device", "tel", [{ field: "device_id", value: "{{#device_id}}" }]] },
            { key: "判断设备是否在用户下", fun: FLI.plug.condition.if, args: [["existent", "{{~lastResult}}", true], ["==", "{{~lastResult.tel}}", "{{~user.tel}}"]], showError: { condition: false, error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "设备未在此用户名下" } },
            { key: "获取当前时间", fun: FLI.plug.date.getFormat, args: ["YYYY-MM-DD HH:mm:ss"] },
            { key: "获取三天前时间", fun: FLI.plug.date.getFormat, args: ["YYYY-MM-DD", -2, "day"] },
            { key: "获取gps定位数据", fun: FLI.plug.mysql.select, args: ["device_records", "data,create_time", [{ field: "device_id", value: "{{#device_id}}" }, { field: "type", value: "gnns" }, { field: "create_time", value: "{{~results.获取当前时间}}", compareSymbol: "<=" }, { field: "create_time", value: "{{~results.获取三天前时间}}", compareSymbol: ">=" }], "create_time desc"] },
            { key: "获取阿里云基站数据并对数据格式重新组织且输出", args: ["{{#device_id}}", "{{~lastResult}}"], async: true }
        ]
    },

    //获取商品种类
    "getGoodsType": {
        filters: [FLI.plug.commonFilter.authentication]
        ,
        routerOperate: [
            { key: "获取商品种类" }
        ]
    },

    //支付成功临时接口
    "temp-pay-success": {
        filters: [FLI.plug.commonFilter.authentication, "{{#goodsType}}", "{{#device_id}}"]
        ,
        routerOperate: [
            { key: "处理支付逻辑", args: ["{{#device_id}}", "{{#goodsType}}"] }
        ]
    },

    //支付宝订单创建
    "alipay-create": {
        filters: [FLI.plug.commonFilter.authentication, "{{#goodsType}}", "{{#device_id}}"]
        ,
        routerOperate: [
            { key: "调用支付宝创建支付订单", args: ["{{#device_id}}", "{{#goodsType}}"] }
        ]
    },

    //微信订单创建
    "tenpay-create": {
        filters: [FLI.plug.commonFilter.authentication, "{{#goodsType}}", "{{#device_id}}"]
        ,
        routerOperate: [
            { key: "调用微信创建支付订单", args: ["{{#device_id}}", "{{#goodsType}}"] }
        ]
    },

    //订单查询
    "order-search": {
        filters: [FLI.plug.commonFilter.authentication, "{{#order_id}}"]
        ,
        routerOperate: [
            { key: "获取订单信息", fun: FLI.plug.mysql.seleteSingle, args: ["orders", "0 code,ID,pay_type,goods_type,status,order_owner", [{ field: "ID", value: "{{#order_id}}" }]] },
        ]
    },

    //关联用户与极光ID
    "set-jg-audience": {
        filters: [FLI.plug.commonFilter.authentication, "{{#jg_audience}}", "{{#system_type}}"]
        ,
        routerOperate: [
            { key: "保存极光ID", fun: FLI.plug.mysql.insert, args: ["user", { tel: "{{~user.tel}}", jg_id: "{{#jg_audience}}", system_type: "{{#system_type}}" }] }
        ]
    }
};

if (CONFIG.isDev) {
    //临时停机服务
    routes["stop-device"] = {
        filters: [FLI.plug.commonFilter.authentication, "{{#device_id}}"]
        ,
        routerOperate: [
            { key: "获取设备信息", fun: FLI.plug.mysql.seleteSingle, args: ["device", "device_id,tel,iccid", [{ field: "device_id", value: "{{#device_id}}" }]] },
            { key: "调用联通接口停机", args: ["{{~lastResult}}"] }
        ]
    };

    //临时激活设备SIM卡
    routes["temp-active"] = {
        filters: [FLI.plug.commonFilter.authentication, "{{#device_id}}"]
        ,
        routerOperate: [
            { key: "获取唯一设备信息", fun: FLI.plug.mysql.seleteSingle, args: ["device", "tel", [{ field: "device_id", value: "{{#device_id}}" }]] },
            { key: "判断设备是否在用户下", fun: FLI.plug.condition.if, args: [["existent", "{{~lastResult}}"], ["==", "{{~lastResult.tel}}", "{{~user.tel}}"]], showError: { condition: false, error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "设备未在此用户名下" } },
            { key: "获取设备信息", fun: FLI.plug.mysql.seleteSingle, args: ["device", "device_id,tel,iccid", [{ field: "device_id", value: "{{#device_id}}" }]] },
            { key: "调用联通接口激活", args: ["{{~lastResult}}"], async: true }
        ]
    };

    //临时 年费即将过期/当月欠费通知接口
    //arrearage_type--欠费类型： expire,leftTime
    routes["temp-notice"] = {
        filters: [FLI.plug.commonFilter.authentication, "{{#device_id}}", "{{#notice_type}}"]
        ,
        routerOperate: [
            { key: "调用消息通知", args: ["{{#device_id}}", "{{#notice_type}}"] }
        ]
    };
}

export = routes;
