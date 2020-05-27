'use strict'

/*
    This script is called from npm run compile. It copies extensionMain to `dist`.
*/

const fs = require('fs-extra')
const path = require('path')

const repoRoot = path.dirname(__dirname)
const outRoot = path.join(repoRoot, 'dist')

;(async () => {
    await fs.copy(path.join(repoRoot, 'extensionMain.js'), path.join(outRoot, 'extensionMain.js'), {
        overwrite: true,
        errorOnExist: false,
    })
})()
