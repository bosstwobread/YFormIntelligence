/** 联通相关接口实现
 * 
 */
const axios = require('axios')
const { v4: uuidv4 } = require('uuid');
const sm3 = require('sm3');
const CONFIG = require('../config/config')

function liantong() {
    this.openId;
    this.app_secret = CONFIG.liantong_IOT.app_secret;
    this.app_id = CONFIG.liantong_IOT.app_id;
    this.invoke = function (funName, body) {
        return new Promise((resolve, reject) => {
            var messageId = uuidv4();
            var date = +new Date();
            var timestamp = getTimeStr(date);
            var trans_id = getTrans_id(date);
            var token = getToken(this.app_id, timestamp, trans_id, this.app_secret);
            body.app_id = this.app_id;
            body.timestamp = timestamp;
            body.trans_id = trans_id;
            body.token = token;

            body.data.messageId = messageId;
            body.data.openId = CONFIG.liantong_IOT.openId;
            body.data.version = CONFIG.liantong_IOT.version;
            var url = "https://gwapi.10646.cn/api/" + funName + "/V1/1Main/vV1.1";
            getPost(url, body);
            function getPost(_url, _body) {
                axios.post(
                    _url,
                    _body
                ).then(function (res) {
                    resolve(res)
                }).catch(function (error) {
                    console.error({ flag: "liantong-invoke", url: _url, body: _body, error: error })
                    reject(error);
                });
            }
        });
    }
    function getTrans_id(date) {
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
        dateStr = year + month + day + hour + minutes + seconds + date.getMilliseconds() + rand_num_str(6);
        return dateStr;
    }
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
        dateStr = year + "-" + month + "-" + day + " " + hour + ":" + minutes + ":" + seconds + " " + date.getMilliseconds();
        return dateStr;
    }
    function rand_num_str(length) {
        let ret = ""
        for (let i = 0; i < length; i++) {
            ret += Math.floor(Math.random() * 10)
        }
        return ret
    }
    function getToken(app_id, timestamp, trans_id, app_secret) {
        var str = "app_id" + app_id + "timestamp" + timestamp + "trans_id" + trans_id + app_secret;
        var token = sm3(str);
        return token;
    }
}

const my_liantong = new liantong();
module.exports = my_liantong;