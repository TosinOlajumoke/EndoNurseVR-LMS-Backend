// utils/mailer.js
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config(); // Load environment variables

// ===============================
// SMTP TRANSPORTER (GMAIL / RENDER SAFE)
// ===============================
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 587, // STARTTLS
  secure: false, // MUST be false for port 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // Gmail App Password
  },
  tls: {
    rejectUnauthorized: false,
  },
});

// Verify SMTP connection (runs once on boot)
transporter.verify((error) => {
  if (error) {
    console.error("❌ SMTP connection failed:", error);
  } else {
    console.log("✅ SMTP server is ready to send emails");
  }
});

// ===============================
// ACCOUNT CREATION EMAIL TEMPLATE
// ===============================
export function buildAccountCreationEmailTemplate(user) {
  const { first_name, last_name, email, role, trainee_id, password_plain } = user;
  const greeting = first_name
    ? `Dear ${first_name} ${last_name || ""},`
    : "Dear User,";
  const year = new Date().getFullYear();

  const credentials =
    role === "trainee"
      ? `
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Password:</strong> ${password_plain}</p>
        <p><strong>Trainee ID:</strong> ${trainee_id}</p>
      `
      : `
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Password:</strong> ${password_plain}</p>
      `;

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>EndoNurseVR LMS Account Created</title>
  </head>
  <body style="margin:0;padding:0;background-color:#e9f2f5;font-family:Arial,sans-serif;">
    <div style="padding:20px;">
      <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:10px;padding:30px;box-shadow:0 3px 10px rgba(0,0,0,0.1);">
        <div style="text-align:center;margin-bottom:10px;">
          <img src="https://drive.google.com/uc?export=view&id=1ErsoCRSSitylpDB-TZeIXwlU_Js8SMMS"
               alt="EndoNurseVR Logo"
               style="width:120px;height:auto;margin-bottom:10px;" />
        </div>

        <h2 style="text-align:center;color:#0c4a6e;margin-bottom:15px;">
          EndoNurseVR Learning Management System
        </h2>

        <p style="color:#333;font-size:15px;line-height:1.6;">${greeting}</p>

        <p style="color:#333;font-size:15px;line-height:1.6;">
          Your account has been successfully created on the EndoNurseVR LMS platform.
          Below are your login details:
        </p>

        <div style="background-color:#f9fafb;border:1px solid #e0e0e0;border-radius:8px;padding:15px;margin:20px 0;">
          ${credentials}
        </div>

        <div style="text-align:center;margin-top:30px;">
          <a href="https://endonursevr-lms.com/login"
             style="background-color:#766EA9;color:#ffffff;text-decoration:none;padding:12px 25px;border-radius:6px;font-size:15px;display:inline-block;">
            Go to Login
          </a>
        </div>

        <p style="font-size:13px;color:#555;text-align:center;margin-top:30px;">
          Best Regards,<br/>
          <strong>EndoNurseVR Learning Management System</strong><br/>
          © ${year}
        </p>
      </div>
    </div>
  </body>
  </html>
  `;
}

// ===============================
// PASSWORD RESET EMAIL TEMPLATE
// ===============================
export function buildPasswordResetEmailTemplate(user, newPassword) {
  const { first_name, last_name, email } = user;
  const greeting = first_name
    ? `Dear ${first_name} ${last_name || ""},`
    : "Dear User,";
  const year = new Date().getFullYear();

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Password Reset</title>
  </head>
  <body style="margin:0;padding:0;background-color:#e9f2f5;font-family:Arial,sans-serif;">
    <div style="padding:20px;">
      <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:10px;padding:30px;box-shadow:0 3px 10px rgba(0,0,0,0.1);">

        <h2 style="text-align:center;color:#0c4a6e;">Password Reset Successful</h2>

        <p>${greeting}</p>

        <div style="background-color:#f9fafb;border:1px solid #e0e0e0;border-radius:8px;padding:15px;margin:20px 0;">
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>New Password:</strong> ${newPassword}</p>
        </div>

        <div style="text-align:center;">
          <a href="https://endonursevr-lms.com/login"
             style="background-color:#766EA9;color:#ffffff;text-decoration:none;padding:12px 25px;border-radius:6px;">
            Login Now
          </a>
        </div>

        <p style="font-size:13px;color:#555;text-align:center;margin-top:30px;">
          © ${year} EndoNurseVR LMS
        </p>
      </div>
    </div>
  </body>
  </html>
  `;
}

// ===============================
// SEND EMAIL FUNCTION
// ===============================
export async function sendAccountEmail(user, type, newPassword = null) {
  try {
    let html;

    if (type === "create") {
      html = buildAccountCreationEmailTemplate(user);
    } else if (type === "reset") {
      html = buildPasswordResetEmailTemplate(user, newPassword);
    } else {
      throw new Error("Invalid email type");
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || `EndoNurseVR LMS <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject:
        type === "create"
          ? "Your EndoNurseVR LMS Account Details"
          : "Your EndoNurseVR LMS Password Has Been Reset",
      html,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Email sent:", info.messageId);
    return { success: true };
  } catch (error) {
    console.error("❌ Email send failed:", error);
    return { success: false, error: error.message };
  }
}
