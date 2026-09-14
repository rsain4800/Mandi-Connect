const { pool } = require('../config/db');
const { validateDeliveryLocation } = require('../services/shippingService');

// Get all saved user addresses
const getAddresses = async (req, res) => {
    try {
        const [addresses] = await pool.query(
            'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC',
            [req.user.id]
        );
        return res.json({ success: true, addresses });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching addresses.' });
    }
};

// Add Address — Rajasthan-only, server-validated against serviceable_pincodes
const addAddress = async (req, res) => {
    try {
        const {
            full_name,
            business_name,
            phone,
            alternate_phone,
            house_building,
            street,
            area,
            city,
            state,
            pincode,
            landmark,
            gstin,
            address_type = 'home',
            is_default = false
        } = req.body;

        if (!full_name || !phone || !house_building || !street || !area || !city || !state || !pincode) {
            return res.status(400).json({ success: false, message: 'Please provide all required address fields.' });
        }

        // SERVER-SIDE ENFORCEMENT — never trust the frontend for this
        const locationCheck = await validateDeliveryLocation(state, pincode);
        if (!locationCheck.valid) {
            return res.status(400).json({ success: false, message: locationCheck.message });
        }

        // If this is set to default, unset previous default
        if (is_default) {
            await pool.query('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
        }

        // If user has no addresses, make this default automatically
        const [existing] = await pool.query('SELECT id FROM addresses WHERE user_id = ?', [req.user.id]);
        const makeDefault = is_default || existing.length === 0 ? 1 : 0;

        const [result] = await pool.query(
            `INSERT INTO addresses (
                user_id, full_name, business_name, phone, alternate_phone,
                house_building, street, area, city, district, state, pincode,
                landmark, gstin, serviceable_pincode_id, address_type, is_default
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id, full_name, business_name || null, phone, alternate_phone || null,
                house_building, street, area, city, locationCheck.district.name,
                'Rajasthan', pincode, landmark || null, gstin || null,
                locationCheck.pincodeRow.id, address_type, makeDefault
            ]
        );

        return res.status(201).json({
            success: true,
            message: 'Address added successfully!',
            address_id: result.insertId,
            zone: locationCheck.zone
        });
    } catch (error) {
        console.error('Add Address Error:', error);
        return res.status(500).json({ success: false, message: 'Error adding address.' });
    }
};

// Update Address — re-validates Rajasthan/pincode if either changes
const updateAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        const {
            full_name,
            business_name,
            phone,
            alternate_phone,
            house_building,
            street,
            area,
            city,
            state,
            pincode,
            landmark,
            gstin,
            address_type,
            is_default
        } = req.body;

        const [existing] = await pool.query('SELECT * FROM addresses WHERE id = ? AND user_id = ?', [addressId, req.user.id]);
        if (existing.length === 0) {
            return res.status(404).json({ success: false, message: 'Address not found.' });
        }
        const curr = existing[0];

        const nextState = state || curr.state;
        const nextPincode = pincode || curr.pincode;

        let districtName = curr.district;
        let serviceablePincodeId = curr.serviceable_pincode_id;

        // Only re-run the location check if state or pincode actually changed
        if (state || pincode) {
            const locationCheck = await validateDeliveryLocation(nextState, nextPincode);
            if (!locationCheck.valid) {
                return res.status(400).json({ success: false, message: locationCheck.message });
            }
            districtName = locationCheck.district.name;
            serviceablePincodeId = locationCheck.pincodeRow.id;
        }

        if (is_default) {
            await pool.query('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
        }

        await pool.query(
            `UPDATE addresses
             SET full_name = ?, business_name = ?, phone = ?, alternate_phone = ?,
                 house_building = ?, street = ?, area = ?, city = ?, district = ?,
                 state = ?, pincode = ?, landmark = ?, gstin = ?, serviceable_pincode_id = ?,
                 address_type = ?, is_default = ?
             WHERE id = ? AND user_id = ?`,
            [
                full_name || curr.full_name,
                business_name !== undefined ? business_name : curr.business_name,
                phone || curr.phone,
                alternate_phone !== undefined ? alternate_phone : curr.alternate_phone,
                house_building || curr.house_building,
                street || curr.street,
                area || curr.area,
                city || curr.city,
                districtName,
                'Rajasthan',
                nextPincode,
                landmark !== undefined ? landmark : curr.landmark,
                gstin !== undefined ? gstin : curr.gstin,
                serviceablePincodeId,
                address_type || curr.address_type,
                is_default !== undefined ? (is_default ? 1 : 0) : curr.is_default,
                addressId,
                req.user.id
            ]
        );

        return res.json({ success: true, message: 'Address updated successfully.' });
    } catch (error) {
        console.error('Update Address Error:', error);
        return res.status(500).json({ success: false, message: 'Error updating address.' });
    }
};

// Delete Address
const deleteAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        await pool.query('DELETE FROM addresses WHERE id = ? AND user_id = ?', [addressId, req.user.id]);
        return res.json({ success: true, message: 'Address deleted.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error deleting address.' });
    }
};

// Set Address as Default
const setDefaultAddress = async (req, res) => {
    try {
        const addressId = req.params.id;
        await pool.query('UPDATE addresses SET is_default = 0 WHERE user_id = ?', [req.user.id]);
        await pool.query('UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?', [addressId, req.user.id]);
        return res.json({ success: true, message: 'Default address updated.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error setting default address.' });
    }
};

module.exports = {
    getAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress
};