/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as glob from 'glob'
import * as path from 'path'

const root = path.join(__dirname, '..')
const snippetsDir = path.join(root, 'snippets')
const snippetsSrcDir = path.join(snippetsDir, 'src')
const snippetsOutDir = path.join(snippetsDir, 'out')

const snippets: {
    [name: string]: {
        prefix: string
        description: string
        body: string[]
    }
} = {}

const directories = new Set(glob.sync(`${snippetsDir}/src/**/body.js`).map(body => path.dirname(body)))

for (const directory of directories) {
    const metadata = fs.readJSONSync(`${directory}/metadata.json`)
    const prefix = metadata['prefix']
    const description = metadata['description']
    const content = fs.readFileSync(`${directory}/body.js`)
    const body = content
        .toString()
        .split('\n')
        .map(line => line.replace(/\s?\/\*(\$\d+)\*\/\s?/g, '$1'))

    const name = path
        .relative(snippetsSrcDir, directory)
        .split(path.sep)
        .join('.')

    snippets[name] = {
        prefix,
        description,
        body,
    }
}

fs.ensureDirSync(snippetsOutDir)
fs.writeFileSync(path.join(snippetsOutDir, 'snippets.json'), JSON.stringify(snippets, undefined, '  '))
