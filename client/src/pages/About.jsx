import React from 'react';
import { Leaf, Award, ShieldCheck, Truck } from 'lucide-react';

export default function About() {
    return (
        <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
            <div className="text-center space-y-3">
                <span className="px-3.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full uppercase">
                    About Mandi Connect
                </span>
                <h1 className="text-3xl font-bold font-serif text-[#163326]">
                    Fresh From The Mandi, Delivered To You
                </h1>
                <p className="text-xs text-gray-500 max-w-xl mx-auto leading-relaxed">
                    Connecting agricultural mandis directly with households to eliminate middleman inflation and ensure 100% fresh produce delivery.
                </p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-[#E2DAC8] space-y-4 text-xs leading-relaxed text-gray-700 shadow-xs">
                <h2 className="text-lg font-bold text-gray-900 font-serif">Our Mission</h2>
                <p>
                    Mandi Connect was built with a clear objective: bridging the gap between local mandi auctions and urban households. Traditional supply chains add 4-5 layers of middlemen, resulting in delayed freshness and inflated retail prices.
                </p>
                <p>
                    By connecting directly to verified agricultural markets, Mandi Connect delivers freshly harvested fruits, vegetables, grains, and groceries with wholesale price transparency and visual shipment tracking.
                </p>
            </div>
        </div>
    );
}
