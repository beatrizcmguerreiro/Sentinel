# Sentinel - Reflective Awareness Monitor
Sentinel is a research-driven Chrome extension that monitors user-written triggering language while using ChatGPT. It highlights detected triggers, and provides a dashboard with session, weekly and monthly analytics. It is designed as a self-awareness and early-warning tool rather than a diagnostic system.

## Features (V1)

### Detection & Highlighting
- Configurable trigger detection for specific words and phrases
- Real-time inline highlighting of matched terms in user messages
- Context-aware counting (multiple triggers in one message are counted individually)

### On-Page Feedback
- Lightweight popup alert when triggers are detected
- Severity escalation based on cumulative session total
- No interruption of ChatGPT functionality

### Data & Storage
- Local-only persistence using `chrome.storage.local`
- Stores counts and aggregated metrics (not full conversation logs)
- Session, weekly, and monthly aggregation

### Analytics Dashboard
- Accessible via the extension popup.
- Manual **light/dark theme** toggle.
- **Weekly view**: a 7-day trigger trend line chart
- **Monthly view**: a calendar-based aggregation
- **Session view**: a word cloud of the top triggering terms
- CSV export:
  - Weekly/Monthly → Date, TriggerCount
  - Session → Word, Count

## Quick Start (Local)
1. Clone the repository:
   ```bash
   git clone https://github.com/<yourUser>/<yourRepository>.git
   cd <yourRepository>

2. Load the extension in Chrome:
- Open `chrome://extensions`
- Enable **Developer Mode**
- Click "Load Unpacked"
- Select the **repository folder**

3. Open ChatGPT in the browser:
- Write a message containing a configured trigger word to see highlighting and popup feedback.
- Click the extension icon to open the **Trigger Trends** dashboard.
