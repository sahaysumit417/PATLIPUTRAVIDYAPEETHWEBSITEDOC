require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session'); 
const bcrypt = require('bcryptjs');

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

// 📥 1. JSONBIN / LOCAL DATA READER (PERSISTENT DATA ENGINE)
async function getLocalData() {
    const binId = process.env.JSONBIN_BIN_ID;
    const apiKey = process.env.JSONBIN_KEY;

    if (binId && apiKey) {
        try {
            const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
                headers: { 'X-Master-Key': apiKey }
            });
            if (response.ok) {
                const resData = await response.json();
                return resData.record || { notices: [], events: [], enquiries: [], documents: [] };
            }
        } catch (err) {
            console.error("❌ Cloud DB Read Error:", err.message);
        }
    }

    // Fallback to local file if JSONBin is unconfigured or fails
    if (!fs.existsSync(DATA_FILE)) return { notices: [], events: [], enquiries: [], documents: [] };
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return raw ? JSON.parse(raw) : { notices: [], events: [], enquiries: [], documents: [] };
    } catch (e) {
        return { notices: [], events: [], enquiries: [], documents: [] };
    }
}

// 📤 2. JSONBIN / LOCAL DATA SAVER
async function saveAndSyncData(data) {
    // Local JSON disk backup save
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Local disk save notice:", e.message);
    }

    const binId = process.env.JSONBIN_BIN_ID;
    const apiKey = process.env.JSONBIN_KEY;

    if (!binId || !apiKey) return;

    try {
        const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': apiKey
            },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            console.log("🎉 Data Cloud DB (JSONBin) par 100% Permanently Save Ho Gaya!");
        } else {
            console.error("❌ JSONBin Sync Fail:", response.statusText);
        }
    } catch (err) {
        console.error("❌ Cloud DB Save Error:", err.message);
    }
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
// 🚀 ROUTES & APIS
// ==================================================================================

// 🏠 CORE VIEW ROUTES
app.get('/', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'index.html')); });
app.get('/campus', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'campus.html')); });
app.get('/about', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'about.html')); });
app.get('/faculty', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'faculty.html')); });
app.get('/contact', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'contact.html')); });
app.get('/gallery', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'gallery.html')); });
app.get('/login', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'login.html')); });
app.get('/mandatory-disclosure', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'mandatory-disclosure.html')); });
app.get('/campus.html', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'campus.html')); });

app.get('/beyond-academics/:type', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'views', 'activity.html'));
});

app.get('/admin', isAdminAuthenticated, (req, res) => { 
    res.sendFile(path.resolve(__dirname, 'views', 'admin.html')); 
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

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

// GET Dynamic Data (from JSONBin)
app.get('/api/data', async (req, res) => {
    const data = await getLocalData();
    res.json(data);
});

// 🔐 ADMIN LOGIN ROUTE (Bcrypt + Plain Fallback Support)
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const correctUsername = process.env.ADMIN_USERNAME || 'admin';
    const envPass = process.env.ADMIN_PASSWORD || 'admin123';
    
    if (username !== correctUsername) {
        return res.send('<script>alert("Invalid Username!"); window.location.href="/login";</script>');
    }

    let isPasswordCorrect = false;
    if (envPass.startsWith('$2b$')) {
        isPasswordCorrect = bcrypt.compareSync(password, envPass);
    } else {
        isPasswordCorrect = (password === envPass);
    }

    if (isPasswordCorrect) {
        req.session.isAdmin = true; 
        req.session.isAuthorized = true;
        res.redirect('/admin'); 
    } else {
        res.send('<script>alert("Invalid Password! Try again."); window.location.href="/login";</script>');
    }
});

// 📌 UPLOAD / SAVE NOTICE
app.post('/api/admin/upload-notice', isAdminAuthenticated, async (req, res) => {
    const { noticeId, title, description } = req.body;
    let localData = await getLocalData();

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

    await saveAndSyncData(localData);
    res.send('<script>alert("Notice Saved Successfully!"); window.location.href="/admin";</script>');
});

// 📌 UPLOAD / PUBLISH EVENT
app.post('/api/admin/upload-event', isAdminAuthenticated, upload.array('eventPhotos', 15), async (req, res) => {
    const { eventId, eventTitle, eventDescription } = req.body;
    const uploadedFiles = req.files ? req.files.map(f => f.path || f.secure_url || `/uploads/${f.filename}`) : [];

    let localData = await getLocalData();

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

    await saveAndSyncData(localData);
    res.send('<script>alert("Gallery Data Updated Successfully!"); window.location.href="/admin";</script>');
});

// 📌 ENQUIRY SUBMISSION
app.post('/api/enquiry/submit', async (req, res) => {
    const { parentName, studentName, targetClass, phone, message } = req.body;
    let localData = await getLocalData();
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

    await saveAndSyncData(localData);
    res.send('<script>alert("Thank you! Enquiry submitted successfully."); window.location.href = "/";</script>');
});

// 📌 UPLOAD SCHOOL DOCUMENT
app.post('/api/admin/upload-document', isAdminAuthenticated, upload.single('docFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded. Kripya sahi PDF file chune.');
    }

    const { category, title } = req.body;
    const fileUrl = req.file.path || req.file.secure_url || `/uploads/${req.file.filename}`;

    try {
        let localData = await getLocalData();
        if (!localData.documents) localData.documents = [];

        localData.documents.push({
            id: Date.now(),
            category: category,
            title: title.trim(),
            fileUrl: fileUrl
        });

        await saveAndSyncData(localData);
        res.send('<script>alert("Document Published Successfully!"); window.location.href="/admin";</script>');
    } catch (err) {
        console.error("Database Write Error:", err);
        res.status(500).send("Database transaction crash!");
    }
});

// 🗑️ DELETE API ENGINE
app.delete('/api/admin/delete/:type/:id', isAdminAuthenticated, async (req, res) => {
    const { type, id } = req.params;
    let localData = await getLocalData();
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

    await saveAndSyncData(localData);
    res.json({ success: true, message: `Successfully terminated requested ${type}!` });
});

// SERVER LISTEN
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Patliputra Vidyapeeth Server LIVE on port ${PORT}`);
    console.log(`===================================================`);
});