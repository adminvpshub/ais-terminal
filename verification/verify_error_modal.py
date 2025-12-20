from playwright.sync_api import sync_playwright, expect

def verify_error_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        page = context.new_page()

        page.goto("http://localhost:3000")
        page.wait_for_timeout(2000)

        # Handle Setup/Login
        if page.get_by_text("Setup Security PIN").is_visible():
            print("Setup mode detected.")
            page.get_by_placeholder("••••••").first.fill("123456")
            page.get_by_placeholder("••••••").last.fill("123456")
            page.get_by_role("button", name="Set Master PIN").click()
            page.wait_for_timeout(1000)
        elif page.get_by_text("Login Required").is_visible() or page.get_by_text("Enter Master PIN").is_visible():
            print("Login mode detected.")
            page.get_by_placeholder("••••••").fill("123456")
            page.get_by_role("button", name="Unlock").click()
            page.wait_for_timeout(1000)

        # 1. Create a dummy profile with invalid host to trigger error
        print("Creating invalid profile...")
        page.locator('button[title="Add New Connection"]').click()
        page.get_by_placeholder("Prod Server").fill("Invalid Host")
        page.get_by_placeholder("192.168.1.1").fill("invalid.local.test")
        page.get_by_placeholder("root").fill("root")
        page.get_by_role("button", name="Save").click()

        # 2. Connect to it
        print("Connecting to invalid profile...")
        # Find the profile card (it should be the last one or by text)
        page.get_by_text("Invalid Host").click()
        # Use exact match or filter visible to be specific
        page.get_by_role("button", name="Connect", exact=True).click()

        # 3. Wait for Error Modal
        print("Waiting for error...")
        try:
            # Wait up to 20 seconds for connection failure
            expect(page.get_by_text("Connection Error")).to_be_visible(timeout=20000)
            print("SUCCESS: Error modal visible.")

            # Capture screenshot
            page.screenshot(path="verification/connection_error.png")
            print("Screenshot saved.")

            # Close modal
            page.get_by_role("button", name="Close").click()

        except Exception as e:
            print(f"FAILURE: Error modal did not appear. {e}")
            page.screenshot(path="verification/error_modal_fail.png")

        browser.close()

if __name__ == "__main__":
    verify_error_modal()
