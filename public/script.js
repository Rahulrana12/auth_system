document.addEventListener('DOMContentLoaded', async () => {
    // Check if we're already logged in
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const response = await fetch('/api/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            // Check if we received a valid JSON response
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                if (data.success && data.data) {
                    // If token is valid, redirect to dashboard
                    window.location.href = '/dashboard';
                    return;
                }
            }
            
            // If we reach here, token is invalid
            console.warn('Invalid authentication token detected');
            localStorage.removeItem('token');
        } catch (error) {
            console.error('Auth check error:', error);
            localStorage.removeItem('token');
        }
    }

    // Function to show message (success or error)
    const showMessage = (message, isError = false) => {
        // Remove existing messages of the same type
        const existingMessages = document.querySelectorAll(`.message.${isError ? 'error' : 'success'}-message`);
        existingMessages.forEach(msg => {
            msg.classList.remove('show');
            setTimeout(() => msg.remove(), 300);
        });

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isError ? 'error-message' : 'success-message'}`;
        
        // Create icon element
        const icon = document.createElement('i');
        icon.className = `fas ${isError ? 'fa-exclamation-circle' : 'fa-check-circle'}`;
        messageDiv.appendChild(icon);
        
        // Create text element
        const text = document.createElement('span');
        text.textContent = message;
        messageDiv.appendChild(text);
        
        document.body.appendChild(messageDiv);

        // Ensure the message is positioned correctly
        const computedStyle = window.getComputedStyle(messageDiv);
        const height = messageDiv.offsetHeight;
        const margin = parseInt(computedStyle.marginBottom);
        const totalHeight = height + margin;

        // Position the message
        const existingVisibleMessages = document.querySelectorAll('.message.show');
        const offset = existingVisibleMessages.length * totalHeight;
        messageDiv.style.bottom = `${20 + offset}px`;

        // Animate in
        requestAnimationFrame(() => {
            messageDiv.classList.add('show');
        });

        // Remove after delay
        const timeout = setTimeout(() => {
            messageDiv.classList.remove('show');
            messageDiv.addEventListener('transitionend', () => {
                messageDiv.remove();
                // Reposition remaining messages
                document.querySelectorAll('.message.show').forEach((msg, index) => {
                    msg.style.bottom = `${20 + (index * totalHeight)}px`;
                });
            }, { once: true });
        }, 3000);

        // Store timeout ID for potential early removal
        messageDiv.dataset.timeoutId = timeout;

        // Add click to dismiss
        messageDiv.addEventListener('click', () => {
            clearTimeout(timeout);
            messageDiv.classList.remove('show');
            setTimeout(() => messageDiv.remove(), 300);
        });
    };

    try {
        // Get DOM elements with error handling
        const container = document.getElementById('container') || document.querySelector('.container');
        if (!container) throw new Error('Container element not found');

        const toggleBtn = document.getElementById('toggleBtn');
        if (!toggleBtn) throw new Error('Toggle button not found');

        const welcomeTitle = document.getElementById('welcome-title');
        if (!welcomeTitle) throw new Error('Welcome title not found');

        const welcomeText = document.getElementById('welcome-text');
        if (!welcomeText) throw new Error('Welcome text not found');

        const loginForm = document.getElementById('loginForm');
        if (!loginForm) throw new Error('Login form not found');

        const registerForm = document.getElementById('registerForm');
        if (!registerForm) throw new Error('Register form not found');

        const themeToggle = document.getElementById('themeToggle');
        if (!themeToggle) throw new Error('Theme toggle not found');

        const icon = themeToggle.querySelector('i');
        if (!icon) throw new Error('Theme toggle icon not found');

        // Theme functionality
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-mode');
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        }

        // Theme Toggle
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            if (document.body.classList.contains('light-mode')) {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
                localStorage.setItem('theme', 'light');
            } else {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
                localStorage.setItem('theme', 'dark');
            }
        });

        // Toggle between login and register
        toggleBtn.addEventListener('click', () => {
            container.classList.toggle('register-mode');
            
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
            
            try {
                const emailInput = loginForm.querySelector('input[name="email"]');
                const passwordInput = loginForm.querySelector('input[name="password"]');

                if (!emailInput || !passwordInput) {
                    showMessage('Form inputs not found', true);
                    return;
                }

                const email = emailInput.value.trim();
                const password = passwordInput.value;

                // Basic validation
                if (!email) {
                    showMessage('Please enter your email', true);
                    emailInput.focus();
                    return;
                }

                if (!email.includes('@')) {
                    showMessage('Please enter a valid email address', true);
                    emailInput.focus();
                    return;
                }

                if (!password) {
                    showMessage('Please enter your password', true);
                    passwordInput.focus();
                    return;
                }

                try {
                    console.log('Attempting login for:', email);
                    
                    // Show loading message
                    showMessage('Logging in...');
                    
                    // Clear any previous error state
                    const errorElements = document.querySelectorAll('.retry-message');
                    errorElements.forEach(el => el.remove());
                    
                    // Prepare the request
                    const loginData = { email, password };
                    console.log('Login data:', JSON.stringify(loginData));
                    
                    const response = await fetch('/api/login', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify(loginData)
                    });

                    console.log('Login response status:', response.status);
                    console.log('Response headers:', Object.fromEntries([...response.headers.entries()]));
                    
                    if (response.status === 404) {
                        throw new Error("Login API endpoint not found. Please check server configuration.");
                    }
                    
                    if (response.status === 429) {
                        throw new Error("Too many login attempts. Please wait a while and try again.");
                    }

                    // Check if the response is JSON
                    const contentType = response.headers.get('content-type');
                    if (!contentType || !contentType.includes('application/json')) {
                        console.error('Invalid content type:', contentType);
                        
                        // Try an alternative approach - sometimes servers return text/html incorrectly
                        try {
                            // Try to parse the response as text and then convert to JSON
                            const textResponse = await response.text();
                            console.log('Text response:', textResponse.substring(0, 100) + '...');
                            
                            // Check if the text response looks like JSON
                            if (textResponse.trim().startsWith('{') && textResponse.trim().endsWith('}')) {
                                console.log('Attempting to parse text response as JSON');
                                const data = JSON.parse(textResponse);
                                console.log('Parsed data:', data);
                                
                                if (data.success && data.token) {
                                    console.log('Login successful via text/json parsing');
                                    // Store token securely
                                    localStorage.setItem('token', data.token);
                                    showMessage('Login successful! Redirecting to team management system...');
                                    loginForm.reset();
                                    
                                    // Redirect to dashboard
                                    setTimeout(() => {
                                        try {
                                            console.log('Redirecting to dashboard...');
                                            window.location.replace('/dashboard');
                                        } catch (error) {
                                            console.error('Redirect error:', error);
                                            // Fallback redirect
                                            window.location.href = '/dashboard.html';
                                        }
                                    }, 1000);
                                    return; // Important to prevent further error processing
                                }
                            } else {
                                console.error('Response is not JSON-like:', textResponse.substring(0, 100));
                            }
                        } catch (parseError) {
                            console.error('Error parsing text response:', parseError);
                        }
                        
                        // If we get here, the alternative approach didn't work
                        throw new Error('Server error: Expected JSON response but received different content type');
                    }

                    // Parse the JSON response
                    let data;
                    try {
                        data = await response.json();
                        console.log('Response data:', data);
                    } catch (error) {
                        console.error('Error parsing JSON:', error);
                        throw new Error('Failed to parse server response. Please try again.');
                    }

                    if (data.success && data.token) {
                        // Store token securely
                        localStorage.setItem('token', data.token);
                        
                        // Store user details if available
                        if (data.user) {
                            localStorage.setItem('user', JSON.stringify(data.user));
                            console.log('User data stored:', data.user);
                        }
                        
                        showMessage('Login successful! Redirecting to team management system...');
                        loginForm.reset();
                        
                        // Redirect to dashboard with a clear URL
                        setTimeout(() => {
                            try {
                                console.log('Redirecting to dashboard...');
                                window.location.replace('/dashboard');
                            } catch (error) {
                                console.error('Redirect error:', error);
                                // Fallback redirect
                                window.location.href = '/dashboard.html';
                            }
                        }, 1000);
                    } else {
                        console.error('Invalid response structure:', data);
                        throw new Error(data.error || 'Invalid response from server');
                    }
                } catch (error) {
                    // Network errors will be caught here
                    console.error('Fetch error:', error);
                    throw error;
                }
            } catch (error) {
                console.error('Login error:', error);
                
                // Provide a more user-friendly error message
                if (error.message.includes('content type')) {
                    showMessage('The server is not responding correctly. Please try again in a few seconds or contact support.', true);
                    
                    // Add a retry button
                    const retryMsg = document.createElement('div');
                    retryMsg.className = 'retry-message';
                    retryMsg.innerHTML = '<button id="retryLogin" class="retry-btn">Retry Login</button>';
                    document.body.appendChild(retryMsg);
                    
                    document.getElementById('retryLogin').addEventListener('click', () => {
                        retryMsg.remove();
                        // Re-trigger the form submission
                        console.log('Retrying login...');
                        loginForm.dispatchEvent(new Event('submit'));
                    });
                    
                } else if (error instanceof SyntaxError) {
                    showMessage('Could not connect to the authentication service. Please try again later.', true);
                } else if (error.message.includes('NetworkError') || error.message.includes('Failed to fetch')) {
                    showMessage('Network error. Please check your internet connection and try again.', true);
                } else if (error.message.includes('Invalid credentials')) {
                    showMessage('Invalid email or password. Please try again.', true);
                    // Focus on the password field for quick retry
                    const passwordInput = loginForm.querySelector('input[name="password"]');
                    if (passwordInput) {
                        passwordInput.value = '';
                        passwordInput.focus();
                    }
                } else if (error.message.includes('429') || error.message.includes('Too many')) {
                    showMessage('Too many login attempts. Please wait a moment before trying again.', true);
                } else {
                    showMessage(error.message || 'An error occurred during login', true);
                }
                
                // Log the error to the console
                console.group('Login Error Details');
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);
                console.groupEnd();
            }
        });

        // Handle register form submission
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            try {
                // Get form values
                const nameInput = registerForm.querySelector('input[name="name"]');
                const emailInput = registerForm.querySelector('input[name="email"]');
                const passwordInput = registerForm.querySelector('input[name="password"]');

                if (!nameInput || !emailInput || !passwordInput) {
                    showMessage('Form inputs not found', true);
                    return;
                }

                const name = nameInput.value.trim();
                const email = emailInput.value.trim();
                const password = passwordInput.value;

                // Enhanced validation
                if (!name) {
                    showMessage('Please enter your name', true);
                    nameInput.focus();
                    return;
                }

                if (name.length < 2) {
                    showMessage('Name must be at least 2 characters long', true);
                    nameInput.focus();
                    return;
                }

                if (!email) {
                    showMessage('Please enter your email', true);
                    emailInput.focus();
                    return;
                }

                if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                    showMessage('Please enter a valid email address', true);
                    emailInput.focus();
                    return;
                }

                if (!password) {
                    showMessage('Please enter a password', true);
                    passwordInput.focus();
                    return;
                }

                if (password.length < 6) {
                    showMessage('Password must be at least 6 characters long', true);
                    passwordInput.focus();
                    return;
                }

                // Show loading message
                showMessage('Creating your account...');

                try {
                    const response = await fetch('/api/register', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ name, email, password })
                    });

                    // Check if the response is JSON
                    const contentType = response.headers.get('content-type');
                    if (!contentType || !contentType.includes('application/json')) {
                        console.error('Invalid content type:', contentType);
                        throw new Error('Server error: Expected JSON response but received different content type');
                    }

                    const data = await response.json();

                    if (data.success) {
                        showMessage('Registration successful! Please login with your credentials.');
                        registerForm.reset();
                        
                        // Switch to login form with smooth transition
                        setTimeout(() => {
                            container.classList.remove('register-mode');
                            setTimeout(() => {
                                welcomeTitle.textContent = 'Hello, Welcome!';
                                welcomeText.textContent = "Don't have an account?";
                                toggleBtn.textContent = 'Register';
                            }, 200);
                        }, 1000);
                    } else {
                        throw new Error(data.error || 'Registration failed');
                    }
                } catch (error) {
                    // Network errors will be caught here
                    console.error('Fetch error:', error);
                    throw error;
                }
            } catch (error) {
                console.error('Registration error:', error);
                
                // Provide a more user-friendly error message
                if (error.message.includes('content type')) {
                    showMessage('The server is not responding correctly. Please try again later or contact support.', true);
                } else if (error instanceof SyntaxError) {
                    showMessage('Could not connect to the registration service. Please try again later.', true);
                } else {
                    showMessage(error.message || 'An error occurred during registration', true);
                }
            }
        });

        // Handle social login buttons
        const socialButtons = document.querySelectorAll('.social-btn');
        if (socialButtons) {
            socialButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    e.preventDefault();
                    const iconElement = button.querySelector('i');
                    if (iconElement && iconElement.className) {
                        const classes = iconElement.className.split(' ');
                        const platformClass = classes.find(cls => cls.startsWith('fa-'));
                        const platform = platformClass ? platformClass.replace('fa-', '') : 'social';
                        showMessage(`${platform} login integration coming soon!`);
                    } else {
                        showMessage('Social login coming soon!');
                    }
                });
            });
        }
    } catch (error) {
        console.error('Initialization error:', error.message);
        showMessage('Failed to initialize the page. Please refresh and try again.', true);
    }
});