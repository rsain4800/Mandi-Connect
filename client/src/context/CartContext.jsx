import React, { createContext, useContext, useState, useEffect } from 'react';
import API from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const CartContext = createContext();

export const CartProvider = ({ children }) => {
    const { isAuthenticated, isCustomer } = useAuth();
    const { showToast } = useToast();
    const [cartItems, setCartItems] = useState([]);
    const [subtotal, setSubtotal] = useState(0);
    const [loading, setLoading] = useState(false);

    const fetchCart = async () => {
        if (!isAuthenticated || !isCustomer) {
            setCartItems([]);
            setSubtotal(0);
            return;
        }
        try {
            setLoading(true);
            const res = await API.get('/cart');
            if (res.data.success) {
                setCartItems(res.data.cart.items);
                setSubtotal(res.data.cart.subtotal);
            }
        } catch (error) {
            console.error('Fetch cart error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCart();
    }, [isAuthenticated, isCustomer]);

    const addToCart = async (productId, quantity) => {
        if (!isAuthenticated) {
            showToast('Please log in to add items to your cart.', 'info');
            return false;
        }
        try {
            // quantity is optional — when omitted, the backend adds at the
            // product's own minimum order quantity (MOQ) rather than a flat 1,
            // since a wholesale item can't meaningfully be "added" below MOQ.
            const payload = { product_id: productId };
            if (quantity !== undefined) payload.quantity = quantity;
            const res = await API.post('/cart/add', payload);
            if (res.data.success) {
                showToast(res.data.message || 'Item added to cart!', 'success');
                await fetchCart();
                return true;
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Error adding item to cart.', 'error');
            return false;
        }
    };

    const updateQuantity = async (itemId, newQuantity) => {
        try {
            const res = await API.put('/cart/update', { item_id: itemId, quantity: newQuantity });
            if (res.data.success) {
                await fetchCart();
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Error updating quantity.', 'error');
        }
    };

    const removeFromCart = async (itemId) => {
        try {
            const res = await API.delete(`/cart/item/${itemId}`);
            if (res.data.success) {
                showToast('Item removed from cart.', 'info');
                await fetchCart();
            }
        } catch (error) {
            showToast('Error removing item.', 'error');
        }
    };

    const clearCart = async () => {
        try {
            await API.delete('/cart/clear');
            setCartItems([]);
            setSubtotal(0);
        } catch (error) {
            console.error('Clear cart error:', error);
        }
    };

    const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <CartContext.Provider value={{
            cartItems,
            subtotal,
            cartCount,
            loading,
            fetchCart,
            addToCart,
            updateQuantity,
            removeFromCart,
            clearCart
        }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => useContext(CartContext);