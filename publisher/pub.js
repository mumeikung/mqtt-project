#!/usr/bin/env node
'use strict'
 for (let j = 0; j < process.argv.length; j++) 
 {  
    
 }
const net = require('net');
const con = new net.Socket();
let topic = process.argv[3] || '/'
let arrayTopic = new Array()
let buff = []
let data = process.argv[4]  || ''
let arrayData = new Array()
let i = 0
let j = 0
let round = 0
let mID = 0
let dec = ''
let mIdToBuff = ''
function getRandomInt(max) {
    const val = Math.floor(Math.random() * Math.floor(max))
    return val
  }
function addInfoToBuffer(value = [], r = 0)
{
    let check = r
    let beforeBuff16Bit = ''
    let buff16Bit = 0 
    let buff8Bit1 = 0
    let buff8Bit2 = 0
    let buffLenght = ''
    let zero16Bit = 0
    let dec1 = ''
    let dec2 = ''
    if(check == 1)
    {
        buffLenght = value.toString(2)
    }
    else
    {
        buffLenght = value.length.toString(2)
    }
    zero16Bit = 16 - buffLenght.length
    for(let k = 0;k<zero16Bit;k++)
    {
        beforeBuff16Bit = beforeBuff16Bit + '0'
    }
    buff16Bit = beforeBuff16Bit + buffLenght
    buff8Bit1 = buff16Bit.substring(0,8)
    dec1 = parseInt(buff8Bit1,2)
    buff8Bit2 = buff16Bit.substring(8,16)
    dec2 = parseInt(buff8Bit2,2)
    return {
        dec1: dec1,
        dec2: dec2
    }
}
con.connect(1883,process.argv[2], function() {
        con.write(Buffer.from( [ 16,0,6,4,74,78,67,70,1 ] ))
        con.on('data' , (buffer) => {    
        if(buffer[0] == 64)
        {
            round = 1
            con.write(Buffer.from([144,0,1,0]))
            con.end()
        }
        else if(buffer[0] == 32)
        {
            buff.push(topic.length)
            for(i=0;i<topic.length;i++)
            {
                arrayTopic[i] = topic.charCodeAt(i)
                buff.push(arrayTopic[i])
            }
            mID = getRandomInt(65536,1)
            mIdToBuff = addInfoToBuffer(mID,1)
            buff.push(mIdToBuff.dec1)
            buff.push(mIdToBuff.dec2)
            for(j=0;j<data.length;j++)
            {
                arrayData[j] = data.charCodeAt(j)
                buff.push(arrayData[j])
            }
            dec = addInfoToBuffer(buff,2)
            buff.splice(0,0,dec.dec1)
            buff.splice(1,0,dec.dec2)
            buff.splice(0,0,48)
            con.write(Buffer.from(buff))
        }
        else if(round != 1)
        {
            console.log("ERROR!!!")
        }
    })
})
