import express from 'express';
import cors from 'cors';
import si from 'systeminformation';

const app = express();
const PORT = 3003;

// Enable CORS for all origins using middleware
app.use(cors());

// Optional: Also set CORS headers manually for extra safety
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow all origins
  res.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

let prevRecv = 0;
let currentBitrate = 0;

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

setInterval(updateBitrate, 1000);
await updateBitrate();

app.get('/bitrate', (req, res) => {
  res.json({ bitrate: currentBitrate.toFixed(2) });
});

app.listen(PORT, () => {
  console.log(`Bitrate API server running on http://localhost:${PORT}`);
});