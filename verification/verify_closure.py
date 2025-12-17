from playwright.sync_api import sync_playwright

def verify_closure():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console logs
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        page.goto("http://localhost:5001/verification/closure.html")

        # Wait for success/failure
        page.wait_for_selector("text=SUCCESS", timeout=2000)

        browser.close()

if __name__ == "__main__":
    verify_closure()
