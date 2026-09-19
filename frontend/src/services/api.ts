// API Service Layer for RootTrace
import type {
  InvestigateResponse,
  DocumentItem,
  HealthStatus,
  ParsedApiLogEntry,
} from '../types';

export async function runInvestigation(question: string): Promise<InvestigateResponse> {
  const res = await fetch('/investigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: `HTTP ${res.status} error` }));
    throw new Error(errorData.detail || `Investigation request failed with status ${res.status}`);
  }

  return res.json();
}

export async function fetchDocuments(): Promise<{ count: number; documents: DocumentItem[] }> {
  const res = await fetch('/documents');
  if (!res.ok) {
    throw new Error(`Failed to fetch documents: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch('/health');
  if (!res.ok) {
    throw new Error(`Failed to fetch health status: HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchApiLogs(limit: number = 100): Promise<{
  total_logged: number;
  log_file: string;
  recent_logs: ParsedApiLogEntry[];
}> {
  const res = await fetch(`/gemini-logs?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch API logs: HTTP ${res.status}`);
  }
  const data = await res.json();
  const parsedLogs = (data.recent_logs || []).map((line: string, index: number) =>
    parseLogLine(line, index)
  );

  return {
    total_logged: data.total_logged || 0,
    log_file: data.log_file || '',
    recent_logs: parsedLogs.reverse(), // most recent first
  };
}

export function parseLogLine(raw: string, index: number): ParsedApiLogEntry {
  // Example log line format:
  // [2026-09-19 02:05:41.789] [SUCCESS] [Featherless] LLM_GENERATE | Model: Qwen/Qwen2.5-7B-Instruct | Key #4 (rc_2422...dc9c) |  5.13s | Input: "You are investigating..." | output_len=458 chars
  const fallback: ParsedApiLogEntry = {
    id: `log-${index}-${Date.now()}`,
    raw,
    timestamp: '',
    status: 'UNKNOWN',
    provider: 'Unknown',
    callType: 'CALL',
    model: 'Unknown',
    keyInfo: '',
    latencySec: 0,
    inputSnippet: raw,
    details: '',
  };

  try {
    const timestampMatch = raw.match(/^\[([\d-]+\s[\d:.]+)\]/);
    const timestamp = timestampMatch ? timestampMatch[1] : '';

    const statusMatch = raw.match(/\[(SUCCESS|RETRY_429|TEMP_503|FAILED|UNKNOWN)\]/);
    const status = statusMatch ? statusMatch[1] : 'UNKNOWN';

    const providerMatch = raw.match(/\[([A-Za-z0-9\s()]+)\]\s+(LLM_GENERATE|EMBED_QUERY|EMBED_BATCH)/);
    const provider = providerMatch ? providerMatch[1].trim() : 'Unknown';
    const callType = providerMatch ? providerMatch[2].trim() : 'LLM_GENERATE';

    // Extract Model
    const modelMatch = raw.match(/Model:\s*([^|]+)/);
    const model = modelMatch ? modelMatch[1].trim() : '';

    // Extract Key
    const keyMatch = raw.match(/Key\s*([^|]+)/);
    const keyInfo = keyMatch ? keyMatch[1].trim() : '';

    // Extract Latency
    const latencyMatch = raw.match(/\|\s*([\d.]+)s\s*\|/);
    const latencySec = latencyMatch ? parseFloat(latencyMatch[1]) : 0;

    // Extract Input snippet
    const inputMatch = raw.match(/Input:\s*"([^"]+)"/);
    const inputSnippet = inputMatch ? inputMatch[1] : '';

    // Extract Error or output details
    let errorMsg: string | undefined;
    const errorMatch = raw.match(/Error:\s*(.+)$/);
    if (errorMatch) {
      errorMsg = errorMatch[1].trim();
    }

    let details = '';
    const detailsMatch = raw.match(/\|\s*(output_len=[^|]+|dim=[^|]+)/);
    if (detailsMatch) {
      details = detailsMatch[1].trim();
    } else if (errorMsg) {
      details = errorMsg;
    }

    return {
      id: `log-${index}-${timestamp || index}`,
      raw,
      timestamp,
      status,
      provider,
      callType,
      model,
      keyInfo,
      latencySec,
      inputSnippet,
      details,
      errorMsg,
    };
  } catch {
    return fallback;
  }
}
