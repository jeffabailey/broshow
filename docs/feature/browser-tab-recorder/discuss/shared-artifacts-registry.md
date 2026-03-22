# Shared Artifacts Registry: browser-tab-recorder

| Artifact ID | Description | Produced By | Consumed By | Format |
|-------------|-------------|-------------|-------------|--------|
| extension-icon-in-toolbar | BroRecord icon visible in browser toolbar | install step | click-icon step | Browser UI element |
| popup-ui | Extension popup with Start/Stop Recording button | click-icon step | start-recording, stop-recording steps | HTML popup |
| recording-indicator | Visual indicator that recording is active (red dot on icon) | start-recording step | recording-active, stop-recording steps | Icon badge |
| processing-state | Brief "Processing..." state while muxing to mp4 | stop-recording step | file-saved step | UI state |
| mp4-file | Final downloaded recording file | file-saved step | User (external) | video/mp4 |
