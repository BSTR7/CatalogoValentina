require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { put } = require('@vercel/blob');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'products.json');

app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.static(path.join(__dirname, 'public')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255),
                category VARCHAR(255),
                image TEXT,
                description TEXT,
                tag VARCHAR(255),
                info VARCHAR(255),
                "priceDisplay" VARCHAR(255),
                "priceValue" VARCHAR(255)
            )
        `);
        
        const { rows } = await pool.query('SELECT COUNT(*) FROM products');
        if (parseInt(rows[0].count) === 0) {
            console.log('Migrating initial data from JSON...');
            try {
                if (fs.existsSync(DB_FILE)) {
                    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
                    for (const p of data) {
                        await pool.query(
                            `INSERT INTO products (id, name, category, image, description, tag, info, "priceDisplay", "priceValue") 
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                            [p.id, p.name, p.category, p.image, p.description, p.tag, p.info, p.priceDisplay, p.priceValue]
                        );
                    }
                    console.log('Migration complete.');
                }
            } catch (e) {
                console.error('Error migrating data:', e);
            }
        }
    } catch (err) {
        console.error('Error initializing database:', err);
    }
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
app.get('/api/products', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM products ORDER BY id DESC');
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/products', requireAuth, async (req, res) => {
    try {
        const id = Date.now().toString();
        const { name, category, image, description, tag, info, priceDisplay, priceValue } = req.body;
        
        const { rows } = await pool.query(
            `INSERT INTO products (id, name, category, image, description, tag, info, "priceDisplay", "priceValue") 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [id, name, category, image, description, tag, info, priceDisplay, priceValue]
        );
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.put('/api/products/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, image, description, tag, info, priceDisplay, priceValue } = req.body;
        
        const { rows } = await pool.query(
            `UPDATE products SET name = $1, category = $2, image = $3, description = $4, tag = $5, info = $6, "priceDisplay" = $7, "priceValue" = $8 WHERE id = $9 RETURNING *`,
            [name, category, image, description, tag, info, priceDisplay, priceValue, id]
        );
        
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ error: 'Producto no encontrado' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [id]);
        
        if (rowCount > 0) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Producto no encontrado' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });
    }
});

app.listen(PORT, async () => {
    await initDB();
    console.log(`Server running on http://localhost:${PORT}`);
});
