---
name: messaging
description: >
  This skill should be used when the user asks to "send a message to a worker",
  "check messages", "broadcast to all instances", "communicate between agents",
  "read worker reports", or needs to handle inter-instance messaging
  in a Claude Swarm setup.
metadata:
  version: "0.1.0"
---

# Swarm Messaging

Send and receive messages between Claude Code instances through the Swarm hub.

## Core Operations

### Send a Direct Message

Call `swarm_send_message` with:
- `from`: this instance's worker ID
- `to`: target worker ID
- `body`: message content (plain text or structured data)

### Broadcast to All Workers

Call `swarm_send_message` with `to: "broadcast"`. All workers will receive the message.

Use broadcasts for:
- Announcing a configuration change
- Requesting status from all workers
- Signaling shutdown or task completion

### Read Messages

Call `swarm_read_messages` with this instance's worker ID.
By default, returns only unread messages. Set `all: true` for full history.

## Message Conventions

Structure messages for machine readability when coordinating automated workflows:

### Task Assignment (Leader → Worker)
```
ACTION: review
TARGET: src/api/auth.ts
OUTPUT_FORMAT: markdown
REPORT_TO: leader-abc123
```

### Status Report (Worker → Leader)
```
STATUS: done
RESULT: Found 3 security issues (2 high, 1 medium)
OUTPUT_FILE: /tmp/review-auth.md
```

### Error Report (Worker → Leader)
```
STATUS: error
ERROR: File not found: src/api/auth.ts
SUGGESTION: Check if path has changed
```

### Acknowledgment
```
ACK: message-id-here
```

## Polling Pattern

When waiting for worker responses, poll at reasonable intervals:

1. Call `swarm_read_messages` for this instance
2. If no new messages, wait 3-5 seconds
3. Repeat until expected responses arrive or timeout (default 5 minutes)

## Tips

- Keep message bodies concise — workers have limited context
- Use structured formats (key: value) for automated parsing
- Always include a STATUS field in worker reports
- The leader should acknowledge received results to avoid re-sends
