import { NextRequest, NextResponse } from "next/server";

import {
  addAppointment,
  type Appointment,
} from "@/lib/appointmentsStore";
import {
  clearCallState,
  getCallState,
  saveCallState,
} from "@/lib/callStateStore";
import { formatHumanReadable, parseDateTime } from "@/lib/dateParser";

function xmlResponse(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/xml",
    },
  });
}

function gatherPrompt({
  prompt,
  step,
  origin,
  speechHints,
}: {
  prompt: string;
  step: string;
  origin: string;
  speechHints?: string[];
}) {
  const hintsAttribute =
    speechHints && speechHints.length > 0
      ? ` speechHints="${speechHints.join(", ")}"`
      : "";

  const actionUrl = `${origin}/api/twilio/voice?step=${step}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech dtmf" method="POST" action="${actionUrl}" speechTimeout="auto"${hintsAttribute}>
    <Say>${prompt}</Say>
  </Gather>
  <Say>I did not catch that.</Say>
  <Redirect method="POST">${actionUrl}</Redirect>
</Response>`;
}

function sayMessage(message: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${message}</Say>
  <Hangup />
</Response>`;
}

function ensureSpeechResult(value: FormDataEntryValue | null): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  const url = request.nextUrl;
  const step = url.searchParams.get("step") ?? "init";
  const form = await request.formData();

  const callSid = (form.get("CallSid") as string | null) ?? crypto.randomUUID();
  const callerNumber = (form.get("From") as string | null) ?? undefined;
  const speechResult =
    ensureSpeechResult(form.get("SpeechResult")) ??
    ensureSpeechResult(form.get("Digits"));

  const state = getCallState(callSid);

  if (callerNumber) {
    state.contactNumber = callerNumber;
  }

  switch (step) {
    case "init": {
      saveCallState(state);
      return xmlResponse(
        gatherPrompt({
          prompt:
            "Hello! You have reached the Horizon Clinic virtual scheduling assistant. May I have your full name?",
          step: "name",
          origin: url.origin,
        }),
      );
    }
    case "name": {
      if (!speechResult) {
        return xmlResponse(
          gatherPrompt({
            prompt: "I did not hear a name. Could you please tell me your full name?",
            step: "name",
            origin: url.origin,
          }),
        );
      }

      state.customerName = speechResult;
      state.phase = "collecting-datetime";
      saveCallState(state);

      return xmlResponse(
        gatherPrompt({
          prompt: `Thanks ${state.customerName}. What day and time would you like to book the appointment for?`,
          step: "datetime",
          origin: url.origin,
        }),
      );
    }
    case "datetime": {
      if (!speechResult) {
        return xmlResponse(
          gatherPrompt({
            prompt: "I didn't catch the appointment time. Please share the day and time you'd prefer.",
            step: "datetime",
            origin: url.origin,
          }),
        );
      }

      const parsed = parseDateTime(speechResult);
      if (!parsed) {
        return xmlResponse(
          gatherPrompt({
            prompt:
              "I'm sorry, I couldn't understand that date. Please state something like Friday at 2 PM or June fifth at 9 in the morning.",
            step: "datetime",
            origin: url.origin,
          }),
        );
      }

      state.appointmentDateTime = parsed.toISOString();
      state.phase = "collecting-reason";
      saveCallState(state);

      return xmlResponse(
        gatherPrompt({
          prompt:
            "Great. What is the reason for your visit so I can let the practitioner prepare?",
          step: "reason",
          origin: url.origin,
        }),
      );
    }
    case "reason": {
      if (!speechResult) {
        return xmlResponse(
          gatherPrompt({
            prompt: "Could you quickly describe the reason for your appointment?",
            step: "reason",
            origin: url.origin,
          }),
        );
      }

      state.reason = speechResult;
      state.phase = "completed";
      saveCallState(state);

      if (!state.customerName || !state.appointmentDateTime || !state.reason) {
        return xmlResponse(
          sayMessage(
            "It seems I am missing some information to complete the booking. Please try again later or reach out to our reception team.",
          ),
        );
      }

      const appointment: Appointment = addAppointment({
        customerName: state.customerName,
        appointmentDateTime: state.appointmentDateTime,
        contactNumber: state.contactNumber ?? "Unknown",
        reason: state.reason,
        callSummary: `AI assistant booked for ${state.customerName} to discuss ${state.reason}.`,
      });

      clearCallState(callSid);

      const friendlyDate = formatHumanReadable(
        appointment.appointmentDateTime,
      );

      return xmlResponse(
        sayMessage(
          `Thanks ${appointment.customerName}. I have scheduled your appointment for ${friendlyDate}. We look forward to seeing you then.`,
        ),
      );
    }
    default: {
      return xmlResponse(
        sayMessage(
          "I'm sorry, something went wrong while handling your request. Please try again later.",
        ),
      );
    }
  }
}

export async function GET(request: NextRequest) {
  const redirectUrl = new URL(request.nextUrl);
  redirectUrl.searchParams.set("step", "init");

  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${redirectUrl.toString()}</Redirect>
</Response>`,
  );
}

