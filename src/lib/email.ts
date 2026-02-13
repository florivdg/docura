import nodemailer from 'nodemailer'

function escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendPasswordResetEmail(
  user: { email: string; name: string },
  url: string,
) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: user.email,
    subject: 'Passwort zurücksetzen – Docura',
    html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="de">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Passwort zurücksetzen</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f4f4f5" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" width="600"><tr><td><![endif]-->
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:0 0 24px 0;">
              <span style="font-size:24px;font-weight:700;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Docura</span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td bgcolor="#ffffff" style="background-color:#ffffff;border-radius:8px;padding:40px 32px;border:1px solid #e4e4e7;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <!-- Heading -->
                <tr>
                  <td style="padding:0 0 16px 0;">
                    <h1 style="margin:0;font-size:22px;font-weight:700;color:#18181b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">Passwort zurücksetzen</h1>
                  </td>
                </tr>
                <!-- Greeting + explanation -->
                <tr>
                  <td style="padding:0 0 24px 0;font-size:15px;line-height:24px;color:#3f3f46;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    Hallo ${escapeHtml(user.name)},<br /><br />
                    du hast eine Anfrage zum Zurücksetzen deines Passworts gestellt. Klicke auf den folgenden Button, um ein neues Passwort zu vergeben:
                  </td>
                </tr>
                <!-- CTA Button -->
                <tr>
                  <td align="center" style="padding:0 0 24px 0;">
                    <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;background-color:#6d28d9;color:#ffffff;font-size:15px;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;text-decoration:none;padding:12px 32px;border-radius:6px;">Passwort zurücksetzen</a>
                  </td>
                </tr>
                <!-- Fallback URL -->
                <tr>
                  <td style="padding:0 0 24px 0;font-size:13px;line-height:20px;color:#71717a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    Falls der Button nicht funktioniert, kopiere den folgenden Link in deinen Browser:<br />
                    <a href="${escapeHtml(url)}" style="color:#6d28d9;text-decoration:underline;word-break:break-all;">${escapeHtml(url)}</a>
                  </td>
                </tr>
                <!-- Ignore notice -->
                <tr>
                  <td style="padding:0;font-size:13px;line-height:20px;color:#a1a1aa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                    Falls du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren. Dein Passwort bleibt unverändert.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 0 0;font-size:12px;line-height:18px;color:#a1a1aa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              &copy; ${new Date().getFullYear()} Docura. Alle Rechte vorbehalten.
            </td>
          </tr>
        </table>
        <!--[if mso]></td></tr></table><![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`,
  })
}
