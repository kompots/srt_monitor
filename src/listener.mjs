import si from 'systeminformation';
import fs from 'fs';
import { WebSocketServer } from 'ws';
// import { path } from 'path';
const wss = new WebSocketServer({ port: 3333 });
let config_updated = false;
let config = {
  "ws": {
    "active": false,
    "host": "127.0.0.1",
    "port": "4455",
    "password": "",
    "connected": false
  },
  "srt": {
    "ratio": 1,
    "bframes": 3
  },
  "obs": {}
};
let prevRecv = 0;
let currentBitrate = 0;

console.log('WebSocket server started on ws://localhost:3333');

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    let _message = JSON.parse(message)
    if(_message.method=='getConfig'){
          ws.send(JSON.stringify({
                method: "updateConfig",
                config: config
              }));
    }
    if (_message.method == 'syncConfig') {
      console.log("Send sync to clients")
      ws.send(JSON.stringify({
            method: "syncConfig",
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