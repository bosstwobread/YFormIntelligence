/**
 * YFormIntelligence -- 缩写YFI 中文：壹表单
 */
const routerFilter = require('./router_filter');
const routerOperate = require('./router_operate');
const error_code = require('../config/error_code.json');

var YFormIntelligence = {
    _routers: {},
    plug: {},
    createRouter: createRouter,
    addPlug: addPlug,
    actionPlug: [],
    actionFilter: routerFilter
}
initPlug();

function createRouter(_router, route_name) {
    var config = require('../routes_config/' + route_name);
    YFormIntelligence._routers[route_name] = {};
    for (var _action in config) {
        YFormIntelligence._routers[route_name][_action] = config[_action];
        if (config[_action]) {
            createAction.call(null, _action);
            function createAction(action) {
                _router.post('/' + action, async (req, res, next) => {
                    var filtersConfig = config[action].filters;
                    if (filtersConfig) {
                        routerFilter.execFilters(req, res, next, filtersConfig);
                    }
                    else next();
                }, async function (req, res, next) {
                    var result = { code: error_code.ERROR_SUCCESS }
                    var routerOperateConfig = config[action].routerOperate;
                    if (routerOperateConfig) {
                        var _result = await routerOperate.execOperate(req, res, next, routerOperateConfig, action);
                        if (_result) {
                            result = _result;
                            if (_result.async == true) {
                                return;
                            }
                        }
                    }
                    res.end(JSON.stringify(result))
                });
            }
        }
        if (YFormIntelligence.actionPlug && YFormIntelligence.actionPlug.length > 0) {
            YFormIntelligence.actionPlug.forEach(element => {
                //配置中是否存在该插件 关键配置信息 element.actionKeyName
                if (config[_action] && config[_action][element.actionKeyName]) {
                    createAction.call(null, _action);
                    function createAction(action) {
                        var actionName;
                        if (element.actionName) {
                            actionName = element.actionName.replace(/{{~actionName}}/g, action);
                        }
                        _router[element.actionType]('/' + actionName, async (req, res, next) => {
                            var filtersConfig = config[action].filters;
                            if (filtersConfig) {
                                routerFilter.execFilters(req, res, next, filtersConfig);
                            }
                            else next();
                        }, async function (req, res, next) {
                            var routerOperateConfig = config[action].routerOperate;
                            if (routerOperateConfig) {
                                var _result = await routerOperate.execOperate(req, res, next, routerOperateConfig, action);
                                //只支持当前 routerOperate 非异步的情况
                                element.exec(req, res, config[action], _result);
                            }
                        });
                    }
                }
            });
        }
    }
    return new router(route_name);
}

/** 初始化插件 
 * plugs = {name:"",path}
*/
function initPlug(plugs) {
    loadPlug(["commonFilter", "encrypt", "http", "mysql", "user", "condition", "cache", "date", "expression", "excel", "vm2"]);
    function loadPlug(plugs) {
        if (plugs && plugs.length && plugs.length > 0) {
            for (var index = 0; index < plugs.length; index++) {
                var plug = plugs[index];
                if (typeof plug === "string") {
                    //系统内置插件
                    YFormIntelligence.plug[plug] = require('../common/router_plug/' + plug)
                    if (YFormIntelligence.plug[plug].$newRouterFlag && typeof YFormIntelligence.plug[plug].$newRouterFlag === "object") {
                        YFormIntelligence.actionPlug.push(YFormIntelligence.plug[plug].$newRouterFlag);
                    }
                }
                else if (typeof plug === "object") {
                    //第三方插件
                }
            }
        }
    }
}

function addPlug(plugName, plugUrl) {
    YFormIntelligence.plug[plugName] = require(plugUrl)
}

//router类
function router(router_key) {
    this.routerKey = router_key;
    //获取operate
    this.action = function (action_key) {
        return new action(this.routerKey, action_key);
    }
}

//action类
function action(router_key, action_key) {
    this.routerKey = router_key;
    this.actionKey = action_key;
    this.operate = function (operate_key) {
        return new operate(this.routerKey, this.actionKey, operate_key);
    }
}

//operate类
function operate(router_key, action_key, operate_key) {
    this.routerKey = router_key;
    this.actionKey = action_key;
    this.operateKey = operate_key;
    //设置操作方法
    this.setFun = function (fun) {
        if (typeof fun === "function") {
            var routerOperates = YFormIntelligence._routers[this.routerKey][this.actionKey].routerOperate;
            if (routerOperates && routerOperates.length) {
                for (var index = 0; index < routerOperates.length; index++) {
                    if (routerOperates[index].key == this.operateKey) {
                        routerOperates[index].fun = fun;
                        break;
                    }
                }
            }
        }
    }
}

// module.exports = createServer
module.exports = { YFI: YFormIntelligence }