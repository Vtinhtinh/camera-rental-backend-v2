const nodemailer = require('nodemailer');

const createTransporter = () => {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

const sendEmail = async ({ to, subject, html }) => {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Camera Rental" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error('Email send error:', error.message);
    return false;
  }
};

const sendResetPasswordEmail = async (email, name, resetCode) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:30px 15px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);padding:32px;text-align:center;">
              <h1 style="color:#ffffff;font-size:24px;margin:0;">Camera Rental</h1>
              <p style="color:#bfdbfe;font-size:14px;margin:8px 0 0;">Hệ thống cho thuê máy ảnh</p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 32px;">
              <h2 style="color:#1f2937;font-size:20px;margin:0 0 16px;">Xin chào ${name || email},</h2>
              <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
                Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn tại <strong>Camera Rental</strong>.
              </p>
              <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px;">
                Dưới đây là mã xác nhận của bạn:
              </p>
              <!-- Code Box -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:#eff6ff;border:2px dashed #3b82f6;border-radius:8px;padding:24px;text-align:center;">
                    <p style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Mã xác nhận</p>
                    <p style="color:#1e3a8a;font-size:32px;font-weight:bold;letter-spacing:8px;margin:0;">${resetCode}</p>
                  </td>
                </tr>
              </table>
              <!-- Warning -->
              <p style="color:#ef4444;font-size:13px;margin:24px 0 0;">
                ⚠️ Mã này có hiệu lực trong <strong>15 phút</strong>. Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px 32px;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                © ${new Date().getFullYear()} Camera Rental. Tất cả quyền được bảo lưu.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return sendEmail({
    to: email,
    subject: '🔐 Đặt lại mật khẩu - Camera Rental',
    html,
  });
};

module.exports = { sendEmail, sendResetPasswordEmail };
