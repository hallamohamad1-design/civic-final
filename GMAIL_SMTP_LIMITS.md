# Gmail SMTP Sending Limits

## Free Gmail Account Limits

When using Gmail SMTP with a regular Gmail account (not Google Workspace):

- **Daily sending limit**: 500 emails per day
- **Rate limit**: Approximately 90 emails per minute (may vary)
- **Recipients**: Each unique recipient counts toward the daily limit
- **BCC/CC**: All recipients (To, CC, BCC) count toward the limit

## Google Workspace (G Suite) Limits

Google Workspace accounts have higher limits based on the plan:

### Starter/Frontier Plans
- **Daily limit**: 2,000 emails per day
- **Rate limit**: Similar to free Gmail

### Standard/Plus/Business Plans
- **Daily limit**: 10,000 emails per day
- **Rate limit**: Higher throughput allowed

### Enterprise Plans
- **Daily limit**: Up to 10,000+ emails per day (customizable)
- **Rate limit**: Highest throughput

## Important Notes

1. **App Password Required**: As of May 2022, Google disabled "less secure apps" access. You must:
   - Enable 2FA on your Google account
   - Generate an App Password at https://myaccount.google.com/apppasswords
   - Use the 16-character App Password as your SMTP password

2. **Account Suspension Risk**: Exceeding limits may result in:
   - Temporary suspension of sending ability
   - Account review by Google
   - Permanent suspension for repeated violations

3. **Best Practices**:
   - Use a dedicated email account for app emails
   - Implement rate limiting in your application
   - Consider using a transactional email service for production
   - Monitor your sending volume

## Recommended Alternatives for Production

For production applications with higher email volumes, consider:

1. **SendGrid** (Free tier: 100 emails/day)
2. **Mailgun** (Free trial: 5,000 emails for 3 months)
3. **Resend** (Free tier: 3,000 emails/month)
4. **AWS SES** (Pay-as-you-go, very cheap at scale)
5. **Postmark** (Paid only, excellent deliverability)

These services provide:
- Higher sending limits
- Better deliverability
- Analytics and tracking
- Dedicated IP options
- Webhook notifications
