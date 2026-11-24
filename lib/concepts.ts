// The 5 concepts from the assignment. `text` is given to the model word for word.
// `requiredLabels` powers our own check (#5): each entry is a regex, and at least
// one <text> in the SVG must match it. These are the words a GCSE student must see.
// `visualBrief` is our own art direction: what a good GCSE diagram of this looks like
// and what the animation should teach. It is added to the prompt after the brief's text.

export type Concept = {
  id: string;
  name: string;
  subject: string;
  text: string;
  requiredLabels: { label: string; pattern: RegExp }[];
  visualBrief: string;
  rules?: "closedCircuit"[]; // extra science rules checked in code (check #5)
};

export const CONCEPTS: Concept[] = [
  {
    id: "pythagoras",
    name: "Pythagoras' theorem",
    subject: "Maths",
    text: "In a right-angled triangle, the longest side is called the hypotenuse. The square of the hypotenuse is equal to the sum of the squares of the other two sides: a² + b² = c².",
    requiredLabels: [
      { label: "hypotenuse", pattern: /hypotenuse/i },
      { label: "a² + b² = c²", pattern: /a\s*(²|\^\s*2|2)\s*\+\s*b\s*(²|\^\s*2|2)\s*=\s*c\s*(²|\^\s*2|2)/i },
    ],
    visualBrief:
      "A right-angled triangle with sides a = 3, b = 4, c = 5 units, with a small square marking the right angle. Draw a square on each side (areas 9, 16 and 25), labelled a², b², c². Label the hypotenuse (the longest side, opposite the right angle). Animation: the squares on a and b pulse or fill one after the other, then the square on c fills, and the equation a² + b² = c² (9 + 16 = 25) appears. Keep the squares inside the frame: make the triangle small enough.",
  },
  {
    id: "circle",
    name: "Parts of a circle",
    subject: "Maths",
    text: "A circle has a centre. The radius is the distance from the centre to the edge. The diameter goes across the circle through the centre and is twice the radius. The circumference is the distance around the circle.",
    requiredLabels: [
      { label: "centre", pattern: /cent(re|er)/i },
      { label: "radius", pattern: /radius/i },
      { label: "diameter", pattern: /diameter/i },
      { label: "circumference", pattern: /circumference/i },
    ],
    visualBrief:
      "One large circle. Mark the centre with a dot. Draw a radius from the centre to the edge and a diameter across the circle through the centre, in different colours. Animation: the radius line sweeps around the centre, and a point travels around the edge to trace the circumference. Show diameter = 2 × radius as a text label.",
  },
  {
    id: "series-circuit",
    rules: ["closedCircuit"],
    name: "Series circuit",
    subject: "Physics",
    text: "In a series circuit there is only one loop. The current is the same everywhere in the loop. The voltage of the cell is shared between the components.",
    requiredLabels: [
      { label: "cell", pattern: /\bcell\b|battery/i },
      { label: "current", pattern: /current/i },
      { label: "voltage", pattern: /voltage|\bV\b/i },
    ],
    visualBrief:
      "A single rectangular loop of wire with a cell (long and short line symbol), two lamps (circle with a cross) and an ammeter (circle with A) in series. Animation: small dots (charge) move along the wire all the way round the loop at the same speed, showing the current is the same everywhere. Show ammeter readings that are equal (e.g. 0.2 A) at two points. Show the cell voltage (e.g. 6 V) and the voltage across each lamp (3 V + 3 V) to show it is shared. Layout: draw the loop as a rectangle from (90, 130) to (450, 430). Cell in the middle of the top wire, lamp 1 on the left wire, lamp 2 on the right wire, the two ammeters on the bottom wire. Put every label OUTSIDE the loop next to its component (above the top wire, left of the left wire, right of the right wire, below the bottom wire), never on a wire.",
  },
  {
    id: "photosynthesis",
    name: "Photosynthesis",
    subject: "Biology",
    text: "Plants take in carbon dioxide and water. They use light energy, absorbed by chlorophyll, to make glucose and oxygen.",
    requiredLabels: [
      { label: "carbon dioxide", pattern: /carbon\s*dioxide|CO\s*(2|₂)/i },
      { label: "water", pattern: /water|H\s*(2|₂)\s*O/i },
      { label: "light", pattern: /light/i },
      { label: "chlorophyll", pattern: /chlorophyll/i },
      { label: "glucose", pattern: /glucose/i },
      { label: "oxygen", pattern: /oxygen|O\s*(2|₂)/i },
    ],
    visualBrief:
      "A simple plant or leaf with a sun in a corner. Labelled arrows: carbon dioxide going into the leaf from the air, water going up from the roots, light energy from the sun to the leaf, and glucose and oxygen as products (oxygen arrow leaving the leaf). Mark chlorophyll in the leaf (green, labelled). Include the word equation: carbon dioxide + water → glucose + oxygen. Animation: the sun's rays pulse and small particles flow along the arrows.",
  },
  {
    id: "states-of-matter",
    name: "States of matter",
    subject: "Chemistry",
    text: "In a solid the particles are close together and vibrate in place. In a liquid they are close but move past each other. In a gas they are far apart and move fast.",
    requiredLabels: [
      { label: "solid", pattern: /solid/i },
      { label: "liquid", pattern: /liquid/i },
      { label: "gas", pattern: /\bgas\b/i },
    ],
    visualBrief:
      "Three boxes side by side, labelled solid, liquid and gas, each with circles for particles. Solid: particles packed in a regular grid, each vibrating in place (small back-and-forth). Liquid: particles close together but irregular, sliding past each other slowly. Gas: few particles far apart, moving fast in straight lines across the box. Every particle stays inside its own box during the animation. Add a short caption under each box.",
  },
];

export function getConcept(id: string): Concept | undefined {
  return CONCEPTS.find((c) => c.id === id);
}
