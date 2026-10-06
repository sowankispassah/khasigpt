export class LiveSessionError extends Error {
  constructor(public readonly code: "live_session_ended" | "live_connection_failed") {
    super(code === "live_session_ended" ? "This voice session has ended. Start a new session to continue." : "Voice chat could not stay connected. Please try again.");
  }
}
