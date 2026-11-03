import { beforeEach, describe, expect, it } from "vitest";
import { getKeepOriginals, getVideoEndCard, setKeepOriginals, setVideoEndCard } from "./settings";

beforeEach(() => localStorage.clear());

describe("device preferences", () => {
  it("adds the app card to videos unless it was switched off", () => {
    expect(getVideoEndCard()).toBe(true); // default: on
    setVideoEndCard(false);
    expect(getVideoEndCard()).toBe(false);
    setVideoEndCard(true);
    expect(getVideoEndCard()).toBe(true);
  });

  it("downscales photos by default and remembers the choice to keep originals", () => {
    expect(getKeepOriginals()).toBe(false);
    setKeepOriginals(true);
    expect(getKeepOriginals()).toBe(true);
  });
});
