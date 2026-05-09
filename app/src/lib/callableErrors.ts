export const getCallableErrorMessage = (error: unknown, fallback: string): string => {
  if (!error || typeof error !== "object") {
    return fallback;
  }

  const candidate = error as {
    message?: string;
    details?: unknown;
  };

  const details = candidate.details;
  if (details && typeof details === "object" && "errors" in details) {
    const rawErrors = (details as { errors?: unknown }).errors;
    if (Array.isArray(rawErrors)) {
      const messages = rawErrors
        .map((item) => String(item).trim())
        .filter(Boolean);

      if (messages.length > 0) {
        return messages.join(" ");
      }
    }
  }

  if (typeof details === "string" && details.trim()) {
    return details.trim();
  }

  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message.trim();
  }

  return fallback;
};
