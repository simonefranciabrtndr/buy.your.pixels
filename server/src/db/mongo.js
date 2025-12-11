import mongoose from "mongoose";

let connectionPromise = null;

/**
 * Connect to MongoDB Atlas (or any Mongo instance) using mongoose.
 * Reuses an existing open connection when available.
 */
export async function connectMongo() {
  if (mongoose.connection?.readyState === 1) {
    return mongoose.connection;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  const dbName = process.env.MONGODB_DB_NAME || "million_euro_wall";

  connectionPromise = mongoose
    .connect(uri, {
      dbName,
    })
    .then((conn) => {
      console.log(`[mongo] Connected to ${dbName}`);
      return conn.connection;
    })
    .catch((err) => {
      connectionPromise = null;
      throw err;
    });

  return connectionPromise;
}
