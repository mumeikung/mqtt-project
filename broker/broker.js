const net = require('net')

const server = net.createServer((socket) => {
  socket.on('data', (data) => {
    console.log('data', data.toString())
    socket.write('test kiki')
    socket.end('test back na')
  })
  socket.on('close', (error) => {
    console.log('close', error)
  })
  socket.on('connect', () => {
    console.log('connect')
  })
  socket.on('drain', () => {
    console.log('drain')
  })
  socket.on('end', () => {
    console.log('end')
  })
  socket.on('error', (error) => {
    console.error('error', error.name, error.message)
  })
  socket.on('lookup', (error, address, family, host) => {
    console.log('lookup', error.name, error.message, address, family, host)
  })
  socket.on('timeout', () => {
    console.log('timeout')
  })
})

server.listen(1883, () => {
  console.log('port 1883 (MQTT) listening')
})