const quotePowerShell = value => `'${String(value).replaceAll("'", "''")}'`;
const quotePosix = value => `'${String(value).replaceAll("'", "'\\''")}'`;

export const shellArg = value => process.platform === 'win32' ? quotePowerShell(value) : quotePosix(value);
export const nodeCommand = source => `${process.platform === 'win32' ? '& ' : ''}${shellArg(process.execPath)} -e ${shellArg(source)}`;
export const delayCommand = milliseconds => nodeCommand(`setTimeout(() => {}, ${milliseconds})`);
export const cwdCommand = (milliseconds = 0) => nodeCommand(`${milliseconds ? `setTimeout(() => ` : ''}process.stdout.write(process.cwd())${milliseconds ? `, ${milliseconds})` : ''}`);
const jsString = value => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
export const writeLaterCommand = (file, content, milliseconds) => nodeCommand(`setTimeout(() => require('node:fs').writeFileSync(${jsString(file)}, ${jsString(content)}), ${milliseconds})`);
