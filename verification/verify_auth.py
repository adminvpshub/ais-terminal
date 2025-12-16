from playwright.sync_api import sync_playwright

def verify_auth_flow():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to app
        page.goto("http://localhost:3000")

        # Check for Setup Modal
        try:
            print("Checking for Setup Modal...")
            page.wait_for_selector("text=Setup Security PIN", timeout=5000)
            page.screenshot(path="verification/1_setup_modal.png")
            print("Setup Modal detected. Screenshot taken.")

            # Fill PIN (Must be 6 digits now)
            # Testing invalid input first
            page.fill("input[placeholder='••••••'] >> nth=0", "1234")
            page.fill("input[placeholder='••••••'] >> nth=1", "1234")
            page.click("button:has-text('Set Master PIN')")
            page.wait_for_selector("text=PIN must be exactly 6 digits")
            print("Verified 6-digit validation.")

            # Fill valid PIN
            page.fill("input[placeholder='••••••'] >> nth=0", "123456")
            page.fill("input[placeholder='••••••'] >> nth=1", "123456")

            # Submit
            page.click("button:has-text('Set Master PIN')")

            # Wait for modal to close (it should disappear)
            page.wait_for_selector("text=Setup Security PIN", state="hidden")
            print("Setup completed.")
        except Exception as e:
            print(f"Setup Modal not found or interaction failed: {e}")
            # If not found, maybe we are already setup (e.g. if script re-runs without reset)

        # Take main screen shot
        page.screenshot(path="verification/2_main_screen.png")

        # Reload to trigger cached PIN clear (actually app retains it in memory, but reload clears React state)
        page.reload()

        # Wait for profiles to load
        page.wait_for_selector("text=Prod Server")

        # Select the profile first to reveal the Connect button
        print("Selecting profile...")
        page.click("text=Prod Server")

        # Click connect on first profile
        print("Clicking Connect...")
        page.click("button:has-text('Connect')")

        # Should show PIN Entry Modal
        print("Checking for PIN Entry Modal...")
        page.wait_for_selector("text=Enter Master PIN")
        page.screenshot(path="verification/3_pin_entry_modal.png")
        print("PIN Entry Modal detected. Screenshot taken.")

        # Enter wrong PIN first
        page.fill("input[placeholder='••••••']", "000000")
        page.click("button:has-text('Unlock')")
        page.wait_for_selector("text=Incorrect PIN")
        page.screenshot(path="verification/4_pin_error.png")

        # Enter correct PIN
        page.fill("input[placeholder='••••••']", "123456")
        page.click("button:has-text('Unlock')")

        # Wait for modal to close
        page.wait_for_selector("text=Enter Master PIN", state="hidden")
        print("PIN verified.")

        # Verify Connection starts
        page.screenshot(path="verification/5_connecting.png")

        browser.close()

if __name__ == "__main__":
    verify_auth_flow()
