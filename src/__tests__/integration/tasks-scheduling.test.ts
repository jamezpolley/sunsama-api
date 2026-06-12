/**
 * Integration tests for task scheduling operations
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll } from 'vitest';
import { SunsamaClient } from '../../client/index.js';
import { getAuthenticatedClient, hasCredentials, trackTaskForCleanup } from './setup.js';

describe.skipIf(!hasCredentials())('Task Scheduling Operations (Integration)', () => {
  let client: SunsamaClient;

  beforeAll(async () => {
    client = await getAuthenticatedClient();
  });

  describe('updateTaskSnoozeDate', () => {
    it('should schedule a task to a future date', async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const taskId = SunsamaClient.generateTaskId();
      trackTaskForCleanup(taskId);

      await client.createTask(`Test Schedule Task - ${timestamp}`, { taskId });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0]!;

      const result = await client.updateTaskSnoozeDate(taskId, tomorrowStr);

      expect(result.success).toBe(true);
    });

    it('should move a task to backlog', async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const taskId = SunsamaClient.generateTaskId();
      trackTaskForCleanup(taskId);

      await client.createTask(`Test Backlog Task - ${timestamp}`, { taskId });

      // First schedule it
      const today = new Date().toISOString().split('T')[0]!;
      await client.updateTaskSnoozeDate(taskId, today);

      // Then move to backlog
      const result = await client.updateTaskSnoozeDate(taskId, null);

      expect(result.success).toBe(true);
    });

    it('should reschedule a task from one date to another', async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const taskId = SunsamaClient.generateTaskId();
      trackTaskForCleanup(taskId);

      await client.createTask(`Test Reschedule Task - ${timestamp}`, { taskId });

      // Schedule to tomorrow
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0]!;
      await client.updateTaskSnoozeDate(taskId, tomorrowStr);

      // Reschedule to today
      const today = new Date().toISOString().split('T')[0]!;
      const result = await client.updateTaskSnoozeDate(taskId, today);

      expect(result.success).toBe(true);
    });

    it('should support timezone option', async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const taskId = SunsamaClient.generateTaskId();
      trackTaskForCleanup(taskId);

      await client.createTask(`Test Timezone Schedule - ${timestamp}`, { taskId });

      const today = new Date().toISOString().split('T')[0]!;
      const result = await client.updateTaskSnoozeDate(taskId, today, {
        timezone: 'America/New_York',
      });

      expect(result.success).toBe(true);
    });

    it('should support limitResponsePayload option', async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const taskId = SunsamaClient.generateTaskId();
      trackTaskForCleanup(taskId);

      await client.createTask(`Test Response Payload - ${timestamp}`, { taskId });

      const today = new Date().toISOString().split('T')[0]!;
      const result = await client.updateTaskSnoozeDate(taskId, today, {
        limitResponsePayload: false,
      });

      expect(result.success).toBe(true);
      expect(result.updatedFields).toBeDefined();
    });
  });

  describe('moveTaskToDay', () => {
    it('should move a task to a future day', async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const taskId = SunsamaClient.generateTaskId();
      trackTaskForCleanup(taskId);

      const today = new Date().toISOString().split('T')[0]!;
      await client.createTask(`Test MoveToDay Future - ${timestamp}`, {
        taskId,
        snoozeUntil: new Date(),
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0]!;

      const result = await client.moveTaskToDay(taskId, tomorrowStr, { fromDay: today });

      expect(Array.isArray(result.updatedTaskIds)).toBe(true);
      expect(result.updatedTaskIds.length).toBeGreaterThan(0);
      expect(result.__typename).toBe('UpdateTasksBulkPayload');
    });

    it('should accept explicit timezone option', async () => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const taskId = SunsamaClient.generateTaskId();
      trackTaskForCleanup(taskId);

      const today = new Date().toISOString().split('T')[0]!;
      await client.createTask(`Test MoveToDay TZ - ${timestamp}`, {
        taskId,
        snoozeUntil: new Date(),
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0]!;

      const result = await client.moveTaskToDay(taskId, tomorrowStr, {
        fromDay: today,
        timezone: 'America/New_York',
      });

      expect(Array.isArray(result.updatedTaskIds)).toBe(true);
    });

    it('should auto-resolve source day when fromDay is omitted', async () => {
      // NOTE: This test covers the getTaskById path for resolving movedFromPanelDate.
      // The server-side complete-as-of-past-day side-effect is NOT exercised here —
      // that requires manually verifying task.completed and task.completeOn after a
      // past-day move. Leave that for a manual smoke test by James.
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const taskId = SunsamaClient.generateTaskId();
      trackTaskForCleanup(taskId);

      await client.createTask(`Test MoveToDay AutoFrom - ${timestamp}`, {
        taskId,
        snoozeUntil: new Date(),
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0]!;

      // fromDay omitted — method should fetch task and read orderings[0].panelDate
      const result = await client.moveTaskToDay(taskId, tomorrowStr);

      expect(Array.isArray(result.updatedTaskIds)).toBe(true);
    });
  });
});
