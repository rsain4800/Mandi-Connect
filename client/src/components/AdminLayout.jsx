import React from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';

export default function AdminLayout() {
    return (
        <div className="flex min-h-screen bg-[#FBF8F1]">
            <AdminSidebar />
            <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl">
                <Outlet />
            </main>
        </div>
    );
}
