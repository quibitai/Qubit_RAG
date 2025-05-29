#!/usr/bin/env tsx

/**
 * Modern Asana Tool Demo Script
 *
 * This script demonstrates all the advanced capabilities of the Modern Asana Tool:
 * - Workflow Orchestration
 * - Semantic Entity Resolution
 * - Intelligent Error Recovery
 * - Response Enhancement
 * - Context Management
 *
 * Usage:
 *   pnpm tsx scripts/demo-asana-tool.ts
 *
 * Prerequisites:
 *   - Set ASANA_PAT environment variable
 *   - Set ASANA_DEFAULT_WORKSPACE_GID environment variable
 *   - Optionally set ASANA_DEFAULT_TEAM_GID environment variable
 */

import {
  createModernAsanaTool,
  type ToolExecutionContext,
} from '../lib/ai/tools/asana/modern-asana-tool';
import { AsanaApiClient } from '../lib/ai/tools/asana/api-client/client';
import {
  ASANA_PAT,
  getWorkspaceGid,
  getTeamGid,
} from '../lib/ai/tools/asana/config';

// Demo configuration
const DEMO_CONFIG = {
  enableWorkflows: true,
  enableSemanticResolution: true,
  enableErrorRecovery: true,
  enableResponseEnhancement: true,
};

// Demo context
const createDemoContext = (operation: string): ToolExecutionContext => ({
  sessionId: `demo-session-${Date.now()}`,
  requestId: `demo-request-${Math.random().toString(36).substr(2, 9)}`,
  userIntent: `Demo: ${operation}`,
  conversationContext: {
    demo_mode: true,
    workspace_id: getWorkspaceGid(),
    team_id: getTeamGid(),
  },
});

// Utility functions
function logSection(title: string) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 ${title}`);
  console.log('='.repeat(60));
}

function logResult(operation: string, result: any) {
  console.log(`\n✅ ${operation} Result:`);
  console.log('📊 Metadata:', JSON.stringify(result.metadata, null, 2));

  if (result.enhanced) {
    console.log('💬 Enhanced Message:', result.enhanced.message);
    console.log('📝 Formatted Response:');
    console.log(result.enhanced.formatted.markdown);

    if (result.enhanced.suggestions.length > 0) {
      console.log('💡 Suggestions:');
      result.enhanced.suggestions.forEach((suggestion: any, index: number) => {
        console.log(
          `  ${index + 1}. [${suggestion.type}] ${suggestion.title} (${suggestion.confidence})`,
        );
      });
    }

    if (result.enhanced.followUps.length > 0) {
      console.log('🔄 Follow-ups:');
      result.enhanced.followUps.forEach((followUp: any, index: number) => {
        console.log(
          `  ${index + 1}. [${followUp.category}] ${followUp.title} - ${followUp.priority}`,
        );
      });
    }
  }

  if (result.data) {
    console.log('📋 Raw Data:', JSON.stringify(result.data, null, 2));
  }
}

function logError(operation: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`\n❌ ${operation} Error:`, message);
}

async function main() {
  // Validate configuration
  if (!ASANA_PAT) {
    console.error('❌ ASANA_PAT environment variable is required');
    process.exit(1);
  }

  if (!getWorkspaceGid()) {
    console.error(
      '❌ ASANA_DEFAULT_WORKSPACE_GID environment variable is required',
    );
    process.exit(1);
  }

  console.log('🎯 Modern Asana Tool Demo');
  console.log('📋 Configuration:');
  console.log(`   Workspace GID: ${getWorkspaceGid()}`);
  console.log(`   Team GID: ${getTeamGid() || 'Not configured'}`);
  console.log(
    `   Features: ${Object.entries(DEMO_CONFIG)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`,
  );

  // Initialize the tool
  const client = new AsanaApiClient(ASANA_PAT);
  const tool = createModernAsanaTool(client, DEMO_CONFIG);

  try {
    // =================================================================
    // 1. BASIC OPERATIONS DEMO
    // =================================================================
    logSection('1. Basic Operations Demo');

    // List users
    console.log('\n🔍 Listing workspace users...');
    try {
      const usersResult = await tool.listUsers(createDemoContext('list users'));
      logResult('List Users', usersResult);
    } catch (error: unknown) {
      logError('List Users', error);
    }

    // List projects
    console.log('\n🔍 Listing projects...');
    try {
      const projectsResult = await tool.listProjects(
        {},
        createDemoContext('list projects'),
      );
      logResult('List Projects', projectsResult);
    } catch (error: unknown) {
      logError('List Projects', error);
    }

    // List tasks
    console.log('\n🔍 Listing recent tasks...');
    try {
      const tasksResult = await tool.listTasks(
        {
          opt_fields: ['name', 'completed', 'assignee', 'due_on', 'projects'],
        },
        createDemoContext('list tasks'),
      );
      logResult('List Tasks', tasksResult);
    } catch (error: unknown) {
      logError('List Tasks', error);
    }

    // =================================================================
    // 2. TASK CREATION WITH ENHANCEMENT
    // =================================================================
    logSection('2. Task Creation with Response Enhancement');

    console.log('\n📝 Creating a demo task...');
    try {
      const createTaskResult = await tool.createTask(
        {
          name: `Demo Task - ${new Date().toISOString()}`,
          notes:
            'This is a demo task created by the Modern Asana Tool to showcase response enhancement features.',
          due_on: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0], // 7 days from now
        },
        createDemoContext('create enhanced task'),
      );

      logResult('Create Task', createTaskResult);

      // Store task GID for later operations
      const demoTaskGid = createTaskResult.data?.gid;

      if (demoTaskGid) {
        // Update the task
        console.log('\n✏️ Updating the demo task...');
        try {
          const updateResult = await tool.updateTask(
            demoTaskGid,
            {
              notes:
                'Updated notes: This task has been modified to demonstrate update capabilities.',
              completed: false,
            },
            createDemoContext('update task'),
          );

          logResult('Update Task', updateResult);
        } catch (error: unknown) {
          logError('Update Task', error);
        }

        // Get task details
        console.log('\n🔍 Getting task details...');
        try {
          const detailsResult = await tool.getTaskDetails(
            demoTaskGid,
            createDemoContext('get task details'),
            [
              'name',
              'notes',
              'completed',
              'assignee',
              'due_on',
              'projects',
              'permalink_url',
            ],
          );

          logResult('Get Task Details', detailsResult);
        } catch (error: unknown) {
          logError('Get Task Details', error);
        }
      }
    } catch (error: unknown) {
      logError('Create Task', error);
    }

    // =================================================================
    // 3. PROJECT CREATION WITH WORKFLOW SUGGESTIONS
    // =================================================================
    logSection('3. Project Creation with Workflow Suggestions');

    console.log('\n📁 Creating a demo project...');
    try {
      const createProjectResult = await tool.createProject(
        {
          name: `Demo Project - ${new Date().toISOString()}`,
          notes:
            'This is a demo project created to showcase workflow suggestions and project management features.',
          public: false,
          color: 'blue',
        },
        createDemoContext('create project with workflows'),
      );

      logResult('Create Project', createProjectResult);

      const demoProjectGid = createProjectResult.data?.gid;

      if (demoProjectGid) {
        // Get project details
        console.log('\n🔍 Getting project details...');
        try {
          const projectDetailsResult = await tool.getProjectDetails(
            demoProjectGid,
            createDemoContext('get project details'),
          );

          logResult('Get Project Details', projectDetailsResult);
        } catch (error: unknown) {
          logError('Get Project Details', error);
        }
      }
    } catch (error: unknown) {
      logError('Create Project', error);
    }

    // =================================================================
    // 4. WORKFLOW ORCHESTRATION DEMO
    // =================================================================
    logSection('4. Workflow Orchestration Demo');

    // Suggest workflows
    console.log('\n🤖 Getting workflow suggestions...');
    try {
      const suggestionsResult = await tool.suggestWorkflows(
        'I want to set up a new project with initial tasks and team structure',
        createDemoContext('workflow suggestions'),
      );

      logResult('Workflow Suggestions', suggestionsResult);
    } catch (error: unknown) {
      logError('Workflow Suggestions', error);
    }

    // Execute a workflow
    console.log('\n⚙️ Executing project setup workflow...');
    try {
      const workflowResult = await tool.executeWorkflow(
        'project_setup',
        {
          project_name: `Workflow Demo Project - ${new Date().toISOString()}`,
          workspace_id: getWorkspaceGid(),
          project_notes:
            'This project was created through workflow orchestration demo.',
          initial_tasks: [
            'Set up project structure',
            'Define project goals',
            'Assign team members',
            'Create initial milestones',
          ],
        },
        createDemoContext('execute project setup workflow'),
      );

      logResult('Execute Workflow', workflowResult);
    } catch (error: unknown) {
      logError('Execute Workflow', error);
    }

    // =================================================================
    // 5. SEMANTIC ENTITY RESOLUTION DEMO
    // =================================================================
    logSection('5. Semantic Entity Resolution Demo');

    console.log('\n🧠 Testing semantic entity resolution...');

    // Try to resolve user entities
    const userQueries = ['@me', '@current.user', 'john', 'admin'];
    for (const query of userQueries) {
      try {
        console.log(`\n🔍 Resolving user: "${query}"`);
        const resolveResult = await tool.resolveEntity(
          query,
          'user',
          createDemoContext(`resolve user: ${query}`),
        );

        logResult(`Resolve User "${query}"`, resolveResult);
      } catch (error: unknown) {
        logError(`Resolve User "${query}"`, error);
      }
    }

    // Try to resolve project entities
    const projectQueries = ['demo', 'test', 'main'];
    for (const query of projectQueries) {
      try {
        console.log(`\n🔍 Resolving project: "${query}"`);
        const resolveResult = await tool.resolveEntity(
          query,
          'project',
          createDemoContext(`resolve project: ${query}`),
        );

        logResult(`Resolve Project "${query}"`, resolveResult);
      } catch (error: unknown) {
        logError(`Resolve Project "${query}"`, error);
      }
    }

    // =================================================================
    // 6. ERROR RECOVERY DEMO
    // =================================================================
    logSection('6. Error Recovery Demo');

    console.log('\n🛠️ Testing error recovery with invalid operations...');

    // Try to get a non-existent task
    try {
      console.log('\n❌ Attempting to get non-existent task...');
      const errorResult = await tool.getTaskDetails(
        'invalid-task-gid-12345',
        createDemoContext('test error recovery'),
      );

      logResult('Error Recovery Test', errorResult);
    } catch (error: unknown) {
      logError('Error Recovery Test', error);
    }

    // Try to create a task with invalid parameters
    try {
      console.log('\n❌ Attempting to create task with invalid workspace...');
      const errorResult = await tool.createTask(
        {
          name: 'Error Test Task',
          workspace: 'invalid-workspace-gid',
        },
        createDemoContext('test error recovery - invalid workspace'),
      );

      logResult('Error Recovery Test - Invalid Workspace', errorResult);
    } catch (error: unknown) {
      logError('Error Recovery Test - Invalid Workspace', error);
    }

    // =================================================================
    // 7. FEATURE CONFIGURATION DEMO
    // =================================================================
    logSection('7. Feature Configuration Demo');

    console.log('\n⚙️ Testing feature configuration...');

    // Show current configuration
    console.log('Current configuration:', tool.getConfiguration());

    // Disable some features and test
    console.log('\n🔧 Disabling workflows and semantic resolution...');
    tool.updateConfiguration({
      enableWorkflows: false,
      enableSemanticResolution: false,
    });

    console.log('Updated configuration:', tool.getConfiguration());

    // Try workflow operation with disabled workflows
    try {
      console.log(
        '\n❌ Attempting workflow operation with disabled workflows...',
      );
      const disabledResult = await tool.executeWorkflow(
        'project_setup',
        { project_name: 'Test' },
        createDemoContext('test disabled workflows'),
      );

      logResult('Disabled Workflows Test', disabledResult);
    } catch (error: unknown) {
      logError('Disabled Workflows Test', error);
    }

    // Re-enable features
    console.log('\n🔧 Re-enabling all features...');
    tool.updateConfiguration(DEMO_CONFIG);
    console.log('Final configuration:', tool.getConfiguration());

    // =================================================================
    // 8. PERFORMANCE AND METRICS DEMO
    // =================================================================
    logSection('8. Performance and Metrics Demo');

    console.log('\n📊 Running performance tests...');

    const performanceTests = [
      {
        name: 'Quick Task List',
        operation: () =>
          tool.listTasks(
            { opt_fields: ['name'] },
            createDemoContext('perf test'),
          ),
      },
      {
        name: 'User Resolution',
        operation: () =>
          tool.resolveEntity('admin', 'user', createDemoContext('perf test')),
      },
      {
        name: 'Project List',
        operation: () => tool.listProjects({}, createDemoContext('perf test')),
      },
    ];

    for (const test of performanceTests) {
      try {
        console.log(`\n⏱️ Running ${test.name}...`);
        const startTime = Date.now();
        const result = await test.operation();
        const duration = Date.now() - startTime;

        console.log(`   Duration: ${duration}ms`);
        console.log(`   Success: ${result.metadata.success}`);
        console.log(`   Operation: ${result.metadata.operation}`);
        console.log(
          `   Features Used: ${
            Object.entries(result.metadata)
              .filter(([key, value]) => key.includes('Used') && value)
              .map(([key]) => key)
              .join(', ') || 'None'
          }`,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`   Error: ${message}`);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Demo failed:', message);
    process.exit(1);
  }

  logSection('Demo Complete! 🎉');
  console.log('\n✅ Modern Asana Tool demo completed successfully!');
  console.log('\n📝 Summary of demonstrated features:');
  console.log('   ✓ Basic CRUD operations with response enhancement');
  console.log('   ✓ Workflow orchestration and suggestions');
  console.log('   ✓ Semantic entity resolution');
  console.log('   ✓ Intelligent error recovery');
  console.log('   ✓ Feature configuration and toggling');
  console.log('   ✓ Performance metrics and monitoring');
  console.log('\n🚀 The Modern Asana Tool is ready for production use!');
}

// Run the demo
if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Demo script failed:', message);
    process.exit(1);
  });
}
