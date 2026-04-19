import { motion } from "motion/react";

export const AudioWaveform = ({ isSpeaking }: { isSpeaking: boolean }) => {
  const bars = Array.from({ length: 20 });
  
  return (
    <div className="flex items-center gap-1 h-12">
      {bars.map((_, i) => (
        <motion.div
          key={i}
          className="w-1 bg-brand-emerald rounded-full"
          animate={{
            height: isSpeaking ? [8, 32, 12, 40, 16][i % 5] : 4,
          }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            repeatType: "mirror",
            delay: i * 0.05,
          }}
        />
      ))}
    </div>
  );
};
