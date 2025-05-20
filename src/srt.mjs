import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import express from 'express';
import cors from 'cors';
import si from 'systeminformation';

const app = express();
const PORT = 3003;

app.use(cors());

// Optional: Also set CORS headers manually for extra safety
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow all origins
  res.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});


// Set ffmpeg path to your local binary in /bin folder relative to project root
const ffmpegPath = path.resolve(process.cwd(), 'bin', 'ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

const srtUrl = 'srt://127.0.0.1:6868?mode=listener';
let fps = 0;
// Create ffmpeg command with SRT input
const command = ffmpeg(srtUrl)
  .format('null')  // no output file, just decode
  .output('-')     // discard output
  .on('start', (commandLine) => {
    console.log('Spawned FFmpeg with command:', commandLine);
  })
  .on('stderr', (stderrLine) => {
    console.log(stderrLine)

   const match = stderrLine.match(/fps=\s*(\d+)/);
    if (match) {
        fps = match[1]
    } else {
        fps = 0
    }
    console.log("FPS: ", fps)
  })
  .on('error', (err, stdout, stderr) => {
    console.error('FFmpeg error:', err.message);
  })
  .on('end', () => {
    console.log('FFmpeg process ended');
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
  res.json({ bitrate: currentBitrate.toFixed(2), fps: fps });
});

app.listen(PORT, () => {
  console.log(`Bitrate API server running on http://localhost:${PORT}`);
});

// Run ffmpeg process
command.run();
