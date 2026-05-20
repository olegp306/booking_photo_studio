import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    window.location.hash = "";
  });

  it("opens saved view directly with an empty state", async () => {
    window.location.hash = "#saved";

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Saved studios" })).toBeInTheDocument();
    expect(screen.getByText("No saved studios yet")).toBeInTheDocument();
  });

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

  it("shows customer bookings and payment call to action after owner approval", async () => {
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
    await user.click(screen.getByRole("link", { name: "Bookings" }));

    expect(await screen.findByRole("heading", { name: "My bookings" })).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Host" }));
    await user.click(await screen.findByRole("button", { name: "Approve Marta Client booking" }));
    await user.click(screen.getByRole("link", { name: "Bookings" }));

    expect(await screen.findByText("Awaiting payment")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to payment for Studio Lumen Karlin" }));

    expect(await screen.findByText("Checkout ready: Stripe payment will open here.")).toBeInTheDocument();
  });

  it("shows saved studios and opens a saved studio detail", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Studio Lumen Karlin");
    await user.click(screen.getAllByRole("button", { name: "Save studio" })[0]);
    await user.click(screen.getByRole("link", { name: "Saved" }));

    expect(await screen.findByRole("heading", { name: "Saved studios" })).toBeInTheDocument();
    expect(screen.getByText("Studio Lumen Karlin")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Studio Lumen Karlin" }));

    expect(await screen.findByRole("heading", { name: "Main Daylight Room" })).toBeInTheDocument();
  });

  it("lets studio owners preview and edit their listing", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Listing" }));

    expect(await screen.findByRole("heading", { name: "Manage listing" })).toBeInTheDocument();
    expect(screen.getAllByText("Studio Lumen Karlin").length).toBeGreaterThan(0);

    await user.clear(screen.getByLabelText("Listing tagline"));
    await user.type(screen.getByLabelText("Listing tagline"), "Soft editorial loft for portraits");
    await user.click(screen.getByRole("button", { name: "Save listing changes" }));

    expect(await screen.findByText("Listing updated.")).toBeInTheDocument();
    expect(screen.getByText("Soft editorial loft for portraits")).toBeInTheDocument();
  });

  it("creates an AI listing draft from owner notes", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Listing" }));
    await user.type(
      screen.getByLabelText("AI voice or text draft"),
      "Soft daylight studio for fashion and product shoots with cyclorama, softboxes, c-stands, makeup station, dressing room, wifi, and product table. Minimum booking is 2 hours."
    );
    await user.click(screen.getByRole("button", { name: "Generate listing draft" }));

    expect(screen.getByDisplayValue("Soft daylight studio for fashion and product shoots.")).toBeInTheDocument();
    const detectedFilters = within(screen.getByLabelText("Detected listing filters"));
    expect(detectedFilters.getByText("Fashion")).toBeInTheDocument();
    expect(detectedFilters.getByText("Product")).toBeInTheDocument();
    expect(detectedFilters.getByText("Cyclorama")).toBeInTheDocument();
    expect(detectedFilters.getByText("Softboxes")).toBeInTheDocument();
    expect(detectedFilters.getByText("Makeup station")).toBeInTheDocument();
  });

  it("lets owners manually refine AI-detected listing filters", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Listing" }));
    await user.click(screen.getByRole("button", { name: "Add Video shoot type" }));
    await user.click(screen.getByRole("button", { name: "Add Projector equipment" }));
    await user.click(screen.getByRole("button", { name: "Save listing changes" }));

    expect(await screen.findByText("Listing updated.")).toBeInTheDocument();
    expect(screen.getAllByText("Video").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Projector").length).toBeGreaterThan(0);
  });

  it("lets owners add studio media by URL and category", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Listing" }));
    await user.type(screen.getByLabelText("Media URL"), "https://example.com/studio-corner.jpg");
    await user.type(screen.getByLabelText("Media caption"), "Styled product corner with paper backdrop");
    await user.selectOptions(screen.getByLabelText("Media category"), "equipment");
    await user.click(screen.getByRole("button", { name: "Add media" }));
    await user.click(screen.getByRole("button", { name: "Save listing changes" }));

    expect(await screen.findByText("Listing updated.")).toBeInTheDocument();
    const mediaLibrary = within(screen.getByLabelText("Studio media library"));
    expect(mediaLibrary.getAllByText("Equipment and props").length).toBeGreaterThan(0);
    expect(mediaLibrary.getByText("Styled product corner with paper backdrop")).toBeInTheDocument();
    expect(mediaLibrary.getByAltText("Styled product corner with paper backdrop")).toHaveAttribute(
      "src",
      "https://example.com/studio-corner.jpg"
    );
  });
});
