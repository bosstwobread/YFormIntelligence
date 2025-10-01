'use strict'
var express = require('express');
var router = express.Router();
const ERROR_CODE = require('../config/error_code.json')
const { FLI } = require('../common/FirstLogicIntelligence')
var yfiRouter = FLI.createRouter(router, "test");

module.exports = router;