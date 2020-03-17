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
 * Additional transforms TBD (e.g. different doc links)
 * @param root Repository root
 */
function generateC9Readme(root: string) {
    const fileText = fs.readFileSync(path.join(root, 'extension-readme.md')).toString()
    const samePathRegex = /\/.\//g
    const c9TransformedText = fileText.replace(samePathRegex, '/c9/')

    fs.writeFileSync(path.join(root, 'README.c9.md'), c9TransformedText)
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

generateC9Readme(repoRoot)
translateReadmeToHtml(repoRoot, 'extension-readme.md', 'quickStartVSC.html')
translateReadmeToHtml(repoRoot, 'README.c9.md', 'quickStartC9.html')
generateFileHash(repoRoot)
