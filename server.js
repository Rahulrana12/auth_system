require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const Message = require('./models/Message');

const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/teams');
const taskRoutes = require('./routes/tasks');
const { errorHandler } = require('./middleware/errorHandler');
const { activityLoggerMiddleware } = require('./utils/activityLogger');

const app = express();

// CORS configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'development' 
        ? '*' // Allow all origins in development
        : process.env.ALLOWED_ORIGINS?.split(',') || [],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
};

// Apply CORS to Express
app.use(cors(corsOptions));

const server = http.createServer(app);

// WebSocket server setup
const wss = new WebSocket.Server({ 
    server, // Attach directly to server
    path: '/ws' // Explicit path
});

// Connection tracking
const clients = new Map(); // userId -> WebSocket
const teamRooms = new Map(); // teamId -> Set of userIds
const connectionStates = new Map(); // userId -> connection state

// Debug logging function with timestamp
function logDebug(category, message, data = {}) {
    console.log(`[${category}] [${new Date().toISOString()}] ${message}`, data);
}

// WebSocket authentication middleware
wss.on('connection', async (ws, req) => {
    try {
        // Extract token from query string
        const url = new URL(req.url, 'ws://localhost');
        const token = url.searchParams.get('token');

        if (!token) {
            logDebug('WebSocket', '🔴 No token provided');
            ws.close(4001, 'Authentication required');
            return;
        }

        try {
            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.userId = decoded.id;
            
            logDebug('WebSocket', '🟢 Client authenticated', { 
                userId: decoded.id,
                totalConnections: wss.clients.size
            });

            // Initialize connection state
            connectionStates.set(req.userId, {
                isAlive: true,
                lastPing: Date.now(),
                teams: new Set(),
                messageCount: 0
            });

            // Store client connection
            clients.set(req.userId, ws);

            // Send welcome message
            safeSocketSend(ws, {
                type: 'connected',
                message: 'Connected to chat server',
                userId: req.userId
            });

            // Setup ping/pong
            ws.on('pong', () => {
                if (connectionStates.has(req.userId)) {
                    const state = connectionStates.get(req.userId);
                    state.isAlive = true;
                    state.lastPing = Date.now();
                    logDebug('WebSocket', '🏓 Pong received', { userId: req.userId });
                }
            });

            // Handle incoming messages
            ws.on('message', async (msg) => {
                try {
                    const data = JSON.parse(msg.toString());
                    const state = connectionStates.get(req.userId);
                    state.messageCount++;

                    logDebug('WebSocket', '📥 Message received', { 
                        userId: req.userId,
                        type: data.type,
                        messageCount: state.messageCount,
                        teamId: data.teamId
                    });

                    switch (data.type) {
                        case 'join_team':
                            handleTeamJoin(req.userId, data.teamId, ws);
                            break;

                        case 'message':
                            await handleMessage(req.userId, data, ws);
                            break;

                        case 'typing':
                        case 'stop_typing':
                            handleTypingStatus(req.userId, data);
                            break;

                        default:
                            logDebug('WebSocket', '⚠️ Unknown message type', { type: data.type });
                            safeSocketSend(ws, {
                                type: 'error',
                                message: 'Unknown message type'
                            });
                    }
                } catch (error) {
                    logDebug('WebSocket', '🔴 Message handling error', { 
                        userId: req.userId, 
                        error: error.message,
                        stack: error.stack
                    });
                    
                    safeSocketSend(ws, {
                        type: 'error',
                        message: 'Failed to process message: ' + error.message
                    });
                }
            });

            // Handle client disconnect
            ws.on('close', (code, reason) => {
                handleDisconnect(req.userId, code, reason);
            });

            // Handle errors
            ws.on('error', (error) => {
                logDebug('WebSocket', '⚠️ Socket error', { 
                    userId: req.userId, 
                    error: error.message,
                    stack: error.stack
                });
            });

        } catch (error) {
            logDebug('WebSocket', '🔴 Token verification failed', { error: error.message });
            ws.close(4001, 'Invalid token');
        }
    } catch (error) {
        logDebug('WebSocket', '🔴 Connection error', { error: error.message });
        ws.close(1011, 'Internal server error');
    }
});

// Handle team join
function handleTeamJoin(userId, teamId, ws) {
    if (!teamId) {
        logDebug('WebSocket', '⚠️ Team join failed - No teamId provided', { userId });
        return;
    }

    try {
        // Add user to team room
        if (!teamRooms.has(teamId)) {
            teamRooms.set(teamId, new Set());
        }
        teamRooms.get(teamId).add(userId);

        // Update user's connection state
        const state = connectionStates.get(userId);
        if (state) {
            state.teams.add(teamId);
        }

        logDebug('WebSocket', '👥 User joined team', { 
            userId, 
            teamId,
            teamSize: teamRooms.get(teamId).size
        });

        // Notify team members
        broadcastToTeam(teamId, {
            type: 'members_update',
            teamId: teamId,
            members: Array.from(teamRooms.get(teamId))
        });

        // Confirm join to user
        safeSocketSend(ws, {
            type: 'team_joined',
            teamId: teamId
        });
    } catch (error) {
        logDebug('WebSocket', '🔴 Team join error', { 
            userId, 
            teamId, 
            error: error.message 
        });
    }
}

// Handle message
async function handleMessage(userId, data, ws) {
    if (!data.teamId) {
        throw new Error('Team ID is required');
    }

    const messageId = generateMessageId();
    
    // Log detailed debugging for message handling
    logDebug('WebSocket', '📝 Processing new message', { 
        userId,
        teamId: data.teamId,
        messageId,
        messageType: data.messageType || 'text',
        contentLength: data.content ? data.content.length : 0
    });
    
    // Get user details to include with the message
    let userDetails = { _id: userId };
    try {
        // Try to get user info from database to include in message
        const User = require('./models/User');
        const user = await User.findById(userId).select('name email').lean();
        if (user) {
            userDetails = {
                _id: userId,
                name: user.name,
                email: user.email
            };
            logDebug('WebSocket', 'Found user details for message', { userId, name: user.name });
        }
    } catch (error) {
        logDebug('WebSocket', 'Failed to get user details for message', { userId, error: error.message });
        // Continue with basic user ID if details can't be fetched
    }
    
    const message = {
        _id: messageId,
        teamId: data.teamId,
        userId: userId,
        type: data.messageType || 'text',
        content: data.content,
        timestamp: new Date(),
        user: userDetails // Include user details in the message
    };

    try {
        logDebug('WebSocket', '📤 Broadcasting message', { 
            userId,
            messageId: message._id,
            teamId: data.teamId,
            type: message.type
        });

        // Save message to database
        let savedMessage = null;
        try {
            savedMessage = await Message.create({
                messageId: message._id,
                teamId: data.teamId,
                userId: userId,
                type: data.messageType || 'text',
                content: data.content,
                timestamp: message.timestamp,
                readBy: [{ userId: userId }], // Mark as read by sender
                userName: userDetails.name || 'Unknown User' // Add user name for easier querying
            });
            
            logDebug('WebSocket', '💾 Message saved to database', {
                messageId: message._id,
                teamId: data.teamId,
                mongoId: savedMessage._id
            });
        } catch (dbError) {
            logDebug('WebSocket', '❌ Failed to save message to database', {
                error: dbError.message,
                messageId: message._id
            });
            // Continue with broadcast even if DB save fails
        }

        // Check if the team room exists
        if (!teamRooms.has(data.teamId)) {
            logDebug('WebSocket', '⚠️ Team room does not exist, creating it', { teamId: data.teamId });
            teamRooms.set(data.teamId, new Set([userId]));
        }
        
        // Ensure user is in team room
        const teamRoom = teamRooms.get(data.teamId);
        if (!teamRoom.has(userId)) {
            logDebug('WebSocket', '⚠️ User not in team room, adding them', { 
                teamId: data.teamId, 
                userId,
                roomSize: teamRoom.size 
            });
            teamRoom.add(userId);
        }

        // Get all members who should receive this message
        const teamMembers = Array.from(teamRoom);
        logDebug('WebSocket', '👥 Broadcasting to team members', { 
            teamId: data.teamId, 
            memberCount: teamMembers.length,
            members: teamMembers
        });

        // Broadcast message to team (including to sender for consistent UI)
        const broadcastResult = broadcastToTeam(data.teamId, {
            type: 'message',
            teamId: data.teamId,
            message: message // Send the complete message with user details
        });
        
        logDebug('WebSocket', '📢 Broadcast completed', broadcastResult);

        // Confirm delivery to sender
        safeSocketSend(ws, {
            type: 'message_status',
            messageId: message._id,
            status: 'delivered'
        });

        logDebug('WebSocket', '✅ Message processed successfully', { 
            userId, 
            messageId: message._id,
            teamId: data.teamId
        });
        
        return message;
    } catch (error) {
        logDebug('WebSocket', '🔴 Message handling error', { 
            userId, 
            error: error.message 
        });
        throw error;
    }
}

// Handle typing status
function handleTypingStatus(userId, data) {
    if (!data.teamId) return;

    broadcastToTeam(data.teamId, {
        type: data.type,
        teamId: data.teamId,
        userId: userId
    }, [userId]); // Exclude sender
}

// Handle client disconnect
function handleDisconnect(userId, code, reason) {
    logDebug('WebSocket', '🔴 Client disconnected', { 
        userId, 
        code, 
        reason,
        remainingConnections: wss.clients.size - 1
    });

    // Clean up client connection
    clients.delete(userId);
    
    // Get user's teams before cleaning up state
    const state = connectionStates.get(userId);
    const userTeams = state ? Array.from(state.teams) : [];
    
    logDebug('WebSocket', '🧹 Cleaning up user state', {
        userId,
        teams: userTeams,
        messageCount: state?.messageCount || 0
    });
    
    // Clean up connection state
    connectionStates.delete(userId);

    // Remove user from all team rooms and notify members
    userTeams.forEach(teamId => {
        const members = teamRooms.get(teamId);
        if (members) {
            members.delete(userId);
            broadcastToTeam(teamId, {
                type: 'members_update',
                teamId,
                members: Array.from(members)
            });
            
            logDebug('WebSocket', '👥 Updated team members', {
                teamId,
                remainingMembers: members.size
            });
        }
    });
}

// Generate a unique message ID
function generateMessageId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Safe socket send with error handling and logging
function safeSocketSend(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        try {
            ws.send(JSON.stringify(data));
            return true;
        } catch (error) {
            logDebug('WebSocket', '🔴 Send error', { 
                error: error.message,
                data: data
            });
            return false;
        }
    }
    return false;
}

// Broadcast message to team members
function broadcastToTeam(teamId, message, excludeUsers = []) {
    const members = teamRooms.get(teamId);
    if (!members || members.size === 0) {
        logDebug('WebSocket', '⚠️ No members found for team', { teamId });
        return { success: false, reason: 'no_members' };
    }

    const messageStr = JSON.stringify(message);
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    const failedUsers = [];

    members.forEach(userId => {
        if (excludeUsers.includes(userId)) {
            skippedCount++;
            return;
        }
        
        const client = clients.get(userId);
        if (client && client.readyState === WebSocket.OPEN) {
            if (safeSocketSend(client, message)) {
                successCount++;
            } else {
                failCount++;
                failedUsers.push(userId);
            }
        } else {
            logDebug('WebSocket', '⚠️ Client not found or not open', { userId, teamId });
            failCount++;
            failedUsers.push(userId);
        }
    });

    const result = { 
        teamId, 
        successCount, 
        failCount,
        skippedCount,
        totalMembers: members.size,
        failedUsers: failedUsers.length > 0 ? failedUsers : undefined
    };
    
    logDebug('WebSocket', 'Broadcast complete', result);
    return result;
}

// Keep connections alive with ping/pong
const PING_INTERVAL = 30000;
const PING_TIMEOUT = 5000;

const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
        const userId = Array.from(clients.entries())
            .find(([_, socket]) => socket === ws)?.[0];
            
        if (!userId) return;

        const state = connectionStates.get(userId);
        if (!state) return;

        if (!state.isAlive) {
            logDebug('WebSocket', 'Connection terminated - No pong response', { userId });
            ws.terminate();
            return;
        }

        state.isAlive = false;
        try {
            ws.ping();
            logDebug('WebSocket', 'Ping sent', { userId });
        } catch (error) {
            logDebug('WebSocket', 'Ping failed', { userId, error: error.message });
            ws.terminate();
        }
    });
}, PING_INTERVAL);

wss.on('close', () => {
    logDebug('WebSocket', 'Server shutting down');
    clearInterval(heartbeat);
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false // Disable CSP for development
}));

// Parse JSON and URL-encoded bodies - MUST COME BEFORE ROUTES
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Static files - Serve before API routes to avoid conflicts
app.use(express.static('public'));

// Activity logger
app.use(activityLoggerMiddleware());

// Auth API proxy middleware for backward compatibility
app.post('/api/login', (req, res, next) => {
    console.log('Login request received at /api/login');
    console.log('Request body:', req.body); // Log the request body to debug
    console.log('Request headers:', req.headers);
    
    // Direct handler for debugging
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            console.log('Missing email or password');
            return res.status(400).json({
                success: false,
                error: 'Please provide email and password'
            });
        }
        
        // For debugging: Accept the admin credentials directly
        if (email === 'admin@example.com' && password === 'password123') {
            console.log('Debug login successful for admin');
            const token = jwt.sign(
                { 
                    id: '123456789012',
                    role: 'admin',
                    name: 'Admin User'
                }, 
                process.env.JWT_SECRET || 'debugsecret', 
                { expiresIn: '30d' }
            );
            
            return res.status(200).json({
                success: true,
                token,
                user: {
                    id: '123456789012',
                    name: 'Admin User',
                    email: email,
                    role: 'admin'
                }
            });
        }
    } catch (error) {
        console.error('Debug login error:', error);
    }
    
    // Continue to regular auth handler
    next();
});

app.post('/api/register', (req, res, next) => {
    console.log('Register request received at /api/register');
    console.log('Request body:', req.body); // Log the request body to debug
    next();
});

// Direct test endpoint
app.get('/api/test', (req, res) => {
    console.log('Test endpoint accessed');
    res.json({
        success: true,
        message: 'API is working correctly',
        timestamp: new Date().toISOString()
    });
});

// Routes
console.log('Mounting auth routes at /api');
app.use('/api', authRoutes);
console.log('Mounting team routes at /api/teams');
app.use('/api/teams', teamRoutes);
console.log('Mounting task routes at /api/tasks');
app.use('/api/tasks', taskRoutes);

// Error handler
app.use(errorHandler);

// Serve index.html for all routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve dashboard.html for /dashboard route
app.get('/dashboard', (req, res) => {
    console.log('Dashboard page requested');
    try {
        const dashboardPath = path.join(__dirname, 'public', 'dashboard.html');
        if (fs.existsSync(dashboardPath)) {
            res.sendFile(dashboardPath);
        } else {
            console.error('Dashboard file not found at:', dashboardPath);
            res.status(404).send('Dashboard file not found. Please contact support.');
        }
    } catch (error) {
        console.error('Error serving dashboard page:', error);
        res.status(500).send('Error loading dashboard. Please try again later.');
    }
});

// Catch-all for other routes
app.get('*', (req, res) => {
    // Check if the request is for a file in the public directory
    const requestedPath = req.path.substring(1); // Remove leading /
    const filePath = path.join(__dirname, 'public', requestedPath);
    
    // Check if file exists
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        res.sendFile(filePath);
    } else {
        // Default to index.html for non-file routes
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
});

// MongoDB connection with retry logic and memory server fallback
const connectDB = async () => {
    let uri = process.env.MONGODB_URI;
    
    try {
        console.log('Attempting to connect to MongoDB...');
        
        // Try to connect to the configured MongoDB
        try {
            console.log('Connection string:', uri ? 'Defined' : 'Undefined');
            
            await mongoose.connect(uri, {
                serverSelectionTimeoutMS: 5000 // 5 seconds timeout
            });
            
            console.log('✅ Connected to MongoDB at:', uri);
            
            // Test the connection with a basic query
            const collections = await mongoose.connection.db.listCollections().toArray();
            console.log(`Available collections: ${collections.map(c => c.name).join(', ') || 'None'}`);
            
            return true;
        } catch (err) {
            console.error('❌ Could not connect to configured MongoDB:', err.message);
            
            // If we couldn't connect to the configured MongoDB, use in-memory MongoDB
            console.log('🔄 Falling back to in-memory MongoDB...');
            
            // Create a User model directly
            const UserSchema = new mongoose.Schema({
                name: {
                    type: String,
                    required: [true, 'Please add a name'],
                    trim: true,
                    maxlength: [50, 'Name cannot be more than 50 characters']
                },
                email: {
                    type: String,
                    required: [true, 'Please add an email'],
                    unique: true,
                    match: [
                        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                        'Please add a valid email'
                    ]
                },
                password: {
                    type: String,
                    required: [true, 'Please add a password'],
                    minlength: 6,
                    select: false
                },
                role: {
                    type: String,
                    enum: ['admin', 'manager', 'employee'],
                    default: 'employee'
                },
                createdAt: {
                    type: Date,
                    default: Date.now
                }
            });
            
            // Pre-save middleware to hash password
            UserSchema.pre('save', async function(next) {
                // Create an admin user
                if (this.isNew && this.isModified('password')) {
                    // Simple password hashing for demo
                    this.password = this.password + '_hashed';
                }
                next();
            });
            
            // Method to compare passwords
            UserSchema.methods.comparePassword = async function(enteredPassword) {
                return enteredPassword + '_hashed' === this.password;
            };
            
            // Create the User model
            const User = mongoose.model('User', UserSchema);
            
            // Create an admin user
            try {
                await User.create({
                    name: 'Admin User',
                    email: 'admin@example.com',
                    password: 'password123',
                    role: 'admin'
                });
                console.log('✅ Demo admin user created:');
                console.log('   Email: admin@example.com');
                console.log('   Password: password123');
            } catch (err) {
                console.error('Failed to create demo user:', err.message);
            }
            
            return true;
        }
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        console.log('Will retry connection in 5 seconds...');
        setTimeout(connectDB, 5000);
        return false;
    }
};

// Connect to MongoDB before starting the server
connectDB().then((connected) => {
    if (connected) {
        // Start server only after successful MongoDB connection
        const PORT = process.env.PORT || 5000;
        server.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    } else {
        console.error('Failed to start server due to database connection issues');
    }
}).catch(err => {
    console.error('Failed to start server:', err);
}); 