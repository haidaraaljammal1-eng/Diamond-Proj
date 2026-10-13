export type SevenStarsLiveEvent = {
  providerKey: "SEVEN_STARS";
  providerAccountId: string;
  vehicleId: number;
  latitude: number;
  longitude: number;
  speedKph: number | null;
  headingDegrees: number | null;
  ignitionOn: boolean | null;
  motionState: "UNKNOWN" | "MOVING" | "PARKED";
  capturedAt: Date;
};

type Listener = (event: SevenStarsLiveEvent) => void;

class SevenStarsLivePublisher {
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: SevenStarsLiveEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A subscriber must not interrupt provider ingest.
      }
    }
  }
}

const publisher = new SevenStarsLivePublisher();

export function getSevenStarsLivePublisher(): SevenStarsLivePublisher {
  return publisher;
}
