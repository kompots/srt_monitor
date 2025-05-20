import dgram from 'dgram';

const client = dgram.createSocket('udp4');
const message = Buffer.from('Test UDP message');

client.send(message, 6969, '127.0.0.1', (err) => {
  client.close();
});