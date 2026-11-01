import type { MailRelay } from './types'

/** SMTP settings for common providers, so most people only paste a key. */
export const MAIL_PRESETS: { id: string; name: string; host: string; port: number; security: MailRelay['security']; username?: string; help: string }[] = [
  { id: 'resend', name: 'Resend', host: 'smtp.resend.com', port: 587, security: 'starttls', username: 'resend', help: 'Password: your Resend API key.' },
  { id: 'mailtrap', name: 'Mailtrap', host: 'live.smtp.mailtrap.io', port: 587, security: 'starttls', username: 'api', help: 'Password: your Mailtrap API token.' },
  { id: 'postmark', name: 'Postmark', host: 'smtp.postmarkapp.com', port: 587, security: 'starttls', help: 'User and password: your server API token.' },
  { id: 'sendgrid', name: 'SendGrid', host: 'smtp.sendgrid.net', port: 587, security: 'starttls', username: 'apikey', help: 'Password: your SendGrid API key.' },
  { id: 'mailgun', name: 'Mailgun', host: 'smtp.mailgun.org', port: 587, security: 'starttls', help: 'Your domain’s SMTP user and password from Mailgun.' },
  { id: 'ses', name: 'Amazon SES', host: 'email-smtp.us-east-1.amazonaws.com', port: 587, security: 'starttls', help: 'SES SMTP credentials; change the region in the host if yours differs.' },
  { id: 'brevo', name: 'Brevo', host: 'smtp-relay.brevo.com', port: 587, security: 'starttls', help: 'Your Brevo SMTP login and key.' },
  { id: 'gmail', name: 'Gmail', host: 'smtp.gmail.com', port: 587, security: 'starttls', help: 'Your Gmail address and an app password (not your normal password).' },
  { id: 'custom', name: 'Other SMTP', host: '', port: 587, security: 'starttls', help: 'Any SMTP server.' }
]

