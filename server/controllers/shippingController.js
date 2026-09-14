const { pool } = require('../config/db');

// Public/Customer: Get current shipping settings
const getShippingSettings = async (req, res) => {
    try {
        const [settings] = await pool.query('SELECT * FROM shipping_settings WHERE id = 1');
        if (settings.length === 0) {
            return res.json({
                success: true,
                settings: {
                    shipping_charge: 40.00,
                    free_shipping_threshold: 500.00,
                    estimated_delivery_days: 2,
                    cod_enabled: 1,
                    delivery_areas: 'All major cities and mandis'
                }
            });
        }
        return res.json({ success: true, settings: settings[0] });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching shipping settings.' });
    }
};

// Admin: Update shipping settings
const updateShippingSettings = async (req, res) => {
    try {
        const {
            shipping_charge,
            free_shipping_threshold,
            estimated_delivery_days,
            cod_enabled,
            delivery_areas
        } = req.body;

        await pool.query(
            `INSERT INTO shipping_settings (id, shipping_charge, free_shipping_threshold, estimated_delivery_days, cod_enabled, delivery_areas)
             VALUES (1, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                 shipping_charge=VALUES(shipping_charge),
                 free_shipping_threshold=VALUES(free_shipping_threshold),
                 estimated_delivery_days=VALUES(estimated_delivery_days),
                 cod_enabled=VALUES(cod_enabled),
                 delivery_areas=VALUES(delivery_areas)`,
            [
                parseFloat(shipping_charge || 40.00),
                parseFloat(free_shipping_threshold || 500.00),
                parseInt(estimated_delivery_days || 2),
                cod_enabled !== undefined ? (cod_enabled ? 1 : 0) : 1,
                delivery_areas || 'All major mandis'
            ]
        );

        return res.json({ success: true, message: 'Shipping configuration updated successfully!' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error updating shipping configuration.' });
    }
};

module.exports = {
    getShippingSettings,
    updateShippingSettings
};
