# Team Management System

A comprehensive team management platform with real-time chat functionality, task management, and team collaboration features.

## Features

- **User Authentication**
  - Secure login and registration
  - Role-based access control (Admin, Manager, Employee)
  - JWT token authentication

- **Team Management**
  - Create and manage teams
  - Invite members via email or invitation links
  - Role-based team permissions

- **Real-time Chat**
  - WebSocket-based team chat
  - Message history
  - Typing indicators and online status

- **Task Management**
  - Create and assign tasks
  - Track task status
  - Filter tasks by status

- **Admin Dashboard**
  - User management
  - Team oversight
  - Invitation tracking

## Technology Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express.js
- **Database**: MongoDB
- **Real-time Communication**: WebSockets
- **Authentication**: JWT

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/Rahulrana12/auth_system.git
   cd auth_system
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:
   ```
   PORT=5000
   MONGODB_URI=mongodb://127.0.0.1:27017/teamManagement
   JWT_SECRET=your_jwt_secret_key
   EMAIL_SERVICE=your_email_service
   EMAIL_USER=your_email
   EMAIL_PASS=your_email_password
   ```

4. Start the server:
   ```
   node server.js
   ```

5. Access the application at `http://localhost:5000`

## Usage

1. **Registration and Login**
   - Create an account or log in using existing credentials
   - Admins can create additional users

2. **Teams**
   - Create teams and add members
   - View team details and manage team members

3. **Chat**
   - Select a team to chat with members
   - Send and receive real-time messages

4. **Tasks**
   - Create tasks and assign them to team members
   - Update task status and track progress

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.