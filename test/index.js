'use strict'
// **Github:** https://github.com/thunks/thunk-ratelimiter
//
// **License:** MIT

/* global describe, it, before, after, beforeEach */

/**
 * modified from https://github.com/tj/node-ratelimiter
 *
 * Authors:
 *   Francois-Guillaume Ribreau <npm@fgribreau.com>
 */

var assert = require('assert')
var thunk = require('thunks')()
var redis = require('thunk-redis')
var Limiter = require('..')

var db = redis.createClient()

describe('thunk-ratelimiter', function () {
  after(function (done) {
    db.clientEnd()
    done()
  })

  beforeEach(function (done) {
    db.keys('LIMIT:*')(function (err, keys) {
      if (err) throw err
      if (!keys.length) return
      return db.del.apply(db, keys)
    })(done)
  })

  describe('limiter', function () {
    it('get and remove', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        max: 5
      })
      limiter.connect(db)

      limiter.redis.exists(limiter.prefix + ':' + id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res, 0)
        return limiter.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.total, 5)
        return limiter.redis.exists(limiter.prefix + ':' + id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res, 1)
        return limiter.remove(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res, 1)
        return limiter.redis.exists(limiter.prefix + ':' + id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res, 0)
        return limiter.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.total, 5)
      })(done)
    })
  })

  describe('limit.total', function () {
    it('should represent the total limit per reset period', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        max: 5
      })
      limiter.connect(db).get(id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.total, 5)
      })(done)
    })
  })

  describe('limit.remaining', function () {
    it('should represent the number of requests remaining in the reset period', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        max: 5,
        duration: 100000
      })
      limiter.connect(db).get(id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 5)
        return this.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 4)
        return this.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.total, 5)
        assert.strictEqual(res.remaining, 3)
      })(done)
    })
  })

  describe('limit.duration', function () {
    it('should represent the duration per reset period', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        max: 5,
        duration: 60000
      })
      limiter.connect(db).get(id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.duration, 60000)
      })(done)
    })
  })

  describe('limit.reset', function () {
    it('should represent the next reset time', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        max: 5,
        duration: 60000
      })
      limiter.connect(db).get(id)(function (err, res) {
        assert.strictEqual(err, null)
        var left = res.reset - Date.now()
        assert(left <= 60000)
      })(done)
    })
  })

  describe('when arguments is invalid', function () {
    it('invalid "max" should response error', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        max: 5,
        duration: 60000
      })
      limiter.connect(db).get(id, -1)(function (err, res) {
        assert.strictEqual(err instanceof Error, true)
      })(done)
    })

    it('invalid "duration" should response error', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        max: 5,
        duration: 60000
      })
      limiter.connect(db).get(id, 10, 'invalid duration')(function (err, res) {
        assert.strictEqual(err instanceof Error, true)
      })(done)
    })
  })

  describe('when the limit is exceeded', function () {
    it('should retain .remaining at 0', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        max: 2
      })
      limiter.connect(db).get(id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 2)
        return this.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 1)
        return this.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 0)
        return this.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.total, 2)
        assert.strictEqual(res.remaining, 0)
      })(done)
    })
  })

  describe('when the duration is exceeded', function () {
    it('should reset', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        duration: 2000,
        max: 2
      })
      limiter.connect(db).get(id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 2)
        return this.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 1)
        return thunk.seq(thunk.delay(2100), this.get(id))
      })(function (err, res) {
        assert.strictEqual(err, null)
        var left = res[1].reset - Date.now()
        assert(left > 1000)
        assert(left <= 2000)
        assert.strictEqual(res[1].remaining, 2)
      })(done)
    })
  })

  describe('when the duration is exceeded', function () {
    it('should reset', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        duration: 2000,
        max: 2
      })
      limiter.connect(db).get(id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 2)
        return this.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 1)
        return thunk.seq(thunk.delay(2100), this.get(id))
      })(function (err, res) {
        assert.strictEqual(err, null)
        var left = res[1].reset - Date.now()
        assert(left > 1000)
        assert(left <= 2000)
        assert.strictEqual(res[1].remaining, 2)
      })(done)
    })
  })

  describe('when multiple successive calls are made', function () {
    it('the next calls should not create again the limiter in Redis', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        duration: 10000,
        max: 2
      })
      limiter.connect(db).get(id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 2)
      })

      limiter.get(id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 1)
      })

      limiter.get(id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 0)
      })(done)
    })
  })

  describe('when trying to decrease before setting value', function () {
    it('should create with ttl when trying to decrease', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        duration: 10000,
        max: 2
      })
      limiter.connect(db)
      db.setex('LIMIT:something:count', -1, 1)(function () {
        return limiter.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 2)
        return limiter.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 1)
        return limiter.get(id)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 0)
      })(done)
    })
  })

  describe('when give multiple limit policy', function () {
    it('should apply high level limit policy', function (done) {
      var policy = ['something1', 3, 2000, 2, 2000, 1, 1000]
      var limiter = new Limiter()
      limiter.connect(db)
      limiter.get(policy)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 3)
        return thunk.all([
          limiter.get(policy),
          limiter.get(policy),
          limiter.get(policy)
        ])
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res[0].remaining, 2)
        assert.strictEqual(res[1].remaining, 1)
        assert.strictEqual(res[2].remaining, 0)
        return thunk.seq([
          thunk.delay(2010),
          limiter.get(policy),
          limiter.get(policy),
          limiter.get(policy)
        ])
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res[1].total, 2)
        assert.strictEqual(res[1].duration, 2000)
        assert.strictEqual(res[1].remaining, 2)
        assert.strictEqual(res[2].remaining, 1)
        assert.strictEqual(res[3].remaining, 0)
        return thunk.seq([
          thunk.delay(2010),
          limiter.get(policy),
          limiter.get(policy),
          limiter.get(policy)
        ])
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res[1].total, 1)
        assert.strictEqual(res[1].duration, 1000)
        assert.strictEqual(res[1].remaining, 1)
        assert.strictEqual(res[2].remaining, 0)
        assert.strictEqual(res[3].remaining, 0)
        return thunk.seq([
          thunk.delay(1010),
          limiter.get(policy),
          limiter.get(policy)
        ])
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res[1].total, 1)
        assert.strictEqual(res[1].duration, 1000)
        assert.strictEqual(res[1].remaining, 1)
        assert.strictEqual(res[2].remaining, 0)
      })(done)
    })

    it('should restore low level limit policy after double duration', function (done) {
      var policy = ['something2', 3, 2000, 2, 2000, 1, 1000]
      var limiter = new Limiter()
      limiter.connect(db)
      limiter.get(policy)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 3)
        return thunk.all([
          limiter.get(policy),
          limiter.get(policy),
          limiter.get(policy)
        ])
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res[0].remaining, 2)
        assert.strictEqual(res[1].remaining, 1)
        assert.strictEqual(res[2].remaining, 0)
        return thunk.seq([
          thunk.delay(2010),
          limiter.get(policy),
          limiter.get(policy)
        ])
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res[1].total, 2)
        assert.strictEqual(res[1].duration, 2000)
        assert.strictEqual(res[1].remaining, 2)
        return thunk.seq([
          thunk.delay(4010),
          limiter.get(policy)
        ])
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res[1].total, 3)
        assert.strictEqual(res[1].duration, 2000)
        assert.strictEqual(res[1].remaining, 3)
      })(done)
    })
  })

  describe('when multiple concurrent clients modify the limit', function () {
    var id = 'something'
    var clientsCount = 10
    var max = 10000
    var limiters = []

    before(function () {
      for (var i = 0; i < clientsCount; ++i) {
        var limiter = new Limiter({
          duration: 10000,
          max: max
        })
        limiters.push(limiter.connect(redis.createClient()))
      }
    })

    it('should prevent race condition and properly set the expected value', function (done) {
      // Warm up and prepare the data.
      var i
      var tasks = []
      var result = []
      for (i = max; i >= 0; i--) {
        result.push(i)
        tasks.push(getLimit())
      }

      function getLimit () {
        return limiters[~~(Math.random() * 10)].get(id)(function (err, res) {
          assert.strictEqual(err, null)
          return +res.remaining
        })
      }

      thunk.all(tasks)(function (err, res) {
        assert.strictEqual(err, null)
        assert.deepEqual(result, res.sort(function (a, b) { return b - a }))
      })(done)
    })
  })

  describe('limit with vary parameters', function () {
    it('should work with vary parameters for different id', function (done) {
      var limiter = new Limiter({
        duration: 10000,
        max: 5
      })
      limiter.connect(db).get('something1')(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 5)
        return limiter.get('something2', 10, 10000)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 10)
        return limiter.get('something3', 20, 10000)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 20)
      })(done)
    })

    it('should keep limit with vary parameters for the same id', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        duration: 1000,
        max: 5
      })
      limiter.connect(db).get(id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 5)
        return limiter.get(id, 10, 10000)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 4)
        return limiter.get(id, 20, 10000)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 3)
      })(done)
    })

    it('should refresh limit with vary parameters for the same id when the duration is exceeded', function (done) {
      var id = 'something'
      var limiter = new Limiter({
        duration: 1000,
        max: 5
      })
      limiter.connect(db).get(id)(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 5)
        return limiter.get(id, 10, 10000)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 4)
        return thunk.seq(thunk.delay(1100), limiter.get(id, 10, 10000))
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res[1].remaining, 10)
        return limiter.get(id, 10, 10000)
      })(function (err, res) {
        assert.strictEqual(err, null)
        assert.strictEqual(res.remaining, 9)
      })(done)
    })
  })
})
