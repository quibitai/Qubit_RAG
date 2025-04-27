-- Migration to drop deprecated tables
-- This migration removes the old Message and Vote tables that have been replaced by Message_v2 and Vote_v2

-- First, drop foreign keys to allow clean table removal
DO $$ 
BEGIN
    -- Drop the Vote table first (has foreign keys to both Chat and Message)
    BEGIN
        DROP TABLE IF EXISTS "Vote";
        RAISE NOTICE 'Dropped Vote table';
    EXCEPTION 
        WHEN undefined_table THEN 
            RAISE NOTICE 'Vote table does not exist, skipping';
        WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping Vote table: %', SQLERRM;
    END;

    -- Then drop the Message table
    BEGIN
        DROP TABLE IF EXISTS "Message";
        RAISE NOTICE 'Dropped Message table';
    EXCEPTION 
        WHEN undefined_table THEN 
            RAISE NOTICE 'Message table does not exist, skipping';
        WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping Message table: %', SQLERRM;
    END;
END $$; 