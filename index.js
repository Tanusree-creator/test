const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/route') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      response: {
        externalNumber: "+18564228130"
      },
      success: true,
      status: "success"
    }));
  }
});

server.listen(process.env.PORT || 3000);

https://vapi-router.onrender.com/route
