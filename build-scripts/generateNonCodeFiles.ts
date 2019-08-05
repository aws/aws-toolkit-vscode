/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as fs from 'fs-extra'
// tslint:disable-next-line: no-implicit-dependencies
import * as marked from 'marked'
import * as path from 'path'

/**
 * replaces relative paths with an `!!EXTENSIONROOT!!` token.
 * This makes it easier to swap in relative links when the extension loads.
 */
function translateReadmeToHtml(root: string) {
    const fileText = fs.readFileSync(path.join(root, 'extension-readme.md')).toString()
    const relativePathRegex = /]\(\.\//g
    const transformedText = fileText.replace(relativePathRegex, '](!!EXTENSIONROOT!!/')

    marked(transformedText, (err, result) => {
        fs.writeFileSync(path.join(root, './quickStart.html'), result)
    })
}

/**
 * Do a best effort job of generating a git hash and putting it into the package
 */
function generateFileHash(root: string) {
    try {
        const response = child_process.execSync('git rev-parse HEAD')
        fs.outputFileSync(path.join(root, '.gitcommit'), response)
    } catch (e) {
        console.log(`Getting commit hash failed ${e}`)
    }
}

const repoRoot = path.dirname(__dirname)

translateReadmeToHtml(repoRoot)
generateFileHash(repoRoot)
