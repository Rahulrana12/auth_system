const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Team = require('../models/Team');
const { protect } = require('../middleware/auth');
const { authorize, isTeamMember, isTeamManager } = require('../middleware/rbac');
const { logActivity } = require('../utils/activityLogger');

// Get all tasks for a team (team members only)
router.get('/team/:teamId', protect, isTeamMember, async (req, res, next) => {
    try {
        const tasks = await Task.find({ team: req.params.teamId })
            .populate('assignedTo', 'name email')
            .populate('assignedBy', 'name')
            .sort({ deadline: 1 });
            
        res.status(200).json({
            success: true,
            count: tasks.length,
            tasks
        });
    } catch (error) {
        next(error);
    }
});

// Get all tasks assigned to the current user
router.get('/my-tasks', protect, async (req, res, next) => {
    try {
        const tasks = await Task.find({ assignedTo: req.user.id })
            .populate('team', 'name')
            .populate('assignedBy', 'name')
            .sort({ deadline: 1 });
            
        res.status(200).json({
            success: true,
            count: tasks.length,
            tasks
        });
    } catch (error) {
        next(error);
    }
});

// Get a single task by ID
router.get('/:taskId', protect, async (req, res, next) => {
    try {
        const task = await Task.findById(req.params.taskId)
            .populate('assignedTo', 'name email')
            .populate('assignedBy', 'name')
            .populate('team', 'name');
        
        if (!task) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }
        
        // Check if user is assigned to the task or is a manager/admin of the team
        const team = await Team.findById(task.team);
        const isAssignedUser = task.assignedTo.toString() === req.user.id;
        const isTeamManager = team.members.some(member => 
            member.user.toString() === req.user.id && 
            (member.role === 'admin' || member.role === 'manager')
        );
        
        if (!isAssignedUser && !isTeamManager) {
            return res.status(403).json({
                success: false,
                error: 'Not authorized to view this task'
            });
        }
        
        res.status(200).json({
            success: true,
            task
        });
    } catch (error) {
        next(error);
    }
});

// Create a new task (managers and admins only)
router.post('/team/:teamId', protect, isTeamManager, async (req, res, next) => {
    try {
        const { title, description, assignedTo, deadline } = req.body;
        
        // Validate input
        if (!title || !assignedTo || !deadline) {
            return res.status(400).json({
                success: false,
                error: 'Please provide title, assignedTo and deadline'
            });
        }
        
        // Check if assignedTo user is a member of the team
        const team = await Team.findById(req.params.teamId);
        const isMember = team.members.some(member => 
            member.user.toString() === assignedTo
        );
        
        if (!isMember) {
            return res.status(400).json({
                success: false,
                error: 'Assigned user is not a member of this team'
            });
        }
        
        // Create the task
        const task = await Task.create({
            title,
            description: description || '',
            assignedTo,
            assignedBy: req.user.id,
            team: req.params.teamId,
            deadline: new Date(deadline)
        });
        
        // Log task creation
        await logActivity({
            user: req.user.id,
            action: 'create',
            entity: 'task',
            entityId: task._id,
            details: { 
                title, 
                assignedTo,
                teamId: req.params.teamId,
                deadline
            }
        });
        
        res.status(201).json({
            success: true,
            task
        });
    } catch (error) {
        next(error);
    }
});

// Update a task status (assigned user only)
router.put('/:taskId/status', protect, async (req, res, next) => {
    try {
        const { status } = req.body;
        
        // Validate status
        if (!status || !['pending', 'in-progress', 'completed'].includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid status: pending, in-progress, or completed'
            });
        }
        
        // Check if task exists
        const task = await Task.findById(req.params.taskId);
        if (!task) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }
        
        // Check if the user is assigned to this task
        if (task.assignedTo.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                error: 'Only the assigned user can update task status'
            });
        }
        
        // Update the status
        task.status = status;
        task.updatedAt = Date.now();
        await task.save();
        
        // Log task update
        await logActivity({
            user: req.user.id,
            action: 'update_status',
            entity: 'task',
            entityId: task._id,
            details: { 
                taskId: task._id,
                oldStatus: task.status,
                newStatus: status
            }
        });
        
        res.status(200).json({
            success: true,
            task
        });
    } catch (error) {
        next(error);
    }
});

// Update a task (managers and admins only)
router.put('/:taskId', protect, async (req, res, next) => {
    try {
        const { title, description, assignedTo, deadline } = req.body;
        const updates = {};
        
        // Prepare updates
        if (title) updates.title = title;
        if (description !== undefined) updates.description = description;
        if (assignedTo) updates.assignedTo = assignedTo;
        if (deadline) updates.deadline = new Date(deadline);
        
        // Check if task exists
        const task = await Task.findById(req.params.taskId);
        if (!task) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }
        
        // Check if user is a manager or admin of the team
        const team = await Team.findById(task.team);
        const isManager = team.members.some(member => 
            member.user.toString() === req.user.id && 
            (member.role === 'admin' || member.role === 'manager')
        );
        
        if (!isManager) {
            return res.status(403).json({
                success: false,
                error: 'Only managers or admins can update task details'
            });
        }
        
        // If assignedTo is being updated, check if the new user is a team member
        if (assignedTo) {
            const isMember = team.members.some(member => 
                member.user.toString() === assignedTo
            );
            
            if (!isMember) {
                return res.status(400).json({
                    success: false,
                    error: 'Assigned user is not a member of this team'
                });
            }
        }
        
        // Update the task
        updates.updatedAt = Date.now();
        const updatedTask = await Task.findByIdAndUpdate(
            req.params.taskId,
            updates,
            { new: true, runValidators: true }
        ).populate('assignedTo', 'name email');
        
        // Log task update
        await logActivity({
            user: req.user.id,
            action: 'update',
            entity: 'task',
            entityId: updatedTask._id,
            details: { 
                taskId: updatedTask._id,
                updates
            }
        });
        
        res.status(200).json({
            success: true,
            task: updatedTask
        });
    } catch (error) {
        next(error);
    }
});

// Delete a task (managers and admins only)
router.delete('/:taskId', protect, async (req, res, next) => {
    try {
        // Check if task exists
        const task = await Task.findById(req.params.taskId);
        if (!task) {
            return res.status(404).json({
                success: false,
                error: 'Task not found'
            });
        }
        
        // Check if user is a manager or admin of the team
        const team = await Team.findById(task.team);
        const isManager = team.members.some(member => 
            member.user.toString() === req.user.id && 
            (member.role === 'admin' || member.role === 'manager')
        );
        
        if (!isManager) {
            return res.status(403).json({
                success: false,
                error: 'Only managers or admins can delete tasks'
            });
        }
        
        // Delete the task
        await Task.deleteOne({ _id: req.params.taskId });
        
        // Log task deletion
        await logActivity({
            user: req.user.id,
            action: 'delete',
            entity: 'task',
            entityId: req.params.taskId,
            details: { 
                taskId: req.params.taskId,
                taskTitle: task.title,
                teamId: task.team
            }
        });
        
        res.status(200).json({
            success: true,
            message: 'Task deleted successfully'
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router; 