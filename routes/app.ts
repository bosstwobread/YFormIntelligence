'use strict';

import * as express from 'express';
import { Router } from 'express';
import * as ERROR_CODE_IMPORT from '../config/error_code.json';
const ERROR_CODE: any = ERROR_CODE_IMPORT;
import { FLI } from '../common/FirstLogicIntelligence';
import utils = require('../utils/utils');

// Extend String prototype for format method
declare global {
    interface String {
        format(...args: any[]): string;
    }
}

const router: Router = express.Router();
const yfiRouter = FLI.createRouter(router, "app");

router.get('/test', async function (req, res, next) {
    res.end(JSON.stringify({ code: 123 }))
})
export = router;