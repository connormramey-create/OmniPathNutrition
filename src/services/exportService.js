import { Document, Packer, Paragraph, HeadingLevel } from "docx";
import { saveAs } from "file-saver";
import { formatPurchaseQty } from "./retailService";

// planEntries: weeklyPlan entries ({ day, slot, servings, mealData })
// recipeNotes: optional { [recipeId]: { text } } – the user's personal notes
// nameFor: optional (personId, fallbackName) => display name, for household portions
export async function exportMealPlanToWord(planTitle, planEntries, groceryItems, recipeNotes = {}, nameFor = (_id, n) => n) {
  const fmt = n => Math.round(n || 0);

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: planTitle, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: "Generated via OmniPath Nutrition" }),

        new Paragraph({ text: "Shopping List", heading: HeadingLevel.HEADING_2 }),
        ...groceryItems.map(item => new Paragraph({
          text: `${item.name}: ${formatPurchaseQty(item)}`,
          bullet: { level: 0 }
        })),

        new Paragraph({ text: "Meal Schedule", heading: HeadingLevel.HEADING_2 }),
        ...planEntries.flatMap(entry => {
          const r = entry.mealData || {};
          const s = entry.servings || r.servings || 1;
          const per = r.perServing || r.macros || {};
          return [
            new Paragraph({ text: `${entry.day} ${entry.slot}: ${r.name}`, heading: HeadingLevel.HEADING_3 }),
            ...(entry.portions?.length > 1
              ? [
                  new Paragraph({ text: `${s} serving(s) total` }),
                  ...entry.portions.map(p => new Paragraph({
                    text: `${nameFor(p.personId, p.name)}: ${p.servings} serving(s) · ${fmt(per.calories * p.servings)} kcal | P: ${fmt(per.protein * p.servings)}g | C: ${fmt(per.carbs * p.servings)}g | F: ${fmt(per.fat * p.servings)}g`,
                    bullet: { level: 0 }
                  }))
                ]
              : [new Paragraph({
                  text: `${s} serving(s) · ${fmt(per.calories * s)} kcal | P: ${fmt(per.protein * s)}g | C: ${fmt(per.carbs * s)}g | F: ${fmt(per.fat * s)}g`
                })]),
            new Paragraph({ text: `Instructions: ${r.instructions || 'Prepare as desired.'}` }),
            ...(recipeNotes[r.id]?.text ? [new Paragraph({ text: `My notes: ${recipeNotes[r.id].text}` })] : [])
          ];
        })
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${planTitle.replace(/\s+/g, '_')}.docx`);
}
