'use strict'
var express = require('express');
var router = express.Router();
const ERROR_CODE = require('../config/error_code.json')
const { FLI } = require('../common/FirstLogicIntelligence')
const myAliWulianwang = require('../common/ali_wulianwang')
var yfiRouter = FLI.createRouter(router, "manager");
const gaode = require('../common/gaode')
const multiparty = require('multiparty');
var xlsx = require('node-xlsx');
var excelExport = require('excel-export');
const common = require('../common/common');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const CONFIG = require('../config/config');
var svgCaptcha = require('svg-captcha');//引入验证码依赖
var utils = require('../utils/utils')

function wait(ms) {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
};

/* 设备状态查询--更多物联网信息 */
router.post('/getDeviceWulianwangStatus', async function (req, res, next) {
    var device_ids = req.body;
    var waitTime = 50;
    if (device_ids && device_ids.length > 0) {
        for (var index = 0; index < device_ids.length; index++) {
            var item = device_ids[index];
            try {
                var autoOnOffTime = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["autoOnOffTime"],
                    "DeviceName": item.device_id
                });

                //{"OffMinute":0,"enable":0,"repeat":"","OnMinute":0,"OffHour":0,"OnHour":0}
                var autoOnOffTime = autoOnOffTime.autoOnOffTime ? JSON.parse(autoOnOffTime.autoOnOffTime) : false;
                if (autoOnOffTime) {
                    var iOpen = autoOnOffTime.enable == 0 ? "关闭" : "开启",
                        openTime = autoOnOffTime.OnHour + ":" + autoOnOffTime.OnMinute,
                        offTime = autoOnOffTime.OffHour + ":" + autoOnOffTime.OffMinute;
                    item.autoOnOffTime = "{0}|开机时间({1})|关机时间({2})".format(iOpen, openTime, offTime);
                }

                await wait(waitTime);
                var volume = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["volume"],
                    "DeviceName": item.device_id
                });

                item.volume = volume.volume;

                await wait(waitTime);
                var batteryInfo = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["batteryInfo"],
                    "DeviceName": item.device_id
                });

                item.battery = batteryInfo.batteryInfo ? JSON.parse(batteryInfo.batteryInfo).capacity : "";

                await wait(waitTime);
                var DeviceStatus = await myAliWulianwang.clientPost("GetDeviceStatus", {
                    "DeviceName": item.device_id
                });


                if (DeviceStatus && DeviceStatus.Data && DeviceStatus.Data.Status) {
                    item.online = DeviceStatus.Data.Status == "OFFLINE" ? 0 : 1;
                }

                await wait(waitTime);
                var multiLbsInfo_wlw = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["multiLbsInfo"],
                    "DeviceName": item.device_id
                });

                await wait(waitTime);
                var wifiScanInfo_wlw = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["wifiScanInfo"],
                    "DeviceName": item.device_id
                });

                await wait(waitTime);
                var device_info_wlw = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["imei", "imsi"],
                    "DeviceName": item.device_id
                });
                var multiLbsInfos;
                var wifiScanInfos;
                multiLbsInfos = JSON.parse(multiLbsInfo_wlw.multiLbsInfo ? multiLbsInfo_wlw.multiLbsInfo : "{}");
                wifiScanInfos = JSON.parse(wifiScanInfo_wlw.wifiScanInfo ? wifiScanInfo_wlw.wifiScanInfo : "{}");
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
                    tel = item.tel,
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
                        longitude = location.split(',')[0],
                        latitude = location.split(',')[1];
                    item.location = longitude + "," + latitude + "；位置：" + desc;
                }
                else {
                    item.location = JSON.stringify({ error: "数据错误请查看", imei, imsi, lbs, nearbts, macs });
                }
                //一秒钟接口调用最多50次
                await wait(waitTime);
            }
            catch (ex) {
                console.error({ flag: "getDeviceWulianwangStatus", ex: ex });
                // device_ids[index].online = 0;
            }
        }
    }
    res.end(JSON.stringify(device_ids))
});

/**
 * 
 */
router.post('/getStatGroupByType', async function (req, res, next) {
    var group = req.body.group;
    var records = [];
    var count = 0;
    try {
        switch (group) {
            case "pay_type":
                records = await FLI.plug.mysql.selectBySQL(`
                    SELECT pay_type,SUM(cost) cost FROM orders WHERE status = 2 GROUP BY pay_type`);
                count = await FLI.plug.mysql.selectBySQL(`
                    SELECT COUNT(1) count FROM
                    (
                    SELECT count(1) FROM orders WHERE status = 2 GROUP BY pay_type
                    )a`);
            default: break;
        }
        var pageData = {
            code: 0,
            msg: "success",
            data: {
                records: records,
                total: count[0].count,
                size: 9999,
                current: 1
            }
        }
        res.end(JSON.stringify(pageData))
    }
    catch (ex) {
        console.error({ flag: "getStatGroupByPay", ex: ex });
    }
});

//获取批量充值上传的文件
router.post('/uploadBatchChargeFile', async function (req, res, next) {
    try {
        let form = new multiparty.Form();
        form.parse(req, function (err, fields, files) {
            // 这里的files是接收到的文件列表，相当于FileList
            // 对于上传单个文件，取数组里面的第一项
            var result = [];
            if (files && files.file && files.file.length > 0 && files.file[0]) {
                var sheets = xlsx.parse(files.file[0].path);
                if (sheets && sheets.length && sheets.length > 0) {
                    var sheet = sheets[0].data;
                    sheet.forEach((element, index) => {
                        if (index !== 0) {
                            result.push({ device_id: element[0], iccid: element[1] })
                        }
                    });
                }
            }
            res.end(JSON.stringify(result))
        });
    } catch (ex) { }
});

//批量充值
router.post('/patchCharge', async function (req, res, next) {
    try {
        var result = { code: 1 };
        var device_id = req.body.device_id;
        var iccid = req.body.iccid;
        //插入设备表
        var device = await FLI.plug.mysql.seleteSingle("device", "expire", [{ field: "device_id", value: device_id }]);
        if (!device) {
            //不存在则插入
            await FLI.plug.mysql.insert("device", { device_id: device_id, iccid: iccid, status: 0 });
        }
        //充值
        await common.renewalFee(device_id, "yearCost");
        //更新设备记录
        await FLI.plug.mysql.insert("device", { device_id: device_id });

        //获取设备数据
        var device_after = await FLI.plug.mysql.seleteSingle("device", "device_id,iccid,expire expire_after_charge", [{ field: "device_id", value: device_id }]);
        if (device_after) {
            device_after.expire = device.expire;
            result = device_after;
            result.code = 0;
        }
        res.end(JSON.stringify(result))
    } catch (ex) {
        console.error({ flag: "patchCharge", ex: ex, device_id: req.body.device_id })
    }
});

//解绑
router.post('/unbind-device', async function (req, res, next) {
    const device_id = req.body.device_id

    var result = await common.unbind(device_id, function (result) {
        res.end(JSON.stringify(result))
    });
});

router.post('/uploadApk', async function (req, res, next) {
    if (!req.files && !req.files.apk) {
        res.end(JSON.stringify({ code: ERROR_CODE.ERROR_PARAMETER }));
    }
    try {
        const name = uuidv4();
        await req.files.apk.mv(`./${CONFIG.apk_folder}/${name}`);

        res.end(JSON.stringify({ code: ERROR_CODE.ERROR_SUCCESS, name: name }));
    } catch (ex) {
        res.end(JSON.stringify({ code: ERROR_CODE.ERROR_UNKNOWN }));
    }
});

router.get('/downloadApk', async function (req, res, next) {
    const file_name = req.query.file_name;
    if (!file_name) {
        res.end(JSON.stringify({ code: ERROR_CODE.ERROR_PARAMETER }));
        return;
    }
    const path = `./${CONFIG.apk_folder}/${file_name}`;
    if (!fs.existsSync(path)) {
        res.status(404);
        res.send('NOT FOUND');
        return;
    }
    res.download(path, "Fila.apk")
});

//获取 APP 版本信息
router.get('/getAppVersion', async function (req, res, next) {
    const platform = req.query.platform;
    if (!platform || (platform != 0 && platform != 1)) {
        res.end(JSON.stringify({ code: ERROR_CODE.ERROR_PARAMETER }));
        return;
    }

    try {
        const result = await FLI.plug.mysql.selectBySQL(`SELECT *, UNIX_TIMESTAMP(create_time) as timestamp FROM app_version WHERE platform = ${platform} order by id desc limit 1`);
        if (!result) {
            res.end(JSON.stringify({ code: ERROR_CODE.ERROR_SUCCESS, version: {} }))
            return
        }

        const version = {
            version_name: result[0].version_name,
            version_code: result[0].version_code,
            url: result[0].file_path,
            timestamp: result[0].timestamp,
        }

        res.end(JSON.stringify({ code: ERROR_CODE.ERROR_SUCCESS, version: version }))
    } catch (ex) {
        res.end(JSON.stringify({ code: ERROR_CODE.ERROR_UNKNOWN }))
    }
});

router.post('/createAppVersion', async function (req, res, next) {
    const newVersion = req.body;

    if (!newVersion || (newVersion.platform != 0 && newVersion.platform != 1) || !newVersion.version_name || !newVersion.version_code) {
        res.end(JSON.stringify({ code: ERROR_CODE.ERROR_PARAMETER }));
        return;
    }

    try {
        await FLI.plug.mysql.insert("app_version", {
            platform: newVersion.platform,
            version_name: newVersion.version_name,
            version_code: newVersion.version_code,
            file_path: newVersion.file_path,
        });

        res.end(JSON.stringify({ code: ERROR_CODE.ERROR_SUCCESS }))
    } catch (ex) {
        res.end(JSON.stringify({ code: ERROR_CODE.ERROR_UNKNOWN }))
    }
});

//配置保存
yfiRouter.action("saveAppConfig").operate("保存").setFun(
    async function (activeCost, yearCost, monthCost) {
        //停用卡：联通、用户表、设备表
        await FLI.plug.mysql.insert("goods", { good_type: "monthCost", good_cost: monthCost });
        await FLI.plug.mysql.insert("goods", { good_type: "yearCost", good_cost: yearCost });
        if (activeCost) {
            await FLI.plug.mysql.insert.insert("goods", { good_type: "activeCost", good_cost: activeCost });
        }
        return { code: ERROR_CODE.ERROR_SUCCESS };
    }
)

/** 生成登录验证码 */
router.get('/sign_captcha', async function (req, res, next) {
    var captcha = svgCaptcha.create({
        size: 4,// 验证码长度
        ignoreChars: '0o1i', // 验证码字符中排除 0o1i
        noise: 0, // 干扰线条的数量
        height: 38,
        color: '#0000CD',//ff0ff0
        background: '#F1F3F4',
        fontSize: 35,
        width: 90,
        url: '/captcha.png'
    });
    req.session.captcha = captcha.text;
    res.type('svg');
    res.status(200).send(captcha.data);
});

yfiRouter.action("login").operate("验证验证码").setFun(
    async function (req, captcha) {
        if (req && req.session && req.session.captcha && req.session.captcha.toUpperCase() == captcha.toUpperCase()) {
            return { code: ERROR_CODE.ERROR_SUCCESS };
        }
        else {
            return { code: ERROR_CODE.ERROR_CHECK_VERIFY_CODE, errors: [{ error_code: ERROR_CODE.ERROR_CHECK_VERIFY_CODE, error_msg: "验证码错误" }] };
        }
    }
)

yfiRouter.action("login").operate("账号是否存在及锁定").setFun(
    async function (req, user_name, password) {
        const wrongCountRedisKey = user_name + ":pwdWrongCount";
        //计算账号锁定
        var wrongCount = await FLI.plug.cache.get(wrongCountRedisKey);
        if (wrongCount && wrongCount >= 5) {
            return { code: ERROR_CODE.ERROR_PARAMETER, errors: [{ error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "密码连续输入错误5次，账号已经被锁定，请30分钟后重试" }] };
        }
        var iExist = await FLI.plug.mysql.iExist("account", [{ field: "name", value: user_name }, { field: "password", value: password }]);
        if (iExist === false) {
            if (wrongCount) {
                wrongCount++;
                if (wrongCount >= 5) {
                    FLI.plug.cache.set(wrongCountRedisKey, 0.5 * 3600, wrongCount);
                    return { code: ERROR_CODE.ERROR_PARAMETER, errors: [{ error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "密码连续输入错误5次，账号已经被锁定，请30分钟后重试" }] };
                }
            }
            else {
                wrongCount = 1;
            }
            FLI.plug.cache.set(wrongCountRedisKey, 0.5 * 3600, wrongCount);
            return { code: ERROR_CODE.ERROR_PARAMETER, errors: [{ error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "密码连续输入错误" + wrongCount + "次，连续5次错误账号将被锁定" }] };
        }
        FLI.plug.cache.remove(wrongCountRedisKey);
        req.session.login_name = user_name;
        return { code: ERROR_CODE.ERROR_SUCCESS };
    }
)

//密码复杂度校验
yfiRouter.action("addUser").operate("密码复杂度校验").setFun(
    async function (password) {
        //密码必须包括长度8位以上，包含字母、数字及特殊符号
        if (password) {
            var reg = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[~!@#$%^&*()_+`\-={}:";'<>?,.\/]).{8,64}$/;
            var keyWords = password.match(reg);
            if (keyWords && keyWords.length > 0) {
                return true;
            }
            else {
                return false;
            }
        }
        return true;
    }
)

yfiRouter.action("addUser").operate("修改密码新旧密码一致性校验").setFun(
    async function (user_name, old_password, password) {
        //原密码校验，只有新旧密码均填上时才需要校验
        if (old_password && password) {
            var encode_old_password = FLI.plug.encrypt.encode(old_password, CONFIG.server_salt)
            var iUserExist = await FLI.plug.mysql.iExist("account", [{ field: "name", value: user_name }, { field: "password", value: encode_old_password }])
            if (iUserExist === false) {
                return false;
            }
        }
        return true;
    }
)

if (CONFIG.isDev) {
    /** 加密替换所有电话相关字段到数据库-------仅且只能执行一次 */
    router.post('/updateEncryptPhoneNOInDatabase', async function (req, res, next) {
        //user tel
        var userList = await FLI.plug.mysql.select("user", "tel")
        for (var u_index = 0; u_index < userList.length; u_index++) {
            var item = userList[u_index];
            if (item.tel.length < 20 && item.tel.length > 10) {
                await FLI.plug.mysql.selectBySQL("update user set tel=? where tel=? and length(tel)<20", [FLI.plug.encrypt.encrypt(item.tel), item.tel])
            }
        }
        // device_event tel
        var device_eventList = await FLI.plug.mysql.selectBySQL("select tel from device_event where tel is not null and tel!='' group by tel")
        for (var u_index = 0; u_index < device_eventList.length; u_index++) {
            var item = device_eventList[u_index];
            if (item.tel.length < 20 && item.tel.length > 10) {
                await FLI.plug.mysql.selectBySQL("update device_event set tel=? where tel=? and length(tel)<20", [FLI.plug.encrypt.encrypt(item.tel), item.tel])
            }
        }
        //device tel
        var deviceList = await FLI.plug.mysql.selectBySQL("select tel from device where tel is not null and tel!='' group by tel")
        for (var u_index = 0; u_index < deviceList.length; u_index++) {
            var item = deviceList[u_index];
            if (item.tel.length < 20) {
                await FLI.plug.mysql.selectBySQL("update device set tel=? where tel=? and length(tel)<20", [FLI.plug.encrypt.encrypt(item.tel), item.tel])
            }
        }
        //device device_tel
        var deviceList = await FLI.plug.mysql.selectBySQL("select device_tel from device where device_tel is not null and device_tel!='' group by device_tel")
        for (var u_index = 0; u_index < deviceList.length; u_index++) {
            var item = deviceList[u_index];
            if (item.device_tel.length < 20) {
                await FLI.plug.mysql.selectBySQL("update device set device_tel=? where device_tel=? and length(device_tel)<20", [FLI.plug.encrypt.encrypt(item.device_tel), item.device_tel])
            }
        }
        res.end(JSON.stringify({ code: 0 }))
    });
}

router.get('/encrypt', async function (req, res, next) {
    // HTTP协议中 + 号转译为 %2B
    // HTTPS协议中 + 号转译为 %20
    const random_six = utils.rand_num_str(6)
    FLI.plug.cache.set("export:" + random_six, 60, random_six)
    var encryptStr = FLI.plug.encrypt.encrypt(req.query.string + "|" + random_six)
    res.end(encryptStr)
})

router.get('/decrypt', async function (req, res, next) {
    var decryptStr = FLI.plug.encrypt.decrypt(req.query.string)
    res.end(decryptStr)
})

module.exports = router;