// Team Management Functions
async function loadTeams() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/teams', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();
        if (data.success) {
            displayTeams(data.teams);
        } else {
            showMessage(data.error || 'Failed to load teams', true);
        }
    } catch (error) {
        console.error('Error loading teams:', error);
        showMessage('Failed to load teams', true);
    }
}

function displayTeams(teams) {
    const teamGrid = document.getElementById('teamGrid');
    teamGrid.innerHTML = '';

    teams.forEach(team => {
        const teamCard = createTeamCard(team);
        teamGrid.appendChild(teamCard);
    });
}

function createTeamCard(team) {
    const card = document.createElement('div');
    card.className = 'team-card';
    card.innerHTML = `
        <div class="team-card-header">
            <h3 class="team-card-title">${team.name}</h3>
            <div class="team-card-actions">
                <button onclick="editTeam('${team._id}')" title="Edit Team">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="deleteTeam('${team._id}')" title="Delete Team">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        <p class="team-description">${team.description || 'No description'}</p>
        <ul class="team-members">
            ${team.members.map(member => `
                <li class="team-member">
                    <div class="member-avatar">
                        ${member.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="member-info">
                        <div class="member-name">${member.name}</div>
                        <div class="member-role">${member.role || 'Member'}</div>
                    </div>
                </li>
            `).join('')}
        </ul>
    `;
    return card;
}

// Modal Functions
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'flex';
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'none';
}

// Function to show message (success or error)
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

// Check authentication on page load
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }

    // Show team container
    const teamContainer = document.querySelector('.team-container');
    if (teamContainer) {
        teamContainer.style.display = 'block';
    }

    // Load teams
    await loadTeams();

    // Add Team Button
    const addTeamBtn = document.getElementById('addTeamBtn');
    const addTeamModal = document.getElementById('addTeamModal');
    const closeModal = document.getElementById('closeModal');
    const cancelAddTeam = document.getElementById('cancelAddTeam');
    const addTeamForm = document.getElementById('addTeamForm');

    if (addTeamBtn) {
        addTeamBtn.addEventListener('click', () => showModal('addTeamModal'));
    }

    if (closeModal) {
        closeModal.addEventListener('click', () => hideModal('addTeamModal'));
    }

    if (cancelAddTeam) {
        cancelAddTeam.addEventListener('click', () => hideModal('addTeamModal'));
    }

    if (addTeamForm) {
        addTeamForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const teamName = document.getElementById('teamName').value;
            const teamDescription = document.getElementById('teamDescription').value;

            try {
                const token = localStorage.getItem('token');
                const response = await fetch('/api/teams', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ name: teamName, description: teamDescription })
                });

                const data = await response.json();
                if (data.success) {
                    showMessage('Team created successfully!');
                    hideModal('addTeamModal');
                    addTeamForm.reset();
                    loadTeams();
                } else {
                    showMessage(data.error || 'Failed to create team', true);
                }
            } catch (error) {
                console.error('Error creating team:', error);
                showMessage('Failed to create team', true);
            }
        });
    }

    // Logout Button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            showMessage('Logged out successfully!');
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        });
    }
});

// Team Management Functions
async function editTeam(teamId) {
    // Implement edit team functionality
    showMessage('Edit team functionality coming soon!');
}

async function deleteTeam(teamId) {
    if (confirm('Are you sure you want to delete this team?')) {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/teams/${teamId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();
            if (data.success) {
                showMessage('Team deleted successfully!');
                loadTeams();
            } else {
                showMessage(data.error || 'Failed to delete team', true);
            }
        } catch (error) {
            console.error('Error deleting team:', error);
            showMessage('Failed to delete team', true);
        }
    }
} 