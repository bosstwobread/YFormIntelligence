'use strict';

import * as express from 'express';
import { Router } from 'express';
import * as ERROR_CODE_IMPORT from '../config/error_code.json';
const ERROR_CODE: any = ERROR_CODE_IMPORT;
import { FLI } from '../common/FirstLogicIntelligence';
import * as myAliWulianwang from '../common/ali_wulianwang';
import * as gaode from '../common/gaode';
import * as multiparty from 'multiparty';
import * as xlsx from 'node-xlsx';
import * as excelExport from 'excel-export';
import * as common from '../common/common';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as CONFIG from '../config/config';
import * as svgCaptcha from 'svg-captcha';
import utils = require('../utils/utils');

// Extend String prototype for format method
declare global {
    interface String {
        format(...args: any[]): string;
    }
}

const router: Router = express.Router();
const yfiRouter = FLI.createRouter(router, "manager");

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}

/* 设备状态查询--更多物联网信息 */
router.post('/getDeviceWulianwangStatus', async function (req, res, next) {
    const device_ids = req.body;
    const waitTime = 50;
    if (device_ids && device_ids.length > 0) {
        for (let index = 0; index < device_ids.length; index++) {
            const item = device_ids[index];
            try {
                let autoOnOffTime = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["autoOnOffTime"],
                    "DeviceName": item.device_id
                });

                //{"OffMinute":0,"enable":0,"repeat":"","OnMinute":0,"OffHour":0,"OnHour":0}
                const autoOnOffTimeData = autoOnOffTime.autoOnOffTime ? JSON.parse(autoOnOffTime.autoOnOffTime) : false;
                if (autoOnOffTimeData) {
                    const iOpen = autoOnOffTimeData.enable == 0 ? "关闭" : "开启",
                        openTime = autoOnOffTimeData.OnHour + ":" + autoOnOffTimeData.OnMinute,
                        offTime = autoOnOffTimeData.OffHour + ":" + autoOnOffTimeData.OffMinute;
                    item.autoOnOffTime = "{0}|开机时间({1})|关机时间({2})".format(iOpen, openTime, offTime);
                }

                await wait(waitTime);
                const volume = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["volume"],
                    "DeviceName": item.device_id
                });

                item.volume = volume.volume;

                await wait(waitTime);
                const batteryInfo = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["batteryInfo"],
                    "DeviceName": item.device_id
                });

                item.battery = batteryInfo.batteryInfo ? JSON.parse(batteryInfo.batteryInfo).capacity : "";

                await wait(waitTime);
                const DeviceStatus = await myAliWulianwang.clientPost("GetDeviceStatus", {
                    "DeviceName": item.device_id
                });

                if (DeviceStatus && DeviceStatus.Data && DeviceStatus.Data.Status) {
                    item.online = DeviceStatus.Data.Status == "OFFLINE" ? 0 : 1;
                }

                await wait(waitTime);
                const multiLbsInfo_wlw = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["multiLbsInfo"],
                    "DeviceName": item.device_id
                });

                await wait(waitTime);
                const wifiScanInfo_wlw = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["wifiScanInfo"],
                    "DeviceName": item.device_id
                });

                await wait(waitTime);
                const device_info_wlw = await myAliWulianwang.QueryDeviceLastPropertiesData({
                    "Identifiers": ["imei", "imsi"],
                    "DeviceName": item.device_id
                });
                let multiLbsInfos: any;
                let wifiScanInfos: any;
                multiLbsInfos = JSON.parse(multiLbsInfo_wlw.multiLbsInfo ? multiLbsInfo_wlw.multiLbsInfo : "{}");
                wifiScanInfos = JSON.parse(wifiScanInfo_wlw.wifiScanInfo ? wifiScanInfo_wlw.wifiScanInfo : "{}");
                //找出接入基站
                let servingMultiLbsInfo: any;
                //找出周边基站，未接入的基站
                const unServingMultiLbsInfo: any[] = [];
                if (multiLbsInfos && multiLbsInfos.length > 0) {
                    for (let multiLbsInfo_index = 0; multiLbsInfo_index < multiLbsInfos.length; multiLbsInfo_index++) {
                        const _multiLbsInfo = multiLbsInfos[multiLbsInfo_index];
                        //0-113dbm 如果>0则= *2-113
                        const bts = _multiLbsInfo.mcc + "," + _multiLbsInfo.mnc + "," + _multiLbsInfo.lac_id + "," + _multiLbsInfo.cell_id + "," + (_multiLbsInfo.signal > 0 ? (_multiLbsInfo.signal * 2 - 113) : _multiLbsInfo.signal);
                        if (_multiLbsInfo.isServing == 1) {
                            servingMultiLbsInfo = bts;
                        }
                        else {
                            unServingMultiLbsInfo.push(bts);
                        }
                    }
                }
                const imei = device_info_wlw.imei,
                    imsi = device_info_wlw.imsi,
                    tel = item.tel,
                    lbs = servingMultiLbsInfo,
                    nearbts = unServingMultiLbsInfo.join("|");
                let macs = "";
                if (wifiScanInfos && wifiScanInfos.length > 0) {
                    wifiScanInfos.forEach((item: any, index: number, array: any[]) => {
                        macs += item.bssid + "|"
                    });
                }
                macs = macs.length > 0 ? macs.substring(0, macs.length - 1) : "";
                const gaode_result = await gaode.locationByWifi_Lbs(imei, imsi, tel, lbs, nearbts, macs);
                //将gnns数据插入数据库中
                if (gaode_result && gaode_result.data && gaode_result.data.result && gaode_result.data.result.type != "0") {
                    const location = gaode_result.data.result.location,
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
    const group = req.body.group;
    let records: any[] = [];
    let count: any = 0;
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
        const pageData = {
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
        const form = new multiparty.Form();
        form.parse(req, function (err, fields, files) {
            // 这里的files是接收到的文件列表，相当于FileList
            // 对于上传单个文件，取数组里面的第一项
            const result: any[] = [];
            if (files && files.file && files.file.length > 0 && files.file[0]) {
                const sheets = xlsx.parse(files.file[0].path);
                if (sheets && sheets.length && sheets.length > 0) {
                    const sheet = sheets[0].data;
                    sheet.forEach((element: any, index: number) => {
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
        let result: any = { code: 1 };
        const device_id = req.body.device_id;
        const iccid = req.body.iccid;
        //插入设备表
        const device = await FLI.plug.mysql.seleteSingle("device", "expire", [{ field: "device_id", value: device_id }]);
        if (!device) {
            //不存在则插入
            await FLI.plug.mysql.insert("device", { device_id: device_id, iccid: iccid, status: 0 });
        }
        //充值
        await common.renewalFee(device_id, "yearCost");
        //更新设备记录
        await FLI.plug.mysql.insert("device", { device_id: device_id });

        //获取设备数据
        const device_after = await FLI.plug.mysql.seleteSingle("device", "device_id,iccid,expire expire_after_charge", [{ field: "device_id", value: device_id }]);
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

    const result = await common.unbind(device_id, function (result: any) {
        res.end(JSON.stringify(result))
    });
});

router.post('/uploadApk', async function (req, res, next) {
    if (!(req as any).files && !(req as any).files.apk) {
        res.end(JSON.stringify({ code: ERROR_CODE.ERROR_PARAMETER }));
    }
    try {
        const name = uuidv4();
        await (req as any).files.apk.mv(`./${(CONFIG as any).apk_folder}/${name}`);

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
    const path = `./${(CONFIG as any).apk_folder}/${file_name}`;
    if (!fs.existsSync(path)) {
        res.status(404);
        res.send('NOT FOUND');
        return;
    }
    res.download(path, "Fila.apk")
});

//获取 APP 版本信息
router.get('/getAppVersion', async function (req, res, next) {
    const platform = req.query.platform as any;
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
    async function (activeCost: any, yearCost: any, monthCost: any) {
        //停用卡：联通、用户表、设备表
        await FLI.plug.mysql.insert("goods", { good_type: "monthCost", good_cost: monthCost });
        await FLI.plug.mysql.insert("goods", { good_type: "yearCost", good_cost: yearCost });
        if (activeCost) {
            await FLI.plug.mysql.insert("goods", { good_type: "activeCost", good_cost: activeCost });
        }
        return { code: ERROR_CODE.ERROR_SUCCESS };
    }
)

/** 生成登录验证码 */
router.get('/sign_captcha', async function (req, res, next) {
    const captcha = svgCaptcha.create({
        size: 4,// 验证码长度 4231
        ignoreChars: '0o1i', // 验证码字符中排除 0o1i
        noise: 0, // 干扰线条的数量
        height: 38,
        fontSize: 35,
        width: 90
    } as any);
    (req as any).session.captcha = captcha.text;
    res.type('svg');
    res.status(200).send(captcha.data);
});

yfiRouter.action("login").operate("验证验证码").setFun(
    async function (req: any, captcha: string) {
        if (req && req.session && req.session.captcha && req.session.captcha.toUpperCase() == captcha.toUpperCase()) {
            return { code: ERROR_CODE.ERROR_SUCCESS };
        }
        else {
            return { code: ERROR_CODE.ERROR_CHECK_VERIFY_CODE, errors: [{ error_code: ERROR_CODE.ERROR_CHECK_VERIFY_CODE, error_msg: "验证码错误" }] };
        }
    }
)

yfiRouter.action("login").operate("账号是否存在及锁定").setFun(
    async function (req: any, user_name: string, password: string) {
        const wrongCountRedisKey = user_name + ":pwdWrongCount";
        //计算账号锁定
        let wrongCount = await FLI.plug.cache.get(wrongCountRedisKey);
        if (wrongCount && wrongCount >= 5) {
            return { code: ERROR_CODE.ERROR_PARAMETER, errors: [{ error_code: ERROR_CODE.ERROR_PARAMETER, error_msg: "密码连续输入错误5次，账号已经被锁定，请30分钟后重试" }] };
        }
        const iExist = await FLI.plug.mysql.iExist("account", [{ field: "name", value: user_name }, { field: "password", value: password }]);
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
    async function (password: string) {
        //密码必须包括长度8位以上，包含字母、数字及特殊符号
        if (password) {
            const reg = /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[~!@#$%^&*()_+`\-={}:";'<>?,.\/]).{8,64}$/;
            const keyWords = password.match(reg);
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
    async function (user_name: string, old_password: string, password: string) {
        //原密码校验，只有新旧密码均填上时才需要校验
        if (old_password && password) {
            const encode_old_password = FLI.plug.encrypt.encode(old_password, (CONFIG as any).server_salt)
            const iUserExist = await FLI.plug.mysql.iExist("account", [{ field: "name", value: user_name }, { field: "password", value: encode_old_password }])
            if (iUserExist === false) {
                return false;
            }
        }
        return true;
    }
)

if ((CONFIG as any).isDev) {
    /** 加密替换所有电话相关字段到数据库-------仅且只能执行一次 */
    router.post('/updateEncryptPhoneNOInDatabase', async function (req, res, next) {
        //user tel
        const userList = await FLI.plug.mysql.select("user", "tel")
        for (let u_index = 0; u_index < userList.length; u_index++) {
            const item = userList[u_index];
            if (item.tel.length < 20 && item.tel.length > 10) {
                await FLI.plug.mysql.selectBySQL("update user set tel=? where tel=? and length(tel)<20", [FLI.plug.encrypt.encrypt(item.tel), item.tel])
            }
        }
        // device_event tel
        const device_eventList = await FLI.plug.mysql.selectBySQL("select tel from device_event where tel is not null and tel!='' group by tel")
        for (let u_index = 0; u_index < device_eventList.length; u_index++) {
            const item = device_eventList[u_index];
            if (item.tel.length < 20 && item.tel.length > 10) {
                await FLI.plug.mysql.selectBySQL("update device_event set tel=? where tel=? and length(tel)<20", [FLI.plug.encrypt.encrypt(item.tel), item.tel])
            }
        }
        //device tel
        let deviceList = await FLI.plug.mysql.selectBySQL("select tel from device where tel is not null and tel!='' group by tel")
        for (let u_index = 0; u_index < deviceList.length; u_index++) {
            const item = deviceList[u_index];
            if (item.tel.length < 20) {
                await FLI.plug.mysql.selectBySQL("update device set tel=? where tel=? and length(tel)<20", [FLI.plug.encrypt.encrypt(item.tel), item.tel])
            }
        }
        //device device_tel
        deviceList = await FLI.plug.mysql.selectBySQL("select device_tel from device where device_tel is not null and device_tel!='' group by device_tel")
        for (let u_index = 0; u_index < deviceList.length; u_index++) {
            const item = deviceList[u_index];
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
    const encryptStr = FLI.plug.encrypt.encrypt(req.query.string + "|" + random_six)
    res.end(encryptStr)
})

router.get('/decrypt', async function (req, res, next) {
    const decryptStr = FLI.plug.encrypt.decrypt(req.query.string)
    res.end(decryptStr)
})

export = router;
