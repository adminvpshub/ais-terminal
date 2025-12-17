from playwright.sync_api import sync_playwright

def verify_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:5000/verify.html")

        # Verify the modal is present
        page.wait_for_selector("text=Suggestion")

        # Verify "The command failed" is NOT present (since it is a suggestion)
        # We need to be careful with negative assertions if the element is just hidden or text is different
        content = page.content()
        if "The command failed" in content:
             print("FAILURE: Found error text in suggestion mode")
             exit(1)

        # Verify the yellow theme (class check)
        # We look for text-yellow-400
        yellow_element = page.query_selector(".text-yellow-400")
        if not yellow_element:
             print("FAILURE: Did not find yellow theme element")
             exit(1)

        page.screenshot(path="/app/verification/verification.png")
        print("SUCCESS")
        browser.close()

if __name__ == "__main__":
    verify_modal()
