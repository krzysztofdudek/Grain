'use strict';
function logerror (err) {
  if (this.get('env') !== 'test') console.error(err);
}
module.exports = logerror
