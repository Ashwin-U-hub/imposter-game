import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const popularPackage = require("popular-english-words");
const nounPackage = require("@extra-wordnet.english/noun-words");

const popularWordsApi =
  popularPackage.words ??
  popularPackage.default?.words;

const nounWords = Array.isArray(nounPackage)
  ? nounPackage
  : nounPackage.default;

if (!popularWordsApi || typeof popularWordsApi.getAll !== "function") {
  throw new Error(
    "Could not load popular-english-words correctly."
  );
}

if (!Array.isArray(nounWords)) {
  throw new Error(
    "Could not load the WordNet noun list correctly."
  );
}

const TARGET_WORD_COUNT = 30000;

const CURATED_CONCEPTS = [
  // Phones / technology
  "iPhone",
  "Samsung Galaxy",
  "Android",
  "iOS",
  "Google Pixel",
  "OnePlus",
  "Nothing Phone",
  "Smartphone",
  "Feature Phone",
  "SIM Card",
  "Phone Case",
  "Screen Protector",
  "Charger",
  "Fast Charger",
  "Wireless Charger",
  "Power Bank",
  "USB Cable",
  "USB Drive",
  "Pendrive",
  "Memory Card",
  "Laptop",
  "Desktop Computer",
  "Monitor",
  "Keyboard",
  "Mouse",
  "Touchpad",
  "Webcam",
  "Microphone",
  "Speaker",
  "Bluetooth Speaker",
  "Headphones",
  "Earphones",
  "AirPods",
  "Smartwatch",
  "Calculator",
  "Printer",
  "Scanner",
  "Router",
  "Wi-Fi",
  "Bluetooth",
  "Hard Drive",
  "SSD",
  "Processor",
  "Graphics Card",
  "Motherboard",
  "RAM",
  "Camera",
  "Tripod",
  "Projector",
  "Television",
  "Remote Control",

  // Apps / internet
  "WhatsApp",
  "Instagram",
  "YouTube",
  "Google Maps",
  "Google Chrome",
  "Gmail",
  "Spotify",
  "Netflix",
  "Amazon",
  "Flipkart",
  "Snapchat",
  "Telegram",
  "Discord",
  "Zoom",
  "Google Meet",
  "Microsoft Teams",
  "Google Drive",
  "Google Photos",
  "Play Store",
  "App Store",
  "QR Code",
  "UPI",
  "Google Pay",
  "PhonePe",
  "Paytm",
  "Search Engine",
  "Website",
  "Password",
  "Wi-Fi Password",
  "Email",
  "Video Call",
  "Voice Message",
  "Screenshot",
  "Notification",
  "Emoji",

  // Watches / accessories
  "Casio",
  "Titan",
  "Rolex",
  "Fastrack",
  "Analog Watch",
  "Digital Watch",
  "Smart Watch",
  "Wall Clock",
  "Alarm Clock",
  "Sunglasses",
  "Spectacles",
  "Wallet",
  "Backpack",
  "Handbag",
  "Belt",
  "Cap",
  "Helmet",
  "Umbrella",
  "Keychain",
  "Ring",
  "Bracelet",
  "Necklace",

  // Clothes
  "T-Shirt",
  "Shirt",
  "Formal Shirt",
  "Polo Shirt",
  "Hoodie",
  "Sweater",
  "Jacket",
  "Jeans",
  "Trousers",
  "Shorts",
  "Track Pants",
  "Uniform",
  "Saree",
  "Vesti",
  "Kurta",
  "Blazer",
  "Suit",
  "Tie",
  "Socks",
  "Shoes",
  "Sneakers",
  "Slippers",
  "Sandals",

  // Food
  "Pizza",
  "Burger",
  "Sandwich",
  "Biryani",
  "Dosa",
  "Idli",
  "Vada",
  "Pongal",
  "Chapati",
  "Parotta",
  "Noodles",
  "Fried Rice",
  "Pasta",
  "French Fries",
  "Chicken Rice",
  "Paneer",
  "Samosa",
  "Pani Puri",
  "Popcorn",
  "Ice Cream",
  "Chocolate",
  "KitKat",
  "Oreo",
  "Maggi",
  "Cake",
  "Cupcake",
  "Biscuit",
  "Bread",
  "Jam",
  "Honey",
  "Cheese",
  "Butter",
  "Egg",
  "Rice",
  "Apple",
  "Banana",
  "Mango",
  "Orange",
  "Watermelon",
  "Grapes",
  "Strawberry",
  "Coconut",
  "Tea",
  "Coffee",
  "Milk",
  "Milkshake",
  "Juice",
  "Lemonade",

  // Vehicles
  "Car",
  "Bus",
  "School Bus",
  "Metro Train",
  "Train",
  "Bullet Train",
  "Airplane",
  "Helicopter",
  "Bicycle",
  "Motorcycle",
  "Scooter",
  "Auto Rickshaw",
  "Taxi",
  "Ambulance",
  "Fire Engine",
  "Truck",
  "Tractor",
  "Boat",
  "Ship",
  "Ferry",
  "Tesla",
  "Ferrari",
  "Lamborghini",
  "BMW",
  "Mercedes",
  "Toyota",
  "Honda",
  "Hyundai",
  "Tata",
  "Mahindra",

  // Places
  "Airport",
  "Railway Station",
  "Bus Stop",
  "Metro Station",
  "College",
  "School",
  "Classroom",
  "Library",
  "Laboratory",
  "Canteen",
  "Playground",
  "Hospital",
  "Pharmacy",
  "Restaurant",
  "Hotel",
  "Shopping Mall",
  "Supermarket",
  "Bakery",
  "Coffee Shop",
  "Cinema",
  "Stadium",
  "Beach",
  "Park",
  "Zoo",
  "Museum",
  "Aquarium",
  "Temple",
  "Church",
  "Mosque",
  "Bank",
  "Post Office",
  "Police Station",
  "Petrol Station",
  "Gym",
  "Swimming Pool",
  "Barber Shop",
  "Beauty Salon",

  // College / school
  "Notebook",
  "Textbook",
  "Pen",
  "Pencil",
  "Eraser",
  "Sharpener",
  "Ruler",
  "Compass",
  "School Bag",
  "Blackboard",
  "Whiteboard",
  "Marker",
  "Chalk",
  "Desk",
  "Bench",
  "Exam",
  "Homework",
  "Assignment",
  "Project",
  "Presentation",
  "Attendance",
  "ID Card",
  "Certificate",
  "Library Card",

  // Sports / games
  "Cricket",
  "Cricket Bat",
  "Cricket Ball",
  "Football",
  "Basketball",
  "Volleyball",
  "Badminton",
  "Tennis",
  "Table Tennis",
  "Hockey",
  "Chess",
  "Carrom",
  "Swimming",
  "Running",
  "Cycling",
  "Skipping Rope",
  "Goalpost",
  "Stadium",
  "Scoreboard",
  "Trophy",
  "Medal",
  "Jersey",
  "PlayStation",
  "Xbox",
  "Nintendo Switch",

  // Home
  "Sofa",
  "Bed",
  "Pillow",
  "Blanket",
  "Mattress",
  "Chair",
  "Table",
  "Dining Table",
  "Cupboard",
  "Mirror",
  "Fan",
  "Ceiling Fan",
  "Air Conditioner",
  "Refrigerator",
  "Washing Machine",
  "Microwave",
  "Mixer Grinder",
  "Gas Stove",
  "Pressure Cooker",
  "Plate",
  "Spoon",
  "Fork",
  "Glass",
  "Water Bottle",
  "Bucket",
  "Mug",
  "Towel",
  "Toothbrush",
  "Toothpaste",
  "Soap",
  "Shampoo",
  "Comb",
  "Door",
  "Window",
  "Curtain",
  "Doorbell",
  "Light Bulb",

  // Animals
  "Dog",
  "Cat",
  "Cow",
  "Goat",
  "Horse",
  "Elephant",
  "Tiger",
  "Lion",
  "Leopard",
  "Monkey",
  "Rabbit",
  "Deer",
  "Giraffe",
  "Zebra",
  "Bear",
  "Panda",
  "Kangaroo",
  "Camel",
  "Dolphin",
  "Whale",
  "Shark",
  "Octopus",
  "Penguin",
  "Parrot",
  "Peacock",
  "Crow",
  "Pigeon",
  "Eagle",
  "Butterfly",
  "Honey Bee",

  // Nature / everyday
  "Rain",
  "Rainbow",
  "Cloud",
  "Thunder",
  "Lightning",
  "Sun",
  "Moon",
  "Star",
  "Mountain",
  "River",
  "Waterfall",
  "Forest",
  "Island",
  "Ocean",
  "Lake",
  "Flower",
  "Rose",
  "Tree",
  "Coconut Tree",
  "Sand",
  "Snow",
  "Fire",
  "Shadow",

  // Entertainment / common activities
  "Movie",
  "Cinema Ticket",
  "Music",
  "Song",
  "Dance",
  "Guitar",
  "Piano",
  "Drum",
  "Birthday",
  "Birthday Cake",
  "Gift",
  "Party",
  "Selfie",
  "Photo",
  "Video",
  "Gaming",
  "Shopping",
  "Cooking",
  "Drawing",
  "Painting",
  "Reading",
  "Travelling",
  "Camping",
  "Picnic"
];

const GENERIC_WORDS_TO_SKIP = new Set(
  `
  ability
  action
  activity
  amount
  area
  case
  change
  condition
  control
  course
  data
  development
  effect
  example
  fact
  form
  group
  information
  issue
  kind
  level
  matter
  means
  method
  number
  order
  part
  period
  point
  problem
  process
  reason
  result
  role
  section
  situation
  state
  system
  thing
  things
  type
  use
  value
  way
  year
  years
  `.trim().split(/\s+/)
);

const SAFETY_WORDS_TO_SKIP = new Set(
  `
  alcohol
  beer
  cigarette
  cocaine
  heroin
  marijuana
  nicotine
  porn
  pornography
  tobacco
  vape
  vodka
  whiskey
  wine
  bomb
  gun
  pistol
  rifle
  knife
  grenade
  `.trim().split(/\s+/)
);

function normalizeKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function displaySingleWord(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function isAcceptableCorpusWord(word, nounSet) {
  if (!/^[a-z]{3,18}$/.test(word)) {
    return false;
  }

  if (!nounSet.has(word)) {
    return false;
  }

  if (GENERIC_WORDS_TO_SKIP.has(word)) {
    return false;
  }

  if (SAFETY_WORDS_TO_SKIP.has(word)) {
    return false;
  }

  return true;
}

const nounSet = new Set(
  nounWords
    .map((word) => String(word).trim().toLowerCase())
    .filter((word) => /^[a-z]+$/.test(word))
);

const rankedWords = popularWordsApi
  .getAll()
  .map((word) => String(word).trim().toLowerCase());

const finalWords = [];
const seen = new Set();

function addWord(word) {
  const cleanWord = String(word).trim();

  if (!cleanWord) {
    return;
  }

  const key = normalizeKey(cleanWord);

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  finalWords.push(cleanWord);
}

// Guaranteed familiar/specific concepts are added first.
for (const concept of CURATED_CONCEPTS) {
  addWord(concept);
}

// Then fill the bank with common nouns ordered by popularity.
for (const word of rankedWords) {
  if (finalWords.length >= TARGET_WORD_COUNT) {
    break;
  }

  if (!isAcceptableCorpusWord(word, nounSet)) {
    continue;
  }

  addWord(displaySingleWord(word));
}

if (finalWords.length < 10000) {
  throw new Error(
    `Only ${finalWords.length} usable concepts were generated. ` +
      "Expected at least 10,000."
  );
}

const outputDirectory = path.join(
  process.cwd(),
  "public",
  "data"
);

fs.mkdirSync(outputDirectory, {
  recursive: true,
});

const outputPath = path.join(
  outputDirectory,
  "word-bank.json"
);

const output = {
  version: 1,
  count: finalWords.length,
  words: finalWords,
};

fs.writeFileSync(
  outputPath,
  JSON.stringify(output),
  "utf8"
);

console.log("");
console.log("==========================================");
console.log(" IMPOSTER WORD BANK BUILT SUCCESSFULLY");
console.log("==========================================");
console.log("");
console.log(
  `Total concepts: ${finalWords.length.toLocaleString("en-US")}`
);
console.log(
  `Curated concepts: ${CURATED_CONCEPTS.length.toLocaleString("en-US")}`
);
console.log(`Saved to: ${outputPath}`);
console.log("");
console.log("Sample concepts:");
console.log(finalWords.slice(0, 25).join(", "));
console.log("");