const net = require('net')
const UUID = require('uuidv4')

let socketList = {}
let topic = {}

const server = net.createServer((socket) => {
  const socketId = UUID()
  const address = socket.address()
  console.log('socket id:', socketId)
  console.log('address:', address.address, 'port:', address.port, 'family:', address.family)
  const myJNCF = new JNCF(socket, socketId)
  socketList[socketId] = myJNCF
  socket.on('data', (buffer) => {
    debugBuffer(buffer)
    try {
      myJNCF.decode(buffer)
    } catch (error) {
      console.error('decode', error.message)
    }
    // console.log('data', data.toString())
    // socket.write(socketId)
  })
  socket.on('end', () => {
    console.log('end')
  })
  socket.on('close', (error) => {
    console.log('close isError:', error)
  })
  socket.on('timeout', () => {
    console.log('timeout')
  })
  socket.on('error', (error) => {
    console.error('error', error.name, error.message)
  })
})

server.listen(1883, () => {
  console.log('port 1883 (MQTT) listening')
})

class JNCF {
  constructor (socket = new net.Socket(), uid = '') {
    this.socket = socket
    this.socketId = uid
  }

  decode (buffer = new Buffer()) {
    const byte1 = to8bit(buffer[0])
    const type = parseInt(byte1.substr(0, 4), 2)
    const flags = byte1.substr(4, 4)
    // type 1 3 4 5 7
    if (flags !== '0000') throw new Error('Flag not correct')
    const RemainingLength = parseInt(to8bit(buffer[1]) + to8bit(buffer[2]), 2)
    console.log('Remaining Length:', RemainingLength)
    let nextBit = 3
    if (type === 1) {
      console.log('Type: CONN')
      const protocolNameLength = buffer[nextBit++]
      console.log('Protocol Name Length:', protocolNameLength)
      let protocolName = ''
      for (let i = 0; i < protocolNameLength; i++) {
        protocolName += String.fromCharCode(buffer[nextBit++])
      }
      const protocolVersion = buffer[nextBit++]
      console.log('Protocol Name:', protocolName)
      console.log('Protocol Version:', protocolVersion)
      if (protocolName !== 'JNCF') throw new Error('Protocol Name not correct')
      if (protocolVersion !== 1) throw new Error('Protocol Level not correct')
      if (nextBit-3 === RemainingLength) console.log('Remaining Length correct')
      return this.CONNACK()
    }
    throw new Error ('Type not correct')
  }

  CONNACK () {
    console.log('CONNACK')
    const ackHeader = [32, 0, 1, 0]
    this.socket.write(new Buffer(ackHeader))
  }

  PUB () {}

  PUBACK () {}

  SUBACK () {}

  PINGACK () {}
}

const to8bit = (number) => {
  return ('00000000' + number.toString(2)).substr(-8)
}

const debugBuffer = (buffer) => {
  for (let i = 0; i < buffer.length; i++) {
    const number = buffer[i]
    const hex = ('00' + number.toString(16)).substr(-2)
    const dec = ('000' + number.toString(10)).substr(-3)
    const bin = to8bit(number)
    const left = parseInt(bin.substr(0, 4), 2)
    const right = parseInt(bin.substr(4, 4), 2)
    let data = 'byte ' + ('00' + (i-1)).substr(-2)
    data += ' => ' + hex + ' ' + dec + ' ' + bin.substr(0, 4) + ' ' + bin.substr(4, 4)
    data += ' => ' + left + ' ' + right
    data += ' => 0x' + left.toString(16) + ' 0x' + right.toString(16)
    data += ' -> ' + String.fromCharCode(buffer[i])
    console.log(data)
  }
}
