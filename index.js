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

// Cloudinary Storage for Multer
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'sokmean_products',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }]
    }
});
const upload = multer({ storage: storage });

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

// Handle New Post with Cloudinary Upload
app.post('/post-item', adminAuth, upload.array('productImages', 20), async (req, res) => {
    try {
        const imageUrls = req.files ? req.files.map(file => file.path) : [];

        const newProduct = new Product({
            name: req.body.itemName,
            category: req.body.category || 'Other',
            description: req.body.description || 'No description provided.',
            price: parseFloat(req.body.itemPrice) || 0,
            imageUrls: imageUrls
        });

        await newProduct.save();
        res.cookie('adminToken', AUTH_TOKEN, { httpOnly: true, maxAge: 60000 });
        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send('Error uploading product');
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