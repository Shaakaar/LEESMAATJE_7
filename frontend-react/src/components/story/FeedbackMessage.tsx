import { motion } from 'framer-motion';

interface Props {
  text: string;
  positive: boolean;
}

export default function FeedbackMessage({ text, positive }: Props) {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      role="status"
      aria-live="polite"
      className={`mt-2 font-semibold ${positive ? 'text-green-600' : 'text-red-600'}`}
      dangerouslySetInnerHTML={{ __html: text }}
    />
  );
}
