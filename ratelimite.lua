-- KEYS[1] target hash key
-- ARGV[n >= 3] current timestamp, max count, duration, max count, duration, ...

-- HASH: KEYS[1]
--   field:ct(count)
--   field:lt(limit)
--   field:dn(duration)
--   field:rt(reset)

local res = {}
local policyCount = (#ARGV - 1) / 2
local statusKey = '{' .. KEYS[1] .. '}:S'
local limit = redis.call('hmget', KEYS[1], 'ct', 'lt', 'dn', 'rt')

if limit[1] then

  res[1] = tonumber(limit[1]) - 1
  res[2] = tonumber(limit[2])
  res[3] = tonumber(limit[3]) or ARGV[3]
  res[4] = tonumber(limit[4])

  if policyCount > 1 and res[1] == 0 then
    redis.call('incr', statusKey)
    redis.call('pexpire', statusKey, res[3] * 2)
  end

  if res[1] >= 0 then
    redis.call('hincrby', KEYS[1], 'ct', -1)
  else
    res[1] = 0
  end

else

  local index = 1
  if policyCount > 1 then
    index = tonumber(redis.call('get', statusKey)) or 1
    if index > policyCount then
      index = policyCount
    end
  end

  res[1] = tonumber(ARGV[index * 2])
  res[2] = res[1]
  res[3] = tonumber(ARGV[index * 2 + 1])
  res[4] = tonumber(ARGV[1]) + res[3]

  redis.call('hmset', KEYS[1], 'ct', res[1], 'lt', res[1], 'dn', res[3], 'rt', res[4])
  redis.call('pexpire', KEYS[1], res[3])

  if policyCount > 1 then
    redis.call('set', statusKey, index)
    redis.call('pexpire', statusKey, res[3] * 2)
  end

end

return res
