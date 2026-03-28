module.exports = function handler(req, res) {
  res.status(200).json({
    response: {
      externalNumber: "+18564228130"
    },
    success: true,
    status: "success"
  });
}
```

Commit changes → Vercel will auto-redeploy → then visit:
```
https://test-tan.vercel.app/api/route
