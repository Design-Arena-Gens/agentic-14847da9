import { NextRequest, NextResponse } from "next/server";

import {
  addAppointment,
  listAppointments,
  type Appointment,
} from "@/lib/appointmentsStore";

export async function GET() {
  const appointments = listAppointments();
  return NextResponse.json({ appointments });
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as Partial<Appointment>;

    if (!payload) {
      return NextResponse.json(
        { error: "Request body missing" },
        { status: 400 },
      );
    }

    const appointment = addAppointment({
      contactNumber: payload.contactNumber ?? "Unknown",
      customerName: payload.customerName ?? "",
      appointmentDateTime: payload.appointmentDateTime ?? "",
      reason: payload.reason ?? "",
      callSummary:
        payload.callSummary ??
        `Conversation booked for ${payload.customerName ?? "client"}.`,
    });

    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create appointment",
      },
      { status: 400 },
    );
  }
}

