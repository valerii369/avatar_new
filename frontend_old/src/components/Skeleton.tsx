"use client";
import { motion } from "framer-motion";

interface SkeletonProps {
    className?: string; // Standard tailwind width/height/radius
    count?: number;
}

export const Skeleton = ({ className, count = 1 }: SkeletonProps) => {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <motion.div
                    key={i}
                    className={`bg-white/5 overflow-hidden relative ${className}`}
                    initial={{ opacity: 0.5 }}
                    animate={{ opacity: 1 }}
                    transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        repeatType: "reverse",
                    }}
                >
                    <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent shadow-xl"
                        animate={{
                            x: ["-100%", "100%"],
                        }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "linear",
                        }}
                    />
                </motion.div>
            ))}
        </>
    );
};

export const CardSkeleton = () => (
    <div className="glass-strong p-5 rounded-[1.5rem] border border-white/5 space-y-4">
        <div className="flex justify-between items-start">
            <div className="space-y-2">
                <Skeleton className="h-3 w-24 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-4 w-20 rounded-full" />
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
    </div>
);

export const MiniCardSkeleton = () => (
    <div className="w-full bg-white/5 border border-white/5 rounded-2xl overflow-hidden flex flex-col">
        <div className="flex items-stretch">
            <Skeleton className="w-[68px] h-[68px] shrink-0 border-r border-white/5" />
            <div className="flex-1 p-2.5 space-y-2">
                <Skeleton className="h-2 w-12 rounded-full" />
                <Skeleton className="h-4 w-20 rounded-full" />
                <Skeleton className="h-2 w-16 rounded-full" />
            </div>
        </div>
        <div className="p-2 border-t border-white/5 flex justify-between items-center">
            <Skeleton className="h-3 w-8 rounded-full" />
            <Skeleton className="h-3 w-12 rounded-full" />
        </div>
    </div>
);
