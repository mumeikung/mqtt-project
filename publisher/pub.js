#!/usr/bin/env node
'use strict'

const net = require('net');
const con = new net.Socket();
const ip = process.argv[2] || 'localhost'
const topic = process.argv[3] || '/'
const data = process.argv[4] || ''
let end = 0
function getRandomInt(max) 
{
    return Math.floor(Math.random() * Math.floor(max))
}
  
function addInfoToBuffer(value = [], check = 0)
{
    let beforeBuff16Bit = ''
    let buff16Bit = ''
    let buffLenght = ''

    if(check === 1) buffLenght = value.toString(2)
    else buffLenght = value.length.toString(2)

    const zero16Bit = 16 - buffLenght.length
    for(let k = 0; k < zero16Bit; k++)
    {
        beforeBuff16Bit = beforeBuff16Bit + '0'
    }

    buff16Bit = beforeBuff16Bit + buffLenght
    return {
        dec1: parseInt(buff16Bit.substring(0,8), 2),
        dec2: parseInt(buff16Bit.substring(8,16), 2)
    }
}
let timeout = -1
con.connect(1883, ip, () => {
    let round = 0
    let messageID = 0
    con.write(Buffer.from([ 16, 0, 6, 4, 74, 78, 67, 70, 1 ])) // CONN
    con.on('data', (buffer) => {
        if(buffer[0] === 64) // PUBACK
        {
            round = 1
            con.end(Buffer.from([ 144, 0, 1, 0 ])) // DISCONN
            clearTimeout(timeout)
            timeout = -1
            return 0
        }

        else if(buffer[0] === 32) // CONNACK
        {
            let buff = []
            buff.push(topic.length)
            for(let i = 0; i < topic.length; i++)
            {
                buff.push(topic.charCodeAt(i))
            }
            messageID = getRandomInt(65536, 1)
            const mIdToBuff = addInfoToBuffer(messageID, 1)
            buff.push(mIdToBuff.dec1)
            buff.push(mIdToBuff.dec2)
            for(let j = 0; j < data.length; j++)
            {
                buff.push(data.charCodeAt(j))
            }
            const remaining2Byte = addInfoToBuffer(buff, 2)
            buff.splice(0, 0, 48, remaining2Byte.dec1, remaining2Byte.dec2)
            con.write(Buffer.from(buff))
            let i = 0
            const waitPub = function(str1 = []) 
            {
                con.write(Buffer.from(str1))
                i++;
                if(i==3)
                {
                    con.end(Buffer.from([ 144, 0, 1, 0 ]))
                    return 0
                }
                clearTimeout(timeout)
                timeout = setTimeout(waitPub,10000,buff);
            }
            if(buffer[0] != 64)
            {
                waitPub(buff)
            }
        }
        else if(round != 1)
        {
            console.log("ERROR!!!")
        }
    })
})