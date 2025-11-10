const Core = require('@alicloud/pop-core');
const config = require('../config/config')
/*阿里短信功能
API文档：https://api.aliyun.com/?spm=a2c4g.11186623.2.12.240a3d29r9yc1o#/?product=Dysmsapi&version=2017-05-25&api=SendSms&params={%22RegionId%22:%22cn-hangzhou%22,%22PhoneNumbers%22:%2213777365321%22,%22SignName%22:%22%E4%BA%91%E4%B8%9E%E8%81%9A%E6%99%BA%E8%83%BD%E7%A7%91%E6%8A%80%22,%22TemplateCode%22:%22SMS_223320022%22,%22TemplateParam%22:%22{\%22code\%22:\%22123546\%22}%22}&tab=DEMO&lang=NODEJS
*/
function ali_duanxin() {
    const YourAccessKeyId = config.ali_duanxin.YourAccessKeyId;
    const YourAccessKeySecret = config.ali_duanxin.YourAccessKeySecret;
    const client = new Core({
        accessKeyId: YourAccessKeyId,
        accessKeySecret: YourAccessKeySecret,
        endpoint: config.ali_duanxin.endpoint,
        apiVersion: "2017-05-25"
    });

    //短信发送
    //示例:SendSms("13777365321", { code: "654546" })
    this.SendSms = function (PhoneNumbers, TemplateParam, callback) {
        var params = {
            "RegionId": config.ali_duanxin.RegionId,
            "PhoneNumbers": PhoneNumbers,
            "SignName": config.ali_duanxin.SignName,
            "TemplateCode": config.ali_duanxin.TemplateCode,
            "TemplateParam": JSON.stringify(TemplateParam)
        }

        var requestOption = {
            method: 'POST'
        };

        client.request('SendSms', params, requestOption).then((result) => {
            if (callback) callback(result);
        }, (ex) => {
            console.log(ex);
        })
    }
}

module.exports = ali_duanxin;