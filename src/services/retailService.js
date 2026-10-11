// src/services/retailService.js

// Kroger Direct Shopping Cart & List App Deep Link
export function generateKrogerCartLink(groceryItems) {
  if (!groceryItems || groceryItems.length === 0) return '#';
  
  // Format items into search query or direct cart add string
  const itemNames = groceryItems.map(i => encodeURIComponent(i.name.trim())).join('%20');
  
  // Mobile app deep-link with fallback to web list search
  return `https://www.kroger.com/search?query=${itemNames}&redirect=cart`;
}

// Kroger API Direct Cart Push (for authenticated users)
export async function syncToKrogerCart(groceryItems, userToken) {
  if (!userToken) throw new Error("Kroger OAuth token required.");
  
  const itemsPayload = groceryItems.map(item => ({
    upc: item.upc || "0000000000000",
    quantity: Math.ceil(item.amount)
  }));

  const response = await fetch("https://api.kroger.com/v1/cart/add", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${userToken}`
    },
    body: JSON.stringify({ items: itemsPayload })
  });

  if (!response.ok) throw new Error("Failed to push items to Kroger cart.");
  return await response.json();
}

// Walmart Direct App / Shopping List Redirect
export function generateWalmartListLink(groceryItems) {
  if (!groceryItems || groceryItems.length === 0) return '#';
  
  const query = groceryItems.map(i => i.name).join(', ');
  // Direct Walmart List & Search URL
  return `https://www.walmart.com/search?q=${encodeURIComponent(query)}`;
}

// Publix Storefront via Instacart Deep-Link Direct to Cart
export function generatePublixInstacartLink(groceryItems) {
  if (!groceryItems || groceryItems.length === 0) return '#';

  const searchTerms = groceryItems.map(i => encodeURIComponent(i.name)).join(",");
  return `https://www.instacart.com/store/publix/search_v3/${searchTerms}`;
}
