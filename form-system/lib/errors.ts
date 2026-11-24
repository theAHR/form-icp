export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function check(
  value: unknown,
  status: number,
  message: string,
): asserts value {
  if (!value) throw new AppError(status, message);
}
