#!/usr/bin/env tsx

/**
 * Quick Asana Commands Test Script
 *
 * This script allows you to quickly test individual Asana operations
 * without running the full demo.
 *
 * Usage:
 *   pnpm tsx scripts/test-asana-commands.ts [command] [args...]
 *
 * Examples:
 *   pnpm tsx scripts/test-asana-commands.ts list-users
 *   pnpm tsx scripts/test-asana-commands.ts list-projects
 *   pnpm tsx scripts/test-asana-commands.ts create-task "My Test Task"
 *   pnpm tsx scripts/test-asana-commands.ts suggest-workflows "set up project"
 */

import {
  createModernAsanaTool,
  type ToolExecutionContext,
} from '../lib/ai/tools/asana/modern-asana-tool';
import { AsanaApiClient } from '../lib/ai/tools/asana/api-client/client';
import { ASANA_PAT, getWorkspaceGid } from '../lib/ai/tools/asana/config';

// Create context for testing
const createTestContext = (operation: string): ToolExecutionContext => ({
  sessionId: `test-session-${Date.now()}`,
  requestId: `test-request-${Math.random().toString(36).substr(2, 9)}`,
  userIntent: `Test: ${operation}`,
  conversationContext: {
    test_mode: true,
    workspace_id: getWorkspaceGid(),
  },
});

// Pretty print results
function printResult(result: any) {
  console.log('\n📊 Result:');
  console.log('Success:', result.metadata.success);
  console.log('Duration:', `${result.metadata.duration}ms`);
  console.log('Operation:', result.metadata.operation);

  if (result.enhanced?.message) {
    console.log('\n💬 Message:', result.enhanced.message);
  }

  if (result.data) {
    console.log('\n📋 Data:');
    if (Array.isArray(result.data)) {
      console.log(`Found ${result.data.length} items:`);
      result.data.slice(0, 5).forEach((item: any, index: number) => {
        console.log(
          `  ${index + 1}. ${item.name || item.gid} ${item.gid ? `(${item.gid})` : ''}`,
        );
      });
      if (result.data.length > 5) {
        console.log(`  ... and ${result.data.length - 5} more`);
      }
    } else {
      console.log(`  Name: ${result.data.name || 'N/A'}`);
      console.log(`  GID: ${result.data.gid || 'N/A'}`);
      if (result.data.permalink_url) {
        console.log(`  URL: ${result.data.permalink_url}`);
      }
    }
  }

  if (result.enhanced?.suggestions?.length > 0) {
    console.log('\n💡 Suggestions:');
    result.enhanced.suggestions.forEach((suggestion: any, index: number) => {
      console.log(`  ${index + 1}. ${suggestion.title} (${suggestion.type})`);
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log('🎯 Available Commands:');
    console.log('  list-users              - List workspace users');
    console.log('  list-projects           - List projects');
    console.log('  list-tasks              - List recent tasks');
    console.log('  create-task <name>      - Create a new task');
    console.log('  create-project <name>   - Create a new project');
    console.log('  suggest-workflows <intent> - Get workflow suggestions');
    console.log('  resolve-user <query>    - Resolve user entity');
    console.log('  resolve-project <query> - Resolve project entity');
    console.log('  test-config             - Show current configuration');
    console.log('  run-tests               - Run unit tests');
    console.log(
      '\nExample: pnpm tsx scripts/test-asana-commands.ts list-users',
    );
    return;
  }

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

  // Initialize tool
  const client = new AsanaApiClient(ASANA_PAT);
  const tool = createModernAsanaTool(client);

  console.log(`🚀 Running command: ${command}`);
  console.log(`📋 Workspace: ${getWorkspaceGid()}`);

  try {
    switch (command) {
      case 'list-users': {
        console.log('\n🔍 Listing workspace users...');
        const usersResult = await tool.listUsers(
          createTestContext('list users'),
        );
        printResult(usersResult);
        break;
      }

      case 'list-projects': {
        console.log('\n🔍 Listing projects...');
        const projectsResult = await tool.listProjects(
          {},
          createTestContext('list projects'),
        );
        printResult(projectsResult);
        break;
      }

      case 'list-tasks': {
        console.log('\n🔍 Listing recent tasks...');
        const tasksResult = await tool.listTasks(
          {
            opt_fields: ['name', 'completed', 'assignee', 'due_on'],
          },
          createTestContext('list tasks'),
        );
        printResult(tasksResult);
        break;
      }

      case 'create-task': {
        const taskName = args[1] || `Test Task - ${new Date().toISOString()}`;
        console.log(`\n📝 Creating task: "${taskName}"`);
        const createTaskResult = await tool.createTask(
          {
            name: taskName,
            notes: 'Created via test script',
          },
          createTestContext('create task'),
        );
        printResult(createTaskResult);
        break;
      }

      case 'create-project': {
        const projectName =
          args[1] || `Test Project - ${new Date().toISOString()}`;
        console.log(`\n📁 Creating project: "${projectName}"`);
        const createProjectResult = await tool.createProject(
          {
            name: projectName,
            notes: 'Created via test script',
          },
          createTestContext('create project'),
        );
        printResult(createProjectResult);
        break;
      }

      case 'suggest-workflows': {
        const intent = args.slice(1).join(' ') || 'set up a new project';
        console.log(`\n🤖 Getting workflow suggestions for: "${intent}"`);
        const suggestionsResult = await tool.suggestWorkflows(
          intent,
          createTestContext('workflow suggestions'),
        );
        printResult(suggestionsResult);
        break;
      }

      case 'resolve-user': {
        const userQuery = args[1] || 'admin';
        console.log(`\n🧠 Resolving user: "${userQuery}"`);
        const userResolveResult = await tool.resolveEntity(
          userQuery,
          'user',
          createTestContext('resolve user'),
        );
        printResult(userResolveResult);
        break;
      }

      case 'resolve-project': {
        const projectQuery = args[1] || 'demo';
        console.log(`\n🧠 Resolving project: "${projectQuery}"`);
        const projectResolveResult = await tool.resolveEntity(
          projectQuery,
          'project',
          createTestContext('resolve project'),
        );
        printResult(projectResolveResult);
        break;
      }

      case 'test-config': {
        console.log('\n⚙️ Current Configuration:');
        console.log(JSON.stringify(tool.getConfiguration(), null, 2));
        console.log('\n🔧 Environment:');
        console.log(`  ASANA_PAT: ${ASANA_PAT ? '✅ Set' : '❌ Not set'}`);
        console.log(`  Workspace GID: ${getWorkspaceGid() || '❌ Not set'}`);
        break;
      }

      case 'run-tests': {
        console.log('\n🧪 Running unit tests...');
        const { execSync } = await import('node:child_process');
        try {
          execSync('pnpm test:unit:run lib/ai/tools/asana', {
            stdio: 'inherit',
          });
          console.log('✅ Tests completed successfully!');
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error('❌ Tests failed:', message);
          process.exit(1);
        }
        break;
      }

      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Run without arguments to see available commands.');
        process.exit(1);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Command failed: ${message}`);
    process.exit(1);
  }

  console.log('\n✅ Command completed successfully!');
}

// Run the command
if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ Script failed:', message);
    process.exit(1);
  });
}
