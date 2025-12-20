from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        page = context.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        print("Navigating to app...")
        page.goto("http://localhost:3000")
        page.wait_for_timeout(2000)

        # Handle Auth if needed
        if page.get_by_text("Setup Security PIN").is_visible():
            print("Action: Setting up PIN")
            page.get_by_placeholder("••••••").first.fill("123456")
            page.get_by_placeholder("••••••").last.fill("123456")
            page.get_by_role("button", name="Set Master PIN").click()
            page.wait_for_timeout(1000)

        elif page.get_by_text("Login Required").is_visible() or page.get_by_text("Enter Master PIN").is_visible():
            print("Action: Logging in")
            page.get_by_placeholder("••••••").fill("123456")
            page.get_by_role("button", name="Unlock").click()
            page.wait_for_timeout(1000)

        # Trigger Cleanup
        print("Action: Clicking Cleanup button")
        cleanup_btn = page.locator('button[title="Cleanup Profiles & Reset"]')
        if cleanup_btn.count() == 0:
            print("ERROR: Cleanup button not found")
            return

        cleanup_btn.click()
        page.wait_for_timeout(500)

        # Confirm
        print("Action: Confirming Cleanup")
        page.screenshot(path="verification/before_confirm.png")

        # Check if modal is visible
        if page.get_by_text("Cleanup Profiles & Reset").is_visible():
            page.get_by_role("button", name="Cleanup & Reset").click()
            print("Action: Confirmed")
        else:
            print("ERROR: Confirmation modal not visible")
            return

        # Wait for potential reload or error
        # We expect a reload, which should bring us back to Setup screen
        try:
            print("Waiting for Setup screen...")
            # Increased timeout to allow for reload and backend processing
            page.wait_for_selector('text="Setup Security PIN"', timeout=5000)
            print("SUCCESS: Returned to Setup screen")
            page.screenshot(path="verification/after_reset.png")
        except Exception as e:
            print(f"FAILURE: Did not return to Setup screen. {e}")
            page.screenshot(path="verification/error_state.png")

        browser.close()

if __name__ == "__main__":
    run()
