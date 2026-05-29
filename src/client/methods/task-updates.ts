/**
 * Task property update methods: text, notes, planned time, due date, stream, snooze
 */

import { SunsamaAuthError } from '../../errors/index.js';
import {
  SCHEDULE_TASK_ACTUAL_TIME_MUTATION,
  UPDATE_TASK_ADD_COMMENT_MUTATION,
  UPDATE_TASK_DUE_DATE_MUTATION,
  UPDATE_TASK_NOTES_MUTATION,
  UPDATE_TASK_PLANNED_TIME_MUTATION,
  UPDATE_TASK_SNOOZE_DATE_MUTATION,
  UPDATE_TASK_STREAM_MUTATION,
  UPDATE_TASK_TEXT_MUTATION,
} from '../../queries/index.js';
import type {
  AddCommentToTaskOptions,
  CollabSnapshot,
  GraphQLRequest,
  ScheduleTaskActualTimeInput,
  TaskCommentContent,
  TaskCommentInput,
  TaskNotesContent,
  UpdateTaskAddCommentInput,
  UpdateTaskDueDateInput,
  UpdateTaskNotesInput,
  UpdateTaskNotesOptions,
  UpdateTaskPayload,
  UpdateTaskPlannedTimeInput,
  UpdateTaskSnoozeDateInput,
  UpdateTaskStreamInput,
  UpdateTaskTextInput,
} from '../../types/index.js';
import { htmlToMarkdown, markdownToHtml, createUpdatedCollabSnapshot } from '../../utils/index.js';
import { TaskLifecycleMethods } from './task-lifecycle.js';

export abstract class TaskUpdateMethods extends TaskLifecycleMethods {
  /**
   * Updates a task's snooze date for scheduling operations
   *
   * This method provides a unified interface for all task scheduling operations:
   * - Schedule a task to a specific date
   * - Move a task to the backlog (unschedule)
   * - Reschedule a task from one date to another
   *
   * @param taskId - The ID of the task to reschedule
   * @param newDay - Target date in YYYY-MM-DD format, or null to move to backlog
   * @param options - Additional options for the operation
   * @returns The update result with success status
   * @throws SunsamaAuthError if not authenticated or request fails
   *
   * @example
   * ```typescript
   * // Schedule a task to tomorrow
   * const result = await client.updateTaskSnoozeDate('taskId123', '2025-06-16');
   *
   * // Move a task to the backlog (unschedule)
   * const result = await client.updateTaskSnoozeDate('taskId123', null);
   *
   * // Schedule with specific timezone
   * const result = await client.updateTaskSnoozeDate('taskId123', '2025-06-16', {
   *   timezone: 'America/New_York'
   * });
   *
   * // Get full response payload instead of limited response
   * const result = await client.updateTaskSnoozeDate('taskId123', '2025-06-16', {
   *   limitResponsePayload: false
   * });
   * ```
   */
  async updateTaskSnoozeDate(
    taskId: string,
    newDay: string | null,
    options?: {
      timezone?: string;
      limitResponsePayload?: boolean;
    }
  ): Promise<UpdateTaskPayload> {
    // Validate date format if a date is provided
    if (newDay !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDay)) {
        throw new SunsamaAuthError('Invalid date format. Use YYYY-MM-DD format.');
      }

      // Validate date is actually valid and not normalized
      const dateParts = newDay.split('-');
      if (dateParts.length !== 3) {
        throw new SunsamaAuthError('Invalid date format. Use YYYY-MM-DD format.');
      }
      const year = parseInt(dateParts[0]!, 10);
      const month = parseInt(dateParts[1]!, 10);
      const day = parseInt(dateParts[2]!, 10);

      const date = new Date(year, month - 1, day);
      if (
        isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
      ) {
        throw new SunsamaAuthError('Invalid date provided.');
      }
    }

    // If timezone is provided, validate it by trying to format with it
    if (options?.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: options.timezone });
      } catch (error) {
        throw new SunsamaAuthError(`Invalid timezone: ${options.timezone}`);
      }
    }

    const variables: { input: UpdateTaskSnoozeDateInput } = {
      input: {
        taskId,
        newDay,
        limitResponsePayload: options?.limitResponsePayload ?? true,
      },
    };

    const request: GraphQLRequest = {
      operationName: 'updateTaskSnoozeDate',
      variables,
      query: UPDATE_TASK_SNOOZE_DATE_MUTATION,
    };

    const response = await this.graphqlRequest(request);

    if (!response.data) {
      throw new SunsamaAuthError('No response data received');
    }

    return (response.data as { updateTaskSnoozeDate: UpdateTaskPayload }).updateTaskSnoozeDate;
  }

  /**
   * Updates the notes of a task
   *
   * This method allows you to update task notes by providing content in either HTML or Markdown
   * format. The other format will be automatically generated using conversion utilities. It uses
   * the existing collaborative editing snapshot from the task to ensure proper synchronization
   * with the Sunsama editor.
   *
   * @param taskId - The ID of the task to update
   * @param content - The new notes content in either HTML or Markdown format
   * @param options - Additional options for the operation
   * @returns The update result with success status
   * @throws SunsamaAuthError if not authenticated, task not found, or no collaborative snapshot available
   *
   * @example
   * ```typescript
   * // Update task notes with HTML content
   * const result = await client.updateTaskNotes('taskId123', {
   *   html: '<p>Updated notes with <strong>bold</strong> text</p>'
   * });
   *
   * // Update task notes with Markdown content
   * const result = await client.updateTaskNotes('taskId123', {
   *   markdown: 'Updated notes with **bold** text'
   * });
   *
   * // Get full response payload instead of limited response
   * const result = await client.updateTaskNotes('taskId123', {
   *   html: '<p>New notes</p>'
   * }, { limitResponsePayload: false });
   *
   * // Provide a specific collaborative snapshot to use
   * const task = await client.getTaskById('taskId123');
   * const result = await client.updateTaskNotes('taskId123', {
   *   markdown: 'New notes'
   * }, { collabSnapshot: task.collabSnapshot });
   * ```
   */
  async updateTaskNotes(
    taskId: string,
    content: TaskNotesContent,
    options?: UpdateTaskNotesOptions
  ): Promise<UpdateTaskPayload> {
    // Convert content to both HTML and Markdown formats
    let notes: string;
    let notesMarkdown: string;

    if ('html' in content) {
      // HTML provided, convert to Markdown
      notes = content.html;
      notesMarkdown = htmlToMarkdown(content.html);
    } else {
      // Markdown provided, convert to HTML
      notesMarkdown = content.markdown;
      notes = markdownToHtml(content.markdown);
    }

    let collabSnapshot: CollabSnapshot;

    if (options?.collabSnapshot) {
      // Use the provided collaborative snapshot
      collabSnapshot = createUpdatedCollabSnapshot(options.collabSnapshot, notesMarkdown);
    } else {
      // Fetch the task to get its collaborative snapshot.
      // Fresh tasks created via the API don't have a collab document until the server
      // lazy-initialises one — this happens the first time the task is fetched with
      // collabSnapshot requested. If the first fetch returns null, retry once after a
      // short delay to give the server time to finish initialisation.
      let existingTask = await this.getTaskById(taskId);

      if (!existingTask) {
        throw new SunsamaAuthError(`Task with ID ${taskId} not found`);
      }

      if (!existingTask.collabSnapshot) {
        // First fetch may have triggered lazy-init; wait briefly then retry.
        await new Promise(resolve => setTimeout(resolve, 1500));
        existingTask = await this.getTaskById(taskId);
      }

      if (!existingTask || !existingTask.collabSnapshot) {
        throw new SunsamaAuthError(
          `Task ${taskId} does not have a collaborative snapshot. Cannot update notes for a task without existing collaborative editing state. ` +
          `If this is a freshly-created task, open it in the Sunsama web UI once to bootstrap the collaborative document, then retry.`
        );
      }

      // Use the existing collaborative snapshot from the task
      collabSnapshot = createUpdatedCollabSnapshot(existingTask.collabSnapshot, notesMarkdown);
    }

    const variables: { input: UpdateTaskNotesInput } = {
      input: {
        taskId,
        notes,
        notesMarkdown,
        editorVersion: 3,
        collabSnapshot,
        limitResponsePayload: options?.limitResponsePayload ?? true,
      },
    };

    const request: GraphQLRequest = {
      operationName: 'updateTaskNotes',
      variables,
      query: UPDATE_TASK_NOTES_MUTATION,
    };

    const response = await this.graphqlRequest(request);

    if (!response.data) {
      throw new SunsamaAuthError('No response data received');
    }

    return (response.data as { updateTaskNotes: UpdateTaskPayload }).updateTaskNotes;
  }

  /**
   * Updates the planned time (time estimate) for a task
   *
   * This method allows you to update the time estimate for a task in minutes.
   * The time estimate represents how long you expect the task to take.
   *
   * @param taskId - The ID of the task to update
   * @param timeEstimateMinutes - The planned time in minutes (will be converted to seconds for the API)
   * @param limitResponsePayload - Whether to limit the response payload size (defaults to true)
   * @returns The update result with success status
   * @throws SunsamaAuthError if not authenticated or request fails
   *
   * @example
   * ```typescript
   * // Set task time estimate to 30 minutes
   * const result = await client.updateTaskPlannedTime('taskId123', 30);
   *
   * // Set time estimate with full response payload
   * const result = await client.updateTaskPlannedTime('taskId123', 45, false);
   *
   * // Clear time estimate (set to 0)
   * const result = await client.updateTaskPlannedTime('taskId123', 0);
   * ```
   */
  async updateTaskPlannedTime(
    taskId: string,
    timeEstimateMinutes: number,
    limitResponsePayload = true
  ): Promise<UpdateTaskPayload> {
    // Convert minutes to seconds for the API
    const timeInSeconds = timeEstimateMinutes * 60;

    const variables: { input: UpdateTaskPlannedTimeInput } = {
      input: {
        taskId,
        timeInSeconds,
        limitResponsePayload,
      },
    };

    const request: GraphQLRequest = {
      operationName: 'updateTaskPlannedTime',
      variables,
      query: UPDATE_TASK_PLANNED_TIME_MUTATION,
    };

    const response = await this.graphqlRequest(request);

    if (!response.data) {
      throw new SunsamaAuthError('No response data received');
    }

    return (response.data as { updateTaskPlannedTime: UpdateTaskPayload }).updateTaskPlannedTime;
  }

  /**
   * Updates the due date for a task
   *
   * This method allows you to set or clear a task's due date. The due date represents
   * when the task should be completed and can be used for deadline tracking and planning.
   *
   * @param taskId - The ID of the task to update
   * @param dueDate - The due date as Date, ISO string, or null to clear the due date
   * @param limitResponsePayload - Whether to limit the response payload size (defaults to true)
   * @returns The update result with success status
   * @throws SunsamaAuthError if not authenticated or request fails
   *
   * @example
   * ```typescript
   * // Set task due date to a specific date
   * const result = await client.updateTaskDueDate('taskId123', new Date('2025-06-21'));
   *
   * // Set due date with ISO string
   * const result = await client.updateTaskDueDate('taskId123', '2025-06-21T04:00:00.000Z');
   *
   * // Clear the due date
   * const result = await client.updateTaskDueDate('taskId123', null);
   *
   * // Get full response payload instead of limited response
   * const result = await client.updateTaskDueDate('taskId123', new Date('2025-06-21'), false);
   * ```
   */
  async updateTaskDueDate(
    taskId: string,
    dueDate: Date | string | null,
    limitResponsePayload = true
  ): Promise<UpdateTaskPayload> {
    // Convert Date to ISO string if needed
    let dueDateString: string | null = null;
    if (dueDate !== null) {
      if (dueDate instanceof Date) {
        dueDateString = dueDate.toISOString();
      } else {
        dueDateString = dueDate;
      }
    }

    const variables: { input: UpdateTaskDueDateInput } = {
      input: {
        taskId,
        dueDate: dueDateString,
        limitResponsePayload,
      },
    };

    const request: GraphQLRequest = {
      operationName: 'updateTaskDueDate',
      variables,
      query: UPDATE_TASK_DUE_DATE_MUTATION,
    };

    const response = await this.graphqlRequest(request);

    if (!response.data) {
      throw new SunsamaAuthError('No response data received');
    }

    return (response.data as { updateTaskDueDate: UpdateTaskPayload }).updateTaskDueDate;
  }

  /**
   * Updates the text/title of a task
   *
   * This method allows you to update the main text or title of a task. You can optionally
   * specify a recommended stream ID for the task.
   *
   * @param taskId - The ID of the task to update
   * @param text - The new text/title for the task
   * @param options - Additional options for the operation
   * @returns The update result with success status
   * @throws SunsamaAuthError if not authenticated or request fails
   *
   * @example
   * ```typescript
   * // Update task text to a new title
   * const result = await client.updateTaskText('taskId123', 'Updated task title');
   *
   * // Update with recommended stream ID
   * const result = await client.updateTaskText('taskId123', 'Task with stream', {
   *   recommendedStreamId: 'stream-id-123'
   * });
   *
   * // Get full response payload instead of limited response
   * const result = await client.updateTaskText('taskId123', 'New title', {
   *   limitResponsePayload: false
   * });
   * ```
   */
  async updateTaskText(
    taskId: string,
    text: string,
    options?: {
      recommendedStreamId?: string | null;
      limitResponsePayload?: boolean;
    }
  ): Promise<UpdateTaskPayload> {
    const variables: { input: UpdateTaskTextInput } = {
      input: {
        taskId,
        text,
        recommendedStreamId: options?.recommendedStreamId || null,
        limitResponsePayload: options?.limitResponsePayload ?? true,
      },
    };

    const request: GraphQLRequest = {
      operationName: 'updateTaskText',
      variables,
      query: UPDATE_TASK_TEXT_MUTATION,
    };

    const response = await this.graphqlRequest(request);

    if (!response.data) {
      throw new SunsamaAuthError('No response data received');
    }

    return (response.data as { updateTaskText: UpdateTaskPayload }).updateTaskText;
  }

  /**
   * Updates the stream assignment for a task
   *
   * This method allows you to assign a task to a specific stream (project/category).
   * A stream represents a project, area of focus, or organizational category in Sunsama.
   *
   * @param taskId - The ID of the task to update
   * @param streamId - The ID of the stream to assign the task to
   * @param limitResponsePayload - Whether to limit the response payload size (defaults to true)
   * @returns The update result with success status
   * @throws SunsamaAuthError if not authenticated or request fails
   *
   * @example
   * ```typescript
   * // Assign task to a specific stream
   * const result = await client.updateTaskStream('taskId123', 'streamId456');
   *
   * // Get full response payload instead of limited response
   * const result = await client.updateTaskStream('taskId123', 'streamId456', false);
   * ```
   */
  async updateTaskStream(
    taskId: string,
    streamId: string,
    limitResponsePayload = true
  ): Promise<UpdateTaskPayload> {
    const variables: { input: UpdateTaskStreamInput } = {
      input: {
        taskId,
        streamId,
        limitResponsePayload,
      },
    };

    const request: GraphQLRequest = {
      operationName: 'updateTaskStream',
      variables,
      query: UPDATE_TASK_STREAM_MUTATION,
    };

    const response = await this.graphqlRequest(request);

    if (!response.data) {
      throw new SunsamaAuthError('No response data received');
    }

    return (response.data as { updateTaskStream: UpdateTaskPayload }).updateTaskStream;
  }

  /**
   * Insert or replace a single actualTime entry on a task.
   *
   * Sunsama's web UI uses one mutation (`scheduleTaskActualTime`) for both
   * "add new entry" and "edit existing entry". The `originalStartDate`/
   * `originalEndDate` matchers identify which entry is being replaced; for a
   * fresh insert pass the same values as `startDate`/`endDate`.
   *
   * `userId` and `timezone` default to the authenticated user's values
   * (fetched via getUser if not already cached).
   *
   * @example
   * ```ts
   * // Record a 30-minute call that happened from 13:55 local time.
   * const start = new Date('2026-05-15T13:55:00+10:00');
   * const end   = new Date('2026-05-15T14:25:00+10:00');
   * await client.scheduleTaskActualTime('6a06a47077398a0001de0262', start, end);
   * ```
   */
  async scheduleTaskActualTime(
    taskId: string,
    startDate: Date | string,
    endDate: Date | string,
    options: {
      originalStartDate?: Date | string;
      originalEndDate?: Date | string;
      userId?: string;
      timezone?: string;
      limitResponsePayload?: boolean;
    } = {}
  ): Promise<UpdateTaskPayload> {
    const toIso = (v: Date | string) => (typeof v === 'string' ? v : v.toISOString());

    let { userId, timezone } = options;
    if (!userId || !timezone) {
      const user = await (
        this as unknown as { getUser: () => Promise<{ _id: string; timezone?: string }> }
      ).getUser();
      userId = userId ?? user._id;
      timezone = timezone ?? user.timezone ?? 'UTC';
    }

    const startIso = toIso(startDate);
    const endIso = toIso(endDate);

    const input: ScheduleTaskActualTimeInput = {
      taskId,
      startDate: startIso,
      endDate: endIso,
      originalStartDate: options.originalStartDate ? toIso(options.originalStartDate) : startIso,
      originalEndDate: options.originalEndDate ? toIso(options.originalEndDate) : endIso,
      userId,
      timezone,
      limitResponsePayload: options.limitResponsePayload ?? true,
    };

    const request: GraphQLRequest = {
      operationName: 'scheduleTaskActualTime',
      variables: { input },
      query: SCHEDULE_TASK_ACTUAL_TIME_MUTATION,
    };

    const response = await this.graphqlRequest(request);
    if (!response.data) throw new SunsamaAuthError('No response data received');
    return (response.data as { scheduleTaskActualTime: UpdateTaskPayload }).scheduleTaskActualTime;
  }

  /**
   * Adds a comment to a task
   *
   * Comments support HTML or Markdown content and do not require a collaborative
   * snapshot, making this safe to call on freshly-created tasks that have not
   * yet been opened in the Sunsama UI.
   *
   * @param taskId - The ID of the task to add the comment to
   * @param content - The comment content in either HTML or Markdown format
   * @param options - Additional options for the operation
   * @returns The update result with success status
   * @throws SunsamaAuthError if not authenticated, task not found, or request fails
   *
   * @example
   * ```typescript
   * // Add a comment with Markdown content
   * const result = await client.addCommentToTask('taskId123', {
   *   markdown: 'Follow-up: contacted the vendor'
   * });
   *
   * // Add a comment with HTML content
   * const result = await client.addCommentToTask('taskId123', {
   *   html: '<p>Follow-up: contacted the vendor</p>'
   * });
   *
   * // Add a comment with explicit userId and groupId
   * const result = await client.addCommentToTask('taskId123', {
   *   markdown: 'Done'
   * }, { userId: 'user-id-123', groupId: 'group-id-456' });
   * ```
   */
  async addCommentToTask(
    taskId: string,
    content: TaskCommentContent,
    options?: AddCommentToTaskOptions
  ): Promise<UpdateTaskPayload> {
    let text: string;
    let markdown: string;

    if ('html' in content) {
      text = content.html;
      markdown = htmlToMarkdown(content.html);
    } else {
      markdown = content.markdown;
      text = markdownToHtml(content.markdown);
    }

    let { userId, groupId } = options ?? {};

    if (!userId || !groupId) {
      const [user, task] = await Promise.all([
        !userId
          ? (this as unknown as { getUser: () => Promise<{ _id: string }> }).getUser()
          : Promise.resolve(null),
        !groupId
          ? this.getTaskById(taskId)
          : Promise.resolve(null),
      ]);

      if (!userId) {
        if (!user) throw new SunsamaAuthError('Could not resolve authenticated user');
        userId = user._id;
      }

      if (!groupId) {
        if (!task) throw new SunsamaAuthError(`Task with ID ${taskId} not found`);
        groupId = (task as unknown as { groupId: string }).groupId;
      }
    }

    const comment: TaskCommentInput = {
      userId,
      text,
      markdown,
      editorVersion: 3,
      groupId,
      createdAt: options?.createdAt ?? new Date().toISOString(),
      editedAt: null,
      deleted: false,
      file: null,
      fileMetadata: null,
    };

    const variables: { input: UpdateTaskAddCommentInput } = {
      input: {
        taskId,
        comment,
        followers: [],
        limitResponsePayload: options?.limitResponsePayload ?? true,
      },
    };

    const request: GraphQLRequest = {
      operationName: 'updateTaskAddComment',
      variables,
      query: UPDATE_TASK_ADD_COMMENT_MUTATION,
    };

    const response = await this.graphqlRequest(request);

    if (!response.data) {
      throw new SunsamaAuthError('No response data received');
    }

    return (response.data as { updateTaskAddComment: UpdateTaskPayload }).updateTaskAddComment;
  }
}
