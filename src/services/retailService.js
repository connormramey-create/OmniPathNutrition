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

export function generatePublixInstacartLink(groceryItems) {
  const searchTerms = groceryItems.map(i => encodeURIComponent(i.name)).join(",");
  return `https://www.instacart.com/store/publix/search_v3/${searchTerms}`;
}
