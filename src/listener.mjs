import si from 'systeminformation';
import fs from 'fs';
import { WebSocketServer } from 'ws';
console.log("LISTENER FILE WAS READ")
const wss = new WebSocketServer({ port: 3333 });
let config_updated = false;
let config = {};
let prevRecv = 0;
let currentBitrate = 0;

const rawData = fs.readFileSync('config.json', 'utf-8');
config = JSON.parse(rawData);



console.log('WebSocket server started on ws://localhost:3333');

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    console.log("WS Message: ", message)
    let _message = JSON.parse(message)
    if(_message.method=='getConfig'){
          ws.send(JSON.stringify({
                method: "updateConfig",
                config: config
              }));
    }
    if(_message.method=='setConfig'){
          config_updated = true;
          config = _message.config;
          wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === ws.OPEN){
              console.log("Send update to clients")
              client.send(JSON.stringify({
                method: "updateConfig",
                config: config
              }));
            }
          });
    }
    if(_message.method=='disconnect'){
          config = _message.config;
          wss.clients.forEach((client) => {
            if (client.readyState === ws.OPEN){
              console.log("Send update to clients")
              client.send(JSON.stringify({
                method: "disconnect",
                config: config
              }));
            }
          });
    }
    if(_message.method=='bitrate'){
          wss.clients.forEach((client) => {
            if (client == ws && client.readyState === ws.OPEN){
              console.log("Send bitrate to clients")
              client.send(JSON.stringify({
                method: "bitrate",
                bitrate: currentBitrate
              }));
            }
          });
    }

  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

setInterval(updateBitrate, 1000);
await updateBitrate();

async function updateBitrate() {
  try {
    const netStats = await si.networkStats();
    const received = netStats[0].rx_bytes;
    const diff = received - prevRecv;
    currentBitrate = (diff * 8) / 1000; // kbps
    prevRecv = received;
  } catch (err) {
    console.error('Failed to get network stats:', err);
  }
}