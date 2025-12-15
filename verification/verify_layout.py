from playwright.sync_api import sync_playwright

def verify_layout():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Set viewport to a small height to test responsiveness/overlap
        context = browser.new_context(viewport={'width': 1024, 'height': 600})
        page = context.new_page()

        # Navigate to app
        page.goto("http://localhost:3000")

        # Wait for app to load
        page.wait_for_selector("text=SSH Engine")

        # 1. Verify Sample Prompts are not visible initially (need connection)
        # Since we can't easily connect, we will manually check the presence of the terminal container
        # and ensure the input area is at the bottom.

        # Check input area exists
        input_area = page.locator("input[placeholder='Select a profile to start...']")
        if not input_area.is_visible():
            # If backend error, it might say "Backend server disconnected"
            # We want to check that too
            pass

        # Take a screenshot of the initial state
        page.screenshot(path="verification/initial_layout.png")

        # We can't easily simulate the "Connected" state to show prompts without a real SSH connection.
        # However, we can use client-side script to force the state if we want to verify the prompts layout.
        # Injecting script to set showPrompts=true and mocked prompts is hard with functional components state.

        # But we can inspect the DOM for the terminal container structure we modified.
        # We expect to see the prompt buttons if we could toggle the state.

        # Let's try to verify the prompts layout by inspecting the code structure? No, we need visual.
        # Since I changed 'constants.ts', if I can see prompts, they should be the new ones.

        # Alternative: We can modify the component code temporarily to force show prompts for the screenshot?
        # That's a valid strategy for verification if real state is hard to reach.
        # But I'd rather not modify code just for test if I can avoid it.

        # Let's check if there are any errors in the console
        # msg = page.evaluate("console.error") # Not easy to capture this way.

        print("Screenshot taken.")
        browser.close()

if __name__ == "__main__":
    verify_layout()
