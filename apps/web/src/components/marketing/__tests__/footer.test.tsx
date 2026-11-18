import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Footer } from "../footer";

describe("Footer", () => {
  it("cross-promotes Float year-round with an attributed link", () => {
    render(<Footer />);
    const link = screen.getByRole("link", { name: "Float" });
    const url = new URL(link.getAttribute("href")!);
    expect(url.origin).toBe("https://float.gilla.fun");
    expect(url.searchParams.get("utm_source")).toBe("datapeek");
    expect(url.searchParams.get("utm_medium")).toBe("footer");
    expect(link.closest("p")).toHaveTextContent(
      "Also from the maker: Float, a floating scratchpad for macOS.",
    );
  });
});
