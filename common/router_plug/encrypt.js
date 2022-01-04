/** HTTP路由单元
 * 提供HTTP协议相关逻辑
*/
const ERROR_CODE = require('../../config/error_code.json')
const crypto = require('crypto')

//后期考虑安全性问题还是要改成类，把关键方法隐藏起来
var encrypt = {
    /** 加密服务
     * 
     */
    encode: function (encrypt_str, salt) {
        salt = salt ? salt : "";
        const md5 = crypto.createHash('md5');
        const enc_password = md5.update(encrypt_str + salt).digest('hex');
        return enc_password;
    }
}
module.exports = encrypt;