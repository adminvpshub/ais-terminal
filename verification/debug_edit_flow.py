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
        print("Sidebar not found.")
        sys.exit(1)

    # Handle PIN
    if page.locator("text=Setup Security PIN").is_visible():
        page.locator("input[placeholder='••••••']").first.fill("123456")
        page.locator("input[placeholder='••••••']").nth(1).fill("123456")
        page.get_by_text("Set Master PIN").click()
        page.wait_for_selector("text=Setup Security PIN", state="hidden")

    # Add a profile to edit
    print("Creating a profile...")
    page.locator("button[title='Add New Connection']").click()
    page.wait_for_selector("input[placeholder='Prod Server']")
    page.locator("input[placeholder='Prod Server']").fill("Temp Profile")
    page.locator("input[placeholder='192.168.1.1']").fill("127.0.0.1")
    page.locator("//label[text()='User']/following-sibling::input").fill("root")
    page.locator("textarea[placeholder*='OPENSSH PRIVATE KEY']").fill("-----BEGIN OPENSSH PRIVATE KEY-----")
    page.get_by_role("button", name="Save").click()

    # Handle PIN Entry on Save if required
    # Since we set up PIN, saving might trigger PIN Entry if cached PIN is lost or not passed.
    # ConnectionManager doesn't seem to trigger PIN on save directly in handleSave.
    # It calls onSaveProfile which calls handleSaveProfile in TerminalApp.
    # TerminalApp checks for cachedPin. If not, it shows PIN Entry modal.

    if page.locator("text=Enter Master PIN").is_visible():
        print("PIN Entry Modal detected on Save. Entering PIN...")
        page.locator("input[placeholder='••••••']").fill("123456")
        page.get_by_role("button", name="Unlock").click()
        page.wait_for_selector("text=Enter Master PIN", state="hidden")


    # Wait for list to update
    print("Waiting for profile to appear...")
    try:
        page.wait_for_selector("text=Temp Profile", timeout=10000)
    except:
        print("Profile creation failed or not displayed.")
        page.screenshot(path="verification/create_failed.png")
        sys.exit(1)

    # Click Edit
    print("Editing profile...")
    # Hover over the profile to reveal buttons
    # Since there might be multiple, get the one we just created
    profile_item = page.locator("text=Temp Profile").first
    profile_item.hover()

    # Click the edit button within that profile item context if possible, or just the visible one
    page.locator("button[title='Edit Connection']").last.click()

    # Clear Name
    print("Clearing Name...")
    # Wait for form to populate
    page.wait_for_selector("input[value='Temp Profile']")
    page.locator("input[value='Temp Profile']").fill("")

    # Click Save
    print("Clicking Save with empty name...")
    page.get_by_role("button", name="Save").click()

    # Check for Error
    locator = page.locator("text=Profile Name is required")
    if locator.count() > 0 and locator.is_visible():
        print("SUCCESS: Error message found on Edit.")
    else:
        print("FAILURE: Error message NOT found on Edit.")
        page.screenshot(path="verification/edit_issue_failure.png")

    browser.close()

with sync_playwright() as p:
    run(p)
