import React, { useState, useEffect } from 'react';
import { Star, Trash2, ShieldCheck, MessageSquare, Package, User } from 'lucide-react';
import API from '../../api/client';
import { useToast } from '../../context/ToastContext';

export default function AdminReviews() {
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const { addToast } = useToast();

    const fetchReviews = async () => {
        try {
            setLoading(true);
            const res = await API.get('/reviews/admin-list');
            if (res.data.success) {
                setReviews(res.data.reviews);
            }
        } catch (error) {
            addToast('Failed to fetch product reviews', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReviews();
    }, []);

    const handleDeleteReview = async (id) => {
        if (!window.confirm('Are you sure you want to remove this review?')) return;
        try {
            const res = await API.delete(`/reviews/${id}`);
            if (res.data.success) {
                addToast('Review deleted', 'success');
                setReviews(prev => prev.filter(r => r.id !== id));
            }
        } catch (error) {
            addToast('Failed to delete review', 'error');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-[#163326]">Verified Buyer Reviews</h1>
                <p className="text-sm text-gray-600">Moderate product reviews posted by verified purchasing customers.</p>
            </div>

            {loading ? (
                <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 border-4 border-[#1F4D36] border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    Loading customer reviews...
                </div>
            ) : reviews.length === 0 ? (
                <div className="p-12 text-center text-gray-500 bg-white rounded-2xl border border-gray-100">
                    <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    No product reviews posted yet.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {reviews.map(rev => (
                        <div key={rev.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-3 flex flex-col justify-between">
                            <div>
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div className="flex items-center gap-2">
                                        <Package className="w-4 h-4 text-[#D9760C]" />
                                        <h3 className="font-bold text-gray-900 text-sm">{rev.product_name}</h3>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteReview(rev.id)}
                                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                        title="Delete Review"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>

                                <div className="flex items-center gap-1 my-2">
                                    {[1, 2, 3, 4, 5].map(star => (
                                        <Star
                                            key={star}
                                            className={`w-4 h-4 ${star <= rev.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`}
                                        />
                                    ))}
                                    <span className="text-xs font-bold text-gray-700 ml-2">{rev.rating}.0 / 5.0</span>
                                </div>

                                <p className="text-xs text-gray-600 leading-relaxed bg-[#FAF8F5] p-3 rounded-xl border border-amber-900/5 italic">
                                    "{rev.comment || 'No written comment provided.'}"
                                </p>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs">
                                <div className="flex items-center gap-2 text-gray-700">
                                    <User className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="font-medium">{rev.full_name} ({rev.email})</span>
                                </div>
                                <span className="text-[11px] text-gray-400 font-mono">
                                    {new Date(rev.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
