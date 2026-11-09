import app from './app.js';
import { workerMode } from './workerClient.js';

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => {
  console.log(`SpeedLab API listening on http://localhost:${PORT} (worker mode: ${workerMode()})`);
});
