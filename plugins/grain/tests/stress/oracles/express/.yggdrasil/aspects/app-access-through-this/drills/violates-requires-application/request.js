'use strict';
var app = require('./application');
exports.protocol = function () { return app.get('x') }
