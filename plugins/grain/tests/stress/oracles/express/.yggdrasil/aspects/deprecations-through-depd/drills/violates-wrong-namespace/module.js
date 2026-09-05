'use strict';
var deprecate = require('depd')('app');
exports.old = function () { deprecate('gone'); }
