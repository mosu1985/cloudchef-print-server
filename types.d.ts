/**
 * CloudChef Print Server - TypeScript Definitions
 */

export interface PrinterInfo {
  name?: string;
  status?: 'ready' | 'busy' | 'error' | 'offline';
  type?: string;
  capabilities?: string[];
}

export interface AgentInfo {
  socketId: string;
  code: string;
  printerInfo: PrinterInfo;
  version: string;
  status: 'connected' | 'disconnected';
  connectedAt: string;
  lastSeen: string;
}

export interface BrowserInfo {
  socketId: string;
  code: string;
  userInfo: {
    email?: string;
    restaurant?: string;
  };
  status: 'connected' | 'disconnected';
  connectedAt: string;
  lastSeen: string;
}

export interface Connection {
  agent?: any; // Socket instance
  browser?: any; // Socket instance
  agentInfo?: AgentInfo;
  browserInfo?: BrowserInfo;
}

export interface PrintJob {
  jobId: string;
  labelData: {
    name: string;
    expiry?: string;
    chef?: string;
    category?: string;
    allergens?: string[];
    [key: string]: any;
  };
  settings?: {
    copies?: number;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
  };
  timestamp: string;
  from: 'browser' | 'agent';
}

export interface PrintResult {
  jobId: string;
  status: 'success' | 'error' | 'cancelled' | 'queued';
  message: string;
  timestamp: string;
  details?: any;
}

// Socket Events for Browser
export interface BrowserEvents {
  register_browser: (data: { code: string; userInfo?: any }) => void;
  print_command: (data: { jobId?: string; labelData: any; settings?: any; priority?: string }) => void;
}

export interface BrowserListeners {
  registered: (data: { status: string; message: string; connectionId: string; code: string }) => void;
  agent_connected: (data: { code: string; agentInfo: any; connectedAt: string }) => void;
  agent_disconnected: (data: { code: string; message: string; reason?: string }) => void;
  agent_status_update: (data: { code: string; printerInfo: PrinterInfo; lastSeen: string }) => void;
  print_sent: (data: { jobId: string; message: string; timestamp: string }) => void;
  print_result: (data: PrintResult) => void;
  print_error: (data: { type: string; message: string; code?: string }) => void;
  error: (data: { type: string; message: string }) => void;
}

// Socket Events for Agent
export interface AgentEvents {
  register_agent: (data: { code: string; printerInfo?: PrinterInfo; version?: string }) => void;
  print_result: (data: PrintResult) => void;
  agent_heartbeat: (data: { printerInfo: PrinterInfo }) => void;
}

export interface AgentListeners {
  registered: (data: { status: string; message: string; connectionId: string; code: string }) => void;
  print_job: (data: PrintJob) => void;
  error: (data: { type: string; message: string }) => void;
}
