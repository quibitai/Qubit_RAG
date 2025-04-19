import { motion } from 'framer-motion';

// Array of quotes to randomly select from
const quotes = [
  'Like a gun. You only have so many bullets, so take out the worst problems before you run out.',
  'Dough goes in, and you pull out the bread.',
  'Put one hand out and one hand up to slap them with.',
  "Tell him to draw a beach ball, he'll do it. Tell him to imagine what it's like to be a beach ball…he can't do it.",
  "It's like, let's see how many hotdogs we can fit into Pluto's mouth, you know?",
  'Take only pictures, leave only footprints.',
  'You just gotta sort the pecans from the acorns sometimes.',
  'Jokes are always funny for what they are, your product is the joke.',
  'We decided to stay away from the neck bone connected to the shoulder bone version.',
  "If he's tryna be like a Hibachi chef… he's gotta learn how to juggle spatulas.",
  'Every good idea starts as either a good idea or a bad idea.',
  "You have the purse but none of the coins to go in it. It's like you have the handbag but not the bag.",
  "The hamster wheel's there but there's nobody on it.",
  "It's like the cobbler doing his own shoes.",
  'His job is to vent poisonous gas…push button.',
  "Nose to toes, you're in it; toes to nose, you're in it.",
  "It's like a camel pooping in the middle of an aisle. There's nothing you can do about that.",
  'Blue hour, yellow banana, eating it from both ends.',
];

export const Greeting = () => {
  // Select a random quote
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

  return (
    <div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20 px-8 size-full flex flex-col justify-center"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5 }}
        className="text-2xl font-semibold"
      >
        Quibit.ai
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.6 }}
        className="text-2xl text-zinc-500"
      >
        "{randomQuote}"
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.7 }}
        className="text-lg text-zinc-500 mt-1"
      >
        -Erick
      </motion.div>
    </div>
  );
};
