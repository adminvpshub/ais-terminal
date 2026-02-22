import sys
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 720})
    page = context.new_page()

    print("Navigating to app...")
    page.goto("http://localhost:3000")

    # Handle Landing Page
    try:
        start_btn = page.get_by_text("Start Using Now")
        if start_btn.is_visible():
            start_btn.click()
    except:
        pass

    # Wait for Connection sidebar
    try:
        page.wait_for_selector("text=Connections", timeout=10000)
    except:
        print("Sidebar not found. Dumping page...")
        print(page.content())
        sys.exit(1)

    # Handle PIN Modal if present
    # The previous error showed a modal blocking clicks. It's likely the PIN entry modal.
    # <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
    if page.locator("text=Enter Master PIN").is_visible():
        print("PIN Entry Modal detected. Entering PIN...")
        page.locator("input[placeholder='••••••']").fill("123456")
        page.get_by_role("button", name="Unlock").click()
        page.wait_for_selector("text=Enter Master PIN", state="hidden")
    elif page.locator("text=Setup Security PIN").is_visible():
        print("PIN Setup Modal detected. Setting up PIN...")
        page.locator("input[placeholder='••••••']").first.fill("123456")
        page.locator("input[placeholder='••••••']").nth(1).fill("123456")
        page.get_by_text("Set Master PIN").click()
        page.wait_for_selector("text=Setup Security PIN", state="hidden")

    print("Opening connection form...")
    page.locator("button[title='Add New Connection']").click()

    # Ensure form is visible
    page.wait_for_selector("text=Profile Name")

    print("Clicking Save with empty form...")
    save_btn = page.get_by_role("button", name="Save")
    save_btn.click()

    # Wait a moment
    page.wait_for_timeout(500)

    # Check specifically for Profile Name error
    # The error text is "Profile Name is required"
    locator = page.locator("text=Profile Name is required")

    if locator.count() > 0 and locator.is_visible():
        print("SUCCESS: Error message found.")
        color = locator.evaluate("el => getComputedStyle(el).color")
        print(f"Error color: {color}")
    else:
        print("FAILURE: Error message NOT found.")
        page.screenshot(path="verification/pr_issue_failure.png")

    browser.close()

with sync_playwright() as p:
    run(p)
