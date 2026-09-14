import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Star, ShoppingBag, Heart, ShieldCheck, Truck, RotateCcw, Plus, Minus, Check, MessageSquare, Award, AlertCircle } from 'lucide-react';
import ProductCard from '../components/ProductCard';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import API from '../api/client';
import { resolveMediaUrl } from '../utils/media';

export default function ProductDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToCart } = useCart();
    const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
    const { isAuthenticated, isCustomer } = useAuth();
    const { showToast } = useToast();

    const [product, setProduct] = useState(null);
    const [relatedProducts, setRelatedProducts] = useState([]);
    const [reviews, setReviews] = useState([]);
    const [selectedImage, setSelectedImage] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);

    // Review Form state
    const [rating, setRating] = useState(5);
    const [reviewComment, setReviewComment] = useState('');
    const [submittingReview, setSubmittingReview] = useState(false);

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                setLoading(true);
                const res = await API.get(`/products/${id}`);
                if (res.data.success) {
                    setProduct(res.data.product);
                    setRelatedProducts(res.data.relatedProducts || []);
                    setSelectedImage(res.data.product.thumbnail || (res.data.product.images && res.data.product.images[0]));
                    // Start the quantity selector at the product's MOQ, not 1 —
                    // this is a wholesale platform, so 1 is rarely a valid order.
                    setQuantity(res.data.product.minimum_order_quantity || 1);

                    // Fetch reviews
                    const revRes = await API.get(`/reviews/product/${res.data.product.id}`);
                    if (revRes.data.success) {
                        setReviews(revRes.data.reviews);
                    }
                }
            } catch (error) {
                console.error('Fetch product detail error:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchDetail();
    }, [id]);

    if (loading) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-16">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="h-96 skeleton rounded-3xl" />
                    <div className="space-y-6">
                        <div className="h-8 w-3/4 skeleton rounded-xl" />
                        <div className="h-6 w-1/4 skeleton rounded-xl" />
                        <div className="h-24 skeleton rounded-2xl" />
                    </div>
                </div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-16 text-center">
                <h2 className="text-2xl font-bold text-gray-800">Product Not Found</h2>
                <button onClick={() => navigate('/products')} className="mt-4 px-6 py-2.5 bg-[#1F4D36] text-white font-bold rounded-full">
                    Return to Catalog
                </button>
            </div>
        );
    }

    // available_stock is the wholesale-facing field name from the API;
    // stock_quantity kept as a fallback for older cached shapes.
    const availableStock = product.available_stock ?? product.stock_quantity ?? 0;
    const moq = product.minimum_order_quantity || 1;
    const maxOrderQuantity = product.maximum_order_quantity || null;
    const priceTiers = product.price_tiers || [];

    // Mirrors server/utils/wholesale.js#resolveEffectivePrice so the price
    // shown here always matches what checkout will actually charge.
    const resolveTierPrice = (qty) => {
        const fallback = product.discount_price ? parseFloat(product.discount_price) : parseFloat(product.price);
        const match = priceTiers
            .filter(t => qty >= t.min_quantity && (t.max_quantity === null || qty <= t.max_quantity))
            .sort((a, b) => b.min_quantity - a.min_quantity)[0];
        return match ? { price: parseFloat(match.price), tier: match } : { price: fallback, tier: null };
    };

    const { price: effectivePrice, tier: activeTier } = resolveTierPrice(quantity);
    const originalPrice = parseFloat(product.price);
    const totalPrice = effectivePrice * quantity;
    const isOutOfStock = availableStock <= 0;
    const belowMoqStock = !isOutOfStock && availableStock < moq;
    const canOrder = !isOutOfStock && !belowMoqStock;
    const inWishlist = isInWishlist(product.id);

    const upperBound = Math.min(availableStock, maxOrderQuantity || availableStock);

    const handleQuantityChange = (delta) => {
        const next = quantity + delta;
        if (next < moq) {
            showToast(`Minimum order quantity for this product is ${moq} ${product.unit}.`, 'info');
            return;
        }
        if (next > upperBound) {
            if (maxOrderQuantity && next > maxOrderQuantity) {
                showToast(`Maximum order quantity for this product is ${maxOrderQuantity} ${product.unit}.`, 'info');
            } else {
                showToast(`Only ${availableStock} ${product.unit} available in stock.`, 'info');
            }
            return;
        }
        setQuantity(next);
    };

    const handleAddToCart = async () => {
        if (!canOrder || adding) return;
        setAdding(true);
        await addToCart(product.id, quantity);
        setAdding(false);
    };

    const handleBuyNow = async () => {
        if (!canOrder) return;
        const success = await addToCart(product.id, quantity);
        if (success) {
            navigate('/checkout');
        }
    };

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        if (!isAuthenticated) {
            showToast('Please log in to submit a review.', 'info');
            return;
        }

        try {
            setSubmittingReview(true);
            const res = await API.post('/reviews', {
                product_id: product.id,
                rating,
                comment: reviewComment
            });
            if (res.data.success) {
                showToast(res.data.message, 'success');
                setReviewComment('');
                // Refresh reviews
                const revRes = await API.get(`/reviews/product/${product.id}`);
                if (revRes.data.success) setReviews(revRes.data.reviews);
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Error submitting review.', 'error');
        } finally {
            setSubmittingReview(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-16">
            {/* Main Details Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                {/* Image Gallery */}
                <div className="space-y-4">
                    <div className="relative aspect-4/3 bg-white border border-[#E2DAC8] rounded-3xl overflow-hidden shadow-sm">
                        <img
                            src={resolveMediaUrl(selectedImage || product.thumbnail)}
                            alt={product.name}
                            className="w-full h-full object-cover"
                        />
                        {product.discount_percentage > 0 && (
                            <span className="absolute top-4 left-4 px-3 py-1 bg-[#D9760C] text-white font-extrabold text-xs rounded-full shadow-md uppercase">
                                {product.discount_percentage}% OFF
                            </span>
                        )}
                    </div>

                    {/* Thumbnails */}
                    {product.images && product.images.length > 1 && (
                        <div className="flex items-center gap-3 overflow-x-auto pb-2">
                            {product.images.map((img, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedImage(img)}
                                    className={`w-20 h-20 rounded-2xl overflow-hidden border-2 transition-all ${
                                        selectedImage === img ? 'border-[#1F4D36] ring-2 ring-emerald-100 scale-105' : 'border-transparent opacity-70 hover:opacity-100'
                                    }`}
                                >
                                    <img src={resolveMediaUrl(img)} alt="" className="w-full h-full object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Product Specification Info */}
                <div className="space-y-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-2">
                            <span className="px-2.5 py-1 bg-[#F4EEDD] text-[#163326] rounded-full font-bold">
                                {product.category_name}
                            </span>
                            <span>• SKU: {product.sku}</span>
                            <span>• Unit: {product.unit}</span>
                        </div>
                        <h1 className="text-3xl font-bold font-serif text-gray-900 leading-tight">
                            {product.name}
                        </h1>
                        <p className="text-xs text-gray-500 mt-1">Directly sourced by {product.brand || 'Mandi Direct'}</p>

                        {(product.grade || product.quality || product.origin || product.origin_district || product.origin_mandi) && (
                            <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px] text-gray-600">
                                {product.grade && <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-full font-semibold">Grade: {product.grade}</span>}
                                {product.quality && <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-full font-semibold">Quality: {product.quality}</span>}
                                {(product.origin_mandi || product.origin_district || product.origin) && (
                                    <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-full font-semibold">
                                        Origin: {[product.origin_mandi, product.origin_district, product.origin].filter(Boolean).join(', ')}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Price & Rating */}
                    <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-[#E2DAC8]">
                        <div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-extrabold text-[#163326]">
                                    ₹{effectivePrice.toFixed(2)}
                                </span>
                                <span className="text-sm font-semibold text-gray-500">
                                    / {product.unit} ({product.weight})
                                </span>
                            </div>
                            {product.discount_price && !activeTier && (
                                <span className="text-xs text-gray-400 line-through">
                                    Original Price: ₹{originalPrice.toFixed(2)}
                                </span>
                            )}
                            {activeTier && (
                                <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full inline-block mt-1">
                                    Wholesale tier price for {activeTier.min_quantity}
                                    {activeTier.max_quantity ? `–${activeTier.max_quantity}` : '+'} {product.unit}
                                </span>
                            )}
                        </div>

                        <div className="text-right border-l border-gray-100 pl-4">
                            <div className="flex items-center gap-1 text-amber-500">
                                <Star className="w-5 h-5 fill-amber-400" />
                                <span className="text-base font-bold text-gray-900">
                                    {parseFloat(product.avg_rating || 4.5).toFixed(1)}
                                </span>
                            </div>
                            <span className="text-xs text-gray-500">{product.review_count || 12} Verified Reviews</span>
                        </div>
                    </div>

                    {/* Wholesale Price Tiers */}
                    {priceTiers.length > 0 && (
                        <div className="p-4 bg-white rounded-2xl border border-[#E2DAC8]">
                            <h4 className="text-xs font-bold text-gray-800 mb-2">Wholesale Price Tiers</h4>
                            <div className="grid grid-cols-3 gap-2">
                                {priceTiers.map(tier => {
                                    const isActive = activeTier && activeTier.id === tier.id;
                                    return (
                                        <div
                                            key={tier.id}
                                            className={`p-2.5 rounded-xl border text-center ${
                                                isActive ? 'bg-[#1F4D36] border-[#1F4D36] text-white' : 'bg-[#FBF8F1] border-gray-200 text-gray-700'
                                            }`}
                                        >
                                            <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                                                {tier.min_quantity}{tier.max_quantity ? `–${tier.max_quantity}` : '+'} {product.unit}
                                            </p>
                                            <p className="text-sm font-extrabold mt-0.5">₹{parseFloat(tier.price).toFixed(2)}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Stock Status & MOQ — always shown, never left implicit,
                        so it's never ambiguous that this is a bulk platform. */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-bold text-gray-700">Availability:</span>
                        {isOutOfStock ? (
                            <span className="px-3 py-1 bg-rose-100 text-rose-800 font-bold text-xs rounded-full">Out of Stock</span>
                        ) : belowMoqStock ? (
                            <span className="px-3 py-1 bg-amber-100 text-amber-800 font-bold text-xs rounded-full">
                                Only {availableStock} {product.unit} left — below MOQ
                            </span>
                        ) : (
                            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-full">
                                In Stock ({availableStock} {product.unit} available)
                            </span>
                        )}
                        <span className="px-3 py-1 bg-[#F4EEDD] text-[#163326] font-bold text-xs rounded-full">
                            MOQ: {moq} {product.unit}
                        </span>
                        {maxOrderQuantity && (
                            <span className="px-3 py-1 bg-[#F4EEDD] text-[#163326] font-bold text-xs rounded-full">
                                Max order: {maxOrderQuantity} {product.unit}
                            </span>
                        )}
                    </div>

                    {/* Quantity Selector & Auto Calculation */}
                    <div className="p-4 bg-[#F4EEDD]/40 rounded-2xl border border-[#E2DAC8] space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-800">Select Quantity ({product.unit}) — MOQ {moq}:</span>
                            <div className="flex items-center gap-3 bg-white border border-[#E2DAC8] rounded-xl px-3 py-1.5">
                                <button
                                    onClick={() => handleQuantityChange(-1)}
                                    disabled={quantity <= moq || !canOrder}
                                    className="text-gray-600 hover:text-black disabled:opacity-30"
                                >
                                    <Minus className="w-4 h-4" />
                                </button>
                                <span className="text-sm font-bold text-gray-900 w-8 text-center">{quantity}</span>
                                <button
                                    onClick={() => handleQuantityChange(1)}
                                    disabled={quantity >= upperBound || !canOrder}
                                    className="text-gray-600 hover:text-black disabled:opacity-30"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Calculated total price display */}
                        <div className="flex items-center justify-between pt-2 border-t border-[#E2DAC8]/60 text-sm">
                            <span className="text-xs font-bold text-gray-600">Calculated Subtotal ({quantity} × ₹{effectivePrice.toFixed(2)}):</span>
                            <span className="text-lg font-extrabold text-[#1F4D36]">₹{totalPrice.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-4 pt-2">
                        <button
                            onClick={handleAddToCart}
                            disabled={!canOrder || adding}
                            className="flex-1 px-6 py-3.5 bg-[#1F4D36] hover:bg-[#163326] text-white font-bold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <ShoppingBag className="w-4 h-4" /> {adding ? 'Adding...' : 'Add to Cart'}
                        </button>

                        <button
                            onClick={handleBuyNow}
                            disabled={!canOrder}
                            className="px-6 py-3.5 bg-[#D9760C] hover:bg-[#B25F06] text-white font-bold text-sm rounded-2xl shadow-md transition-all disabled:opacity-50"
                        >
                            Buy Now
                        </button>

                        <button
                            onClick={() => inWishlist ? removeFromWishlist(product.id) : addToWishlist(product.id)}
                            className={`p-3.5 border rounded-2xl transition-colors ${
                                inWishlist ? 'border-rose-300 bg-rose-50 text-rose-600' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                            }`}
                        >
                            <Heart className={`w-5 h-5 ${inWishlist ? 'fill-current' : ''}`} />
                        </button>
                    </div>

                    {/* Delivery & Assurance Info */}
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 text-xs">
                        <div className="flex items-start gap-2.5">
                            <Truck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-bold text-gray-900">Mandi Express Shipping</h4>
                                <p className="text-gray-500">Delivered within 24-48 hours</p>
                            </div>
                        </div>
                        <div className="flex items-start gap-2.5">
                            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="font-bold text-gray-900">Verified Quality</h4>
                                <p className="text-gray-500">Direct mandi freshness inspection</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Description Tab */}
            <div className="bg-white p-8 rounded-3xl border border-[#E2DAC8] space-y-4">
                <h3 className="text-lg font-bold text-[#163326] font-serif border-b border-gray-100 pb-3">Product Description</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{product.description || 'Fresh produce harvested and delivered straight from mandi lots.'}</p>
            </div>

            {/* Verified Buyer Reviews Section */}
            <div className="bg-white p-8 rounded-3xl border border-[#E2DAC8] space-y-8">
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                    <div>
                        <h3 className="text-lg font-bold text-[#163326] font-serif flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-[#D9760C]" /> Verified Buyer Reviews
                        </h3>
                        <p className="text-xs text-gray-500">Reviews are strictly restricted to customers who purchased this item</p>
                    </div>

                    <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-50 rounded-full border border-amber-200 text-amber-800 text-xs font-bold">
                        <Award className="w-4 h-4 text-amber-600" /> Verified Buyer Rule Enforced
                    </div>
                </div>

                {/* Write Review Form */}
                {isAuthenticated && isCustomer && (
                    <form onSubmit={handleReviewSubmit} className="p-6 bg-[#FBF8F1] rounded-2xl border border-[#E2DAC8] space-y-4">
                        <h4 className="text-sm font-bold text-gray-900">Write a Customer Review</h4>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-700">Rating:</span>
                            <div className="flex items-center gap-1 cursor-pointer">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <Star
                                        key={star}
                                        onClick={() => setRating(star)}
                                        className={`w-6 h-6 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                                    />
                                ))}
                            </div>
                        </div>

                        <div>
                            <textarea
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                                placeholder="Share your experience regarding produce quality, freshness, and packaging..."
                                rows="3"
                                required
                                className="w-full p-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1F4D36]"
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={submittingReview}
                            className="px-6 py-2 bg-[#1F4D36] text-white text-xs font-bold rounded-full hover:bg-[#163326]"
                        >
                            {submittingReview ? 'Submitting...' : 'Submit Review'}
                        </button>
                    </form>
                )}

                {/* Reviews List */}
                {reviews.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-500">
                        No reviews yet for this mandi product. Be the first verified buyer to leave a review!
                    </div>
                ) : (
                    <div className="space-y-4 divide-y divide-gray-100">
                        {reviews.map(rev => (
                            <div key={rev.id} className="pt-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-emerald-900 text-white font-bold text-xs flex items-center justify-center">
                                            {rev.full_name?.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-900">{rev.full_name}</p>
                                            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                                <Check className="w-3 h-3 text-emerald-600" /> Verified Buyer
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center text-amber-400">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <Star key={s} className={`w-3.5 h-3.5 ${s <= rev.rating ? 'fill-amber-400' : 'text-gray-200'}`} />
                                        ))}
                                    </div>
                                </div>
                                <p className="text-xs text-gray-600 pl-10 leading-relaxed">{rev.comment}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Related Produce Grid */}
            {relatedProducts.length > 0 && (
                <div className="space-y-6">
                    <h3 className="text-xl font-bold text-[#163326] font-serif">Related Produce</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                        {relatedProducts.map(p => (
                            <ProductCard key={p.id} product={p} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}