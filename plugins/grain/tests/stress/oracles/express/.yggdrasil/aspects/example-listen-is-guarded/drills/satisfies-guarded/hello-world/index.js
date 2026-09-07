'use strict';
var app = module.exports = require('../../')()

/* istanbul ignore next */
if (!module.parent) {
  app.listen(3000);
}
