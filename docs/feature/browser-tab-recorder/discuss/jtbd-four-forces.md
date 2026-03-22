# Four Forces Analysis: browser-tab-recorder

## Primary Job: One-click tab recording to mp4

### Push (Current Frustration)
- **Full-screen tools are overkill**: OBS, Loom, etc. require setup, configuration, accounts
- **No simple tab-only option**: OS screen recorders capture the whole screen or window, not just tab content
- **Output format hassles**: Browser APIs produce WebM; users then need ffmpeg or an online converter to get mp4
- **Privacy risk**: Screen recorders can accidentally capture notifications, other tabs, desktop content, or personal information

### Pull (Desired Future)
- **One-click operation**: Click extension icon → recording starts. Click again → mp4 saved.
- **Tab-isolated capture**: Only the active tab's content is recorded — nothing else
- **Universal format**: mp4 output works everywhere — no conversion step needed
- **Minimal footprint**: Small extension, no account, no cloud, no data leaving the browser

### Anxiety (Adoption Concerns)
- **Recording quality**: "Will the mp4 look good enough, or will it be low-res/choppy?"
- **Simplicity**: "Is this really just a button, or will it have hidden complexity?"
- **Privacy/permissions**: "What permissions does it need? Does it send data anywhere?"
- **Performance**: "Will recording slow down the tab or browser?"

### Habit (Current Behavior)
- Using OBS or similar desktop screen recorders (high friction)
- Using OS built-in screenshot tools that may offer basic recording (limited)
- Not recording at all — describing things in text instead
- Recording full screen then cropping (wasteful workflow)

## Anxiety Mitigation Strategies

| Anxiety | Mitigation |
|---------|------------|
| Quality concerns | Default to high-quality settings; show resolution in UI |
| Simplicity | Absolute minimum UI — one button, one action |
| Privacy/permissions | Request only `tabCapture` permission; no network requests; open source |
| Performance | Use hardware-accelerated MediaRecorder; lightweight popup |
