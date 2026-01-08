// utils/mailer.js
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";

dotenv.config();

// ===============================
// SENDGRID SETUP
// ===============================
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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
// SEND EMAIL FUNCTION (AUTO DETECT TYPE)
// ===============================
export async function sendAccountEmail(user, newPassword = null) {
  try {
    // Auto-detect email type
    const type = newPassword ? "reset" : "create";

    const html =
      type === "create"
        ? buildAccountCreationEmailTemplate(user)
        : buildPasswordResetEmailTemplate(user, newPassword);

    const msg = {
      to: user.email,
      from: process.env.EMAIL_FROM, // Verified SendGrid sender
      subject:
        type === "create"
          ? "Your EndoNurseVR LMS Account Details"
          : "Your EndoNurseVR LMS Password Has Been Reset",
      html,
    };

    await sgMail.send(msg);
    console.log(`✅ ${type === "create" ? "Account" : "Password reset"} email sent to ${user.email}`);
    return { success: true };
  } catch (error) {
    console.error("❌ Email send failed:", error.response?.body || error.message);
    return { success: false, error: error.message };
  }
};
