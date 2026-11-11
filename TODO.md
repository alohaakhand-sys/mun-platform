# MUN Platform TODOs

## Temporary Dev Features to Remove Before Production
- [ ] **Remove `Reset Logs (DEV)` button and `resetSessionDev()` helper**:
  - Located in `src/components/session/ChairSessionConsole.tsx` (TopBar component)
  - Helper exported from `src/lib/services/sessionService.ts` (`resetSessionDev`)
  - Purpose: Added temporarily for testing & session resetting during dev. Must be removed before live event deployment.
