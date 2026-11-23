// The 5 concepts from the assignment. `text` is given to the model word for word.
// `requiredLabels` powers our own check (#5): each entry is a regex, and at least
// one <text> in the SVG must match it. These are the words a GCSE student must see.

export type Concept = {
  id: string;
  name: string;
  subject: string;
  text: string;
  requiredLabels: { label: string; pattern: RegExp }[];
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
  },
  {
    id: "series-circuit",
    name: "Series circuit",
    subject: "Physics",
    text: "In a series circuit there is only one loop. The current is the same everywhere in the loop. The voltage of the cell is shared between the components.",
    requiredLabels: [
      { label: "cell", pattern: /\bcell\b|battery/i },
      { label: "current", pattern: /current/i },
      { label: "voltage", pattern: /voltage|\bV\b/i },
    ],
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
  },
];

export function getConcept(id: string): Concept | undefined {
  return CONCEPTS.find((c) => c.id === id);
}
