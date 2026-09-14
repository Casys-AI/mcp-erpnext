import { useCallback, useEffect, useState } from "preact/hooks";
import type { ToolHost } from "../jumps";
import {
  canCheckTaskTimesheets,
  startTaskTimesheetAvailabilityCheck,
  type TaskTimesheetAvailability,
} from "./task-timesheet-availability";

interface TaskTimesheetAvailabilityOptions {
  host: ToolHost;
  taskId: string | null;
  serverTools: unknown;
  availableTools: readonly string[] | undefined;
  disabled?: boolean;
  revalidationKey?: unknown;
}

interface AvailabilityRead {
  taskId: string | null;
  revalidationKey: unknown;
  retry: number;
  availability: TaskTimesheetAvailability;
}

export function useTaskTimesheetAvailability({
  host,
  taskId,
  serverTools,
  availableTools,
  disabled = false,
  revalidationKey,
}: TaskTimesheetAvailabilityOptions): {
  availability: TaskTimesheetAvailability;
  recheck: () => void;
} {
  const [retry, setRetry] = useState(0);
  const [read, setRead] = useState<AvailabilityRead>({
    taskId: null,
    revalidationKey: undefined,
    retry: 0,
    availability: { status: "unavailable" },
  });
  const enabled = !disabled &&
    canCheckTaskTimesheets(taskId, serverTools, availableTools);

  useEffect(() => {
    if (!enabled || !taskId) {
      setRead({
        taskId,
        revalidationKey,
        retry,
        availability: { status: "unavailable" },
      });
      return;
    }
    const check = startTaskTimesheetAvailabilityCheck(
      host,
      taskId,
      (availability) =>
        setRead({ taskId, revalidationKey, retry, availability }),
    );
    return check.cancel;
  }, [host, taskId, enabled, revalidationKey, retry]);

  const recheck = useCallback(() => setRetry((value) => value + 1), []);
  // A newly opened task must not display the preceding task's empty state.
  const availability: TaskTimesheetAvailability = !enabled
    ? { status: "unavailable" }
    : read.taskId !== taskId ||
        !Object.is(read.revalidationKey, revalidationKey) ||
        read.retry !== retry ||
        read.availability.status === "unavailable"
    ? { status: "loading" }
    : read.availability;
  return { availability, recheck };
}
