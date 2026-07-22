require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session'); 
const bcrypt = require('bcryptjs');
const https = require('https'); // 🔥 GitHub API Sync ke liye

// 🚀 CLOUDINARY INTEGRATION PACKAGES
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(express.static(path.resolve(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express Session Config
app.use(session({
    secret: process.env.SESSION_SECRET || 'default_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60 * 60 * 1000 } 
}));

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const DATA_FILE = path.resolve(__dirname, 'data', 'database.json');
const UPLOADS_DIR = path.resolve(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
const DATA_DIR = path.resolve(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Storage Strategy setup
let storageStrategy;
if (process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_API_KEY) {
    storageStrategy = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'patliputra_vidyapeeth_uploads',
            allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
            resource_type: 'auto'
        }
    });
    console.log("☁️ Cloudinary Storage Layer Activated!");
} else {
    storageStrategy = multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOADS_DIR),
        filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
    });
    console.log("📂 Local Storage Fallback Mode Active!");
}

const upload = multer({ storage: storageStrategy });

// Helper to read local data safely
function getLocalData() {
    if (!fs.existsSync(DATA_FILE)) {
        return { notices: [], events: [], documents: [] };
    }
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return raw ? JSON.parse(raw) : { notices: [], events: [], documents: [] };
    } catch (e) {
        return { notices: [], events: [], documents: [] };
    }
}

// 🔄 GITHUB API AUTO-SYNC ENGINE (Render Ephemeral Fix)
async function syncDatabaseToGitHub(updatedData) {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPO; 
    const filePath = "data/database.json"; 

    if (!token || !repo) {
        console.log("⚠️ GITHUB_TOKEN ya GITHUB_REPO env variables missing hain. Skipping GitHub Sync.");
        return;
    }

    try {
        // 1. Current SHA hash fetch karna
        const getShaOptions = {
            hostname: 'api.github.com',
            path: `/repos/${repo}/contents/${filePath}`,
            method: 'GET',
            headers: {
                'User-Agent': 'NodeJS-Render-Server',
                'Authorization': `token ${token}`
            }
        };

        const shaRes = await new Promise((resolve) => {
            https.get(getShaOptions, (res) => {
                let body = '';
                res.on('data', chunk => body += chunk);
                res.on('end', () => resolve(JSON.parse(body)));
            });
        });

        if (!shaRes.sha) {
            console.error("❌ GitHub file SHA fetch failed:", shaRes.message || "File not found in repo");
            return;
        }

        // 2. Base64 encode JSON and Push to GitHub API
        const contentBase64 = Buffer.from(JSON.stringify(updatedData, null, 2)).toString('base64');

        const putData = JSON.stringify({
            message: "Auto-sync database.json via Admin Panel [skip ci]",
            content: contentBase64,
            sha: shaRes.sha
        });

        const putOptions = {
            hostname: 'api.github.com',
            path: `/repos/${repo}/contents/${filePath}`,
            method: 'PUT',
            headers: {
                'User-Agent': 'NodeJS-Render-Server',
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(putData)
            }
        };

        const req = https.request(putOptions, (res) => {
            if (res.statusCode === 200 || res.statusCode === 201) {
                console.log("🎉 Database.json 100% Synced with GitHub Repository!");
            } else {
                console.error("❌ GitHub API Sync Failed with Status:", res.statusCode);
            }
        });

        req.write(putData);
        req.end();

    } catch (err) {
        console.error("❌ Git API Sync Error:", err.message);
    }
}

// Helper to save local JSON and trigger GitHub Push
function saveAndSyncData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    syncDatabaseToGitHub(data); // 🔥 Trigger GitHub Sync
}

// ==========================================
// ROUTES & APIS
// ==========================================

app.get('/api/data', (req, res) => {
    res.json(getLocalData());
});

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';

    if (username === adminUser && password === adminPass) {
        req.session.isAuthorized = true;
        return res.json({ success: true, redirect: '/admin' });
    }
    res.status(401).json({ success: false, message: 'Invalid credentials!' });
});

app.get('/admin', (req, res) => {
    if (!req.session.isAuthorized) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.resolve(__dirname, 'views', 'admin.html'));
});

app.get('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 📌 ADD NOTICE
app.post('/api/admin/add-notice', (req, res) => {
    if (!req.session.isAuthorized) return res.status(403).json({ message: "Unauthorized" });

    const { title, date, pdfUrl } = req.body;
    let localData = getLocalData();

    const newNotice = {
        id: Date.now(),
        title: title.trim(),
        date: date || new Date().toISOString().split('T')[0],
        pdfUrl: pdfUrl || ''
    };

    if (!localData.notices) localData.notices = [];
    localData.notices.push(newNotice);

    saveAndSyncData(localData);

    res.json({ success: true, message: "Notice Added and Synced!" });
});

// 📌 PUBLISH GALLERY/HERO EVENT
app.post('/api/admin/publish-event', upload.array('photos', 10), (req, res) => {
    if (!req.session.isAuthorized) return res.status(403).send("Unauthorized access");

    try {
        const { eventTitle, eventDate, eventCategory } = req.body;
        let localData = getLocalData();

        const photoUrls = req.files ? req.files.map(f => f.path || `/uploads/${f.filename}`) : [];

        const newEvent = {
            id: 'evt_' + Date.now(),
            title: eventTitle.trim(),
            date: eventDate,
            category: eventCategory || 'general',
            photos: photoUrls
        };

        if (!localData.events) localData.events = [];
        localData.events.push(newEvent);

        saveAndSyncData(localData);

        res.send('<script>alert("Event published successfully!"); window.location.href="/admin";</script>');
    } catch (err) {
        console.error(err);
        res.status(500).send("Upload Error");
    }
});

// 📌 UPLOAD DISCLOSURE DOCUMENT
app.post('/api/admin/upload-disclosure', upload.single('docFile'), (req, res) => {
    if (!req.session.isAuthorized) return res.status(403).send("Unauthorized access");

    try {
        const { category, title } = req.body;
        let localData = getLocalData();

        const fileUrl = req.file ? (req.file.path || `/uploads/${req.file.filename}`) : '';

        const newDoc = {
            id: Date.now(),
            category: category,
            title: title.trim(),
            fileUrl: fileUrl
        };

        if (!localData.documents) localData.documents = [];
        localData.documents.push(newDoc);

        saveAndSyncData(localData);

        res.send('<script>alert("Document Published Successfully!"); window.location.href="/admin";</script>');
    } catch (err) {
        console.error("Database Write Error:", err);
        res.status(500).send("Database transaction crash!");
    }
});

// 📌 DELETE NOTICE
app.delete('/api/admin/delete-notice/:id', (req, res) => {
    if (!req.session.isAuthorized) return res.status(403).json({ message: "Unauthorized" });

    const id = parseInt(req.params.id);
    let localData = getLocalData();

    if (localData.notices) {
        localData.notices = localData.notices.filter(n => n.id !== id);
    }

    saveAndSyncData(localData);

    res.json({ success: true, message: "Notice deleted!" });
});

// 📌 DELETE ALBUM
app.delete('/api/admin/terminate-album/:id', (req, res) => {
    if (!req.session.isAuthorized) return res.status(403).json({ message: "Unauthorized" });

    const { id: albumId } = req.params;
    let localData = getLocalData();

    if (localData.events) {
        localData.events = localData.events.filter(e => e.id !== albumId);
    }

    saveAndSyncData(localData);

    res.json({ success: true, message: "Successfully terminated the entire album block!" });
});

// Static Page Routes
app.get('/mandatory-disclosure', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'mandatory-disclosure.html')); });
app.get('/campus.html', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'campus.html')); });

// Start Server
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Patliputra Vidyapeeth Server is 100% LIVE on port ${PORT}!`);
    console.log(`===================================================`);
});