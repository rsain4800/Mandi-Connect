import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, ShoppingBag, Trash2, ArrowRight } from 'lucide-react';
import { useWishlist } from '../context/WishlistContext';
import { resolveMediaUrl } from '../utils/media';

export default function Wishlist() {
    const { wishlistItems, removeFromWishlist, moveToCart } = useWishlist();

    if (wishlistItems.length === 0) {
        return (
            <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
                <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto">
                    <Heart className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold font-serif text-gray-900">Your Wishlist is Empty</h2>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Explore our mandi catalog and save your favorite seasonal produce for quick access!
                </p>
                <Link
                    to="/products"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#1F4D36] text-white font-bold text-xs rounded-full shadow-md hover:bg-[#163326] transition-all"
                >
                    Browse Produce <ArrowRight className="w-4 h-4" />
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
            <h1 className="text-3xl font-bold font-serif text-[#163326] border-b border-[#E2DAC8] pb-4">
                My Saved Wishlist ({wishlistItems.length})
            </h1>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {wishlistItems.map(item => (
                    <div key={item.id} className="bg-white rounded-2xl border border-[#E2DAC8] p-4 space-y-3 flex flex-col justify-between shadow-xs">
                        <div className="space-y-3">
                            <img
                                src={resolveMediaUrl(item.thumbnail) || 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=300'}
                                alt={item.name}
                                className="w-full h-44 object-cover rounded-xl bg-gray-100"
                            />
                            <div>
                                <Link to={`/products/${item.slug}`} className="text-sm font-bold text-gray-900 hover:text-[#1F4D36] line-clamp-1">
                                    {item.name}
                                </Link>
                                <p className="text-xs text-gray-500 font-medium">₹{item.discount_price || item.price} / {item.unit}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                            <button
                                onClick={() => moveToCart(item.id)}
                                className="flex-1 py-2 bg-[#1F4D36] text-white font-bold text-xs rounded-xl hover:bg-[#163326] flex items-center justify-center gap-1"
                            >
                                <ShoppingBag className="w-3.5 h-3.5" /> Move to Cart
                            </button>
                            <button
                                onClick={() => removeFromWishlist(item.id)}
                                className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl"
                                title="Remove"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
