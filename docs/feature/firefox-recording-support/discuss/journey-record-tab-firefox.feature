Feature: Record a Browser Tab on Firefox
  As a Firefox user who installed BroShow
  I want clicking Start Recording to actually capture and download a recording
  So that I am not blocked by the v0.1.2 "not supported" message

  Background:
    Given Maria has Firefox 121 or newer
    And the BroShow add-on (signed .xpi built via scripts/patch-firefox-manifest.mjs) is installed

  # ---------------------------------------------------------------------------
  # Step 1: Install (capability probe stops blocking)
  # ---------------------------------------------------------------------------

  Scenario: Firefox install no longer surfaces the "not supported" message
    When Maria opens the BroShow popup on Firefox
    Then she sees a "Start Recording" button
    And she does NOT see the message "Recording is not supported in this browser"

  # ---------------------------------------------------------------------------
  # Step 2: Click icon (popup with Firefox-specific hint)
  # ---------------------------------------------------------------------------

  Scenario: Popup shows the Firefox surface-picker hint
    When Maria clicks the BroShow toolbar icon on Firefox
    Then she sees the hint "Firefox will ask you to choose a tab, window, or screen"

  Scenario: Same popup on Chrome does NOT show the Firefox hint
    Given Maria is on Chrome (not Firefox)
    When she clicks the BroShow toolbar icon
    Then she sees a "Start Recording" button
    And she does NOT see the Firefox surface-picker hint

  # ---------------------------------------------------------------------------
  # Step 2.5: Surface picker (Firefox-only)
  # ---------------------------------------------------------------------------

  Scenario: User picks a tab in the Firefox surface picker
    Given Maria clicked Start Recording in the BroShow popup
    When Firefox shows its native surface picker
    And Maria selects the tab "Tutorial.html" with "Share audio" checked
    And she clicks Allow
    Then BroShow begins recording the picked tab
    And the BroShow toolbar icon shows the REC badge

  Scenario: User picks a window
    Given Maria clicked Start Recording in the BroShow popup
    When Firefox shows its native surface picker
    And Maria picks the window "Firefox" and clicks Allow
    Then BroShow records that whole window

  Scenario: User cancels the Firefox surface picker
    Given Maria clicked Start Recording in the BroShow popup
    When Firefox shows its native surface picker
    And Maria clicks Cancel
    Then BroShow returns to its idle state
    And no error toast is shown
    And the REC badge is NOT shown

  Scenario: User declines audio sharing
    Given Maria clicked Start Recording in the BroShow popup
    When Firefox shows its native surface picker
    And Maria selects a tab with "Share audio" unchecked
    And clicks Allow
    Then BroShow records video only
    And after stopping, the popup includes the note "Audio was not captured"

  # ---------------------------------------------------------------------------
  # Step 3: Recording active (host survival is the contract)
  # ---------------------------------------------------------------------------

  Scenario: Short recording (15 seconds, no popup interaction)
    Given Maria has just picked a tab in the Firefox surface picker
    When 15 seconds pass without her opening the popup again
    And she opens the popup and clicks Stop Recording
    Then a file is downloaded
    And the file is approximately 15 seconds long

  Scenario: Five-minute recording survives without popup interaction
    Given Maria has just picked a tab in the Firefox surface picker
    When 5 minutes pass without her opening the popup
    And she opens the popup and clicks Stop Recording
    Then a file is downloaded
    And the file is approximately 5 minutes long

  Scenario: Stopping via Firefox's native "Stop sharing"
    Given Maria is recording a tab on Firefox
    When she clicks "Stop sharing" in the Firefox URL bar
    Then BroShow detects the ended track
    And a file is downloaded automatically
    And the BroShow REC badge clears

  # ---------------------------------------------------------------------------
  # Step 4 & 5: Stop and download (mp4 primary, webm fallback)
  # ---------------------------------------------------------------------------

  Scenario: Successful Firefox recording is saved as mp4
    Given mp4-mux is available and succeeds
    And Maria recorded for 10 seconds on Firefox
    When she clicks Stop Recording
    Then a file matching "broshow-YYYY-MM-DD-HHmmss.mp4" appears in Downloads
    And the file plays in VLC, QuickTime, and Windows Media Player

  Scenario: Firefox recording falls back to webm when mp4-mux fails
    Given Maria recorded for 10 seconds on Firefox
    And mp4-mux fails during muxing
    When she clicks Stop Recording
    Then a file matching "broshow-YYYY-MM-DD-HHmmss.webm" appears in Downloads
    And the popup shows the fallback notice explaining the format change

  # ---------------------------------------------------------------------------
  # Cross-cutting: Chrome path unchanged
  # ---------------------------------------------------------------------------

  Scenario: Chrome auto-targets the active tab (unchanged from v0.1.2)
    Given Maria is on Chrome
    When she clicks the BroShow toolbar icon
    And she clicks Start Recording
    Then NO surface picker is shown
    And BroShow records the active tab automatically
    And after Stop, an mp4 is downloaded

  Scenario: Other unsupported browsers still see the "not supported" message
    Given Maria is on a browser that supports neither chrome.tabCapture/chrome.offscreen nor navigator.mediaDevices.getDisplayMedia
    When she clicks the BroShow toolbar icon
    Then she sees the "Recording is not supported in this browser" message
    And the Start Recording button is disabled
