/**
 * The recommended way to install node-windows is with npm, using the global flag: npm install -g node-windows
 * 'npm link node-windows' in the project folder
 * Project should install typing: npm i @types/node-windows
 */
import { Service } from 'node-windows';
import path from 'path';

const serviceName = 'AutoPorkBun';
const scriptPath = path.resolve(__dirname, 'index.js');
const svc = new Service({
  name: serviceName,
  description: 'Auto update Porkbun IP address',
  script: scriptPath,
});

svc.on('install', () => {
  svc.start();
});
svc.install();
