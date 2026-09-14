import React from 'react';
import { Check, Clock, Package, Truck, CheckCircle2, AlertTriangle, RefreshCcw } from 'lucide-react';

const STEPS = [
    { key: 'Pending', label: 'Order Placed', icon: Clock },
    { key: 'Confirmed', label: 'Confirmed', icon: CheckCircle2 },
    { key: 'Packed', label: 'Packed', icon: Package },
    { key: 'Shipped', label: 'Shipped', icon: Truck },
    { key: 'Out for Delivery', label: 'Out for Delivery', icon: Truck },
    { key: 'Delivered', label: 'Delivered', icon: Check }
];

export default function OrderTrackerStepper({ currentStatus, history = [] }) {
    if (['Cancelled', 'Returned', 'Refunded'].includes(currentStatus)) {
        return (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-4 text-rose-800">
                <AlertTriangle className="w-8 h-8 shrink-0 text-rose-600" />
                <div>
                    <h4 className="text-base font-bold">Order {currentStatus}</h4>
                    <p className="text-xs text-rose-600 mt-1">
                        This order has been {currentStatus.toLowerCase()}. Contact support if you need further assistance.
                    </p>
                </div>
            </div>
        );
    }

    const currentStepIndex = STEPS.findIndex(s => s.key === currentStatus);
    const activeIndex = currentStepIndex >= 0 ? currentStepIndex : 0;

    const historyMap = {};
    history.forEach(h => {
        historyMap[h.status] = h.created_at;
    });

    return (
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-[#E2DAC8] shadow-sm">
            <h3 className="text-base font-bold text-[#163326] mb-6 flex items-center justify-between">
                <span>Visual Order Progress Tracker</span>
                <span className="text-xs font-semibold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full">
                    Current: {currentStatus}
                </span>
            </h3>

            {/* Desktop Horizontal Stepper */}
            <div className="hidden md:block relative">
                {/* Connecting Line */}
                <div className="absolute top-5 left-8 right-8 h-1 bg-gray-200 z-0">
                    <div
                        className="h-full bg-[#1F4D36] transition-all duration-500"
                        style={{
                            width: `${(activeIndex / (STEPS.length - 1)) * 100}%`
                        }}
                    />
                </div>

                <div className="relative z-10 flex justify-between">
                    {STEPS.map((step, idx) => {
                        const isCompleted = idx <= activeIndex;
                        const isCurrent = idx === activeIndex;
                        const StepIcon = step.icon;
                        const timestamp = historyMap[step.key];

                        return (
                            <div key={step.key} className="flex flex-col items-center text-center max-w-[100px]">
                                <div
                                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                                        isCompleted
                                            ? 'bg-[#1F4D36] text-white shadow-md ring-4 ring-emerald-100'
                                            : 'bg-white border-2 border-gray-300 text-gray-400'
                                    } ${isCurrent ? 'scale-110' : ''}`}
                                >
                                    <StepIcon className="w-5 h-5" />
                                </div>
                                <span className={`text-xs font-bold mt-3 ${isCompleted ? 'text-[#163326]' : 'text-gray-400'}`}>
                                    {step.label}
                                </span>
                                {timestamp && (
                                    <span className="text-[10px] text-gray-500 mt-0.5">
                                        {new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Mobile Vertical Stepper */}
            <div className="md:hidden space-y-4 relative pl-4 border-l-2 border-emerald-800/20">
                {STEPS.map((step, idx) => {
                    const isCompleted = idx <= activeIndex;
                    const StepIcon = step.icon;
                    const timestamp = historyMap[step.key];

                    return (
                        <div key={step.key} className="relative flex items-start gap-3">
                            <div
                                className={`w-7 h-7 -ml-[29px] rounded-full flex items-center justify-center text-xs font-bold ${
                                    isCompleted ? 'bg-[#1F4D36] text-white' : 'bg-gray-200 text-gray-500'
                                }`}
                            >
                                <StepIcon className="w-4 h-4" />
                            </div>
                            <div>
                                <p className={`text-xs font-bold ${isCompleted ? 'text-gray-900' : 'text-gray-400'}`}>
                                    {step.label}
                                </p>
                                {timestamp && (
                                    <p className="text-[10px] text-gray-500">{new Date(timestamp).toLocaleString()}</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
