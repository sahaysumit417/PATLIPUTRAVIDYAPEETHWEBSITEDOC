require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session'); 
const bcrypt = require('bcryptjs');
const { exec } = require('child_process'); // 🔥 Auto-push ke liye sahi jagah import kiya

// 🚀 CLOUDINARY INTEGRATION PACKAGES
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const PORT = process.env.PORT || 3000; 

app.use(express.static(path.resolve(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// एक्सप्रेस सेशन कॉन्फ़िगरेशन
app.use(session({
    secret: process.env.SESSION_SECRET || 'default_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60 * 60 * 1000 } 
}));

// --- CLOUDINARY CONFIGURATION ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// --- 🎯 DYNAMIC STORAGE ENGINE (LOCAL VS RENDER CLOUD) ---
let storageEngine;

if (process.env.CLOUDINARY_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
    storageEngine = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: async (req, file) => {
            let folderName = 'patliputra_vidyapeeth_uploads';
            if (req.body.type === 'notice') folderName += '/notices';
            else if (req.body.type === 'event') folderName += '/events';
            else if (req.body.type === 'document') folderName += '/documents';
            
            return {
                folder: folderName,
                allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
                public_id: file.originalname.split('.')[0] + '-' + Date.now()
            };
        }
    });
    console.log("☁️  Backend Cloud Engine Activated: Cloudinary Storage Loaded.");
} else {
    storageEngine = multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadPath = path.resolve(__dirname, 'public', 'uploads');
            if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
            cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
            cb(null, Date.now() + '-' + file.originalname);
        }
    });
    console.log("📁 Backend Disk Engine Activated: Local Server Storage Loaded.");
}

const upload = multer({ storage: storageEngine });

// --- 🗄️ LOCAL FILE SYSTEM INTERACTION LAYER ---
const DATA_FILE = path.resolve(__dirname, 'database.json');

const getLocalData = () => {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ notices: [], events: [], documents: [] }, null, 2));
    }
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return { notices: [], events: [], documents: [] };
    }
};

// Static Data Repository
const dataMatrix = {
    'sports': {
        title: "Sports & Athletics Arena",
        description: "At Patliputra Vidyapeeth, we ensure robust physical development through various sports including Football, Basketball, Badminton, Cricket, and Athletics. Our trained coaches guide students to state and national levels.",
        image: "/images/Outdoor game.png"
    },
    'art-craft': {
        title: "Art, Craft & Creativity",
        description: "Unleashing the imagination of our young artists through painting, pottery, origami, and waste-to-wealth crafts. We host regular exhibitions to celebrate our students' visual expressions.",
        image: "/images/Art & Craft.png"
    },
    'music-dance': {
        title: "Music, Dance & Performing Arts",
        description: "From classical rhythms to modern beats, our music and dance department offers comprehensive training in instruments (keyboard, guitar, drums) and various dance forms to nurture stage confidence.",
        image: "/images/Dance Room.png"
    },
    'yoga': {
        title: "Yoga, Meditation & Wellness",
        description: "Mindfulness and mental clarity are key to student success. Daily yoga and meditation sessions help our students improve focus, flexibility, reduce stress, and maintain a healthy lifestyle.",
        image: "/images/yoga.jpg"
    }
};

// --- DYNAMIC DATA MANAGEMENT WEB INTERFACES (UI VIEWS) ---
app.get('/admin-login', (req, res) => {
    if (req.session.isAuthorized) return res.redirect('/admin-dashboard');
    res.sendFile(path.resolve(__dirname, 'views', 'login.html'));
});

app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: "Password is explicitly mandatory!" });

    const originalConfiguredHash = process.env.ADMIN_HASHED_PASS;
    const plaintextPass = process.env.ADMIN_PASSWORD;

    if (plaintextPass && password === plaintextPass) {
        req.session.isAuthorized = true;
        return res.json({ success: true, redirect: '/admin-dashboard' });
    }

    if (originalConfiguredHash) {
        const isMatch = bcrypt.compareSync(password, originalConfiguredHash);
        if (isMatch) {
            req.session.isAuthorized = true;
            return res.json({ success: true, redirect: '/admin-dashboard' });
        }
    }

    res.status(401).json({ message: "Unrecognized Credentials. Denied Access." });
});

app.get('/admin-dashboard', (req, res) => {
    if (!req.session.isAuthorized) return res.redirect('/admin-login');
    res.sendFile(path.resolve(__dirname, 'views', 'admin.html'));
});

app.get('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: "Logged out safely!" });
    });
});

app.get('/notices-board', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'notice.html')); });
app.get('/photo-gallery', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'gallery.html')); });

// --- GLOBAL BACKEND RECEPTACLE DATA CORE APIS ---
app.get('/api/beyond-academics/:type', (req, res) => {
    const currentTarget = req.params.type;
    if (dataMatrix[currentTarget]) res.json(dataMatrix[currentTarget]);
    else res.status(404).json({ error: "Context requested is outside data matrix domain grid." });
});

app.get('/api/fetch/all', (req, res) => {
    res.json(getLocalData());
});

app.post('/api/admin/push-data', upload.single('file'), (req, res) => {
    if (!req.session.isAuthorized) return res.status(403).json({ message: "Unauthorized execution attempt blocked." });

    const { title, description, type, docCategory, albumName } = req.body;
    if (!title || !type) return res.status(400).json({ message: "Fields 'title' and 'type' are highly mandatory." });

    let localData = getLocalData();
    let fileUrlString = null;

    if (req.file) {
        fileUrlString = req.file.path ? req.file.path : `/uploads/${req.file.filename}`;
    }

    const itemStructureId = Date.now().toString();
    const serverTimestamp = new Date().toISOString();

    if (type === 'notice') {
        if (!localData.notices) localData.notices = [];
        localData.notices.unshift({
            id: itemStructureId,
            title,
            description: description || '',
            fileUrl: fileUrlString,
            timestamp: serverTimestamp
        });
    } else if (type === 'event') {
        if (!localData.events) localData.events = [];
        const targetedAlbum = albumName || 'General Events Collection';
        
        let targetGroup = localData.events.find(e => e.albumName === targetedAlbum);
        if (!targetGroup) {
            targetGroup = { id: 'album-' + Date.now(), albumName: targetedAlbum, images: [] };
            localData.events.unshift(targetGroup);
        }
        if (fileUrlString) {
            targetGroup.images.unshift({
                id: itemStructureId,
                title,
                url: fileUrlString,
                timestamp: serverTimestamp
            });
        }
    } else if (type === 'document') {
        if (!localData.documents) localData.documents = [];
        localData.documents.unshift({
            id: itemStructureId,
            title,
            category: docCategory || 'Mandatory Public Disclosure',
            fileUrl: fileUrlString,
            timestamp: serverTimestamp
        });
    } else {
        return res.status(400).json({ message: "Invalid type identifier submitted." });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(localData, null, 2));

    // 🔥 JADU CODE: Upload hote hi data automatic GitHub par chala jayega
    exec('git config --global user.name "RenderServer" && git config --global user.email "server@render.com" && git add database.json && git commit -m "Auto-sync JSON" && git push origin main', (gitErr) => {
        if (!gitErr) console.log("🎉 Database JSON safely pushed to GitHub!");
    });

    res.json({ success: true, message: `Successfully consolidated your dynamic ${type} data node!` });
});

app.delete('/api/admin/terminate-node/:type/:id', (req, res) => {
    if (!req.session.isAuthorized) return res.status(403).json({ message: "Execution privilege restricted." });

    const { type, id: itemId } = req.params;
    let localData = getLocalData();

    if (type === 'notice') {
        localData.notices = localData.notices.filter(n => n.id !== itemId);
    } else if (type === 'event') {
        let parentAlbum = localData.events.find(e => e.images.some(img => img.id === itemId));
        if (parentAlbum) {
            parentAlbum.images = parentAlbum.images.filter(img => img.id !== itemId);
            if (parentAlbum.images.length === 0) {
                localData.events = localData.events.filter(e => e.id !== parentAlbum.id);
            }
        }
    } else if (type === 'document') {
        localData.documents = localData.documents.filter(d => d.id !== itemId);
    } else {
        return res.status(400).json({ message: "Invalid type requested" });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(localData, null, 2));

    // 🔥 Delete hone par bhi GitHub par updated file save ho jaye
    exec('git config --global user.name "RenderServer" && git config --global user.email "server@render.com" && git add database.json && git commit -m "Auto-sync JSON Delete" && git push origin main', (gitErr) => {
        if (!gitErr) console.log("🎉 Database JSON sync after delete!");
    });

    res.json({ success: true, message: `Successfully terminated the requested ${type}!` });
});

app.delete('/api/admin/terminate-album/:id', (req, res) => {
    if (!req.session.isAuthorized) return res.status(403).json({ message: "Execution privilege restricted." });

    const { id: albumId } = req.params;
    let localData = getLocalData();

    if (localData.events) {
        localData.events = localData.events.filter(e => e.id !== albumId);
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(localData, null, 2));

    // 🔥 Album delete hone par bhi sync karega
    exec('git config --global user.name "RenderServer" && git config --global user.email "server@render.com" && git add database.json && git commit -m "Auto-sync Album Delete" && git push origin main', (gitErr) => {
        if (!gitErr) console.log("🎉 Album sync complete!");
    });

    res.json({ success: true, message: "Successfully terminated the entire album block!" });
});

app.get('/mandatory-disclosure', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'mandatory-disclosure.html')); });
app.get('/campus.html', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'campus.html')); });

// --- SERVER LISTEN ---
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Patliputra Vidyapeeth Server is 100% LIVE!`);
    console.log(`📡 Control Console Area: http://localhost:${PORT}`);
    console.log(`===================================================`);
});