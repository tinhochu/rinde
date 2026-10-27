/**
 * Canonical produce items. Each chain codes produce privately (D1 "7700304945955", Jumbo "116",
 * Éxito "7701001051086" for a banana), so receipts are compared through these instead.
 * Aliases are normalized words a receipt line starts with; longer aliases are tried first.
 */
export interface ProduceDef {
  slug: string;
  name: string;
  aliases: string[];
  defaultUnit: "kg" | "unit";
}

export const PRODUCE: ProduceDef[] = [
  { slug: "banano", name: "Banano", aliases: ["banano", "bananito", "guineo", "banana"], defaultUnit: "kg" },
  { slug: "platano", name: "Plátano", aliases: ["platano", "platano harton", "platano maduro", "platano verde"], defaultUnit: "kg" },
  { slug: "tomate", name: "Tomate chonto", aliases: ["tomate", "tomate chonto", "tomate milano", "tomate larga vida"], defaultUnit: "kg" },
  { slug: "tomate-de-arbol", name: "Tomate de árbol", aliases: ["tomate de arbol", "tomate arbol"], defaultUnit: "kg" },
  { slug: "papa", name: "Papa", aliases: ["papa", "papa pastusa", "papa negra", "papa sabanera", "papa capira", "papa r12"], defaultUnit: "kg" },
  { slug: "papa-criolla", name: "Papa criolla", aliases: ["papa criolla", "criolla"], defaultUnit: "kg" },
  { slug: "cebolla-cabezona", name: "Cebolla cabezona", aliases: ["cebolla cabezona", "cebolla blanca", "cebolla roja", "cebolla morada", "cebolla cab"], defaultUnit: "kg" },
  { slug: "cebolla-larga", name: "Cebolla larga", aliases: ["cebolla larga", "cebolla junca", "cebolla rama"], defaultUnit: "kg" },
  { slug: "zanahoria", name: "Zanahoria", aliases: ["zanahoria"], defaultUnit: "kg" },
  { slug: "aguacate", name: "Aguacate", aliases: ["aguacate", "aguacate hass", "aguacate papelillo", "aguacate lorena"], defaultUnit: "kg" },
  { slug: "limon", name: "Limón", aliases: ["limon", "limon tahiti", "limon mandarino", "limon comun"], defaultUnit: "kg" },
  { slug: "naranja", name: "Naranja", aliases: ["naranja", "naranja valencia", "naranja tangelo"], defaultUnit: "kg" },
  { slug: "mandarina", name: "Mandarina", aliases: ["mandarina", "mandarina arrayana", "mandarina oneco"], defaultUnit: "kg" },
  { slug: "manzana", name: "Manzana", aliases: ["manzana", "manzana roja", "manzana verde", "manzana gala", "manzana royal gala", "manzana anna"], defaultUnit: "kg" },
  { slug: "pera", name: "Pera", aliases: ["pera", "pera importada", "pera d anjou"], defaultUnit: "kg" },
  { slug: "mango", name: "Mango", aliases: ["mango", "mango tommy", "mango azucar", "mango de azucar"], defaultUnit: "kg" },
  { slug: "papaya", name: "Papaya", aliases: ["papaya", "papaya tainung", "papaya maradol"], defaultUnit: "kg" },
  { slug: "pina", name: "Piña", aliases: ["pina", "pina oro miel", "pina gold"], defaultUnit: "unit" },
  { slug: "fresa", name: "Fresa", aliases: ["fresa", "fresas"], defaultUnit: "kg" },
  { slug: "mora", name: "Mora", aliases: ["mora", "mora de castilla"], defaultUnit: "kg" },
  { slug: "maracuya", name: "Maracuyá", aliases: ["maracuya"], defaultUnit: "kg" },
  { slug: "lulo", name: "Lulo", aliases: ["lulo"], defaultUnit: "kg" },
  { slug: "guayaba", name: "Guayaba", aliases: ["guayaba", "guayaba manzana", "guayaba pera"], defaultUnit: "kg" },
  { slug: "granadilla", name: "Granadilla", aliases: ["granadilla"], defaultUnit: "kg" },
  { slug: "uva", name: "Uva", aliases: ["uva", "uva isabela", "uva red globe", "uva verde"], defaultUnit: "kg" },
  { slug: "patilla", name: "Patilla", aliases: ["patilla", "sandia"], defaultUnit: "kg" },
  { slug: "melon", name: "Melón", aliases: ["melon"], defaultUnit: "kg" },
  { slug: "pepino", name: "Pepino", aliases: ["pepino", "pepino cohombro", "pepino zukini"], defaultUnit: "kg" },
  { slug: "pimenton", name: "Pimentón", aliases: ["pimenton", "pimenton rojo", "pimenton verde"], defaultUnit: "kg" },
  { slug: "ajo", name: "Ajo", aliases: ["ajo", "ajo importado", "ajo nacional"], defaultUnit: "kg" },
  { slug: "cilantro", name: "Cilantro", aliases: ["cilantro"], defaultUnit: "unit" },
  { slug: "lechuga", name: "Lechuga", aliases: ["lechuga", "lechuga crespa", "lechuga batavia", "lechuga romana"], defaultUnit: "unit" },
  { slug: "repollo", name: "Repollo", aliases: ["repollo", "repollo blanco", "repollo morado"], defaultUnit: "kg" },
  { slug: "brocoli", name: "Brócoli", aliases: ["brocoli"], defaultUnit: "kg" },
  { slug: "coliflor", name: "Coliflor", aliases: ["coliflor"], defaultUnit: "kg" },
  { slug: "habichuela", name: "Habichuela", aliases: ["habichuela"], defaultUnit: "kg" },
  { slug: "arveja", name: "Arveja verde", aliases: ["arveja verde", "arveja desgranada"], defaultUnit: "kg" },
  { slug: "ahuyama", name: "Ahuyama", aliases: ["ahuyama", "zapallo"], defaultUnit: "kg" },
  { slug: "yuca", name: "Yuca", aliases: ["yuca"], defaultUnit: "kg" },
  { slug: "arracacha", name: "Arracacha", aliases: ["arracacha"], defaultUnit: "kg" },
  { slug: "remolacha", name: "Remolacha", aliases: ["remolacha"], defaultUnit: "kg" },
  { slug: "apio", name: "Apio", aliases: ["apio"], defaultUnit: "kg" },
  { slug: "calabacin", name: "Calabacín", aliases: ["calabacin", "zucchini"], defaultUnit: "kg" },
  { slug: "champinon", name: "Champiñón", aliases: ["champinon", "champinones"], defaultUnit: "kg" },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();

const ALIASES = PRODUCE.flatMap((p) => p.aliases.map((a) => ({ alias: a, item: p }))).sort((a, b) => b.alias.length - a.alias.length);

/**
 * The produce item a line names, when the line *starts* with a produce word: "BANANO URABA" is
 * banana, but "SALSA DE TOMATE" and "JUGO DE NARANJA" are not produce.
 */
export function matchProduce(lineText: string): ProduceDef | null {
  const t = norm(lineText);
  return ALIASES.find(({ alias }) => t === alias || t.startsWith(alias + " "))?.item ?? null;
}

/** Common receipt abbreviations, expanded before searching the catalog. Keys are normalized words. */
export const ABBREVIATIONS: Record<string, string> = {
  arz: "arroz", arr: "arroz", lch: "leche", lech: "leche", lec: "leche", hvo: "huevo", hvos: "huevos", huev: "huevos",
  azuc: "azucar", azu: "azucar", acte: "aceite", acei: "aceite", ace: "aceite", pan: "pan", panl: "panela", pnla: "panela",
  caf: "cafe", choc: "chocolate", chocol: "chocolate", galle: "galletas", gall: "galletas", gllt: "galletas",
  qso: "queso", ques: "queso", mant: "mantequilla", mtq: "mantequilla", yog: "yogurt", ygt: "yogurt",
  salch: "salchicha", salc: "salchicha", jam: "jamon", mort: "mortadela", pech: "pechuga", poll: "pollo",
  cne: "carne", carn: "carne", res: "res", cdo: "cerdo", atn: "atun", sard: "sardinas",
  frij: "frijol", frjl: "frijol", lent: "lenteja", garb: "garbanzo", harn: "harina", har: "harina",
  past: "pasta", spag: "spaghetti", ptas: "pastas", sal: "sal", vin: "vinagre", mayon: "mayonesa", may: "mayonesa",
  sals: "salsa", tom: "tomate", deter: "detergente", det: "detergente", suav: "suavizante", jab: "jabon",
  jbn: "jabon", lavl: "lavaloza", lavaloz: "lavaloza", blanq: "blanqueador", desinf: "desinfectante",
  ph: "papel higienico", pap: "papel", hig: "higienico", serv: "servilletas", shamp: "shampoo", sham: "shampoo",
  cr: "crema", dent: "dental", desod: "desodorante", gaseo: "gaseosa", gas: "gaseosa", gseo: "gaseosa",
  jug: "jugo", agu: "agua", cerv: "cerveza", beb: "bebida", ref: "refresco",
  und: "", un: "", x: "", gr: "g", grs: "g", kg: "kg", lt: "l", lts: "l", ml: "ml",
};

/** "ARZ DIANA 1KG" → "arroz diana 1kg": expand known abbreviations word by word. */
export function expandAbbreviations(lineText: string): string {
  return norm(lineText)
    .split(" ")
    .map((w) => (w in ABBREVIATIONS ? ABBREVIATIONS[w]! : w))
    .filter(Boolean)
    .join(" ");
}
