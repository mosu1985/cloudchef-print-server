export interface PrinterInfo {
  name: string;
  status: 'ready' | 'busy' | 'error';
  paperStatus?: 'ok' | 'low' | 'out';
  model?: string;
}

export interface ConnectedAgent {
  id: string;
  socketId: string;
  restaurantId: string | null;
  userId: string | null;
  code: string;  // Pairing code агента (8 символов A-Z0-9)
  printerInfo: PrinterInfo | null;
  connectedAt: Date;
  lastSeen: Date;
  version: string;
  os?: string;
  ip?: string;
}

export interface PrintCommand {
  id: string;
  restaurantId: string;
  userId: string;
  agentId: string;
  labelData: LabelData;
  status: 'pending' | 'printing' | 'success' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface LabelData {
  productName: string;
  category?: string;
  preparationDate: string;
  expiryDate: string;
  storageMethod: 'охлаждение' | 'заморозка';
  chefName?: string;
  restaurantName?: string;
  allergens?: string[];
  barcode?: string;
  [key: string]: any;
}

export interface ServerStats {
  connectedAgents: number;
  totalPrintCommands: number;
  successfulPrints: number;
  failedPrints: number;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  restaurantAgents: Record<string, number>;
}

export interface AuthPayload {
  userId: string;
  email: string;
  role?: string;
  restaurantId?: string;
  iat?: number;
  exp?: number;
}

export type SocketRole = 'agent' | 'web-client' | 'owner' | 'manager';

export interface ClientRegistration {
  role: SocketRole;
  userId?: string;
  restaurantId?: string;
  printerInfo?: PrinterInfo;
  version?: string;
}

export interface PrintRequest {
  targetAgentId?: string;
  labelData: LabelData;
  restaurantId?: string;
}

export interface PrintResponse {
  success: boolean;
  commandId?: string;
  message?: string;
  error?: string;
}
