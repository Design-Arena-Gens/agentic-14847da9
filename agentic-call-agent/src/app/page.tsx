import { CallAgent } from "@/components/CallAgent";
import { listAppointments } from "@/lib/appointmentsStore";

export default function Home() {
  const appointments = listAppointments();

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-zinc-50 to-white pb-24 text-zinc-900">
      <header className="mx-auto flex max-w-5xl flex-col gap-6 px-6 pb-16 pt-20 text-center md:px-10">
        <div className="mx-auto w-fit rounded-full border border-emerald-200 bg-white px-4 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-600 shadow-sm">
          Voice AI Scheduler
        </div>
        <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
          Pick up every call with an AI agent that books appointments end-to-end.
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-zinc-600">
          Aurora answers inbound calls, collects appointment details, and reserves calendar slots in seconds.
          Run the full experience below and inspect the conversation + structured booking.
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-6 md:px-10">
        <CallAgent initialAppointments={appointments} />
      </main>
    </div>
  );
}
