from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
import time

def test_login():
    # Setup Chrome options
    chrome_options = Options()
    chrome_options.add_argument("--headless") 

    # Setup WebDriver
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=chrome_options)

    try:
        # URL being tested
        driver.get("http://localhost:3000/login") 

        # Find the email and password input fields
        email = driver.find_element(By.ID, "email") 
        password = driver.find_element(By.ID, "password") 

        # Enter the credentials
        email.send_keys("emcnamee08@qub.ac.uk")
        password.send_keys("1234")

        # Submit the login form 
        password.send_keys(Keys.RETURN)

        # Wait for the response to ensure that navigation has occurred if needed
        time.sleep(5)  # Adjust time based on response time of your app

        # Verify successful login by checking for a specific element
        success_message = driver.find_element(By.ID, "success")  # Replace 'success' with the actual ID of an element visible after login
        assert "Welcome" in success_message.text  # Adjust expected text accordingly

        print("Login test passed.")
    except Exception as e:
        print(f"Login test failed: {e}")
    finally:
        # Cleanup: close the browser window
        driver.quit()

if __name__ == "__main__":
    test_login()
