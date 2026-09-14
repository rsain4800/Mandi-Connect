const express = require('express');
const router = express.Router();
const {
    getAddresses,
    addAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress
} = require('../controllers/addressController');
const { verifyToken } = require('../middleware/authMiddleware');
const { addressValidation, idParamValidation } = require('../validators');

router.use(verifyToken);

router.get('/', getAddresses);
router.post('/', addressValidation, addAddress);
router.put('/:id', idParamValidation, addressValidation, updateAddress);
router.delete('/:id', idParamValidation, deleteAddress);
router.put('/:id/default', idParamValidation, setDefaultAddress);

module.exports = router;