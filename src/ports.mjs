// Save this as clone-tcp.mjs or ensure package.json has "type": "module"

import net from 'net';

const SOURCE_PORT = 6969;
const DEST_PORT = 6868;
const DEST_HOST = '127.0.0.1';

const server = net.createServer((sourceSocket) => {
  console.log('New connection on source port');

  const destSocket = net.createConnection({ port: DEST_PORT, host: DEST_HOST }, () => {
    console.log('Connected to destination port');
  });

  sourceSocket.on('data', (data) => {
    destSocket.write(data);
  });

  sourceSocket.on('close', () => {
    destSocket.end();
  });

  destSocket.on('close', () => {
    sourceSocket.end();
  });

  sourceSocket.on('error', (err) => console.error('Source socket error:', err));
  destSocket.on('error', (err) => console.error('Destination socket error:', err));
});

server.listen(SOURCE_PORT, () => {
  console.log(`Listening on port ${SOURCE_PORT}, cloning traffic to port ${DEST_PORT}`);
});
