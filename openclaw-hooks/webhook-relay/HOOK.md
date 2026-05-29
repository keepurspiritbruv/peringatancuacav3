---
name: webhook-relay
description: "Forward inbound WhatsApp messages to backend webhook"
metadata:
  { "openclaw": { "emoji": "📤", "events": ["message:received"], "always": true } }
---

# Webhook Relay

Forwards every inbound WhatsApp message to the disaster backend webhook for command interception.
