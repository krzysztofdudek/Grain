'use strict';
exports.render = function (view, opts, cb) {
  var app = this.req.app;
  app.render(view, opts, cb)
}
