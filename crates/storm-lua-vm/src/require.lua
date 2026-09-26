-- The host compiler returns a Lua function; invoke it outside its C callback.
-- Mark before executing to match include-once recursion and failure semantics.
local compile = ...
local loaded = {}
return function(name)
    if loaded[name] then
        return
    end
    local chunk = compile(name)
    loaded[name] = true
    chunk()
end
