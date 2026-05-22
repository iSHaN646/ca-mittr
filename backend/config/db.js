import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);

    // Drop legacy phone index to prevent duplicate key error E11000
    try {
      const collections = await conn.connection.db.listCollections({ name: 'users' }).toArray();
      if (collections.length > 0) {
        await conn.connection.db.collection('users').dropIndex('phone_1');
        console.log('[Database] Successfully dropped legacy unique "phone_1" index.');
      }
    } catch (err) {
      // Silence error if the index doesn't exist
      if (err.codeName !== 'IndexNotFound' && err.code !== 27) {
        console.warn('[Warning] Could not drop legacy phone index:', err.message);
      }
    }
  } catch (error) {
    console.error(`[Error] Database connection failed: ${error.message}`);
    console.log('Ensure MONGODB_URI in your backend/.env file is a valid MongoDB Atlas connection string.');
    process.exit(1);
  }
};

export default connectDB;
