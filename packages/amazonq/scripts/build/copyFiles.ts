/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/* eslint-disable no-restricted-imports */
import fs from 'fs'
import * as path from 'path'

// Moves all dependencies into `dist`

const projectRoot = process.cwd()
const outRoot = path.join(projectRoot, 'dist')
let vueHr = false

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
    ...['LICENSE', 'NOTICE'].map((f) => {
        return { target: path.join('../../', f), destination: path.join(projectRoot, f) }
    }),

    { target: path.join('../core', 'resources'), destination: path.join('..', 'resources') },
    {
        target: path.join('../core', 'package.nls.json'),
        destination: path.join('..', 'package.nls.json'),
    },
    { target: 'test/unit/amazonqGumby/resources' },
    { target: 'test/e2e_new/amazonq/utils/resources' },

    // Vue
    {
        target: '../core/src/auth/sso/vue',
        destination: 'src/auth/sso/vue',
    },
    {
        target: path.join('../core', 'resources', 'js', 'vscode.js'),
        destination: path.join('libs', 'vscode.js'),
    },
    {
        target: path.join('../../node_modules', 'vue', 'dist', 'vue.global.prod.js'),
        destination: path.join('libs', 'vue.min.js'),
    },
    {
        target: path.join('../../node_modules', 'aws-core-vscode', 'dist', vueHr ? 'vuehr' : 'vue'),
        destination: 'vue/',
    },

    {
        target: path.join('../../node_modules', 'web-tree-sitter', 'tree-sitter.wasm'),
        destination: path.join('src', 'tree-sitter.wasm'),
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

const args = process.argv.slice(2)
if (args.includes('--vueHr')) {
    vueHr = true
    console.log('Using Vue Hot Reload webpacks from core/')
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
