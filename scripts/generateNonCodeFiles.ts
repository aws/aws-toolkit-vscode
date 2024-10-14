/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as nodefs from 'fs' // eslint-disable-line no-restricted-imports
import { marked } from 'marked'
import * as path from 'path'

// doesn't use path utils as this should be formatted for finding images with HTML markup
const projectRoot = process.cwd()

/**
 * replaces relative paths with an `!!EXTENSIONROOT!!` token.
 * This makes it easier to swap in relative links when the extension loads.
 * @param root Repository root
 * @param inputFile Input .md file to swap to HTML
 * @param outputFile Filepath to output HTML to
 * @param cn Converts "AWS" to "Amazon" for CN-based compute.
 */
function translateReadmeToHtml(
    root: string,
    inputFile: string,
    outputFile: string,
    throwIfNotExists: boolean,
    cn: boolean = false
) {
    const inputPath = path.join(root, inputFile)
    if (!nodefs.existsSync(inputPath)) {
        if (throwIfNotExists) {
            throw Error(`File ${inputFile} was not found, but it is required.`)
        }
        console.log(`File ${inputFile} was not found, skipping transformation...`)
        return
    }
    const fileText = nodefs.readFileSync(path.join(root, inputFile)).toString()
    const relativePathRegex = /]\(\.\//g
    let transformedText = fileText.replace(relativePathRegex, '](!!EXTENSIONROOT!!/')
    if (cn) {
        transformedText = transformedText.replace(/AWS/g, 'Amazon').replace(/-en.png/g, '-cn.png')
    }

    const r = marked.parse(transformedText, { async: false })
    if (typeof r !== 'string') {
        throw Error()
    }
    nodefs.writeFileSync(path.join(root, outputFile), r)
}

/**
 * Do a best effort job of generating a git hash and putting it into the package
 */
function generateFileHash(root: string) {
    try {
        const response = child_process.execSync('git rev-parse HEAD')
        nodefs.mkdirSync(root, { recursive: true })
        nodefs.writeFileSync(path.join(root, '.gitcommit'), response)
    } catch (e) {
        console.log(`Getting commit hash failed ${e}`)
    }
}

try {
    translateReadmeToHtml(projectRoot, 'README.md', 'quickStartVscode.html', true)
    translateReadmeToHtml(projectRoot, 'README.quickstart.cloud9.md', 'quickStartCloud9.html', false)
    translateReadmeToHtml(projectRoot, 'README.quickstart.cloud9.md', 'quickStartCloud9-cn.html', false, true)
    generateFileHash(projectRoot)
} catch (error) {
    console.error(error)
    process.exit(100)
}
