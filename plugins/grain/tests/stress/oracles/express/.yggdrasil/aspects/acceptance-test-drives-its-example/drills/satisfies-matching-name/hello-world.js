var app = require('../../examples/hello-world')
var request = require('supertest')
describe('hello-world', function () { it('responds', function (done) { request(app).get('/').expect(200, done) }) })
