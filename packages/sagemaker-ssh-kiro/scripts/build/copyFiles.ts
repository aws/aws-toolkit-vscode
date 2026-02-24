/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-restricted-imports */
import fs from 'fs'
import * as path from 'path'

// Copies various dependencies into "dist/".

const projectRoot = process.cwd()
const outRoot = path.join(projectRoot, 'dist')

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
    ...['LICENSE', 'NOTICE'].map((f) => {
        return { target: path.join('../../', f), destination: path.join(projectRoot, f) }
    }),
    // Copy the AWS icon from toolkit resources
    {
        target: 'aws-icon-256x256.png',
        destination: '../resources/marketplace/aws-icon-256x256.png',
    },
]

function copy(task: CopyTask): void {
    const src = path.resolve(projectRoot, task.target)
    const dst = path.resolve(outRoot, task.destination ?? task.target)

    try {
        fs.cpSync(src, dst, {
            recursive: true,
            force: true,
            errorOnExist: false,
        })
    } catch (error) {
        throw new Error(`Copy "${src}" to "${dst}" failed: ${error instanceof Error ? error.message : error}`)
    }
}
function main() {
    try {
        tasks.map(copy)
    } catch (error) {
        console.error('`copyFiles.ts` failed')
        console.error(error)
        process.exit(1)
    }
}

void main()
