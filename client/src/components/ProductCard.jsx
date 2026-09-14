import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Star, Check } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { resolveMediaUrl } from '../utils/media';

export default function ProductCard({ product }) {
    const { addToCart } = useCart();
    const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
    const [adding, setAdding] = useState(false);

    const inWishlist = isInWishlist(product.id);

    const effectivePrice = product.discount_price ? parseFloat(product.discount_price) : parseFloat(product.price);
    const originalPrice = parseFloat(product.price);
    // available_stock is the wholesale-facing field name from the API;
    // stock_quantity is kept as a fallback for any older cached data shape.
    const availableStock = product.available_stock ?? product.stock_quantity ?? 0;
    const moq = product.minimum_order_quantity || 1;
    const isOutOfStock = availableStock <= 0;
    // Stock can be nonzero but still too low to meet MOQ — that's also
    // effectively "can't order this right now" for a wholesale buyer.
    const belowMoqStock = !isOutOfStock && availableStock < moq;
    const canOrder = !isOutOfStock && !belowMoqStock;

    const handleCartClick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canOrder || adding) return;
        setAdding(true);
        // Wholesale items add at their MOQ, not a flat 1.
        await addToCart(product.id, moq);
        setAdding(false);
    };

    const handleWishlistToggle = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (inWishlist) {
            await removeFromWishlist(product.id);
        } else {
            await addToWishlist(product.id);
        }
    };

    return (
        <div className="group relative bg-white rounded-2xl border border-[#E2DAC8] hover:border-[#1F4D36] hover:shadow-xl transition-all duration-300 flex flex-col overflow-hidden">
            {/* Top Badges */}
            <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
                {product.discount_percentage > 0 && (
                    <span className="px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider rounded-full bg-[#D9760C] text-white shadow-xs">
                        {product.discount_percentage}% OFF
                    </span>
                )}
                {product.is_best_seller === 1 && (
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-emerald-900 text-emerald-200">
                        Best Seller
                    </span>
                )}
            </div>

            {/* Wishlist Button */}
            <button
                onClick={handleWishlistToggle}
                className={`absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    inWishlist
                        ? 'bg-rose-50 text-rose-600 shadow-sm'
                        : 'bg-white/80 text-gray-400 hover:text-rose-500 hover:bg-white shadow-xs'
                }`}
                title={inWishlist ? 'Remove from Wishlist' : 'Add to Wishlist'}
            >
                <Heart className={`w-4 h-4 ${inWishlist ? 'fill-current' : ''}`} />
            </button>

            {/* Product Image Link */}
            <Link to={`/products/${product.slug || product.id}`} className="block relative aspect-4/3 bg-[#FBF8F1] overflow-hidden">
                <img
                    src={resolveMediaUrl(product.thumbnail) || 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400'}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                {isOutOfStock && (
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center">
                        <span className="px-3 py-1 bg-rose-600 text-white font-bold text-xs rounded-full uppercase tracking-wider">
                            Out of Stock
                        </span>
                    </div>
                )}
                {belowMoqStock && (
                    <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center">
                        <span className="px-3 py-1 bg-amber-600 text-white font-bold text-xs rounded-full uppercase tracking-wider text-center">
                            Below MOQ Stock
                        </span>
                    </div>
                )}
            </Link>

            {/* Product Content */}
            <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                    {/* Category & Weight Pill */}
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5 font-medium">
                        <span className="truncate max-w-[120px]">{product.category_name || 'Mandi Item'}</span>
                        <span className="px-2 py-0.5 rounded-full bg-[#F4EEDD] text-[#163326] text-[10px] font-bold">
                            {product.weight || product.unit}
                        </span>
                    </div>

                    {/* Product Name */}
                    <Link to={`/products/${product.slug || product.id}`} className="block">
                        <h3 className="text-sm font-bold text-gray-900 group-hover:text-[#1F4D36] line-clamp-2 transition-colors leading-snug">
                            {product.name}
                        </h3>
                    </Link>

                    {/* Rating Stars */}
                    <div className="flex items-center gap-1 mt-1.5 text-xs text-amber-500">
                        <div className="flex items-center">
                            {[1, 2, 3, 4, 5].map(star => (
                                <Star
                                    key={star}
                                    className={`w-3.5 h-3.5 ${
                                        star <= Math.round(product.avg_rating || 4.5)
                                            ? 'fill-amber-400 text-amber-400'
                                            : 'text-gray-300'
                                    }`}
                                />
                            ))}
                        </div>
                        <span className="text-[11px] font-semibold text-gray-500 ml-1">
                            ({product.review_count || 12})
                        </span>
                    </div>

                    {/* Wholesale info — MOQ & available stock, always visible
                        so it's never ambiguous that this is a bulk platform. */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-full bg-[#FBF3E3] text-[#8A5A17] text-[10px] font-bold border border-[#F0DFB8]">
                            MOQ: {moq} {product.unit}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            belowMoqStock || isOutOfStock
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                            {availableStock} {product.unit} available
                        </span>
                    </div>
                </div>

                {/* Pricing & Add to Cart Footer */}
                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <div>
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-base font-extrabold text-[#163326]">
                                ₹{effectivePrice.toFixed(2)}
                            </span>
                            <span className="text-[11px] text-gray-500 font-medium">
                                / {product.unit}
                            </span>
                        </div>
                        {product.discount_price && (
                            <span className="text-xs text-gray-400 line-through block">
                                ₹{originalPrice.toFixed(2)}
                            </span>
                        )}
                    </div>

                    <button
                        onClick={handleCartClick}
                        disabled={!canOrder || adding}
                        title={belowMoqStock ? `Only ${availableStock} ${product.unit} left — below the ${moq} ${product.unit} MOQ` : undefined}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs ${
                            !canOrder
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-[#1F4D36] text-white hover:bg-[#163326] active:scale-95'
                        }`}
                    >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        {adding ? 'Adding...' : `Add ${moq}`}
                    </button>
                </div>
            </div>
        </div>
    );
}