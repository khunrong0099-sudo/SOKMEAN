const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const sharp = require('sharp');

// 1. Setup Database
const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({ items: [] }).write();

const app = express();
const PORT = process.env.PORT || 3000;

// 2. Setup File Uploads (Memory for Sharp processing)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// 3. Settings
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/downloads', express.static('uploads'));

if (!fs.existsSync('./uploads')) { fs.mkdirSync('./uploads'); }

// --- ROUTES ---

// Home Page
app.get('/', (req, res) => {
    let items = db.get('items').value();
    const selectedCategory = req.query.cat || 'All';
    if (selectedCategory !== 'All') {
        items = items.filter(item => item.category === selectedCategory);
    }
    res.render('index', { items, selectedCategory });
});

// About Us Page
app.get('/about', (req, res) => {
    res.render('about');
});

// Product Detail Page
app.get('/product/:id', (req, res) => {
    const item = db.get('items').find({ id: req.params.id }).value();
    if (!item) return res.redirect('/');
    res.render('product-detail', { item });
});

// Admin Authentication Middleware
const ADMIN_USER = 'SOKMEAN';
const ADMIN_PASS = 'sokmean12311321'; // Change this password!

function adminAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Authentication required');
    }
    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const user = auth[0];
    const pass = auth[1];
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Invalid credentials');
}

// Admin Dashboard (Protected)
app.get('/admin', adminAuth, (req, res) => {
    const items = db.get('items').value();
    res.render('admin', { items });
});

// Handle New Post with Optimization (Protected)
app.post('/post-item', adminAuth, upload.fields([
    { name: 'productImages', maxCount: 20 },
    { name: 'myFile', maxCount: 1 }
]), async (req, res) => {
    try {
        const files = req.files;
        const imageList = [];
        if (files['productImages']) {
            for (const file of files['productImages']) {
                const filename = Date.now() + '-' + Math.round(Math.random() * 1E9) + '.webp';
                await sharp(file.buffer)
                    .resize(1200, null, { withoutEnlargement: true })
                    .webp({ quality: 80 })
                    .toFile(path.join(__dirname, 'uploads', filename));
                imageList.push(filename);
            }
        }
        let downloadFileName = null;
        if (files['myFile']) {
            const file = files['myFile'][0];
            downloadFileName = Date.now() + '-' + file.originalname;
            fs.writeFileSync(path.join(__dirname, 'uploads', downloadFileName), file.buffer);
        }
        const newItem = {
            id: Date.now().toString(),
            name: req.body.itemName,
            category: req.body.category || 'Other',
            description: req.body.description || 'No description provided.',
            price: parseFloat(req.body.itemPrice) || 0,
            imageNames: imageList,
            fileName: downloadFileName,
            date: new Date().toLocaleDateString()
        };
        db.get('items').push(newItem).write();
        res.redirect('/');
    } catch (error) {
        console.error(error);
        res.status(500).send("Error uploading.");
    }
});

app.post('/delete-item/:id', adminAuth, (req, res) => {
    db.get('items').remove({ id: req.params.id }).write();
    res.redirect('/admin');
});

app.listen(PORT, () => {
    console.log(`✅ Server live at http://localhost:${PORT}`);
});