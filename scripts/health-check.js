// Health check script for Docker container
// Checks if the Next.js server is responding

const http = require('http');

const options = {
  hostname: '127.0.0.1', // Use IPv4 explicitly instead of 'localhost' to avoid IPv6 issues
  port: process.env.PORT || 3000,
  path: '/api/system/health',
  method: 'GET',
  timeout: 5000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0); // Success
  } else {
    console.error(`Health check failed with status: ${res.statusCode}`);
    process.exit(1); // Failure
  }
});

req.on('error', (err) => {
  console.error('Health check error:', err.message);
  process.exit(1); // Failure
});

req.on('timeout', () => {
  console.error('Health check timeout');
  req.destroy();
  process.exit(1); // Failure
});

req.end();
