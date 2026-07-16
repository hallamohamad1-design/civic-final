const nodemailer = require('nodemailer');
require('dotenv').config();

const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
const smtpPort = parseInt(process.env.SMTP_PORT || "465", 10);
const smtpSecure = process.env.SMTP_SECURE !== "false";
const smtpUser = (process.env.SMTP_USER || "").trim();
const smtpPass = (process.env.SMTP_PASS || "").trim();

console.log("=== SMTP Test Script ===");
console.log(`Host: ${smtpHost}`);
console.log(`Port: ${smtpPort}`);
console.log(`Secure: ${smtpSecure}`);
console.log(`User: ${smtpUser}`);
console.log(`Pass length: ${smtpPass.length}`);
console.log("========================\n");

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

async function testSmtp() {
  console.log("Step 1: Verifying SMTP connection...");
  try {
    await transporter.verify();
    console.log("✅ SMTP connection verified successfully!\n");
  } catch (error) {
    console.error("❌ SMTP verification failed:");
    console.error(error);
    process.exit(1);
  }

  console.log("Step 2: Sending test email...");
  const testEmail = smtpUser; // Send to the same account for testing
  const otp = "123456";
  
  const mailOptions = {
    from: `"CivicPulse Test" <${smtpUser}>`,
    to: testEmail,
    subject: "SMTP Test - CivicPulse OTP",
    text: `Test OTP code: ${otp}`,
    html: `<p>Test OTP code: <strong>${otp}</strong></p>`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Test email sent successfully!");
    console.log("Message ID:", info.messageId);
    console.log("Response:", JSON.stringify(info, null, 2));
  } catch (error) {
    console.error("❌ Failed to send test email:");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error code:", error.code);
    console.error("Full error:", error);
    process.exit(1);
  }
}

testSmtp().then(() => {
  console.log("\n=== Test Complete ===");
  process.exit(0);
}).catch((error) => {
  console.error("\n=== Test Failed ===");
  console.error(error);
  process.exit(1);
});
