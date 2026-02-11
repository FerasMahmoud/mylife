/**
 * Food Search module for MyLife PWA
 * Uses API Ninjas nutrition API with a built-in fallback database of ~50 common foods.
 * Provides window.FoodSearch.
 */
window.FoodSearch = {
  _apiKey: '',

  /**
   * Initialize by loading API key from localStorage.
   */
  init() {
    this._apiKey = localStorage.getItem('mylife-food-api-key') || '';
  },

  /**
   * Set and persist the API Ninjas API key.
   * @param {string} key - API key from api-ninjas.com
   */
  setApiKey(key) {
    this._apiKey = key;
    localStorage.setItem('mylife-food-api-key', key);
  },

  /**
   * Search for food nutrition data.
   * Uses API Ninjas if key is set, otherwise falls back to built-in database.
   * @param {string} query - Food name to search for
   * @returns {Promise<Array<{name, calories, protein, carbs, fat, fiber, serving}>>}
   */
  async search(query) {
    if (!query || query.length < 2) return [];

    // If no API key, use fallback
    if (!this._apiKey) {
      return this._fallbackSearch(query);
    }

    try {
      const response = await fetch(
        `https://api.api-ninjas.com/v1/nutrition?query=${encodeURIComponent(query)}`,
        {
          headers: { 'X-Api-Key': this._apiKey }
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      return data.map(item => ({
        name: item.name,
        calories: Math.round(item.calories),
        protein: Math.round(item.protein_g * 10) / 10,
        carbs: Math.round(item.carbs_total_g * 10) / 10,
        fat: Math.round(item.fat_total_g * 10) / 10,
        fiber: Math.round(item.fiber_g * 10) / 10,
        serving: `${item.serving_size_g}g`
      }));
    } catch (err) {
      console.error('Food search error:', err);
      return this._fallbackSearch(query);
    }
  },

  /**
   * Built-in database of ~50 common foods with approximate nutrition per serving.
   * Used when no API key is configured or when the API is unavailable.
   * @param {string} query - Food name to search for
   * @returns {Array<{name, calories, protein, carbs, fat, fiber, serving}>}
   */
  _fallbackSearch(query) {
    const foods = [
      { name: 'banana', calories: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, serving: '100g' },
      { name: 'apple', calories: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, serving: '100g' },
      { name: 'chicken breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, serving: '100g' },
      { name: 'white rice', calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, serving: '100g' },
      { name: 'brown rice', calories: 112, protein: 2.3, carbs: 24, fat: 0.8, fiber: 1.8, serving: '100g' },
      { name: 'egg', calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0, serving: '100g' },
      { name: 'milk', calories: 42, protein: 3.4, carbs: 5, fat: 1, fiber: 0, serving: '100g' },
      { name: 'bread', calories: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7, serving: '100g' },
      { name: 'salmon', calories: 208, protein: 20, carbs: 0, fat: 13, fiber: 0, serving: '100g' },
      { name: 'broccoli', calories: 34, protein: 2.8, carbs: 7, fat: 0.4, fiber: 2.6, serving: '100g' },
      { name: 'sweet potato', calories: 86, protein: 1.6, carbs: 20, fat: 0.1, fiber: 3, serving: '100g' },
      { name: 'oatmeal', calories: 68, protein: 2.4, carbs: 12, fat: 1.4, fiber: 1.7, serving: '100g' },
      { name: 'yogurt', calories: 59, protein: 10, carbs: 3.6, fat: 0.4, fiber: 0, serving: '100g' },
      { name: 'avocado', calories: 160, protein: 2, carbs: 9, fat: 15, fiber: 7, serving: '100g' },
      { name: 'almonds', calories: 579, protein: 21, carbs: 22, fat: 50, fiber: 12, serving: '100g' },
      { name: 'pasta', calories: 131, protein: 5, carbs: 25, fat: 1.1, fiber: 1.8, serving: '100g' },
      { name: 'beef steak', calories: 271, protein: 26, carbs: 0, fat: 18, fiber: 0, serving: '100g' },
      { name: 'tuna', calories: 132, protein: 28, carbs: 0, fat: 1.3, fiber: 0, serving: '100g' },
      { name: 'orange', calories: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4, serving: '100g' },
      { name: 'spinach', calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, serving: '100g' },
      { name: 'cheese', calories: 402, protein: 25, carbs: 1.3, fat: 33, fiber: 0, serving: '100g' },
      { name: 'peanut butter', calories: 588, protein: 25, carbs: 20, fat: 50, fiber: 6, serving: '100g' },
      { name: 'potato', calories: 77, protein: 2, carbs: 17, fat: 0.1, fiber: 2.2, serving: '100g' },
      { name: 'coffee', calories: 2, protein: 0.3, carbs: 0, fat: 0, fiber: 0, serving: '240ml' },
      { name: 'tea', calories: 1, protein: 0, carbs: 0.3, fat: 0, fiber: 0, serving: '240ml' },
      { name: 'honey', calories: 304, protein: 0.3, carbs: 82, fat: 0, fiber: 0.2, serving: '100g' },
      { name: 'olive oil', calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, serving: '100g' },
      { name: 'lentils', calories: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 7.9, serving: '100g' },
      { name: 'chickpeas', calories: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6, serving: '100g' },
      { name: 'turkey', calories: 189, protein: 29, carbs: 0, fat: 7, fiber: 0, serving: '100g' },
      { name: 'shrimp', calories: 99, protein: 24, carbs: 0.2, fat: 0.3, fiber: 0, serving: '100g' },
      { name: 'tofu', calories: 76, protein: 8, carbs: 1.9, fat: 4.8, fiber: 0.3, serving: '100g' },
      { name: 'watermelon', calories: 30, protein: 0.6, carbs: 8, fat: 0.2, fiber: 0.4, serving: '100g' },
      { name: 'grapes', calories: 69, protein: 0.7, carbs: 18, fat: 0.2, fiber: 0.9, serving: '100g' },
      { name: 'strawberry', calories: 32, protein: 0.7, carbs: 8, fat: 0.3, fiber: 2, serving: '100g' },
      { name: 'mango', calories: 60, protein: 0.8, carbs: 15, fat: 0.4, fiber: 1.6, serving: '100g' },
      { name: 'carrot', calories: 41, protein: 0.9, carbs: 10, fat: 0.2, fiber: 2.8, serving: '100g' },
      { name: 'tomato', calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, serving: '100g' },
      { name: 'cucumber', calories: 15, protein: 0.7, carbs: 3.6, fat: 0.1, fiber: 0.5, serving: '100g' },
      { name: 'hummus', calories: 166, protein: 8, carbs: 14, fat: 10, fiber: 6, serving: '100g' },
      { name: 'dark chocolate', calories: 546, protein: 5, carbs: 60, fat: 31, fiber: 7, serving: '100g' },
      { name: 'popcorn', calories: 375, protein: 11, carbs: 74, fat: 4.3, fiber: 15, serving: '100g' },
      { name: 'pizza', calories: 266, protein: 11, carbs: 33, fat: 10, fiber: 2.3, serving: '100g' },
      { name: 'burger', calories: 295, protein: 17, carbs: 24, fat: 14, fiber: 1.3, serving: '100g' },
      { name: 'fries', calories: 312, protein: 3.4, carbs: 41, fat: 15, fiber: 3.8, serving: '100g' },
      { name: 'ice cream', calories: 207, protein: 3.5, carbs: 24, fat: 11, fiber: 0.7, serving: '100g' },
      { name: 'soda', calories: 41, protein: 0, carbs: 10.6, fat: 0, fiber: 0, serving: '240ml' },
      { name: 'orange juice', calories: 45, protein: 0.7, carbs: 10, fat: 0.2, fiber: 0.2, serving: '240ml' },
      { name: 'protein shake', calories: 120, protein: 25, carbs: 3, fat: 1, fiber: 1, serving: '1 scoop' },
      { name: 'granola', calories: 471, protein: 10, carbs: 64, fat: 20, fiber: 7, serving: '100g' }
    ];

    const q = query.toLowerCase();
    return foods.filter(f => f.name.includes(q));
  }
};

// Auto-init on load
FoodSearch.init();
