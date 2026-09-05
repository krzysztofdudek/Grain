'use strict';
var deprecate = require('depd')('express');
exports.old = function () { deprecate('Provide a url argument'); }
