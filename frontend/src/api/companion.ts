import { api } from './axios';
import { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import {
  APIError,
  ChatHistoryResponse,
  ChatMessage,
  ChatRequest,
  CurrentTask,
  CurrentTaskSet,
  HourlyCheckinReminder,
  ProductivityLog,
  ProductivityLogCreate,
  ProductivitySummary,
} from '../types/companion';

/**
 * Standardizes Axios errors into a consistent APIError format.
 */
function handleAPIError(error: unknown): never {
  if (error && typeof error === 'object' && (error as AxiosError).isAxiosError) {
    const axiosError = error as AxiosError;
    const apiError: APIError = new Error(axiosError.message);
    apiError.status = axiosError.response?.status;
    apiError.data = axiosError.response?.data;
    // Differentiate between no response (network error, offline) and server response
    apiError.isNetworkError = !axiosError.response;
    throw apiError;
  }
  throw error;
}

/**
 * Wrapper for GET requests with a single retry for network errors (not 4xx errors).
 */
async function getWithRetry<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  try {
    const response = await api.get<T>(url, config);
    return response.data;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && (error as AxiosError).isAxiosError) {
      const axiosError = error as AxiosError;
      const isNetworkOr5xx = !axiosError.response || axiosError.response.status >= 500;
      
      // Retry once if it's a network error or 5xx error, and not cancelled
      const retryConfig = axiosError.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
      if (isNetworkOr5xx && !retryConfig?._retry && !retryConfig?.signal?.aborted) {
        if (axiosError.config) {
          retryConfig!._retry = true;
          try {
            const retryResponse = await api.request<T>(axiosError.config);
            return retryResponse.data;
          } catch (retryError) {
            return handleAPIError(retryError);
          }
        }
      }
    }
    return handleAPIError(error);
  }
}

/**
 * Wrapper for POST requests.
 */
async function postRequest<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
  try {
    const response = await api.post<T>(url, data, config);
    return response.data;
  } catch (error) {
    return handleAPIError(error);
  }
}

// --- API Methods ---

export const companionApi = {
  /**
   * Send a message to the AI companion.
   */
  async chat(payload: ChatRequest, signal?: AbortSignal): Promise<ChatMessage[]> {
    return postRequest<ChatMessage[]>('/companion/chat', payload, { signal });
  },

  /**
   * Retrieve paginated chat history.
   */
  async getChatHistory(skip = 0, limit = 50, signal?: AbortSignal): Promise<ChatHistoryResponse> {
    return getWithRetry<ChatHistoryResponse>('/companion/chat/history', {
      params: { skip, limit },
      signal,
    });
  },

  /**
   * Log a productivity check-in / focus session.
   */
  async createCheckin(data: ProductivityLogCreate, signal?: AbortSignal): Promise<ProductivityLog> {
    return postRequest<ProductivityLog>('/companion/checkin', data, { signal });
  },

  async getCheckinReminders(today = true, limit = 50, signal?: AbortSignal): Promise<HourlyCheckinReminder[]> {
    return getWithRetry<HourlyCheckinReminder[]>('/companion/checkin/reminders', {
      params: { today, limit },
      signal,
    });
  },

  async getCheckinReminder(id: string, signal?: AbortSignal): Promise<HourlyCheckinReminder> {
    return getWithRetry<HourlyCheckinReminder>(`/companion/checkin/reminders/${id}`, { signal });
  },

  /**
   * List productivity check-in history.
   */
  async getCheckinHistory(skip = 0, limit = 50, signal?: AbortSignal): Promise<ProductivityLog[]> {
    return getWithRetry<ProductivityLog[]>('/companion/checkin/history', {
      params: { skip, limit },
      signal,
    });
  },

  /**
   * Get the user's current focus task.
   */
  async getCurrentTask(signal?: AbortSignal): Promise<CurrentTask> {
    return getWithRetry<CurrentTask>('/companion/current-task', { signal });
  },

  /**
   * Set or update the current focus task.
   */
  async setCurrentTask(data: CurrentTaskSet, signal?: AbortSignal): Promise<CurrentTask> {
    return postRequest<CurrentTask>('/companion/current-task', data, { signal });
  },

  /**
   * Get aggregated productivity stats.
   */
  async getProductivitySummary(days = 7, signal?: AbortSignal): Promise<ProductivitySummary> {
    return getWithRetry<ProductivitySummary>('/companion/productivity/summary', {
      params: { days },
      signal,
    });
  },
};
