// spring.datasource.{url,username,password} must be an ${ENV:default}
// placeholder, never a bare literal.
const CREDENTIAL_KEY = /^(spring\.datasource\.(url|username|password))\s*[=:]\s*(.+)$/;

export function check(ctx) {
  const violations = [];
  for (const file of ctx.files) {
    const lines = file.content.split(/\r?\n/);
    lines.forEach((raw, index) => {
      const line = raw.trim();
      if (line === '' || line.startsWith('#') || line.startsWith('!')) return;
      const match = CREDENTIAL_KEY.exec(line);
      if (!match) return;
      const value = match[3].trim();
      if (/^\$\{[^}]+\}$/.test(value)) return;
      violations.push({
        file: file.path,
        line: index + 1,
        column: 0,
        message: `${match[1]} is a literal value — read it from the environment as \${VAR:local-default} so the committed artifact carries no credential and can be pointed at another database without being edited`,
      });
    });
  }
  return violations;
}
