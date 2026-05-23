require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { put } = require('@vercel/blob');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'products.json');

app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.static(path.join(__dirname, 'public')));

// Helper to read DB
const readDB = () => {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
};

// Helper to write DB
const writeDB = (data) => {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
};

// --- AUTH MIDDLEWARE ---
const requireAuth = (req, res, next) => {
    if (req.signedCookies.auth === 'true') {
        next();
    } else {
        res.status(401).json({ error: 'No autorizado' });
    }
};

// --- AUTH ROUTES ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
        res.cookie('auth', 'true', { signed: true, httpOnly: true });
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'Credenciales inválidas' });
    }
});

app.post('/api/logout', (req, res) => {
    res.clearCookie('auth');
    res.json({ success: true });
});

app.get('/api/check-auth', (req, res) => {
    if (req.signedCookies.auth === 'true') {
        res.json({ authenticated: true });
    } else {
        res.json({ authenticated: false });
    }
});

// --- UPLOAD ROUTE ---
const upload = multer();
app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image provided' });
        }
        
        const blob = await put(`images/${Date.now()}-${req.file.originalname}`, req.file.buffer, {
            access: 'public',
        });
        
        res.json({ url: blob.url });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Error uploading image' });
    }
});

// --- PRODUCT ROUTES ---
app.get('/api/products', (req, res) => {
    const products = readDB();
    res.json(products);
});

app.post('/api/products', requireAuth, (req, res) => {
    const products = readDB();
    const newProduct = {
        id: Date.now().toString(),
        ...req.body
    };
    products.push(newProduct);
    writeDB(products);
    res.status(201).json(newProduct);
});

app.put('/api/products/:id', requireAuth, (req, res) => {
    const products = readDB();
    const index = products.findIndex(p => p.id === req.params.id);
    if (index !== -1) {
        products[index] = { ...products[index], ...req.body, id: req.params.id };
        writeDB(products);
        res.json(products[index]);
    } else {
        res.status(404).json({ error: 'Producto no encontrado' });
    }
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
    const products = readDB();
    const filteredProducts = products.filter(p => p.id !== req.params.id);
    if (products.length !== filteredProducts.length) {
        writeDB(filteredProducts);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Producto no encontrado' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
