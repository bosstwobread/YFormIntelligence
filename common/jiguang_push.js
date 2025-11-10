/** 极光推送
*   https://github.com/jpush/jpush-api-nodejs-client
*   修改过源码：位置 PushPayload.js function android 函数 最后增加
  android['intent'] = {
    //act=android.intent.action.VIEW;flg=0x10000000;cmp=com.wheatek.fila.android/com.wheatek.phone.MainActivity;end
    //act=android.intent.action.VIEW;cmp=com.wheatek.fila.android/com.wheatek.phone.MainActivity;end
    url: "intent:#Intent;action=android.intent.action.VIEW;end"
  }
*/
var { JPush } = require("jpush-async")
const CONFIG = require('../config/config')

function jg_push() {
    var client;
    try {
        client = JPush.buildClient(CONFIG.jg_push.AppKey, CONFIG.jg_push.Secret)
        client.push().setPlatform(JPush.ALL)
    }
    catch (ex) {
        console.error(ex);
    }
    /**
     * 通知，手机顶部等消息
     * @param {客户端ID，数组字符串} ids ['id1','id2']
     * @param {消息内容JSON} msg_json {type,body}
     */
    this.pushNotification = function (ids, msg_json) {
        if (CONFIG.isDev) {
            console.log(msg_json);
        }
        // JPush.android(msg_json.body, msg_json.title, 1),
        // JPush.ios(msg_json.body, 'sound', 1)
        try {
            client.push().setPlatform(JPush.ALL)
                .setAudience(JPush.registration_id(ids))
                .setNotification(msg_json.msg,
                    JPush.android(msg_json.msg, null, 1),
                    JPush.ios(msg_json.msg)
                ).setMessage(JSON.stringify(msg_json.data), null, msg_json.type)
                .send(function (err, message) {
                    if (err) {
                        console.error(JSON.stringify({ ids: ids, msg: err.message }));
                    }
                })
        }
        catch (ex) {
            debugger
        }
    }
    /**
     * 自定义，用于程序接收
     * @param {客户端ID，数组字符串} ids ['id1','id2']
     * @param {消息内容JSON} msg_json {type,body} -- 自定义消息可随意定义
     */
    this.pushDIYMessage = function (ids, msg_json) {
        try {
            client.push().setPlatform(JPush.ALL)
                .setAudience(JPush.registration_id(ids))
                .setMessage(JSON.stringify(msg_json.data), null, msg_json.type)
                .send(function (err, message) {
                    if (err) {
                        console.error(JSON.stringify({ ids: ids, msg: err.message }));
                    }
                    if (CONFIG.isDev) {
                        console.log({ flag: "pushDIYMessage", ids: ids, msg_json: JSON.stringify(msg_json), time: getTimeStr(new Date()) });
                    }
                })
        }
        catch (ex) {
            console.error(ex);
        }
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
        dateStr = year + "-" + month + "-" + day + " " + hour + ":" + minutes + ":" + seconds;
        return dateStr;
    }
}

module.exports = new jg_push();