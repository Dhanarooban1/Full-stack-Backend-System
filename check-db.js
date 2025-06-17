// Check database script
// Usage: node check-db.js [keypoint-id]

import { checkDatabase, lookupKeypoint } from './src/utils/checkDatabase.js';

async function main() {
  console.log('🔍 Checking database contents...');
  
  const result = await checkDatabase();
  
  if (result.success) {
    console.log('✅ Database check completed successfully');
    console.log(`📊 Found ${result.keypointCount} keypoints and ${result.logCount} logs\n`);
    
    // Check for a specific keypoint ID if provided
    const id = process.argv[2];
    if (id) {
      console.log(`🔎 Looking up keypoint with ID: ${id}`);
      const lookup = await lookupKeypoint(id);
      
      if (lookup.exists) {
        console.log('✅ Keypoint found!');
        console.log('ID:', lookup.keypoint.id);
        console.log('Image ID:', lookup.keypoint.imageId);
        console.log('Created:', lookup.keypoint.createdAt);
        console.log('Updated:', lookup.keypoint.updatedAt);
        
        // Show keypoints count
        const keypointCount = Array.isArray(lookup.keypoint.keypoints) ? 
          lookup.keypoint.keypoints.length : 
          'unknown';
        console.log(`Keypoints: ${keypointCount}`);
      } else {
        console.log('❌ Keypoint not found');
        if (lookup.error) {
          console.error('Error:', lookup.error);
        }
      }
    }
  } else {
    console.error('❌ Error checking database:', result.error);
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
}).finally(() => {
  setTimeout(() => process.exit(0), 500);
});
