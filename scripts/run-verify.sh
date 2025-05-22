#!/bin/bash
set -a
source .env.local
set +a

npx tsx scripts/verify-asana-token.ts 