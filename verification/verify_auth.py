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

            # Fill PIN
            page.fill("input[placeholder='••••'] >> nth=0", "1234")
            page.fill("input[placeholder='••••'] >> nth=1", "1234")

            # Submit
            page.click("button:has-text('Set Master PIN')")

            # Wait for modal to close (it should disappear)
            page.wait_for_selector("text=Setup Security PIN", state="hidden")
            print("Setup completed.")
        except:
            print("Setup Modal not found (maybe already set up?). Proceeding.")

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
        # The Connect button appears inside the selected profile card.
        # It has text "Connect" and an icon.
        print("Clicking Connect...")
        page.click("button:has-text('Connect')")

        # Should show PIN Entry Modal
        print("Checking for PIN Entry Modal...")
        page.wait_for_selector("text=Enter Master PIN")
        page.screenshot(path="verification/3_pin_entry_modal.png")
        print("PIN Entry Modal detected. Screenshot taken.")

        # Enter wrong PIN first
        page.fill("input[placeholder='••••']", "0000")
        page.click("button:has-text('Unlock')")
        page.wait_for_selector("text=Incorrect PIN")
        page.screenshot(path="verification/4_pin_error.png")

        # Enter correct PIN
        page.fill("input[placeholder='••••']", "1234")
        page.click("button:has-text('Unlock')")

        # Wait for modal to close
        page.wait_for_selector("text=Enter Master PIN", state="hidden")
        print("PIN verified.")

        # Verify Connection starts (we won't actually connect because backend SSH will fail without real creds/network, but UI should update)
        # We expect "Connecting..." or similar

        page.screenshot(path="verification/5_connecting.png")

        browser.close()

if __name__ == "__main__":
    verify_auth_flow()
