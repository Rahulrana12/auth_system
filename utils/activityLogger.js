const ActivityLog = require('../models/ActivityLog');

/**
 * Log an activity in the system
 * @param {Object} options - Activity options
 * @param {Object} options.user - User performing the action (or user ID)
 * @param {String} options.action - Action performed
 * @param {String} options.entity - Entity type (user, team, task)
 * @param {String|Object} options.entityId - ID of the entity
 * @param {Object} [options.details={}] - Additional details
 * @param {String} [options.ipAddress=''] - IP address of the user
 * @returns {Promise<ActivityLog>} - The created activity log
 */
exports.logActivity = async (options) => {
    try {
        const { user, action, entity, entityId, details = {}, ipAddress = '' } = options;
        
        const userId = user._id || user;
        
        const log = await ActivityLog.create({
            user: userId,
            action,
            entity,
            entityId,
            details,
            ipAddress
        });
        
        return log;
    } catch (error) {
        console.error('Error logging activity:', error);
        // We don't want to break the application flow if logging fails
        return null;
    }
};

/**
 * Create activity logging middleware for Express
 * @returns {Function} - Express middleware function
 */
exports.activityLoggerMiddleware = () => {
    return async (req, res, next) => {
        // Store the original end method
        const originalEnd = res.end;
        
        // Override the end method
        res.end = async function(...args) {
            // Get the response data
            const responseData = args[0];
            
            // Only log successful operations
            if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
                try {
                    // Determine the action based on the HTTP method
                    let action = '';
                    switch (req.method) {
                        case 'GET':
                            action = 'view';
                            break;
                        case 'POST':
                            action = 'create';
                            break;
                        case 'PUT':
                        case 'PATCH':
                            action = 'update';
                            break;
                        case 'DELETE':
                            action = 'delete';
                            break;
                        default:
                            action = req.method.toLowerCase();
                    }
                    
                    // Determine entity type from the URL
                    let entity = '';
                    if (req.originalUrl.includes('/users')) {
                        entity = 'user';
                    } else if (req.originalUrl.includes('/teams')) {
                        entity = 'team';
                    } else if (req.originalUrl.includes('/tasks')) {
                        entity = 'task';
                    } else {
                        entity = 'other';
                    }
                    
                    // Get the entity ID if available
                    const entityId = req.params.id || req.params.teamId || req.params.userId || req.params.taskId || null;
                    
                    if (entityId) {
                        await exports.logActivity({
                            user: req.user._id,
                            action: `${action}`,
                            entity,
                            entityId,
                            details: {
                                method: req.method,
                                url: req.originalUrl,
                                body: req.body
                            },
                            ipAddress: req.ip
                        });
                    }
                } catch (error) {
                    console.error('Error in activity logger middleware:', error);
                }
            }
            
            // Call the original end method
            originalEnd.apply(res, args);
        };
        
        next();
    };
}; 