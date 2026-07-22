require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session'); 
const bcrypt = require('bcryptjs');
const https = require('https');

// ☁️ CLOUDINARY STORAGE PACKAGES
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(express.static(path.resolve(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express Session Config
app.use(session({
    secret: (process.env.SESSION_SECRET || 'default_secret_key').trim(),
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60 * 60 * 1000 } 
}));

// ☁️ CLOUDINARY CONFIGURATION
const cloudName = (process.env.CLOUDINARY_NAME || process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret
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

// ☁️ MULTER STORAGE STRATEGY
let storageStrategy;
if (cloudName && apiKey && apiSecret) {
    storageStrategy = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: {
            folder: 'patliputra_vidyapeeth_uploads',
            allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
            resource_type: 'auto'
        }
    });
    console.log("☁️ CLOUDINARY STORAGE ENGINE ACTIVATED SUCCESSFULLY!");
} else {
    storageStrategy = multer.diskStorage({
        destination: (req, file, cb) => cb(null, UPLOADS_DIR),
        filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
    });
    console.log("⚠️ CLOUDINARY KEYS MISSING! Falling back to Temporary Disk.");
}

const upload = multer({ storage: storageStrategy });

// Helper to read local data
function getLocalData() {
    if (!fs.existsSync(DATA_FILE)) {
        return { notices: [], events: [], enquiries: [], documents: [] };
    }
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return raw ? JSON.parse(raw) : { notices: [], events: [], enquiries: [], documents: [] };
    } catch (e) {
        return { notices: [], events: [], enquiries: [], documents: [] };
    }
}

// 🔄 GITHUB API AUTO-SYNC ENGINE
async function syncDatabaseToGitHub(updatedData) {
    const token = (process.env.GITHUB_TOKEN || '').trim();
    const repo = (process.env.GITHUB_REPO || '').trim(); 
    const filePath = "data/database.json"; 

    if (!token || !repo) {
        console.log("⚠️ GITHUB_TOKEN ya GITHUB_REPO missing. Git Sync Skipped.");
        return;
    }

    try {
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
            console.error("❌ GitHub SHA Fetch Error:", shaRes.message || "File path missing in repository");
            return;
        }

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
                console.log("🎉 Database.json successfully committed & synced to GitHub!");
            } else {
                console.error("❌ GitHub API Sync Failed! Status:", res.statusCode);
            }
        });

        req.write(putData);
        req.end();

    } catch (err) {
        console.error("❌ Git Sync Error:", err.message);
    }
}

function saveAndSyncData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    syncDatabaseToGitHub(data);
}

// --- SECURITY MIDDLEWARE ---
function isAdminAuthenticated(req, res, next) {
    if (req.session && (req.session.isAdmin || req.session.isAuthorized)) {
        return next();
    } else {
        res.send('<script>alert("Access Denied! Please login first."); window.location.href="/login";</script>');
    }
}

// ==================================================================================
// 🚀 1. BEYOND ACADEMICS VIEW ROUTE
// ==================================================================================
app.get('/beyond-academics/:type', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'views', 'activity.html'));
});

// --- CORE VIEW ROUTES ---
app.get('/', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'index.html')); });
app.get('/campus', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'campus.html')); });
app.get('/about', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'about.html')); });
app.get('/faculty', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'faculty.html')); });
app.get('/contact', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'contact.html')); });
app.get('/gallery', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'gallery.html')); });
app.get('/login', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'login.html')); });
app.get('/mandatory-disclosure', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'mandatory-disclosure.html')); });
app.get('/campus.html', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'campus.html')); });

app.get('/admin', isAdminAuthenticated, (req, res) => { 
    res.sendFile(path.resolve(__dirname, 'views', 'admin.html')); 
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ==================================================================================
// 🚀 2. BEYOND ACADEMICS DATA API GATEWAY
// ==================================================================================
app.get('/api/beyond-academics/:type', (req, res) => {
    const type = req.params.type;
    const dataMatrix = {
        'sports': {
            title: "Sports & Athletics Arena",
            description: "At Patliputra Vidyapeeth, we ensure robust physical development through state-of-the-art sports ecosystems including Football, Cricket, Badminton, and Athletic Tracks.",
            image: "/images/Outdoor game.png"
        },
        'music': {
            title: "Music & Performing Arts Club",
            description: "Nurturing creative expression and rhythmic brilliance. Our specialized music rooms train students in classical, contemporary vocals, and instruments like Keyboard, Guitar, and Drums.",
            image: "/images/music 2.jpeg"
        },
        'arts': {
            title: "Fine Arts & Creative Crafts Studio",
            description: "Fostering visual creativity and aesthetic expression. Students explore painting, origami, sculpture making, and structural designing under seasoned craft curators.",
            image: "/images/Art & Craft.png"
        },
        'indoor-games': {
            title: "Strategic Indoor Intelligence Games",
            description: "Enhancing cognitive capacity, mental calculations, and tactical agility through specialized arenas for Chess, Table Tennis, Carrom, and analytical board layouts.",
            image: "/images/indoor game.png"
        }
    };

    const result = dataMatrix[type];
    if (result) {
        return res.json(result);
    } else {
        return res.status(404).json({ error: "Activity not found" });
    }
});

// --- GENERAL DATA & POST ROUTES ---
app.get('/api/data', (req, res) => {
    res.json(getLocalData());
});

// 🔐 ORIGINAL ADMIN LOGIN ROUTE (Bcrypt Hash + Alert Script Redirect)
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    const correctUsername = process.env.ADMIN_USERNAME;
    
    if (username !== correctUsername) {
        return res.send('<script>alert("Invalid Username!"); window.location.href="/login";</script>');
    }

    // Bcrypt Hash Comparison
    const isPasswordCorrect = bcrypt.compareSync(password, process.env.ADMIN_PASSWORD || '');

    if (isPasswordCorrect) {
        req.session.isAdmin = true; 
        req.session.isAuthorized = true;
        res.redirect('/admin'); 
    } else {
        res.send('<script>alert("Invalid Password! Try again."); window.location.href="/login";</script>');
    }
});

// 📌 UPLOAD / SAVE NOTICE
app.post('/api/admin/upload-notice', isAdminAuthenticated, (req, res) => {
    const { noticeId, title, description } = req.body;
    let localData = getLocalData();

    if (noticeId) {
        let existingNotice = localData.notices.find(n => n.id === parseInt(noticeId));
        if (existingNotice) {
            existingNotice.title = title;
            existingNotice.description = description;
            existingNotice.date = new Date().toLocaleDateString('en-GB') + ' (Updated)';
        }
    } else {
        if (!localData.notices) localData.notices = [];
        localData.notices.push({
            id: Date.now(),
            title: title.trim(),
            description: description ? description.trim() : "",
            date: new Date().toLocaleDateString('en-GB')
        });
    }

    saveAndSyncData(localData);
    res.send('<script>alert("Notice Saved Successfully!"); window.location.href="/admin";</script>');
});

// 📌 UPLOAD / PUBLISH EVENT (Cloudinary Enabled)
app.post('/api/admin/upload-event', isAdminAuthenticated, upload.array('eventPhotos', 15), (req, res) => {
    const { eventId, eventTitle, eventDescription } = req.body;
    const uploadedFiles = req.files ? req.files.map(f => f.path || f.secure_url || `/uploads/${f.filename}`) : [];

    let localData = getLocalData();

    if (eventId) {
        let existingEvent = localData.events.find(e => e.id === parseInt(eventId));
        if (existingEvent) {
            existingEvent.title = eventTitle.trim();
            existingEvent.description = eventDescription;
            if (uploadedFiles.length > 0) {
                existingEvent.images = existingEvent.images.concat(uploadedFiles);
                existingEvent.coverImage = uploadedFiles[0];
            }
        }
    } else {
        if (!localData.events) localData.events = [];
        localData.events.push({
            id: Date.now(),
            title: eventTitle.trim(),
            description: eventDescription,
            coverImage: uploadedFiles[0] || '/uploads/default-event.jpg',
            images: uploadedFiles
        });
    }

    saveAndSyncData(localData);
    res.send('<script>alert("Gallery Data Updated Successfully!"); window.location.href="/admin";</script>');
});

// 📌 ENQUIRY SUBMISSION
app.post('/api/enquiry/submit', (req, res) => {
    const { parentName, studentName, targetClass, phone, message } = req.body;
    let localData = getLocalData();
    if (!localData.enquiries) { localData.enquiries = []; }

    localData.enquiries.push({
        id: Date.now(),
        parentName: parentName.trim(),
        studentName: studentName.trim(),
        targetClass: targetClass.trim(),
        phone: phone.trim(),
        message: message ? message.trim() : "",
        date: new Date().toLocaleString('en-GB')
    });

    saveAndSyncData(localData);
    res.send('<script>alert("Thank you! Enquiry submitted successfully."); window.location.href = "/";</script>');
});

// 📌 UPLOAD SCHOOL DOCUMENT
app.post('/api/admin/upload-document', isAdminAuthenticated, upload.single('docFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded. Kripya sahi PDF file chune.');
    }

    const { category, title } = req.body;
    const fileUrl = req.file.path || req.file.secure_url || `/uploads/${req.file.filename}`;

    try {
        let localData = getLocalData();
        if (!localData.documents) localData.documents = [];

        localData.documents.push({
            id: Date.now(),
            category: category,
            title: title.trim(),
            fileUrl: fileUrl
        });

        saveAndSyncData(localData);
        res.send('<script>alert("Document Published Successfully!"); window.location.href="/admin";</script>');
    } catch (err) {
        console.error("Database Write Error:", err);
        res.status(500).send("Database transaction crash!");
    }
});

// 🗑️ DELETE API ENGINE
app.delete('/api/admin/delete/:type/:id', isAdminAuthenticated, (req, res) => {
    const { type, id } = req.params;
    let localData = getLocalData();
    const itemId = parseInt(id);

    if (type === 'notice') {
        if (localData.notices) localData.notices = localData.notices.filter(n => n.id !== itemId);
    } else if (type === 'enquiry') {
        if (localData.enquiries) localData.enquiries = localData.enquiries.filter(e => e.id !== itemId);
    } else if (type === 'event') {
        if (localData.events) localData.events = localData.events.filter(e => e.id !== itemId);
    } else if (type === 'document') {
        if (localData.documents) localData.documents = localData.documents.filter(d => d.id !== itemId);
    } else {
        return res.status(400).json({ message: "Invalid type requested" });
    }

    saveAndSyncData(localData);
    res.json({ success: true, message: `Successfully terminated requested ${type}!` });
});

// SERVER LISTEN
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Patliputra Vidyapeeth Server LIVE on port ${PORT}`);
    console.log(`===================================================`);
});