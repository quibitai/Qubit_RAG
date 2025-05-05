-- Migration to drop deprecated tables
-- This migration removes the old Message and Vote tables that have been replaced by Message_v2 and Vote_v2

-- Drop deprecated tables if they exist
DO $$
BEGIN
    -- Drop the Vote table if it exists
    BEGIN
        DROP TABLE IF EXISTS "Vote";
        RAISE NOTICE 'Dropped Vote table';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to drop Vote table: %', SQLERRM;
    END;

    -- Drop the Message table if it exists
    BEGIN
        DROP TABLE IF EXISTS "Message";
        RAISE NOTICE 'Dropped Message table';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to drop Message table: %', SQLERRM;
    END;
END
$$; 