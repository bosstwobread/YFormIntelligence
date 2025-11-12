'use strict';

import { FLI } from '../common/FirstLogicIntelligence';
import * as ERROR_CODE from '../config/error_code.json';
import * as CONFIG from '../config/config';
FLI.addPlug('business', '../common/plug_business');

// Using a flexible any-typed export to avoid premature strict typing.
const routes: any = {
    removeToken: {
        filters: [FLI.plug.commonFilter.authenticationManage, '{{#token}}'],
        routerOperate: [
            { key: '清除缓存', fun: FLI.plug.cache.remove, args: ['token:' + '{{#token}}'] }
        ],
        log: { main_type: '进出系统', child_type: '注销' }
    },
    login: {
        filters: ['#name', '#password'],
        routerOperate: [
            { key: '验证验证码', args: ['{{~req}}', '{{#captcha}}'] },
            { key: '获取密码加密', fun: FLI.plug.encrypt.encode, args: ['{{#password}}', CONFIG.server_salt] },
            { key: '账号是否存在及锁定', args: ['{{~req}}', '{{#name}}', '{{~lastResult}}'] },
            { key: '生成登录凭据', fun: FLI.plug.user.uuidv4 },
            { key: '缓存凭据', fun: FLI.plug.cache.set, args: ['token:' + '{{~lastResult}}', 3600, '{{#name}}'] },
            { key: '获取用户数据', fun: FLI.plug.mysql.seleteSingle, args: ['account', 'type', [{ field: 'name', value: '{{#name}}' }]] },
            { key: '返回登录凭据', fun: FLI.plug.http.responseEnd, args: [{ token: '{{~results.生成登录凭据}}', type: '{{~results.获取用户数据}}' }] }
        ],
        log: { main_type: '进出系统', child_type: '登录' }
    },
    getUserList: {
        filters: [FLI.plug.commonFilter.authenticationManage],
        routerOperate: [
            { key: '获取排序字段', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderProp}}', right: undefined, result: 'create_time', then: '{{#orderProp}}' }] },
            { key: '获取正逆排序关键字', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderAsc}}', right: true, result: 'ASC', then: 'DESC' }] },
            { key: '获取页码', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#current}}', right: undefined, result: undefined, then: '{{#current}}' }] },
            { key: '获取单页总数', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#size}}', right: undefined, result: undefined, then: '{{#size}}' }] },
            { key: '获取用户集合', fun: FLI.plug.mysql.getPageDataBySelect, args: ['account', "id,'' password,name,type,create_time", [{ field: 'name', value: '{{#name}}', compareSymbol: 'like' }, { field: 'type', value: '{{#type}}' }, { field: 'create_time', value: '{{#create_time}}', compareSymbol: 'between' }], '{{~results.获取排序字段}} {{~results.获取正逆排序关键字}}', '{{~results.获取页码}}', '{{~results.获取单页总数}}'] },
            { key: '返回用户集合', fun: FLI.plug.http.responseEnd, args: ['{{~lastResult}}'] }
        ],
        export: {
            fileName: '用户清单',
            fields: [
                { key: 'name', caption: '账号ID', field_type: 'string' },
                { key: 'type', caption: '属性', field_type: 'int', dic: [{ value: 0, text: '超级管理员' }, { value: 1, text: '管理员' }] },
                { key: 'create_time', caption: '添加时间', field_type: 'date' }
            ],
            beforeExport: { fun: FLI.plug.business.verifyExportPwd, args: ['{{#pwd}}'] },
            log: { main_type: '导出', child_type: '用户列表' }
        }
    },
    getLogList: {
        filters: [FLI.plug.commonFilter.authenticationManage],
        routerOperate: [
            { key: '获取排序字段', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderProp}}', right: undefined, result: 'create_time', then: '{{#orderProp}}' }] },
            { key: '获取正逆排序关键字', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderAsc}}', right: true, result: 'ASC', then: 'DESC' }] },
            { key: '获取页码', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#current}}', right: undefined, result: undefined, then: '{{#current}}' }] },
            { key: '获取单页总数', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#size}}', right: undefined, result: undefined, then: '{{#size}}' }] },
            { key: '获取日志集合', fun: FLI.plug.mysql.getPageDataBySelect, args: ['log', '*', [{ field: 'main_type', value: '{{#main_type}}', compareSymbol: '=' }, { field: 'child_type', value: '{{#child_type}}', compareSymbol: '=' }, { field: 'create_time', value: '{{#create_time}}', compareSymbol: 'between' }, { field: 'ip', value: '{{#ip}}', compareSymbol: 'like' }, { field: 'login_name', value: '{{#login_name}}', compareSymbol: 'like' }], '{{~results.获取排序字段}} {{~results.获取正逆排序关键字}}', '{{~results.获取页码}}', '{{~results.获取单页总数}}'] },
            { key: '返回日志集合', fun: FLI.plug.http.responseEnd, args: ['{{~lastResult}}'] }
        ]
    },
    addUser: {
        filters: [FLI.plug.commonFilter.authenticationManage, '{{#name}}'],
        routerOperate: [
            { key: 'get the current time', fun: FLI.plug.date.getFormat, args: ['YYYY-MM-DD HH:mm:ss'] },
            { key: 'verify the password', args: ['{{#password}}'], showError: { error_code: (ERROR_CODE as any).ERROR_BAD_PASSWORD, error_msg: '密码必须包括长度8位以上，包含字母、数字及特殊符号' } },
            { key: '修改密码新旧密码一致性校验', args: ['{{#name}}', '{{#old_password}}', '{{#password}}'], showError: { error_code: (ERROR_CODE as any).ERROR_BAD_PASSWORD, error_msg: '原密码不正确' } },
            { key: 'encrypt the password', fun: FLI.plug.encrypt.encode, args: ['{{#password}}', (CONFIG as any).server_salt] },
            { key: 'add the user into database', fun: FLI.plug.mysql.insert, args: ['account', { id: '{{#id}}', name: '{{#name}}', password: '{{~lastResult}}', type: '{{#type}}', create_time: '{{~results.获取当前时间}}' }, { keyName: 'id', isEmptyNotUpdateed: 'password', emptyValue: '79c515fffba583982cdba9c4033fb544' }] }
        ]
    },
    delUser: {
        filters: ['{{#id}}'],
        routerOperate: [
            { key: '删除用户', fun: FLI.plug.mysql.delete, args: ['account', { id: '{{#id}}' }] }
        ]
    },
    getMainUsers: {
        filters: [FLI.plug.commonFilter.authenticationManage],
        routerOperate: [
            { key: '获取排序字段', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderProp}}', right: undefined, result: 'create_time', then: '{{#orderProp}}' }] },
            { key: '获取正逆排序关键字', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderAsc}}', right: true, result: 'ASC', then: 'DESC' }] },
            { key: '获取页码', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#current}}', right: undefined, result: undefined, then: '{{#current}}' }] },
            { key: '获取单页总数', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#size}}', right: undefined, result: undefined, then: '{{#size}}' }] },
            { key: '获取主账号集合', fun: FLI.plug.mysql.getPageDataBySelect, args: [[{ table: 'user', alias: 'u' }, { table: 'device', alias: 'd', join: 'left join', equal: [{ left: 'd.tel', right: 'u.tel' }] }], 'u.tel,u.status,d.device_id,u.create_time', [{ field: 'u.tel', value: '{{#tel}}', compareSymbol: 'like' }, { field: 'd.device_id', value: '{{#device_id}}', compareSymbol: 'like' }, { field: 'u.status', value: '{{#status}}' }, { field: 'u.create_time', value: '{{#create_time}}', compareSymbol: 'between' }], '{{~results.获取排序字段}} {{~results.获取正逆排序关键字}},u.tel', '{{~results.获取页码}}', '{{~results.获取单页总数}}'] },
            { key: '手机号脱敏处理', fun: FLI.plug.business.formatListPhoneNODesensitization, args: ['{{~results.lastResult}}', 'tel'] },
            { key: '返回主账号集合', fun: FLI.plug.http.responseEnd, args: ['{{~lastResult}}'] }
        ],
        export: {
            fileName: '主账号清单',
            fields: [
                { key: 'tel', caption: '主账号', field_type: 'string' },
                { key: 'status', caption: '绑定情况', field_type: 'int', dic: [{ value: 0, text: '未绑定' }, { value: 1, text: '已绑定未激活' }, { value: 2, text: '已绑定已激活' }] },
                { key: 'device_id', caption: '绑定设备', field_type: 'string' },
                { key: 'create_time', caption: '注册时间', field_type: 'date' }
            ],
            beforeExport: { fun: FLI.plug.business.verifyExportPwd, args: ['{{#pwd}}'] },
            log: { main_type: '导出', child_type: '主账号' }
        }
    },
    getChildrenUsers: {
        filters: [FLI.plug.commonFilter.authenticationManage],
        routerOperate: [
            { key: '获取排序字段', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderProp}}', right: undefined, result: 'create_time', then: '{{#orderProp}}' }] },
            { key: '获取正逆排序关键字', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderAsc}}', right: true, result: 'ASC', then: 'DESC' }] },
            { key: '获取页码', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#current}}', right: undefined, result: undefined, then: '{{#current}}' }] },
            { key: '获取单页总数', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#size}}', right: undefined, result: undefined, then: '{{#size}}' }] },
            { key: '获取子账号集合', fun: FLI.plug.mysql.getPageDataBySelect, args: ['user', 'tel,parent,create_time', [{ field: 'tel', value: '{{#tel}}', compareSymbol: 'like' }, { field: 'parent', value: '{{#parent}}', compareSymbol: 'like' }, { field: 'parent', value: '', compareSymbol: '!=' }, { field: 'create_time', value: '{{#create_time}}', compareSymbol: 'between' }], '{{~results.获取排序字段}} {{~results.获取正逆排序关键字}}', '{{~results.获取页码}}', '{{~results.获取单页总数}}'] },
            { key: '手机号脱敏处理', fun: FLI.plug.business.formatListPhoneNODesensitization, args: ['{{~results.lastResult}}', ['tel', 'parent']] },
            { key: '返回子账号集合', fun: FLI.plug.http.responseEnd, args: ['{{~lastResult}}'] }
        ],
        export: {
            fileName: '子账号清单',
            fields: [
                { key: 'tel', caption: '子账号', field_type: 'string' },
                { key: 'parent', caption: '归属主账号', field_type: 'string' },
                { key: 'create_time', caption: '添加时间', field_type: 'date' }
            ],
            beforeExport: { fun: FLI.plug.business.verifyExportPwd, args: ['{{#pwd}}'] },
            log: { main_type: '导出', child_type: '子账号' }
        }
    },
    getSIMCards: {
        filters: [FLI.plug.commonFilter.authenticationManage],
        routerOperate: [
            { key: '获取排序字段', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderProp}}', right: undefined, result: 'd.bind_time', then: '{{#orderProp}}' }] },
            { key: '获取正逆排序关键字', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderAsc}}', right: true, result: 'ASC', then: 'DESC' }] },
            { key: '获取页码', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#current}}', right: undefined, result: undefined, then: '{{#current}}' }] },
            { key: '获取单页总数', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#size}}', right: undefined, result: undefined, then: '{{#size}}' }] },
            { key: '获取当月', fun: FLI.plug.date.getFormat, args: ['YYYY-MM-01 00:00:00'] },
            { key: '获取SIM卡集合', fun: FLI.plug.mysql.getPageDataBySelect, args: [[{ table: 'device', alias: 'd' }, { table: 'device_call_records', alias: 'dcr', join: 'left join', equal: [{ left: 'd.device_id', right: 'dcr.device_id' }, { left: '"{{~results.获取当月}}"', right: 'dcr.call_month' }] }], 'd.device_id,d.iccid,d.device_tel,dcr.call_total-dcr.called_time last_time,d.expire,d.status', [{ field: 'd.device_id', value: '{{#device_id}}', compareSymbol: 'like' }, { field: 'd.iccid', value: '{{#iccid}}', compareSymbol: 'like' }, { field: 'd.expire', value: '{{#expire}}', compareSymbol: 'between' }, { field: 'd.device_tel', value: '{{#device_tel}}', compareSymbol: 'like' }, { field: 'd.status', value: '{{#status}}' }], '{{~results.获取排序字段}} {{~results.获取正逆排序关键字}},d.device_id', '{{~results.获取页码}}', '{{~results.获取单页总数}}'] },
            { key: '手机号脱敏处理', fun: FLI.plug.business.formatListPhoneNODesensitization, args: ['{{~results.lastResult}}', 'device_tel'] },
            { key: '返回SIM卡集合', fun: FLI.plug.http.responseEnd, args: ['{{~lastResult}}'] }
        ],
        export: {
            fileName: 'SIM卡清单',
            fields: [
                { key: 'device_id', caption: '设备标识', field_type: 'string' },
                { key: 'iccid', caption: 'SIM卡ICCID', field_type: 'string' },
                { key: 'device_tel', caption: '11位手机号', field_type: 'string' },
                { key: 'status', caption: 'SIM卡状态', field_type: 'int', dic: [{ value: 0, text: '未激活' }, { value: 1, text: '已激活' }] },
                { key: 'last_time', caption: '当月剩余通话时长', field_type: 'string' },
                { key: 'expire', caption: 'SIM卡有效期', field_type: 'date' }
            ],
            beforeExport: { fun: FLI.plug.business.verifyExportPwd, args: ['{{#pwd}}'] },
            log: { main_type: '导出', child_type: 'SIM卡' }
        }
    },
    getSIMCharge: {
        filters: [FLI.plug.commonFilter.authenticationManage],
        routerOperate: [
            { key: '获取排序字段', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderProp}}', right: undefined, result: 'o.create_time', then: '{{#orderProp}}' }] },
            { key: '获取正逆排序关键字', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderAsc}}', right: true, result: 'ASC', then: 'DESC' }] },
            { key: '获取页码', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#current}}', right: undefined, result: undefined, then: '{{#current}}' }] },
            { key: '获取单页总数', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#size}}', right: undefined, result: undefined, then: '{{#size}}' }] },
            { key: '获取充值记录', fun: FLI.plug.mysql.getPageDataBySelect, args: [[{ table: 'orders', alias: 'o' }, { table: 'device', alias: 'd', join: 'join', equal: [{ left: 'o.order_owner', right: 'd.device_id' }] }], 'd.tel,d.device_id,d.device_tel,d.iccid,o.goods_type,o.pay_type,o.status,o.create_time', [{ field: 'd.tel', value: '{{#tel}}', compareSymbol: 'like' }, { field: 'd.device_id', value: '{{#device_id}}', compareSymbol: 'like' }, { field: 'd.device_tel', value: '{{#device_tel}}', compareSymbol: 'like' }, { field: 'd.iccid', value: '{{#iccid}}', compareSymbol: 'like' }, { field: 'o.goods_type', value: '{{#goods_type}}' }, { field: 'o.pay_type', value: '{{#pay_type}}' }, { field: 'o.status', value: '{{#status}}' }, { field: 'o.create_time', value: '{{#create_time}}', compareSymbol: 'between' }], '{{~results.获取排序字段}} {{~results.获取正逆排序关键字}},o.ID', '{{~results.获取页码}}', '{{~results.获取单页总数}}'] },
            { key: '手机号脱敏处理', fun: FLI.plug.business.formatListPhoneNODesensitization, args: ['{{~results.lastResult}}', 'tel'] },
            { key: '返回充值记录集合', fun: FLI.plug.http.responseEnd, args: ['{{~lastResult}}'] }
        ],
        export: {
            fileName: 'SIM卡充值清单',
            fields: [
                { key: 'tel', caption: 'APP账号', field_type: 'string' },
                { key: 'device_id', caption: 'SIM卡号', field_type: 'string' },
                { key: 'iccid', caption: 'SIM卡ICCID', field_type: 'string' },
                { key: 'goods_type', caption: '充值类型', field_type: 'int', dic: [{ value: 'yearCost', text: '年充' }, { value: 'monthCost', text: '月充' }] },
                { key: 'pay_type', caption: '支付类型', field_type: 'int', dic: [{ value: 'alipay', text: '支付宝' }, { value: 'tenpay', text: '微信' }] },
                { key: 'status', caption: '订单状态', field_type: 'int', dic: [{ value: 0, text: '未支付' }, { value: 1, text: '支付成功' }, { value: 2, text: '充值成功' }, { value: 3, text: '充值失败' }] },
                { key: 'create_time', caption: '充值时间', field_type: 'datetime' }
            ],
            beforeExport: { fun: FLI.plug.business.verifyExportPwd, args: ['{{#pwd}}'] },
            log: { main_type: '导出', child_type: 'SIM卡充值' }
        }
    },
    getDeviceStatus: {
        filters: [FLI.plug.commonFilter.authenticationManage],
        routerOperate: [
            { key: '获取排序字段', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderProp}}', right: undefined, result: 'd.bind_time', then: '{{#orderProp}}' }] },
            { key: '获取正逆排序关键字', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderAsc}}', right: true, result: 'ASC', then: 'DESC' }] },
            { key: '获取页码', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#current}}', right: undefined, result: undefined, then: '{{#current}}' }] },
            { key: '获取单页总数', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#size}}', right: undefined, result: undefined, then: '{{#size}}' }] },
            { key: '获取设备状态', fun: FLI.plug.mysql.getPageDataBySelect, args: [[{ table: 'device', alias: 'd' }, { table: 'user', alias: 'u', join: 'left join', equal: [{ left: 'd.tel', right: 'u.tel' }] }], 'd.device_id,d.tel,d.device_tel,case when d.bind_time is null then 0 else 1 end iBind,d.status,d.bind_time,d.create_time', [{ field: 'd.device_id', value: '{{#device_id}}', compareSymbol: 'like' }, { field: 'd.device_tel', value: '{{#device_tel}}' }, { field: 'd.bind_time', value: '{{#iBind}}', compareSymbol: 'judge null' }, { field: 'd.tel', value: '{{#tel}}', compareSymbol: 'like' }, { field: 'd.bind_time', value: '{{#bind_time}}', compareSymbol: 'between' }], '{{~results.获取排序字段}} {{~results.获取正逆排序关键字}},d.device_id', '{{~results.获取页码}}', '{{~results.获取单页总数}}'] },
            { key: '手机号脱敏处理', fun: FLI.plug.business.formatListPhoneNODesensitization, args: ['{{~results.lastResult}}', 'tel'] },
            { key: '返回设备状态集合', fun: FLI.plug.http.responseEnd, args: ['{{~lastResult}}'] }
        ],
        export: {
            fileName: '设备状态清单',
            fields: [
                { key: 'device_id', caption: '设备标识', field_type: 'string' },
                { key: 'iBind', caption: '绑定状态', field_type: 'int', dic: [{ value: 0, text: '未绑定' }, { value: 1, text: '已绑定' }] },
                { key: 'tel', caption: 'APP绑定ID', field_type: 'string' },
                { key: 'bind_time', caption: '绑定时间', field_type: 'date' }
            ],
            beforeExport: { fun: FLI.plug.business.verifyExportPwd, args: ['{{#pwd}}'] },
            log: { main_type: '导出', child_type: '设备状态' }
        }
    },
    getDeviceWulianwangStatus: null,
    getDeviceEvent: {
        filters: [FLI.plug.commonFilter.authenticationManage],
        routerOperate: [
            { key: '获取排序字段', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderProp}}', right: undefined, result: 'de.create_time', then: '{{#orderProp}}' }] },
            { key: '获取正逆排序关键字', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#orderAsc}}', right: true, result: 'ASC', then: 'DESC' }] },
            { key: '获取页码', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#current}}', right: undefined, result: undefined, then: '{{#current}}' }] },
            { key: '获取单页总数', fun: FLI.plug.expression.ask, args: [{ symbol: '===', left: '{{#size}}', right: undefined, result: undefined, then: '{{#size}}' }] },
            { key: '获取设备事件记录', fun: FLI.plug.mysql.getPageDataBySelect, args: [[{ table: 'device_event', alias: 'de' }, { table: 'device', alias: 'd', join: 'join', equal: [{ left: 'de.device_id', right: 'd.device_id' }] }], 'd.device_id,de.event_type,d.tel,de.create_time', [{ field: 'd.device_id', value: '{{#device_id}}', compareSymbol: 'like' }, { field: 'de.event_type', value: '{{#event_type}}' }, { field: 'd.tel', value: '{{#tel}}', compareSymbol: 'like' }, { field: 'de.create_time', value: '{{#create_time}}', compareSymbol: 'between' }], '{{~results.获取排序字段}} {{~results.获取正逆排序关键字}},d.device_id', '{{~results.获取页码}}', '{{~results.获取单页总数}}'] },
            { key: '手机号脱敏处理', fun: FLI.plug.business.formatListPhoneNODesensitization, args: ['{{~results.lastResult}}', 'tel'] },
            { key: '返回设备事件记录集合', fun: FLI.plug.http.responseEnd, args: ['{{~lastResult}}'] }
        ],
        export: {
            fileName: '设备状态清单',
            fields: [
                { key: 'device_id', caption: '设备标识', field_type: 'string' },
                { key: 'event_type', caption: '事件类型', field_type: 'int', dic: [{ value: 0, text: 'GPS请求' }, { value: 1, text: '主叫' }, { value: 2, text: '被叫' }] },
                { key: 'tel', caption: '请求APP绑定ID', field_type: 'string' },
                { key: 'create_time', caption: '发生时间', field_type: 'datetime' }
            ],
            beforeExport: { fun: FLI.plug.business.verifyExportPwd, args: ['{{#pwd}}'] },
            log: { main_type: '导出', child_type: '设备使用情况' }
        }
    },
    getAppConfig: {
        filters: [FLI.plug.commonFilter.authenticationManage],
        routerOperate: [
            { key: '获取用户数据', fun: FLI.plug.mysql.select, args: ['goods', '*'] },
            { key: '返回数据', fun: FLI.plug.http.responseEnd, args: ['{{~lastResult}}'] }
        ]
    },
    saveAppConfig: {
        filters: [FLI.plug.commonFilter.authenticationManage, '{{#yearCost}}', '{{#monthCost}}'],
        routerOperate: [
            { key: '保存', args: ['{{#activeCost}}', '{{#yearCost}}', '{{#monthCost}}'] }
        ]
    },
    getAppVersion: null,
    createAppVersion: null
};

export = routes;
