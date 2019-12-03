'use strict'

/*
    This script is called from npm run compile. It copies the
    files and directories listed in `relativePaths` to `dist`.
*/

const fs = require('fs-extra')
const path = require('path')

const repoRoot = path.dirname(__dirname)
const outRoot = path.join(repoRoot, 'dist')

// May be individual files or entire directories.
const relativePaths = [
    path.join('src', 'templates'),
    path.join('src', 'test', 'shared', 'cloudformation', 'yaml'),
    path.join('src', 'integrationTest-samples')
]

;(async () => {
    for (const relativePath of relativePaths) {
        await fs.copy(path.join(repoRoot, relativePath), path.join(outRoot, relativePath), {
            recursive: true,
            overwrite: true,
            errorOnExist: false
        })
    }
})()
