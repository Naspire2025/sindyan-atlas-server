export interface EmailEnvelope {
  subject: string;
  text: string;
  html: string;
}

const BRAND_COLOR = '#4cce51';
const TEXT_COLOR = '#1f2937';
const MUTED_COLOR = '#6b7280';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderActionButton(input: { label: string; url: string }): string {
  return `<p style="margin:24px 0 0 0;">
    <a href="${input.url}" style="display:inline-block;padding:11px 22px;background-color:${BRAND_COLOR};color:#0b1220;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;">${input.label}</a>
  </p>`;
}

function renderHtmlLayout(input: { heading: string; bodyHtml: string }): string {
  const { heading, bodyHtml } = input;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="background-color:${BRAND_COLOR};height:6px;font-size:6px;line-height:6px;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <p style="margin:0 0 18px 0;font-size:13px;color:${MUTED_COLOR};letter-spacing:0.4px;">ATLAS</p>
                <h1 style="margin:0 0 16px 0;font-size:22px;line-height:1.3;color:${TEXT_COLOR};font-weight:700;">${heading}</h1>
                <div style="font-size:15px;line-height:1.65;color:${TEXT_COLOR};">${bodyHtml}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export { escapeHtml, renderActionButton, renderHtmlLayout };