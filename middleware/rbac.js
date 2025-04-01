/**
 * Role-Based Access Control Middleware
 */

const Team = require('../models/Team');

// Middleware to restrict access based on user role
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to access this route'
            });
        }
        
        next();
    };
};

// Middleware to check if user is a team member
exports.isTeamMember = async (req, res, next) => {
    try {
        const team = await Team.findById(req.params.teamId);
        
        if (!team) {
            return res.status(404).json({
                success: false,
                error: 'Team not found'
            });
        }
        
        const isMember = team.members.some(member => 
            member.user.toString() === req.user.id
        );
        
        if (!isMember) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to access this team'
            });
        }
        
        // Add team to the request object for later use
        req.team = team;
        next();
    } catch (error) {
        next(error);
    }
};

// Middleware to check if user has admin role in the team
exports.isTeamAdmin = async (req, res, next) => {
    try {
        const team = await Team.findById(req.params.teamId);
        
        if (!team) {
            return res.status(404).json({
                success: false,
                error: 'Team not found'
            });
        }
        
        const isAdmin = team.members.some(member => 
            member.user.toString() === req.user.id && 
            (member.role === 'admin' || req.user.role === 'admin')
        );
        
        if (!isAdmin) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to perform this action'
            });
        }
        
        // Add team to the request object for later use
        req.team = team;
        next();
    } catch (error) {
        next(error);
    }
};

// Middleware to check if user has manager or admin role in the team
exports.isTeamManager = async (req, res, next) => {
    try {
        const team = await Team.findById(req.params.teamId);
        
        if (!team) {
            return res.status(404).json({
                success: false,
                error: 'Team not found'
            });
        }
        
        // Check if user is a manager or admin
        const isManager = team.members.some(member => 
            member.user.toString() === req.user.id && 
            (member.role === 'admin' || member.role === 'manager' || req.user.role === 'admin')
        );
        
        if (!isManager) {
            return res.status(403).json({
                success: false,
                error: 'Only managers and admins can perform this action'
            });
        }
        
        // Add team to the request object for later use
        req.team = team;
        next();
    } catch (error) {
        next(error);
    }
}; 