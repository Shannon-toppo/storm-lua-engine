local integral=0
function onTick()
  local error=input.getNumber(1)-input.getNumber(2)
  integral=math.max(-10,math.min(10,integral+error/60))
  output.setNumber(1,error*0.75+integral*0.1)
  output.setBool(1,error>0)
end
