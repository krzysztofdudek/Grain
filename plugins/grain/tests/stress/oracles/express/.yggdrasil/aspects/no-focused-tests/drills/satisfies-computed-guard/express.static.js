'use strict'
var skipRelative = process.platform === 'win32'
;(skipRelative ? describe.skip : describe)('current dir', function () {
  it('should work', function () {})
})
