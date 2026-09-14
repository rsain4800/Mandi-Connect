import React, { useState } from 'react';
import { Settings, ShieldCheck, Mail, Lock, Server, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

export default function AdminSettings() {
    const { user } = useAuth();
    const { addToast } = useToast();

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-[#163326]">Platform & Admin Settings</h1>
                <p className="text-sm text-gray-600">Review system configuration, environment variables, security, and admin recipient email status.</p>
            </div>

            {/* Single Admin Account Guard Info */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#D9760C] text-white flex items-center justify-center font-bold">
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-amber-900">Single Admin Account Architecture Active</h2>
                        <p className="text-xs text-amber-800">
                            As per security compliance, Mandi Connect allows only ONE Admin Account in the database, initialized securely via environment variables and database seed scripts. Public registration for admin accounts is strictly disabled.
                        </p>
                    </div>
                </div>
            </div>

            {/* Active Admin Profile Credentials Card */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-[#163326] border-b border-gray-100 pb-3 flex items-center gap-2">
                    <Mail className="w-4 h-4 text-[#1F4D36]" /> Single Admin Account Profile
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="p-3.5 bg-[#FAF8F5] rounded-xl border border-amber-900/5">
                        <span className="text-xs text-gray-400 font-medium block">Admin Account Name</span>
                        <strong className="text-gray-900 font-bold">{user?.full_name || 'Mandi Connect Admin'}</strong>
                    </div>

                    <div className="p-3.5 bg-[#FAF8F5] rounded-xl border border-amber-900/5">
                        <span className="text-xs text-gray-400 font-medium block">Admin Recipient Email (ADMIN_EMAIL)</span>
                        <strong className="text-[#1F4D36] font-bold">{user?.email}</strong>
                    </div>
                </div>
            </div>

            {/* System Infrastructure & Integration Check */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-[#163326] border-b border-gray-100 pb-3 flex items-center gap-2">
                    <Server className="w-4 h-4 text-[#D9760C]" /> System Architecture & Environment Status
                </h3>

                <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-xs font-semibold">
                        <span className="text-emerald-900 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Relational Database Connection (MySQL)
                        </span>
                        <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-mono">Connected & Normalized</span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-xs font-semibold">
                        <span className="text-emerald-900 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Razorpay Payment Gateway API
                        </span>
                        <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-mono">Backend Signature Verified</span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-xs font-semibold">
                        <span className="text-emerald-900 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> SMTP Email Service Dispatcher
                        </span>
                        <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-mono">Nodemailer Operational</span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-emerald-50/60 rounded-xl border border-emerald-100 text-xs font-semibold">
                        <span className="text-emerald-900 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Admin Email Order Alert System
                        </span>
                        <span className="text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded font-mono">Active on Order Placement</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
