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

    expect(screen.getByRole("heading", { name: "Main Daylight Room" })).toBeInTheDocument();
    expect(screen.getByText("Check availability")).toBeInTheDocument();
  });

  it("shows availability slots on studio detail", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Open Studio Lumen Karlin" }));

    expect(await screen.findByRole("button", { name: "09:00 Main Daylight Room CZK 2,600" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "11:00 Product Corner CZK 1,400" })).toBeInTheDocument();
  });

  it("submits a request-to-book intent from studio detail", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Open Studio Lumen Karlin" }));
    await user.click(await screen.findByRole("button", { name: "11:00 Product Corner CZK 1,400" }));
    await user.type(screen.getByLabelText("Name"), "Marta Client");
    await user.type(screen.getByLabelText("Email"), "marta@example.com");
    await user.type(screen.getByLabelText("Shoot notes"), "Need product table");
    await user.click(screen.getByRole("button", { name: "Request booking" }));

    expect(await screen.findByText("Request sent: waiting for owner approval.")).toBeInTheDocument();
  });

  it("shows owners incoming booking requests and approval action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Open Studio Lumen Karlin" }));
    await user.click(await screen.findByRole("button", { name: "11:00 Product Corner CZK 1,400" }));
    await user.type(screen.getByLabelText("Name"), "Marta Client");
    await user.type(screen.getByLabelText("Email"), "marta@example.com");
    await user.type(screen.getByLabelText("Shoot notes"), "Need product table");
    await user.click(screen.getByRole("button", { name: "Request booking" }));
    await screen.findByText("Request sent: waiting for owner approval.");

    await user.click(screen.getByRole("button", { name: "Back to results" }));
    await user.click(screen.getByRole("link", { name: "Host" }));

    expect(await screen.findByRole("heading", { name: "Owner inbox" })).toBeInTheDocument();
    expect(screen.getByText("Marta Client")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve Marta Client booking" }));

    expect(await screen.findByText("Awaiting payment")).toBeInTheDocument();
  });
});
