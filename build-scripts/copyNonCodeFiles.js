'use strict';

/*
    This script is called from npm run compile. It copies the
    files and directories listed in `relativePaths` to `out/`.
*/

const fs = require('fs-extra');
const path = require('path');

const repoRoot = path.dirname(__dirname);
const outRoot = path.join(repoRoot, 'out');

// May be individual files or entire directories.
const relativePaths = [
    path.join('src', 'schemas'),
    path.join('src', 'test', 'shared', 'cloudformation', 'yaml')
];

(async () => {
    for (const relativePath of relativePaths) {
        await fs.copy(
            path.join(repoRoot, relativePath),
            path.join(outRoot, relativePath),
            {
                recursive: true,
                overwrite: true,
                errorOnExist: false,
            }
        );
    }
})();
