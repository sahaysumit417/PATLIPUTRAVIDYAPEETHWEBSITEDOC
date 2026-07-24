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

// 📥 DATA READER
async function getLocalData() {
    const binId = process.env.JSONBIN_BIN_ID;
    const apiKey = process.env.JSONBIN_KEY;
    let baseData = { notices: [], events: [], gallery: [], enquiries: [], documents: [], recentPosts: [] };

    if (binId && apiKey) {
        try {
            const response = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
                headers: { 'X-Master-Key': apiKey }
            });
            if (response.ok) {
                const resData = await response.json();
                return Object.assign(baseData, resData.record || {});
            }
        } catch (err) {
            console.error("❌ Cloud DB Read Error:", err.message);
        }
    }

    if (!fs.existsSync(DATA_FILE)) return baseData;
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        return raw ? Object.assign(baseData, JSON.parse(raw)) : baseData;
    } catch (e) {
        return baseData;
    }
}

// 📤 DATA SAVER
async function saveAndSyncData(data) {
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
            console.log("🎉 Data Cloud DB (JSONBin) Sync Successful!");
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

app.get(['/upcoming-events', '/upcoming-events.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, 'views', 'upcoming-events.html'));
});

app.get(['/recent-events', '/recent-events.html'], (req, res) => {
    res.sendFile(path.resolve(__dirname, 'views', 'recent-events.html'));
});

app.get('/beyond-academics/:type', (req, res) => {res.sendFile(path.resolve(__dirname, 'views', 'activity.html'));});

app.get('/admin', isAdminAuthenticated, (req, res) => { res.sendFile(path.resolve(__dirname, 'views', 'admin.html')); });
app.get('/admin/logout', (req, res) => {req.session.destroy();res.redirect('/');});

// GET Dynamic Data API
app.get('/api/data', async (req, res) => {
    const data = await getLocalData();
    if (!data.notices) data.notices = [];
    if (!data.events) data.events = [];
    if (!data.gallery) data.gallery = [];
    if (!data.enquiries) data.enquiries = [];
    if (!data.documents) data.documents = [];
    if (!data.recentPosts) data.recentPosts = [];
    res.json(data);
});

// 🔐 ADMIN LOGIN
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

// 📌 1. UPLOAD / SAVE NOTICE
app.post('/api/admin/upload-notice', isAdminAuthenticated, async (req, res) => {
    const { noticeId, title, description } = req.body;
    let localData = await getLocalData();

    if (noticeId) {
        let existingNotice = localData.notices.find(n => n.id === parseInt(noticeId));
        if (existingNotice) {
            existingNotice.title = title.trim();
            existingNotice.description = description.trim();
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

// 📰 2. RECENT EVENT POSTS (SIRF RECENT EVENTS PAGE KE LIYE)
app.post('/api/admin/upload-event', isAdminAuthenticated, upload.array('eventPhotos', 2), async (req, res) => {
    try {
        const { eventId, eventTitle, eventDescription } = req.body;
        const uploadedFiles = req.files ? req.files.map(f => f.path || f.secure_url || `/uploads/${f.filename}`) : [];

        let localData = await getLocalData();
        if (!localData.recentPosts) localData.recentPosts = [];

        if (eventId) {
            let existingPost = localData.recentPosts.find(p => p.id === parseInt(eventId));
            if (existingPost) {
                existingPost.title = eventTitle.trim();
                existingPost.description = eventDescription.trim();
                if (uploadedFiles.length > 0) {
                    existingPost.images = uploadedFiles;
                }
            }
        } else {
            localData.recentPosts.push({
                id: Date.now(),
                title: eventTitle.trim(),
                description: eventDescription.trim(),
                images: uploadedFiles,
                date: new Date().toLocaleDateString('en-GB')
            });
        }

        await saveAndSyncData(localData);
        res.send('<script>alert("Recent Event Post Published Successfully!"); window.location.href="/admin";</script>');
    } catch (err) {
        console.error("Post Error:", err);
        res.status(500).send("Failed to save recent post.");
    }
});

// 📸 3. GALLERY ALBUMS UPLOAD (SAVED IN 'events' ARRAY FOR gallery.html)
// app.post('/api/admin/upload-gallery', isAdminAuthenticated, upload.any(), async (req, res) => {
//     try {
//         const galleryId = req.body.galleryId || req.body.eventId;
//         const albumTitle = req.body.albumTitle || req.body.eventTitle || "Gallery Album";
//         const albumDescription = req.body.albumDescription || req.body.eventDescription || "";
        
//         const uploadedFiles = req.files ? req.files.map(f => f.path || f.secure_url || `/uploads/${f.filename}`) : [];

//         let localData = await getLocalData();
//         if (!localData.events) localData.events = [];

//         if (galleryId) {
//             let existingAlbum = localData.events.find(g => g.id === parseInt(galleryId));
//             if (existingAlbum) {
//                 existingAlbum.title = albumTitle.trim();
//                 existingAlbum.description = albumDescription.trim();
//                 if (uploadedFiles.length > 0) {
//                     existingAlbum.images = existingAlbum.images.concat(uploadedFiles);
//                     existingAlbum.coverImage = uploadedFiles[0];
//                 }
//             }
//         } else {
//             localData.events.push({
//                 id: Date.now(),
//                 title: albumTitle.trim(),
//                 description: albumDescription.trim(),
//                 coverImage: uploadedFiles.length > 0 ? uploadedFiles[0] : '/uploads/default-event.jpg',
//                 images: uploadedFiles,
//                 date: new Date().toLocaleDateString('en-GB')
//             });
//         }

//         await saveAndSyncData(localData);
//         res.send('<script>alert("Gallery Photo Album Uploaded Successfully!"); window.location.href="/admin";</script>');
//     } catch (err) {
//         console.error("Gallery Upload Error:", err);
//         res.status(500).send("Failed to upload gallery album.");
//     }
// });
// 📸 3. GALLERY ALBUMS UPLOAD
app.post('/api/admin/upload-gallery', isAdminAuthenticated, upload.any(), async (req, res) => {
    try {
        const galleryId = req.body.galleryId || req.body.eventId;
        const albumTitle = req.body.albumTitle || req.body.eventTitle || "Gallery Album";
        const albumDescription = req.body.albumDescription || req.body.eventDescription || "";
        
        const uploadedFiles = req.files ? req.files.map(f => f.path || f.secure_url || `/uploads/${f.filename}`) : [];

        let localData = await getLocalData();
        if (!localData.events) localData.events = [];

        if (galleryId) {
            let existingAlbum = localData.events.find(g => g.id === parseInt(galleryId));
            if (existingAlbum) {
                existingAlbum.title = albumTitle.trim();
                existingAlbum.description = albumDescription.trim();
                if (uploadedFiles.length > 0) {
                    existingAlbum.images = existingAlbum.images ? existingAlbum.images.concat(uploadedFiles) : uploadedFiles;
                    existingAlbum.coverImage = uploadedFiles[0];
                }
            }
        } else {
            localData.events.push({
                id: Date.now(),
                title: albumTitle.trim(),
                description: albumDescription.trim(),
                coverImage: uploadedFiles.length > 0 ? uploadedFiles[0] : '/uploads/default-event.jpg',
                images: uploadedFiles,
                date: new Date().toLocaleDateString('en-GB')
            });
        }

        await saveAndSyncData(localData);
        res.send('<script>alert("Gallery Photo Album Uploaded Successfully!"); window.location.href="/admin";</script>');
    } catch (err) {
        console.error("Gallery Upload Error:", err);
        res.status(500).send("Failed to upload gallery album.");
    }
});

// 📌 4. ENQUIRIES
app.post('/api/enquiry/submit', async (req, res) => {
    const { parentName, studentName, targetClass, phone, message } = req.body;
    let localData = await getLocalData();
    if (!localData.enquiries) localData.enquiries = [];

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

// 📌 5. DOCUMENTS
app.post('/api/admin/upload-document', isAdminAuthenticated, upload.single('docFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
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

// // 🗑️ DELETE API ENGINE
// app.delete('/api/admin/delete/:type/:id', isAdminAuthenticated, async (req, res) => {
//     const { type, id } = req.params;
//     let localData = await getLocalData();
//     const itemId = parseInt(id);

//     if (type === 'notice') {
//         if (localData.notices) localData.notices = localData.notices.filter(n => n.id !== itemId);
//     } else if (type === 'enquiry') {
//         if (localData.enquiries) localData.enquiries = localData.enquiries.filter(e => e.id !== itemId);
//     } else if (type === 'recentPost') {
//         if (localData.recentPosts) localData.recentPosts = localData.recentPosts.filter(e => e.id !== itemId);
//     } else if (type === 'gallery' || type === 'event' || type === 'events') {
//         // गैलरी और इवेंट्स दोनों Arrays से डिलीट करें
//         if (localData.events) localData.events = localData.events.filter(g => g.id !== itemId);
//         if (localData.gallery) localData.gallery = localData.gallery.filter(g => g.id !== itemId);
//     } else if (type === 'document') {
//         if (localData.documents) localData.documents = localData.documents.filter(d => d.id !== itemId);
//     } else {
//         return res.status(400).json({ message: "Invalid type requested" });
//     }

//     await saveAndSyncData(localData);
//     res.json({ success: true, message: `Successfully deleted ${type}!` });
// });
// 🗑️ DELETE API ENGINE (WITH CLOUDINARY CLEANUP)
app.delete('/api/admin/delete/:type/:id', isAdminAuthenticated, async (req, res) => {
    const { type, id } = req.params;
    let localData = await getLocalData();
    const itemId = parseInt(id);

    if (type === 'notice') {
        if (localData.notices) localData.notices = localData.notices.filter(n => n.id !== itemId);
    
    } else if (type === 'enquiry') {
        if (localData.enquiries) localData.enquiries = localData.enquiries.filter(e => e.id !== itemId);
    
    } else if (type === 'recentPost') {
        if (localData.recentPosts) {
            const post = localData.recentPosts.find(e => e.id === itemId);
            if (post && post.images) {
                // पोस्ट की सभी इमेजेस डिलीट करें
                for (let imgUrl of post.images) {
                    await deleteFromCloudinary(imgUrl);
                }
            }
            localData.recentPosts = localData.recentPosts.filter(e => e.id !== itemId);
        }

    } else if (type === 'gallery' || type === 'event' || type === 'events') {
        const album = (localData.events || []).find(g => g.id === itemId) || (localData.gallery || []).find(g => g.id === itemId);
        if (album && album.images) {
            // गैलरी एलबम की सभी इमेजेस डिलीट करें
            for (let imgUrl of album.images) {
                await deleteFromCloudinary(imgUrl);
            }
        }
        if (localData.events) localData.events = localData.events.filter(g => g.id !== itemId);
        if (localData.gallery) localData.gallery = localData.gallery.filter(g => g.id !== itemId);

    } else if (type === 'document') {
        if (localData.documents) {
            const doc = localData.documents.find(d => d.id === itemId);
            if (doc && doc.fileUrl) {
                // PDF फ़ाइल डिलीट करें
                await deleteFromCloudinary(doc.fileUrl);
            }
            localData.documents = localData.documents.filter(d => d.id !== itemId);
        }

    } else {
        return res.status(400).json({ message: "Invalid type requested" });
    }

    await saveAndSyncData(localData);
    res.json({ success: true, message: `Successfully deleted ${type} and cleaned Cloudinary storage!` });
});
// 🗑️ Helper: Cloudinary से फ़ाइल डिलीट करने का फ़ंक्शन
async function deleteFromCloudinary(fileUrl) {
    if (!fileUrl || !fileUrl.includes('cloudinary.com')) return;

    try {
        // Cloudinary URL से Public ID निकालना
        // Example URL: https://res.cloudinary.com/demo/image/upload/v1234567/folder/sample.jpg
        const parts = fileUrl.split('/');
        const uploadIndex = parts.indexOf('upload');
        
        if (uploadIndex === -1) return;

        // Version (v123456) को छोड़कर पब्लिक आईडी और फ़ाइल एक्सटेंशन निकालना
        const publicIdWithExt = parts.slice(uploadIndex + 2).join('/'); // "folder/sample.jpg"
        const publicId = publicIdWithExt.substring(0, publicIdWithExt.lastIndexOf('.')); // "folder/sample"
        
        // अगर PDF है तो resource_type 'raw' या 'image' हो सकता है
        const isPdf = fileUrl.endsWith('.pdf');
        const resourceType = isPdf ? 'raw' : 'image';

        const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
        console.log(`☁️ Cloudinary Deletion Status (${publicId}):`, result);
    } catch (err) {
        console.error("❌ Cloudinary Delete Error:", err.message);
    }
}



// SERVER LISTEN
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 Patliputra Vidyapeeth Server LIVE on port ${PORT}`);
    console.log(`===================================================`);
});