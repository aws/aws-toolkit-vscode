/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//
// Called from `npm run compile`.
// Copies vended dependencies (SSM, ASL, …) to `dist`.
//

import * as fs from 'fs-extra'
import * as path from 'path'

const repoRoot = path.dirname(__dirname)

async function copyFiles(name: string, files: Array<string[]>) {
    try {
        console.log(`copying artifacts for "${name}"...`)
        for (let [from, to] of files) {
            await fs.copy(path.resolve(repoRoot, from), path.resolve(repoRoot, to), {
                overwrite: true,
                errorOnExist: false,
            })
        }
    } catch (e) {
        console.error(`error: failed to copy artifacts for "${name}"`, e)
        // Exit with non-zero exit code in order to fail the build if copying of any artifact fails.
        process.exit(1)
    }
}

;(async () => {
    copyFiles('SSM Document Language Service', [
        ['node_modules/aws-ssm-document-language-service/dist/server.js', 'dist/src/ssmDocument/ssm/ssmServer.js'],
        [
            'node_modules/aws-ssm-document-language-service/dist/server.js.LICENSE.txt',
            'dist/src/ssmDocument/ssm/ssmServer.js.LICENSE.txt',
        ],
        [
            'node_modules/aws-ssm-document-language-service/dist/server.js.map',
            'dist/src/ssmDocument/ssm/ssmServer.js.map',
        ],
    ])
})()
