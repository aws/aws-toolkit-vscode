/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs-extra'
import * as path from 'path'

// Moves all dependencies into `dist`
// There is a single, optional flag `--webpacked` that moves localization files when present

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
    // ...[
    //     'CHANGELOG.md',
    //     'LICENSE',
    //     'NOTICE',
    //     'README.md',
    //     'README.quickstart.cloud9.md',
    //     'README.quickstart.vscode.md',
    //     'quickStartCloud9-cn.html',
    //     'quickStartCloud9.html',
    //     'quickStartVscode.html',
    // ].map(f => {
    //     return { target: path.join('../../', f), destination: path.join(projectRoot, f) }
    // }),

    { target: path.join('../core', 'src', 'templates'), destination: path.join('src', 'templates') },
    // { target: path.join('src', 'test', 'shared', 'cloudformation', 'yaml') },
    // { target: path.join('src', 'test', 'codewhisperer', 'service', 'resources') },
    // { target: path.join('src', 'testFixtures') },

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

    // ASL
    {
        target: path.join(
            '../../node_modules',
            'aws-core-vscode',
            'dist',
            'src',
            'stepFunctions',
            'asl',
            'aslServer.js'
        ),
        destination: path.join('src', 'stepFunctions', 'asl', 'aslServer.js'),
    },

    // Vue
    {
        target: path.join('resources', 'js', 'vscode.js'),
        destination: path.join('libs', 'vscode.js'),
    },
    {
        target: path.join('../../node_modules', 'vue', 'dist', 'vue.global.prod.js'),
        destination: path.join('libs', 'vue.min.js'),
    },
    {
        target: path.join('../../node_modules', 'aws-core-vscode', 'dist', 'vue'),
        destination: 'vue',
    },

    // Mynah
    {
        target: path.join(
            '../../node_modules',
            '@aws',
            'fully-qualified-names',
            'node',
            'aws_fully_qualified_names_bg.wasm'
        ),
        destination: path.join('src', 'aws_fully_qualified_names_bg.wasm'),
    },
    {
        target: path.join('../../node_modules', 'web-tree-sitter', 'tree-sitter.wasm'),
        destination: path.join('src', 'tree-sitter.wasm'),
    },
]

// Localization files are produced relative to `src` despite `tsc` emitting a compilation relative to the root
const webpackedTasks: CopyTask[] = [
    {
        target: path.join('dist', 'nls.metadata.json'),
        destination: path.join('src', 'nls.metadata.json'),
    },
    {
        target: path.join('dist', 'nls.metadata.header.json'),
        destination: path.join('src', 'nls.metadata.header.json'),
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
    const args = process.argv.slice(2)

    // To use this something like: "npm run copyFiles -- --webpacked"
    if (args.includes('--webpacked')) {
        tasks.push(...webpackedTasks)
    }

    try {
        await Promise.all(tasks.map(copy))
    } catch (error) {
        console.error('`copyFiles.ts` failed')
        console.error(error)
        process.exit(1)
    }
})()
