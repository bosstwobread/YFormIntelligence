'use strict'
const { promisify, isDeepStrictEqual } = require("util");
const express = require('express');

const axios = require('axios')
const redis = require('redis');
const crypto = require('crypto')
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const mysql = require('../mysql_connect/mysql_connect')
const myAliWulianwang = require('../common/ali_wulianwang')
const ali_duanxin = require('../common/ali_duanxin')
const error_code = require('../config/error_code.json')
const ERROR_CODE = error_code
const config = require('../config/config')
const utils = require('../utils/utils')
const my_liantong = require('../common/liantong')
const gaode = require('../common/gaode')
var moment = require('moment');
const rds = redis.createClient();
const redisGetAsync = promisify(rds.get).bind(rds);
const alipay = require('../common/ali_zhifubao')
const tenpay = require('../common/tencent_zhifu')
const jPush = require('../common/jiguang_push')
const { FLI } = require('../common/FirstLogicIntelligence');
const common = require('../common/common');
const { stringify } = require("querystring");
const { deflate } = require("zlib");
const fs = require("fs");

//阿里短信
var my_ali_duanxin = new ali_duanxin();

//创建阿里云AMQP消息订阅
if (!config.ali_wulianwang.iCloseMessage) {
    var container = myAliWulianwang.createAMQPConnection();

    //接收云端推送消息的回调函数。
    container.on('message', async function (context) {
        try {
            var msg = context.message;
            var content = JSON.parse(Buffer.from(msg.body.content).toString());
            if (content.identifier) {
                console.log({ message: content.identifier, time: getTimeStr(new Date()) });
            }
            const identifier = content.identifier;
            switch (identifier) {
                case "bindReq":
                    //如果是绑定请求则 让设备播报绑定码
                    const deviceName = content.deviceName;//设备名称
                    // 生成6位绑定码
                    const random_six = utils.rand_num_str(6).toString();

                    // 绑定码5分钟有效
                    const rds_device_key = "device-bind:" + random_six;
                    var str_random_six = "";
                    for (var index = 0; index < random_six.length; index++) {
                        str_random_six += " " + random_six[index];
                    }
                    rds.setex(rds_device_key, 5 * 60, JSON.stringify({ devicename: deviceName, code: random_six }))
                    speechPost(str_random_six, 0);
                    //播报绑定码，默认播报三次
                    function speechPost(str_random_six, count) {
                        myAliWulianwang.clientPost("InvokeThingService", {
                            "Identifier": "speechPost",
                            "Args": "{\"content\":\"请记下绑定码" + str_random_six + "\",\"spkVol\":10,\"spkSpeed\":-12000,\"dacGain\":99,\"algGain\":14}",
                            "DeviceName": deviceName
                        }, async function (result, ex) {
                            if (ex) {
                                console.error(ex);
                            }
                            if (config.isDev) {
                                console.log(JSON.stringify({ devicename: deviceName, code: random_six }));
                            }
                            await wait(4000);
                            var redis_value = await redisGetAsync(rds_device_key);
                            if (redis_value && ++count < 3) {
                                speechPost(str_random_six, count);
                            }
                        });
                    }
                    break;
                case "called":
                case "calling":
                    var device_id = content.deviceName;
                    //----每次通话前从联通获取当月通话时间进行更新----
                    var device_info = await FLI.plug.mysql.seleteSingle("device", "tel,iccid", [{ field: "device_id", value: device_id }]);
                    if (identifier == "called") {
                        //设备被叫数据记录
                        await FLI.plug.mysql.insert("device_event", { device_id: device_id, event_type: 2, tel: device_info.tel, timestamp: Math.floor(Date.now() / 1000), create_time: getTimeStr(new Date()) });
                    }
                    else {
                        //设备主叫数据记录
                        await FLI.plug.mysql.insert("device_event", { device_id: device_id, event_type: 1, tel: device_info.tel, timestamp: Math.floor(Date.now() / 1000), create_time: getTimeStr(new Date()) });
                    }
                    var result = await my_liantong.invoke("wsGetTerminalDetails", { data: { iccids: [device_info.iccid] } });
                    //语音使用量
                    var monthToDateVoiceUsageMO = 0;
                    if (result && result.data && result.data.data && result.data.data.terminals && result.data.data.terminals.length && result.data.data.terminals.length > 0 && result.data.data.terminals[0].monthToDateVoiceUsageMO) {
                        monthToDateVoiceUsageMO = parseInt(result.data.data.terminals[0].monthToDateVoiceUsageMO);
                    }
                    //设置当月通话时间
                    var month = FLI.plug.date.getFormatByDate(new Date(), "YYYY-MM-01 00:00:00");
                    var call_month = await FLI.plug.mysql.seleteSingle("device_call_records", "ID,called_time", [{ field: "device_id", value: device_id }, { field: "call_month", value: month }]);
                    if (call_month) {
                        await FLI.plug.mysql.insert("device_call_records", { ID: call_month.ID, called_time: monthToDateVoiceUsageMO });
                    }
                    break;
                case "hangup":
                    var device_id = content.deviceName;
                    var cur_called_time = content.value.duration || 0;//本次通话时长（分）
                    if (!content.value.duration) {
                        console.error({ device_id: device_id, cur_called_time: content, time: +new Date() })
                    }
                    if (config.isDev) {
                        console.log({ flag: "hangup", value: content })
                    }
                    cur_called_time = Math.ceil(cur_called_time / 60);//转换成分钟
                    //----每次通话结束需要去联通查询当月通话时间并更新数据，如果超过当月使用时间则需要停机----
                    var device_info = await FLI.plug.mysql.seleteSingle("device", "tel,iccid", [{ field: "device_id", value: device_id }]);
                    if (device_info) {
                        var result = await my_liantong.invoke("wsGetTerminalDetails", { data: { iccids: [device_info.iccid] } });
                        var month = FLI.plug.date.getFormatByDate(new Date(), "YYYY-MM-01 00:00:00");
                        var call_month = await FLI.plug.mysql.seleteSingle("device_call_records", "ID,called_time,call_total", [{ field: "device_id", value: device_id }, { field: "call_month", value: month }]);
                        if (call_month) {
                            //当月已有充值记录，如果超过当月总通话时长则停机
                            if (call_month.called_time + cur_called_time >= call_month.call_total && config.SIM.iOpenOffDevice) {
                                //停用卡：联通、用户表、设备表
                                await my_liantong.invoke("wsEditTerminal", { data: { iccid: device_info.iccid, asynchronous: "0", changeType: "3", targetValue: "3" } });
                                //更新用户状态 为绑定可激活
                                await FLI.plug.mysql.insert("user", { tel: device_info.tel, status: 1 });
                                await FLI.plug.mysql.insert("device", { device_id: device_id, status: 0 });
                                //设置设备欠费时间
                                var debt_time = call_month.called_time + cur_called_time - call_month.call_total;
                                await FLI.plug.mysql.insert("device", { device_id: device_id, debt_time: debt_time });
                            }
                            //设置当月通话时间
                            if (config.isDev) {
                                console.log({ flag: "hangup.insert.device_call_records", called_time: call_month.called_time, cur_called_time: cur_called_time })
                            }
                            await FLI.plug.mysql.insert("device_call_records", { ID: call_month.ID, called_time: call_month.called_time + cur_called_time });
                            var leftTime = call_month.call_total - call_month.called_time - cur_called_time;
                            if (leftTime <= config.SIM.callLeftTimeNotice) {
                                var user = await FLI.plug.mysql.seleteSingle("user", "jg_id", [{ field: "tel", value: device_info.tel }]);
                                if (user && user.jg_id) {
                                    //发送APP剩余通话时长通知
                                    jPush.pushNotification([user.jg_id], { type: "leftTime", device_id: device_id, leftTime: leftTime, data: { type: "leftTime" }, msg: "用户{0},名下设备:{1},剩余通话时长{2}分钟,请尽快续月费".format(device_info.tel, device_id, leftTime) });
                                }
                                else {
                                    console.error({ type: "callLeftTimeNotice", device_id: device_id });
                                }
                            }
                        }
                    }
                    else {
                        if (config.SIM.iOpenOffDevice) {
                            //无充值记录，直接停机，实际不会出现，做个保险
                            //停用卡：联通、用户表、设备表
                            await my_liantong.invoke("wsEditTerminal", { data: { iccid: device_info.iccid, asynchronous: "0", changeType: "3", targetValue: "3" } });
                            await FLI.plug.mysql.insert("user", { tel: device_info.tel, status: 1 });
                            await FLI.plug.mysql.insert("device", { device_id: device_id, status: 0 });
                        }
                    }
                    break;
                case "lowBatteryAlarm":
                    var device_id = content.deviceName;
                    var batteryRemainingCapacity = content.value.batteryRemainingCapacity || 20;
                    if (!content.value.batteryRemainingCapacity) {
                        console.error({ type: "batteryRemainingCapacity_None", device_id: device_id });
                    }
                    //低电量报警
                    var device_info = await FLI.plug.mysql.seleteSingle("device", "tel,iccid", [{ field: "device_id", value: device_id }]);
                    if (device_info) {
                        var user = await FLI.plug.mysql.seleteSingle("user", "jg_id", [{ field: "tel", value: device_info.tel }]);
                        if (user && user.jg_id) {
                            jPush.pushNotification([user.jg_id], { type: "battery", device_id: device_id, data: { type: "battery" }, msg: "用户{0},名下设备:{1},仅剩余电量{2}%".format(device_info.tel, device_id, batteryRemainingCapacity) });
                        }
                        else {
                            console.error({ type: "batteryRemainingCapacity", device_id: device_id });
                        }
                    }
                    break;
                case "propertyUpdate":
                    if (config.isDev) {
                        console.log(content);
                    }
                    var device_id = content.deviceName;
                    switch (content.value.propertyId) {
                        case "gnssInfo":
                            if (config.isDev) {
                                console.log({ flag: "propertyUpdate.gnssInfo", data: GettingGnnsDevices[device_id] });
                            }
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            await getGnssData(device_id);
                            break;
                        // case "lbsInfo":
                        //     await getLbsData(device_id);
                        //     break;
                        default: break;
                    }
                    break;
                case "fuzzyLocEnd"://同时获取wifi和基站数据调用高德接口进行定位
                    if (config.isDev) {
                        console.log(content);
                    }
                    var device_id = content.deviceName;
                    await getLbs_WifiData(device_id);
                    break;
                default: break;
            }
            //发送ACK，注意不要在回调函数有耗时逻辑。
            context.delivery.accept();
        }
        catch (ex) {
            if (config.isDev) {
                console.log(ex)
            }
        }
    });
    console.log("turn on ali_wuliwang_message")
}
else {
    console.log("turn off ali_wuliwang_message")
}
//服务配置化
var yfiRouter = FLI.createRouter(router, "app");
var GettingGnnsDevices = {};

/** 需要轮训的数据需要存入缓存
 * addedDevice 需要添加的设备编号
*/
function addGettingGnnsDevices(addedDeviceName, jg_id) {
    var guid = uuidv4();
    GettingGnnsDevices[addedDeviceName] = { guid: guid, create_time: +new Date(), jg_id: jg_id };
    return guid;
}

function removeGettingGnnsDevices(removeDeviceName) {
    if (config.isDev) {
        console.log({ removeGettingGnnsDevices: removeDeviceName })
    }
    delete GettingGnnsDevices[removeDeviceName];
}

/**
 * 定时轮训服务，主要用于：
 * 获取定位数据
 * 每个月更新设备状态是否停机
*/
var iUpdateDeviceStatus = false;
setInterval(async function () {
    for (var device_name in GettingGnnsDevices) {
        if (GettingGnnsDevices[device_name]) {
            try {
                //120秒后
                if (GettingGnnsDevices[device_name].create_time + (1000 * config.gpsTimeoutMax) < +new Date()) {
                    removeGettingGnnsDevices(device_name);
                    continue;
                }
                //20秒后，120秒内
                // if (GettingGnnsDevices[device_name].create_time + (1000 * config.gpsTimeout) <= +new Date() && GettingGnnsDevices[device_name].iGetLbs == undefined) {
                //     console.log(+new Date());
                //     await getLbsData(device_name);
                //     continue;
                // }
                //120秒内
                // if (GettingGnnsDevices[device_name].create_time + (1000 * config.gpsTimeoutMax) >= +new Date()) {
                //     //超时就读取阿里云基站数据
                //     await getGnssData(device_name);
                //     continue;
                // }
            }
            catch (ex) {
                console.error(ex);
            }
        }
        //一秒钟接口调用最多50次
        await wait(20);
    }
    //每月初未充值 停机处理，凌晨处理无需异步
    var date = new Date();
    var day = FLI.plug.date.getFormatByDate(date, "DD");
    if (!iUpdateDeviceStatus && day === "01" && date.getHours() == 0 && date.getMinutes() == 0) {
        console.log("----进入每月初未充值 停机处理----");
        iUpdateDeviceStatus = true;
        //当月未充值用户停机处理
        await SetDeviceOffByNoCharge();
    }
}, 1 * 1000)

async function getLbs_WifiData(device_name) {
    try {
        if (GettingGnnsDevices[device_name]) {
            var deviceLoopInfo = JSON.parse(JSON.stringify(GettingGnnsDevices[device_name]));
            //分开两个搞

            var multiLbsInfo_wlw = await myAliWulianwang.QueryDeviceLastPropertiesData({
                "Identifiers": ["multiLbsInfo"],
                "DeviceName": device_name
            });

            var wifiScanInfo_wlw = await myAliWulianwang.QueryDeviceLastPropertiesData({
                "Identifiers": ["wifiScanInfo"],
                "DeviceName": device_name
            });

            var device_info_wlw = await myAliWulianwang.QueryDeviceLastPropertiesData({
                "Identifiers": ["imei", "imsi"],
                "DeviceName": device_name
            });

            var device_info = await FLI.plug.mysql.seleteSingle("device", "device_tel,iccid", [{ field: "device_id", value: device_name }]);
            if (config.isDev) {
                console.log({ create_time: deviceLoopInfo.create_time, result_time: getTimeStr(wifiScanInfo_wlw.time) });
            }
            if (device_info && device_info_wlw && multiLbsInfo_wlw && wifiScanInfo_wlw && multiLbsInfo_wlw.multiLbsInfo && wifiScanInfo_wlw.wifiScanInfo) {
                const multiLbsInfos = JSON.parse(multiLbsInfo_wlw.multiLbsInfo ? multiLbsInfo_wlw.multiLbsInfo : "{}");
                const wifiScanInfos = JSON.parse(wifiScanInfo_wlw.wifiScanInfo ? wifiScanInfo_wlw.wifiScanInfo : "{}");
                //找出接入基站
                var servingMultiLbsInfo;
                //找出周边基站，未接入的基站
                var unServingMultiLbsInfo = [];
                if (multiLbsInfos && multiLbsInfos.length > 0) {
                    for (var multiLbsInfo_index = 0; multiLbsInfo_index < multiLbsInfos.length; multiLbsInfo_index++) {
                        var _multiLbsInfo = multiLbsInfos[multiLbsInfo_index];
                        //0-113dbm 如果>0则= *2-113
                        var bts = _multiLbsInfo.mcc + "," + _multiLbsInfo.mnc + "," + _multiLbsInfo.lac_id + "," + _multiLbsInfo.cell_id + "," + (_multiLbsInfo.signal > 0 ? (_multiLbsInfo.signal * 2 - 113) : _multiLbsInfo.signal);
                        if (_multiLbsInfo.isServing == 1) {
                            servingMultiLbsInfo = bts;
                        }
                        else {
                            unServingMultiLbsInfo.push(bts);
                        }
                    }
                }
                var imei = device_info_wlw.imei,
                    imsi = device_info_wlw.imsi,
                    tel = device_info.device_tel,
                    lbs = servingMultiLbsInfo,
                    nearbts = unServingMultiLbsInfo.join("|");
                var macs = "";
                if (wifiScanInfos && wifiScanInfos.length > 0) {
                    wifiScanInfos.forEach((item, index, array) => {
                        macs += item.bssid + "|"
                    });
                }
                macs = macs.length > 0 ? macs.substring(0, macs.length - 1) : "";
                var gaode_result = await gaode.locationByWifi_Lbs(imei, imsi, tel, lbs, nearbts, macs);
                //将gnns数据插入数据库中
                if (gaode_result && gaode_result.data && gaode_result.data.result && gaode_result.data.result.type != "0") {
                    var location = gaode_result.data.result.location,
                        desc = gaode_result.data.result.desc,
                        longitude = parseFloat(location.split(',')[0]),
                        latitude = parseFloat(location.split(',')[1]);
                    //gps坐标转换
                    // var gaodeResult = await gaode.convertCoordinate(longitude, latitude);
                    // if (gaodeResult.data && gaodeResult.data.status == 1) {
                    //     var locations = gaodeResult.data.locations.split(',');
                    //     if (locations && locations.length == 2) {
                    //         longitude = parseFloat(locations[0]);
                    //         latitude = parseFloat(locations[1]);
                    //     }
                    // }
                    await FLI.plug.mysql.insert("device_records", { device_id: device_name, data: JSON.stringify({ flag: "Lbs_WifiData", latitude: latitude, longitude: longitude, type: "gnns", desc: desc }), type: "gnns", create_time: getTimeStr(+new Date()), guid: deviceLoopInfo.guid, ivalid: 1 });
                    //推送
                    if (deviceLoopInfo) {
                        jPush.pushDIYMessage([deviceLoopInfo.jg_id], { type: "locate", device_id: device_name, data: { guid: deviceLoopInfo.guid, location: { type: "lbs", time: +new Date(), latitude: latitude, longitude: longitude } } });
                        if (GettingGnnsDevices[device_name]) GettingGnnsDevices[device_name].iGetLbs = true;
                    }
                    else {
                        console.error({ flag: "getLbs_WifiData-nopush", device_name: device_name, time: getTimeStr(new Date()) });
                    }
                }
                else {
                    console.error({ flag: "locationByWifi_Lbs", imei, imsi, tel, lbs, nearbts, macs });
                }
            }
        }
    }
    catch (ex) {
        console.error({ flag: "getLbs_WifiData", ex: ex });
    }
}

async function getLbsData(device_name) {
    if (GettingGnnsDevices[device_name]) {
        var deviceLoopInfo = JSON.parse(JSON.stringify(GettingGnnsDevices[device_name]));
        await myAliWulianwang.QueryDeviceLastPropertiesData({
            "Identifiers": ["lbsInfo"],
            "DeviceName": device_name
        }, async function (_result, ex) {
            if (ex) { return; }
            if (config.isDev) {
                console.log({ create_time: deviceLoopInfo.create_time, result_time: _result.time });
            }
            var lbsInfo = JSON.parse(_result.lbsInfo);
            var lbs = lbsInfo.mcc + "," + lbsInfo.mnc + "," + lbsInfo.lac_id + "," + lbsInfo.cell_id + "," + (lbsInfo.signal > 0 ? (lbsInfo.signal * 2 - 113) : lbsInfo.signal);
            var gaode_result = await gaode.locationByWifi_Lbs("", "", "", lbs, "", "");
            if (gaode_result && gaode_result.data && gaode_result.data.result && gaode_result.data.result.type != "0") {
                var location = gaode_result.data.result.location;
                var longitude = parseFloat(location.split(',')[0]);
                var latitude = parseFloat(location.split(',')[1]);
                //将gnns数据插入数据库中
                await FLI.plug.mysql.insert("device_records", { device_id: device_name, data: JSON.stringify({ latitude: latitude, longitude: longitude, type: "gnns", lac: lbsInfo.lac_id, mcc: lbsInfo.mcc, cell_id: lbsInfo.cell_id }), type: "gnns", create_time: getTimeStr(+new Date()), guid: deviceLoopInfo.guid, ivalid: 1 });
                //推送
                if (deviceLoopInfo) {
                    jPush.pushDIYMessage([deviceLoopInfo.jg_id], { type: "locate", device_id: device_name, data: { guid: deviceLoopInfo.guid, location: { type: "lbs", time: +new Date(), latitude: latitude, longitude: longitude } } });
                    if (GettingGnnsDevices[device_name]) GettingGnnsDevices[device_name].iGetLbs = true;
                }
                else {
                    console.error({ flag: "getLbsData-nopush", device_name: device_name, time: getTimeStr(new Date()) });
                }
            }
        }).catch(function (error) {
            console.log(error);
        });
    };
}

async function getGnssData(device_name) {
    if (GettingGnnsDevices[device_name]) {
        var deviceLoopInfo = JSON.parse(JSON.stringify(GettingGnnsDevices[device_name]));
        var result = await myAliWulianwang.QueryDeviceLastPropertiesData({
            "Identifiers": ["gnssInfo"],
            "DeviceName": device_name
        });
        if (!result) { return; }
        var gnns = JSON.parse(result.gnssInfo);
        if (config.isDev) {
            console.log({ device_id: device_name, gnns: gnns, msg: "getted gnns data" });
        }
        //要判断是否是最新数据，与定位开始时间比较下即可，把阿里云数据Time拿过来比较好了
        // if (deviceLoopInfo.create_time < result.time) {
        if (gnns && gnns.valid == 1) {
            //经纬度转换
            if (config.isDev) {
                console.log({ longitude: gnns.longitude, latitude: gnns.latitude, msg: "conver before" })
            }
            //gps坐标转换
            var gaodeResult = await gaode.convertCoordinate(gnns.longitude, gnns.latitude);
            if (gaodeResult.data && gaodeResult.data.status == 1) {
                var locations = gaodeResult.data.locations.split(',');
                if (locations && locations.length == 2) {
                    gnns.longitude = parseFloat(locations[0]);
                    gnns.latitude = parseFloat(locations[1]);
                }
            }
            if (config.isDev) {
                console.log({ longitude: gnns.longitude, latitude: gnns.latitude, msg: "conver after" })
            }
            //将gnns数据插入数据库中
            await FLI.plug.mysql.insert("device_records", { device_id: device_name, data: JSON.stringify({ latitude: gnns.latitude, longitude: gnns.longitude, type: "gnns" }), type: "gnns", create_time: getTimeStr(+new Date()), guid: deviceLoopInfo.guid, ivalid: 1 });
            //推送
            if (deviceLoopInfo) {
                jPush.pushDIYMessage([deviceLoopInfo.jg_id], { type: "locate", device_id: device_name, data: { guid: deviceLoopInfo.guid, location: { type: "gnns", time: +new Date(), latitude: gnns.latitude, longitude: gnns.longitude } } });
                if (GettingGnnsDevices[device_name]) removeGettingGnnsDevices(device_name);
            }
            else {
                console.error({ flag: "getGnssData-nopush", device_name: device_name, time: getTimeStr(new Date()) });
            }
        }
        // }
    }
}

//当月未充值用户停机处理
async function SetDeviceOffByNoCharge() {
    var month = FLI.plug.date.getFormatByDate(new Date(), "YYYY-MM-01 00:00:00");
    var devicesNoCharge = await FLI.plug.mysql.selectBySQL(`
    SELECT DISTINCT device.iccid,device.device_id,device.tel FROM device
    LEFT JOIN device_call_records ON device.device_id = device_call_records.device_id AND call_month = ?
    WHERE device_call_records.call_month IS NULL AND device.iccid IS NOT NULL AND device.iccid != ''
    `, [month]);
    if (devicesNoCharge && devicesNoCharge.length && devicesNoCharge.length > 0) {
        console.log("----共需停机数量：" + devicesNoCharge.length + ",iccid明细如下----");
        console.log(JSON.stringify(devicesNoCharge));
        for (var devicesNoCharge_index = 0; devicesNoCharge_index < devicesNoCharge.length; devicesNoCharge_index++) {
            var device = devicesNoCharge[devicesNoCharge_index];
            await my_liantong.invoke("wsEditTerminal", { data: { iccid: device.iccid, asynchronous: "0", changeType: "3", targetValue: "3" } });
            await FLI.plug.mysql.insert("device", { device_id: device.iccid, status: 0 });
            if (device.tel) {
                await FLI.plug.mysql.insert("user", { tel: device.tel, status: 1 });
            }
        }
    }
}

//到期提醒（月底前一周，中午12点）
async function expireNotice() {
    var month = FLI.plug.date.getFormatByDate(new Date(), "YYYY-MM-01 00:00:00");
    var devicesNoCharge = await FLI.plug.mysql.selectBySQL(`
    SELECT DISTINCT device.iccid FROM device
    LEFT JOIN device_call_records ON device.device_id = device_call_records.device_id AND call_month = ?
    WHERE device_call_records.call_month IS NULL AND device.iccid IS NOT NULL AND device.iccid != ''
    `, [month]);
    if (devicesNoCharge && devicesNoCharge.length && devicesNoCharge.length > 0) {
        console.log("----共需停机数量：" + devicesNoCharge.length + ",iccid明细如下----");
        console.log(JSON.stringify(devicesNoCharge));
        for (var devicesNoCharge_index = 0; devicesNoCharge_index < devicesNoCharge.length; devicesNoCharge_index++) {
            await my_liantong.invoke("wsEditTerminal", { data: { iccid: '89860921700009449101', asynchronous: "0", changeType: "3", targetValue: "3" } });
        }
    }
}

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

function getTimeStr(date) {
    var date = new Date(date);
    var dateStr = "";
    var year = date.getFullYear();
    year = year.toString().substring(2);
    var month = date.getMonth() + 1;
    month = month < 10 ? "0" + month : month;
    var day = date.getDate();
    day = day < 10 ? "0" + day : day;
    var hour = date.getHours();
    hour = hour < 10 ? "0" + hour : hour;
    var minutes = date.getMinutes();
    minutes = minutes < 10 ? "0" + minutes : minutes;
    var seconds = date.getSeconds();
    seconds = seconds < 10 ? "0" + seconds : seconds;
    dateStr = year + "-" + month + "-" + day + " " + hour + ":" + minutes + ":" + seconds;
    return dateStr;
}

// 公共方法
async function check_token(token) {
    const tel = await redisGetAsync("token:" + token)
    if (!tel) {
        return null
    }
    const user = await mysql.get_user_info(tel)
    if (!user || !user.password) {
        return null
    }
    rds.setex("token:" + token, config.token_expire, tel)
    return user
}

/* 请求手机验证码 */
router.post('/get-verify-code', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const tel = req.body.tel
    const purpose = req.body.purpose // 0-注册，1-忘记密码

    // 参数校验
    if (typeof tel !== 'string' || !tel.startsWith('+') || (purpose !== 0 && purpose !== 1)) {
        result.code = error_code.ERROR_PARAMETER;
        res.end(JSON.stringify(result))
        return
    }

    const user = await mysql.get_user_info(tel)
    // 注册请求验证码
    if (purpose === 0 && user && user.password) {
        result.code = error_code.ERROR_PHONE_NUMBER_ALREADY_REGISTER;
        res.end(JSON.stringify(result))
        return
    }

    // 找回密码请求验证码
    if (purpose === 1 && (!user || !user.password)) {
        result.code = error_code.ERROR_BAD_PHONE_NUMBER;
        res.end(JSON.stringify(result))
        return
    }

    // 1分钟内同一个手机号只能发送一次验证码
    const rds_tel_key_limit = "verify_limit:" + tel
    const rds_cache_tel = await redisGetAsync(rds_tel_key_limit)
    if (rds_cache_tel) {
        result.code = error_code.ERROR_REQUEST_SIM_CODE_TOO_FREQUENTLY;
        res.end(JSON.stringify(result))
        return
    }
    rds.setex(rds_tel_key_limit, 60, 'limit-1-min')

    // 生成6位数字
    const random_six = utils.rand_num_str(6)

    // 验证码5分钟有效
    const rds_tel_key = "verify:" + tel
    rds.setex(rds_tel_key, 5 * 60, random_six)

    // TODO 将 random_six 发送到手机
    my_ali_duanxin.SendSms(tel, { code: random_six });

    res.end(JSON.stringify(result))
});

/* 注册 */
router.post('/sign', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const tel = req.body.tel
    const code = req.body.code
    const password = req.body.password

    // 参数校验
    if (typeof tel !== 'string' || !tel.startsWith('+') || !code || !password) {
        result.code = error_code.ERROR_PARAMETER;
        res.end(JSON.stringify(result))
        return
    }

    // 检查tel是否已经注册
    const user = await mysql.get_user_info(tel)
    if (user && user.password) {
        result.code = error_code.ERROR_PHONE_NUMBER_ALREADY_REGISTER;
        res.end(JSON.stringify(result))
        return
    }

    if (password) {
        var reg = /^(?=.*[a-zA-Z])(?=.*\d).{8,64}$/;
        var keyWords = password.match(reg);
        if (keyWords && keyWords.length > 0) {
        }
        else {
            result.code = error_code.ERROR_BAD_PASSWORD;
            res.end(JSON.stringify(result))
            return;
        }
    }

    // 检查code
    const rds_tel_key = "verify:" + tel
    const rds_cache_tel = await redisGetAsync(rds_tel_key)
    const wrongCountRedisKey = tel + ":verifyCodeWrongCount";
    //计算验证码失效
    var wrongCount = await FLI.plug.cache.get(wrongCountRedisKey);
    if (rds_cache_tel && rds_cache_tel != code) {
        if (wrongCount) {
            wrongCount++;
            if (wrongCount >= 5) {
                FLI.plug.cache.set(wrongCountRedisKey, 0.5 * 3600, wrongCount);
                FLI.plug.cache.remove(rds_tel_key);
                FLI.plug.cache.remove(wrongCount);
                result.code = error_code.ERROR_VERIFY_CODE_EXPIRED;
                res.end(JSON.stringify(result))
                return
            }
        }
        else {
            wrongCount = 1;
        }
        FLI.plug.cache.set(wrongCountRedisKey, 0.5 * 3600, wrongCount);
        result.code = error_code.ERROR_VERIFY_CODE_EXPIRED;
        result.error_msg = "验证码连续输入错误" + wrongCount + "次，连续5次错误验证码自动失效";
        res.end(JSON.stringify(result))
        return
    }
    FLI.plug.cache.remove(wrongCountRedisKey);
    rds.del(rds_tel_key)
    if (rds_cache_tel && rds_cache_tel == code) {
        // 加密password
        const md5 = crypto.createHash('md5');
        const enc_password = md5.update(password + config.server_salt).digest('hex');
        // 注册成功
        await mysql.add_user(tel, enc_password)

        res.end(JSON.stringify(result))
    }
    else {
        result.error_msg = "请先获取验证码";
        res.end(JSON.stringify(result))
    }
});

yfiRouter.action("login").operate("账号是否存在及锁定").setFun(
    async function (tel, password) {
        const wrongCountRedisKey = tel + ":pwdWrongCount";
        //计算账号锁定
        var wrongCount = await FLI.plug.cache.get(wrongCountRedisKey);
        if (wrongCount && wrongCount >= 5) {
            return { code: ERROR_CODE.ERROR_ACCOUNT_LOCKED, errors: [{ error_code: ERROR_CODE.ERROR_ACCOUNT_LOCKED, error_msg: "密码连续输入错误5次，账号已经被锁定，请10分钟后重试" }] };
        }

        var iExist = await FLI.plug.mysql.iExist("user", [{ field: "tel", value: tel }, { field: "password", value: password }]);
        if (iExist === false) {
            if (wrongCount) {
                wrongCount++;
                if (wrongCount >= 5) {
                    FLI.plug.cache.set(wrongCountRedisKey, 10 * 60, wrongCount);
                    return { code: ERROR_CODE.ERROR_ACCOUNT_LOCKED, errors: [{ error_code: ERROR_CODE.ERROR_ACCOUNT_LOCKED, error_msg: "密码连续输入错误5次，账号已经被锁定，请10分钟后重试" }] };
                }
            }
            else {
                wrongCount = 1;
            }
            FLI.plug.cache.set(wrongCountRedisKey, 10 * 60, wrongCount);
            return { code: ERROR_CODE.ERROR_ACCOUNT_LOCKED, errors: [{ error_code: ERROR_CODE.ERROR_ACCOUNT_LOCKED, error_msg: "密码连续输入错误" + wrongCount + "次，连续5次错误账号将被锁定" }] };
        }
        FLI.plug.cache.remove(wrongCountRedisKey);
        return { code: ERROR_CODE.ERROR_SUCCESS };
    }
)

/* 忘记密码 */
router.post('/forgot-password', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const tel = req.body.tel
    const code = req.body.code
    const password = req.body.password

    // 参数校验
    if (typeof tel !== 'string' || !tel.startsWith('+') || !code || !password) {
        result.code = error_code.ERROR_PARAMETER;
        res.end(JSON.stringify(result))
        return
    }

    // tel还未注册
    const user = await mysql.get_user_info(tel)
    if (!user || !user.password) {
        result.code = error_code.ERROR_BAD_PHONE_NUMBER;
        res.end(JSON.stringify(result))
        return
    }

    // 检查code
    const rds_tel_key = "verify:" + tel
    const rds_cache_tel = await redisGetAsync(rds_tel_key)
    if (rds_cache_tel !== code) {
        result.code = error_code.ERROR_CHECK_VERIFY_CODE;
        res.end(JSON.stringify(result))
        return
    }
    // 删除redis缓存
    rds.del(rds_tel_key)

    const md5 = crypto.createHash('md5');
    const enc_password = md5.update(password + config.server_salt).digest('hex');
    await mysql.add_user(tel, enc_password, user.parent)

    res.end(JSON.stringify(result))
})

// 修改密码
router.post('/modify-password', async (req, res, next) => {
    const verify_params = [FLI.plug.commonFilter.authentication, "old", "new"];
    FLI.actionFilter.execFilters(req, res, next, verify_params);
}, async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const user = res.locals.user;
    const old_password = req.body.old
    const new_password = req.body.new

    var enc_password = crypto.createHash('md5').update(old_password + config.server_salt).digest('hex');
    if (user.password !== enc_password) {
        result.code = error_code.ERROR_BAD_PASSWORD
        res.end(JSON.stringify(result))
        return
    }

    // 修改密码
    if (old_password !== new_password) {
        enc_password = crypto.createHash('md5').update(new_password + config.server_salt).digest('hex');
        var reg = /^(?=.*[a-zA-Z])(?=.*\d).{8,64}$/;
        var keyWords = new_password.match(reg);
        if (keyWords && keyWords.length > 0) {
            await mysql.add_user(user.tel, enc_password, user.parent)
        }
        else {
            result.code = error_code.ERROR_BAD_PASSWORD;
            result.code
            res.end(JSON.stringify(result))
            return;
        }
    }

    res.end(JSON.stringify(result))
});

// get-pending接口
router.post('/get-pending', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const token = req.headers.authorization
    const pending = req.query.pending

    // 参数错误
    if (!token || !pending) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    const user = check_token(token)
    if (!user) {
        result.code = error_code.ERROR_TOKEN_EXPIRED
        res.end(JSON.stringify(result))
        return
    }

    const pending_result = await redisGetAsync(pending)
    if (!pending_result) {
        result.code = error_code.ERROR_PENDING_TIMEOUT
        res.end(JSON.stringify(result))
        return
    }

    if (pending_result === 'pending') {
        result.code = error_code.ERROR_PENDING_IN_PROGRESS
        res.end(JSON.stringify(result))
        return
    }

    // 返回pending结果
    res.end(pending_result)
});

// 绑定
yfiRouter.action("bind-device").operate("阿里云绑定设备").setFun(
    async function (user, code, device_info, un_connect_aliyun, res, callback) {
        var devicename = ""
        try {
            const obj = JSON.parse(device_info);
            devicename = obj.devicename
            //将绑定后的设备手机号等信息存入库中
            if (user.tel && devicename) {
                await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["imsi", "iccid"],
                    "DeviceName": devicename
                }, async function (_result, ex) {
                    if (ex) {
                        result.code = error_code.ERROR_DEVICE_OFFLINE;
                        result.ex = ex;
                        callback(result);
                        return;
                    }
                    var result = { code: error_code.ERROR_SUCCESS }
                    //调用联通接口获取SIM卡信息
                    var device_tel = "";
                    var iccid = _result.iccid;
                    result.device_id = devicename;
                    var primaryNumber = user.tel;
                    if (primaryNumber.substring(0, 3) == "+86") {
                        primaryNumber = primaryNumber.substring(3);
                    }
                    //设置阿里物联网设备绑定属性
                    await myAliWulianwang.clientPost("SetDeviceProperty", {
                        "Items": JSON.stringify({ "bindState": 1, "telNumberInfo": [{ "isPrimaryNumber": 1, "number": primaryNumber }] }),
                        "DeviceName": devicename
                    }, async function (_result, ex) {
                        //如果有忽略阿里云参数，则不需要返回错误
                        if (ex && un_connect_aliyun != "1") {
                            result.code = error_code.ERROR_DEVICE_OFFLINE;
                            callback(result);
                            return;
                        }
                        //只有成功请求阿里云或则 设置忽略阿里云才进入(un_connect_aliyun参数为了考虑正式环境事务同步)
                        if (!ex || un_connect_aliyun == "1") {
                            //新增白名单
                            var liantong_device_info;
                            var iActive = 0;
                            try {
                                liantong_device_info = await my_liantong.invoke("wsGetTerminalDetails", { data: { iccids: [iccid] } });
                                if (config.isDev) {
                                    console.log({ flag: "bind-device.wsGetTerminalDetails", result: liantong_device_info, iccid: iccid })
                                }
                                if (liantong_device_info && liantong_device_info.data && liantong_device_info.data.data && liantong_device_info.data.data.terminals && liantong_device_info.data.data.terminals.length && liantong_device_info.data.data.terminals[0].msisdn) {
                                    device_tel = liantong_device_info.data.data.terminals[0].msisdn;
                                    iActive = liantong_device_info.data.data.terminals[0].simStatus == "2" ? 1 : 0;
                                    var addUserWhiteList = await my_liantong.invoke("addUserWhiteList", { data: { groupId: device_tel, numberSegment: user.tel.substring(1), matchType: "0", numberPlan: "4", wlType: "1", minLength: "1", maxLength: "20" } });
                                    await wait(150);
                                    addUserWhiteList = await my_liantong.invoke("addUserWhiteList", { data: { groupId: device_tel, numberSegment: user.tel.substring(1), matchType: "0", numberPlan: "4", wlType: "0", minLength: "1", maxLength: "20" } });
                                    if (addUserWhiteList.data.message != "OK") {
                                        result.error_msg = addUserWhiteList.data.message;
                                    }
                                }
                            }
                            catch (ex) {
                                result.error_code = 500;
                                console.error({ flag: "bind-device", ex: ex, iccid: iccid });
                                callback(result);
                            }
                            //新增/更新 设备绑定号码
                            await FLI.plug.mysql.insert("device", { device_id: devicename, tel: user.tel, iccid: iccid, device_tel: device_tel, bind_time: getTimeStr(new Date()), status: iActive });
                            //更新用户状态
                            await FLI.plug.mysql.insert("user", { tel: user.tel, status: 1 + iActive });
                            if (config.isDev) {
                                console.log(JSON.stringify({ 成功绑定设备: devicename, 用户: user.parent || user.tel, un_connect_aliyun: un_connect_aliyun }));
                            }
                        }
                        // 删除redis缓存
                        rds.del("device-bind:" + code);
                        callback(result);
                    });
                });
            }
            else {
                result.error_code = error_code.ERROR_DEVICE_OFFLINE;
                callback(result);
            }
        } catch (e) {
            result.code = error_code.ERROR_DEVICE_OFFLINE;
            result.device_id = devicename;
            console.log("设备绑定失败:" + JSON.stringify({ 绑定设备: device_info, 用户: user.parent || user.tel }));
            callback(result);
        }
    }
)

// 解除绑定
router.post('/unbind-device', async function (req, res, next) {
    var result = { code: error_code.ERROR_SUCCESS }
    const token = req.headers.authorization
    const device_id = req.body.device_id
    const un_connect_aliyun = req.body.un_connect_aliyun;

    // 参数错误
    if (!token || !device_id) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    const user = await check_token(token)
    if (!user) {
        result.code = error_code.ERROR_TOKEN_EXPIRED
        res.end(JSON.stringify(result))
        return
    }

    // 子账户不允许此操作
    if (user.parent) {
        result.code = error_code.ERROR_CHILD_OPERATION_NOT_ALLOWED
        res.end(JSON.stringify(result))
        return
    }

    var result = common.unbind(device_id, function (result) {
        res.end(JSON.stringify(result))
    }, un_connect_aliyun);
});

// 注销账户
router.post('/deleteUser', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const token = req.headers.authorization
    const un_connect_aliyun = req.body.un_connect_aliyun;

    // 参数错误
    if (!token) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    const user = await check_token(token)
    if (!user) {
        result.code = error_code.ERROR_TOKEN_EXPIRED
        res.end(JSON.stringify(result))
        return
    }

    // 子账户不允许此操作
    if (user.parent) {
        result.code = error_code.ERROR_CHILD_OPERATION_NOT_ALLOWED
        res.end(JSON.stringify(result))
        return
    }
    //阿里云解绑
    if (user.device_id) {
        try {
            await myAliWulianwang.clientPost("SetDeviceProperty", {
                "Items": JSON.stringify({ "bindState": 0, "telNumberInfo": [] }),
                "DeviceName": user.device_id
            });
        }
        catch (ex) {
            result.code = error_code.ERROR_PARAMETER
            res.end(JSON.stringify(result))
        }
    }
    //置空设备的绑定手机
    await mysql.del_device(user.device_id);
    //删除账号(如果不删除，子账号不能添加到其他主账号)
    await FLI.plug.mysql.delete("user", { tel: user.tel });
    //删除所有子账号(如果不删除，子账号不能添加到其他主账号)Î
    await FLI.plug.mysql.delete("user", { parent: user.tel });
    //清空缓存
    FLI.plug.cache.remove("token:" + token)
    res.end(JSON.stringify(result))
});

// 定位
router.post('/gps', async function (req, res, next) {
    var result = { code: error_code.ERROR_SUCCESS }
    const token = req.headers.authorization
    const device_id = req.body.device_id
    // 参数错误
    if (!token || !device_id) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }
    const user = await check_token(token)
    if (!user) {
        result.code = error_code.ERROR_TOKEN_EXPIRED
        console.error({ device_id: device_id })
        res.end(JSON.stringify(result))
        return
    }
    // 此设备未绑定在此用户名下
    const device_info = await mysql.get_device_info(device_id)
    if (!device_info || device_info.tel !== user.tel) {
        result.code = error_code.ERROR_PARAMETER
        console.error({ device_id: device_id, device_info: device_info })
        res.end(JSON.stringify(result))
        return
    }

    //gps定位记录
    await FLI.plug.mysql.insert("device_event", { device_id: device_id, event_type: 0, tel: user.tel, timestamp: Math.floor(Date.now() / 1000), create_time: getTimeStr(new Date()) });
    //给阿里云发送定位指令，隔10秒钟后开始轮训去阿里取gnns数据，持续5分钟，频率为15秒一次
    try {
        var invoke2 = await myAliWulianwang.clientPost("InvokeThingService", {
            "Identifier": "fuzzyLoc",
            "Args": JSON.stringify({}),
            "DeviceName": device_id
        });

        var invoke1 = await myAliWulianwang.clientPost("InvokeThingService", {
            "Identifier": "getDeviceProperty",
            "Args": JSON.stringify({ propertyIdList: [{ propertyId: "gnssInfo", getPropertyTimeoutMs: 1000 * config.gpsTimeoutMax, sendEvent: 1 }] }),
            "DeviceName": device_id
        });
        // 加入轮训服务队列
        var guid = addGettingGnnsDevices(device_id, user.jg_id);//jg_id 是极光客户端id
        result.guid = guid;//用该唯一标识去调用getGPSByGuid获取本次定位数据
        if (config.isDev) {
            console.log({ flag: "gps", device_id: device_id, guid: guid, time: getTimeStr(new Date()) });
        }

        // 立即发送最新的 LBS 位置
        setTimeout(() => {
            getLbsData(device_id)
        }, 100)
    } catch (ex) {
        result.code = error_code.ERROR_DEVICE_OFFLINE;
        result.msg = JSON.stringify(ex);
    }
    res.end(JSON.stringify(result))
})

// 通话
router.post('/call', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const token = req.headers.authorization
    const device_id = req.body.device_id

    // 参数错误
    if (!token || !device_id) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    const user = await check_token(token)
    if (!user) {
        result.code = error_code.ERROR_TOKEN_EXPIRED
        res.end(JSON.stringify(result))
        return
    }

    // 此设备未绑定在此用户名下
    const device_info = await mysql.get_device_info(device_id)
    if (!device_info || device_info.tel !== user.tel) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    // 记录通话事件, 0-gps请求 1-主叫 2-被叫
    await mysql.add_device_event(device_id, "", 2, user.tel, Math.floor(Date.now() / 1000))

    res.end(JSON.stringify(result))
})

// 添加子账号
yfiRouter.action("add-child").operate("阿里云添加子账号").setFun(
    async function (device, main_tel, childs, un_connect_aliyun, child_tel, callback) {
        var result = { code: error_code.ERROR_SUCCESS }
        var telNumberInfo = [{ "isPrimaryNumber": 1, "number": main_tel.substring(3, main_tel.length) }];
        for (var index = 0; index < childs.length; index++) {
            telNumberInfo.push({ "isPrimaryNumber": 0, "number": childs[index].tel.substring(3, childs[index].tel.length) });
        }
        await myAliWulianwang.clientPost("SetDeviceProperty", {
            "Items": JSON.stringify({ "telNumberInfo": telNumberInfo }),
            "DeviceName": device.device_id
        }, async function (_result, ex) {
            //如果有忽略阿里云参数，则不需要返回错误
            if (ex && un_connect_aliyun != "1") {
                result.code = error_code.ERROR_DEVICE_OFFLINE;
                result.errors = []
                result.errors.push({ error_code: error_code.ERROR_DEVICE_OFFLINE, error_msg: "设备不在线，阿里云子账号添加失败" })
                callback(result)
            }
            var addUserWhiteList = await my_liantong.invoke("addUserWhiteList", { data: { groupId: device.device_tel, numberSegment: child_tel.substring(1), matchType: "0", numberPlan: "4", wlType: "1", minLength: "1", maxLength: "20" } });
            await wait(150);
            addUserWhiteList = await my_liantong.invoke("addUserWhiteList", { data: { groupId: device.device_tel, numberSegment: child_tel.substring(1), matchType: "0", numberPlan: "4", wlType: "0", minLength: "1", maxLength: "20" } });
            if (addUserWhiteList.data.message != "OK") {
                result.error_msg = addUserWhiteList.data.message;
            }
            callback(result)
        });
        return { async: true }
    }
)

// 删除子账户
router.post('/remove-child', async (req, res, next) => {
    const verify_params = [FLI.plug.commonFilter.authentication, "tel"];
    FLI.actionFilter.execFilters(req, res, next, verify_params);
}, async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const user = res.locals.user;
    const tel = req.body.tel
    const un_connect_aliyun = req.body.un_connect_aliyun

    // 参数错误
    if (!tel.startsWith('+')) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    // 子账户不允许此操作
    if (user.parent) {
        result.code = error_code.ERROR_CHILD_OPERATION_NOT_ALLOWED
        res.end(JSON.stringify(result))
        return
    }

    // 子账户不存在，或者子账户非此用户名下
    const user_exist = await mysql.get_user_info(tel)
    if (!user_exist || user_exist.parent !== user.tel) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    var childs = await FLI.plug.mysql.select("user", "tel", [{ field: "parent", value: user.tel }])
    var device = await FLI.plug.mysql.seleteSingle("device", "device_id,device_tel", [{ field: "tel", value: user.tel }])

    // 此设备未绑定在此用户名下
    if (!device.device_id) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    //删除联通白名单
    try {
        var deleteUserWhiteList = await my_liantong.invoke("deleteUserWhiteList", { data: { groupId: device.device_tel, numberSegment: tel.substring(1) } });
        if (deleteUserWhiteList && deleteUserWhiteList.data.message != "OK") {
            result.error_msg = deleteUserWhiteList.data.message;
        }
    }
    catch (ex) {
        console.error({ flag: "remove-child.deleteUserWhiteList", err: ex });
    }
    // 移除账户关联
    await FLI.plug.mysql.delete("user", { tel });

    var telNumberInfo = [{ "isPrimaryNumber": 1, "number": user.tel.substring(3, user.tel.length) }];
    var childs = await FLI.plug.mysql.select("user", "tel", [{ field: "parent", value: user.tel }])
    for (var index = 0; index < childs.length; index++) {
        telNumberInfo.push({ "isPrimaryNumber": 0, "number": childs[index].tel.substring(3, childs[index].tel.length) });
    }
    myAliWulianwang.clientPost("SetDeviceProperty", {
        "Items": JSON.stringify({ "telNumberInfo": telNumberInfo }),
        "DeviceName": device.device_id
    }, function (_result, ex) {
        var result = { code: error_code.ERROR_SUCCESS }
        //如果有忽略阿里云参数，则不需要返回错误
        if (ex && un_connect_aliyun != "1") {
            result.code = error_code.ERROR_DEVICE_OFFLINE;
            result.errors = []
            result.errors.push({ error_code: error_code.ERROR_DEVICE_OFFLINE, error_msg: "设备不在线，阿里云子账号添加失败" })
        }
        res.end(JSON.stringify(result))
    });
})

//设备白名单获取(测试用)
yfiRouter.action("get-device-whiteList").operate("获取联通白名单").setFun(
    async function (device_tel) {
        var children = await my_liantong.invoke("queryUserWhiteList", { data: { groupId: device_tel } });
        if (children && children.data && children.data.data && children.data.data.userWList && children.data.data.userWList.length && children.data.data.userWList.length > 0) {
            var childrenDeviceTel = children.data.data.userWList.split(',');
            return { code: error_code.ERROR_SUCCESS, childrenDeviceTel: childrenDeviceTel };
        }
    }
)

// 关于设备
router.post('/device-info', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const token = req.headers.authorization
    const device_id = req.body.device_id

    // 参数错误
    if (!token || !device_id) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    const user = await check_token(token)
    if (!user) {
        result.code = error_code.ERROR_TOKEN_EXPIRED
        res.end(JSON.stringify(result))
        return
    }

    // 此设备未绑定在此用户名下
    const device_info = await mysql.get_device_info(device_id)
    if (!device_info || device_info.tel !== user.tel) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    //从阿里云获取设备电量信息
    var result1 = await myAliWulianwang.QueryDeviceLastPropertiesData({
        "Identifiers": ["batteryInfo", "volume", "alarmCapacity"],
        "DeviceName": device_info.device_id
    });
    var result2 = await myAliWulianwang.QueryDeviceLastPropertiesData({
        "Identifiers": ["iccid"],
        "DeviceName": device_info.device_id
    });
    var result3 = await myAliWulianwang.QueryDeviceLastPropertiesData({
        "Identifiers": ["firmwareVersion"],
        "DeviceName": device_info.device_id
    });
    //通过iccid获取手机信息，msisdn是手机号
    var _lt_device_info;
    try {
        _lt_device_info = await my_liantong.invoke("wsGetTerminalDetails", { data: { iccids: [result2.iccid] } });
    }
    catch (ex) {
        console.error({ flag: "device-info.wsGetTerminalDetails", ex: ex });
        result.code = error_code.ERROR_PARAMETER
        result.error = "联通接口错误";
        res.end(JSON.stringify(result));
        return;
    }
    if (_lt_device_info && _lt_device_info.data && _lt_device_info.data.data && _lt_device_info.data.data.terminals && _lt_device_info.data.data.terminals.length == 1) {
        //激活状态 SIM卡状态: “”0””: 可测试,””1””: 可激活,””2””: 已激活,””3””: 已停用, “”4””: 已失效,””5””””: 已清除,””6””: 已更换, “”7””: 库存, “”8””: 开始 -- 只识别2是已激活，其他均为未激活
        result.iActive = _lt_device_info.data.data.terminals[0].simStatus == "2" ? 1 : 0;
        //手机号
        result.phoneNumber = _lt_device_info.data.data.terminals[0].msisdn;
        //实名制状态(0-不需实名未实名,1-需要实名未实名,2-需要实名已实名,3-不需要实名已实名).-- 除1都算已实名
        result.identification = _lt_device_info.data.data.terminals[0].realNameStatus == "1" ? 0 : 1;
    }
    result.iActive = result.iActive == undefined ? device_info.status : result.iActive;
    result.phoneNumber = result.phoneNumber == undefined ? device_info.device_tel : result.phoneNumber;
    result.identification = result.identification == undefined ? device_info.identification : result.identification;

    if (result1.batteryInfo) {
        result.batteryInfo = JSON.parse(result1.batteryInfo);
    } else {
        result.batteryInfo = { isCharging: 0, capacity: 0 };
    }
    result.voice = result1.volume;
    result.version = result3.firmwareVersion;
    result.low_battery_reminder = result1.alarmCapacity;
    result.iccid = result2.iccid;
    result.head = device_info.head ? device_info.head : "";
    result.nickname = device_info.nickname ? device_info.nickname : "";
    //查询当月通话记录
    var call_month = FLI.plug.date.getFormatByDate(new Date(), "YYYY-MM-01 00:00:00");
    var curMonthCall = await FLI.plug.mysql.seleteSingle("device_call_records", "ID,call_total,called_time", [{ field: "device_id", value: device_info.device_id }, { field: "call_month", value: call_month }]);
    var left_time = 0;
    if (curMonthCall) {
        //如果存在当月充值记录，则直接相减返回
        left_time = curMonthCall.call_total - curMonthCall.called_time;
        //同时更新设备欠费信息，以防前面计算错误导致
        FLI.plug.mysql.insert("device", { device_id: device_info.device_id, status: result.iActive, device_tel: result.phoneNumber, identification: result.identification, debt_time: left_time < 0 ? -left_time : 0 });
    }
    else {
        FLI.plug.mysql.insert("device", { device_id: device_info.device_id, status: result.iActive, device_tel: result.phoneNumber, identification: result.identification });
        //不存在充值记录
        left_time = -device_info.debt_time ? -device_info.debt_time : 0;
    }
    result.phoneNumber = "+" + result.phoneNumber;

    result.left_time = left_time;
    result.active_expire = device_info.expire ? +new Date(device_info.expire) : null;
    res.end(JSON.stringify(result));
})

// 获取定时开关机信息
router.post('/get-timer-switch', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const token = req.headers.authorization
    const device_id = req.body.device_id

    // 参数错误
    if (!token || !device_id) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    const user = await check_token(token)
    if (!user) {
        result.code = error_code.ERROR_TOKEN_EXPIRED
        res.end(JSON.stringify(result))
        return
    }

    // 此设备未绑定在此用户名下
    const device_info = await mysql.get_device_info(device_id)
    if (!device_info || device_info.tel !== user.tel) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    myAliWulianwang.QueryDeviceLastPropertiesData({
        "Identifiers": ["autoOnOffTime"],
        "DeviceName": device_info.device_id
    }, function (_result) {
        var autoOnOffTime = JSON.parse(_result.autoOnOffTime);
        result.offHour = autoOnOffTime.OffHour;
        result.offMinute = autoOnOffTime.OffMinute;
        result.onHour = autoOnOffTime.OnHour;
        result.onMinute = autoOnOffTime.OnMinute;
        result.enable = autoOnOffTime.enable;
        result.repeat = autoOnOffTime.repeat;
        res.end(JSON.stringify(result));
    });
})

// 设置定时开关机
router.post('/set-timer-switch', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const token = req.headers.authorization
    const device_id = req.body.device_id
    const un_connect_aliyun = req.body.un_connect_aliyun;
    // 参数错误, voice必须是整数，且范围是1-8
    if (!token || req.body.offHour === "" || req.body.offMinute === "" || req.body.onHour === "" || req.body.onMinute === "" || req.body.enable === "" || req.body.repeat === "") {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }
    var autoOnOffTime = {
        offHour: req.body.offHour,
        offMinute: req.body.offMinute,
        onHour: req.body.onHour,
        onMinute: req.body.onMinute,
        enable: req.body.enable,
        repeat: req.body.repeat
    }
    // repeat: req.body.repeat

    const user = await check_token(token)
    if (!user) {
        result.code = error_code.ERROR_TOKEN_EXPIRED
        res.end(JSON.stringify(result))
        return
    }

    // 子账户不允许此操作
    if (user.parent) {
        result.code = error_code.ERROR_CHILD_OPERATION_NOT_ALLOWED
        res.end(JSON.stringify(result))
        return
    }

    // 此设备未绑定在此用户名下
    const device_info = await mysql.get_device_info(device_id)
    if (!device_info || device_info.tel !== user.tel) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    //设置阿里物联网设备绑定属性
    myAliWulianwang.clientPost("SetDeviceProperty", {
        "Items": "{\"autoOnOffTime\":" + JSON.stringify(autoOnOffTime) + "}",
        "DeviceName": device_id
    }, function (_result, ex) {
        //如果有忽略阿里云参数，则不需要返回错误
        if (ex && un_connect_aliyun != "1") {
            result.code = error_code.ERROR_DEVICE_OFFLINE;
        }
        //只有成功请求阿里云或则 设置忽略阿里云才进入(un_connect_aliyun参数为了考虑正式环境事务同步)
        if (!ex || un_connect_aliyun == "1") {
        }
        res.end(JSON.stringify(result))
    });
})

// 获取禁用模式
router.post('/get-disable-settings', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const token = req.headers.authorization
    const device_id = req.body.device_id

    // 参数错误
    if (!token || !device_id) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    const user = await check_token(token)
    if (!user) {
        result.code = error_code.ERROR_TOKEN_EXPIRED
        res.end(JSON.stringify(result))
        return
    }

    // 此设备未绑定在此用户名下
    const device_info = await mysql.get_device_info(device_id)
    if (!device_info || device_info.tel !== user.tel) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    myAliWulianwang.QueryDeviceLastPropertiesData({
        "Identifiers": ["funcDisable"],
        "DeviceName": device_info.device_id
    }, function (_result) {
        console.log(`funDisable: ${_result.funcDisable}`)

        if (!_result.funcDisable) {
            result.settings = []
            res.end(JSON.stringify(result))
            return
        }

        // startTimeHour
        // startTimeMinute
        // endTimeHour
        // endTimeMinute
        // enable
        // 重复（repeat）是固定7个字节长度的字符串，标识每周哪天开启开关机功能，如"0000000" 表示整个星期不开启，"1000000",表示仅周日开启，"0111110",表示周一到周五开启.
        result.settings = JSON.parse(_result.funcDisable)

        res.end(JSON.stringify(result));
    });
})

// 设置禁用模式
router.post('/set-disable-settings', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const token = req.headers.authorization
    const device_id = req.body.device_id
    const un_connect_aliyun = req.body.un_connect_aliyun;
    // 参数错误，这里没有检查所有的字段，因为过于繁琐
    if (!token || !Array.isArray(req.body.settings)) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    const user = await check_token(token)
    if (!user) {
        result.code = error_code.ERROR_TOKEN_EXPIRED
        res.end(JSON.stringify(result))
        return
    }

    // 子账户不允许此操作
    if (user.parent) {
        result.code = error_code.ERROR_CHILD_OPERATION_NOT_ALLOWED
        res.end(JSON.stringify(result))
        return
    }

    // 此设备未绑定在此用户名下
    const device_info = await mysql.get_device_info(device_id)
    if (!device_info || device_info.tel !== user.tel) {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    //设置阿里物联网设备绑定属性
    myAliWulianwang.clientPost("SetDeviceProperty", {
        "Items": "{\"funcDisable\":" + JSON.stringify(req.body.settings) + "}",
        "DeviceName": device_id
    }, function (_result, ex) {
        //如果有忽略阿里云参数，则不需要返回错误
        if (ex && un_connect_aliyun != "1") {
            result.code = error_code.ERROR_DEVICE_OFFLINE;
        }
        //只有成功请求阿里云或则 设置忽略阿里云才进入(un_connect_aliyun参数为了考虑正式环境事务同步)
        if (!ex || un_connect_aliyun == "1") {
        }
        res.end(JSON.stringify(result))
    });
})

//设置电量提醒
yfiRouter.action("set-alarm-capacity").operate("设置阿里云电量提醒").setFun(
    async function (iOpen, device_id) {
        var capacity = config.alarmCapacity.close;
        if (iOpen == 1) {
            capacity = config.alarmCapacity.open;
        }
        await myAliWulianwang.clientPost("SetDeviceProperty", {
            "Items": JSON.stringify({ "alarmCapacity": capacity }),
            "DeviceName": device_id
        });
        return { code: error_code.ERROR_SUCCESS };
    }
)

// 获取设备音量
yfiRouter.action("get-voice").operate("获取阿里云设备音量").setFun(
    async function (device_id, un_connect_aliyun, callback) {
        myAliWulianwang.QueryDeviceLastPropertiesData({
            "Identifiers": ["volume"],
            "DeviceName": device_id
        }, function (_result, ex) {
            callback({ code: error_code.ERROR_SUCCESS, voice: parseInt(_result.volume) });
        });
    }
)

// 设备音量调节
yfiRouter.action("change-voice").operate("设置阿里云设备音量").setFun(
    async function (voice, device_id, un_connect_aliyun, callback) {
        myAliWulianwang.clientPost("SetDeviceProperty", {
            "Items": "{\"volume\":" + voice + "}",
            "DeviceName": device_id
        }, function (_result, ex) {
            var result = { code: error_code.ERROR_SUCCESS }
            //如果有忽略阿里云参数，则不需要返回错误
            if (ex && un_connect_aliyun != "1") {
                result.code = error_code.ERROR_DEVICE_OFFLINE;
                result.errors = []
                result.errors.push({ error_code: error_code.ERROR_DEVICE_OFFLINE, error_msg: "设备不在线" })
            }
            //只有成功请求阿里云或则 设置忽略阿里云才进入(un_connect_aliyun参数为了考虑正式环境事务同步)
            if (!ex || un_connect_aliyun == "1") {
            }
            callback(result)
        });
        return { async: true }
    }
)

// 获取服务信息
router.post('/service', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }

    const service = await redisGetAsync('mysql:service')
    if (!service) {
        result.code = error_code.ERROR_UNKNOWN
        res.end(JSON.stringify(result))
        return
    }

    res.end(service)
})

// 获取版本信息
router.post('/version', async function (req, res, next) {
    const result = { code: error_code.ERROR_SUCCESS }
    const platform = req.body.platform //0-android, 1-ios

    // 参数错误
    if (platform != '0' && platform != '1') {
        result.code = error_code.ERROR_PARAMETER
        res.end(JSON.stringify(result))
        return
    }

    try {
        const results = await FLI.plug.mysql.selectBySQL(`SELECT *, UNIX_TIMESTAMP(create_time) as timestamp FROM app_version WHERE platform = ${platform} order by id desc limit 1`);
        if (!result) {
            res.end(JSON.stringify({ code: error_code.ERROR_SUCCESS, version: {} }))
            return
        }

        result.version_name = results[0].version_name;
        result.version_code = results[0].version_code;
        if (results[0].file_path) {
            result.url = `https://phone.yunchengjutech.com/appservice/api/v1/downloadApk?file_name=${results[0].file_path}`;
        }
        result.timestamp = results[0].timestamp;

        res.end(JSON.stringify(result));
    } catch (ex) {
        result.code = error_code.ERROR_UNKNOWN;
        res.end(JSON.stringify(result));
    }
})

// APK 下载
router.get('/downloadApk', async function (req, res, next) {
    const file_name = req.query.file_name;
    if (!file_name) {
        res.end(JSON.stringify({ code: error_code.ERROR_PARAMETER }));
        return;
    }
    const path = `./${config.apk_folder}/${file_name}`;
    if (!fs.existsSync(path)) {
        res.status(404);
        res.send('NOT FOUND');
        return;
    }
    res.download(path, "Fila.apk")
});

// 根据设备ID获取最近三天数据定位数据
yfiRouter.action("getLocations").operate("获取阿里云基站数据并对数据格式重新组织且输出").setFun(
    async function (device_id, gnns, callback) {
        try {
            var result = { code: error_code.ERROR_SUCCESS, gnns: [], lbs: [] };
            var gps_catch = {}
            for (var gnns_index = 0; gnns_index < gnns.length; gnns_index++) {
                var gps = JSON.parse(gnns[gnns_index].data);
                var time = gnns[gnns_index].create_time;
                //根据gps信息从高德获取位置信息

                var key = gps.longitude + "|" + gps.latitude;
                var address;
                if (!gps_catch[key]) {
                    address = await gaode.getAddress(gps.longitude, gps.latitude);
                    gps_catch[key] = address;
                }
                else {
                    address = gps_catch[key];
                }
                result.gnns.push({ date: FLI.plug.date.getFormatByDate(time, "YYYY-MM-DD"), latitude: gps.latitude, longitude: gps.longitude, time: +new Date(time), address: address.data.regeocode.formatted_address });
            }
            //从阿里云获取设备近三天lbs数据，并且通过阿里云接口转换地理数据
            //分五次取三天数据，一天60*24/10=144，144*3=432/5 ≈ 5 ；一次最多100条
            // var EndTime = +new Date() - 1000 * 3600 * 24 * 3;//三天前
            // var StartTime = +new Date() + 1000 * 3600 * 24 * 30;//现在+1小时（为了保险）
            // var iContinue = true;
            // var lbsInfoAry = [];
            // do {
            //     //每次时间范围：*10*60*1000
            //     var lbsInfo = await myAliWulianwang.QueryDeviceManyropertiesData({
            //         "Identifiers": ["lbsInfo"],
            //         "DeviceName": device_id,
            //         "EndTime": EndTime,
            //         "StartTime": StartTime,
            //         "PageSize": 100
            //     });
            //     lbsInfo = lbsInfo.lbsInfo;
            //     if (lbsInfo && lbsInfo.length > 0) {
            //         StartTime = lbsInfo[lbsInfo.length - 1].time - 1;
            //         lbsInfoAry = lbsInfoAry.concat(lbsInfo);
            //     }
            //     if (lbsInfo && lbsInfo.length && (StartTime <= EndTime || lbsInfo.length < 100)) {
            //         iContinue = false;
            //     }
            // } while (iContinue)

            //根据配置轨迹精度清理数据
            // if (lbsInfoAry.length > 0) {
            //     var startTime = lbsInfoAry[0].time;
            //     for (var index = 1; index < lbsInfoAry.length; index++) {
            //         var curTime = lbsInfoAry[index].time;
            //         if (startTime - curTime < 1000 * 60 * config.trailPrecision) {
            //             lbsInfoAry.splice(index--, 1);
            //         }
            //         else {
            //             startTime = curTime;
            //         }
            //     }
            // }
            //转换lbs数据
            // var lbs_catch = {};
            // for (var lbs_index = 0; lbs_index < lbsInfoAry.length; lbs_index++) {
            //     try {
            //         var value = JSON.parse(lbsInfoAry[0].value);
            //         var key = value.cell_id + "|" + value.lac_id + "|" + value.mcc;
            //         var address;
            //         if (!lbs_catch[key]) {
            //             address = await myAliWulianwang.getAddressByLbs(value.cell_id, value.lac_id, value.mcc);
            //             //gps坐标转换
            //             var gaodeResult = await gaode.convertCoordinate(address.data.location.longitude, address.data.location.latitude);
            //             if (gaodeResult.data && gaodeResult.data.status == 1) {
            //                 var locations = gaodeResult.data.locations.split(',');
            //                 if (locations && locations.length == 2) {
            //                     address.data.location.longitude = locations[0];
            //                     address.data.location.latitude = locations[1];
            //                 }
            //             }
            //             lbs_catch[key] = address;
            //         }
            //         else {
            //             address = lbs_catch[key];
            //         }
            //         result.lbs.push({ date: FLI.plug.date.getFormatByDate(lbsInfoAry[lbs_index].time, "YYYY-MM-DD"), latitude: address.data.location.latitude, longitude: address.data.location.longitude, time: lbsInfoAry[lbs_index].time });
            //     }
            //     catch (ex) {
            //         debugger
            //     }
            // }
            //最后将gnns和lbs数据拼接返回
            callback(result);
        }
        catch (ex) {
            console.error(ex)
            callback({ code: error_code.ERROR_PARAMETER });
        }
    }
)

// 获取商品种类
yfiRouter.action("getGoodsType").operate("获取商品种类").setFun(
    async function () {
        //更改单个属性的值
        var goodsType = await FLI.plug.mysql.select("goods", "good_name name,good_cost cost,good_type type");
        return { code: error_code.ERROR_SUCCESS, goodsType: goodsType };
    }
)

// 支付宝订单创建
yfiRouter.action("alipay-create").operate("调用支付宝创建支付订单").setFun(
    async function (device_id, goods_type) {
        return await payCreate(device_id, goods_type, alipay);
    }
)

// 微信订单创建
yfiRouter.action("tenpay-create").operate("调用微信创建支付订单").setFun(
    async function (device_id, goods_type) {
        return await payCreate(device_id, goods_type, tenpay);
    }
)

/**
 * 下单通用处理，支付宝/微信
 * @param {设备ID} device_id
 * @param {商品类别} goods_type
 * @param {支付对象} payObj
 * @returns
 */
async function payCreate(device_id, goods_type, payObj) {
    //更改单个属性的值
    var goods = await FLI.plug.mysql.seleteSingle("goods", "good_name name,good_cost cost,good_type type", [{ field: "good_type", value: goods_type }]);
    if (!goods) {
        return { code: error_code.ERROR_PARAMETER, error: "商品类型不存在" };
    }
    var describe = "device:{0},goodsType:{1}".format(device_id, goods_type);
    try {
        var pay_params = await payObj.createOrder({
            title: goods.type,
            describe: describe,
            cost: goods.cost
        });
        if (pay_params) {
            //插入订单数据
            await FLI.plug.mysql.insert("orders", { pay_type: payObj.payName, third_order_id: pay_params.prepay_id, goods_type: goods_type, status: 0, order_owner: device_id, ID: pay_params.order_id, create_time: getTimeStr(new Date()), callback_times: 0, cost: goods.cost }, { keyName: "ID" });
            return { code: error_code.ERROR_SUCCESS, pay_params: pay_params };
        }
    }
    catch (ex) {
        console.error({ flag: "tenpay-create", ex: ex });
    }
    if (config.isDev) {
        console.log({ device_id, goodsType });
    }
    return { code: error_code.ERROR_SUCCESS, pay_params: pay_params };
}

//订单锁
var orderLock = { device_id: false }

//微信支付回调地址
router.post('/tenpay-callback', async function (req, res, next) {
    var result = { code: "FAIL", message: "失败" }
    try {
        const payInfo = tenpay.deciphering(req.body.resource);
        if (config.isDev) {
            console.log({ flag: "tenpay-callback", payInfo: payInfo });
        }
        if (payInfo) {
            //处理订单，把根据创建订单的设备号与商品类型进行处理
            var order = await FLI.plug.mysql.seleteSingle("orders", "ID,order_owner,goods_type,status,callback_times", [{ field: "pay_type", value: "tenpay" }, { field: "ID", value: payInfo.out_trade_no }]);
            if (order) {
                //同一个设备同时处理一笔订单 && 订单未支付
                if (!orderLock[order.order_owner] && order.status == 0) {
                    orderLock[order.order_owner] = true;//加锁
                    await FLI.plug.mysql.insert("orders", { ID: order.ID, status: 1, modify_time: getTimeStr(new Date()), callback_times: ++order.callback_times }, { keyName: "ID" });
                    await renewalFee(order.order_owner, order.goods_type);
                    await FLI.plug.mysql.insert("orders", { ID: order.ID, status: 2, modify_time: getTimeStr(new Date()), callback_times: ++order.callback_times }, { keyName: "ID" });
                    orderLock[order.order_owner] = false;//解锁
                    result = { code: "SUCCESS", message: "成功" }
                }
                else {
                    console.error({ flag: "tenpay-callback", ex: "该死的腾讯果然会连续回调，还好我防了一手", payInfo: payInfo })
                }
            }
            else {
                console.error({ flag: "tenpay-callback", ex: "查不到订单...", payInfo: payInfo })
            }
        }
        else {
            console.error({ flag: "tenpay-callback", ex: "支付回调数据校验失败", payInfo: payInfo });
        }
        res.end(JSON.stringify(result))
    }
    catch (ex) {
        console.error({ flag: "tenpay-callback", ex: ex, req_body: req.body });
        res.end(JSON.stringify(result))
    }
})

//支付宝支付回调地址
router.post('/alipay-callback', async function (req, res, next) {
    var result = "fail";
    try {
        var payInfo = req.body;
        //处理订单，把根据创建订单的设备号与商品类型进行处理
        var order = await FLI.plug.mysql.seleteSingle("orders", "ID,order_owner,goods_type,status,callback_times", [{ field: "pay_type", value: "alipay" }, { field: "ID", value: payInfo.out_trade_no }]);
        if (order) {
            //同一个设备同时处理一笔订单 && 订单未支付
            if (!orderLock[order.order_owner] && order.status == 0) {
                orderLock[order.order_owner] = true;//加锁
                await FLI.plug.mysql.insert("orders", { ID: order.ID, status: 1, modify_time: getTimeStr(new Date()), callback_times: ++order.callback_times }, { keyName: "ID" });
                await renewalFee(order.order_owner, order.goods_type);
                await FLI.plug.mysql.insert("orders", { ID: order.ID, status: 2, modify_time: getTimeStr(new Date()), callback_times: ++order.callback_times }, { keyName: "ID" });
                orderLock[order.order_owner] = false;//解锁
                result = "success";
            }
            else {
                console.error({ flag: "alipay-callback", ex: "该死的阿里果然会连续回调，还好我防了一手", payInfo: payInfo })
            }
        }
        else {
            console.error({ flag: "alipay-callback", ex: "查不到订单...", payInfo: payInfo })
        }
        res.end(result)
    }
    catch (ex) {
        console.error({ flag: "alipay-callback", ex: ex, req_body: req.body });
        res.end(result)
    }
})

/**
 * 通用续费处理方法
月充值：
    未欠费：
        直接对当月加长通话时长
    已欠费：
        补缴所有欠费，如欠费时长补缴完成，还有多余则充入当月，激活SIM卡（调用联通接口），用户状态设置成激活
年充值：
    未欠费：
        直接在期限后开始续费（如期限在当月之前则从当月开始续），延长期限
    已欠费：
        补缴所有欠费，并且当月充值补缴欠费后剩余当月可充值额（50分钟以内），后续在期限后开始续费（如期限在当月之前则从当月开始续），缴完为止；如欠费金额补缴完成还有多余则激活SIM卡（调用联通接口），用户状态设置成激活，延长期限；
注：代码与逻辑有所不同，代码需要处理月充值是否当月情况，如当月充值即使欠费也无需扣除欠费再充值，因为欠费即当月欠费，直接充值后重新计算欠费即可，
仅当非当月才需扣除欠费再充值，因欠费属于非当月
 */
async function renewalFee(device_id, goodsType, iUnInsertChargeRecords, month) {
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
                                await renewalFee(device_id, "monthCost", true, call_month);
                            }
                        }
                        expireMoment = new FLI.plug.date.moment(curExpire.expire).add(1, "year").add(-suppleMonths, "month");
                        //年费到期，当月时间加50
                        for (var month = 0; month < 12 - suppleMonths; month++) {
                            call_month = new FLI.plug.date.moment(curExpire.expire).add(month, "month");
                            await renewalFee(device_id, "monthCost", true, call_month);
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
                                await renewalFee(device_id, "monthCost", true, call_month);
                            }
                        }
                        //期限需要减去补缴的月数量
                        expireMoment = new FLI.plug.date.moment(now).add(1, "year").add(-suppleMonths, "month");
                        //年费到期，当月时间加50
                        for (var month = 0; month < 12 - suppleMonths; month++) {
                            call_month = new FLI.plug.date.moment(now).add(month, "month");
                            await renewalFee(device_id, "monthCost", true, call_month);
                        }
                    }
                }
                else {
                    //第一次充年费，当月开始12个月加50
                    expireMoment = new FLI.plug.date.moment(now).add(1, "year");
                    for (var month = 0; month < 12; month++) {
                        call_month = new FLI.plug.date.moment(now).add(month, "month");
                        await renewalFee(device_id, "monthCost", true, call_month);
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

if (config.isDev) {
    //临时获取绑定码
    router.post('/get-device-bindcode', async function (req, res, next) {
        console.log(getTimeStr(new Date()))
        const result = { code: error_code.ERROR_SUCCESS }
        const token = req.headers.authorization;
        const deviceName = req.body.device_id;

        // 参数错误
        if (!token || !deviceName) {
            result.code = error_code.ERROR_PARAMETER
            res.end(JSON.stringify(result))
            return
        }

        const user = await check_token(token)
        if (!user) {
            result.code = error_code.ERROR_TOKEN_EXPIRED
            res.end(JSON.stringify(result))
            return
        }

        // 生成6位绑定码
        const random_six = utils.rand_num_str(6);

        // 绑定码5分钟有效
        const rds_device_key = "device-bind:" + random_six;
        rds.setex(rds_device_key, 5 * 60, JSON.stringify({ devicename: deviceName, code: random_six }));

        result.code = random_six;
        res.end(JSON.stringify(result))
    });

    // 临时激活设备接口
    yfiRouter.action("temp-active").operate("调用联通接口激活").setFun(
        async function (device, callback) {
            //激活卡：联通、用户表、设备表
            await my_liantong.invoke("wsEditTerminal", { data: { iccid: device.iccid, asynchronous: "0", changeType: "3", targetValue: "2" } });
            await FLI.plug.mysql.insert("device", { device_id: device.device_id, status: 1 });
            await FLI.plug.mysql.insert("user", { tel: device.tel, status: 2 });
            callback({ code: error_code.ERROR_SUCCESS });
        }
    )

    // 临时停机设备接口
    yfiRouter.action("stop-device").operate("调用联通接口停机").setFun(
        async function (device, callback) {
            //停用卡：联通、用户表、设备表
            await my_liantong.invoke("wsEditTerminal", { data: { iccid: device.iccid, asynchronous: "0", changeType: "3", targetValue: "3" } });
            await FLI.plug.mysql.insert("device", { device_id: device.device_id, status: 0 });
            await FLI.plug.mysql.insert("user", { tel: device.tel, status: 1 });
            return { code: error_code.ERROR_SUCCESS };
        }
    )

    //支付成功临时接口
    yfiRouter.action("temp-pay-success").operate("处理支付逻辑").setFun(
        async function (device_id, goodsType) {
            //更改单个属性的值
            renewalFee(device_id, goodsType);
            return { code: error_code.ERROR_SUCCESS };
        }
    )

    //临时年费/当月欠费通知接口
    yfiRouter.action("temp-notice").operate("调用消息通知").setFun(
        async function (device_id, notice_type) {
            var device_info = await FLI.plug.mysql.seleteSingle("device", "tel,iccid,expire", [{ field: "device_id", value: device_id }]);
            var user = await FLI.plug.mysql.seleteSingle("user", "jg_id", [{ field: "tel", value: device_info.tel }]);
            switch (notice_type) {
                case "expire":
                    jPush.pushNotification([user.jg_id], { type: "expire", device_id: device_id, data: { type: "expire" }, msg: "用户{0},名下设备:{1},到期时间为：{2},请尽快续年费".format(device_info.tel, device_id, getTimeStr(device_info.expire)) });
                    break;
                case "leftTime":
                    var month = FLI.plug.date.getFormatByDate(new Date(), "YYYY-MM-01 00:00:00");
                    var call_month = await FLI.plug.mysql.seleteSingle("device_call_records", "ID,called_time,call_total", [{ field: "device_id", value: device_id }, { field: "call_month", value: month }]);
                    var leftTime = 0;
                    if (call_month) {
                        leftTime = call_month.call_total - call_month.called_time;
                    }
                    jPush.pushNotification([user.jg_id], { type: "leftTime", device_id: device_id, leftTime: leftTime, data: { type: "leftTime" }, msg: "用户{0},名下设备:{1},剩余通话时长{2}分钟,请尽快续月费".format(device_info.tel, device_id, leftTime) });
                    break;
                default: break;
            }
            return { code: error_code.ERROR_SUCCESS };
        }
    )
}
module.exports = router;
