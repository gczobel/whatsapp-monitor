# Changes

## Fix: Prevent delivery of "nothing urgent" messages when skipEmptyDelivery is enabled

When `skipEmptyDelivery` is set to true in the configuration, the system now prevents delivery of messages that contain only "nothing urgent" from scan profiles. This ensures that heartbeat messages are sent at least once every 24 hours even when there are no urgent messages, without cluttering the user's Saved Messages with empty status updates.

### Details

- Modified `src/scheduler/runner.ts` to check for "nothing urgent" responses when `skipEmptyDelivery` is true
- If the LLM returns exactly "nothing urgent" and `skipEmptyDelivery` is enabled, the message is skipped entirely
- This allows heartbeat functionality to work as intended - sending status pings every 24 hours regardless of urgent messages
- Regular urgent messages are still delivered when there are actual urgent issues

### Configuration

To enable this behavior, set `skipEmptyDelivery: true` in your configuration file.