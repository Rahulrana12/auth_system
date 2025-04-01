const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    messageId: {
        type: String,
        required: true,
        index: true
    },
    teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        required: true,
        index: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'image', 'file', 'system'],
        default: 'text'
    },
    content: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    readBy: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Add indices for efficient querying
MessageSchema.index({ teamId: 1, timestamp: -1 });
MessageSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Message', MessageSchema); 