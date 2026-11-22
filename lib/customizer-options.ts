export type CustomizerOption = {
  id: string;
  name: string;
  price: number;
  visual: boolean;
  color?: string;
  meta?: string;
};

export type CustomizerOptions = {
  finishes: CustomizerOption[];
  shapes: CustomizerOption[];
  designs: CustomizerOption[];
  cuts: CustomizerOption[];
  corners: CustomizerOption[];
  colors: CustomizerOption[];
  lensTypes: CustomizerOption[];
  protections: CustomizerOption[];
  afterWear: CustomizerOption[];
  engravingPrice: number;
};

export type CustomizerLineItem = {
  label: string;
  amount: number;
  base?: boolean;
};

export type CustomizerPricingInput = {
  framePrice: number;
  lensPrice: number;
  frameFinishId?: string | null;
  lensShape?: string | null;
  lensDesign?: string | null;
  lensCut?: string | null;
  cornerStyle?: string | null;
  lensColorId?: string | null;
  lensTypeId?: string | null;
  protectionIds?: string[] | null;
  afterWearIds?: string[] | null;
  engraving?: string | null;
  engravingPosition?: string | null;
};

export type CustomizerPricing = {
  total: number;
  lineItems: CustomizerLineItem[];
  frameFinishId: string;
  lensShape: string;
  lensDesign: string;
  lensCut: string;
  cornerStyle: string;
  lensColorId: string;
  lensTypeId: string;
  protectionIds: string[];
  afterWearIds: string[];
  engraving: string;
  engravingPosition: string;
};

const option = (
  id: string,
  name: string,
  price: number,
  visual = true,
  extra: { color?: string; meta?: string } = {},
): CustomizerOption => ({ id, name, price, visual, ...extra });

export const CUSTOMIZER_OPTIONS: CustomizerOptions = {
  finishes: [
    option("original", "Original", 0),
    option("silver", "Silver", 45, true, { color: "#c9cdd0" }),
    option("gold", "Gold", 75, true, { color: "#c8a64b" }),
    option("gunmetal", "Gunmetal", 30, true, { color: "#4d5153" }),
    option("rose-gold", "Rose gold", 65, true, { color: "#c58f82" }),
    option("crystal", "Crystal", 25, true, { color: "#d9d4c9" }),
  ],
  shapes: [
    option("soft-square", "Soft square", 0),
    option("round", "Round", 0),
    option("oval", "Oval", 0),
    option("rectangle", "Rectangle", 0),
    option("cat-eye", "Cat eye", 0),
    option("aviator", "Aviator", 0),
    option("butterfly", "Butterfly", 0),
    option("wayfarer", "Wayfarer", 0),
    option("hexagon", "Hexagon", 0),
    option("geometric", "Geometric", 0),
    option("shield", "Shield", 0),
    option("diamond", "Diamond", 0),
  ],
  designs: [
    option("regular", "Regular cut", 0, true, { meta: "Clean, classic edge" }),
    option("diamond", "Diamond cut", 95, true, { meta: "Hand-faceted edge" }),
  ],
  cuts: [
    option("classic", "Classic", 0, true, { meta: "Balanced profile" }),
    option("bevel", "Bevel", 35, true, { meta: "Fine angled edge" }),
    option("step", "Stepped", 55, true, { meta: "Architectural layers" }),
    option("faceted", "Faceted", 70, true, { meta: "Light-catching planes" }),
    option("contour", "Contour", 85, true, { meta: "Sculpted outer edge" }),
  ],
  corners: [
    option("soft", "Soft", 0),
    option("crisp", "Crisp", 0),
    option("chiseled", "Chiseled", 0),
    option("rounded", "Rounded", 0),
    option("micro", "Micro", 0),
    option("exaggerated", "Exaggerated", 0),
    option("sculpted", "Sculpted", 0),
    option("crown", "Crown", 0),
  ],
  colors: [
    option("clear", "Clear", 0, true, { color: "#eef2f0" }),
    option("blue", "Blue", 20, true, { color: "#5d8fa7" }),
    option("green", "Green", 20, true, { color: "#667e6a" }),
    option("gold", "Gold", 25, true, { color: "#b79a58" }),
    option("white", "White", 0, true, { color: "#f5f3ed" }),
    option("grey", "Grey", 15, true, { color: "#6d7476" }),
    option("smoke", "Smoke", 25, true, { color: "#3f4a50" }),
    option("rose", "Rose", 25, true, { color: "#a97578" }),
    option("amber", "Amber", 25, true, { color: "#b97e4d" }),
  ],
  lensTypes: [
    option("non-prescription", "Non-prescription", 0, true, { meta: "Fashion tint or clear" }),
    option("prescription", "Prescription", 85, true, { meta: "Made to your power" }),
    option("readers", "Readers", 45, true, { meta: "Everyday near vision" }),
  ],
  protections: [
    option("uv", "UV protection", 0, false, { meta: "Blocks UVA + UVB rays" }),
    option("blue-light", "Blue-light filter", 35, true, { meta: "Softens screen glare" }),
    option("polarized", "Polarized", 45, true, { meta: "Cuts reflective glare" }),
    option("anti-reflective", "Anti-reflective", 25, true, { meta: "Clearer, cleaner optics" }),
    option("scratch-resistant", "Scratch resistant", 0, false, { meta: "Adds daily durability" }),
  ],
  afterWear: [
    option("fit-check", "Complimentary fit check", 0, false, {
      meta: "A final fit review before dispatch",
    }),
    option("travel-case", "Signature travel case", 35, false, {
      meta: "Protective case in soft leather",
    }),
    option("care-kit", "Lens care kit", 18, false, {
      meta: "Cloth, spray and storage pouch",
    }),
  ],
  engravingPrice: 35,
};

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ");

export function resolveCustomizerOption(
  list: CustomizerOption[],
  value: unknown,
  fallbackId: string,
): CustomizerOption {
  const raw = String(value ?? "").trim();
  if (raw) {
    const direct = list.find((item) => item.id === raw);
    if (direct) return direct;
    const key = normalizeKey(raw);
    const named = list.find((item) => normalizeKey(item.name) === key);
    if (named) return named;
  }
  return list.find((item) => item.id === fallbackId) ?? list[0];
}

const resolveOptionList = (
  list: CustomizerOption[],
  values: unknown,
  fallbackId: string,
): CustomizerOption[] => {
  if (!Array.isArray(values)) {
    const fallback = list.find((item) => item.id === fallbackId);
    return fallback ? [fallback] : [];
  }
  const resolved: CustomizerOption[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const item = resolveCustomizerOption(list, value, fallbackId);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      resolved.push(item);
    }
  }
  if (!resolved.length) {
    const fallback = list.find((item) => item.id === fallbackId);
    if (fallback) resolved.push(fallback);
  }
  return resolved;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function computeCustomizerPricing(input: CustomizerPricingInput): CustomizerPricing {
  const framePrice = Math.max(0, Number(input.framePrice) || 0);
  const lensPrice = Math.max(0, Number(input.lensPrice) || 0);
  const finish = resolveCustomizerOption(
    CUSTOMIZER_OPTIONS.finishes,
    input.frameFinishId,
    "original",
  );
  const shape = resolveCustomizerOption(CUSTOMIZER_OPTIONS.shapes, input.lensShape, "soft-square");
  const design = resolveCustomizerOption(
    CUSTOMIZER_OPTIONS.designs,
    input.lensDesign,
    "regular",
  );
  const cut = resolveCustomizerOption(CUSTOMIZER_OPTIONS.cuts, input.lensCut, "classic");
  const corner = resolveCustomizerOption(
    CUSTOMIZER_OPTIONS.corners,
    input.cornerStyle,
    "soft",
  );
  const color = resolveCustomizerOption(CUSTOMIZER_OPTIONS.colors, input.lensColorId, "clear");
  const lensType = resolveCustomizerOption(
    CUSTOMIZER_OPTIONS.lensTypes,
    input.lensTypeId,
    "non-prescription",
  );
  const protections = resolveOptionList(CUSTOMIZER_OPTIONS.protections, input.protectionIds, "uv");
  const afterWear = resolveOptionList(CUSTOMIZER_OPTIONS.afterWear, input.afterWearIds, "fit-check");
  const engraving = String(input.engraving ?? "")
    .trim()
    .slice(0, 16);
  const engravingPosition = ["temple", "bridge", "inner-rim"].includes(
    String(input.engravingPosition ?? ""),
  )
    ? String(input.engravingPosition)
    : "temple";

  const lineItems: CustomizerLineItem[] = [
    { label: "Frame", amount: framePrice, base: true },
    { label: "Lens", amount: lensPrice, base: true },
    { label: `${finish.name} finish`, amount: finish.price },
    { label: `${shape.name} lens shape`, amount: shape.price },
    { label: design.name, amount: design.price },
    { label: `${cut.name} lens cut`, amount: cut.price },
    { label: `${corner.name} corners`, amount: corner.price },
    { label: `${color.name} lens color`, amount: color.price },
    { label: lensType.name, amount: lensType.price },
    ...protections.map((item) => ({ label: item.name, amount: item.price })),
    ...(engraving
      ? [{ label: "Personal engraving", amount: CUSTOMIZER_OPTIONS.engravingPrice }]
      : []),
    ...afterWear.map((item) => ({ label: item.name, amount: item.price })),
  ];

  return {
    total: roundMoney(lineItems.reduce((sum, item) => sum + item.amount, 0)),
    lineItems: lineItems.map((item) => ({ ...item, amount: roundMoney(item.amount) })),
    frameFinishId: finish.id,
    lensShape: shape.id,
    lensDesign: design.id,
    lensCut: cut.id,
    cornerStyle: corner.id,
    lensColorId: color.id,
    lensTypeId: lensType.id,
    protectionIds: protections.map((item) => item.id),
    afterWearIds: afterWear.map((item) => item.id),
    engraving,
    engravingPosition,
  };
}
