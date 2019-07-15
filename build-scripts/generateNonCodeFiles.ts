/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/*
    This script is called from npm run compile.
    It creates an HTML version of the marketplace page to be used as a quick start page.
    It replaces relative paths with an `!!EXTENSIONROOT!!` token.
    This makes it easier to swap in relative links when the extension loads.
*/

import * as child_process from 'child_process'
import * as fs from 'fs-extra'
// tslint:disable-next-line: no-implicit-dependencies
import * as marked from 'marked'
import * as path from 'path'

const repoRoot = path.dirname(__dirname)
const outRoot = path.join(repoRoot, 'out')

const fileText = fs.readFileSync(path.join(repoRoot, 'extension-readme.md')).toString()

// paths are a little more foolproof to find in markdown form than HTML.
// find anything with a relative path and convert it to an easy-to-find token so we can convert to paths relative
const relativePathRegex = /]\(\.\//g
const transformedText = fileText.replace(relativePathRegex, '](!!EXTENSIONROOT!!/')

marked(transformedText, (err, result) => {
    fs.writeFileSync(path.join(repoRoot, './quickStart.html'), result)
})

// Do a best effort job of generating a git hash and putting it into the package
try {
    const response = child_process.execSync('git rev-parse HEAD')
    fs.outputFileSync(path.join(outRoot, '.gitcommit'), response)
} catch (e) {
    console.log(`Getting commit hash failed ${e}`)
}
