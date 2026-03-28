export default function handler(req, res) {
  res.status(200).json({
    response: {
      externalNumber: "+18564228130"
    },
    success: true,
    status: "success"
  });
}
```
Click **Commit changes**

### Step 3 — Go to Vercel
- **Delete the existing project** in Vercel
- Click **"New Project"** → import your GitHub repo again
- Click **Deploy**

### Step 4 — Test
Visit:
```
https://your-new-url.vercel.app/api/route
