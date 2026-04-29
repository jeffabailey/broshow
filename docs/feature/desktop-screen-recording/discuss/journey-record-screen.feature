Feature: Record Screen or Window
  As a browser user
  I want to record my entire screen or a specific window
  So that I can capture content beyond a single browser tab

  Background:
    Given BroShow extension is installed
    And the browser supports getDisplayMedia

  # --- Happy Path: Screen Recording ---

  Scenario: Record entire screen
    Given the popup is open and idle
    When I select "Screen / Window" as the capture source
    And I click "Start Recording"
    And I choose a screen in the browser picker
    Then recording begins on the selected screen
    And the popup shows "Recording..."
    And the stop button is enabled

  Scenario: Stop screen recording and download
    Given I am recording a screen
    When I click "Stop Recording"
    Then the popup shows "Processing..."
    And the recording is muxed to mp4
    And an mp4 file is automatically downloaded
    And the popup returns to idle

  # --- Happy Path: Window Recording ---

  Scenario: Record a specific window
    Given the popup is open and idle
    When I select "Screen / Window" as the capture source
    And I click "Start Recording"
    And I choose a specific window in the browser picker
    Then recording begins on the selected window
    And the popup shows "Recording..."

  # --- Happy Path: Tab Recording (existing, unchanged) ---

  Scenario: Record current tab (default behavior preserved)
    Given the popup is open and idle
    And "This Tab" is selected as the capture source
    When I click "Start Recording"
    And I grant tab capture permission
    Then recording begins on the current tab
    And the popup shows "Recording..."

  # --- Source Selection ---

  Scenario: Source selection defaults to "This Tab"
    Given the popup is open for the first time
    Then "This Tab" is selected as the capture source

  Scenario: Source selection persists across popup opens
    Given I previously selected "Screen / Window"
    When I close and reopen the popup
    Then "Screen / Window" is still selected

  Scenario: Source selection disabled during recording
    Given I am recording
    Then the source selector is disabled

  # --- Error Paths ---

  Scenario: User cancels screen picker
    Given the popup is open and idle
    And "Screen / Window" is selected
    When I click "Start Recording"
    And I cancel the browser's screen picker
    Then the popup shows "Permission denied"
    And the popup returns to idle

  Scenario: Recorded window is closed during recording
    Given I am recording a specific window
    When the recorded window is closed
    Then recording stops automatically
    And the captured data is processed and downloaded

  Scenario: getDisplayMedia not supported
    Given the browser does not support getDisplayMedia
    Then the "Screen / Window" option is hidden
    And only "This Tab" is available

  Scenario: Mp4 muxing fails for screen recording
    Given I have stopped a screen recording
    And mp4 muxing encounters an error
    Then the recording is downloaded as WebM instead
    And the popup shows a fallback notice
