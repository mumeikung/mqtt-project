#!/usr/bin/env node
'use strict'

const Net = require('net')
const PromiseSocket = require('promise-socket')

const conv8bit = (num = 0) => {
    return ('00000000' + num.toString(2)).substr(-8)
}

const addr = process.argv[2]
const topic = process.argv[3]
const overCommd = process.argv[4]
if (!addr) throw new Error('Please enter address')
if (!topic) throw new Error('Please enter topic')
if (overCommd) throw new Error('Over command')

const newSocket = new Net.Socket()
const socket = new PromiseSocket(newSocket)

const runn = async() => {
    console.log(`Connecting to server "${addr}"`)
    await socket.connect(1883, addr)
    await socket.write(Buffer.from([16, 0, 6, 4, 74, 78, 67, 70,1]))
    const conn = await socket.read()
    if (conn[0] !== 32 && conn[1] !== 0 && conn[2] !== 1 && conn[3] !== 0) throw new Error('CONNACK false')
    console.log('Connected')
    let sub = [80, 0, 0]
    sub.push(topic.length)
    for( let i=0 ; i < topic.length ; i++ ) sub.push(topic.charCodeAt(i))
    const remLength = ('0000000000000000' + (sub.length -3).toString(2)).substr(-16)
    // console.log(remLength)
    // console.log(remLength.substr(0,8), remLength.substr(8,8))
    sub[1] = parseInt(remLength.substr(0,8), 2)
    sub[2] = parseInt(remLength.substr(8,8), 2)
    // console.log(sub)

    let i = 0
    const subsend = () => {
        i++
        console.log('Subscribe topic "' + topic + '" to server...', i)
        socket.write(Buffer.from(sub))
        if (i >= 3) {
            clearInterval(interval)
            throw new Error('SUBACK not response...')
        }
    }
    subsend()
    const interval = setInterval(subsend, 10000)
    const subAck = await socket.read()
    if (subAck[0] !== 96 && subAck[1] !== 0 && subAck[2] !== 1 && subAck[3] !== 0) throw new Error('SUBACK false')
    clearInterval(interval)
    // console.log(subAck)

    setInterval(async () => {
        // console.log('PING')
        socket.write(Buffer.from([112, 0, 0]))
    }, 30000)
    console.log(`Start subscribe topic: "${topic}"`)
    while (1) {
        const pub = await socket.read()
        // console.log(pub)
        if (pub[0] === 128 && pub[1] === 0 && pub[2] === 0) {
            // console.log('PONG')
        }
        else {
            if (pub[0] !== 48) throw new Error('PUB false')
            const pubLength = parseInt(conv8bit(pub[1]) + conv8bit(pub[2]), 2)
            // console.log('RML Math:', ((pub[1] << 8) + pub[2]))
            // console.log('RML CONV:', pubLength)
            let topicName = []
            for (let i = 4, j = 0 ; i < (pub[3] + 4); i++) topicName[j++] = String.fromCharCode(pub[i])
            topicName = topicName.join('')
            const mesID = parseInt(conv8bit(pub[pub[3] + 4]) + conv8bit(pub[pub[3] + 5]), 2)
            // console.log('topic name:', topicName)
            // console.log('MSG ID Math:', ((pub[pub[3]+4] << 8) + pub[pub[3]+5]))
            // console.log('message id:', mesID)
            // const payLoadSt = parseInt(pub[3], 16) + 6
            let payLoadMess = []
            for (let i = parseInt(pub[3], 16) + 6, j = 0 ; i < pubLength+3 ; i++) payLoadMess[j++] = String.fromCharCode(pub[i])
            console.log('Topic:', topicName, 'Message:', payLoadMess.join(''))
            // const ping = [112,0,0]
            // socket.write(Buffer.from(ping))
            // const pingAck = await socket.read()
            // if (pingAck[0] !== 128 && pingAck[1] !== 0 && pingAck[2] !== 0) throw new Error('PINGACK false')
            // console.log(pub[3])
            const pubAck = [64, 0, 2, pub[pub[3] + 4], pub[pub[3] + 5]]
            socket.write(Buffer.from(pubAck))
        }
    }
}

try {
    runn()
} catch (error) {
    console.error(error.messa)
    socket.destroy()
}
