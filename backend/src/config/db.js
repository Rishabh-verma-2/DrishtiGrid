const mongoose = require("mongoose");

let retryTimer = null;

const connectDB = async () => {
  let uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MongoDB connection URI missing in environment variables.");
    return;
  }
  // Replace placeholder if present
  uri = uri.replace("<your-db-name>", "drishtigrid");

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host} / ${conn.connection.name}`);
    if (retryTimer) {
      clearInterval(retryTimer);
      retryTimer = null;
    }
  } catch (error) {
    console.warn(`⚠️ MongoDB Atlas Connection Pending: ${error.message}`);
    console.log("ℹ️ Hybrid fallback active: Using local JSON persistence until MongoDB Atlas IP is whitelisted.");
    
    // Automatically retry connecting every 15 seconds so whitelisting in Atlas takes effect immediately
    if (!retryTimer) {
      retryTimer = setInterval(async () => {
        if (mongoose.connection.readyState === 1) {
          clearInterval(retryTimer);
          retryTimer = null;
          return;
        }
        try {
          const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 4000 });
          console.log(`\n🎉 MongoDB Connected: ${conn.connection.host} / ${conn.connection.name}`);
          clearInterval(retryTimer);
          retryTimer = null;
        } catch (err) {
          // silently retry
        }
      }, 15000);
    }
  }
};

module.exports = { connectDB };
