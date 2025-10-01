/*高德服务
*/

const axios = require('axios')
const CONFIG = require('../config/config')

function gaode() {
    //短信发送
    //示例:SendSms("13777365321", { code: "654546" })
    this.getAddress = function (longitude, latitude) {
        longitude = parseFloat(longitude).toFixed(6);
        latitude = parseFloat(latitude).toFixed(6);
        return new Promise((resolve, reject) => {
            axios.get(
                "https://restapi.amap.com/v3/geocode/regeo?output=json&location=" + longitude + "," + latitude + "&key=" + CONFIG.gaode.key + "&radius=1000&extensions=all"
            ).then(function (res) {
                resolve(res)
            }).catch(async function (error) {
                reject(error)
            });
        });
    }
    //坐标转换
    this.convertCoordinate = function (longitude, latitude) {
        longitude = parseFloat(longitude).toFixed(6);
        latitude = parseFloat(latitude).toFixed(6);
        return new Promise((resolve, reject) => {
            axios.get(
                "https://restapi.amap.com/v3/assistant/coordinate/convert?locations=" + longitude + "," + latitude + "&key=" + CONFIG.gaode.key + "&coordsys=gps"
            ).then(function (res) {
                resolve(res)
            }).catch(async function (error) {
                reject(error)
            });
        });
    }

    /**
     * 根据wifi和基站联合定位
     * @param {*} imei 
     * @param {移动用户识别码} imsi 
     * @param {设备号码} tel 
     * @param {接入基站信息} lbs mcc,mnc,lac,cellid,signal
     * @param {周边基站信息} nearbts 基站信息 1|基站信息 2|基站信息 3
     * @param {周边wifi信息} macs -- mac,signal,ssid|mac,signal,ssid
     * @returns 
     */
    this.locationByWifi_Lbs = function (imei, imsi, tel, lbs, nearbts, macs) {
        return new Promise((resolve, reject) => {
            axios.get(
                "http://apilocate.amap.com/position?key=" + CONFIG.gaode.locationKey + "&accesstype=0&imei=" + imei + "&cdma=0&imsi=" + imsi + "&network=GSM&tel=" + tel + "&bts=" + lbs + "&nearbts=" + nearbts + "&macs=" + macs + "&output=json"
            ).then(function (res) {
                resolve(res)
            }).catch(async function (error) {
                reject(error)
            });
        });
    }
}
const gaodeObj = new gaode();
// gaodeObj.locationByWifi_Lbs('869523052149797', '460093490797982', '8614603377248', '460,1,59605,12548935,-94', '', 'd8:c8:e9:d8:f9:10')
// gaodeObj.locationByWifi_Lbs('869523052149797', '460093490797982', '8614603377248', '460,1,59605,12548935,-94', '', 'd8:c8:e9:d8:f9:10|40:ee:dd:8a:10:28')
// gaodeObj.convertCoordinate(121.5746804, 31.1771791);
module.exports = gaodeObj;