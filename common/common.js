//通用方法
const mysql = require('./router_plug/mysql')
const myAliWulianwang = require('../common/ali_wulianwang')
const error_code = require('../config/error_code.json')
const config = require('../config/config')
const my_liantong = require('../common/liantong')
const { FLI } = require('../common/FirstLogicIntelligence');

module.exports = {
    unbind: async function (device_id, callback, un_connect_aliyun) {
        var result = { code: error_code.ERROR_SUCCESS }
        try {
            // 此设备未绑定在此用户名下
            const device_info = await mysql.get_device_info(device_id)
            var user;
            if (device_info && device_info.tel) {
                user = await FLI.plug.mysql.seleteSingle("user", "*", [{ field: "tel", value: device_info.tel }]);
                if (device_info.tel !== user.tel) {
                    result.code = error_code.ERROR_PARAMETER
                    callback(result);
                }
            }
            else {
                result.code = error_code.ERROR_PARAMETER
                callback(result);
            }
            await myAliWulianwang.clientPost("SetDeviceProperty", {
                "Items": JSON.stringify({ "bindState": 0, "telNumberInfo": [] }),
                "DeviceName": device_id
            }, async function (_result, ex) {
                //如果有忽略阿里云参数，则不需要返回错误
                if (ex && un_connect_aliyun != "1") {
                    result.code = error_code.ERROR_DEVICE_OFFLINE;
                }
                //只有成功请求阿里云或则 设置忽略阿里云才进入(un_connect_aliyun参数为了考虑正式环境事务同步)
                if (!ex || un_connect_aliyun == "1") {
                    //联通所有白名单删除
                    try {
                        var children = await my_liantong.invoke("queryUserWhiteList", { data: { groupId: device_info.device_tel } });
                        if (children && children.data && children.data.data && children.data.data.userWList && children.data.data.userWList.length && children.data.data.userWList.length > 0) {
                            var childrenDeviceTel = children.data.data.userWList.split(',');
                            if (childrenDeviceTel && childrenDeviceTel.length > 0) {
                                for (var child_index = 0; child_index < childrenDeviceTel.length; child_index++) {
                                    var deleteUserWhiteList = await my_liantong.invoke("deleteUserWhiteList", { data: { groupId: device_info.device_tel, numberSegment: childrenDeviceTel[child_index] } });
                                    //1秒限制10次
                                    await wait(150);
                                    if (deleteUserWhiteList && deleteUserWhiteList.data.message != "OK") {
                                        result.error_msg = deleteUserWhiteList.data.message;
                                    }
                                }
                            }
                        }
                    } catch (ex) { }
                    //置空设备的绑定手机
                    await mysql.del_device(device_id);
                    //更新用户状态
                    await FLI.plug.mysql.insert("user", { tel: user.tel, status: 0 });
                    //删除所有子账号(如果不删除，子账号不能添加到其他主账号)
                    await FLI.plug.mysql.delete("user", { parent: user.tel });
                    if (config.isDev) {
                        console.log(JSON.stringify({ 成功解绑设备: device_id, 用户: user.parent || user.tel }));
                    }
                }
                callback(result);
            });
        }
        catch (ex) {
            result.code = error_code.ERROR_DEVICE_OFFLINE;
            result.message = ex;
            callback(result);
        }
    },
    renewalFee: async function (device_id, goodsType, iUnInsertChargeRecords, month) {
        //----存储充值记录----
        var now = new Date();
        var charge_date = FLI.plug.date.getFormatByDate(now, "YYYY-MM-DD HH:mm:ss");
        if (!iUnInsertChargeRecords) {
            await FLI.plug.mysql.insert("device_charge_records", { device_id: device_id, charge_date: charge_date, goodsType: goodsType }, { keyName: "ID" });
        }
        //----根据类型存储设备每个月/年通话时长----
        switch (goodsType) {
            case "yearCost":
                var call_month;
                var curExpire = await FLI.plug.mysql.seleteSingle("device", "expire", [{ field: "device_id", value: device_id }]);
                var device_info = await mysql.get_device_info(device_id);
                if (curExpire) {
                    //已经设备数据，更新，设备肯定经过绑定，不会出现找不到的情况
                    var expireMoment;
                    if (curExpire.expire) {
                        if (curExpire.expire > now) {
                            //如果有欠费，则需要先补缴所有欠费，然后才是续费
                            var suppleMonths = 0;//补缴月数量
                            if (device_info && device_info.debt_time && device_info.debt_time > 0) {
                                suppleMonths = Math.floor(device_info.debt_time / config.SIM.perMonthCallTime);
                                for (var suppleMonth = 0; suppleMonth < suppleMonths; suppleMonth++) {
                                    //补缴
                                    call_month = new FLI.plug.date.moment(curExpire.expire).add(0, "month");
                                    await this.renewalFee(device_id, "monthCost", true, call_month);
                                }
                            }
                            expireMoment = new FLI.plug.date.moment(curExpire.expire).add(1, "year").add(-suppleMonths, "month");
                            //年费到期，当月时间加50
                            for (var month = 0; month < 12 - suppleMonths; month++) {
                                call_month = new FLI.plug.date.moment(curExpire.expire).add(month, "month");
                                await this.renewalFee(device_id, "monthCost", true, call_month);
                            }
                        }
                        else {
                            //----如果有欠费，则需要先补缴所有欠费，然后才是续费----
                            var suppleMonths = 0;//补缴月数量
                            if (device_info && device_info.debt_time && device_info.debt_time > 0) {
                                suppleMonths = Math.floor(device_info.debt_time / config.SIM.perMonthCallTime);
                                for (var suppleMonth = 0; suppleMonth < suppleMonths; suppleMonth++) {
                                    //补缴
                                    call_month = new FLI.plug.date.moment(now).add(0, "month");
                                    await this.renewalFee(device_id, "monthCost", true, call_month);
                                }
                            }
                            //期限需要减去补缴的月数量
                            expireMoment = new FLI.plug.date.moment(now).add(1, "year").add(-suppleMonths, "month");
                            //年费到期，当月时间加50
                            for (var month = 0; month < 12 - suppleMonths; month++) {
                                call_month = new FLI.plug.date.moment(now).add(month, "month");
                                await this.renewalFee(device_id, "monthCost", true, call_month);
                            }
                        }
                    }
                    else {
                        //第一次充年费，当月开始12个月加50
                        expireMoment = new FLI.plug.date.moment(now).add(1, "year");
                        for (var month = 0; month < 12; month++) {
                            call_month = new FLI.plug.date.moment(now).add(month, "month");
                            await this.renewalFee(device_id, "monthCost", true, call_month);
                        }
                    }
                    var expire = FLI.plug.date.getFormatByDate(expireMoment, "YYYY-MM-01 00:00:00");
                    await FLI.plug.mysql.insert("device", { device_id: device_id, expire: expire });
                    //激活卡：联通、用户表、设备表
                    var wsEditTerminal = await my_liantong.invoke("wsEditTerminal", { data: { iccid: device_info.iccid, asynchronous: "0", changeType: "3", targetValue: "2" } });
                    await FLI.plug.mysql.insert("device", { device_id: device_id, status: 1 });
                    await FLI.plug.mysql.insert("user", { tel: device_info.tel, status: 2 });
                }
                break;
            case "monthCost":
                //获取当月通话记录
                var call_month = FLI.plug.date.getFormatByDate(now, "YYYY-MM-01 00:00:00");
                if (month) {
                    call_month = FLI.plug.date.getFormatByDate(month, "YYYY-MM-01 00:00:00");
                }
                var curMonthCall = await FLI.plug.mysql.seleteSingle("device_call_records", "ID,call_total", [{ field: "device_id", value: device_id }, { field: "call_month", value: call_month }]);

                /** 四种情况
                1、当月且有充值记录 未欠费 直接充值
                2、当月且有充值记录 欠费 直接充值 更新欠费字段 如果欠费清零则激活联通卡及用户状态
                3、非当月或当月且没有充值记录 未欠费 直接充值
                4、非当月或当月且没有充值记录 欠费 扣除欠费充值 更新欠费字段 如果欠费清零则激活联通卡及用户状态
                */
                var perMonthCallTime = config.SIM.perMonthCallTime;
                var device_info = await mysql.get_device_info(device_id);
                if (call_month === FLI.plug.date.getFormatByDate(now, "YYYY-MM-01 00:00:00")) {
                    //先直接充值
                    if (curMonthCall) {
                        //已经有充值记录，更新
                        await FLI.plug.mysql.insert("device_call_records", { ID: curMonthCall.ID, call_total: curMonthCall.call_total + perMonthCallTime });
                    }
                    else {
                        //没有充值记录
                        //如果有欠费则先补缴欠费（说明是之前欠费的，而非当月）
                        if (device_info && device_info.debt_time && device_info.debt_time > 0) {
                            //----欠费----
                            //欠费 扣除欠费再充值 更新欠费字段 如果欠费清零则激活联通卡及用户状态
                            perMonthCallTime = config.SIM.perMonthCallTime - device_info.debt_time;
                            if (perMonthCallTime > 0) {
                                //扣除欠费可充值，欠费没有超过该次充值额度
                                if (curMonthCall) {
                                    //已经有充值记录，更新
                                    await FLI.plug.mysql.insert("device_call_records", { ID: curMonthCall.ID, call_total: curMonthCall.call_total + perMonthCallTime });
                                }
                                else {
                                    //没有充值记录，插入充值记录
                                    await FLI.plug.mysql.insert("device_call_records", { device_id: device_id, call_month: call_month, called_time: 0, call_total: perMonthCallTime }, { keyName: "ID" });
                                }
                                //欠费清零并激活各种状态
                                await FLI.plug.mysql.insert("device", { device_id: device_id, debt_time: 0 });
                                //激活卡：联通、用户表、设备表
                                var wsEditTerminal = await my_liantong.invoke("wsEditTerminal", { data: { iccid: device_info.iccid, asynchronous: "0", changeType: "3", targetValue: "2" } });
                                await FLI.plug.mysql.insert("device", { device_id: device_id, status: 1 });
                                await FLI.plug.mysql.insert("user", { tel: device_info.tel, status: 2 });
                            }
                            else {
                                //继续欠费，无需充值，即使刚好清零也不能激活相关状态，仅更新欠费金额即可
                                await FLI.plug.mysql.insert("device", { device_id: device_id, debt_time: device_info.debt_time - config.SIM.perMonthCallTime });
                            }
                        }
                        else {
                            //没有欠费记录，直接充值
                            await FLI.plug.mysql.insert("device_call_records", { device_id: device_id, call_month: call_month, called_time: 0, call_total: perMonthCallTime }, { keyName: "ID" });
                        }
                    }
                    if (device_info && device_info.debt_time && device_info.debt_time > 0) {
                        //----欠费----
                        //更新欠费字段
                        var debt_time = device_info.debt_time - config.SIM.perMonthCallTime >= 0 ? device_info.debt_time - config.SIM.perMonthCallTime : 0;
                        await FLI.plug.mysql.insert("device", { device_id: device_id, debt_time: debt_time });

                        if (debt_time == 0 && device_info.expire > new Date()) {
                            //如果欠费清零则激活联通卡及用户状态，当月需要判断是否过期
                            //激活卡：联通、用户表、设备表
                            var wsEditTerminal = await my_liantong.invoke("wsEditTerminal", { data: { iccid: device_info.iccid, asynchronous: "0", changeType: "3", targetValue: "2" } });
                            await FLI.plug.mysql.insert("device", { device_id: device_id, status: 1 });
                            await FLI.plug.mysql.insert("user", { tel: device_info.tel, status: 2 });
                        }
                    }
                }
                else {
                    if (device_info && device_info.debt_time && device_info.debt_time > 0) {
                        //----欠费----
                        //欠费 扣除欠费再充值 更新欠费字段 如果欠费清零则激活联通卡及用户状态
                        perMonthCallTime = config.SIM.perMonthCallTime - device_info.debt_time;
                        if (perMonthCallTime > 0) {
                            //扣除欠费可充值，欠费没有超过该次充值额度
                            if (curMonthCall) {
                                //已经有充值记录，更新（应该不会出现，预留以防万一）
                                await FLI.plug.mysql.insert("device_call_records", { ID: curMonthCall.ID, call_total: curMonthCall.call_total + perMonthCallTime });
                            }
                            else {
                                //没有充值记录，插入充值记录
                                await FLI.plug.mysql.insert("device_call_records", { device_id: device_id, call_month: call_month, called_time: 0, call_total: perMonthCallTime }, { keyName: "ID" });
                            }
                            //欠费清零并激活各种状态
                            //激活卡：联通、用户表、设备表
                            await FLI.plug.mysql.insert("device", { device_id: device_id, debt_time: 0 });
                            var wsEditTerminal = await my_liantong.invoke("wsEditTerminal", { data: { iccid: device_info.iccid, asynchronous: "0", changeType: "3", targetValue: "2" } });
                            await FLI.plug.mysql.insert("device", { device_id: device_id, status: 1 });
                            await FLI.plug.mysql.insert("user", { tel: device_info.tel, status: 2 });
                        }
                        else {
                            //继续欠费，无需充值，即使刚好清零也不能激活相关状态，仅更新欠费金额即可
                            await FLI.plug.mysql.insert("device", { device_id: device_id, debt_time: device_info.debt_time - config.SIM.perMonthCallTime });
                        }
                    }
                    else {
                        //----未欠费----
                        if (curMonthCall) {
                            //已经有充值记录，更新
                            await FLI.plug.mysql.insert("device_call_records", { ID: curMonthCall.ID, call_total: curMonthCall.call_total + perMonthCallTime });
                        }
                        else {
                            //没有充值记录，插入充值记录
                            await FLI.plug.mysql.insert("device_call_records", { device_id: device_id, call_month: call_month, called_time: 0, call_total: perMonthCallTime }, { keyName: "ID" });
                        }
                    }
                }
                break;
            default: break;
        }
    }
}

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};