'use strict';

const { execFile } = require('child_process');
const os = require('os');

/**
 * Open a native folder picker dialog.
 * On macOS: uses osascript
 * On Linux: tries zenity, then kdialog, then falls back gracefully
 * On Windows: uses PowerShell
 */
function openFolderPicker() {
  return new Promise((resolve) => {
    const platform = os.platform();

    if (platform === 'darwin') {
      const script = 'choose folder with prompt "Select your video library folder:"';
      execFile('osascript', ['-e', script], { timeout: 30000 }, (err, stdout) => {
        if (err) {
          resolve({ success: false, folder: null, message: 'Folder picker cancelled or unavailable' });
          return;
        }
        const raw = stdout.trim().replace(/^alias /, '').replace(/:/g, '/');
        const folder = raw ? `/${raw.split('/').slice(1).join('/')}` : null;
        resolve({ success: true, folder, message: folder ? `Selected: ${folder}` : 'No folder selected' });
      });
      return;
    }

    if (platform === 'win32') {
      const script = `
        Add-Type -AssemblyName System.Windows.Forms
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = "Select your video library folder"
        $result = $dialog.ShowDialog()
        if ($result -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath } else { "" }
      `;
      execFile('powershell', ['-Command', script], { timeout: 30000 }, (err, stdout) => {
        if (err) {
          resolve({ success: false, folder: null, message: 'Folder picker unavailable on this system' });
          return;
        }
        const folder = stdout.trim() || null;
        resolve({ success: !!folder, folder, message: folder ? `Selected: ${folder}` : 'No folder selected' });
      });
      return;
    }

    // Linux — try zenity first
    execFile('zenity', ['--file-selection', '--directory', '--title=Select video library'], { timeout: 30000 }, (err, stdout) => {
      if (!err) {
        const folder = stdout.trim() || null;
        resolve({ success: !!folder, folder, message: folder ? `Selected: ${folder}` : 'No folder selected' });
        return;
      }

      // Try kdialog
      execFile('kdialog', ['--getexistingdirectory', os.homedir(), '--title', 'Select video library'], { timeout: 30000 }, (err2, stdout2) => {
        if (!err2) {
          const folder = stdout2.trim() || null;
          resolve({ success: !!folder, folder, message: folder ? `Selected: ${folder}` : 'No folder selected' });
          return;
        }

        // No GUI available — fall back
        resolve({
          success: false,
          folder: null,
          message: 'No folder picker available. Please set your video library path manually.',
        });
      });
    });
  });
}

if (require.main === module) {
  openFolderPicker()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = { openFolderPicker };
