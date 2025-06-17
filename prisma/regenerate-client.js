#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

async function main() {
  try {
    console.log('🔄 Regenerating Prisma client for your new schema...');
    
    // 1. Run generate command
    console.log('📦 Running prisma generate...');
    try {
      const { stdout: generateOutput } = await execAsync('npx prisma generate');
      console.log('✅ Generation successful!');
      console.log(generateOutput);
    } catch (error) {
      console.error('❌ Error generating Prisma client:');
      console.error(error.stderr || error.message);
      process.exit(1);
    }
    
    // 2. Check node_modules for the client
    console.log('🔍 Verifying Prisma client installation...');
    const clientPath = path.join(process.cwd(), 'node_modules', '.prisma', 'client');
    try {
      await fs.access(clientPath);
      console.log('✅ Prisma client exists at', clientPath);
    } catch (error) {
      console.error('⚠️ Could not find Prisma client at', clientPath);
      console.log('🔄 Attempting to reinstall @prisma/client...');
      try {
        const { stdout: installOutput } = await execAsync('npm install @prisma/client');
        console.log('✅ Installation successful!');
        console.log(installOutput);
      } catch (error) {
        console.error('❌ Error installing @prisma/client:');
        console.error(error.stderr || error.message);
        process.exit(1);
      }
    }
    
    console.log('\n✅ Prisma client has been regenerated successfully!');
    console.log('🚀 You can now restart your server for the changes to take effect.');
    
  } catch (error) {
    console.error('❌ An unexpected error occurred:');
    console.error(error);
    process.exit(1);
  }
}

main();
