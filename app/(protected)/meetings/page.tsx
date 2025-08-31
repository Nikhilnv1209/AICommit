import MeetingCard from "./meeting-card";

export default function MeetingPage() {
  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Upload Meeting</h1>
      <div className="max-w-2xl mx-auto">
        <MeetingCard />
      </div>
    </div>
  );
}
