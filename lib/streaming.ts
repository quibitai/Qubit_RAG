import { DataStreamWriter } from 'ai';

/**
 * Custom wrapper for DataStreamWriter that adds the appendData method
 * This is a utility function to enhance the standard DataStreamWriter
 * with the ability to both write data to the stream AND add it to the client-side data array.
 */
export function createEnhancedDataStream(dataStream: any) {
  // Return an enhanced object that wraps the original dataStream
  return {
    // Pass through all original methods
    ...dataStream,

    // Add our custom appendData method
    appendData: async (data: any): Promise<void> => {
      // First write the data to the stream using the standard method
      await dataStream.writeData(data);

      // Then ensure it's added to the data array that the client's useChat hook exposes
      // This is done by writing a special format that the Vercel AI SDK recognizes
      // Format for useChat().data array: 2:JSON_STRINGIFIED_ARRAY\n
      try {
        await dataStream.write(`2:${JSON.stringify([data])}\n` as const);
        console.log(
          `[EnhancedDataStream] Successfully appended data of type: ${data.type} using 2: prefix for useChat().data`,
        );
      } catch (error) {
        console.error('[EnhancedDataStream] Error appending data:', error);
        // Fall back to just using writeData if appendData fails
      }
    },
  };
}
