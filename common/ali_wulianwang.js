const container = require('rhea');
const crypto = require('crypto');
const Core = require('@alicloud/pop-core');
const config = require('../config/config')
const axios = require('axios');
const { runInThisContext } = require('vm');
/*阿里云物联网相关功能，如AMQP消息订阅，服务调用，属性设置等功能
AMQP必须先执行createAMQPConnection创建连接
客户端请求直接执行对应post或则get方法即可
相关资料：
https://help.aliyun.com/document_detail/89301.htm?spm=a2c4g.11186623.0.0.2509636ddb0BBx#title-97e-nbp-q2k
https://help.aliyun.com/document_detail/89226.html
https://api.aliyun.com/?spm=a2c4g.11186623.2.12.240a3d29r9yc1o#/?product=Iot&version=2018-01-20&api=SetDeviceProperty&params={%22RegionId%22:%22cn-shanghai%22,%22ProductKey%22:%22g9zyEx4Zh8a%22,%22DeviceName%22:%22PaxHupucKskTvTarLWsV%22,%22IotInstanceId%22:%22iot-060a086a%22,%22Items%22:%22{\%22volume\%22:3}%22}&tab=DEMO&lang=NODEJS
*/
function ali_wulianwang() {
    const YourClientId = config.ali_wulianwang.ClientId;
    const YourIotInstanceId = config.ali_wulianwang.IotInstanceId;
    const YourAccessKeyId = config.ali_wulianwang.AccessKeyId;
    const YourAccessKeySecret = config.ali_wulianwang.AccessKeySecret;
    const YourConsumerGroupId = config.ali_wulianwang.ConsumerGroupId;
    const client = new Core({
        accessKeyId: YourAccessKeyId,
        accessKeySecret: YourAccessKeySecret,
        endpoint: config.ali_wulianwang.endpoint,
        apiVersion: "2018-01-20"
    });

    this.createAMQPConnection = function () {
        const timestamp = +Date.now();
        //创建Connection。
        var connection = container.connect({
            //接入域名，请参见AMQP客户端接入说明文档。
            'host': config.ali_wulianwang.host,
            'port': 5671,
            'transport': 'tls',
            'reconnect': true,
            'idle_time_out': 60000,
            //userName组装方法，请参见AMQP客户端接入说明文档。
            'username': YourClientId + '|authMode=aksign,signMethod=hmacsha1,timestamp=' + timestamp + ',authId=' + YourAccessKeyId + ',iotInstanceId=' + YourIotInstanceId + ',consumerGroupId=' + YourConsumerGroupId + '|',
            //计算签名，password组装方法，请参见AMQP客户端接入说明文档。
            'password': hmacSha1(YourAccessKeySecret, 'authId=' + YourAccessKeyId + '&timestamp=' + timestamp),
        });
        //创建Receiver Link。
        var receiver = connection.open_receiver();
        return container;

        //计算password签名。
        function hmacSha1(key, context) {
            return Buffer.from(crypto.createHmac('sha1', key).update(context).digest())
                .toString('base64');
        }
    }

    //客户端post请求通用方法
    this.clientPost = async function (invokeName, params, callback) {
        return new Promise((resolve, reject) => {
            if (params) {
                params.RegionId = params.RegionId ? params.RegionId : config.ali_wulianwang.RegionId;
                params.IotInstanceId = params.IotInstanceId ? params.IotInstanceId : config.ali_wulianwang.IotInstanceId;
                params.ProductKey = params.ProductKey ? params.ProductKey : config.ali_wulianwang.ProductKey;
            }
            var requestOption = {
                method: 'POST'
            };
            client.request(invokeName, params, requestOption).then((result) => {
                _return(result);
            }, (ex) => {
                _return(null, ex);
            })
            function _return(callback_result, ex) {
                if (callback) {
                    callback(callback_result, ex);
                }
                else {
                    if (ex) {
                        console.error({ flag: "aliwulianwang-clientPost", invokeName, params, ex })
                        reject(callback_result);
                    }
                    else {
                        resolve(callback_result);
                    }
                }
            }
        })
    }

    //客户端查询多个属性记录，多条
    this.QueryDeviceManyropertiesData = async function (params, callback) {
        return await this.QueryDevicePropertiesData(false, params, callback);
    }

    //客户端查询多个属性最新一条数据
    this.QueryDeviceLastPropertiesData = async function (params, callback) {
        return await this.QueryDevicePropertiesData(true, params, callback);
    }

    //客户端查询多个属性数据
    this.QueryDevicePropertiesData = async function (iSingle, params, callback) {
        if (params) {
            params.RegionId = params.RegionId ? params.RegionId : config.ali_wulianwang.RegionId;
            params.IotInstanceId = params.IotInstanceId ? params.IotInstanceId : config.ali_wulianwang.IotInstanceId;
            params.ProductKey = params.ProductKey ? params.ProductKey : config.ali_wulianwang.ProductKey;
            //注：阿里云开始与结束时间是反的
            params.EndTime = params.EndTime ? params.EndTime : +new Date() - 1000 * 3600 * 24 * 365;//一年前
            params.StartTime = params.StartTime ? params.StartTime : +new Date() + 1000 * 3600 * 24 * 30//现在+一个月
            params.PageSize = params.PageSize ? params.PageSize : 10;
            params.Asc = 0;
        }
        //处理多个属性获取的情况
        if (params.Identifiers && params.Identifiers.length > 0) {
            for (var index = 0; index < params.Identifiers.length; index++) {
                var param_name = "Identifier." + (index + 1);
                params[param_name] = params.Identifiers[index];
            }
            delete params["Identifiers"];
        }
        var requestOption = {
            method: 'POST'
        };
        return new Promise((resolve, reject) => {
            client.request('QueryDevicePropertiesData', params, requestOption).then((result) => {
                if (result && result.PropertyDataInfos && result.PropertyDataInfos.PropertyDataInfo && result.PropertyDataInfos.PropertyDataInfo.length > 0) {
                    var callback_result = {};
                    var propertyDataInfos = result.PropertyDataInfos.PropertyDataInfo;
                    if (iSingle) {
                        for (var index = 0; index < propertyDataInfos.length; index++) {
                            var propertyDataInfo = propertyDataInfos[index];
                            var identifier = propertyDataInfo.Identifier;
                            var value = "";
                            var time;
                            if (propertyDataInfo.List.PropertyInfo.length > 0) {
                                value = propertyDataInfo.List.PropertyInfo[0].Value;
                                time = propertyDataInfo.List.PropertyInfo[0].Time;
                            }
                            callback_result[identifier] = value;
                            callback_result.time = time;
                        }
                        if (callback) {
                            callback(callback_result);
                        }
                        else {
                            resolve(callback_result);
                        }
                    }
                    else {
                        for (var index = 0; index < propertyDataInfos.length; index++) {
                            var propertyDataInfo = propertyDataInfos[index];
                            var identifier = propertyDataInfo.Identifier;
                            callback_result[identifier] = [];
                            for (var info_index = 0; info_index < propertyDataInfo.List.PropertyInfo.length; info_index++) {
                                callback_result[identifier].push({ value: propertyDataInfo.List.PropertyInfo[info_index].Value, time: propertyDataInfo.List.PropertyInfo[info_index].Time });
                            }
                        }
                        if (callback) {
                            callback(callback_result);
                        }
                        else {
                            resolve(callback_result);
                        }
                    }
                }
                else {
                    if (callback) {
                        callback({});
                    }
                    else {
                        resolve({});
                    }
                }
            }, (ex) => {
                if (ex) {
                    console.error({ invokeName: 'QueryDevicePropertiesData', params, ex })
                }
                if (callback) {
                    callback(null, ex);
                }
                else {
                    reject(ex);
                }
            })
        });
    }

    //根据lbs（基站数据）获取地理信息
    this.getAddressByLbs = async function (cell_id, lac_id, mcc) {
        return new Promise((resolve, reject) => {
            axios.post(
                "http://zlbs.market.alicloudapi.com/api/getlbs?cell_id=" + cell_id + "&lac=" + lac_id + "&mcc=" + mcc + "&mnc=1&type=0", {}, { headers: { Authorization: "APPCODE 211a7b8989f241faa70d4e0342097b51" } }
            ).then(function (res) {
                //转换Lbs数据为gps数据
                resolve(res)
            }).catch(async function (error) {
                reject(error);
            });
        });
    }

    this.test = async function () {
        return new Promise((resolve, reject) => {
            client.request('QueryDevicePropertiesData', {
                DeviceName: "CY2601PCBA090801",
                EndTime: 1634999437940,
                StartTime: 1637850637940,
                PageSize: 30000,
                RegionId: "cn-shanghai",
                IotInstanceId: "iot-060a086a",
                ProductKey: "g9zyEx4Zh8a",
                Asc: 0,
                "Identifier.1": "lbsInfo",
            }, { method: 'POST' }).then((res) => {
                resolve(res)
            }, (ex) => {
                reject(error);
            })
        })
    }
}

const my_ali_wulianwang = new ali_wulianwang();
module.exports = my_ali_wulianwang;
