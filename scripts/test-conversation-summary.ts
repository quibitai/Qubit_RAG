import { config } from 'dotenv';
import { contextManager } from '@/lib/context/ContextManager';
import { db } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { chat, message, conversationSummaries } from '@/lib/db/schema';

config({
  path: '.env.local',
});

async function testConversationSummary() {
  console.log('🧪 Testing Conversation Summary Functionality...\n');

  try {
    // Step 1: Find an existing chat with some messages
    console.log('Step 1: Finding a chat with messages...');

    const allChats = await db
      .select()
      .from(chat)
      .orderBy(desc(chat.updatedAt))
      .limit(10);

    if (allChats.length === 0) {
      console.log('❌ No chats found. Create some conversations first.');
      return;
    }

    // Find a chat with messages
    let testChat = null;
    for (const chatRecord of allChats) {
      const messageCount = await db
        .select()
        .from(message)
        .where(eq(message.chatId, chatRecord.id));

      if (messageCount.length >= 5) {
        testChat = {
          ...chatRecord,
          messageCount: messageCount.length,
        };
        break;
      }
    }

    if (!testChat) {
      console.log(
        '❌ No chats with sufficient messages found. Create some conversations first.',
      );
      return;
    }

    console.log(
      `✅ Found test chat: "${testChat.title}" (${testChat.messageCount} messages)`,
    );
    console.log(`   Chat ID: ${testChat.id}`);
    console.log(`   User ID: ${testChat.userId}`);
    console.log(`   Client ID: ${testChat.clientId}\n`);

    // Step 2: Check existing summaries
    console.log('Step 2: Checking existing summaries...');

    const existingSummaries = await db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.chatId, testChat.id))
      .orderBy(desc(conversationSummaries.createdAt));

    console.log(
      `📊 Found ${existingSummaries.length} existing summaries for this chat`,
    );
    if (existingSummaries.length > 0) {
      console.log(
        `   Latest summary preview: ${existingSummaries[0].summaryText.substring(0, 100)}...\n`,
      );
    }

    // Step 3: Create a new summary
    console.log('Step 3: Creating new conversation summary...');

    const startTime = Date.now();
    await contextManager.updateSummary(
      testChat.id,
      testChat.userId,
      testChat.clientId,
    );
    const duration = Date.now() - startTime;

    console.log(`✅ Summary creation completed in ${duration}ms\n`);

    // Step 4: Verify the summary was created
    console.log('Step 4: Verifying summary creation...');

    const newSummaries = await db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.chatId, testChat.id))
      .orderBy(desc(conversationSummaries.createdAt));

    if (newSummaries.length > existingSummaries.length) {
      const latestSummary = newSummaries[0];
      console.log('✅ New summary created successfully!');
      console.log(
        `📝 Summary length: ${latestSummary.summaryText.length} characters`,
      );
      console.log(`📅 Created at: ${latestSummary.createdAt}`);
      console.log(
        `📊 Messages covered: ${latestSummary.messagesCoveredStart} to ${latestSummary.messagesCoveredEnd}`,
      );
      console.log('\n📄 Summary content:');
      console.log(`${'='.repeat(61)}`);
      console.log(latestSummary.summaryText);
      console.log(`${'='.repeat(61)}\n`);
    } else {
      console.log(
        '⚠️  No new summary was created. Check the logs for errors.\n',
      );
    }

    // Step 5: Test context window with summary
    console.log('Step 5: Testing context window with summary...');

    const contextWindow = await contextManager.buildContextWindow(
      testChat.id,
      testChat.userId,
      testChat.clientId,
    );

    console.log(`📋 Context window built:`);
    console.log(`   - Recent messages: ${contextWindow.recentHistory.length}`);
    console.log(`   - Key entities: ${contextWindow.keyEntities.length}`);
    console.log(
      `   - Summary available: ${contextWindow.summary ? 'Yes' : 'No'}`,
    );
    console.log(`   - Files referenced: ${contextWindow.files.length}`);
    console.log(`   - Total token count: ${contextWindow.tokenCount}\n`);

    if (contextWindow.summary) {
      console.log('📄 Summary in context:');
      console.log(`${contextWindow.summary.substring(0, 200)}...\n`);
    }

    console.log('🎉 Conversation summary test completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the test
testConversationSummary();
