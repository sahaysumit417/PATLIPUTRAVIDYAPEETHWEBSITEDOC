require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const session = require('express-session'); 
const bcrypt = require('bcryptjs');

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

// Agar Render par CLOUDINARY_NAME environment variable milta hai, toh Cloudinary use hoga
if (process.env.NODE_ENV === 'production' || process.env.CLOUDINARY_NAME) {
    console.log("🌐 Production Environment Detected: Using Cloudinary Storage.");
    storageEngine = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: async (req, file) => {
            return {
                folder: 'patliputra_vidyapeeth_uploads',
                resource_type: 'auto', // Images aur PDFs dono ke liye automatic detection
                public_id: Date.now() + '-' + Math.round(Math.random() * 1E9)
            };
        },
    });
} else {
    // VS Code / Local System ke liye purana local disk storage framework
    console.log("💻 Local Environment Detected: Using Local Disk Storage.");
    const UPLOADS_DIR = path.resolve(__dirname, 'public', 'uploads');
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    
    storageEngine = multer.diskStorage({
        destination: (req, file, cb) => { cb(null, UPLOADS_DIR); },
        filename: (req, file, cb) => { cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname)); }
    });
}

const upload = multer({ storage: storageEngine });

// Database files verification
const DATA_FILE = path.resolve(__dirname, 'data', 'database.json');
const DATA_DIR = path.resolve(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ notices: [], events: [], enquiries: [], documents: [] }, null, 2));
}

// --- SECURITY MIDDLEWARE ---
function isAdminAuthenticated(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    } else {
        res.send('<script>alert("Access Denied! Please login first."); window.location.href="/login";</script>');
    }
}

// --- CORE VIEW ROUTES ---
app.get('/beyond-academics/:type', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'activity.html')); });
app.get('/campus', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'campus.html')); });
app.get('/', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'index.html')); });
app.get('/about', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'about.html')); });
app.get('/faculty', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'faculty.html')); });
app.get('/contact', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'contact.html')); });
app.get('/gallery', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'gallery.html')); });
app.get('/login', (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'login.html')); });
app.get('/admin', isAdminAuthenticated, (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'admin.html')); });
app.get('/admin/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- BEYOND ACADEMICS DATA API ---
app.get('/api/beyond-academics/:type', (req, res) => {
    const type = req.params.type;
    const dataMatrix = {
        'sports': { title: "Sports & Athletics Arena", description: "At Patliputra Vidyapeeth, we ensure robust physical development through state-of-the-art sports ecosystems.", image: "/images/Outdoor game.png" },
        'music': { title: "Music & Performing Arts Club", description: "Nurturing creative expression and rhythmic brilliance.", image: "/images/music 2.jpeg" },
        'arts': { title: "Fine Arts & Creative Crafts Studio", description: "Fostering visual creativity and aesthetic expression.", image: "/images/Art & Craft.png" },
        'indoor-games': { title: "Strategic Indoor Intelligence Games", description: "Enhancing cognitive capacity and mental calculations.", image: "/images/indoor game.png" }
    };
    const result = dataMatrix[type];
    if (result) return res.json(result);
    else return res.status(404).json({ error: "Activity not found" });
});

// --- GENERAL DATA & POST ROUTES ---
app.get('/api/data', (req, res) => {
    if (fs.existsSync(DATA_FILE)) {
        res.json(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
    } else {
        res.json({ notices: [], events: [], enquiries: [], documents: [] });
    }
});

app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    const correctUsername = process.env.ADMIN_USERNAME;
    if (username !== correctUsername) {
        return res.send('<script>alert("Invalid Username!"); window.location.href="/login";</script>');
    }
    const isPasswordCorrect = bcrypt.compareSync(password, process.env.ADMIN_PASSWORD);
    if (isPasswordCorrect) {
        req.session.isAdmin = true; 
        res.redirect('/admin'); 
    } else {
        res.send('<script>alert("Invalid Password! Try again."); window.location.href="/login";</script>');
    }
});

// --- UPLOAD NOTICE (TEXT ONLY) ---
app.post('/api/admin/upload-notice', isAdminAuthenticated, (req, res) => {
    const { noticeId, title, description } = req.body;
    let localData = { notices: [], events: [], enquiries: [], documents: [] };
    if (fs.existsSync(DATA_FILE)) { localData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }

    if (noticeId) {
        let existingNotice = localData.notices.find(n => n.id === parseInt(noticeId));
        if (existingNotice) {
            existingNotice.title = title;
            existingNotice.description = description;
            existingNotice.date = new Date().toLocaleDateString('en-GB') + ' (Updated)';
        }
    } else {
        localData.notices.push({
            id: Date.now(),
            title,
            description,
            date: new Date().toLocaleDateString('en-GB')
        });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(localData, null, 2));
    res.send('<script>alert("Notice Saved Successfully!"); window.location.href="/admin";</script>');
});

// --- UPLOAD EVENT (PHOTOS MULTIPLE) ---
app.post('/api/admin/upload-event', isAdminAuthenticated, upload.array('eventPhotos', 15), (req, res) => {
    const { eventId, eventTitle, eventDescription } = req.body;
    
    // 🎯 SMART REFACTOR: Local me ye filename/path return karega aur cloud me direct public URL
    const uploadedFiles = req.files ? req.files.map(f => {
        // Agar cloud par hai toh f.path me complete URL hoga, local par hai toh static router mapping lagani hogi
        return f.path.startsWith('http') ? f.path : `/uploads/${f.filename}`;
    }) : [];

    let localData = { notices: [], events: [], enquiries: [], documents: [] };
    if (fs.existsSync(DATA_FILE)) { localData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }

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
        localData.events.push({
            id: Date.now(),
            title: eventTitle.trim(),
            description: eventDescription,
            coverImage: uploadedFiles[0] || '/uploads/default-event.jpg', 
            images: uploadedFiles
        });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(localData, null, 2));
    res.send('<script>alert("Gallery Data Updated Successfully!"); window.location.href="/admin";</script>');
});

// --- SUBMIT ENQUIRY ---
app.post('/api/enquiry/submit', (req, res) => {
    const { parentName, studentName, targetClass, phone, message } = req.body;
    let localData = { notices: [], events: [], enquiries: [], documents: [] };
    if (fs.existsSync(DATA_FILE)) { localData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
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

    fs.writeFileSync(DATA_FILE, JSON.stringify(localData, null, 2));
    res.send('<script>alert("Thank you! Enquiry submitted successfully."); window.location.href = "/";</script>');
});

// --- UPLOAD MANDATORY DISCLOSURE DOCUMENT (SINGLE PDF) ---
app.post('/api/admin/upload-document', isAdminAuthenticated, upload.single('docFile'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded. कृपया सही PDF फ़ाइल चुनें।');
    }

    const category = req.body.category;
    const title = req.body.title;
    
    // 🎯 SMART REFACTOR: Local vs Cloud URL handler
    const fileUrl = req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;

    try {
        let localData = { notices: [], events: [], enquiries: [], documents: [] };
        if (fs.existsSync(DATA_FILE)) { 
            const fileContent = fs.readFileSync(DATA_FILE, 'utf8').trim();
            if (fileContent) localData = JSON.parse(fileContent);
        }
        
        if (!localData.documents) localData.documents = [];

        localData.documents.push({
            id: Date.now(),
            category: category,
            title: title.trim(),
            fileUrl: fileUrl
        });

        fs.writeFileSync(DATA_FILE, JSON.stringify(localData, null, 2));
        res.send('<script>alert("Document Published Successfully!"); window.location.href="/admin";</script>');
    } catch (err) {
        console.error("Database Write Error:", err);
        res.status(500).send("Database transaction crash!");
    }
});

// 🗑️ DELETE API ENGINE
app.delete('/api/admin/delete/:type/:id', isAdminAuthenticated, (req, res) => {
    const { type, id } = req.params;
    if (!fs.existsSync(DATA_FILE)) return res.status(404).json({ message: "Database not found" });

    let localData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const itemId = parseInt(id);

    if (type === 'notice') {
        localData.notices = localData.notices.filter(n => n.id !== itemId);
    } else if (type === 'enquiry') {
        if (localData.enquiries) localData.enquiries = localData.enquiries.filter(e => e.id !== itemId);
    } else if (type === 'event') {
        // Local system cleanup (try-catch wrapper safe for cloud data deletion avoidance)
        const eventToDelete = localData.events.find(e => e.id === itemId);
        if (eventToDelete && eventToDelete.images) {
            eventToDelete.images.forEach(imgUrl => {
                if (!imgUrl.startsWith('http')) { // Sirf local files ko unlink karega
                    const filename = path.basename(imgUrl);
                    const physicalPath = path.join(path.resolve(__dirname, 'public', 'uploads'), filename);
                    try { if (fs.existsSync(physicalPath)) fs.unlinkSync(physicalPath); } catch (err) { console.error(err); }
                }
            });
        }
        localData.events = localData.events.filter(e => e.id !== itemId);
    } else if (type === 'document') {
        if (localData.documents) localData.documents = localData.documents.filter(d => d.id !== itemId);
    } else {
        return res.status(400).json({ message: "Invalid type requested" });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(localData, null, 2));
    res.json({ success: true, message: `Successfully terminated the requested ${type}!` });
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