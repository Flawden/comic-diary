/** No worker is registered until explicitly enabled by the server operator. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.AUTH_RECOVERY_WORKER_ENABLED === "true") {
    const { startPasswordResetWorker } = await import("./modules/auth/password-reset-dispatch");
    startPasswordResetWorker();
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.AUTH_ACTIVATION_WORKER_ENABLED === "true") {
    const { startActivationWorker } = await import("./modules/auth/registration-activation-dispatch");
    startActivationWorker();
  }
}
