# 📧 EmailJS + Gmail SMTP Setup Guide
## Stop OTP emails going to spam — takes ~10 minutes

---

## PART 1 — Create EmailJS Account

1. Go to **https://www.emailjs.com** and click **Sign Up Free**
2. Verify your EmailJS account (ironic, but necessary)
3. You get **200 free emails/month** on the free plan

---

## PART 2 — Connect Your Gmail (SMTP Service)

1. In EmailJS dashboard → click **Email Services** (left sidebar)
2. Click **Add New Service**
3. Choose **Gmail**
4. Click **Connect Account** → sign in with your Gmail
5. Give it a name: `studysync_gmail`
6. Click **Create Service**
7. ✅ Copy your **Service ID** → looks like `service_abc1234`

> This makes emails arrive **from your Gmail address**, not a random
> Firebase address. Gmail is trusted by all email providers so it
> will NOT go to spam.

---

## PART 3 — Create OTP Email Template

1. Dashboard → **Email Templates** → **Create New Template**
2. Fill in these fields:

**To Email:**
```
{{to_email}}
```

**To Name:**
```
{{to_name}}
```

**From Name:**
```
StudySync
```

**Reply To:**
```
your-gmail@gmail.com
```

**Subject:**
```
{{otp_code}} is your StudySync verification code
```

**Body (HTML recommended):**
```html
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;padding:20px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    
    <div style="text-align:center;margin-bottom:24px">
      <h1 style="color:#6C63FF;font-size:28px;margin:0">StudySync</h1>
      <p style="color:#888;font-size:14px;margin-top:4px">Email Verification</p>
    </div>

    <p style="color:#333;font-size:15px">Hi <strong>{{to_name}}</strong>,</p>
    <p style="color:#555;font-size:14px;line-height:1.6">
      Your verification code for StudySync is:
    </p>

    <!-- Big OTP display -->
    <div style="text-align:center;margin:28px 0">
      <span style="
        font-size:42px;
        font-weight:900;
        letter-spacing:12px;
        color:#6C63FF;
        background:#f0efff;
        padding:16px 24px;
        border-radius:12px;
        font-family:monospace;
        display:inline-block;
      ">{{otp_code}}</span>
    </div>

    <p style="color:#888;font-size:13px;text-align:center">
      ⏰ This code expires in <strong>{{expires_in}}</strong>
    </p>

    <hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>

    <p style="color:#aaa;font-size:12px;text-align:center">
      If you didn't request this, you can safely ignore this email.<br/>
      © {{year}} {{app_name}}
    </p>
  </div>
</body>
</html>
```

3. Click **Save**
4. ✅ Copy your **Template ID** → looks like `template_xyz7890`

---

## PART 4 — Get Your Public Key

1. Dashboard → click your **account name** (top right) → **Account**
2. Go to **General** tab
3. Copy your **Public Key** → looks like `AbCdEfGhIjKlMnOp`

---

## PART 5 — Add Keys to Your App

Open `js/auth.js` and replace the placeholder values:

```javascript
const EMAILJS = {
  publicKey:  'AbCdEfGhIjKlMnOp',       // ← your public key
  serviceId:  'service_abc1234',          // ← your service id
  templateId: 'template_xyz7890',         // ← your template id
};
```

---

## PART 6 — Test It

1. Start Live Server → open `http://localhost:5500`
2. Click **Register**
3. Fill in your name, email, password
4. Click **Create Account**
5. OTP screen appears ✅
6. Check your inbox — email arrives from YOUR Gmail
7. Enter the 6-digit code
8. Account created and logged in ✅

---

## Why This Stops Spam

| Before (Firebase default) | After (Gmail SMTP via EmailJS) |
|---|---|
| Sent from `noreply@firebaseapp.com` | Sent from `you@gmail.com` |
| Unknown shared domain | Your personal trusted Gmail |
| Spam filters flag it | Gmail is whitelisted everywhere |
| No SPF/DKIM | Full Google SPF + DKIM authentication |

---

## EmailJS Free Plan Limits

| Limit | Amount |
|---|---|
| Emails per month | 200 |
| Emails per day | No daily limit |
| Templates | Unlimited |

200/month is plenty for a study app. If you need more, upgrade to
EmailJS Personal plan for $15/month which gives 1,000 emails/month.

---

## Troubleshooting

**"EmailJS not configured" error**
→ You haven't replaced the placeholder keys in `js/auth.js` yet

**OTP email not arriving**
→ Check spam folder first
→ Make sure Gmail is properly connected in EmailJS Email Services

**"Service not found" error**
→ Double-check your Service ID in EmailJS dashboard

**EmailJS 400 error**
→ Check your Template ID matches exactly
→ Make sure all template variables match: `{{to_email}}`, `{{to_name}}`, `{{otp_code}}`, `{{expires_in}}`, `{{app_name}}`, `{{year}}`
