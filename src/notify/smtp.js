/**
 * SMTP notifier — sends mail through any SMTP relay using nodemailer.
 *
 * nodemailer is a peer-optional dep so the package stays lean for users who
 * pick Gmail (the recommended path). The import is dynamic and only fires
 * when this adapter is actually used.
 *
 * @typedef {Object} SmtpNotifierConfig
 * @property {string} host
 * @property {number} port
 * @property {boolean} [secure] - true for 465, false for 587/STARTTLS. Defaults based on port.
 * @property {string} user
 * @property {string} pass
 * @property {string} from - Bare address or "Display Name <addr@host>".
 */

/**
 * @param {SmtpNotifierConfig} config
 */
export function createSmtpNotifier(config) {
  if (!config?.host || !config?.port || !config?.user || !config?.pass || !config?.from) {
    throw new Error('createSmtpNotifier: host, port, user, pass, and from are required');
  }
  const secure = typeof config.secure === 'boolean' ? config.secure : config.port === 465;

  let transporterPromise = null;
  async function getTransporter() {
    if (transporterPromise) return transporterPromise;
    transporterPromise = (async () => {
      let nodemailer;
      try {
        nodemailer = await import('nodemailer');
      } catch (err) {
        throw new Error(
          'SMTP notifier needs nodemailer. Install it: `npm install nodemailer`. ' +
            `(original: ${err instanceof Error ? err.message : String(err)})`
        );
      }
      const factory = nodemailer.createTransport || nodemailer.default?.createTransport;
      if (!factory) throw new Error('nodemailer.createTransport not found');
      return factory({
        host: config.host,
        port: config.port,
        secure,
        auth: { user: config.user, pass: config.pass },
      });
    })();
    return transporterPromise;
  }

  return {
    kind: /** @type {const} */ ('smtp'),
    /**
     * @param {{ to: string, subject: string, html: string, text: string }} msg
     */
    async send(msg) {
      const transporter = await getTransporter();
      const info = await transporter.sendMail({
        from: config.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
      return { ok: true, messageId: info?.messageId || null };
    },
  };
}
