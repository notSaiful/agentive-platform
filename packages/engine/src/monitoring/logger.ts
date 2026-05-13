export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  traceId?: string;
  leadId?: string;
  orgId?: string;
  contactId?: string;
  [key: string]: unknown;
}

class Logger {
  private service = 'engine';

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>, context?: LogContext) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      message,
      traceId: context?.traceId,
      leadId: context?.leadId,
      orgId: context?.orgId,
      contactId: context?.contactId,
      metadata,
    };

    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    } else {
      const metaStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
      const ctxStr = context?.traceId ? ` [trace=${context.traceId}]` : '';
      const leadStr = context?.leadId ? ` [lead=${context.leadId}]` : '';
      const orgStr = context?.orgId ? ` [org=${context.orgId}]` : '';
      const prefix = `[${entry.timestamp}] ${level.toUpperCase()}${ctxStr}${leadStr}${orgStr}:`;
      if (level === 'error' || level === 'fatal') {
        // eslint-disable-next-line no-console
        console.error(prefix, message, metaStr);
      } else if (level === 'warn') {
        // eslint-disable-next-line no-console
        console.warn(prefix, message, metaStr);
      } else {
        // eslint-disable-next-line no-console
        console.log(prefix, message, metaStr);
      }
    }
  }

  debug(message: string, metadata?: Record<string, unknown>, context?: LogContext) {
    this.log('debug', message, metadata, context);
  }
  info(message: string, metadata?: Record<string, unknown>, context?: LogContext) {
    this.log('info', message, metadata, context);
  }
  warn(message: string, metadata?: Record<string, unknown>, context?: LogContext) {
    this.log('warn', message, metadata, context);
  }
  error(message: string, metadata?: Record<string, unknown>, context?: LogContext) {
    this.log('error', message, metadata, context);
  }
  fatal(message: string, metadata?: Record<string, unknown>, context?: LogContext) {
    this.log('fatal', message, metadata, context);
  }
}

export const logger = new Logger();
