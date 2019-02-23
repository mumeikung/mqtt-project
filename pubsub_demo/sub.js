const net = require('net')
const PromiseSocket = require('promise-socket')

const to8bit = (number) => {
  return ('00000000' + number.toString(2)).substr(-8)
}

const topicFormat = (topic = '') => {
  const myTopic = topic.split('/')
  let newTopic = ''
  for (const key in myTopic) {
    if (myTopic.hasOwnProperty(key)) {
      const element = myTopic[key]
      if (element) {
        newTopic += '/' + element
      }
    }
  }
  return (newTopic === '' ? 'null' : newTopic)
}

const newSoc = new net.Socket()
const socket = new PromiseSocket(newSoc)

const runn = async () => {
  try {
    await socket.connect(1883, 'localhost')
    await socket.write(new Buffer([16, 0, 6, 4, 74, 78, 67, 70, 1]))
    const conn = await socket.read()
    console.log('conn', conn)
    if (conn[0] !== 32 && conn[0] !== 0 && conn[0] !== 1 && conn[0] !== 0) throw new Error('CONNACK not correct')
    const topic = '/test/kiki/1'
    let subData = [80, 0, 0]
    subData.push(topic.length)
    for (let i = 0; i < topic.length; i++) {
      subData.push(topic.charCodeAt(i))
    }
    const RemainLength = ('0000000000000000' + (subData.length - 3).toString(2)).substr(-16)
    subData[1] = parseInt(RemainLength.substr(0, 8), 2)
    subData[2] = parseInt(RemainLength.substr(8, 8), 2)
    await socket.write(new Buffer(subData))
    const subAck = await socket.read()
    if (subAck[0] !== 96 && subAck[0] !== 0 && subAck[0] !== 1 && subAck[0] !== 0) throw new Error('SUBACK not correct')
    console.log(`Start Subscribe topic "${topic}"`)
    while (1) {
      const buffer = await socket.read()
      const byte1 = to8bit(buffer[0])
      const type = parseInt(byte1.substr(0, 4), 2)
      const flags = byte1.substr(4, 4)
      if (flags !== '0000') {
        console.error('Flag not correct')
        continue;
      }
      if (type !== 3) {
        console.error('Not PUB Type')
        continue;
      }
      const RemainingLength = parseInt(to8bit(buffer[1]) + to8bit(buffer[2]), 2)
      // console.log('Remaining Length:', RemainingLength)
      let nextBit = 3
      const topicLength = buffer[nextBit++]
      // console.log('Topic Length:', topicLength)
      let topic = ''
      for (let i = 0; i < topicLength; i++) {
        topic += String.fromCharCode(buffer[nextBit++])
      }
      topic = topicFormat(topic)
      // console.log('Topic:', topic)
      const messageId = to8bit(buffer[nextBit++]) + to8bit(buffer[nextBit++])
      // console.log('Message ID:', messageId, parseInt(messageId, 2))
      // payload
      let payload = ''
      const payloadLength = RemainingLength - (nextBit - 3)
      // console.log('Payload Length:', payloadLength)
      for (let i = 0; i < payloadLength; i++) {
        payload += String.fromCharCode(buffer[nextBit++])
      }
      // console.log('Payload:', payload)
      if (nextBit-3 !== RemainingLength) throw new Error('Remaining Length not correct')
      console.log(`PUBLISH => TOPIC: "${topic}" => MESSAGE: "${payload}"`)
      const ackHeader = [64, 0, 2, parseInt(messageId.substr(0, 8), 2), parseInt(messageId.substr(8, 8), 2)]
      await socket.write(new Buffer(ackHeader))
    }
    await socket.end()
  } catch (error) {
    console.error(error.message)
    await socket.end()
  }
}
runn()
