import { describe, expect, it } from "vitest";
import { deunaAuth, deunaImage, humanSize } from "./deuna";

const req = (key?: string) => new Request("http://localhost/api/deuna/v1/stores", { headers: key ? { "x-api-key": key } : {} });

describe("deunaAuth", () => {
  it("fails closed without a configured key", () => {
    expect(deunaAuth(req("anything"), {})).toBe("unconfigured");
    expect(deunaAuth(req("anything"), { DEUNA_API_KEY: " , " })).toBe("unconfigured");
  });

  it("accepts any key of a comma-separated list, and nothing else", () => {
    const env = { DEUNA_API_KEY: "alpha-key, beta-key" };
    expect(deunaAuth(req("alpha-key"), env)).toBeNull();
    expect(deunaAuth(req("beta-key"), env)).toBeNull();
    expect(deunaAuth(req(), env)).toBe("unauthorized");
    expect(deunaAuth(req("alpha"), env)).toBe("unauthorized");
    expect(deunaAuth(req("alpha-key, beta-key"), env)).toBe("unauthorized");
  });
});

describe("deunaImage", () => {
  it("links the store's VTEX photo at 400 px, and nothing else", () => {
    expect(deunaImage("https://exito.vteximg.com.br/arquivos/ids/1234567-1000-1000/arroz.jpg")).toBe(
      "https://exito.vteximg.com.br/arquivos/ids/1234567-400-400/arroz.jpg",
    );
    expect(deunaImage("https://jumbocolombiaio.vtexassets.com/arquivos/ids/98765/huevos.png")).toBe(
      "https://jumbocolombiaio.vtexassets.com/arquivos/ids/98765-400-400/huevos.png",
    );
    expect(deunaImage(null)).toBeNull();
    expect(deunaImage("http://exito.vteximg.com.br/arquivos/ids/1/a.jpg")).toBeNull();
    expect(deunaImage("https://example.com/a.jpg")).toBeNull();
    expect(deunaImage("not a url")).toBeNull();
  });
});

describe("humanSize", () => {
  it("says sizes the way people do", () => {
    expect(humanSize("500.000", "g")).toBe("500 g");
    expect(humanSize("1000.000", "g")).toBe("1 kg");
    expect(humanSize("1500.000", "ml")).toBe("1,5 L");
    expect(humanSize("750.000", "ml")).toBe("750 ml");
    expect(humanSize("6.000", "unit")).toBe("6 und");
    expect(humanSize(null, "g")).toBeNull();
    expect(humanSize("0", "g")).toBeNull();
  });
});
