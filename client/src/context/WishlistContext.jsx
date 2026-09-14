import React, { createContext, useContext, useState, useEffect } from 'react';
import API from '../api/client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { useCart } from './CartContext';

const WishlistContext = createContext();

export const WishlistProvider = ({ children }) => {
    const { isAuthenticated, isCustomer } = useAuth();
    const { showToast } = useToast();
    const { fetchCart } = useCart();
    const [wishlistItems, setWishlistItems] = useState([]);
    const [loading, setLoading] = useState(false);

    const fetchWishlist = async () => {
        if (!isAuthenticated || !isCustomer) {
            setWishlistItems([]);
            return;
        }
        try {
            setLoading(true);
            const res = await API.get('/wishlist');
            if (res.data.success) {
                setWishlistItems(res.data.items);
            }
        } catch (error) {
            console.error('Fetch wishlist error:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWishlist();
    }, [isAuthenticated, isCustomer]);

    const addToWishlist = async (productId) => {
        if (!isAuthenticated) {
            showToast('Please log in to add items to your wishlist.', 'info');
            return false;
        }
        try {
            const res = await API.post('/wishlist/add', { product_id: productId });
            if (res.data.success) {
                showToast(res.data.message || 'Added to wishlist!', 'success');
                await fetchWishlist();
                return true;
            }
        } catch (error) {
            showToast('Error adding to wishlist.', 'error');
            return false;
        }
    };

    const removeFromWishlist = async (productId) => {
        try {
            const res = await API.delete(`/wishlist/${productId}`);
            if (res.data.success) {
                showToast('Removed from wishlist.', 'info');
                await fetchWishlist();
            }
        } catch (error) {
            showToast('Error removing from wishlist.', 'error');
        }
    };

    const moveToCart = async (productId) => {
        try {
            const res = await API.post('/wishlist/move-to-cart', { product_id: productId });
            if (res.data.success) {
                showToast('Moved to cart!', 'success');
                await fetchWishlist();
                await fetchCart();
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Error moving item to cart.', 'error');
        }
    };

    const isInWishlist = (productId) => {
        return wishlistItems.some(item => item.id === productId);
    };

    return (
        <WishlistContext.Provider value={{
            wishlistItems,
            wishlistCount: wishlistItems.length,
            loading,
            addToWishlist,
            removeFromWishlist,
            moveToCart,
            isInWishlist
        }}>
            {children}
        </WishlistContext.Provider>
    );
};

export const useWishlist = () => useContext(WishlistContext);
