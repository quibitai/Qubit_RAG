// Test script to diagnose data processing in components/chat.tsx
console.log('Starting diagnostic test for chat.tsx data processing');

// Simulate a useChat().data array that grows over time
const mockDataArray = [];

// Flags to track state
let processedDataIndex = 0;
let activeArtifactState = {
  documentId: null,
  kind: null,
  title: null,
  content: '',
  isStreaming: false,
  isVisible: false,
  error: null,
};

// Simulate receiving multiple data events
function simulateDataReceived(newEvents) {
  console.log(`\n----- Iteration: Adding ${newEvents.length} new events -----`);

  // Add the new events to the data array
  mockDataArray.push(...newEvents);
  console.log(
    `Total data array length: ${mockDataArray.length}, Previously processed: ${processedDataIndex}`,
  );

  // Process only the new items since last time
  if (mockDataArray.length <= processedDataIndex) {
    console.log('No new items to process, skipping');
    return;
  }

  const newDataItems = mockDataArray.slice(processedDataIndex);
  console.log(`Processing ${newDataItems.length} new items`);

  // Initialize variables for state tracking
  let newContent = activeArtifactState.content;
  let stateChanged = false;

  // Process each new data item
  newDataItems.forEach((item, relativeIndex) => {
    const absoluteIndex = processedDataIndex + relativeIndex;
    console.log(`Processing item ${absoluteIndex}: type=${item.type}`);

    if (item.type === 'text-delta') {
      const oldLength = newContent.length;
      newContent += item.content;
      console.log(
        `Content updated. Old length: ${oldLength}, New length: ${newContent.length}, Delta length: ${item.content.length}`,
      );
      stateChanged = true;
    } else if (item.type === 'finish') {
      console.log('Finish event received, setting isStreaming to false');
      stateChanged = true;
    }
  });

  // Update our processed data index for next time
  processedDataIndex = mockDataArray.length;
  console.log(`Updated processedDataIndex to ${processedDataIndex}`);

  // Update state if changed
  if (stateChanged) {
    console.log('State changed, updating activeArtifactState');
    activeArtifactState = {
      ...activeArtifactState,
      content: newContent,
    };
    console.log(`New content length: ${activeArtifactState.content.length}`);
  }
}

// Simulate a streaming sequence with multiple separate calls
const testSequence = [
  // First batch - 4 events
  [
    { type: 'artifact-start', kind: 'text', title: 'Test Document' },
    { type: 'id', content: 'test-doc-123' },
    { type: 'title', content: 'Test Document' },
    { type: 'kind', content: 'text' },
  ],
  // Second batch - 2 text deltas
  [
    { type: 'text-delta', content: 'Hello ' },
    { type: 'text-delta', content: 'world' },
  ],
  // Third batch - 2 more text deltas
  [
    { type: 'text-delta', content: '! This ' },
    { type: 'text-delta', content: 'is a test.' },
  ],
  // Fourth batch - finish event
  [{ type: 'finish' }],
];

// Run through the test sequence
console.log('Running test sequence...');
testSequence.forEach((batch, index) => {
  console.log(`\n==== Processing batch ${index + 1} ====`);
  simulateDataReceived(batch);
  console.log(
    `Artifact state after batch ${index + 1}: content length = ${activeArtifactState.content.length}`,
  );
});

console.log('\nFinal artifact state:', {
  contentLength: activeArtifactState.content.length,
  content: activeArtifactState.content,
});
console.log('Test completed.');
