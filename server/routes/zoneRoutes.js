const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/zoneController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

// ---------- Public / customer ----------
router.get('/districts', getDistricts);
router.get('/zones', getZones);
router.get('/pincode/:pincode', checkPincode);

// ---------- Admin ----------
router.get('/admin/districts', verifyToken, requireAdmin, adminGetDistricts);
router.post('/admin/districts', verifyToken, requireAdmin, adminAddDistrict);
router.put('/admin/districts/:id/toggle', verifyToken, requireAdmin, adminToggleDistrict);

router.get('/admin/zones', verifyToken, requireAdmin, adminGetZones);
router.post('/admin/zones', verifyToken, requireAdmin, adminAddZone);
router.put('/admin/zones/:id', verifyToken, requireAdmin, adminUpdateZone);

router.get('/admin/pincodes', verifyToken, requireAdmin, adminGetPincodes);
router.post('/admin/pincodes', verifyToken, requireAdmin, adminAddPincode);
router.put('/admin/pincodes/:id', verifyToken, requireAdmin, adminUpdatePincode);
router.delete('/admin/pincodes/:id', verifyToken, requireAdmin, adminDeletePincode);

module.exports = router;