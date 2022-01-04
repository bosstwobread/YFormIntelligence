const CONFIG = require('../config/config')
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Alipay = require('alipay-node-sdk');
// import AlipaySdk from 'alipay-sdk';

/** 
 * 支付宝相关功能
 * https://github.com/fym201/alipay-node-sdk
*/
function ali_zhifubao() {
    var alipay = new Alipay({
        appId: CONFIG.alipay.appId,
        notifyUrl: CONFIG.server + '/appservice/api/v1/alipay-callback',
        rsaPrivate: path.resolve(CONFIG.alipay.privateKey),
        rsaPublic: path.resolve(CONFIG.alipay.publicKey),
        sandbox: false,
        signType: 'RSA2'
    });

    this.payName = "alipay";
    this.createOrder = async function (goods) {
        try {
            var order_id = uuidv4().replace(/-/g, "");
            var params = {};
            params.aliOrderParams = await alipay.appPay({
                subject: goods.title,
                body: goods.describe,
                outTradeId: order_id,
                timeout: CONFIG.alipay.timout,
                amount: goods.cost,//单位（元）
                goodsType: '0'
            });
            params.order_id = order_id;
            if (CONFIG.isDev) {
                //测试签名
                this.queryOrder(order_id);
            }
            return params;
        }
        catch (ex) {
            console.error(ex);
        }
    }

    this.queryOrder = async function (order_id) {
        try {
            await alipay.query({
                outTradeId: order_id
            }).then(function (ret) {
                var ret_body = JSON.parse(ret.body);
                if (ret_body && ret_body.alipay_trade_query_response && ret_body.alipay_trade_query_response.sub_code == "isv.invalid-signature") {
                    console.error({ flag: "ali_createOrder", msg: "签名错误", data: ret_body });
                }
                //签名校验
                // var ok = alipay.signVerify(ret.json());
                // console.log(ok);
            }).catch(function (res) {
                console.error({ flag: "ali_createOrder", res: res });
            });
        }
        catch (ex) {
            console.error({ flag: "ali_createOrder", ex: ex });
        }
    }
}

const my_ali_zhifubao = new ali_zhifubao();
module.exports = my_ali_zhifubao;
