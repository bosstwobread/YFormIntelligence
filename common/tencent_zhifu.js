const CONFIG = require('../config/config')
const { v4: uuidv4 } = require('uuid');
const axios = require('axios')
var forge = require('node-forge');
const fs = require('fs');
const WxPay = require('wechatpay-node-v3')

/** 找了半天没找到能用了，只能自己撸了：） SHA256 with RSA 签名方式 再转Base64
 * 我太难了，各种对字符串，搞了一晚上才搞定，眼睛快瞎掉
 * post工具（参考代码）：https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay-1.shtml
 * 详细说明：https://pay.weixin.qq.com/wiki/doc/apiv3/wechatpay/wechatpay4_0.shtml
 */
function tenpay() {
    var payRootURL = "https://api.mch.weixin.qq.com";
    var prefixedAuth = "WECHATPAY2-SHA256-RSA2048 ";//head Authorization 用户身份固定前缀
    var APP_ID = CONFIG.tenpay.APP_ID;
    var MCH_ID = CONFIG.tenpay.MCH_ID;
    var privateKey = fs.readFileSync(CONFIG.tenpay.merchantCertificate);
    var publicKey = fs.readFileSync(CONFIG.tenpay.publicMerchantCertificate);
    var merchantCertificateSerial = CONFIG.tenpay.merchantCertificateSerial;//私钥序列号，获取命令 openssl x509 -in apiclient_key.pem -noout -serial
    var API_KEY = CONFIG.tenpay.API_KEY;

    this.payName = "tenpay";
    const pay = new WxPay({
        appid: APP_ID,
        mchid: MCH_ID,
        publicKey: publicKey, // 公钥
        privateKey: privateKey, // 秘钥
    });

    //创建预付单供APP使用
    this.createOrder = async function (goods) {
        const nonceStr = Math.random().toString(36).substr(2);
        const timestamp = parseInt(+new Date() / 1000);
        const pay_type = "app";//支付类型 app/native/等等
        const url = '/v3/pay/transactions/' + pay_type;

        var order_id = uuidv4().replace(/-/g, "");
        var data = {
            "appid": APP_ID,
            "mchid": MCH_ID,
            "description": goods.title,
            "out_trade_no": order_id,
            "notify_url": CONFIG.server + '/appservice/api/v1/tenpay-callback',
            "amount": {
                "total": goods.cost * 100,//单位（分）
                "currency": "CNY"
            }
        };

        //签名体
        var message = "POST" + "\n"
            + url + "\n"
            + timestamp + "\n"
            + nonceStr + "\n"
            + JSON.stringify(data) + "\n"

        //签名
        const signature = sign(message);

        //用户token
        const authorization = `{0} mchid="{1}",serial_no="{2}",nonce_str="{3}",timestamp="{4}",signature="{5}"`.format(prefixedAuth, MCH_ID, merchantCertificateSerial, nonceStr, timestamp, signature);

        if (CONFIG.isDev) {
            console.log(message);
            console.log(order_id);
        }
        return new Promise((resolve, reject) => {
            axios.post(
                payRootURL + url,
                data,
                { headers: { 'Authorization': authorization } }
            ).then(function (res) {
                if (CONFIG.isDev) {
                    if (pay_type == "native") {
                        console.log(res);
                        resolve(res.data)
                    }
                }
                if (res && res.data && res.data.prepay_id) {
                    //返回订单等更多信息 app_id 商户号partnerid 预支付交易单号prepay_id 签名authorization
                    var _return = {}
                    _return.prepay_id = res.data.prepay_id;
                    _return.app_id = APP_ID;
                    _return.partnerid = MCH_ID;
                    _return.order_id = order_id;
                    _return.timestamp = parseInt(+new Date() / 1000);
                    _return.noncestr = Math.random().toString(36).substr(2);

                    /** 客户端签名
                     * 
                        应用id
                        时间戳
                        随机字符串
                        预支付交易会话ID
                     */
                    //供后续APP调用接口使用的签名 https://pay.weixin.qq.com/wiki/doc/apiv3/apis/chapter3_2_4.shtml（APP调起支付API）
                    var message = APP_ID + "\n"
                        + _return.timestamp + "\n"
                        + _return.noncestr + "\n"
                        + res.data.prepay_id + "\n"
                    _return.signature = sign(message);

                    resolve(_return)
                }
                else { reject(res) }
            }).catch(function (error) {
                console.error(error)
                reject(error);
            });
        });
    }

    //解密
    this.deciphering = function (resource) {
        var result;
        try {
            result = pay.decipher_gcm(resource.ciphertext, resource.associated_data, resource.nonce, API_KEY);
        }
        catch (err) {
            consle.error({ flag: "decipheroing", resource: resource, err: err })
        }
        if (CONFIG.isDev) {
            console.log(result);
        }
        return result;
    }

    //签名，完全照抄 微信postman示例，就是这么粗暴
    function sign(data) {
        var privateKeyForge = forge.pki.privateKeyFromPem(privateKey);//私钥
        var sha256 = forge.md.sha256.create();//sha256加签方式
        sha256.update(forge.util.encodeUtf8(data));//加签数据
        const signature = forge.util.encode64(privateKeyForge.sign(sha256));//加签并转base64
        return signature;
    }
}

const my_tencent_zhifu = new tenpay();
module.exports = my_tencent_zhifu;
