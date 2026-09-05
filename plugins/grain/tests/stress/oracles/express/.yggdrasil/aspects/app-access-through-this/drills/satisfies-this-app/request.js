'use strict';
exports.protocol = function () {
  var trust = this.app.get('trust proxy fn');
  return trust ? 'https' : 'http'
}
