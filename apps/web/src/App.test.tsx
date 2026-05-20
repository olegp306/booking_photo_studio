import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { resetLocalApiStateForTests } from "./api";

describe("App", () => {
  beforeEach(() => {
    window.location.hash = "";
    resetLocalApiStateForTests();
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

  it("opens a studio detail from a shared studio link", async () => {
    window.location.hash = "#studio/studio-lumen-karlin";

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Studio Lumen Karlin" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Main Daylight Room" })).toBeInTheDocument();
  });

  it("responds to a shared studio hash while the app is already open", async () => {
    render(<App />);

    expect(await screen.findByText("Studio Lumen Karlin")).toBeInTheDocument();
    window.location.hash = "#studio/studio-lumen-karlin";
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    expect(await screen.findByRole("heading", { name: "Studio Lumen Karlin" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Main Daylight Room" })).toBeInTheDocument();
  });

  it("shows a shareable studio link and message", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Open Studio Lumen Karlin" }));
    await user.click(screen.getByRole("button", { name: "Share studio" }));

    expect(await screen.findByRole("heading", { name: "Share Studio Lumen Karlin" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("http://localhost:3000/#studio/studio-lumen-karlin")).toBeInTheDocument();
    expect(screen.getByText("Take a look at Studio Lumen Karlin in Karlin. From CZK 1,300 / hour.")).toBeInTheDocument();
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

    expect(await screen.findByText("Confirmed")).toBeInTheDocument();
    expect(await screen.findByText("Payment captured: booking confirmed.")).toBeInTheDocument();
  });

  it("lets owners mark confirmed bookings completed", async () => {
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
    await user.click(await screen.findByRole("button", { name: "Approve Marta Client booking" }));
    await user.click(screen.getByRole("link", { name: "Bookings" }));
    await user.click(await screen.findByRole("button", { name: "Continue to payment for Studio Lumen Karlin" }));
    await screen.findByText("Confirmed");

    await user.click(screen.getByRole("link", { name: "Host" }));
    await user.click(await screen.findByRole("button", { name: "Complete Marta Client booking" }));

    expect(await screen.findByText("Completed")).toBeInTheDocument();
  });

  it("lets customers review completed bookings and updates studio rating", async () => {
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
    await user.click(await screen.findByRole("button", { name: "Approve Marta Client booking" }));
    await user.click(screen.getByRole("link", { name: "Bookings" }));
    await user.click(await screen.findByRole("button", { name: "Continue to payment for Studio Lumen Karlin" }));
    await user.click(screen.getByRole("link", { name: "Host" }));
    await user.click(await screen.findByRole("button", { name: "Complete Marta Client booking" }));
    await user.click(screen.getByRole("link", { name: "Bookings" }));

    await user.selectOptions(await screen.findByLabelText("Review rating for Studio Lumen Karlin"), "3");
    await user.type(screen.getByLabelText("Review comment for Studio Lumen Karlin"), "Good daylight, check-in could be smoother.");
    await user.click(screen.getByRole("button", { name: "Submit review for Studio Lumen Karlin" }));

    expect(await screen.findByText("Review posted: Studio Lumen Karlin is now rated 4.91.")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Explore" }));

    expect(await screen.findByText("4.91")).toBeInTheDocument();
  }, 20000);

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

  it("opens a saved shortlist from a shared saved link", async () => {
    window.location.hash = "#saved/studio-lumen-karlin,atelier-rosa-vinohrady";

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Saved studios" })).toBeInTheDocument();
    expect(screen.getByText("Studio Lumen Karlin")).toBeInTheDocument();
    expect(screen.getByText("Atelier Rosa Vinohrady")).toBeInTheDocument();
  });

  it("shows a shareable saved shortlist link and message", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText("Studio Lumen Karlin");
    const saveButtons = screen.getAllByRole("button", { name: "Save studio" });
    await user.click(saveButtons[0]);
    await user.click(saveButtons[1]);
    await user.click(screen.getByRole("link", { name: "Saved" }));
    await user.click(await screen.findByRole("button", { name: "Share saved shortlist" }));

    expect(await screen.findByRole("heading", { name: "Share saved shortlist" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("http://localhost:3000/#shortlist/shortlist-1")).toBeInTheDocument();
    expect(screen.getByText("Compare 2 Prague studios: Studio Lumen Karlin, Atelier Rosa Vinohrady.")).toBeInTheDocument();
  });

  it("opens a persisted shortlist from a shared shortlist link", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await screen.findByText("Studio Lumen Karlin");
    const saveButtons = screen.getAllByRole("button", { name: "Save studio" });
    await user.click(saveButtons[0]);
    await user.click(saveButtons[1]);
    await user.click(screen.getByRole("link", { name: "Saved" }));
    await user.click(await screen.findByRole("button", { name: "Share saved shortlist" }));
    const sharedLink = (await screen.findByLabelText("Shortlist link")) as HTMLInputElement;
    unmount();

    window.location.hash = new URL(sharedLink.value).hash;
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Saved studios" })).toBeInTheDocument();
    expect(screen.getByText("Studio Lumen Karlin")).toBeInTheDocument();
    expect(screen.getByText("Atelier Rosa Vinohrady")).toBeInTheDocument();
  });

  it("keeps collaborator decisions and notes on a persisted shortlist link", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);

    await screen.findByText("Studio Lumen Karlin");
    const saveButtons = screen.getAllByRole("button", { name: "Save studio" });
    await user.click(saveButtons[0]);
    await user.click(saveButtons[1]);
    await user.click(screen.getByRole("link", { name: "Saved" }));
    await user.click(await screen.findByRole("button", { name: "Share saved shortlist" }));
    const sharedLink = (await screen.findByLabelText("Shortlist link")) as HTMLInputElement;

    await user.click(screen.getByRole("button", { name: "Mark Studio Lumen Karlin as favourite" }));
    await user.type(screen.getByLabelText("Note for Studio Lumen Karlin"), "Client likes the daylight set.");
    unmount();

    window.location.hash = new URL(sharedLink.value).hash;
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Saved studios" })).toBeInTheDocument();
    expect(await screen.findByText("Status: Favourite")).toBeInTheDocument();
    expect(screen.getAllByText("Client likes the daylight set.")).toHaveLength(2);
  });

  it("lets collaborators mark shortlist decisions and leave notes", async () => {
    const user = userEvent.setup();
    window.location.hash = "#saved/studio-lumen-karlin,atelier-rosa-vinohrady";
    render(<App />);

    await screen.findByRole("heading", { name: "Saved studios" });
    await user.click(screen.getByRole("button", { name: "Mark Studio Lumen Karlin as favourite" }));
    await user.click(screen.getByRole("button", { name: "Mark Atelier Rosa Vinohrady as backup" }));
    await user.type(
      screen.getByLabelText("Note for Studio Lumen Karlin"),
      "Best daylight and cyclorama for the hero shots."
    );

    expect(screen.getByText("Status: Favourite")).toBeInTheDocument();
    expect(screen.getByText("Status: Backup")).toBeInTheDocument();
    expect(screen.getAllByText("Best daylight and cyclorama for the hero shots.")).toHaveLength(2);
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

  it("lets owners update room details and pricing", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Listing" }));

    await user.clear(screen.getByLabelText("Main Daylight Room summary"));
    await user.type(screen.getByLabelText("Main Daylight Room summary"), "Updated daylight room for portraits");
    await user.clear(screen.getByLabelText("Main Daylight Room hourly price"));
    await user.type(screen.getByLabelText("Main Daylight Room hourly price"), "1550");
    await user.click(screen.getByRole("button", { name: "Save listing changes" }));

    expect(await screen.findByText("Listing updated.")).toBeInTheDocument();
    expect(screen.getByText("Updated daylight room for portraits")).toBeInTheDocument();
    expect(screen.getByText("CZK 1,550 / hour")).toBeInTheDocument();
  });

  it("lets owners block calendar slots from booking", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    await user.type(screen.getByLabelText("Block reason"), "Maintenance");
    await user.click(screen.getByRole("button", { name: "Block selected slot" }));

    expect(await screen.findByText("09:00 Main Daylight Room blocked.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to explore" }));
    await user.click(await screen.findByRole("button", { name: "Open Studio Lumen Karlin" }));

    expect(await screen.findByRole("button", { name: "09:00 Main Daylight Room CZK 2,600 unavailable" })).toBeDisabled();
  });

  it("lets owners release blocked calendar slots", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    await user.selectOptions(screen.getByLabelText("Start time"), "11:00");
    await user.type(screen.getByLabelText("Block reason"), "Private hold");
    await user.click(screen.getByRole("button", { name: "Block selected slot" }));
    await screen.findByText("11:00 Main Daylight Room blocked.");
    await user.click(screen.getByRole("button", { name: "Release 11:00 Main Daylight Room block" }));

    expect(screen.queryByText("11:00 Main Daylight Room blocked.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to explore" }));
    await user.click(await screen.findByRole("button", { name: "Open Studio Lumen Karlin" }));

    expect(await screen.findByRole("button", { name: "11:00 Main Daylight Room CZK 2,600" })).toBeEnabled();
  });

  it("lets owners close a room for a full day", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    await user.click(screen.getByLabelText("Full-day closure"));
    await user.type(screen.getByLabelText("Block reason"), "Private production");
    await user.click(screen.getByRole("button", { name: "Block selected slot" }));

    expect(await screen.findByText("Full day Main Daylight Room blocked.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to explore" }));
    await user.click(await screen.findByRole("button", { name: "Open Studio Lumen Karlin" }));

    expect(await screen.findByRole("button", { name: "09:00 Main Daylight Room CZK 2,600 unavailable" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "11:00 Main Daylight Room CZK 2,600 unavailable" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "09:00 Product Corner CZK 1,400" })).toBeEnabled();
  });

  it("lets owners create weekly recurring availability holds", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    await user.selectOptions(screen.getByLabelText("Start time"), "13:00");
    await user.selectOptions(screen.getByLabelText("Repeat"), "2");
    await user.type(screen.getByLabelText("Block reason"), "Set build");
    await user.click(screen.getByRole("button", { name: "Block selected slot" }));

    expect(await screen.findAllByText("13:00 Main Daylight Room blocked.")).toHaveLength(2);
    expect(screen.getByText("2026-06-19")).toBeInTheDocument();
  });

  it("shows owner calendar summary and availability overrides", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Calendar" }));

    expect(screen.getByRole("heading", { name: "Calendar summary" })).toBeInTheDocument();
    expect(screen.getByText("0 holds")).toBeInTheDocument();
    expect(screen.getByText("0 open overrides")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Calendar action"), "open");
    await user.selectOptions(screen.getByLabelText("Start time"), "15:00");
    await user.type(screen.getByLabelText("Block reason"), "Late public slot");
    await user.click(screen.getByRole("button", { name: "Block selected slot" }));

    expect(await screen.findByText("15:00 Main Daylight Room opened.")).toBeInTheDocument();
    expect(screen.getByText("0 holds")).toBeInTheDocument();
    expect(screen.getByText("1 open override")).toBeInTheDocument();
  });

  it("shows owner calendar agenda and duplicates changes to next week", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    await user.selectOptions(screen.getByLabelText("Start time"), "11:00");
    await user.type(screen.getByLabelText("Block reason"), "Client buffer");
    await user.click(screen.getByRole("button", { name: "Block selected slot" }));

    expect(await screen.findByRole("heading", { name: "Calendar agenda" })).toBeInTheDocument();
    expect(screen.getByText("2026-06-12 - 1 change")).toBeInTheDocument();
    expect(screen.getByText("Main Daylight Room - 11:00 - Hold")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Duplicate 11:00 Main Daylight Room change to next week" }));

    expect(await screen.findByText("2026-06-19 - 1 change")).toBeInTheDocument();
    expect(screen.getAllByText("Main Daylight Room - 11:00 - Hold")).toHaveLength(2);
  });

  it("restores owner calendar changes after leaving the calendar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    await user.type(screen.getByLabelText("Block reason"), "Loaded later");
    await user.click(screen.getByRole("button", { name: "Block selected slot" }));
    await screen.findByText("09:00 Main Daylight Room blocked.");

    await user.click(screen.getByRole("button", { name: "Back to explore" }));
    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Calendar" }));

    expect(await screen.findByText("09:00 Main Daylight Room blocked.")).toBeInTheDocument();
    expect(screen.getByText("Loaded later")).toBeInTheDocument();
  });

  it("filters owner calendar agenda by room and action", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("link", { name: "Host" }));
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    await user.click(screen.getByRole("button", { name: "Block selected slot" }));
    await user.selectOptions(screen.getByLabelText("Calendar action"), "open");
    await user.selectOptions(screen.getByLabelText("Room"), "lumen-product");
    await user.selectOptions(screen.getByLabelText("Start time"), "15:00");
    await user.click(screen.getByRole("button", { name: "Block selected slot" }));

    await user.selectOptions(screen.getByLabelText("Agenda room"), "lumen-product");
    await user.selectOptions(screen.getByLabelText("Agenda action"), "open");

    expect(screen.getByText("Product Corner - 15:00 - Open")).toBeInTheDocument();
    expect(screen.queryByText("Main Daylight Room - 09:00 - Hold")).not.toBeInTheDocument();
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
