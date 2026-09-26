function onDraw()
  screen.setColor(12,18,24)
  screen.drawClear()
  for i=0,127 do
    screen.setColor(i*2,200,90,128)
    screen.drawRectF((i%16)*6,math.floor(i/16)*10,5,8)
  end
end
