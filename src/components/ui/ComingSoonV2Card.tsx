import React from "react";
import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";

interface ComingSoonV2CardProps {
  title: string;
  icon: LucideIcon;
}

export function ComingSoonV2Card({ title, icon: Icon }: ComingSoonV2CardProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center max-w-md text-center bg-white dark:bg-[#1e293b]/40 backdrop-blur-2xl p-8 rounded-3xl border border-gray-100 dark:border-white/5 shadow-[8px_0_16px_rgba(163,177,198,0.2)] dark:shadow-[8px_0_16px_rgba(0,0,0,0.6)]"
      >
        <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
          <Icon size={40} strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white mb-3">{title}</h1>
        <p className="text-sm font-bold text-gray-500 dark:text-gray-400 leading-relaxed">
          Fitur {title} sedang dalam tahap pengembangan dan akan dirilis pada SIMOSDA Versi 2.
        </p>
      </motion.div>
    </div>
  );
}
