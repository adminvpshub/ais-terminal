from playwright.sync_api import sync_playwright, expect

def verify_cleanup_feature():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context()
        page = context.new_page()

        page.goto("http://localhost:3000")
        page.wait_for_timeout(2000) # Wait for backend check

        # Handle Auth
        if page.get_by_text("Setup Security PIN").is_visible():
            print("Setup mode detected. Setting PIN...")
            page.get_by_placeholder("••••••").first.fill("123456")
            page.get_by_placeholder("••••••").last.fill("123456")
            page.get_by_role("button", name="Set Master PIN").click()
            page.wait_for_timeout(1000)

        elif page.get_by_text("Login Required").is_visible() or page.get_by_text("Enter Master PIN").is_visible():
            print("Login mode detected. Entering PIN...")
            page.get_by_placeholder("••••••").fill("123456")
            page.get_by_role("button", name="Unlock").click()
            page.wait_for_timeout(1000)

        # 2. Check for Export button (should NOT exist)
        export_btn = page.locator('button[title="Export Profiles"]')
        if export_btn.count() > 0:
            print("FAILURE: Export button still exists!")
        else:
            print("SUCCESS: Export button removed.")

        # 3. Check for Cleanup button
        cleanup_btn = page.locator('button[title="Cleanup Profiles & Reset"]')
        if cleanup_btn.count() > 0:
            print("SUCCESS: Cleanup button found.")
        else:
            print("FAILURE: Cleanup button not found!")

        # 4. Trigger Cleanup Modal
        cleanup_btn.click()
        page.wait_for_timeout(500)

        # Verify Modal content
        expect(page.get_by_text("Cleanup Profiles & Reset")).to_be_visible()
        expect(page.get_by_text("This will delete ALL saved connection profiles")).to_be_visible()

        page.screenshot(path="verification/cleanup_modal.png")
        print("Screenshot of cleanup modal saved.")

        # Close modal
        page.get_by_role("button", name="Cancel").click()

        # 5. Add a profile to test Delete confirmation
        print("Adding dummy profile...")
        page.locator('button[title="Add New Connection"]').click()
        page.get_by_placeholder("Prod Server").fill("Test Server")
        page.get_by_placeholder("192.168.1.1").fill("localhost")
        page.get_by_role("button", name="Save").click()

        # 6. Trigger Delete Profile Modal
        delete_btn = page.locator('button[title="Delete Connection"]').first
        delete_btn.click(force=True)

        page.wait_for_timeout(500)
        expect(page.get_by_text("Delete Connection")).to_be_visible()
        expect(page.get_by_text('Are you sure you want to delete "Test Server"?')).to_be_visible()

        page.screenshot(path="verification/delete_modal.png")
        print("Screenshot of delete modal saved.")

        browser.close()

if __name__ == "__main__":
    verify_cleanup_feature()
