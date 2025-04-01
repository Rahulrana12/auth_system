const mongoose = require('mongoose');
const crypto = require('crypto');

const invitationSchema = new mongoose.Schema({
    teamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        required: true
    },
    email: {
        type: String,
        validate: {
            validator: function(v) {
                return this.type === 'link' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
            },
            message: 'Email is required for email invitations'
        }
    },
    role: {
        type: String,
        enum: ['employee', 'manager'],
        required: true
    },
    type: {
        type: String,
        enum: ['email', 'link'],
        default: 'email'
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'expired', 'cancelled'],
        default: 'pending'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    acceptedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    expires: {
        type: Date,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add index for expiration
invitationSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });

// Add compound index for team and email
invitationSchema.index({ teamId: 1, email: 1 }, { 
    unique: true,
    partialFilterExpression: { type: 'email' }
});

// Generate unique token for invitation
invitationSchema.pre('save', function(next) {
    if (!this.isModified('token')) {
        return next();
    }
    
    // Generate a secure random token
    this.token = crypto.randomBytes(32).toString('hex');
    next();
});

// Set expiration to be 7 days from now
invitationSchema.pre('save', function(next) {
    if (!this.isModified('expires')) {
        return next();
    }
    
    this.expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    next();
});

// Check if invitation has expired
invitationSchema.methods.isExpired = function() {
    return this.expires < new Date();
};

const Invitation = mongoose.model('Invitation', invitationSchema);

module.exports = Invitation; 