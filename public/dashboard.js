document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard page loaded');
    
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        console.error('No authentication token found');
        // Show an error message before redirecting
        const errorDiv = document.createElement('div');
        errorDiv.className = 'auth-error';
        errorDiv.innerHTML = `
            <div class="auth-error-content">
                <i class="fas fa-exclamation-triangle"></i>
                <h2>Authentication Required</h2>
                <p>You need to log in to access the dashboard.</p>
                <p>Redirecting to login page...</p>
            </div>
        `;
        document.body.appendChild(errorDiv);
        
        // Redirect to login page after a brief delay
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);
        return;
    }
    
    // Check token validity
    verifyToken(token)
        .then(valid => {
            if (valid) {
                // Initialize dashboard
                console.log('Token valid, initializing dashboard');
                initDashboard();
            } else {
                console.error('Invalid authentication token');
                localStorage.removeItem('token');
                window.location.href = '/';
            }
        })
        .catch(error => {
            console.error('Error verifying token:', error);
            localStorage.removeItem('token');
            window.location.href = '/';
        });
});

// Function to verify token validity
async function verifyToken(token) {
    try {
        const response = await fetch('/api/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            return false;
        }
        
        const data = await response.json();
        return data.success && data.data;
    } catch (error) {
        console.error('Token verification error:', error);
        return false;
    }
}

// DOM Elements
const elements = {
    // Navigation
    navItems: document.querySelectorAll('.nav-item'),
    sections: document.querySelectorAll('.content-section'),
    logoutBtn: document.getElementById('logoutBtn'),
    adminPanel: document.getElementById('adminPanel'),

    // User info
    userName: document.getElementById('userName'),
    userRole: document.getElementById('userRole'),
    userInitial: document.getElementById('userInitial'),

    // Stats
    teamCount: document.getElementById('teamCount'),
    taskCount: document.getElementById('taskCount'),
    completedTaskCount: document.getElementById('completedTaskCount'),
    pendingTaskCount: document.getElementById('pendingTaskCount'),

    // Containers
    teamsContainer: document.getElementById('teamsContainer'),
    tasksContainer: document.getElementById('tasksContainer'),
    activityList: document.getElementById('activityList'),
    usersList: document.getElementById('usersList'),
    adminTeamsList: document.getElementById('adminTeamsList'),
    invitationsList: document.getElementById('invitationsList'),

    // Buttons and Filters
    createTeamBtn: document.getElementById('createTeamBtn'),
    filterBtns: document.querySelectorAll('.filter-btn'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    tabPanes: document.querySelectorAll('.tab-pane'),

    // Modals
    createTeamModal: document.getElementById('createTeamModal'),
    createTeamForm: document.getElementById('createTeamForm'),
    createTaskModal: document.getElementById('createTaskModal'),
    createTaskForm: document.getElementById('createTaskForm'),
    inviteUserModal: document.getElementById('inviteUserModal'),
    inviteUserForm: document.getElementById('inviteUserForm'),

    // Assign Team Modal
    assignTeamModal: document.getElementById('assignTeamModal'),
    assignTeamForm: document.getElementById('assignTeamForm'),
    assignTeamSelect: document.getElementById('assignTeamSelect'),
    assignRole: document.getElementById('assignRole'),

    // Chat Elements
    chatTeamSelect: document.getElementById('chatTeamSelect'),
    chatMessages: document.getElementById('chatMessages'),
    chatForm: document.getElementById('chatForm'),
    chatInput: document.getElementById('chatInput'),
    onlineMembers: document.getElementById('onlineMembers'),
    chatUserAvatar: document.getElementById('chatUserAvatar'),
    chatUserName: document.getElementById('chatUserName'),
    attachButton: document.getElementById('attachButton'),
    fileInput: document.getElementById('fileInput'),
    emojiButton: document.getElementById('emojiButton'),

    // Invitation link elements
    inviteTabs: document.querySelectorAll('.invite-tab'),
    tabContents: document.querySelectorAll('.invite-tab-content'),
    generateLinkBtn: document.getElementById('generateLinkBtn'),
    copyLinkBtn: document.getElementById('copyLinkBtn'),
    invitationLinkInput: document.getElementById('invitationLink'),

    // New elements
    createInvitationBtn: document.getElementById('createInvitationBtn'),
    createInvitationModal: document.getElementById('createInvitationModal'),
    inviteTeamSelect: document.getElementById('inviteTeamSelect'),
    inviteLinkTeamSelect: document.getElementById('inviteLinkTeamSelect'),
};

// Global state
const state = {
    user: null,
    teams: [],
    tasks: [],
    users: [],
    invitations: [],
    activities: [],
    currentTeam: null,
    currentTask: null,
    currentTeamChat: null,
    socket: null,
    messages: [],
    onlineMembers: [],
    reconnectAttempts: 0,
    messageStatus: new Map(),
    reactions: new Map(),
    typingUsers: new Set()
};

// Initialize dashboard
async function initDashboard() {
    try {
        // Get current user
        await fetchCurrentUser();

        // Setup event listeners
        setupEventListeners();

        // Load initial data
        await Promise.all([
            fetchTeams(),
            fetchTasks(),
            fetchActivities()
        ]);

        // Load admin data if user is admin
        if (state.user.role === 'admin') {
            elements.adminPanel.style.display = 'flex';
            elements.createTeamBtn.style.display = 'flex';
            await Promise.all([
                fetchAllUsers(),
                fetchAllTeams(),
                fetchInvitations()
            ]);
        }

        // Update UI
        updateStats();
        renderTeams();
        renderTasks();
        renderActivities();

        // Update admin UI if needed
        if (state.user.role === 'admin') {
            renderUsers();
            renderAdminTeams();
            renderInvitations();
        }

        // Initialize WebSocket connection
        initializeWebSocket();

        // Update chat team select
        updateChatTeamSelect();

        // Initialize chat features
        initializeChatFeatures();
    } catch (error) {
        console.error('Failed to initialize dashboard:', error);
        showMessage('Failed to load dashboard data', true);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Navigation
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.getAttribute('data-section');
            activateSection(section);
        });
    });

    // Logout
    elements.logoutBtn.addEventListener('click', handleLogout);

    // Task filters
    elements.filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.getAttribute('data-filter');
            filterTasks(filter);
        });
    });

    // Admin tabs
    elements.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-tab');
            activateTab(tab);
        });
    });

    // Create Team
    elements.createTeamBtn.addEventListener('click', () => showModal('createTeamModal'));
    elements.createTeamForm.addEventListener('submit', handleCreateTeam);

    // Invite User Form
    elements.inviteUserForm.addEventListener('submit', handleInviteSubmit);

    // Modal close buttons
    document.querySelectorAll('.close-modal, .cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            hideModal(modal.id);
        });
    });

    // Assign Team Form
    elements.assignTeamForm.addEventListener('submit', handleAssignTeamSubmit);

    // Chat event listeners
    elements.chatTeamSelect.addEventListener('change', handleTeamChatChange);
    elements.chatForm.addEventListener('submit', handleChatSubmit);

    // Setup invitation link handlers
    setupInvitationLinkHandlers();

    // Create Invitation button
    elements.createInvitationBtn?.addEventListener('click', () => {
        showCreateInvitationModal();
    });

    // Invitation tabs
    document.querySelectorAll('.invite-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            switchInvitationTab(tabId);
        });
    });

    // Generate and copy link buttons
    elements.generateLinkBtn?.addEventListener('click', handleGenerateInviteLink);
    elements.copyLinkBtn?.addEventListener('click', handleCopyInviteLink);
}

// API Functions
async function fetchCurrentUser() {
    try {
        const response = await fetch('/api/me', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            state.user = data.data;
            updateUserInfo();
        } else {
            throw new Error(data.error || 'Failed to get user info');
        }
    } catch (error) {
        console.error('Error fetching user:', error);
        localStorage.removeItem('token');
        window.location.href = '/';
    }
}

async function fetchTeams() {
    try {
        const response = await fetch('/api/teams', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            state.teams = data.teams;
        } else {
            throw new Error(data.error || 'Failed to fetch teams');
        }
    } catch (error) {
        console.error('Error fetching teams:', error);
        showMessage('Failed to load teams', true);
    }
}

async function fetchTasks() {
    try {
        const response = await fetch('/api/tasks/my-tasks', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            state.tasks = data.tasks;
        } else {
            throw new Error(data.error || 'Failed to fetch tasks');
        }
    } catch (error) {
        console.error('Error fetching tasks:', error);
        showMessage('Failed to load tasks', true);
    }
}

async function fetchActivities() {
    // In a real implementation, this would fetch from an activities endpoint
    // For now, we'll create some dummy activities
    state.activities = [
        {
            action: 'login',
            timestamp: new Date(),
            user: state.user ? state.user.name : 'User'
        }
    ];
}

// Admin API functions
async function fetchAllUsers() {
    try {
        const response = await fetch('/api/users', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            state.users = data.data;
        } else {
            throw new Error(data.error || 'Failed to fetch users');
        }
    } catch (error) {
        console.error('Error fetching users:', error);
        showMessage('Failed to load users', true);
    }
}

async function fetchAllTeams() {
    try {
        const response = await fetch('/api/teams/all', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            state.allTeams = data.teams;
        } else {
            throw new Error(data.error || 'Failed to fetch all teams');
        }
    } catch (error) {
        console.error('Error fetching all teams:', error);
        showMessage('Failed to load all teams', true);
    }
}

async function fetchInvitations() {
    try {
        const response = await fetch('/api/teams/invitations', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            state.invitations = data.invitations;
        } else {
            throw new Error(data.error || 'Failed to fetch invitations');
        }
    } catch (error) {
        console.error('Error fetching invitations:', error);
        showMessage('Failed to load invitations', true);
    }
}

// UI Updates
function updateUserInfo() {
    if (!state.user) return;

    elements.userName.textContent = state.user.name;
    elements.userRole.textContent = state.user.role;
    elements.userInitial.textContent = state.user.name.charAt(0).toUpperCase();

    // Set role badge color
    if (state.user.role === 'admin') {
        elements.userRole.style.backgroundColor = 'var(--error-color)';
    } else if (state.user.role === 'manager') {
        elements.userRole.style.backgroundColor = 'var(--primary-color)';
    } else {
        elements.userRole.style.backgroundColor = 'var(--secondary-color)';
    }
}

function updateStats() {
    elements.teamCount.textContent = state.teams.length;
    elements.taskCount.textContent = state.tasks.length;
    elements.completedTaskCount.textContent = state.tasks.filter(task => task.status === 'completed').length;
    elements.pendingTaskCount.textContent = state.tasks.filter(task => task.status === 'pending' || task.status === 'in-progress').length;
}

function renderTeams() {
    if (!elements.teamsContainer) return;

    elements.teamsContainer.innerHTML = '';

    if (state.teams.length === 0) {
        elements.teamsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>You don't have any teams yet</p>
                ${state.user.role === 'admin' ? 
                    '<button class="primary-btn" id="emptyCreateTeamBtn"><i class="fas fa-plus"></i> Create Team</button>' : 
                    ''}
            </div>
        `;

        const emptyCreateTeamBtn = document.getElementById('emptyCreateTeamBtn');
        if (emptyCreateTeamBtn) {
            emptyCreateTeamBtn.addEventListener('click', () => showModal('createTeamModal'));
        }
        return;
    }

    state.teams.forEach(team => {
        const teamCard = document.createElement('div');
        teamCard.className = 'team-card';
        teamCard.innerHTML = `
            <div class="team-card-header">
                <h3 class="team-card-title">${team.name}</h3>
                <div class="team-card-actions">
                    ${state.user.role === 'admin' ? 
                        `<button class="edit-team" data-id="${team._id}" title="Edit Team">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="delete-team" data-id="${team._id}" title="Delete Team">
                            <i class="fas fa-trash"></i>
                        </button>` : 
                        ''}
                </div>
            </div>
            <p class="team-description">${team.description || 'No description'}</p>
            <div class="team-members-count">
                <i class="fas fa-users"></i>
                <span>${team.members.length} members</span>
            </div>
            <div class="team-footer">
                <button class="view-team-btn" data-id="${team._id}">View Details</button>
                ${(state.user.role === 'admin' || state.user.role === 'manager') ? 
                    `<button class="add-task-btn" data-id="${team._id}">
                        <i class="fas fa-plus"></i> Add Task
                    </button>` : 
                    ''}
            </div>
        `;

        elements.teamsContainer.appendChild(teamCard);

        // Add event listeners
        const viewTeamBtn = teamCard.querySelector('.view-team-btn');
        if (viewTeamBtn) {
            viewTeamBtn.addEventListener('click', () => handleViewTeam(team._id));
        }

        const addTaskBtn = teamCard.querySelector('.add-task-btn');
        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', () => handleAddTask(team._id));
        }

        const editTeamBtn = teamCard.querySelector('.edit-team');
        if (editTeamBtn) {
            editTeamBtn.addEventListener('click', () => handleEditTeam(team._id));
        }

        const deleteTeamBtn = teamCard.querySelector('.delete-team');
        if (deleteTeamBtn) {
            deleteTeamBtn.addEventListener('click', () => handleDeleteTeam(team._id));
        }
    });
}

function renderTasks() {
    if (!elements.tasksContainer) return;

    elements.tasksContainer.innerHTML = '';

    if (state.tasks.length === 0) {
        elements.tasksContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-tasks"></i>
                <p>You don't have any tasks assigned</p>
            </div>
        `;
        return;
    }

    state.tasks.forEach(task => {
        const taskCard = document.createElement('div');
        taskCard.className = 'task-card';
        taskCard.setAttribute('data-status', task.status);
        taskCard.innerHTML = `
            <div class="task-status ${task.status}"></div>
            <div class="task-info">
                <h3 class="task-title">${task.title}</h3>
                <div class="task-details">
                    <span><i class="fas fa-users"></i> ${task.team ? task.team.name : 'Unknown team'}</span>
                    <span><i class="fas fa-user"></i> Assigned by ${task.assignedBy ? task.assignedBy.name : 'Unknown'}</span>
                    <span><i class="fas fa-calendar"></i> ${new Date(task.deadline).toLocaleDateString()}</span>
                </div>
            </div>
            <div class="task-actions">
                ${task.status !== 'completed' ? `
                    <button class="task-action-btn update-status" data-id="${task._id}" title="Update Status">
                        <i class="fas fa-check-circle"></i>
                    </button>` : ''
                }
                <button class="task-action-btn view-task" data-id="${task._id}" title="View Details">
                    <i class="fas fa-eye"></i>
                </button>
            </div>
        `;

        elements.tasksContainer.appendChild(taskCard);

        // Add event listeners
        const updateStatusBtn = taskCard.querySelector('.update-status');
        if (updateStatusBtn) {
            updateStatusBtn.addEventListener('click', () => handleUpdateTaskStatus(task._id));
        }

        const viewTaskBtn = taskCard.querySelector('.view-task');
        if (viewTaskBtn) {
            viewTaskBtn.addEventListener('click', () => handleViewTask(task._id));
        }
    });
}

function renderActivities() {
    if (!elements.activityList) return;

    elements.activityList.innerHTML = '';

    if (state.activities.length === 0) {
        elements.activityList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-history"></i>
                <p>No recent activities</p>
            </div>
        `;
        return;
    }

    state.activities.forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
        let icon = 'fa-info-circle';
        let color = 'var(--primary-color)';
        
        switch (activity.action) {
            case 'login':
                icon = 'fa-sign-in-alt';
                color = 'var(--primary-color)';
                break;
            case 'create':
                icon = 'fa-plus';
                color = 'var(--secondary-color)';
                break;
            case 'update':
                icon = 'fa-edit';
                color = 'var(--primary-color)';
                break;
            case 'delete':
                icon = 'fa-trash';
                color = 'var(--error-color)';
                break;
        }
        
        activityItem.innerHTML = `
            <div class="activity-icon" style="background-color: ${color}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="activity-info">
                <p>${activity.user} ${formatActivityAction(activity.action)}</p>
                <p class="activity-time">${formatDate(activity.timestamp)}</p>
            </div>
        `;
        
        elements.activityList.appendChild(activityItem);
    });
}

// Admin UI functions
function renderUsers() {
    if (!elements.usersList) return;

    elements.usersList.innerHTML = '';

    if (!state.users || state.users.length === 0) {
        elements.usersList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No users found</p>
            </div>
        `;
        return;
    }

    state.users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'admin-list-item';
        userItem.innerHTML = `
            <div class="admin-list-avatar">
                ${user.name.charAt(0).toUpperCase()}
            </div>
            <div class="admin-list-info">
                <h3 class="admin-list-name">${user.name}
                    <span class="admin-list-role ${user.role}">${user.role}</span>
                </h3>
                <p class="admin-list-email">${user.email}</p>
            </div>
            <div class="admin-list-actions">
                <button class="admin-action-btn assign-team" data-id="${user._id}" title="Assign to Team">
                    <i class="fas fa-user-plus"></i>
                </button>
                ${user._id !== state.user._id && user.role !== 'admin' ? `
                    <button class="admin-action-btn delete-user" data-id="${user._id}" title="Delete User">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </div>
        `;

        elements.usersList.appendChild(userItem);

        // Add event listeners
        const assignTeamBtn = userItem.querySelector('.assign-team');
        if (assignTeamBtn) {
            assignTeamBtn.addEventListener('click', () => handleAssignTeam(user._id));
        }

        const deleteUserBtn = userItem.querySelector('.delete-user');
        if (deleteUserBtn) {
            deleteUserBtn.addEventListener('click', () => handleDeleteUser(user._id));
        }
    });
}

function renderAdminTeams() {
    if (!elements.adminTeamsList) return;

    elements.adminTeamsList.innerHTML = '';

    if (!state.allTeams || state.allTeams.length === 0) {
        elements.adminTeamsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users"></i>
                <p>No teams found</p>
                <button class="primary-btn" id="emptyCreateTeamBtn">
                    <i class="fas fa-plus"></i> Create Team
                </button>
            </div>
        `;

        const emptyCreateTeamBtn = document.getElementById('emptyCreateTeamBtn');
        if (emptyCreateTeamBtn) {
            emptyCreateTeamBtn.addEventListener('click', () => showModal('createTeamModal'));
        }
        return;
    }

    state.allTeams.forEach(team => {
        const teamItem = document.createElement('div');
        teamItem.className = 'admin-list-item';
        teamItem.innerHTML = `
            <div class="admin-list-info">
                <h3 class="admin-list-name">${team.name}</h3>
                <p class="admin-list-email">${team.members.length} members</p>
            </div>
            <div class="admin-list-actions">
                <button class="admin-action-btn view-team" data-id="${team._id}" title="View Team">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="admin-action-btn delete-team" data-id="${team._id}" title="Delete Team">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        elements.adminTeamsList.appendChild(teamItem);

        // Add event listeners
        const viewTeamBtn = teamItem.querySelector('.view-team');
        if (viewTeamBtn) {
            viewTeamBtn.addEventListener('click', () => handleViewTeam(team._id));
        }

        const deleteTeamBtn = teamItem.querySelector('.delete-team');
        if (deleteTeamBtn) {
            deleteTeamBtn.addEventListener('click', () => handleDeleteTeam(team._id));
        }
    });
}

function renderInvitations() {
    if (!elements.invitationsList) return;

    elements.invitationsList.innerHTML = '';

    if (!state.invitations || state.invitations.length === 0) {
        elements.invitationsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-envelope"></i>
                <p>No pending invitations</p>
            </div>
        `;
        return;
    }

    state.invitations.forEach(invitation => {
        const invitationItem = document.createElement('div');
        invitationItem.className = 'admin-list-item';
        invitationItem.innerHTML = `
            <div class="admin-list-info">
                <h3 class="admin-list-name">${invitation.email}
                    <span class="admin-list-role ${invitation.role}">${invitation.role}</span>
                </h3>
                <p class="admin-list-email">
                    Team: ${invitation.team.name || 'Unknown Team'}<br>
                    Expires: ${new Date(invitation.expires).toLocaleDateString()}
                </p>
            </div>
            <div class="admin-list-actions">
                <button class="admin-action-btn resend-invitation" data-id="${invitation._id}" title="Resend Invitation">
                    <i class="fas fa-paper-plane"></i>
                </button>
                <button class="admin-action-btn delete-invitation" data-id="${invitation._id}" title="Delete Invitation">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        elements.invitationsList.appendChild(invitationItem);

        // Add event listeners
        const resendBtn = invitationItem.querySelector('.resend-invitation');
        if (resendBtn) {
            resendBtn.addEventListener('click', () => handleResendInvitation(invitation._id));
        }

        const deleteBtn = invitationItem.querySelector('.delete-invitation');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => handleDeleteInvitation(invitation._id));
        }
    });
}

// Event Handlers
function activateSection(sectionId) {
    elements.navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-section') === sectionId) {
            item.classList.add('active');
        }
    });

    elements.sections.forEach(section => {
        section.classList.remove('active');
        if (section.id === sectionId) {
            section.classList.add('active');
        }
    });
}

function activateTab(tabId) {
    elements.tabBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-tab') === tabId) {
            btn.classList.add('active');
        }
    });

    elements.tabPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === `${tabId}Tab`) {
            pane.classList.add('active');
        }
    });
}

function filterTasks(filter) {
    elements.filterBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-filter') === filter) {
            btn.classList.add('active');
        }
    });

    const taskCards = document.querySelectorAll('.task-card');
    taskCards.forEach(card => {
        if (filter === 'all' || card.getAttribute('data-status') === filter) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

async function handleLogout() {
    try {
        // Call logout API
        await fetch('/api/logout', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
    } catch (error) {
        console.error('Error during logout:', error);
    } finally {
        // Clear token and redirect
        localStorage.removeItem('token');
        window.location.href = '/';
    }
}

async function handleCreateTeam(e) {
    e.preventDefault();
    
    const teamName = document.getElementById('teamName').value;
    const teamDescription = document.getElementById('teamDescription').value;
    
    try {
        const response = await fetch('/api/teams', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                name: teamName,
                description: teamDescription
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Team created successfully!');
            hideModal('createTeamModal');
            document.getElementById('createTeamForm').reset();
            
            // Refresh teams
            await fetchTeams();
            if (state.user.role === 'admin') {
                await fetchAllTeams();
            }
            
            renderTeams();
            if (state.user.role === 'admin') {
                renderAdminTeams();
            }
            updateStats();
        } else {
            throw new Error(data.error || 'Failed to create team');
        }
    } catch (error) {
        console.error('Error creating team:', error);
        showMessage('Failed to create team: ' + error.message, true);
    }
}

function handleViewTeam(teamId) {
    // This would show a detailed view of the team
    console.log('View team', teamId);
    showMessage('Team details view coming soon!');
}

function handleAddTask(teamId) {
    // Set the current team and show the task modal
    state.currentTeam = teamId;
    document.getElementById('taskTeamId').value = teamId;
    showModal('createTaskModal');
}

function handleEditTeam(teamId) {
    // This would show the edit team modal
    console.log('Edit team', teamId);
    showMessage('Edit team feature coming soon!');
}

async function handleDeleteTeam(teamId) {
    if (!confirm('Are you sure you want to delete this team?')) return;
    
    try {
        const response = await fetch(`/api/teams/${teamId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Team deleted successfully!');
            
            // Refresh teams
            await fetchTeams();
            if (state.user.role === 'admin') {
                await fetchAllTeams();
            }
            
            renderTeams();
            if (state.user.role === 'admin') {
                renderAdminTeams();
            }
            updateStats();
        } else {
            throw new Error(data.error || 'Failed to delete team');
        }
    } catch (error) {
        console.error('Error deleting team:', error);
        showMessage('Failed to delete team: ' + error.message, true);
    }
}

function handleUpdateTaskStatus(taskId) {
    // This would show a modal to update task status
    console.log('Update task status', taskId);
    showMessage('Update task status feature coming soon!');
}

function handleViewTask(taskId) {
    // This would show a detailed view of the task
    console.log('View task', taskId);
    showMessage('Task details view coming soon!');
}

async function handleAssignTeam(userId) {
    // Show team assignment modal
    showModal('assignTeamModal');
    state.selectedUserId = userId;
}

async function handleDeleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('User deleted successfully!');
            await fetchAllUsers();
            renderUsers();
        } else {
            throw new Error(data.error || 'Failed to delete user');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showMessage('Failed to delete user: ' + error.message, true);
    }
}

async function handleAssignTeamSubmit(e) {
    e.preventDefault();
    
    const teamId = elements.assignTeamSelect.value;
    const role = elements.assignRole.value;
    
    try {
        const response = await fetch(`/api/teams/${teamId}/members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                userId: state.selectedUserId,
                role: role
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('User assigned to team successfully!');
            hideModal('assignTeamModal');
            elements.assignTeamForm.reset();
            
            // Refresh data
            await Promise.all([
                fetchAllUsers(),
                fetchAllTeams()
            ]);
            
            renderUsers();
            renderAdminTeams();
        } else {
            throw new Error(data.error || 'Failed to assign user to team');
        }
    } catch (error) {
        console.error('Error assigning user to team:', error);
        showMessage('Failed to assign user to team: ' + error.message, true);
    }
}

// Utility Functions
function showMessage(message, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isError ? 'error-message' : 'success-message'}`;
    messageDiv.textContent = message;
    document.body.appendChild(messageDiv);

    // Animate in
    requestAnimationFrame(() => {
        messageDiv.classList.add('show');
    });

    // Remove after 3 seconds
    setTimeout(() => {
        messageDiv.classList.remove('show');
        setTimeout(() => messageDiv.remove(), 300);
    }, 3000);
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        
        // If it's the assign team modal, populate the teams dropdown
        if (modalId === 'assignTeamModal' && state.allTeams) {
            elements.assignTeamSelect.innerHTML = state.allTeams
                .map(team => `<option value="${team._id}">${team.name}</option>`)
                .join('');
        }
    }
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

function formatDate(date) {
    const d = new Date(date);
    return d.toLocaleString();
}

function formatActivityAction(action) {
    switch (action) {
        case 'login':
            return 'logged in';
        case 'create':
            return 'created a new item';
        case 'update':
            return 'updated an item';
        case 'delete':
            return 'deleted an item';
        default:
            return action;
    }
}

// Initialize WebSocket connection
function initializeWebSocket() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No authentication token found');
            return;
        }

        // Close existing connection if any
        if (state.socket && state.socket.readyState !== WebSocket.CLOSED) {
            state.socket.close();
        }
        state.socket = null;

        // Create WebSocket URL with proper port handling
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = '5000'; // Server port
        const wsUrl = `${protocol}//${host}:${port}/ws`;
        const fullUrl = `${wsUrl}?token=${encodeURIComponent(token)}`;
        
        // Create new WebSocket connection
        state.socket = new WebSocket(fullUrl);

        // Connection timeout (5 seconds)
        const connectionTimeout = setTimeout(() => {
            if (state.socket && state.socket.readyState !== WebSocket.OPEN) {
                state.socket.close();
                state.socket = null;
                showMessage('Chat server connection timed out', true);
                scheduleReconnect();
            }
        }, 5000);

        // Connection opened
        state.socket.onopen = () => {
            clearTimeout(connectionTimeout);
            showMessage('Connected to chat server');
            
            // Reset reconnection attempts
            state.reconnectAttempts = 0;
            
            // Update connection status in UI
            updateConnectionStatus(true);
            
            // Rejoin team chat if one was selected
            if (state.currentTeamChat) {
                joinTeamChat(state.currentTeamChat);
            }
        };

        // Listen for messages
        state.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };

        // Connection closed
        state.socket.onclose = (event) => {
            clearTimeout(connectionTimeout);
            state.socket = null;
            
            // Update connection status in UI
            updateConnectionStatus(false);
            
            // Show reconnection message and attempt to reconnect for abnormal closures
            if (!event.wasClean || event.code === 1006) {
                const chatSection = document.getElementById('chat');
                if (chatSection && chatSection.classList.contains('active')) {
                    showMessage('Chat connection lost. Attempting to reconnect...', true);
                }
                // Small delay before reconnecting
                setTimeout(() => {
                    scheduleReconnect();
                }, 1000);
            }
        };

        // Connection error
        state.socket.onerror = (error) => {
            console.error('WebSocket error:', error);
            updateConnectionStatus(false);
        };

    } catch (error) {
        console.error('Error initializing WebSocket:', error);
        showMessage('Failed to initialize chat connection', true);
        updateConnectionStatus(false);
        scheduleReconnect();
    }
}

// Schedule reconnection with exponential backoff
function scheduleReconnect() {
    if (!state.reconnectAttempts) {
        state.reconnectAttempts = 0;
    }
    
    // Maximum number of reconnection attempts
    const MAX_ATTEMPTS = 5; // Reduced from 10 to 5 for faster feedback
    
    if (state.reconnectAttempts >= MAX_ATTEMPTS) {
        console.log('🔴 Maximum reconnection attempts reached');
        showMessage('Unable to connect to chat server. Please check your connection and refresh the page.', true);
        return;
    }
    
    const maxDelay = 16000; // 16 seconds max
    const baseDelay = 1000; // 1 second
    const backoffDelay = Math.min(baseDelay * Math.pow(2, state.reconnectAttempts), maxDelay);
    state.reconnectAttempts++;
    
    console.log(`🔄 Scheduling reconnection attempt ${state.reconnectAttempts}/${MAX_ATTEMPTS} in ${backoffDelay}ms`, {
        attempts: state.reconnectAttempts,
        delay: backoffDelay,
        timestamp: new Date().toISOString()
    });
    
    // Clear any existing reconnection timeout
    if (state.reconnectTimeout) {
        clearTimeout(state.reconnectTimeout);
        state.reconnectTimeout = null;
    }
    
    // Store the timeout ID so we can clear it if needed
    state.reconnectTimeout = setTimeout(() => {
        // Double check socket state before attempting reconnection
        if (!state.socket || state.socket.readyState === WebSocket.CLOSED) {
            console.log(`🔄 Attempting to reconnect (attempt ${state.reconnectAttempts}/${MAX_ATTEMPTS})...`, {
                timestamp: new Date().toISOString()
            });
            
            // Clear any existing socket
            if (state.socket) {
                try {
                    state.socket.close();
                } catch (error) {
                    console.error('Error closing existing socket:', error);
                }
                state.socket = null;
            }
            
            initializeWebSocket();
        } else {
            console.log('🟢 Socket is already connected or connecting', {
                readyState: state.socket?.readyState,
                timestamp: new Date().toISOString()
            });
            // Reset reconnection attempts since we're connected
            state.reconnectAttempts = 0;
        }
    }, backoffDelay);
}

// Function to join team chat
function joinTeamChat(teamId) {
    if (!state.socket) {
        console.error('❌ No WebSocket connection available');
        initializeWebSocket();
        return false;
    }

    if (state.socket.readyState !== WebSocket.OPEN) {
        console.error('❌ WebSocket is not connected', {
            readyState: state.socket.readyState,
            timestamp: new Date().toISOString()
        });
        return false;
    }

    try {
        console.log('👥 Joining team chat:', {
            teamId: teamId,
            timestamp: new Date().toISOString()
        });
        state.socket.send(JSON.stringify({
            type: 'join_team',
            teamId: teamId
        }));
        return true;
    } catch (error) {
        console.error('🔴 Error joining team chat:', {
            error: error,
            teamId: teamId,
            timestamp: new Date().toISOString()
        });
        return false;
    }
}

// WebSocket message handler
function handleWebSocketMessage(data) {
    try {
        logDebug('WebSocket', 'Received WebSocket message:', data);

        switch (data.type) {
            case 'connected':
                showMessage('Connected to chat server');
                break;

            case 'team_joined':
                logDebug('WebSocket', 'Joined team chat:', data.teamId);
                break;

            case 'members_update':
                if (data.teamId === state.currentTeamChat) {
                    state.onlineMembers = data.members
                        .filter(id => id !== state.user._id)
                        .map(id => ({
                            _id: id,
                            name: 'Team Member'
                        }));
                    renderOnlineMembers();
                }
                break;

            case 'message':
                // Check if this message is for the current chat team
                if (data.teamId === state.currentTeamChat) {
                    const incomingMessage = data.message;
                    
                    logDebug('WebSocket', 'Received message for current team:', incomingMessage);
                    
                    // Normalize the message format
                    const normalizedMessage = {
                        _id: incomingMessage._id,
                        text: incomingMessage.content,
                        createdAt: incomingMessage.timestamp,
                        type: incomingMessage.type || 'text',
                        user: incomingMessage.user || { _id: incomingMessage.userId }
                    };
                    
                    // Check if this is a duplicate of a pending message
                    const pendingMsg = state.messages.find(m => 
                        m.pending && 
                        m.text === normalizedMessage.text &&
                        Math.abs(new Date(m.createdAt) - new Date(normalizedMessage.createdAt)) < 10000
                    );
                    
                    if (pendingMsg) {
                        // Update pending message with confirmed message
                        logDebug('Chat', 'Updating pending message with confirmed message', {
                            pendingId: pendingMsg._id,
                            confirmedId: normalizedMessage._id
                        });
                        
                        // Remove pending message and add the confirmed one
                        state.messages = state.messages.filter(m => m._id !== pendingMsg._id);
                        state.messages.push(normalizedMessage);
                        
                        // Re-render all messages to ensure proper order
                        renderMessages();
                    } else {
                        // Check if this message is already in our state by ID
                        const existingMsg = state.messages.find(m => m._id === normalizedMessage._id);
                        
                        if (!existingMsg) {
                            logDebug('Chat', 'Adding new message to state and rendering:', normalizedMessage);
                            // Add the message to state
                            state.messages.push(normalizedMessage);
                            // Render this single message to avoid re-rendering everything
                            renderMessage(normalizedMessage);
                            // Scroll to bottom
                            scrollToBottom();
                        } else {
                            logDebug('Chat', 'Message already exists in state, not rendering again');
                        }
                    }
                }
                break;

            case 'message_status':
                if (data.messageId) {
                    state.messageStatus.set(data.messageId, data.status);
                    updateMessageStatus(data.messageId, data.status);
                }
                break;

            case 'reaction':
                if (data.messageId) {
                    updateMessageReactions(data.messageId, data.reaction, data.user);
                }
                break;

            case 'typing':
                if (data.teamId === state.currentTeamChat && data.userId !== state.user._id) {
                    state.typingUsers.add(data.userId);
                    updateTypingIndicator();
                }
                break;

            case 'stop_typing':
                if (data.teamId === state.currentTeamChat) {
                    state.typingUsers.delete(data.userId);
                    updateTypingIndicator();
                }
                break;
                
            default:
                // Handle other message types
                logDebug('WebSocket', 'Unhandled message type:', data.type);
        }
    } catch (error) {
        console.error('Error handling WebSocket message:', error);
    }
}

// Chat functions
async function handleTeamChatChange(e) {
    const teamId = e.target.value;
    if (!teamId) return;

    logDebug('Chat', `Switching to team chat: ${teamId}`);
    state.currentTeamChat = teamId;
    
    try {
        // Clear existing messages
        state.messages = [];
        renderMessages();
        
        // Join team chat room if socket is connected
        if (!joinTeamChat(teamId)) {
            // Try to reconnect if socket is not connected
            logDebug('Chat', 'WebSocket not connected, attempting to reconnect');
            initializeWebSocket();
        }
        
        // Load team messages
        try {
            logDebug('Chat', `Fetching message history for team ${teamId}`);
            
            // Show loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'message-loading';
            loadingDiv.innerHTML = '<div class="loading-spinner"></div><p>Loading messages...</p>';
            elements.chatMessages.innerHTML = '';
            elements.chatMessages.appendChild(loadingDiv);
            
            const response = await fetch(`/api/teams/${teamId}/messages`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            logDebug('Chat', `Loaded ${data.count || 0} messages from history`);

            if (data.success) {
                state.messages = data.data || [];
                logDebug('Chat', 'Messages loaded:', state.messages);
                
                // Add troubleshooting button if no messages
                if (state.messages.length === 0) {
                    elements.chatMessages.innerHTML = `
                        <div class="empty-chat-state">
                            <div class="empty-chat-icon">
                                <i class="fas fa-comments"></i>
                            </div>
                            <p>No messages yet. Start the conversation!</p>
                            <button class="retry-btn" onclick="troubleshootChatDisplay()">
                                Troubleshoot Chat
                            </button>
                        </div>
                    `;
                } else {
                    // Render messages if we have them
                    renderMessages();
                }
            } else {
                throw new Error(data.error || 'Failed to load messages');
            }
        } catch (error) {
            console.error('Error loading message history:', error);
            showMessage('Failed to load message history: ' + error.message, true);
            
            // Show error in chat window with options to troubleshoot
            elements.chatMessages.innerHTML = `
                <div class="chat-error">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Failed to load messages: ${error.message}</p>
                    <div class="error-actions">
                        <button class="retry-btn" onclick="handleTeamChatChange({target:{value:'${teamId}'}})">
                            Retry
                        </button>
                        <button class="retry-btn" onclick="troubleshootChatDisplay()">
                            Troubleshoot
                        </button>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error switching team chat:', error);
        showMessage('Failed to switch team chat', true);
    }
}

async function handleChatSubmit(e) {
    e.preventDefault();
    
    if (!state.currentTeamChat) {
        showMessage('Please select a team first', true);
        return;
    }

    const message = elements.chatInput.value.trim();
    if (!message) return;

    try {
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
            throw new Error('Chat connection is not open');
        }

        // Generate a temporary local ID for the message
        const tempId = 'temp-' + Date.now().toString(36);

        // Create optimistic message object for local display
        const optimisticMessage = {
            _id: tempId,
            text: message,
            type: 'text',
            createdAt: new Date(),
            user: state.user,
            pending: true
        };

        // Add optimistic message to UI
        state.messages.push(optimisticMessage);
        renderMessage(optimisticMessage);
        scrollToBottom();
        
        // Clear input field
        elements.chatInput.value = '';

        // Send message through WebSocket
        state.socket.send(JSON.stringify({
            type: 'message',
            teamId: state.currentTeamChat,
            content: message
        }));
    } catch (error) {
        console.error('Error sending message:', error.message);
        showMessage('Failed to send message: ' + error.message, true);
        
        // Try to reconnect
        if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
            initializeWebSocket();
        }
    }
}

function addMessage(message) {
    state.messages.push(message);
    renderMessage(message);
    scrollToBottom();
}

function renderMessages() {
    if (!elements.chatMessages) {
        console.error('Chat messages element not found');
        return;
    }
    
    logDebug('Chat', `Rendering ${state.messages.length} messages in chat`);
    elements.chatMessages.innerHTML = '';
    
    if (state.messages.length === 0) {
        // Show an empty state message
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-chat-state';
        emptyState.innerHTML = `
            <div class="empty-chat-icon">
                <i class="fas fa-comments"></i>
            </div>
            <p>No messages yet. Start the conversation!</p>
            <button class="retry-btn" onclick="troubleshootChatDisplay()">
                Troubleshoot Chat
            </button>
        `;
        elements.chatMessages.appendChild(emptyState);
        return;
    }
    
    // Sort messages by timestamp (oldest first)
    const sortedMessages = [...state.messages].sort((a, b) => {
        const timeA = new Date(a.createdAt || a.timestamp || 0);
        const timeB = new Date(b.createdAt || b.timestamp || 0);
        return timeA - timeB;
    });
    
    logDebug('Chat', 'Sorted messages:', sortedMessages);
    
    // Render each message
    let rendered = 0;
    sortedMessages.forEach((message, index) => {
        try {
            logDebug('Chat', `Rendering message ${index + 1}/${sortedMessages.length}:`, message);
            renderMessage(message);
            rendered++;
        } catch (error) {
            console.error(`Error rendering message ${index}:`, error, message);
        }
    });
    
    logDebug('Chat', `Successfully rendered ${rendered}/${sortedMessages.length} messages`);
    
    // Scroll to bottom after rendering all messages
    scrollToBottom();
}

function scrollToBottom() {
    if (!elements.chatMessages) return;
    
    // Use requestAnimationFrame to ensure the DOM has updated
    requestAnimationFrame(() => {
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    });
}

function renderMessage(message) {
    if (!message || !message._id) {
        console.error('Invalid message object:', message);
        return;
    }
    
    // Check if message already exists in DOM to avoid duplicates
    const existingMessage = document.querySelector(`.message[data-message-id="${message._id}"]`);
    if (existingMessage) {
        return;
    }
    
    // Check if this message is from the current user
    const isCurrentUser = message.user && 
        (message.user._id === state.user._id || 
         (typeof message.user._id === 'object' && message.user._id.toString() === state.user._id));
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isCurrentUser ? 'sent' : ''}`;
    
    // Add pending class if message is still being sent
    if (message.pending) {
        messageDiv.className += ' pending';
    }
    
    messageDiv.dataset.messageId = message._id;

    let messageContent = '';
    if (message.type === 'file') {
        // Render file attachment
        if (message.fileType && message.fileType.startsWith('image/')) {
            messageContent = `
                <img src="${message.content}" alt="${message.fileName || 'Image'}" style="max-width: 300px; border-radius: 4px;">
                <div class="file-info">${message.fileName || 'File'} (${formatFileSize(message.fileSize || 0)})</div>
            `;
        } else {
            messageContent = `
                <div class="file-attachment">
                    <i class="fas fa-file"></i>
                    <div class="file-info">
                        <div class="file-name">${message.fileName || 'File'}</div>
                        <div class="file-size">${formatFileSize(message.fileSize || 0)}</div>
                    </div>
                </div>
            `;
        }
    } else {
        // Regular text message - use text or content field based on which is available
        const messageText = message.text || message.content || '';
        messageContent = `<div class="message-text">${formatMessageText(messageText)}</div>`;
    }

    // Handle timestamp variations (createdAt or timestamp)
    const timestamp = message.createdAt || message.timestamp || new Date();

    // Get user name based on different possible formats
    let userName = 'Unknown User';
    if (message.user) {
        if (isCurrentUser) {
            userName = 'You';
        } else if (message.user.name) {
            userName = message.user.name;
        } else if (typeof message.user._id === 'string') {
            userName = `User ${message.user._id.substring(0, 6)}...`;
        } else {
            userName = `User ${message.user._id}`;
        }
    }
    
    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="message-sender">${userName}</span>
        </div>
        <div class="message-content">
            ${messageContent}
            <div class="message-info">
                <span class="message-time">${formatTime(timestamp)}</span>
                ${isCurrentUser ? `
                    <span class="message-status">
                        ${message.pending ? '' : getMessageStatusIcon(message._id)}
                    </span>
                ` : ''}
            </div>
        </div>
    `;

    // Make sure the message is actually appended to the DOM
    if (elements.chatMessages) {
        elements.chatMessages.appendChild(messageDiv);
        scrollToBottom();
    } else {
        console.error('Chat messages container not found');
    }
}

function renderOnlineMembers() {
    elements.onlineMembers.innerHTML = '';
    state.onlineMembers.forEach(member => {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'online-member';
        memberDiv.innerHTML = `
            <div class="member-avatar">
                ${member.name.charAt(0).toUpperCase()}
            </div>
            <div class="member-info">
                <div class="member-name">${member.name}</div>
                <div class="member-status">Online</div>
            </div>
        `;
        elements.onlineMembers.appendChild(memberDiv);
    });
}

// Update team select options when teams are loaded
function updateChatTeamSelect() {
    if (!elements.chatTeamSelect) return;

    elements.chatTeamSelect.innerHTML = `
        <option value="">Select a team</option>
        ${state.teams.map(team => `
            <option value="${team._id}">${team.name}</option>
        `).join('')}
    `;
}

// Initialize chat features
function initializeChatFeatures() {
    // Update user info in chat header
    if (state.user) {
        elements.chatUserAvatar.textContent = state.user.name.charAt(0).toUpperCase();
        elements.chatUserName.textContent = state.user.name;
    }

    // File attachment handling
    elements.attachButton.addEventListener('click', () => {
        elements.fileInput.click();
    });

    elements.fileInput.addEventListener('change', handleFileAttachment);

    // Emoji picker
    elements.emojiButton.addEventListener('click', toggleEmojiPicker);

    // Typing indicator
    let typingTimeout;
    elements.chatInput.addEventListener('input', () => {
        if (!state.currentTeamChat) return;

        // Clear existing timeout
        clearTimeout(typingTimeout);

        // Send typing indicator
        if (state.socket && state.socket.readyState === WebSocket.OPEN) {
            state.socket.send(JSON.stringify({
                type: 'typing',
                teamId: state.currentTeamChat
            }));
        }

        // Set timeout to stop typing
        typingTimeout = setTimeout(() => {
            if (state.socket && state.socket.readyState === WebSocket.OPEN) {
                state.socket.send(JSON.stringify({
                    type: 'stop_typing',
                    teamId: state.currentTeamChat
                }));
            }
        }, 1000);
    });
}

// Handle file attachment
async function handleFileAttachment(event) {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    try {
        for (const file of files) {
            // Check file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                showMessage(`File ${file.name} is too large. Maximum size is 10MB.`, true);
                continue;
            }

            // Create message with file
            const message = {
                type: 'file',
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                content: await readFileAsDataURL(file),
                timestamp: new Date(),
                user: state.user
            };

            // Send file message
            if (state.socket && state.socket.readyState === WebSocket.OPEN) {
                state.socket.send(JSON.stringify({
                    type: 'message',
                    messageType: 'file',
                    teamId: state.currentTeamChat,
                    content: message
                }));

                // Optimistically add message to UI
                addMessage(message);
            }
        }

        // Clear file input
        event.target.value = '';
    } catch (error) {
        console.error('Error handling file attachment:', error);
        showMessage('Failed to send file(s)', true);
    }
}

// Read file as data URL
function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

// Toggle emoji picker
function toggleEmojiPicker() {
    // Implementation will depend on the emoji picker library you choose
    // For example, you could use emoji-mart or similar
    console.log('Emoji picker toggled');
}

// Format message text with emojis and links
function formatMessageText(text) {
    if (!text) return '';
    
    // Basic text formatting - convert URLs to links
    return text
        .replace(/https?:\/\/[^\s]+/g, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
        .replace(/\n/g, '<br>');
}

// Format timestamp
function formatTime(timestamp) {
    if (!timestamp) return '';
    
    try {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
        console.error('Error formatting time:', error);
        return '';
    }
}

// Get message status icon
function getMessageStatusIcon(messageId) {
    if (!messageId) return '<i class="fas fa-check"></i>';
    
    const status = state.messageStatus.get(messageId) || 'sent';
    
    switch (status) {
        case 'sent':
            return '<i class="fas fa-check"></i>';
        case 'delivered':
            return '<i class="fas fa-check-double"></i>';
        case 'read':
            return '<i class="fas fa-check-double" style="color: #3498db;"></i>';
        case 'failed':
            return '<i class="fas fa-exclamation-circle"></i>';
        default:
            return '<i class="fas fa-check"></i>';
    }
}

// Render reactions
function renderReactions(messageId) {
    if (!messageId) return '';
    
    const reactions = state.reactions.get(messageId) || {};
    
    return Object.entries(reactions)
        .map(([reaction, users]) => {
            return `
                <div class="reaction" data-reaction="${reaction}">
                    ${reaction} <span class="reaction-count">${users.length}</span>
                </div>
            `;
        })
        .join('');
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

// Update message status in UI
function updateMessageStatus(messageId, status) {
    // Find the message in the DOM
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageEl) return;
    
    // Update status in the UI
    const statusEl = messageEl.querySelector('.message-status');
    if (statusEl) {
        // Remove pending class if present
        messageEl.classList.remove('pending');
        
        // Update status icon
        statusEl.innerHTML = getMessageStatusIcon(messageId);
    }
    
    // Update message in state
    const messageIndex = state.messages.findIndex(m => m._id === messageId);
    if (messageIndex >= 0) {
        state.messages[messageIndex].pending = false;
    }
    
    // Update temporary messages if this is a server message replacing a temp one
    if (messageId.startsWith('temp-')) {
        // When the server responds with a new message, we need to replace our temporary one
        const serverMessage = state.messages.find(m => 
            !m._id.startsWith('temp-') && 
            m.text === state.messages[messageIndex].text &&
            Math.abs(new Date(m.createdAt) - new Date(state.messages[messageIndex].createdAt)) < 5000
        );
        
        if (serverMessage) {
            // Remove the temporary message
            state.messages.splice(messageIndex, 1);
            
            // Update the UI
            renderMessages();
        }
    }
}

// Update message reactions in UI
function updateMessageReactions(messageId, reaction, user) {
    if (!state.reactions.has(messageId)) {
        state.reactions.set(messageId, new Map());
    }
    
    const messageReactions = state.reactions.get(messageId);
    if (!messageReactions.has(reaction)) {
        messageReactions.set(reaction, []);
    }
    
    const users = messageReactions.get(reaction);
    const existingIndex = users.findIndex(u => u._id === user._id);
    
    if (existingIndex === -1) {
        users.push(user);
    } else {
        users.splice(existingIndex, 1);
        if (users.length === 0) {
            messageReactions.delete(reaction);
        }
    }
    
    const reactionsElement = document.querySelector(`[data-message-id="${messageId}"] .message-reactions`);
    if (reactionsElement) {
        reactionsElement.innerHTML = renderReactions(messageId);
    }
}

// Update typing indicator
function updateTypingIndicator() {
    const typingUsers = Array.from(state.typingUsers)
        .map(userId => state.users.find(u => u._id === userId))
        .filter(user => user);

    const typingElement = document.getElementById('typingIndicator') ||
        createElement('div', { id: 'typingIndicator', className: 'typing-indicator' });

    if (typingUsers.length > 0) {
        typingElement.textContent = typingUsers.length === 1
            ? `${typingUsers[0].name} is typing...`
            : `${typingUsers.length} people are typing...`;
        elements.chatMessages.appendChild(typingElement);
    } else if (typingElement.parentNode) {
        typingElement.remove();
    }
}

// Update connection status in UI
function updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connectionStatus');
    if (!statusElement) {
        const newStatusElement = document.createElement('div');
        newStatusElement.id = 'connectionStatus';
        
        // Add to chat header
        const chatHeader = document.querySelector('.chat-header');
        if (chatHeader) {
            chatHeader.appendChild(newStatusElement);
        }
    }
    
    const element = statusElement || document.getElementById('connectionStatus');
    if (element) {
        element.className = `connection-status ${isConnected ? 'connected' : 'disconnected'}`;
        element.innerHTML = `
            <span class="status-indicator"></span>
            <span class="status-text">${isConnected ? 'Connected' : 'Disconnected'}</span>
        `;
    }
}

// Handle team invitation
async function handleInviteTeam(teamId, teamName) {
    // Set the current team ID in both forms
    const teamIdInputs = document.querySelectorAll('#inviteTeamId');
    teamIdInputs.forEach(input => input.value = teamId);
    
    // Set team name in modal title
    document.getElementById('inviteTeamName').textContent = teamName;
    
    // Reset forms
    document.getElementById('inviteUserForm').reset();
    document.getElementById('invitationLink').value = '';
    
    // Reset tabs to default state
    const emailTab = document.querySelector('.invite-tab[data-tab="email"]');
    const emailContent = document.getElementById('emailInviteTab');
    const linkTab = document.querySelector('.invite-tab[data-tab="link"]');
    const linkContent = document.getElementById('linkInviteTab');
    
    emailTab.classList.add('active');
    emailContent.classList.add('active');
    linkTab.classList.remove('active');
    linkContent.classList.remove('active');
    
    // Show the invite modal
    showModal('inviteUserModal');
}

// Handle invitation form submission
async function handleInviteSubmit(e) {
    e.preventDefault();
    
    const teamId = document.getElementById('inviteTeamSelect').value;
    const email = document.getElementById('inviteEmail').value;
    const role = document.getElementById('inviteRole').value;

    if (!teamId) {
        showMessage('Please select a team', true);
        return;
    }

    try {
        const response = await fetch(`/api/teams/${teamId}/invite`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ email, role })
        });

        const data = await response.json();

        if (data.success) {
            showMessage('Invitation sent successfully');
            hideModal('createInvitationModal');
            await fetchInvitations();
            renderInvitations();
        } else {
            throw new Error(data.error || 'Failed to send invitation');
        }
    } catch (error) {
        console.error('Error sending invitation:', error);
        showMessage(error.message, true);
    }
}

// Handle resending invitation
async function handleResendInvitation(invitationId) {
    try {
        const response = await fetch(`/api/teams/invitations/${invitationId}/resend`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            showMessage('Invitation resent successfully');
            await fetchInvitations();
            renderInvitations();
        } else {
            throw new Error(data.error || 'Failed to resend invitation');
        }
    } catch (error) {
        console.error('Error resending invitation:', error);
        showMessage('Failed to resend invitation: ' + error.message, true);
    }
}

// Handle deleting invitation
async function handleDeleteInvitation(invitationId) {
    if (!confirm('Are you sure you want to delete this invitation?')) return;

    try {
        const response = await fetch(`/api/teams/invitations/${invitationId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const data = await response.json();

        if (data.success) {
            showMessage('Invitation deleted successfully');
            await fetchInvitations();
            renderInvitations();
        } else {
            throw new Error(data.error || 'Failed to delete invitation');
        }
    } catch (error) {
        console.error('Error deleting invitation:', error);
        showMessage('Failed to delete invitation: ' + error.message, true);
    }
}

// Handle invitation link generation and copying
function setupInvitationLinkHandlers() {
    const inviteTabs = document.querySelectorAll('.invite-tab');
    const tabContents = document.querySelectorAll('.invite-tab-content');
    const generateLinkBtn = document.getElementById('generateLinkBtn');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    const invitationLinkInput = document.getElementById('invitationLink');

    // Tab switching
    inviteTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            inviteTabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(`${tabId}InviteTab`).classList.add('active');
        });
    });

    // Generate invitation link
    generateLinkBtn.addEventListener('click', async () => {
        const teamId = document.getElementById('inviteLinkTeamSelect').value;
        const role = document.getElementById('inviteLinkRole').value;
        const expiryHours = document.getElementById('inviteLinkExpiry').value;

        if (!teamId) {
            showMessage('Please select a team', true);
            return;
        }

        try {
            console.log('Generating invitation link:', {
                teamId,
                role,
                expiryHours
            });

            const response = await fetch(`/api/teams/${teamId}/invite-link`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    role,
                    expiryHours: parseInt(expiryHours)
                })
            });

            // Log the raw response for debugging
            const responseText = await response.text();
            console.log('Raw server response:', responseText);

            // Try to parse the response as JSON
            let data;
            try {
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Error parsing response:', parseError);
                throw new Error('Server returned invalid response. Please try again.');
            }

            if (data.success) {
                const inviteUrl = `${window.location.origin}/join/${data.token}`;
                invitationLinkInput.value = inviteUrl;
                showMessage('Invitation link generated successfully');
            } else {
                throw new Error(data.error || 'Failed to generate invitation link');
            }
        } catch (error) {
            console.error('Error generating invitation link:', error);
            if (error.message.includes('Not authorized')) {
                showMessage('You do not have permission to generate invitation links for this team', true);
            } else {
                showMessage(error.message, true);
            }
        }
    });

    // Copy invitation link
    copyLinkBtn.addEventListener('click', async () => {
        if (!invitationLinkInput.value) {
            showMessage('Please generate an invitation link first', true);
            return;
        }

        try {
            await navigator.clipboard.writeText(invitationLinkInput.value);
            showMessage('Invitation link copied to clipboard');
        } catch (error) {
            console.error('Error copying link:', error);
            showMessage('Failed to copy link to clipboard', true);
        }
    });
}

// Handle invitation creation
async function handleCreateInvitation(teamId) {
    showModal('inviteUserModal');
    document.getElementById('inviteTeamId').value = teamId;
    
    // Reset form
    document.getElementById('inviteUserForm').reset();
    document.getElementById('invitationLink').value = '';
    
    // Get team name for modal title
    const team = state.teams.find(t => t._id === teamId);
    if (team) {
        document.getElementById('inviteTeamName').textContent = team.name;
    }
}

// New functions for invitation handling
function showCreateInvitationModal() {
    // Populate team selects
    const teams = state.allTeams || [];
    const teamOptions = teams.map(team => 
        `<option value="${team._id}">${team.name}</option>`
    ).join('');

    if (elements.inviteTeamSelect) {
        elements.inviteTeamSelect.innerHTML = `
            <option value="">Select a team</option>
            ${teamOptions}
        `;
    }

    if (elements.inviteLinkTeamSelect) {
        elements.inviteLinkTeamSelect.innerHTML = `
            <option value="">Select a team</option>
            ${teamOptions}
        `;
    }

    // Reset forms and switch to email tab
    document.getElementById('inviteUserForm')?.reset();
    document.getElementById('invitationLink').value = '';
    switchInvitationTab('email');

    // Show modal
    showModal('createInvitationModal');
}

function switchInvitationTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.invite-tab').forEach(tab => {
        tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
    });

    // Update tab contents
    document.querySelectorAll('.invite-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabId}InviteTab`);
    });
}

async function handleGenerateInviteLink() {
    const teamId = document.getElementById('inviteLinkTeamSelect').value;
    const role = document.getElementById('inviteLinkRole').value;
    const expiryHours = document.getElementById('inviteLinkExpiry').value;

    if (!teamId) {
        showMessage('Please select a team', true);
        return;
    }

    try {
        const response = await fetch(`/api/teams/${teamId}/invite-link`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                role,
                expiryHours: parseInt(expiryHours)
            })
        });

        const data = await response.json();

        if (data.success) {
            const inviteUrl = `${window.location.origin}/join/${data.token}`;
            document.getElementById('invitationLink').value = inviteUrl;
            showMessage('Invitation link generated successfully');
        } else {
            throw new Error(data.error || 'Failed to generate invitation link');
        }
    } catch (error) {
        console.error('Error generating invitation link:', error);
        showMessage(error.message, true);
    }
}

async function handleCopyInviteLink() {
    const linkInput = document.getElementById('invitationLink');
    if (!linkInput.value) {
        showMessage('Please generate an invitation link first', true);
        return;
    }

    try {
        await navigator.clipboard.writeText(linkInput.value);
        showMessage('Invitation link copied to clipboard');
    } catch (error) {
        console.error('Error copying link:', error);
        showMessage('Failed to copy link to clipboard', true);
    }
}

// Debug function to log important information
function logDebug(category, message, data = {}) {
    // Only log in development mode
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log(`[${category}] ${message}`, data);
    }
}

// Simplified troubleshooting function
function troubleshootChatDisplay() {
    if (state.currentTeamChat && (!state.messages || state.messages.length === 0)) {
        logDebug('Troubleshoot', 'No messages in state, fetching messages for current team');
        handleTeamChatChange({target: {value: state.currentTeamChat}});
    } else if (state.messages && state.messages.length > 0) {
        renderMessages();
    }
}
