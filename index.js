require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Cloudinary Storage for Images
const imageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'sokmean_products',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }]
    }
});

// Cloudinary Storage for Raw Files (IPA, ZIP, etc.)
const fileStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'sokmean_files',
        resource_type: 'raw'
    }
});

const uploadImages = multer({ storage: imageStorage });
const uploadFiles = multer({ storage: fileStorage });

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Product Schema
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, default: 'Other' },
    description: { type: String, default: 'No description provided.' },
    price: { type: Number, default: 0 },
    imageUrls: [String],
    fileUrl: String,
    date: { type: String, default: () => new Date().toLocaleDateString() }
});
const Product = mongoose.model('Product', productSchema);

const app = express();
const PORT = process.env.PORT || 3000;

// Settings
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static('public'));

// --- ROUTES ---

// Home Page
app.get('/', async (req, res) => {
    try {
        let query = {};
        const selectedCategory = req.query.cat || 'All';
        if (selectedCategory !== 'All') {
            query.category = selectedCategory;
        }
        const items = await Product.find(query).sort({ _id: -1 });
        res.render('index', { items, selectedCategory });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading products');
    }
});

// About Us Page
app.get('/about', (req, res) => {
    res.render('about');
});

// Product Detail Page
app.get('/product/:id', async (req, res) => {
    try {
        const item = await Product.findById(req.params.id);
        if (!item) return res.redirect('/');
        res.render('product-detail', { item });
    } catch (error) {
        console.error(error);
        res.redirect('/');
    }
});

// Admin Authentication Middleware
const ADMIN_USER = 'SOKMEAN';
const ADMIN_PASS = '12311321';
const AUTH_TOKEN = 'sokmean_admin_secret_2024';

function adminAuth(req, res, next) {
    if (req.cookies.adminToken === AUTH_TOKEN) {
        return next();
    }
    return res.redirect('/login');
}

// Login Page
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

// Login Handler
app.post('/admin-login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
        res.cookie('adminToken', AUTH_TOKEN, { httpOnly: true, maxAge: 60000 });
        return res.redirect('/admin');
    }
    res.render('login', { error: 'Invalid username or password!' });
});

// Logout
app.get('/logout', (req, res) => {
    res.clearCookie('adminToken');
    res.redirect('/');
});

// Admin Dashboard
app.get('/admin', adminAuth, async (req, res) => {
    try {
        const items = await Product.find().sort({ _id: -1 });
        res.render('admin', { items });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading admin');
    }
});

// Handle New Post with Cloudinary Upload (Images + Files)
const memoryUpload = multer({ storage: multer.memoryStorage() });

app.post('/post-item', adminAuth, memoryUpload.fields([
    { name: 'productImages', maxCount: 20 },
    { name: 'myFile', maxCount: 1 }
]), async (req, res) => {
    try {
        const imageUrls = [];
        let fileUrl = null;

        // Upload images to Cloudinary
        if (req.files['productImages']) {
            for (const file of req.files['productImages']) {
                const result = await new Promise((resolve, reject) => {
                    const stream = cloudinary.uploader.upload_stream(
                        { folder: 'sokmean_products', transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }] },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    stream.end(file.buffer);
                });
                imageUrls.push(result.secure_url);
            }
        }

        // Upload file (IPA, etc.) to Cloudinary as raw
        if (req.files['myFile'] && req.files['myFile'][0]) {
            const file = req.files['myFile'][0];
            const result = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: 'sokmean_files', resource_type: 'raw', public_id: file.originalname },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );
                stream.end(file.buffer);
            });
            fileUrl = result.secure_url;
        }

        const newProduct = new Product({
            name: req.body.itemName,
            category: req.body.category || 'Other',
            description: req.body.description || 'No description provided.',
            price: parseFloat(req.body.itemPrice) || 0,
            imageUrls: imageUrls,
            fileUrl: fileUrl
        });

        await newProduct.save();
        res.cookie('adminToken', AUTH_TOKEN, { httpOnly: true, maxAge: 60000 });
        res.status(200).json({ success: true, message: 'Product uploaded successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error uploading product: ' + error.message);
    }
});

// Delete Product
app.post('/delete-item/:id', adminAuth, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.cookie('adminToken', AUTH_TOKEN, { httpOnly: true, maxAge: 60000 });
        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.redirect('/admin');
    }
});

// Update Price
app.post('/update-price/:id', adminAuth, async (req, res) => {
    try {
        const newPrice = parseFloat(req.body.newPrice) || 0;
        await Product.findByIdAndUpdate(req.params.id, { price: newPrice });
        res.cookie('adminToken', AUTH_TOKEN, { httpOnly: true, maxAge: 60000 });
        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.redirect('/admin');
    }
});

app.listen(PORT, () => {
    console.log(`✅ Server live at http://localhost:${PORT}`);
});