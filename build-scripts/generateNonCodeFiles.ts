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
 * @param root Repository root
 * @param inputFile Input .md file to swap to HTML
 * @param outputFile Filepath to output HTML to
 */
function translateReadmeToHtml(root: string, inputFile: string, outputFile: string) {
    const fileText = fs.readFileSync(path.join(root, inputFile)).toString()
    const relativePathRegex = /]\(\.\//g
    const transformedText = fileText.replace(relativePathRegex, '](!!EXTENSIONROOT!!/')

    marked(transformedText, (err, result) => {
        fs.writeFileSync(path.join(root, outputFile), result)
    })
}

/**
 * Transforms the extension-readme file into one that can show Cloud9 images
 * TODO: Different doc links? Transform can be done here.
 * @param root Repository root
 */
function generateCloud9Readme(root: string) {
    const fileText = fs.readFileSync(path.join(root, 'extension-readme.md')).toString()
    const samePathRegex = /\/.\//g
    const cloud9TransformedText = fileText.replace(samePathRegex, '/cloud9/')

    fs.writeFileSync(path.join(root, 'README.cloud9.md'), cloud9TransformedText)
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

generateCloud9Readme(repoRoot)
translateReadmeToHtml(repoRoot, 'extension-readme.md', 'quickStartVSCode.html')
translateReadmeToHtml(repoRoot, 'README.cloud9.md', 'quickStartCloud9.html')
generateFileHash(repoRoot)
