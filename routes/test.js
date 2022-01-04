'use strict'
var express = require('express');
var router = express.Router();
const ERROR_CODE = require('../config/error_code.json')
const { YFI } = require('../common/YFormIntelligence')
YFI.createRouter(router, "test");

module.exports = router;