declare module 'eventsource' {
  export interface EventSourceOptions {
    headers?: Record<string, string>;
    withCredentials?: boolean;
    proxy?: string;
    https?: {
      rejectUnauthorized?: boolean;
    };
  }

  export interface EventSourceEventMap {
    message: MessageEvent;
    error: Event;
    open: Event;
  }

  export interface EventSourceStatic {
    new (url: string, options?: EventSourceOptions): EventSource;
    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSED: 2;
  }

  export interface EventSource {
    addEventListener<K extends keyof EventSourceEventMap>(
      type: K,
      listener: (this: EventSource, ev: EventSourceEventMap[K]) => any,
      options?: boolean | AddEventListenerOptions,
    ): void;
    addEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ): void;
    removeEventListener<K extends keyof EventSourceEventMap>(
      type: K,
      listener: (this: EventSource, ev: EventSourceEventMap[K]) => any,
      options?: boolean | EventListenerOptions,
    ): void;
    removeEventListener(
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ): void;
    dispatchEvent(event: Event): boolean;
    close(): void;

    onopen: ((event: Event) => void) | null;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: Event) => void) | null;

    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSED: 2;
    readonly readyState: 0 | 1 | 2;
    readonly url: string;
    readonly withCredentials: boolean;
  }

  const EventSource: EventSourceStatic;
  export default EventSource;
}
