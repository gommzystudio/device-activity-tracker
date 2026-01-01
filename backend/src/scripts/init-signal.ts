import { execSync } from 'child_process';
import os from 'os';
import path from 'path';

const CONTAINER_NAME = 'signal-api';
const IMAGE_NAME = 'bbernhard/signal-cli-rest-api';
const PORT = 8080;

// Cross-platform path to local share
const hostVolPath = path.join(os.homedir(), '.local', 'share', 'signal-api');
const containerVolPath = '/home/.local/share/signal-cli';

try {
  // 1. First, check if Docker is actually running
  try {
    execSync('docker info', { stdio: 'ignore' });
  } catch (e) {
    console.error('⚠️  Docker is not running.');
    console.error('   Please start Docker Desktop and try again.');
    process.exit(1);
  }

  // 2. Check if container exists using 'docker inspect'
  try {
    execSync(`docker inspect ${CONTAINER_NAME}`, { stdio: 'ignore' });
    console.log(`✅ Container '${CONTAINER_NAME}' found. Starting...`);
    execSync(`docker start ${CONTAINER_NAME}`, { stdio: 'inherit' });
  } catch (e) {
    // 3. If inspect fails, container doesn't exist. Create it.
    console.log(`🆕 Container '${CONTAINER_NAME}' not found. Creating...`);
    
    const cmd = `docker run -d --name ${CONTAINER_NAME} -p ${PORT}:${PORT} -v "${hostVolPath}:${containerVolPath}" -e MODE=json-rpc ${IMAGE_NAME}`;
    
    execSync(cmd, { stdio: 'inherit' });
  }
} catch (error) {
  // Catch any other unexpected errors
  console.error('❌ Failed to initialize Signal API container:', error);
  process.exit(1);
}
