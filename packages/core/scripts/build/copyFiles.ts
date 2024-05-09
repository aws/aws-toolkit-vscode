/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as path from 'path'

// Moves all dependencies into `dist`

const projectRoot = process.cwd()
const outRoot = path.join(projectRoot, 'dist')

// The target file or directory must exist, otherwise we should fail the whole build.
interface CopyTask {
    /**
     * Target file or directory to copy.
     */
    readonly target: string

    /**
     * Providing no destination means the target will be copied relative to the root directory.
     */
    readonly destination?: string
}

const tasks: CopyTask[] = [
    { target: path.join('src', 'templates') },
    { target: path.join('src', 'test', 'shared', 'cloudformation', 'yaml') },
    { target: path.join('src', 'test', 'amazonqGumby', 'resources') },
    { target: path.join('src', 'testFixtures') },
    { target: 'src/auth/sso/vue' },

    // SSM
    {
        target: path.join('../../node_modules', 'aws-ssm-document-language-service', 'dist', 'server.js'),
        destination: path.join('src', 'ssmDocument', 'ssm', 'ssmServer.js'),
    },
    {
        target: path.join('../../node_modules', 'aws-ssm-document-language-service', 'dist', 'server.js.LICENSE.txt'),
        destination: path.join('src', 'ssmDocument', 'ssm', 'ssmServer.js.LICENSE.txt'),
    },
    {
        target: path.join('../../node_modules', 'aws-ssm-document-language-service', 'dist', 'server.js.map'),
        destination: path.join('src', 'ssmDocument', 'ssm', 'server.js.map'),
    },
]

async function copy(task: CopyTask): Promise<void> {
    const src = path.resolve(projectRoot, task.target)
    const dst = path.resolve(outRoot, task.destination ?? task.target)

    try {
        await fs.copy(src, dst, {
            recursive: true,
            overwrite: true,
            errorOnExist: false,
        })
    } catch (error) {
        throw new Error(`Copy "${src}" to "${dst}" failed: ${error instanceof Error ? error.message : error}`)
    }
}

void (async () => {
    try {
        await Promise.all(tasks.map(copy))
    } catch (error) {
        console.error('`copyFiles.ts` failed')
        console.error(error)
        process.exit(1)
    }
})()
