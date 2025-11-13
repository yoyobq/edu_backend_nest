// src/modules/common/integration-events/events.tokens.ts
export const INTEGRATION_EVENTS_TOKENS = {
  OUTBOX_WRITER_PORT: Symbol('INTEV.OUTBOX_WRITER_PORT'),
  OUTBOX_STORE_PORT: Symbol('INTEV.OUTBOX_STORE_PORT'),
  OUTBOX_DISPATCHER_PORT: Symbol('INTEV.OUTBOX_DISPATCHER_PORT'),
  HANDLERS: Symbol('INTEV.HANDLERS'),
} as const;
