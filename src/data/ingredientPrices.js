// src/data/ingredientPrices.js
// ROUGH average US grocery prices in USD per pound, used to ESTIMATE recipe cost
// for budget planning. These are not live store prices – there is no public price
// API for Kroger/Walmart/Publix that works from a static site. Edit freely to match
// your local stores. Order matters: the first keyword that matches wins, so keep
// specific entries (e.g. "chicken breast") above generic ones (e.g. "chicken").

export const PRICE_PER_LB = [
  // Pantry staples & seasonings (used in small amounts)
  ['water', 0],
  ['salt', 0.6], ['pepper flakes', 16], ['black pepper', 12], ['peppercorn', 12],
  ['vanilla', 60], ['saffron', 1500],
  ['cinnamon', 10], ['cumin', 12], ['paprika', 12], ['oregano', 14], ['thyme', 16],
  ['chili powder', 10], ['curry', 12], ['turmeric', 10], ['nutmeg', 20], ['ginger powder', 14],
  ['baking soda', 1.5], ['baking powder', 4], ['yeast', 8], ['cornstarch', 2.5],
  ['soy sauce', 4], ['vinegar', 2], ['mustard', 4], ['ketchup', 2.5], ['mayonnaise', 4.5], ['mayo', 4.5],
  ['hot sauce', 6], ['worcestershire', 6], ['fish sauce', 6], ['sriracha', 6], ['salsa', 4],
  ['honey', 7], ['maple syrup', 12], ['sugar', 1], ['flour', 0.7], ['cocoa', 9], ['chocolate', 8],

  // Oils & fats
  ['peanut butter', 3.5], ['almond butter', 9], ['olive oil', 7], ['coconut oil', 6], ['oil', 3], ['butter', 5], ['ghee', 12], ['shortening', 3],

  // Proteins
  ['chicken breast', 4], ['chicken thigh', 2.6], ['chicken', 3], ['turkey', 4.5],
  ['ground beef', 5.5], ['steak', 12], ['sirloin', 10], ['beef', 7],
  ['pork chop', 4.5], ['pork', 4], ['bacon', 7], ['ham', 5], ['sausage', 5], ['andouille', 6], ['chorizo', 6],
  ['lamb', 10], ['salmon', 11], ['tuna', 6], ['shrimp', 10], ['cod', 10], ['tilapia', 6],
  ['mussel', 6], ['crab', 20], ['scallop', 25], ['fish', 8],
  ['tofu', 2.5], ['tempeh', 6], ['eggplant', 2], ['egg', 2.2],

  // Dairy
  ['greek yogurt', 3.5], ['yogurt', 2.5], ['milk', 0.5], ['cream cheese', 5], ['heavy cream', 4.5], ['cream', 4],
  ['parmesan', 14], ['feta', 9], ['mozzarella', 6], ['cheddar', 6], ['goat cheese', 14], ['cheese', 7],

  // Grains, legumes, nuts
  ['rice', 1.2], ['quinoa', 4.5], ['oats', 2], ['oatmeal', 2], ['pasta', 1.6], ['spaghetti', 1.6], ['noodle', 2.5],
  ['bread', 3], ['tortilla', 3], ['bagel', 4], ['bun', 3.5],
  ['almond', 7], ['walnut', 8], ['pecan', 10], ['cashew', 9],
  ['peanut', 3.5], ['chia', 6], ['flax', 4], ['seed', 6], ['nutmeg', 20], ['nut', 8],
  ['lentil', 1.8], ['chickpea', 1.8], ['chick pea', 1.8], ['bean', 1.6], ['edamame', 3.5], ['peas', 2], ['green pea', 2],

  // Produce
  ['avocado', 2.5], ['berries', 5], ['blueberr', 5], ['strawberr', 3.5], ['raspberr', 7],
  ['banana', 0.65], ['apple', 1.8], ['orange', 1.5], ['lemon', 2], ['lime', 2], ['mango', 2], ['pineapple', 1.3],
  ['grape', 3], ['cranberr', 4], ['date', 7], ['raisin', 4],
  ['sweet potato', 1.3], ['potato', 1], ['onion', 1.2], ['garlic', 5], ['ginger', 4], ['shallot', 4],
  ['tomato', 2], ['carrot', 1], ['celery', 1.5], ['broccoli', 2.2], ['cauliflower', 2.2], ['cabbage', 0.9],
  ['spinach', 4.5], ['kale', 4], ['lettuce', 2.5], ['arugula', 7], ['cucumber', 1.5], ['zucchini', 1.8],
  ['courgette', 1.8], ['squash', 1.5], ['pumpkin', 1.2], ['bell pepper', 2.5], ['jalapeno', 2], ['pepper', 2.5],
  ['mushroom', 4], ['corn', 1.5], ['green bean', 2.5], ['asparagus', 4], ['eggplant', 2], ['beet', 1.5],
  ['parsley', 6], ['cilantro', 6], ['basil', 15], ['mint', 15], ['dill', 15], ['rosemary', 15], ['herb', 12],
  ['tomatillo', 2.5]
];

export const DEFAULT_PRICE_PER_LB = 3.5;

// Items most kitchens already have – hidden from the shopping list by default.
export const PANTRY_STAPLES = [
  'water', 'ice', 'salt', 'kosher salt', 'sea salt', 'pepper', 'black pepper', 'ground black pepper',
  'olive oil', 'extra-virgin olive oil', 'vegetable oil', 'canola oil', 'oil', 'cooking spray',
  'sugar', 'brown sugar', 'all-purpose flour', 'flour', 'baking soda', 'baking powder', 'vanilla extract',
  'cinnamon', 'cumin', 'paprika', 'oregano', 'thyme', 'chili powder', 'garlic powder', 'onion powder',
  'red pepper flakes', 'nutmeg', 'bay leaf', 'bay leaves', 'soy sauce', 'vinegar'
];
