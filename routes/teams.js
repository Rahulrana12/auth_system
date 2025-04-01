const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Team = require('../models/Team');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const Message = require('../models/Message');
const { protect } = require('../middleware/auth');
const { authorize, isTeamMember, isTeamAdmin } = require('../middleware/rbac');
const { logActivity } = require('../utils/activityLogger');
const { sendInvitationEmail } = require('../utils/emailSender');
const jwt = require('jsonwebtoken');

// Get all teams a user is a member of
router.get('/', protect, async (req, res, next) => {
    try {
        const teams = await Team.find({
            'members.user': req.user.id
        }).populate('members.user', 'name email');

        res.status(200).json({
            success: true,
            count: teams.length,
            teams
        });
    } catch (error) {
        next(error);
    }
});

// Get all teams (admin only)
router.get('/all', protect, authorize('admin'), async (req, res, next) => {
    try {
        const teams = await Team.find().populate('members.user', 'name email role');
        
        res.status(200).json({
            success: true,
            count: teams.length,
            teams
        });
    } catch (error) {
        next(error);
    }
});

// Get single team by ID
router.get('/:teamId', protect, isTeamMember, async (req, res, next) => {
    try {
        const team = await Team.findById(req.params.teamId)
            .populate('members.user', 'name email role')
            .populate('createdBy', 'name email');
        
        res.status(200).json({
            success: true,
            team
        });
    } catch (error) {
        next(error);
    }
});

// Create new team (only admin can create teams)
router.post('/', protect, authorize('admin'), async (req, res, next) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Please provide team name'
            });
        }

        // Create the team with current user as admin member
        const team = await Team.create({
            name,
            description: description || '',
            members: [{
                user: req.user.id,
                role: 'admin'
            }],
            createdBy: req.user.id
        });

        // Add team to user's teams array
        await User.findByIdAndUpdate(
            req.user.id,
            { $push: { teams: team._id } },
            { new: true }
        );

        // Log team creation
        await logActivity({
            user: req.user.id,
            action: 'create',
            entity: 'team',
            entityId: team._id,
            details: { name, description }
        });

        res.status(201).json({
            success: true,
            team
        });
    } catch (error) {
        next(error);
    }
});

// Update team details
router.put('/:teamId', protect, isTeamAdmin, async (req, res, next) => {
    try {
        const { name, description } = req.body;
        const updates = {};
        
        if (name) updates.name = name;
        if (description !== undefined) updates.description = description;
        
        // Update the team
        const team = await Team.findByIdAndUpdate(
            req.params.teamId,
            updates,
            { new: true, runValidators: true }
        ).populate('members.user', 'name email role');
        
        // Log team update
        await logActivity({
            user: req.user.id,
            action: 'update',
            entity: 'team',
            entityId: team._id,
            details: updates
        });
        
        res.status(200).json({
            success: true,
            team
        });
    } catch (error) {
        next(error);
    }
});

// Delete team (admin only)
router.delete('/:teamId', protect, isTeamAdmin, async (req, res, next) => {
    try {
        const team = await Team.findById(req.params.teamId);
        
        if (!team) {
            return res.status(404).json({
                success: false,
                error: 'Team not found'
            });
        }

        // Remove team from all members' teams arrays
        const bulkOps = team.members.map(member => ({
            updateOne: {
                filter: { _id: member.user },
                update: { $pull: { teams: team._id } }
            }
        }));
        
        if (bulkOps.length > 0) {
            await User.bulkWrite(bulkOps);
        }
        
        // Delete team using findByIdAndDelete
        await Team.findByIdAndDelete(req.params.teamId);
        
        // Log team deletion
        await logActivity({
            user: req.user.id,
            action: 'delete',
            entity: 'team',
            entityId: req.params.teamId,
            details: { teamName: team.name }
        });
        
        res.status(200).json({
            success: true,
            message: 'Team deleted successfully'
        });
    } catch (error) {
        console.error('Team deletion error:', error);
        next(error);
    }
});

// Add member to team (admin only)
router.post('/:teamId/members', protect, isTeamAdmin, async (req, res, next) => {
    try {
        const { userId, role } = req.body;
        
        // Validate input
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid user ID'
            });
        }
        
        // Check if user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Check if user is already a member
        const team = await Team.findById(req.params.teamId);
        const existingMember = team.members.find(member => 
            member.user.toString() === userId
        );
        
        if (existingMember) {
            return res.status(400).json({
                success: false,
                error: 'User is already a member of this team'
            });
        }
        
        // Add user to team
        team.members.push({
            user: userId,
            role: role || 'employee'
        });
        
        await team.save();
        
        // Add team to user's teams array
        await User.findByIdAndUpdate(
            userId,
            { $push: { teams: team._id } },
            { new: true }
        );
        
        // Log member addition
        await logActivity({
            user: req.user.id,
            action: 'add_member',
            entity: 'team',
            entityId: team._id,
            details: { 
                teamName: team.name,
                userId,
                role: role || 'employee'
            }
        });
        
        res.status(200).json({
            success: true,
            message: 'Member added successfully',
            team
        });
    } catch (error) {
        next(error);
    }
});

// Remove member from team (admin only)
router.delete('/:teamId/members/:userId', protect, isTeamAdmin, async (req, res, next) => {
    try {
        const { teamId, userId } = req.params;
        
        // Get team
        const team = await Team.findById(teamId);
        
        // Check if user is a member
        const memberIndex = team.members.findIndex(member => 
            member.user.toString() === userId
        );
        
        if (memberIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'User is not a member of this team'
            });
        }
        
        // Remove user from team
        team.members.splice(memberIndex, 1);
        await team.save();
        
        // Remove team from user's teams array
        await User.findByIdAndUpdate(
            userId,
            { $pull: { teams: team._id } },
            { new: true }
        );
        
        // Log member removal
        await logActivity({
            user: req.user.id,
            action: 'remove_member',
            entity: 'team',
            entityId: team._id,
            details: { 
                teamName: team.name,
                userId
            }
        });
        
        res.status(200).json({
            success: true,
            message: 'Member removed successfully',
            team
        });
    } catch (error) {
        next(error);
    }
});

// Update member role in team (admin only)
router.put('/:teamId/members/:userId', protect, isTeamAdmin, async (req, res, next) => {
    try {
        const { teamId, userId } = req.params;
        const { role } = req.body;
        
        // Validate role
        if (!role || !['admin', 'employee'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid role (admin or employee)'
            });
        }
        
        // Get team
        const team = await Team.findById(teamId);
        
        // Check if user is a member and update role
        const memberIndex = team.members.findIndex(member => 
            member.user.toString() === userId
        );
        
        if (memberIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'User is not a member of this team'
            });
        }
        
        // Update role
        team.members[memberIndex].role = role;
        await team.save();
        
        // Log role update
        await logActivity({
            user: req.user.id,
            action: 'update_member_role',
            entity: 'team',
            entityId: team._id,
            details: { 
                teamName: team.name,
                userId,
                newRole: role
            }
        });
        
        res.status(200).json({
            success: true,
            message: 'Member role updated successfully',
            team
        });
    } catch (error) {
        next(error);
    }
});

// Send invitation to join team (admin only)
router.post('/:teamId/invite', protect, isTeamAdmin, async (req, res, next) => {
    try {
        const { email, role } = req.body;
        const { teamId } = req.params;
        
        // Validate input
        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Please provide an email address'
            });
        }
        
        // Get team
        const team = await Team.findById(teamId);
        
        // Check if user with email already exists
        const existingUser = await User.findOne({ email });
        
        if (existingUser) {
            // Check if user is already a member
            const existingMember = team.members.find(member => 
                member.user.toString() === existingUser._id.toString()
            );
            
            if (existingMember) {
                return res.status(400).json({
                    success: false,
                    error: 'User is already a member of this team'
                });
            }
        }
        
        // Create invitation
        const invitation = new Invitation({
            email,
            team: teamId,
            role: role || 'employee',
            invitedBy: req.user.id,
            token: 'placeholder' // Will be generated by pre-save hook
        });
        
        await invitation.save();
        
        // Send invitation email
        try {
            await sendInvitationEmail({
                email,
                teamName: team.name,
                inviterName: req.user.name,
                token: invitation.token,
                role: invitation.role
            });
        } catch (error) {
            console.error('Failed to send invitation email:', error);
            // Continue even if email fails - we'll still create the invitation
        }
        
        // Log invitation
        await logActivity({
            user: req.user.id,
            action: 'send_invitation',
            entity: 'team',
            entityId: team._id,
            details: { 
                teamName: team.name,
                email,
                role: role || 'employee'
            }
        });
        
        res.status(200).json({
            success: true,
            message: 'Invitation sent successfully',
            invitation: {
                id: invitation._id,
                email: invitation.email,
                team: invitation.team,
                role: invitation.role,
                expires: invitation.expires
            }
        });
    } catch (error) {
        next(error);
    }
});

// Accept invitation
router.get('/invitation/accept/:token', async (req, res, next) => {
    try {
        const { token } = req.params;
        
        // Find invitation
        const invitation = await Invitation.findOne({ token });
        
        if (!invitation) {
            return res.status(404).json({
                success: false,
                error: 'Invalid invitation token'
            });
        }
        
        // Check if invitation has expired
        if (invitation.isExpired()) {
            return res.status(400).json({
                success: false,
                error: 'Invitation has expired'
            });
        }
        
        // Check if invitation has already been accepted
        if (invitation.accepted) {
            return res.status(400).json({
                success: false,
                error: 'Invitation has already been used'
            });
        }
        
        res.status(200).json({
            success: true,
            invitation: {
                email: invitation.email,
                team: invitation.team,
                role: invitation.role,
                token: invitation.token
            }
        });
    } catch (error) {
        next(error);
    }
});

// Complete invitation (register user and add to team)
router.post('/invitation/complete', async (req, res, next) => {
    try {
        const { token, name, password } = req.body;
        
        if (!token || !name || !password) {
            return res.status(400).json({
                success: false,
                error: 'Please provide all required fields'
            });
        }
        
        // Find invitation
        const invitation = await Invitation.findOne({ token });
        
        if (!invitation) {
            return res.status(404).json({
                success: false,
                error: 'Invalid invitation token'
            });
        }
        
        // Check if invitation has expired
        if (invitation.isExpired()) {
            return res.status(400).json({
                success: false,
                error: 'Invitation has expired'
            });
        }
        
        // Check if invitation has already been accepted
        if (invitation.accepted) {
            return res.status(400).json({
                success: false,
                error: 'Invitation has already been used'
            });
        }
        
        let user = await User.findOne({ email: invitation.email });
        
        // If user doesn't exist, create a new user
        if (!user) {
            user = await User.create({
                name,
                email: invitation.email,
                password
            });
        }
        
        // Get team
        const team = await Team.findById(invitation.team);
        
        // Add user to team members
        team.members.push({
            user: user._id,
            role: invitation.role
        });
        
        await team.save();
        
        // Add team to user's teams array
        await User.findByIdAndUpdate(
            user._id,
            { $push: { teams: team._id } },
            { new: true }
        );
        
        // Mark invitation as accepted
        invitation.accepted = true;
        await invitation.save();
        
        // Log accepting invitation
        await logActivity({
            user: user._id,
            action: 'accept_invitation',
            entity: 'team',
            entityId: team._id,
            details: { 
                teamName: team.name,
                email: user.email,
                role: invitation.role
            }
        });
        
        res.status(200).json({
            success: true,
            message: 'Successfully joined team',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        next(error);
    }
});

// Generate invitation link
router.post('/:teamId/invite-link', protect, isTeamAdmin, async (req, res) => {
    try {
        const { role, expiryHours } = req.body;
        const teamId = req.params.teamId;

        // Validate role
        if (!['employee', 'manager'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid role specified'
            });
        }

        // Validate expiry hours
        if (!expiryHours || ![24, 72, 168].includes(expiryHours)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid expiry time'
            });
        }

        // Get team
        const team = await Team.findById(teamId);
        if (!team) {
            return res.status(404).json({
                success: false,
                error: 'Team not found'
            });
        }

        // Generate invitation token
        const invitationData = {
            teamId: team._id,
            role,
            createdBy: req.user._id,
            expires: new Date(Date.now() + expiryHours * 60 * 60 * 1000)
        };

        // Create invitation record
        const invitation = new Invitation({
            ...invitationData,
            type: 'link'
        });
        await invitation.save();

        // Generate JWT token for the invitation
        const token = jwt.sign(
            { invitationId: invitation._id },
            process.env.JWT_SECRET,
            { expiresIn: `${expiryHours}h` }
        );

        // Log activity
        await logActivity({
            user: req.user._id,
            action: 'create_invitation_link',
            entity: 'team',
            entityId: team._id,
            details: { 
                teamName: team.name,
                role,
                expiryHours
            }
        });

        res.json({
            success: true,
            token
        });
    } catch (error) {
        console.error('Error generating invitation link:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate invitation link'
        });
    }
});

// Get team message history
router.get('/:teamId/messages', protect, isTeamMember, async (req, res, next) => {
    try {
        const { teamId } = req.params;
        const { limit = 50, before } = req.query;
        
        console.log(`Fetching message history for team ${teamId} for user ${req.user._id}`);
        
        // Verify team access
        try {
            const team = await Team.findById(teamId);
            if (!team) {
                console.error(`Team ${teamId} not found for message history request`);
                return res.status(404).json({
                    success: false,
                    error: 'Team not found'
                });
            }
            
            // Additional access check
            const member = team.members.find(m => m.user.toString() === req.user._id.toString());
            if (!member) {
                console.error(`User ${req.user._id} is not a member of team ${teamId}`);
                return res.status(403).json({
                    success: false,
                    error: 'You are not a member of this team'
                });
            }
            
            console.log(`User ${req.user._id} authorized for team ${teamId} messages, role: ${member.role}`);
        } catch (err) {
            console.error(`Error verifying team access for messages: ${err.message}`);
            return next(err);
        }
        
        // Build query
        let query = {
            teamId: teamId
        };
        
        // If 'before' timestamp is provided, get messages before that time
        if (before) {
            query.timestamp = { $lt: new Date(before) };
        }
        
        console.log(`Executing message query: ${JSON.stringify(query)}`);
        
        // Find messages sorted by timestamp in descending order (newest first)
        const messages = await Message.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .populate('userId', 'name email')
            .lean();
        
        console.log(`Found ${messages.length} messages for team ${teamId}`);
        
        // If user details weren't populated fully, try to get additional user info
        const userCache = new Map();
        
        // Transform to expected format for client
        const formattedMessages = await Promise.all(messages.map(async (msg, index) => {
            console.log(`Processing message ${index + 1}/${messages.length}: ${msg.messageId}`);
            
            // Try to get user info if not fully populated
            let userInfo = null;
            
            // Use cached user info if available to avoid duplicate DB queries
            if (msg.userId && msg.userId._id) {
                if (userCache.has(msg.userId._id.toString())) {
                    userInfo = userCache.get(msg.userId._id.toString());
                } else {
                    try {
                        // Get user from database if not cached
                        const user = await User.findById(msg.userId._id).select('name email').lean();
                        if (user) {
                            userInfo = {
                                _id: msg.userId._id,
                                name: user.name,
                                email: user.email
                            };
                            userCache.set(msg.userId._id.toString(), userInfo);
                        }
                    } catch (err) {
                        console.error('Error fetching user details:', err);
                    }
                }
            }
            
            // Create a formatted message with reliable defaults
            return {
                _id: msg.messageId,
                text: msg.content,
                type: msg.type || 'text',
                createdAt: msg.timestamp,
                user: userInfo || {
                    _id: msg.userId?._id || msg.userId || 'unknown',
                    name: msg.userId?.name || msg.userName || 'Unknown User',
                    email: msg.userId?.email || ''
                },
                readBy: msg.readBy || []
            };
        }));
        
        console.log(`Successfully formatted ${formattedMessages.length} messages for response`);
        
        // Return in ascending order for display (oldest first)
        res.status(200).json({
            success: true,
            count: formattedMessages.length,
            data: formattedMessages.reverse()
        });
    } catch (error) {
        console.error('Error fetching team messages:', error);
        next(error);
    }
});

module.exports = router; 