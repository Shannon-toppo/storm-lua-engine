-- 港を周回する船団。操船はLua、ワールドと仮物理はhost.ts / world.tsが担当します。
local fleet_size = property.slider("船の数", 1, 8, 1, 3)
local cruise = property.slider("スロットル", 0.1, 1, 0.05, 0.7)
local route = {{-36,-24},{36,-24},{36,28},{-36,28}}

g_savedata = {fleet = {}, ticks = 0, stopped = false, cruise = cruise}

local function spawn_boat()
    local n = #g_savedata.fleet
    local id, ok = server.spawnVehicle(
        matrix.translation(-36, 0, -24 + n * 10),
        n % 2 == 0 and "rescue_boat" or "cargo_boat")
    if ok then
        table.insert(g_savedata.fleet, {id = id, target = 2})
        server.setVehicleTooltip(id, "巡回艇 " .. id)
    end
end

function onCreate(is_world_create)
    if is_world_create then
        for i = 1, fleet_size do spawn_boat() end
    end
    debug.log("船団を初期化。新規ワールド:", is_world_create)
    server.announce("Addon Lab", "/spawn /stop /go /ping を送れます")
end

function onTick(game_ticks)
    g_savedata.ticks = g_savedata.ticks + game_ticks
    for _, boat in ipairs(g_savedata.fleet) do
        local m, ok = server.getVehiclePos(boat.id)
        if ok then
            local x, _, z = matrix.position(m)
            local target = route[boat.target]
            local dx, dz = target[1] - x, target[2] - z
            if dx * dx + dz * dz < 64 then
                boat.target = boat.target % #route + 1
            end
            local yaw = math.atan(m[9], m[11])
            local desired = math.atan(dx, dz)
            local error = math.atan(math.sin(desired-yaw), math.cos(desired-yaw))
            local steering = math.max(-1, math.min(1, error * 1.8))
            -- このサンプルではキーパッド値を仮のエンジンと舵へ接続しています。
            server.setVehicleKeypad(boat.id, "Steering", steering)
            server.setVehicleKeypad(boat.id, "Throttle",
                g_savedata.stopped and 0 or g_savedata.cruise)
        end
    end
end

function onChatMessage(peer_id, sender, message)
    if message == "/spawn" then spawn_boat()
    elseif message == "/stop" then g_savedata.stopped = true
    elseif message == "/go" then g_savedata.stopped = false
    elseif message == "/ping" then server.httpGet(8080, "/status")
    else print(sender .. ": " .. message) end
end

function onVehicleSpawn(id)
    debug.log("onVehicleSpawn", id)
end

function httpReply(port, request, reply)
    -- HTTPは実通信せず、TSホストがローカルの仮レスポンスを返します。
    print("httpReply", port, request, reply)
end

function onDestroy()
    debug.log("アドオンを終了しました")
end
