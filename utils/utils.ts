'use strict';

import config = require('../config/config');

class Utils {
    constructor() {
    }

    // 生成数字字符串
    rand_num_str(length: number): string {
        let ret = "";
        for (let i = 0; i < length; i++) {
            ret += Math.floor(Math.random() * 10);
        }
        return ret;
    }

    // 生成随机字符串
    rand_str(length: number): string {
        let str = Math.random().toString(36).substr(2);
        if (str.length >= length) {
            return str.substr(0, length);
        }
        str += this.rand_str(length - str.length);
        return str;
    }

    // 判断变量是否是10进制整型
    isInit(value: any): boolean {
        if (typeof value === 'number' &&
            !isNaN(value) &&
            value === parseInt(value.toString(), 10))
            return true;
        return false;
    }

    // 整数格式化，前面补零
    fix_number(num: number, length: number): string {
        return ('' + num).length < length ? ((new Array(length + 1)).join('0') + num).slice(-length) : '' + num;
    }

    // 洗牌算法，打乱一个数组
    shuffle<T>(arr: T[]): T[] {
        for (let i = 1; i < arr.length; i++) {
            const random = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[random]] = [arr[random], arr[i]];
        }
        return arr;
    }

    // 秒时间戳转换为北京时间 2017-10-22 09:23:06
    timestamp2str(timestamp: number): string {
        const date = new Date(timestamp * 1000 + 8 * 60 * 60 * 1000);
        return date.getUTCFullYear() + "-" +
            this.fix_number(date.getUTCMonth() + 1, 2) + "-" +
            this.fix_number(date.getUTCDate(), 2) + " " +
            this.fix_number(date.getUTCHours(), 2) + ":" +
            this.fix_number(date.getUTCMinutes(), 2) + ":" +
            this.fix_number(date.getUTCSeconds(), 2);
    }

    // 北京时间字符串转换秒时间戳 '2017-10-22 09:23:06'
    str2timestamp(str: string): number {
        const date = new Date(str + " GMT+8");
        return date.getTime() / 1000;
    }

    // 初始化订单相关数据
    init_order(): void {
        for (let i = 0; i < 100; i++) {
            config.order_arr[i] = this.fix_number(i, 2);
        }
        this.shuffle(config.order_arr);
    }

    // 订单号生成算法，共12位
    // 1.第1位是机器标识，分布式多服务器情况下使用用，默认是"1"
    // 2.第2位是年份标识，2021年表示0，每年加1
    // 2.中间8位是秒时间戳后8位，精确到秒
    // 99999999/3600/24/365 = 3.17, 能满足最近3年多订单号不重复，到时候修改机器标示或者增加一个年份位
    // 3.最后2位是个累加计数器，处理相同秒数多个订单的情况，支持同一秒100个订单并发
    create_order_number(): string {
        // 年份标识
        let year = (new Date()).getUTCFullYear() - 2021;
        if (year < 0) {
            year = 0;
        }

        const timestamp = Date.now() + '';
        // return config.order_machine + year + timestamp.substr(2, 8) + config.order_arr[config.order_index++];

        let no = timestamp.substr(2, 8) + config.order_arr[config.order_index++];

        // 后10位以固定规则置换
        const arr = ['7', '3', '0', '9', '2', '5', '4', '1', '6', '8'];

        function trans(no: string, arr: string[]): string {
            let result = "";
            for (const c of no) {
                result += arr[parseInt(c) - 0];
            }
            return result;
        }

        no = trans(no, arr);

        // 顺序打乱
        no = no[0] + no[1] + no[9] + no[2] + no[7] + no[3] + no[6] + no[4] + no[8] + no[5];
        return config.order_machine + year + no;
    }
}

export = new Utils();
