import React, { useState } from 'react';
import { Mail, Phone, MapPin, Send } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function Contact() {
    const { showToast } = useToast();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        showToast('Thank you for contacting Mandi Connect. We will respond within 24 hours!', 'success');
        setName('');
        setEmail('');
        setMessage('');
    };

    return (
        <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
            <div className="text-center space-y-2">
                <h1 className="text-3xl font-bold font-serif text-[#163326]">Contact Mandi Connect</h1>
                <p className="text-xs text-gray-500">We are here to assist with your mandi orders and bulk inquiries</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4 text-xs">
                    <h3 className="text-sm font-bold text-gray-900">Get in Touch</h3>
                    <div className="space-y-3 text-gray-600">
                        <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-emerald-700" /> Helpline: 1800-MANDI-CONNECT</p>
                        <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-emerald-700" /> Email: support@mandiconnect.com</p>
                        <p className="flex items-start gap-2"><MapPin className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" /> Mandi Connect HQ, APMC Market Yard, India</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="bg-white p-6 rounded-3xl border border-[#E2DAC8] space-y-4 text-xs">
                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Your Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} required className="w-full p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl" />
                    </div>
                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl" />
                    </div>
                    <div>
                        <label className="font-bold text-gray-700 block mb-1">Message</label>
                        <textarea value={message} onChange={e => setMessage(e.target.value)} rows="3" required className="w-full p-2.5 bg-[#FBF8F1] border border-gray-200 rounded-xl" />
                    </div>
                    <button type="submit" className="w-full py-3 bg-[#1F4D36] text-white font-bold rounded-full hover:bg-[#163326]">
                        Send Message
                    </button>
                </form>
            </div>
        </div>
    );
}
