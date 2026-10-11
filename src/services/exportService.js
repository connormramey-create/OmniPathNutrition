import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell } from "docx";
import { saveAs } from "file-saver";

export async function exportMealPlanToWord(planTitle, recipes, groceryItems) {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: planTitle, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: "Generated via OmniPath Nutrition", bullet: { level: 0 } }),
        
        new Paragraph({ text: "Shopping List", heading: HeadingLevel.HEADING_2 }),
        ...groceryItems.map(item => new Paragraph({ text: `• ${item.name}: ${item.quantity} ${item.unit}` })),
        
        new Paragraph({ text: "Recipes & Meal Breakdown", heading: HeadingLevel.HEADING_2 }),
        ...recipes.flatMap(r => [
          new Paragraph({ text: r.title, heading: HeadingLevel.HEADING_3 }),
          new Paragraph({ text: `Calories: ${r.calories} kcal | P: ${r.protein}g | C: ${r.carbs}g | F: ${r.fat}g` }),
          new Paragraph({ text: `Instructions: ${r.instructions}` })
        ])
      ]
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${planTitle.replace(/\s+/g, '_')}.docx`);
}
