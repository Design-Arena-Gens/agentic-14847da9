"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Phone, RefreshCw, User } from "lucide-react";

import { formatHumanReadable, parseDateTime } from "@/lib/dateParser";
import type { Appointment } from "@/lib/appointmentsStore";

type CallTranscriptEntry = {
  id: string;
  speaker: "agent" | "caller";
  text: string;
  timestamp: string;
};

type AppointmentForm = {
  name?: string;
  requestedSlot?: string;
  reason?: string;
  phoneNumber?: string;
};

const agentSteps = [
  {
    id: "greeting",
    prompt:
      "Hello! This is Aurora, the autonomous scheduling assistant for Horizon Clinic. Thanks for calling. Who do I have the pleasure of speaking with today?",
  },
  {
    id: "datetime",
    prompt:
      "Perfect, thank you. What day and time works best for your visit?",
  },
  {
    id: "reason",
    prompt:
      "Got it. Lastly, could you share the reason for your appointment so the provider can prepare?",
  },
  {
    id: "confirm",
    prompt:
      "Thanks! Let me process that for you and lock in the appointment.",
  },
] as const;

type StepId = (typeof agentSteps)[number]["id"];

type Props = {
  initialAppointments: Appointment[];
};

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
};

export function CallAgent({ initialAppointments }: Props) {
  const [appointments, setAppointments] =
    useState<Appointment[]>(initialAppointments);
  const [transcript, setTranscript] = useState<CallTranscriptEntry[]>([]);
  const [callActive, setCallActive] = useState(false);
  const [callerNumber, setCallerNumber] = useState("+1 555 010 1987");
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(-1);
  const [pendingResponse, setPendingResponse] = useState("");
  const [form, setForm] = useState<AppointmentForm>({});
  const [callCompleted, setCallCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const lastAgentMessage = useRef<string | null>(null);

  const activeStep: StepId | undefined =
    currentStepIdx >= 0 ? agentSteps[currentStepIdx]?.id : undefined;

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined") return;
    try {
      if (!("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      window.speechSynthesis.speak(utterance);
    } catch (speechError) {
      console.warn("Unable to speak text", speechError);
    }
  }, []);

  const pushTranscript = useCallback(
    (entry: Omit<CallTranscriptEntry, "id" | "timestamp">) => {
      const enriched: CallTranscriptEntry = {
        ...entry,
        id: generateId(),
        timestamp: new Date().toISOString(),
      };

      if (entry.speaker === "agent") {
        speak(entry.text);
        lastAgentMessage.current = entry.text;
      }

      setTranscript((prev) => [...prev, enriched]);
    },
    [speak],
  );

  const resetCall = useCallback(() => {
    setCallActive(false);
    setCallCompleted(false);
    setTranscript([]);
    setCurrentStepIdx(-1);
    setForm({
      name: undefined,
      requestedSlot: undefined,
      reason: undefined,
      phoneNumber: callerNumber,
    });
    setPendingResponse("");
    setError(undefined);
  }, [callerNumber]);

  const beginCall = useCallback(() => {
    resetCall();
    setCallActive(true);
    setForm((prev) => ({
      ...prev,
      phoneNumber: callerNumber,
    }));
    window.setTimeout(() => {
      setCurrentStepIdx(0);
      pushTranscript({ speaker: "agent", text: agentSteps[0]!.prompt });
    }, 300);
  }, [callerNumber, pushTranscript, resetCall]);

  const fetchAppointments = useCallback(async () => {
    try {
      const res = await fetch("/api/appointments");
      if (!res.ok) {
        throw new Error(`Failed to fetch appointments (${res.status})`);
      }

      const data = (await res.json()) as { appointments: Appointment[] };
      setAppointments(data.appointments);
    } catch (fetchError) {
      console.error(fetchError);
    }
  }, []);

  const handleSubmitResponse = useCallback(async () => {
    if (!callActive || isSubmitting) return;
    if (!pendingResponse.trim()) {
      setError("Please provide a response before continuing.");
      return;
    }

    setError(undefined);
    const responseText = pendingResponse.trim();

    pushTranscript({ speaker: "caller", text: responseText });
    setPendingResponse("");

    // Advance logic based on current step
    if (activeStep === "greeting") {
      setForm((prev) => ({ ...prev, name: responseText }));
      setCurrentStepIdx(1);
      window.setTimeout(() => {
        pushTranscript({ speaker: "agent", text: agentSteps[1]!.prompt });
      }, 450);
      return;
    }

    if (activeStep === "datetime") {
      const parsed = parseDateTime(responseText);
      if (!parsed) {
        pushTranscript({
          speaker: "agent",
          text: "Apologies, I couldn't recognise that time. Could you rephrase it, for example next Tuesday at 3 PM?",
        });
        return;
      }

      setForm((prev) => ({
        ...prev,
        requestedSlot: parsed.toISOString(),
      }));
      setCurrentStepIdx(2);
      window.setTimeout(() => {
        pushTranscript({ speaker: "agent", text: agentSteps[2]!.prompt });
      }, 450);
      return;
    }

    if (activeStep === "reason") {
      setForm((prev) => ({ ...prev, reason: responseText }));
      setCurrentStepIdx(3);
      pushTranscript({ speaker: "agent", text: agentSteps[3]!.prompt });

      try {
        setIsSubmitting(true);
        const appointmentDate = form.requestedSlot ?? new Date().toISOString();
        const payload = {
          customerName: form.name ?? "Caller",
          appointmentDateTime: appointmentDate,
          reason: responseText,
          contactNumber: form.phoneNumber ?? "N/A",
          callSummary: `AI agent booked ${form.name ?? "caller"} for ${responseText}.`,
        };

        const res = await fetch("/api/appointments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => undefined)) as
            | { error?: string }
            | undefined;
          throw new Error(data?.error ?? "Failed to save appointment");
        }

        await fetchAppointments();
        setCallCompleted(true);
        setIsSubmitting(false);
        const summaryDate = formatHumanReadable(appointmentDate);
        pushTranscript({
          speaker: "agent",
          text: `All set! I have you on the schedule for ${summaryDate}. You'll also get a confirmation text shortly. Have a wonderful day!`,
        });
      } catch (submitError) {
        console.error(submitError);
        setIsSubmitting(false);
        pushTranscript({
          speaker: "agent",
          text: "There was an issue locking in the appointment, but I captured your details. A team member will follow up shortly.",
        });
      }
      return;
    }
  }, [
    activeStep,
    callActive,
    fetchAppointments,
    form.name,
    form.phoneNumber,
    form.requestedSlot,
    isSubmitting,
    pendingResponse,
    pushTranscript,
  ]);

  useEffect(() => {
    if (!callActive) {
      window.speechSynthesis?.cancel();
    }
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, [callActive]);

  useEffect(() => {
    if (callActive) return;
    setForm((prev) => ({
      ...prev,
      phoneNumber: callerNumber,
    }));
  }, [callerNumber, callActive]);

  const lastMessage = useMemo(
    () => transcript[transcript.length - 1]?.text ?? "",
    [transcript],
  );

  return (
    <section className="space-y-10">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <header className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-zinc-900">
                Agentic Call Orchestrator
              </h2>
              <p className="text-sm text-zinc-500">
                Autonomous voice agent that captures details and books in your EHR.
              </p>
            </div>
            <button
              type="button"
              onClick={callActive ? resetCall : beginCall}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-zinc-700"
            >
              {callActive ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Reset Call
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4" />
                  Start Call
                </>
              )}
            </button>
          </header>

          <div className="space-y-6">
            <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
              <label className="flex flex-col gap-1">
                <span className="font-medium text-zinc-600">
                  Incoming caller ID
                </span>
                <input
                  type="tel"
                  value={callerNumber}
                  onChange={(event) => setCallerNumber(event.target.value)}
                  disabled={callActive}
                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 disabled:cursor-not-allowed disabled:border-zinc-100 disabled:bg-zinc-100"
                />
              </label>
              <p className="text-xs text-zinc-500">
                Aurora will attach this number to the booking record automatically.
              </p>
            </div>

            <div className="h-64 overflow-y-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
              {transcript.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-sm text-zinc-500">
                  <Phone className="mb-2 h-6 w-6 text-zinc-400" />
                  Press “Start Call” to let the AI answer incoming calls and capture appointment details.
                </div>
              ) : (
                <ul className="space-y-3 text-sm">
                  {transcript.map((line) => (
                    <li
                      key={line.id}
                      className={`flex flex-col ${line.speaker === "agent" ? "items-start" : "items-end"}`}
                    >
                      <span
                        className={`max-w-[80%] rounded-2xl px-4 py-3 ${line.speaker === "agent" ? "bg-white text-zinc-800 shadow" : "bg-zinc-900 text-white"}`}
                      >
                        {line.text}
                      </span>
                      <time className="mt-1 text-xs text-zinc-400">
                        {new Date(line.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-zinc-700">
                Caller response
              </label>
              <textarea
                value={pendingResponse}
                onChange={(event) => setPendingResponse(event.target.value)}
                disabled={!callActive || callCompleted}
                rows={3}
                placeholder={
                  callActive
                    ? "Type what the caller would say..."
                    : "Start the call to begin the conversation."
                }
                className="w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 shadow-sm focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 disabled:cursor-not-allowed disabled:border-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-400"
              />
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span>
                  {callCompleted
                    ? "Call completed and logged."
                    : callActive
                      ? "Waiting for caller response…"
                      : "Idle"}
                </span>
                <span>{lastMessage}</span>
              </div>
              <button
                type="button"
                onClick={handleSubmitResponse}
                disabled={!callActive || callCompleted || isSubmitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isSubmitting ? "Processing…" : "Send Response"}
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-900">
              <User className="h-5 w-5 text-emerald-500" />
              Caller snapshot
            </h3>
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">Phone</dt>
                <dd className="font-medium text-zinc-900">
                  {form.phoneNumber ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Name</dt>
                <dd className="font-medium text-zinc-900">
                  {form.name ?? "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Requested slot</dt>
                <dd className="font-medium text-zinc-900">
                  {form.requestedSlot
                    ? formatHumanReadable(form.requestedSlot)
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Reason</dt>
                <dd className="max-w-[180px] text-right text-zinc-900">
                  {form.reason ?? "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-zinc-900">
              <Calendar className="h-5 w-5 text-emerald-500" />
              Upcoming bookings
            </h3>
            <div className="space-y-3">
              {appointments.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No appointments booked yet. Handle a call to see them appear here.
                </p>
              ) : (
                appointments.slice(0, 5).map((appointment) => (
                  <article
                    key={appointment.id}
                    className="rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"
                  >
                    <header className="flex items-center justify-between font-medium text-zinc-900">
                      <span>{appointment.customerName}</span>
                      <span className="text-xs text-zinc-500">
                        {formatHumanReadable(appointment.appointmentDateTime)}
                      </span>
                    </header>
                    <p className="mt-2 text-xs text-zinc-500">
                      {appointment.reason}
                    </p>
                    <p className="mt-1 text-xs text-emerald-600">
                      {appointment.callSummary}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">
                      Logged {formatHumanReadable(appointment.createdAt)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
