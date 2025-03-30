document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('container');
    const toggleBtn = document.getElementById('toggleBtn');
    const welcomeTitle = document.getElementById('welcome-title');
    const welcomeText = document.getElementById('welcome-text');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    // Function to show message (success or error)
    const showMessage = (message, isError = false) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = isError ? 'error-message' : 'success-message';
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${isError ? '#ff3333' : '#4CAF50'};
            color: white;
            padding: 15px 25px;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 1000;
            opacity: 0;
            transform: translateY(-20px);
            transition: all 0.3s ease;
        `;
        messageDiv.textContent = message;
        document.body.appendChild(messageDiv);

        // Animate in
        setTimeout(() => {
            messageDiv.style.opacity = '1';
            messageDiv.style.transform = 'translateY(0)';
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            messageDiv.style.opacity = '0';
            messageDiv.style.transform = 'translateY(-20px)';
            setTimeout(() => messageDiv.remove(), 300);
        }, 3000);
    };

    // Toggle between login and register
    toggleBtn.addEventListener('click', () => {
        container.classList.toggle('register-mode');
        
        // Update welcome side content with animation
        if (container.classList.contains('register-mode')) {
            setTimeout(() => {
                welcomeTitle.textContent = 'Welcome Back!';
                welcomeText.textContent = 'Already have an account?';
                toggleBtn.textContent = 'Login';
            }, 200);
        } else {
            setTimeout(() => {
                welcomeTitle.textContent = 'Hello, Welcome!';
                welcomeText.textContent = "Don't have an account?";
                toggleBtn.textContent = 'Register';
            }, 200);
        }
    });

    // Handle login form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.querySelector('input[name="email"]').value;
        const password = loginForm.querySelector('input[name="password"]').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password }),
                credentials: 'include'
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem('token', data.token);
                showMessage('Login successful! Welcome back.');
                loginForm.reset();
            } else {
                showMessage(data.error || 'Login failed', true);
            }
        } catch (error) {
            console.error('Login error:', error);
            showMessage('An error occurred during login', true);
        }
    });

    // Handle register form submission
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = registerForm.querySelector('input[name="name"]').value;
        const email = registerForm.querySelector('input[name="email"]').value;
        const password = registerForm.querySelector('input[name="password"]').value;

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, password }),
                credentials: 'include'
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem('token', data.token);
                showMessage('Registration successful! Account created.');
                registerForm.reset();
                
                // Switch to login mode with animation
                setTimeout(() => {
                    container.classList.remove('register-mode');
                    setTimeout(() => {
                        welcomeTitle.textContent = 'Welcome Back!';
                        welcomeText.textContent = 'Please login with your new account';
                        toggleBtn.textContent = 'Register';
                    }, 200);
                }, 1500);
            } else {
                showMessage(data.error || 'Registration failed', true);
            }
        } catch (error) {
            console.error('Registration error:', error);
            showMessage('An error occurred during registration', true);
        }
    });

    // Handle social login buttons
    const socialButtons = document.querySelectorAll('.social-btn');
    socialButtons.forEach(button => {
        button.addEventListener('click', () => {
            const platform = button.querySelector('i').className.split('-')[2];
            showMessage(`${platform} login integration coming soon!`);
        });
    });

    // Check if user is already logged in
    const checkAuthStatus = async () => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const response = await fetch('/api/me', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    credentials: 'include'
                });

                const data = await response.json();
                if (data.success) {
                    showMessage(`Welcome back, ${data.data.name}!`);
                }
            } catch (error) {
                console.error('Auth check error:', error);
                localStorage.removeItem('token');
            }
        }
    };

    // Check auth status on page load
    checkAuthStatus();
}); 