const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/route') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      response: {
        externalNumber: "+1YOUR_VAPI_NUMBER"
      },
      success: true,
      status: "success"
    }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
