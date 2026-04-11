# Resend Inbound Webhook Setup

## Steps to enable customer email replies to support tickets:

1. Go to https://app.resend.com/webhooks
2. Click "Add Webhook"
3. Webhook URL: `https://videodj.studio/api/support/inbound`
4. Select events: `email.received` (or all inbound events)
5. Save

## DNS Records Required (in Hostinger)

### For sending (already done):
- TXT: `resend._domainkey` → DKIM key (verified)
- MX: `send` → `feedback-smtp.*.amazonses.com` priority 10
- TXT: `send` → `v=spf1 include:amazonses.com ~all`

### For receiving:
- MX: `@` → `inbound-smtp.eu-west-1.amazonaws.com` priority 10

Note: The receiving MX record may conflict with Hostinger's email MX records.
If emails to support@videodj.studio don't arrive, you may need to remove
Hostinger's MX records for the root domain, or use a subdomain like
`support.videodj.studio` for inbound only.
