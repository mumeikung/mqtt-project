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
    await socket.connect(1883, addr)
    await socket.write(Buffer.from([16, 0, 6, 4, 74, 78, 67, 70,1]))
    const conn = await socket.read()
    if (conn[0] !== 32 && conn[1] !== 0 && conn[2] !== 1 && conn[3] !== 0) throw new Error('CONNACK false')
    let sub = [80,0,0]
    sub.push(topic.length)
    for( let i=0 ; i < topic.length ; i++ ) sub.push(topic.charCodeAt(i))
    const remLength = ('0000000000000000' + (sub.length -3).toString(2)).substr(-16)
    // console.log(remLength)
    // console.log(remLength.substr(0,8), remLength.substr(8,8))
    sub[1] = parseInt(remLength.substr(0,8), 2)
    sub[2] = parseInt(remLength.substr(8,8), 2)
    // console.log(sub)
    await socket.write(Buffer.from(sub))
    const subAck = await socket.read()
    if (subAck[0] !== 96 && subAck[1] !== 0 && subAck[2] !== 1 && subAck[3] !== 0) throw new Error('SUBACK false') 
    // console.log(subAck)  
    while(1){
        const pub = await socket.read()
        console.log(pub)
        if (pub[0] !== 48) throw new Error('PUB false')
        const pubLength = parseInt(conv8bit(pub[1]) + conv8bit(pub[2]), 2)
        // console.log(pubName)
        const pubHeadLength = pubLength - pub[3] - pub.sub
    }
}
runn()