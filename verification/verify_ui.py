from playwright.sync_api import sync_playwright

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Navigate to the app (assuming it runs on port 3000)
        page.goto("http://localhost:3000")

        # Wait for the ConnectionManager sidebar to be visible
        # Note: If auth is required, we might see the setup or login modal instead.
        # But we can still take a screenshot to verify the modals or the main UI if logged in.

        # Take a screenshot of the initial state (should show Setup or Login modal)
        page.screenshot(path="verification/initial_state.png")
        print("Screenshot saved to verification/initial_state.png")

        browser.close()

if __name__ == "__main__":
    verify_ui()
