import React from 'react';
import { motion } from 'motion/react';

interface AnimatedCheckmarkProps {
  size?: number;
}

export const AnimatedCheckmark: React.FC<AnimatedCheckmarkProps> = ({ size = 80 }) => {
  return (
    <div className="flex flex-col items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 20,
        }}
        className="rounded-full bg-emerald-500 flex items-center justify-center shadow-2xl shadow-emerald-500/40"
        style={{ width: size, height: size }}
      >
        <svg
          className="text-white"
          width={size * 0.58}
          height={size * 0.58}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path
            d="M4 12.5L9.5 18L20 6"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              duration: 0.45,
              ease: 'easeOut',
              delay: 0.15,
            }}
          />
        </svg>
      </motion.div>
    </div>
  );
};
