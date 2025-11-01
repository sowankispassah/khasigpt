"use client";

import { motion } from "framer-motion";

import { useTranslation } from "@/components/language-provider";

export const Greeting = () => {
  const { translate } = useTranslation();

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center gap-2 px-4 text-center sm:gap-3"
      key="overview"
    >
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="font-semibold text-xl md:text-2xl"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.3 }}
      >
        {translate("greeting.title", "Hello there!")}
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="text-xl text-muted-foreground md:text-2xl"
        exit={{ opacity: 0, y: 10 }}
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.4 }}
      >
        {translate("greeting.subtitle", "How can I help you today?")}
      </motion.div>
    </div>
  );
};
