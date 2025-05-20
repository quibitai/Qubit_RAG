-- Drop existing tables if they exist
DROP TABLE IF EXISTS "Account" CASCADE;
DROP TABLE IF EXISTS "Session" CASCADE;
DROP TABLE IF EXISTS "VerificationToken" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

-- Create User table with NextAuth.js required fields
CREATE TABLE IF NOT EXISTS "User" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" VARCHAR(255),
  "email" VARCHAR(255) NOT NULL UNIQUE,
  "emailVerified" TIMESTAMP,
  "image" VARCHAR(255),
  "password" VARCHAR(255)
);

-- Create Account table
CREATE TABLE IF NOT EXISTS "Account" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "type" VARCHAR(255) NOT NULL,
  "provider" VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" VARCHAR(255),
  "scope" VARCHAR(255),
  "id_token" TEXT,
  "session_state" VARCHAR(255),
  CONSTRAINT "Account_provider_providerAccountId_key" UNIQUE ("provider", "providerAccountId")
);

-- Create Session table
CREATE TABLE IF NOT EXISTS "Session" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL UNIQUE,
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "expires" TIMESTAMP NOT NULL
);

-- Create VerificationToken table
CREATE TABLE IF NOT EXISTS "VerificationToken" (
  "identifier" VARCHAR(255) NOT NULL,
  "token" VARCHAR(255) NOT NULL,
  "expires" TIMESTAMP NOT NULL,
  CONSTRAINT "VerificationToken_identifier_token_key" PRIMARY KEY ("identifier", "token")
); 