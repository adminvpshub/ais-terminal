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
        pass

    # Handle PIN
    if page.locator("text=Setup Security PIN").is_visible():
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

    # Take screenshot of the result
    page.screenshot(path="verification/pr_issue_repro.png")
    print("Screenshot saved to verification/pr_issue_repro.png")

    browser.close()

with sync_playwright() as p:
    run(p)
