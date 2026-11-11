/**
 * Copyright 2026 Mark. Licensed under Apache-2.0; see LICENSE.
 * Copied from MarkChu-git/Always-Ontrack at 4e038b4af7f030cd4cdf07832c7e472184a2f519.
 * Cove adaptation: retain the read-only projection; distinguish a missing instance
 * from a real instance whose status was omitted by the server.
 */
import type {
  ProjectSummary,
  TaskDefinitionSummary,
  TaskSummary,
  UnitSummary,
} from './types.js';

export type StudentTaskVisibility =
  | 'within_target'
  | 'beyond_target'
  | 'tutorial_mismatch'
  | 'unknown';

export interface StudentTaskReference {
  projectId: number;
  unitId: number;
  taskDefinitionId: number;
}

export interface StudentTaskDates {
  start?: string;
  target?: string;
  unitDue?: string;
  instanceDue?: string;
  effectiveDue?: string;
  completion?: string;
  submission?: string;
}

export interface StudentTaskView {
  reference: StudentTaskReference;
  unitCode?: string;
  unitName?: string;
  projectTargetGrade?: number;
  taskTargetGrade?: number;
  tutorialStream?: string;
  flexibleDates: boolean;
  specialConsiderationDays: number;
  visibility: StudentTaskVisibility;
  status: string;
  taskInstanceId?: number;
  definition: TaskDefinitionSummary;
  instance?: TaskSummary;
  dates: StudentTaskDates;
}

export interface BuildStudentTaskViewOptions {
  includeBeyondTarget?: boolean;
  includeTutorialMismatches?: boolean;
  includeUnknown?: boolean;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function integerValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function projectTargetGrade(project: ProjectSummary): number | undefined {
  return integerValue(project.targetGrade) ?? integerValue(project.target_grade);
}

function definitionTargetGrade(definition: TaskDefinitionSummary): number | undefined {
  return integerValue(definition.targetGrade) ?? integerValue(definition.target_grade);
}

function definitionTutorialStream(definition: TaskDefinitionSummary): string | undefined {
  return (
    stringValue(definition.tutorialStreamAbbr) ??
    stringValue(definition.tutorial_stream_abbr)
  );
}

function taskDefinitionId(task: TaskSummary): number | undefined {
  return (
    integerValue(task.taskDefinitionId) ??
    integerValue(task.task_definition_id) ??
    integerValue(task.definition?.id)
  );
}

function unitTaskDefinitions(unit: UnitSummary): TaskDefinitionSummary[] {
  const definitions = unit.taskDefinitions ?? unit.task_definitions;
  return Array.isArray(definitions)
    ? definitions.filter(
        (definition): definition is TaskDefinitionSummary =>
          recordValue(definition) !== undefined && integerValue(definition.id) !== undefined,
      )
    : [];
}

function embeddedDefinition(task: TaskSummary): TaskDefinitionSummary | undefined {
  const id = taskDefinitionId(task);
  if (id === undefined) {
    return undefined;
  }

  return {
    ...task.definition,
    id,
    abbreviation:
      stringValue(task.definition?.abbreviation) ??
      stringValue(task.abbreviation) ??
      stringValue(task.abbr),
    name: stringValue(task.definition?.name) ?? stringValue(task.name),
    targetGrade:
      integerValue(task.definition?.targetGrade) ?? integerValue(task.target_grade),
    uploadRequirements:
      task.definition?.uploadRequirements ??
      task.definition?.upload_requirements ??
      task.uploadRequirements ??
      task.upload_requirements,
  };
}

function definitionsForProject(project: ProjectSummary, unit: UnitSummary): TaskDefinitionSummary[] {
  const definitions = unitTaskDefinitions(unit);
  const byId = new Map<number, TaskDefinitionSummary>(
    definitions.map((definition) => [definition.id as number, { ...definition }]),
  );

  for (const task of project.tasks ?? []) {
    const definition = embeddedDefinition(task);
    if (!definition || byId.has(definition.id as number)) {
      continue;
    }
    byId.set(definition.id as number, definition);
  }

  return [...byId.values()];
}

interface TutorialContext {
  state: 'known' | 'unknown';
  enrolledStreams: Set<string>;
  availableStreams: Set<string>;
  appliesToAllStreams: boolean;
}

/**
 * Resolve the observed production join:
 * project.tutorial_enrolments[].tutorial_id
 * -> unit.tutorials[].id
 * -> unit.tutorials[].tutorial_stream_abbr
 * -> unit.tutorial_streams[].abbreviation.
 */
function enrolledTutorialStreams(project: ProjectSummary, unit: UnitSummary): TutorialContext {
  const projectRecord = project as Record<string, unknown>;
  const unitRecord = unit as Record<string, unknown>;
  const enrolments = projectRecord.tutorial_enrolments;
  const tutorials = unitRecord.tutorials;
  const streams = unitRecord.tutorial_streams;
  if (!Array.isArray(enrolments) || !Array.isArray(tutorials) || !Array.isArray(streams)) {
    return {
      state: 'unknown',
      enrolledStreams: new Set(),
      availableStreams: new Set(),
      appliesToAllStreams: false,
    };
  }

  const availableStreams = new Set<string>();
  for (const rawStream of streams) {
    const stream = recordValue(rawStream);
    const abbreviation =
      stringValue(stream?.abbreviation) ??
      stringValue(stream?.tutorial_stream_abbr);
    if (!stream || !abbreviation) {
      return {
        state: 'unknown',
        enrolledStreams: new Set(),
        availableStreams,
        appliesToAllStreams: false,
      };
    }
    availableStreams.add(abbreviation);
  }

  const tutorialsById = new Map<number, Record<string, unknown>>();
  for (const rawTutorial of tutorials) {
    const tutorial = recordValue(rawTutorial);
    const id = integerValue(tutorial?.id);
    if (!tutorial || id === undefined) {
      return {
        state: 'unknown',
        enrolledStreams: new Set(),
        availableStreams,
        appliesToAllStreams: false,
      };
    }
    tutorialsById.set(id, tutorial);
  }

  const enrolledStreams = new Set<string>();
  let appliesToAllStreams = false;
  for (const rawEnrolment of enrolments) {
    const enrolment = recordValue(rawEnrolment);
    const tutorialId = integerValue(enrolment?.tutorial_id);
    const tutorial = tutorialId === undefined ? undefined : tutorialsById.get(tutorialId);
    if (!enrolment || tutorialId === undefined || !tutorial) {
      return {
        state: 'unknown',
        enrolledStreams,
        availableStreams,
        appliesToAllStreams,
      };
    }

    const stream =
      stringValue(tutorial.tutorial_stream_abbr) ??
      stringValue(tutorial.tutorialStreamAbbr);
    if (!stream) {
      // The upstream contract omits tutorial_stream_abbr for a generic tutorial.
      appliesToAllStreams = true;
      continue;
    }
    if (!availableStreams.has(stream)) {
      return {
        state: 'unknown',
        enrolledStreams,
        availableStreams,
        appliesToAllStreams,
      };
    }
    enrolledStreams.add(stream);
  }

  return {
    state: 'known',
    enrolledStreams,
    availableStreams,
    appliesToAllStreams,
  };
}

function visibilityFor(
  definition: TaskDefinitionSummary,
  targetGrade: number | undefined,
  tutorialContext: TutorialContext,
): StudentTaskVisibility {
  const requiredGrade = definitionTargetGrade(definition);
  if (
    targetGrade !== undefined &&
    requiredGrade !== undefined &&
    requiredGrade > targetGrade
  ) {
    return 'beyond_target';
  }

  const requiredStream = definitionTutorialStream(definition);
  if (requiredStream) {
    if (
      tutorialContext.state === 'unknown' ||
      !tutorialContext.availableStreams.has(requiredStream)
    ) {
      return 'unknown';
    }
    if (
      !tutorialContext.appliesToAllStreams &&
      !tutorialContext.enrolledStreams.has(requiredStream)
    ) {
      return 'tutorial_mismatch';
    }
  }

  if (targetGrade === undefined && requiredGrade !== undefined) {
    return 'unknown';
  }

  return 'within_target';
}

function taskDates(
  definition: TaskDefinitionSummary,
  instance: TaskSummary | undefined,
): StudentTaskDates {
  const definitionRecord = definition as Record<string, unknown>;
  return {
    start:
      stringValue(definitionRecord.startDate) ??
      stringValue(definitionRecord.start_date),
    target:
      stringValue(definitionRecord.targetDate) ??
      stringValue(definitionRecord.target_date),
    unitDue:
      stringValue(definitionRecord.dueDate) ??
      stringValue(definitionRecord.due_date),
    instanceDue:
      stringValue(instance?.dueDate) ??
      stringValue(instance?.due_date),
    effectiveDue:
      stringValue(instance?.dueDate) ??
      stringValue(instance?.due_date) ??
      stringValue(definitionRecord.dueDate) ??
      stringValue(definitionRecord.due_date),
    completion:
      stringValue(instance?.completionDate) ??
      stringValue(instance?.completion_date),
    submission:
      stringValue(instance?.submissionDate) ??
      stringValue(instance?.submission_date),
  };
}

function includeVisibility(
  visibility: StudentTaskVisibility,
  options: BuildStudentTaskViewOptions,
): boolean {
  if (visibility === 'beyond_target') {
    return options.includeBeyondTarget === true;
  }
  if (visibility === 'tutorial_mismatch') {
    return options.includeTutorialMismatches === true;
  }
  if (visibility === 'unknown') {
    return options.includeUnknown === true;
  }
  return true;
}

export function buildStudentTaskViews(
  projects: ProjectSummary[],
  options: BuildStudentTaskViewOptions = {},
): StudentTaskView[] {
  const views: StudentTaskView[] = [];

  for (const project of projects) {
    const unit = project.unit;
    if (!unit || !Number.isInteger(unit.id)) {
      continue;
    }

    const targetGrade = projectTargetGrade(project);
    const tutorialContext = enrolledTutorialStreams(project, unit);
    const instances = new Map<number, TaskSummary>();
    for (const task of project.tasks ?? []) {
      const definitionId = taskDefinitionId(task);
      if (definitionId === undefined) {
        continue;
      }
      const existing = instances.get(definitionId);
      if (existing) {
        throw new Error(
          `Multiple task instances (${existing.id}, ${task.id}) reference definition ${definitionId} in project ${project.id}; the student task identity is ambiguous.`,
        );
      }
      instances.set(definitionId, task);
    }

    for (const definition of definitionsForProject(project, unit)) {
      const definitionId = integerValue(definition.id);
      if (definitionId === undefined) {
        continue;
      }

      const visibility = visibilityFor(definition, targetGrade, tutorialContext);
      if (!includeVisibility(visibility, options)) {
        continue;
      }

      const instance = instances.get(definitionId);
      views.push({
        reference: {
          projectId: project.id,
          unitId: unit.id,
          taskDefinitionId: definitionId,
        },
        unitCode: stringValue(unit.code),
        unitName: stringValue(unit.name),
        projectTargetGrade: targetGrade,
        taskTargetGrade: definitionTargetGrade(definition),
        tutorialStream: definitionTutorialStream(definition),
        flexibleDates:
          unit.allowFlexibleDates === true || unit.allow_flexible_dates === true,
        specialConsiderationDays:
          integerValue(project.specConDays) ??
          integerValue(project.spec_con_days) ??
          0,
        visibility,
        status: stringValue(instance?.status) ?? (instance ? 'unknown' : 'not_instantiated'),
        taskInstanceId: integerValue(instance?.id),
        definition: { ...definition },
        instance: instance ? { ...instance } : undefined,
        dates: taskDates(definition, instance),
      });
    }
  }

  return views;
}

