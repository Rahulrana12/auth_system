require('dotenv').config();
const mongoose = require('mongoose');

async function testDBConnection() {
    try {
        console.log('Testing MongoDB connection...');
        console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Defined' : 'Undefined');
        
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000
        });
        
        console.log('✅ Successfully connected to MongoDB!');
        
        // Check for available collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Available collections:', collections.map(c => c.name).join(', '));
        
        // Close the connection
        await mongoose.connection.close();
        console.log('Connection closed successfully');
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        if (error.name === 'MongoServerSelectionError') {
            console.error('Could not connect to any MongoDB server.');
            console.error('Please check:');
            console.error('  1. Your connection string in .env file');
            console.error('  2. Network connectivity to MongoDB server');
            console.error('  3. MongoDB server is running');
        }
        return false;
    }
}

// Run the test
testDBConnection().then(success => {
    if (success) {
        console.log('Database test completed successfully');
        process.exit(0);
    } else {
        console.error('Database test failed');
        process.exit(1);
    }
}); 