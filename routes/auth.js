const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { logActivity } = require('../utils/activityLogger');

// Debug middleware to log route access
router.use((req, res, next) => {
    console.log(`Auth route accessed: ${req.method} ${req.originalUrl}`);
    next();
});

// Register user with role assignment based on registration order
router.post('/register', async (req, res, next) => {
    try {
        const { name, email, password } = req.body;

        // Log the incoming request
        console.log('Registration attempt:', { name, email });

        // Validate input
        if (!name || !email || !password) {
            console.log('Missing required fields');
            return res.status(400).json({
                success: false,
                error: 'Please provide all required fields'
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log('Email already registered:', email);
            return res.status(400).json({
                success: false,
                error: 'Email already registered'
            });
        }

        // Count existing users to determine role
        const userCount = await User.countDocuments();
        let role = 'employee'; // Default role

        // First user is admin
        if (userCount === 0) {
            role = 'admin';
        }

        console.log('Creating user with role:', role);

        // Create user with determined role
        const user = await User.create({
            name,
            email,
            password,
            role
        });

        console.log('User created successfully:', user._id);

        // Log user creation
        await logActivity({
            user: user._id,
            action: 'register',
            entity: 'user',
            entityId: user._id,
            details: { 
                name: user.name, 
                email: user.email,
                role: user.role
            }
        });

        // Generate token and send response
        sendTokenResponse(user, 201, res);
    } catch (error) {
        console.error('Registration error:', error);
        next(error);
    }
});

// Login user
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Validate email & password
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Please provide email and password'
            });
        }

        // Check for user
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Check if password matches
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Log user login
        await logActivity({
            user: user._id,
            action: 'login',
            entity: 'user',
            entityId: user._id,
            details: { email: user.email },
            ipAddress: req.ip
        });

        sendTokenResponse(user, 200, res);
    } catch (error) {
        next(error);
    }
});

// Logout user
router.get('/logout', protect, async (req, res, next) => {
    try {
        // Log user logout
        await logActivity({
            user: req.user._id,
            action: 'logout',
            entity: 'user',
            entityId: req.user._id,
            ipAddress: req.ip
        });

        res.cookie('token', 'none', {
            expires: new Date(Date.now() + 10 * 1000),
            httpOnly: true
        });

        res.status(200).json({
            success: true,
            message: 'User logged out successfully'
        });
    } catch (error) {
        next(error);
    }
});

// Get current logged in user
router.get('/me', protect, async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
});

// Get all users (admin only)
router.get('/users', protect, authorize('admin'), async (req, res, next) => {
    try {
        const users = await User.find().select('-__v');
        res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });
    } catch (error) {
        next(error);
    }
});

// Update user role (admin only)
router.put('/users/:userId/role', protect, authorize('admin'), async (req, res, next) => {
    try {
        const { role } = req.body;
        
        // Validate role
        if (!role || !['admin', 'employee'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid role (admin or employee)'
            });
        }
        
        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { role },
            { new: true, runValidators: true }
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // Log role update
        await logActivity({
            user: req.user._id,
            action: 'update_role',
            entity: 'user',
            entityId: user._id,
            details: { 
                userId: user._id,
                newRole: role,
                updatedBy: req.user.name || req.user._id
            }
        });
        
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
});

// Helper function to get token from model, create cookie and send response
const sendTokenResponse = (user, statusCode, res) => {
    const token = jwt.sign(
        { 
            id: user._id,
            role: user.role,
            name: user.name
        }, 
        process.env.JWT_SECRET, 
        { expiresIn: '30d' }
    );

    const options = {
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        httpOnly: true
    };

    if (process.env.NODE_ENV === 'production') {
        options.secure = true;
    }

    res
        .status(statusCode)
        .cookie('token', token, options)
        .json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
};

module.exports = router; 