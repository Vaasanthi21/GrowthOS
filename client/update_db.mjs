import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB_NAME || 'creative_studio_os');
    const result = await db.collection('app_settings').updateOne(
      { key: 'credits' },
      { $set: { video_generation_cost: 69 } }
    );
    console.log('Update result:', result);
    
    const doc = await db.collection('app_settings').findOne({ key: 'credits' });
    console.log('Current settings:', doc);
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
