-- ライフサイクルと保存を観察する最小例です。
g_savedata = {ticks = 0, messages = 0, vehicle = 0}

function onCreate(is_world_create)
    if is_world_create then
        local id, ok = server.spawnVehicle(matrix.translation(0,0,0), "rescue_boat")
        if ok then g_savedata.vehicle = id end
    end
    print("onCreate", is_world_create)
end

function onTick(game_ticks)
    g_savedata.ticks = g_savedata.ticks + game_ticks
    server.setVehicleKeypad(g_savedata.vehicle, "Throttle", 0.45)
    server.setVehicleKeypad(g_savedata.vehicle, "Steering", 0.5)
end

function onChatMessage(peer_id, sender, message)
    g_savedata.messages = g_savedata.messages + 1
    debug.log("受信", peer_id, sender, message)
    if message == "/ping" then server.httpGet(8080, "/status") end
end

function onVehicleLoad(id)
    print("onVehicleLoad", id)
end

function httpReply(port, path, body)
    print("仮HTTPレスポンス", body)
end

function onDestroy() print("onDestroy") end
