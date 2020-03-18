/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as fs from 'fs-extra'
// tslint:disable-next-line: no-implicit-dependencies
import * as marked from 'marked'
import * as path from 'path'

// doesn't use path utils as this should be formatted for finding images with HTML markup
const MARKETPLACE_RESOURCE_HTML_PATH = './resources/marketplace'
const REPO_ROOT = path.dirname(__dirname)

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
 * Transforms a template file to a standard markdown file
 * Currently replaces `{IMAGE_DIRECTORY}` tags with the imageDirectory param
 * TODO: Different doc links? Transform can be done here.
 * @param root Repository root
 * @param inputFile Input template file
 * @param outputFile Output markdown file
 * @param imageDirectory Directory to replace `{IMAGE_DIRECTORY}` tags with
 */
function generateReadme(root: string, inputFile: string, outputFile: string, imageDirectory: string) {
    const fileText = fs.readFileSync(path.join(root, inputFile)).toString()
    const imageDirectoryPlaceholder = /{IMAGE_DIRECTORY}/g
    const transformedText = fileText.replace(imageDirectoryPlaceholder, imageDirectory)

    fs.writeFileSync(path.join(root, outputFile), transformedText)
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

// TODO: change this output file to a VS Code specific one--use this name for now as it's in our prod build scripts
generateReadme(
    REPO_ROOT,
    'extension-readme.md.template',
    'extension-readme.md',
    `${MARKETPLACE_RESOURCE_HTML_PATH}/vscode`
)
generateReadme(
    REPO_ROOT,
    'extension-readme.md.template',
    'README.cloud9.md',
    `${MARKETPLACE_RESOURCE_HTML_PATH}/cloud9`
)
translateReadmeToHtml(REPO_ROOT, 'extension-readme.md', 'quickStartVscode.html')
translateReadmeToHtml(REPO_ROOT, 'README.cloud9.md', 'quickStartCloud9.html')
generateFileHash(REPO_ROOT)
