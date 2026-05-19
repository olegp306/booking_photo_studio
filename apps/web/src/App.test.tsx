import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders seeded Prague studios", async () => {
    render(<App />);

    expect(await screen.findByText("Studio Lumen Karlin")).toBeInTheDocument();
    expect(screen.getByText("Atelier Rosa Vinohrady")).toBeInTheDocument();
    expect(screen.getByText("Framehouse Smichov")).toBeInTheDocument();
  });

  it("filters studios by shoot type", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Studio Lumen Karlin");
    await user.click(screen.getByRole("button", { name: "Maternity" }));

    await waitFor(() => {
      expect(screen.getByText("Atelier Rosa Vinohrady")).toBeInTheDocument();
      expect(screen.queryByText("Framehouse Smichov")).not.toBeInTheDocument();
    });
  });

  it("opens studio detail", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Open Studio Lumen Karlin" }));

    expect(screen.getByText("Main Daylight Room")).toBeInTheDocument();
    expect(screen.getByText("Check availability")).toBeInTheDocument();
  });
});
