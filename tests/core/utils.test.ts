import { describe, expect, it } from "vitest";
import { normalizeDateKey } from "../../src/utils/date";
import { addDecimal, decimalToNumber2, parseDecimal } from "../../src/utils/decimal";
import { normalizeMatrix } from "../../src/utils/matrix";
import { isBlankValue, normalizeText } from "../../src/utils/text";

describe("text utilities", () => {
  it("normalizes text and detects blanks", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
    expect(normalizeText("  公司  ")).toBe("公司");
    expect(isBlankValue("   ")).toBe(true);
    expect(isBlankValue("0")).toBe(false);
  });
});

describe("date utilities", () => {
  it("normalizes Date, Excel serial, and supported text dates", () => {
    expect(normalizeDateKey("")).toBe("");
    expect(normalizeDateKey(new Date(2026, 4, 1))).toBe("2026-05-01");
    expect(normalizeDateKey(45000)).toBe("2023-03-15");
    expect(normalizeDateKey("2026.5.1 15:03:09")).toBe("2026-05-01");
  });

  it("rejects invalid dates", () => {
    expect(() => normalizeDateKey("2026/2/30")).toThrow(/日期格式不正确/);
    expect(() => normalizeDateKey("abc")).toThrow(/日期格式不正确/);
  });
});

describe("decimal utilities", () => {
  it("parses strict numeric text and calculates without floating drift", () => {
    const left = parseDecimal("0.1", "数量");
    const right = parseDecimal("0.2", "数量");

    expect(decimalToNumber2(addDecimal(left, right))).toBe(0.3);
    expect(decimalToNumber2(parseDecimal("1,234.567", "金额"))).toBe(1234.57);
  });

  it("rejects malformed numeric text", () => {
    expect(() => parseDecimal("1,,2", "数量")).toThrow(/数量数值格式不正确/);
    expect(() => parseDecimal("abc", "金额")).toThrow(/金额数值格式不正确/);
  });
});

describe("matrix utilities", () => {
  it("normalizes scalar, one-dimensional arrays, matrices, and WPS numeric objects", () => {
    expect(normalizeMatrix("x")).toEqual([["x"]]);
    expect(normalizeMatrix(["A", "B"])).toEqual([["A", "B"]]);
    expect(normalizeMatrix([["A"], ["B"]])).toEqual([["A"], ["B"]]);
    expect(
      normalizeMatrix({
        "1": { "1": "表单编号", "2": "数量" },
        "2": { "1": "F001", "2": 3 }
      })
    ).toEqual([
      ["表单编号", "数量"],
      ["F001", 3]
    ]);
  });
});
