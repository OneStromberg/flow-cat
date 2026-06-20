export interface InboundMessage {
  phone: string;
  text?: string;
  selectionId?: string;
}

export type OutboundMessage =
  | { kind: 'text'; body: string }
  | { kind: 'buttons'; body: string; buttons: { id: string; title: string }[] }
  | { kind: 'list'; body: string; rows: { id: string; title: string }[] };

export interface WhatsAppClient {
  send(to: string, msg: OutboundMessage): Promise<void>;
}
