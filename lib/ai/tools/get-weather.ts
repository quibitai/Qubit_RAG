import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';

// Define the input schema using Zod
const weatherSchema = z.object({
  latitude: z.number().describe('The latitude for the location.'),
  longitude: z.number().describe('The longitude for the location.'),
});

/**
 * Langchain Tool for fetching current weather data from Open-Meteo API.
 */
export const getWeatherTool = new DynamicStructuredTool({
  name: 'getWeather',
  description:
    'Get the current weather at a location using latitude and longitude.',
  schema: weatherSchema,
  func: async ({ latitude, longitude }) => {
    console.log(
      `[getWeatherTool] Fetching weather for lat: ${latitude}, lon: ${longitude}`,
    );
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        // Attempt to get error details from the API response
        let errorDetails = `HTTP error! status: ${response.status}`;
        try {
          const errorJson = await response.json();
          errorDetails += ` - ${JSON.stringify(errorJson)}`;
        } catch (e) {
          // Ignore if error body is not JSON
        }
        throw new Error(errorDetails);
      }

      const weatherData = await response.json();
      console.log(`[getWeatherTool] Successfully fetched weather data.`);
      // Return the JSON object. The agent will need to process this.
      // If the agent expects a string, we might need to stringify or summarize later.
      return weatherData;
    } catch (error) {
      console.error('[getWeatherTool] Error fetching weather data:', error);
      return `Error: Failed to fetch weather data - ${error instanceof Error ? error.message : String(error)}`;
    }
  },
});
