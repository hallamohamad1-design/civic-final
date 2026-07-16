import nodemailer from "nodemailer";

const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = parseInt(process.env.SMTP_PORT || "465", 10);
const smtpSecure = process.env.SMTP_SECURE !== "false";
const smtpUser = (process.env.SMTP_USER || "").trim();
const smtpPass = (process.env.SMTP_PASS || "").trim();

if (!smtpUser || !smtpPass) {
  console.warn(
    "[Email] WARNING: SMTP_USER or SMTP_PASS is not set. OTP emails will fail. " +
      "Set these environment variables to enable real email delivery.",
  );
}

// Diagnostic: confirm credentials are loaded at module init time
console.log(
  `[Email] SMTP config loaded — host: ${smtpHost}, port: ${smtpPort}, secure: ${smtpSecure}, ` +
    `SMTP_USER present: ${!!smtpUser}, SMTP_PASS present: ${!!smtpPass}, ` +
    `SMTP_PASS length: ${smtpPass.length}`,
);

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

/**
 * Sends the OTP code to the user's email via Nodemailer.
 * The code expires in 10 minutes.
 */
export async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  // Server-side debug log (never sent to client)
  console.log(`\n🔑 [OTP EMAIL] Sending code to ${normalizedEmail}\n`);

  const senderAddress = smtpUser || "noreply@civicpulse.app";

  const mailOptions = {
    from: `"CivicPulse" <${senderAddress}>`,
    to: normalizedEmail,
    subject: "Your CivicPulse Verification Code",
    text: `Your CivicPulse verification code is: ${otp}\n\nThis code expires in 10 minutes. If you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #1d4ed8; margin: 0 0 16px;">Verify Your Email</h2>
        <p style="font-size: 16px; color: #374151; line-height: 1.6; margin: 0 0 24px;">
          Use the code below to complete your CivicPulse sign-up. It is valid for
          <strong>10 minutes</strong>.
        </p>
        <div style="font-size: 40px; font-weight: 800; letter-spacing: 10px; text-align: center; padding: 20px; background: #f0f9ff; border: 2px solid #bae6fd; border-radius: 10px; color: #0369a1; margin: 0 0 24px;">
          ${otp}
        </div>
        <p style="font-size: 13px; color: #6b7280; margin: 0 0 24px;">
          If you did not create a CivicPulse account, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 16px;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
          CivicPulse — Civic Engagement Platform
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[Email] ✅ OTP email sent to ${normalizedEmail}. Message ID: ${info.messageId}`,
    );
  } catch (error) {
    console.error(`[Email] ❌ Failed to send OTP email to ${normalizedEmail}:`, error);
    // Re-throw so the caller (otpService) can surface the failure
    throw error;
  }
}


/**
 * Sends a password-reset link to the user's email via Nodemailer.
 * The link expires in 30 minutes.
 */
export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  console.log(`\n🔒 [PASSWORD RESET] Sending reset link to ${normalizedEmail}\n`);

  const senderAddress = smtpUser || "noreply@civicpulse.app";

  const mailOptions = {
    from: `"CivicPulse" <${senderAddress}>`,
    to: normalizedEmail,
    subject: "Reset Your CivicPulse Password",
    text:
      `You requested a password reset for your CivicPulse account.\n\n` +
      `Click the link below to set a new password. It expires in 30 minutes.\n\n` +
      `${resetUrl}\n\n` +
      `If you did not request this, you can safely ignore this email. ` +
      `Your password will not change.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #1d4ed8; margin: 0 0 16px;">Reset Your Password</h2>
        <p style="font-size: 16px; color: #374151; line-height: 1.6; margin: 0 0 24px;">
          We received a request to reset the password for your CivicPulse account.
          Click the button below to choose a new password.
          This link is valid for <strong>30 minutes</strong>.
        </p>
        <div style="text-align: center; margin: 0 0 24px;">
          <a href="${resetUrl}"
             style="display: inline-block; background: #1d4ed8; color: #ffffff; font-size: 16px;
                    font-weight: 700; padding: 14px 32px; border-radius: 8px;
                    text-decoration: none; letter-spacing: 0.3px;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 13px; color: #6b7280; margin: 0 0 16px;">
          Or copy and paste this URL into your browser:<br/>
          <a href="${resetUrl}" style="color: #1d4ed8; word-break: break-all;">${resetUrl}</a>
        </p>
        <p style="font-size: 13px; color: #6b7280; margin: 0 0 24px;">
          If you did not request a password reset, you can safely ignore this email.
          Your password will remain unchanged.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 16px;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
          CivicPulse — Civic Engagement Platform
        </p>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[Email] ✅ Password reset email sent to ${normalizedEmail}. Message ID: ${info.messageId}`,
    );
  } catch (error) {
    console.error(`[Email] ❌ Failed to send password reset email to ${normalizedEmail}:`, error);
    throw error;
  }
}

/**
 * Sends a password-reset OTP code to the user's email via Nodemailer.
 * The code expires in 10 minutes.
 */
export async function sendPasswordResetOtpEmail(
  email: string,
  otp: string,
): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  console.log(`\n🔒 [PASSWORD RESET OTP] Sending OTP to ${normalizedEmail}\n`);

  const senderAddress = smtpUser || "noreply@civicpulse.app";

  const mailOptions = {
    from: `"CivicPulse" <${senderAddress}>`,
    to: normalizedEmail,
    subject: "Your CivicPulse Password Reset Code",
    text: `Your CivicPulse password reset code is: ${otp}\n\nThis code expires in 10 minutes. If you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 32px; max-width: 560px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #1d4ed8; margin: 0 0 16px;">Password Reset Code</h2>
        <p style="font-size: 16px; color: #374151; line-height: 1.6; margin: 0 0 24px;">
          We received a request to reset the password for your CivicPulse account.
          Use the code below to complete your password reset.
          This code is valid for <strong>10 minutes</strong>.
        </p>
        <div style="font-size: 40px; font-weight: 800; letter-spacing: 10px; text-align: center; padding: 20px; background: #f0f9ff; border: 2px solid #bae6fd; border-radius: 10px; color: #0369a1; margin: 0 0 24px;">
          ${otp}
        </div>
        <p style="font-size: 13px; color: #6b7280; margin: 0 0 24px;">
          If you did not request a password reset, you can safely ignore this email.
          Your password will remain unchanged.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 0 0 16px;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
          CivicPulse — Civic Engagement Platform
        </p>
      </div>
    `,
  };

  console.log(`[Email] About to call transporter.sendMail() to ${normalizedEmail}`);
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(
      `[Email] ✅ Password reset OTP email sent to ${normalizedEmail}. Message ID: ${info.messageId}`,
    );
    console.log(`[Email] Response:`, JSON.stringify(info, null, 2));
  } catch (error) {
    console.error(`[Email] ❌ Failed to send password reset OTP email to ${normalizedEmail}:`, error);
    console.error(`[Email] Error details:`, JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    throw error;
  }
}
