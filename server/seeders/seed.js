require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

const seed = async () => {
    try {
        console.log('🌱 Starting Database Seeding...');

        // Schema is applied via migrations now, not here.
        // Run `npm run migrate` before seeding if you haven't already.

        const connection = await pool.getConnection();

        // 1. Seed Single Admin Account
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@mandiconnect.com';
        const adminPass = process.env.ADMIN_PASSWORD || 'AdminPass@123456';
        const hashedAdminPass = await bcrypt.hash(adminPass, 10);

        const [existingAdmin] = await connection.query(
            'SELECT id FROM users WHERE role = ? OR email = ?',
            ['admin', adminEmail]
        );

        if (existingAdmin.length === 0) {
            await connection.query(
                `INSERT INTO users (full_name, email, phone, password, role, is_active)
                 VALUES (?, ?, ?, ?, 'admin', 1)`,
                ['Mandi Connect Admin', adminEmail, '9876543210', hashedAdminPass]
            );
            console.log(`✅ Single Admin Account Created: ${adminEmail}`);
        } else {
            // Update admin credentials to sync with env
            await connection.query(
                `UPDATE users SET password = ?, email = ? WHERE role = 'admin'`,
                [hashedAdminPass, adminEmail]
            );
            console.log(`✅ Single Admin Account Updated: ${adminEmail}`);
        }

        // 2. Seed Categories
        const categories = [
            { name: 'Potatoes & Onions', slug: 'potatoes-onions', description: 'Fresh staple mandi onions, potatoes, and garlic', image: '/uploads/categories/onion.jpg' },
            { name: 'Vegetables', slug: 'vegetables', description: 'Farm-fresh green and root vegetables', image: '/uploads/categories/vegetables.jpg' },
            { name: 'Fruits', slug: 'fruits', description: 'Juicy, fresh seasonal and orchard fruits', image: '/uploads/categories/fruits.jpg' },
            { name: 'Leafy Vegetables', slug: 'leafy-vegetables', description: 'Nutritious fresh greens like spinach, coriander, and methi', image: '/uploads/categories/leafy.jpg' },
            { name: 'Seasonal Products', slug: 'seasonal-products', description: 'Special seasonal produce straight from regional mandis', image: '/uploads/categories/seasonal.jpg' },
            { name: 'Groceries', slug: 'groceries', description: 'Essential grains, pulses, spices, and mandi staples', image: '/uploads/categories/groceries.jpg' },
            { name: 'Organic Products', slug: 'organic-products', description: '100% Certified chemical-free organic produce', image: '/uploads/categories/organic.jpg' }
        ];

        for (const cat of categories) {
            await connection.query(
                `INSERT INTO categories (name, slug, description, image)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE description=VALUES(description), image=VALUES(image)`,
                [cat.name, cat.slug, cat.description, cat.image]
            );
        }
        console.log('✅ Categories Seeded');

        // Fetch category IDs
        const [catRows] = await connection.query('SELECT id, slug FROM categories');
        const catMap = {};
        catRows.forEach(c => catMap[c.slug] = c.id);

        // 3. Seed Products
        const products = [
            {
                // Matches the Phase 3 spec's worked example exactly:
                // Onion, Unit: Quintal, MOQ: 5, with 3 wholesale price tiers.
                name: 'Nashik Red Onions (Pyaz)',
                slug: 'nashik-red-onions',
                sku: 'MND-ONN-001',
                description: 'Premium quality red onions sourced directly from Nashik Mandi. Crisp, pungent, and long shelf life. Sold wholesale by the quintal.',
                category_id: catMap['potatoes-onions'],
                subcategory: 'Onions',
                brand: 'Nashik Mandi Direct',
                price: 3500.00,
                discount_price: 3200.00,
                discount_percentage: 9,
                stock_quantity: 300,
                unit: 'quintal',
                weight: '1 Quintal (100 kg)',
                minimum_order_quantity: 5,
                maximum_order_quantity: 200,
                grade: 'A',
                quality: 'Premium',
                origin: 'Maharashtra',
                origin_district: 'Nashik',
                origin_mandi: 'Nashik APMC Mandi',
                thumbnail: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80',
                is_featured: 1,
                is_best_seller: 1,
                priceTiers: [
                    { min_quantity: 5, max_quantity: 20, price: 3200.00 },
                    { min_quantity: 21, max_quantity: 50, price: 3000.00 },
                    { min_quantity: 51, max_quantity: null, price: 2800.00 }
                ]
            },
            {
                name: 'Jyoti Potatoes (Aloo)',
                slug: 'jyoti-potatoes-aloo',
                sku: 'MND-POT-002',
                description: 'High quality dirt-free Jyoti potatoes, ideal for everyday cooking, curries, and fries. Sold wholesale by the kg.',
                category_id: catMap['potatoes-onions'],
                subcategory: 'Potatoes',
                brand: 'Agra Mandi Direct',
                price: 30.00,
                discount_price: 24.00,
                discount_percentage: 20,
                stock_quantity: 800,
                unit: 'kg',
                weight: '1 kg',
                minimum_order_quantity: 25,
                maximum_order_quantity: null,
                grade: 'A',
                origin_district: 'Agra',
                origin_mandi: 'Agra Mandi',
                thumbnail: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=600&q=80',
                is_featured: 1,
                is_best_seller: 1
            },
            {
                name: 'Fresh Farm Red Tomatoes (Tamatar)',
                slug: 'fresh-red-tomatoes',
                sku: 'MND-TOM-003',
                description: 'Firm, ripe, juicy red tomatoes picked fresh from farm fields. Sold wholesale by the kg.',
                category_id: catMap['vegetables'],
                subcategory: 'Tomatoes',
                brand: 'Kolar Fresh',
                price: 45.00,
                discount_price: 38.00,
                discount_percentage: 15,
                stock_quantity: 350,
                unit: 'kg',
                weight: '1 kg',
                minimum_order_quantity: 20,
                maximum_order_quantity: null,
                thumbnail: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80',
                is_featured: 1,
                is_best_seller: 1
            },
            {
                name: 'Organic Spinach (Palak)',
                slug: 'organic-spinach-palak',
                sku: 'MND-SPN-004',
                description: 'Tender green organic spinach leaves, washed and chemical-free. Sold wholesale in 250g packs.',
                category_id: catMap['leafy-vegetables'],
                subcategory: 'Greens',
                brand: 'Green Earth Farm',
                price: 25.00,
                discount_price: 20.00,
                discount_percentage: 20,
                stock_quantity: 150,
                unit: 'gram',
                weight: '250 g',
                minimum_order_quantity: 10,
                maximum_order_quantity: null,
                thumbnail: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=600&q=80',
                is_featured: 1,
                is_best_seller: 0
            },
            {
                name: 'Fresh Alphonso Mangoes (Hapus)',
                slug: 'fresh-alphonso-mangoes',
                sku: 'MND-MNG-005',
                description: 'Original Ratnagiri Alphonso mangoes, naturally ripened and intensely sweet. Sold wholesale by the dozen.',
                category_id: catMap['fruits'],
                subcategory: 'Mangoes',
                brand: 'Ratnagiri Orchards',
                price: 850.00,
                discount_price: 699.00,
                discount_percentage: 18,
                stock_quantity: 80,
                unit: 'dozen',
                weight: '1 Dozen',
                minimum_order_quantity: 2,
                maximum_order_quantity: 30,
                grade: 'Premium',
                origin: 'Maharashtra',
                origin_district: 'Ratnagiri',
                thumbnail: 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=600&q=80',
                is_featured: 1,
                is_best_seller: 1
            },
            {
                name: 'Green Peas Crate (Fresh Matar)',
                slug: 'green-peas-crate',
                sku: 'MND-PEA-006',
                description: 'Bulk fresh sweet green pea pod crate directly from Himachal mandi. Sold wholesale by the crate.',
                category_id: catMap['seasonal-products'],
                subcategory: 'Peas',
                brand: 'Himachal Mandi',
                price: 1200.00,
                discount_price: 999.00,
                discount_percentage: 16,
                stock_quantity: 40,
                unit: 'crate',
                weight: '10 kg Crate',
                minimum_order_quantity: 2,
                maximum_order_quantity: null,
                thumbnail: 'https://images.unsplash.com/photo-1587735243615-c03f25aaff15?auto=format&fit=crop&w=600&q=80',
                is_featured: 0,
                is_best_seller: 1
            },
            {
                name: 'Premium Sharbati Wheat (Atta)',
                slug: 'sharbati-wheat-atta-10kg',
                sku: 'MND-WHT-007',
                description: '100% pure MP Sharbati wheat flour, stone-ground for soft rotis. Sold wholesale by the 10kg bag.',
                category_id: catMap['groceries'],
                subcategory: 'Atta & Flours',
                brand: 'Mandi Select',
                price: 480.00,
                discount_price: 420.00,
                discount_percentage: 12,
                stock_quantity: 200,
                unit: 'bag',
                weight: '10 kg',
                minimum_order_quantity: 5,
                maximum_order_quantity: 100,
                thumbnail: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80',
                is_featured: 1,
                is_best_seller: 0,
                priceTiers: [
                    { min_quantity: 5, max_quantity: 19, price: 420.00 },
                    { min_quantity: 20, max_quantity: 49, price: 400.00 },
                    { min_quantity: 50, max_quantity: null, price: 375.00 }
                ]
            },
            {
                name: 'Organic Desi Cow Ghee 1L',
                slug: 'organic-desi-cow-ghee-1l',
                sku: 'MND-GHE-008',
                description: 'Bilona method traditional A2 cow ghee, aromatic and rich in health benefits. Sold wholesale by the piece.',
                category_id: catMap['organic-products'],
                subcategory: 'Dairy & Ghee',
                brand: 'Pure Veda Organic',
                price: 1100.00,
                discount_price: 949.00,
                discount_percentage: 14,
                stock_quantity: 60,
                unit: 'piece',
                weight: '1 Litre',
                minimum_order_quantity: 3,
                maximum_order_quantity: null,
                thumbnail: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=600&q=80',
                is_featured: 1,
                is_best_seller: 1
            }
        ];

        for (const prod of products) {
            const [insertResult] = await connection.query(
                `INSERT INTO products (
                    name, slug, sku, description, category_id, subcategory, brand,
                    price, discount_price, discount_percentage, stock_quantity,
                    unit, weight, minimum_order_quantity, maximum_order_quantity,
                    grade, quality, origin, origin_district, origin_mandi,
                    thumbnail, is_active, is_featured, is_best_seller
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                ON DUPLICATE KEY UPDATE
                    price=VALUES(price), discount_price=VALUES(discount_price),
                    stock_quantity=VALUES(stock_quantity), thumbnail=VALUES(thumbnail),
                    minimum_order_quantity=VALUES(minimum_order_quantity),
                    maximum_order_quantity=VALUES(maximum_order_quantity),
                    id=LAST_INSERT_ID(id)`,
                [
                    prod.name, prod.slug, prod.sku, prod.description, prod.category_id,
                    prod.subcategory, prod.brand, prod.price, prod.discount_price,
                    prod.discount_percentage, prod.stock_quantity, prod.unit, prod.weight,
                    prod.minimum_order_quantity || 1, prod.maximum_order_quantity || null,
                    prod.grade || null, prod.quality || null, prod.origin || null,
                    prod.origin_district || null, prod.origin_mandi || null,
                    prod.thumbnail, prod.is_featured, prod.is_best_seller
                ]
            );

            if (prod.priceTiers && prod.priceTiers.length > 0) {
                const productId = insertResult.insertId;
                await connection.query('DELETE FROM product_price_tiers WHERE product_id = ?', [productId]);
                for (const tier of prod.priceTiers) {
                    await connection.query(
                        'INSERT INTO product_price_tiers (product_id, min_quantity, max_quantity, price) VALUES (?, ?, ?, ?)',
                        [productId, tier.min_quantity, tier.max_quantity, tier.price]
                    );
                }
            }
        }
        console.log('✅ Mandi Products Seeded (with MOQ & wholesale price tiers)');

        // 3b. Seed Rajasthan Districts, Delivery Zones & Serviceable Pincodes
        // Without this, the address/checkout flow is untestable on a fresh
        // dev database: addressController.addAddress() calls
        // validateDeliveryLocation(), which requires a matching row in
        // serviceable_pincodes (joined to rajasthan_districts and
        // delivery_zones) before it will accept ANY address — so a
        // freshly-migrated-but-not-seeded DB could never have an address
        // added, and checkout could never be reached end-to-end.
        const districts = ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer'];
        const districtMap = {};
        for (const name of districts) {
            await connection.query(
                'INSERT INTO rajasthan_districts (name) VALUES (?) ON DUPLICATE KEY UPDATE name=VALUES(name)',
                [name]
            );
        }
        const [districtRows] = await connection.query('SELECT id, name FROM rajasthan_districts');
        districtRows.forEach((d) => { districtMap[d.name] = d.id; });

        const zones = [
            { name: 'Zone A - City Core', shipping_charge: 30.00, days_min: 1, days_max: 2 },
            { name: 'Zone B - Extended Metro', shipping_charge: 50.00, days_min: 2, days_max: 4 },
            { name: 'Zone C - Rural Rajasthan', shipping_charge: 80.00, days_min: 3, days_max: 6 }
        ];
        const zoneMap = {};
        for (const z of zones) {
            await connection.query(
                `INSERT INTO delivery_zones (name, shipping_charge, estimated_delivery_days_min, estimated_delivery_days_max)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE shipping_charge=VALUES(shipping_charge)`,
                [z.name, z.shipping_charge, z.days_min, z.days_max]
            );
        }
        const [zoneRows] = await connection.query('SELECT id, name FROM delivery_zones');
        zoneRows.forEach((z) => { zoneMap[z.name] = z.id; });

        // A small starter set of real Rajasthan pincodes across the three
        // zones, enough to exercise the full address -> checkout path in
        // development. Expand via the admin pincode screens for real launch.
        const pincodes = [
            { pincode: '302001', city_town: 'Jaipur (Sanganeri Gate)', district: 'Jaipur', zone: 'Zone A - City Core' },
            { pincode: '302015', city_town: 'Jaipur (Malviya Nagar)', district: 'Jaipur', zone: 'Zone A - City Core' },
            { pincode: '342001', city_town: 'Jodhpur (Ratanada)', district: 'Jodhpur', zone: 'Zone B - Extended Metro' },
            { pincode: '313001', city_town: 'Udaipur (City Station)', district: 'Udaipur', zone: 'Zone B - Extended Metro' },
            { pincode: '324001', city_town: 'Kota (Vigyan Nagar)', district: 'Kota', zone: 'Zone B - Extended Metro' },
            { pincode: '305001', city_town: 'Ajmer (Kutchery Road)', district: 'Ajmer', zone: 'Zone C - Rural Rajasthan' }
        ];
        for (const p of pincodes) {
            await connection.query(
                `INSERT INTO serviceable_pincodes (pincode, city_town, district_id, delivery_zone_id)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE city_town=VALUES(city_town), district_id=VALUES(district_id), delivery_zone_id=VALUES(delivery_zone_id)`,
                [p.pincode, p.city_town, districtMap[p.district], zoneMap[p.zone]]
            );
        }
        console.log('✅ Rajasthan Districts, Delivery Zones & Serviceable Pincodes Seeded');

        // 4. Seed Shipping Settings
        await connection.query(
            `INSERT INTO shipping_settings (id, shipping_charge, free_shipping_threshold, estimated_delivery_days, cod_enabled, delivery_areas)
             VALUES (1, 40.00, 500.00, 2, 1, 'All major cities and rural mandis')
             ON DUPLICATE KEY UPDATE shipping_charge=VALUES(shipping_charge), free_shipping_threshold=VALUES(free_shipping_threshold)`
        );
        console.log('✅ Shipping Settings Seeded');

        // 5. Seed Coupons
        const coupons = [
            {
                code: 'MANDI100',
                discount_type: 'fixed',
                discount_value: 100.00,
                min_order_amount: 499.00,
                max_discount: 100.00,
                start_date: '2026-01-01',
                expiry_date: '2027-12-31',
                usage_limit: 500,
                per_user_limit: 2
            },
            {
                code: 'FRESH20',
                discount_type: 'percentage',
                discount_value: 20.00,
                min_order_amount: 299.00,
                max_discount: 150.00,
                start_date: '2026-01-01',
                expiry_date: '2027-12-31',
                usage_limit: 1000,
                per_user_limit: 5
            }
        ];

        for (const c of coupons) {
            await connection.query(
                `INSERT INTO coupons (code, discount_type, discount_value, min_order_amount, max_discount, start_date, expiry_date, usage_limit, per_user_limit, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE discount_value=VALUES(discount_value)`,
                [c.code, c.discount_type, c.discount_value, c.min_order_amount, c.max_discount, c.start_date, c.expiry_date, c.usage_limit, c.per_user_limit]
            );
        }
        console.log('✅ Coupons Seeded');

        connection.release();
        console.log('🎉 Database Seeding Completed Successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding Failed:', error);
        process.exit(1);
    }
};

seed();