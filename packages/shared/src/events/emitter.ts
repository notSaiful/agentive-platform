import { AgentEvent, AgentEventSchema } from '../types/event.js';

type EventHandler = (event: AgentEvent) => Promise<void> | void;

export class EventEmitter {
  private handlers: Map<string, EventHandler[]> = new Map();

  on(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  off(eventType: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    this.handlers.set(eventType, existing.filter(h => h !== handler));
  }

  async emit(event: AgentEvent): Promise<void> {
    const parsed = AgentEventSchema.parse(event);
    const handlers = this.handlers.get(parsed.type) || [];
    const wildcardHandlers = this.handlers.get('*') || [];
    for (const handler of [...wildcardHandlers, ...handlers]) {
      await handler(parsed);
    }
  }
}

export const globalEmitter = new EventEmitter();