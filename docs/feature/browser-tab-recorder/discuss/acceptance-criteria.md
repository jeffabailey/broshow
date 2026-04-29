# Acceptance Criteria: browser-tab-recorder

## End-to-End Acceptance Tests

### AC-01: Complete Recording Flow
```gherkin
Given the BroShow extension is installed in a Chromium browser
When I click the extension icon
And I click "Start Recording"
And I grant tab capture permission
And I wait 5 seconds
And I click "Stop Recording"
Then an mp4 file is downloaded
And the file plays back correctly with video and audio
```

### AC-02: Permission Denial Recovery
```gherkin
Given the BroShow extension is installed
When I click "Start Recording"
And I deny the tab capture permission
Then I see an error message about needing permission
And I can click "Start Recording" again to retry
```

### AC-03: Recording Indicator Visibility
```gherkin
Given I have started recording a tab
Then the extension icon shows a recording indicator
When I stop recording
Then the recording indicator is removed
```

### AC-04: Tab Closed During Recording
```gherkin
Given I am recording a tab
When the recorded tab is closed
Then the recording stops
And the captured content is saved and downloaded
```

### AC-05: Mp4 Conversion Fallback
```gherkin
Given mp4 muxing is unavailable or fails
When I stop a recording
Then the file is saved as WebM instead
And I see a message explaining the format change
```

### AC-06: No Network Requests
```gherkin
Given the extension is installed and in use
When I monitor network traffic from the extension
Then no outbound network requests are made at any point
```

### AC-07: Brave Browser Compatibility
```gherkin
Given the BroShow extension is installed in Brave browser
When I perform a complete recording flow
Then the behavior is identical to Chrome
```

### AC-08: Filename Format
```gherkin
Given I complete a recording
When the file is downloaded
Then the filename matches the pattern broshow-YYYY-MM-DD-HHmmss.mp4
And the timestamp reflects my local time
```
