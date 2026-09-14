const { pool } = require('../config/db');

// ============================================================
// PUBLIC / CUSTOMER — pincode serviceability check
// ============================================================

// Check if a pincode is serviceable (used by address form + checkout)
const checkPincode = async (req, res) => {
    try {
        const { pincode } = req.params;

        if (!pincode || !/^\d{6}$/.test(pincode)) {
            return res.status(400).json({ success: false, message: 'Please provide a valid 6-digit pincode.' });
        }

        const [rows] = await pool.query(
            `SELECT sp.id, sp.pincode, sp.city_town, sp.is_active,
                    sp.delivery_charge_override, sp.min_order_override,
                    d.id AS district_id, d.name AS district_name,
                    z.id AS zone_id, z.name AS zone_name, z.shipping_charge,
                    z.estimated_delivery_days_min, z.estimated_delivery_days_max
             FROM serviceable_pincodes sp
             JOIN rajasthan_districts d ON sp.district_id = d.id
             JOIN delivery_zones z ON sp.delivery_zone_id = z.id
             WHERE sp.pincode = ?`,
            [pincode]
        );

        if (rows.length === 0) {
            return res.json({
                success: true,
                serviceable: false,
                message: 'We do not currently deliver to this pincode.'
            });
        }

        const row = rows[0];

        if (!row.is_active || !row.district_id) {
            return res.json({
                success: true,
                serviceable: false,
                message: 'Delivery to this pincode is temporarily unavailable.'
            });
        }

        return res.json({
            success: true,
            serviceable: true,
            pincode: row.pincode,
            city_town: row.city_town,
            district: { id: row.district_id, name: row.district_name },
            zone: {
                id: row.zone_id,
                name: row.zone_name,
                shipping_charge: row.delivery_charge_override ?? row.shipping_charge,
                estimated_delivery_days_min: row.estimated_delivery_days_min,
                estimated_delivery_days_max: row.estimated_delivery_days_max
            },
            min_order_override: row.min_order_override
        });
    } catch (error) {
        console.error('Check Pincode Error:', error);
        return res.status(500).json({ success: false, message: 'Error checking pincode serviceability.' });
    }
};

// List active Rajasthan districts (for dropdowns)
const getDistricts = async (req, res) => {
    try {
        const [districts] = await pool.query(
            'SELECT id, name FROM rajasthan_districts WHERE is_active = 1 ORDER BY name ASC'
        );
        return res.json({ success: true, districts });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching districts.' });
    }
};

// List active delivery zones (for admin pricing screens / reference)
const getZones = async (req, res) => {
    try {
        const [zones] = await pool.query(
            'SELECT * FROM delivery_zones WHERE is_active = 1 ORDER BY name ASC'
        );
        return res.json({ success: true, zones });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching delivery zones.' });
    }
};

// ============================================================
// ADMIN — manage districts, zones, serviceable pincodes
// ============================================================

const adminGetDistricts = async (req, res) => {
    try {
        const [districts] = await pool.query('SELECT * FROM rajasthan_districts ORDER BY name ASC');
        return res.json({ success: true, districts });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching districts.' });
    }
};

const adminAddDistrict = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ success: false, message: 'District name is required.' });
        }
        const [result] = await pool.query('INSERT INTO rajasthan_districts (name) VALUES (?)', [name.trim()]);
        return res.status(201).json({ success: true, message: 'District added.', districtId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'This district already exists.' });
        }
        return res.status(500).json({ success: false, message: 'Error adding district.' });
    }
};

const adminToggleDistrict = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        await pool.query('UPDATE rajasthan_districts SET is_active = ? WHERE id = ?', [is_active ? 1 : 0, id]);
        return res.json({ success: true, message: 'District updated.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating district.' });
    }
};

const adminGetZones = async (req, res) => {
    try {
        const [zones] = await pool.query('SELECT * FROM delivery_zones ORDER BY name ASC');
        return res.json({ success: true, zones });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching zones.' });
    }
};

const adminAddZone = async (req, res) => {
    try {
        const {
            name,
            shipping_charge,
            estimated_delivery_days_min,
            estimated_delivery_days_max,
            is_active = true
        } = req.body;

        if (!name || shipping_charge === undefined) {
            return res.status(400).json({ success: false, message: 'Zone name and shipping charge are required.' });
        }

        const [result] = await pool.query(
            `INSERT INTO delivery_zones
                (name, shipping_charge, estimated_delivery_days_min, estimated_delivery_days_max, is_active)
             VALUES (?, ?, ?, ?, ?)`,
            [
                name.trim(),
                parseFloat(shipping_charge),
                parseInt(estimated_delivery_days_min || 1),
                parseInt(estimated_delivery_days_max || 3),
                is_active ? 1 : 0
            ]
        );

        return res.status(201).json({ success: true, message: 'Delivery zone created.', zoneId: result.insertId });
    } catch (error) {
        console.error('Add Zone Error:', error);
        return res.status(500).json({ success: false, message: 'Error creating delivery zone.' });
    }
};

const adminUpdateZone = async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await pool.query('SELECT * FROM delivery_zones WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Delivery zone not found.' });
        }
        const curr = existing[0];
        const {
            name,
            shipping_charge,
            estimated_delivery_days_min,
            estimated_delivery_days_max,
            is_active
        } = req.body;

        await pool.query(
            `UPDATE delivery_zones
             SET name = ?, shipping_charge = ?, estimated_delivery_days_min = ?,
                 estimated_delivery_days_max = ?, is_active = ?
             WHERE id = ?`,
            [
                name || curr.name,
                shipping_charge !== undefined ? parseFloat(shipping_charge) : curr.shipping_charge,
                estimated_delivery_days_min !== undefined ? parseInt(estimated_delivery_days_min) : curr.estimated_delivery_days_min,
                estimated_delivery_days_max !== undefined ? parseInt(estimated_delivery_days_max) : curr.estimated_delivery_days_max,
                is_active !== undefined ? (is_active ? 1 : 0) : curr.is_active,
                id
            ]
        );

        return res.json({ success: true, message: 'Delivery zone updated.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating delivery zone.' });
    }
};

// Admin: list serviceable pincodes (optionally filtered by district/zone/search)
const adminGetPincodes = async (req, res) => {
    try {
        const { district_id, zone_id, search } = req.query;
        let whereClauses = [];
        let params = [];

        if (district_id) {
            whereClauses.push('sp.district_id = ?');
            params.push(district_id);
        }
        if (zone_id) {
            whereClauses.push('sp.delivery_zone_id = ?');
            params.push(zone_id);
        }
        if (search) {
            whereClauses.push('(sp.pincode LIKE ? OR sp.city_town LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }

        const whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

        const [pincodes] = await pool.query(
            `SELECT sp.*, d.name AS district_name, z.name AS zone_name
             FROM serviceable_pincodes sp
             JOIN rajasthan_districts d ON sp.district_id = d.id
             JOIN delivery_zones z ON sp.delivery_zone_id = z.id
             ${whereSql}
             ORDER BY sp.pincode ASC`,
            params
        );

        return res.json({ success: true, pincodes });
    } catch (error) {
        console.error('Admin Get Pincodes Error:', error);
        return res.status(500).json({ success: false, message: 'Error fetching pincodes.' });
    }
};

const adminAddPincode = async (req, res) => {
    try {
        const {
            pincode,
            city_town,
            district_id,
            delivery_zone_id,
            delivery_charge_override,
            min_order_override,
            is_active = true
        } = req.body;

        if (!pincode || !/^\d{6}$/.test(pincode)) {
            return res.status(400).json({ success: false, message: 'A valid 6-digit pincode is required.' });
        }
        if (!city_town || !district_id || !delivery_zone_id) {
            return res.status(400).json({ success: false, message: 'City/town, district, and delivery zone are required.' });
        }

        const [result] = await pool.query(
            `INSERT INTO serviceable_pincodes
                (pincode, city_town, district_id, delivery_zone_id, delivery_charge_override, min_order_override, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                pincode,
                city_town.trim(),
                district_id,
                delivery_zone_id,
                delivery_charge_override !== undefined && delivery_charge_override !== '' ? parseFloat(delivery_charge_override) : null,
                min_order_override !== undefined && min_order_override !== '' ? parseFloat(min_order_override) : null,
                is_active ? 1 : 0
            ]
        );

        return res.status(201).json({ success: true, message: 'Pincode added to serviceable area.', pincodeId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ success: false, message: 'This pincode is already configured.' });
        }
        console.error('Add Pincode Error:', error);
        return res.status(500).json({ success: false, message: 'Error adding pincode.' });
    }
};

const adminUpdatePincode = async (req, res) => {
    try {
        const { id } = req.params;
        const [existing] = await pool.query('SELECT * FROM serviceable_pincodes WHERE id = ?', [id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Pincode entry not found.' });
        }
        const curr = existing[0];
        const {
            city_town,
            district_id,
            delivery_zone_id,
            delivery_charge_override,
            min_order_override,
            is_active
        } = req.body;

        await pool.query(
            `UPDATE serviceable_pincodes
             SET city_town = ?, district_id = ?, delivery_zone_id = ?,
                 delivery_charge_override = ?, min_order_override = ?, is_active = ?
             WHERE id = ?`,
            [
                city_town || curr.city_town,
                district_id || curr.district_id,
                delivery_zone_id || curr.delivery_zone_id,
                delivery_charge_override !== undefined ? (delivery_charge_override === '' ? null : parseFloat(delivery_charge_override)) : curr.delivery_charge_override,
                min_order_override !== undefined ? (min_order_override === '' ? null : parseFloat(min_order_override)) : curr.min_order_override,
                is_active !== undefined ? (is_active ? 1 : 0) : curr.is_active,
                id
            ]
        );

        return res.json({ success: true, message: 'Pincode updated.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating pincode.' });
    }
};

const adminDeletePincode = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM serviceable_pincodes WHERE id = ?', [id]);
        return res.json({ success: true, message: 'Pincode removed from serviceable area.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error deleting pincode.' });
    }
};

module.exports = {
    checkPincode,
    getDistricts,
    getZones,
    adminGetDistricts,
    adminAddDistrict,
    adminToggleDistrict,
    adminGetZones,
    adminAddZone,
    adminUpdateZone,
    adminGetPincodes,
    adminAddPincode,
    adminUpdatePincode,
    adminDeletePincode
};