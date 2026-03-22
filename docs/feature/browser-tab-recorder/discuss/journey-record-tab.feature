Feature: Record a browser tab as mp4

  As a browser user
  I want to record a single tab and save it as mp4
  So that I can archive or share tab content without complex tools

  Background:
    Given the BroRecord extension is installed
    And the browser toolbar shows the BroRecord icon

  Scenario: Happy path - record and save a tab
    When I click the BroRecord extension icon
    Then I see a popup with a "Start Recording" button
    When I click "Start Recording"
    Then the browser prompts me to share the current tab
    When I allow tab sharing
    Then the extension icon shows a recording indicator
    And the popup shows a "Stop Recording" button
    When I click "Stop Recording"
    Then the recording stops
    And an mp4 file is downloaded with a timestamped filename

  Scenario: User denies tab capture permission
    When I click the BroRecord extension icon
    And I click "Start Recording"
    And I deny the tab sharing prompt
    Then I see a message explaining permission is needed
    And I can retry by clicking "Start Recording" again

  Scenario: Tab is closed during recording
    Given I am recording the current tab
    When the recorded tab is closed
    Then the recording stops automatically
    And the captured content up to that point is saved as mp4

  Scenario: Recording includes tab audio
    Given the tab is playing audio
    When I start recording
    Then the mp4 file includes the tab's audio track

  Scenario: mp4 muxing fallback
    Given I have finished recording
    When mp4 conversion fails
    Then the recording is saved as WebM instead
    And I see a message explaining the fallback format
