const nodemailer = require('nodemailer');

/**
 * Configure email transporter based on environment
 * For production, use actual email service
 * For development, use ethereal (fake SMTP service)
 */
const createTransporter = async () => {
    // For production
    if (process.env.NODE_ENV === 'production') {
        return nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: process.env.EMAIL_PORT,
            secure: process.env.EMAIL_SECURE === 'true',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            }
        });
    } 
    
    // For development - use ethereal
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
            user: testAccount.user,
            pass: testAccount.pass
        }
    });
};

/**
 * Send an email
 * @param {Object} options - Email options
 * @param {String} options.to - Recipient email
 * @param {String} options.subject - Email subject
 * @param {String} options.text - Plain text content
 * @param {String} options.html - HTML content
 * @returns {Promise<Object>} - Email send info
 */
exports.sendEmail = async (options) => {
    try {
        const transporter = await createTransporter();
        
        const mailOptions = {
            from: `"Team Management System" <${process.env.EMAIL_FROM || 'noreply@teammanagement.com'}>`,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html
        };
        
        const info = await transporter.sendMail(mailOptions);
        
        // Log the preview URL for development
        if (process.env.NODE_ENV !== 'production') {
            console.log('Email Preview URL: %s', nodemailer.getTestMessageUrl(info));
        }
        
        return info;
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};

/**
 * Send an invitation email
 * @param {Object} options - Invitation options
 * @param {String} options.email - Recipient email
 * @param {String} options.teamName - Team name
 * @param {String} options.inviterName - Name of the user who sent the invitation
 * @param {String} options.token - Invitation token
 * @param {String} options.role - Invited role
 * @returns {Promise<Object>} - Email send info
 */
exports.sendInvitationEmail = async (options) => {
    const { email, teamName, inviterName, token, role } = options;
    
    const inviteUrl = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/join?token=${token}`;
    
    const subject = `Invitation to join ${teamName} team`;
    
    const text = `
        Hello,

        You have been invited by ${inviterName} to join the ${teamName} team as a ${role}.
        
        Please click the link below to accept the invitation:
        ${inviteUrl}
        
        This link will expire in 7 days.
        
        If you did not request this invitation, please ignore this email.
        
        Best regards,
        Team Management System
    `;
    
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e9e9e9; border-radius: 5px;">
            <h2 style="color: #333; margin-bottom: 20px;">Team Invitation</h2>
            
            <p>Hello,</p>
            
            <p>You have been invited by <strong>${inviterName}</strong> to join the <strong>${teamName}</strong> team as a <strong>${role}</strong>.</p>
            
            <div style="margin: 30px 0; text-align: center;">
                <a href="${inviteUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-weight: bold;">
                    Accept Invitation
                </a>
            </div>
            
            <p style="color: #777; font-size: 14px;">This invitation link will expire in 7 days.</p>
            
            <p style="color: #777; font-size: 14px;">If you did not request this invitation, please ignore this email.</p>
            
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9e9e9; color: #777; font-size: 12px;">
                <p>Best regards,<br>Team Management System</p>
            </div>
        </div>
    `;
    
    return this.sendEmail({
        to: email,
        subject,
        text,
        html
    });
}; 