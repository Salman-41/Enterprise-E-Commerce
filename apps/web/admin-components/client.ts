const base = "/api/v1";
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response
    .json()
    .catch(() => ({ message: "The server returned an unreadable response." }));
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Please sign in with an operations account."
        : response.status === 403
          ? "Your role does not have permission for this operation."
          : (body.message ??
            body.error?.message ??
            `Request failed (${response.status})`),
    );
  return body as T;
}
