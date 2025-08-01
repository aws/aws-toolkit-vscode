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
        target: path.join('../core/', 'package.nls.json'),
        destination: path.join('..', 'package.nls.json'),
    },
    { target: path.join('../core', 'src', 'templates'), destination: path.join('src', 'templates') },
    {
        target: '../core/src/auth/sso/vue',
        destination: 'src/auth/sso/vue',
    },

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

    // Sagemaker local server
    {
        target: path.join(
            '../../node_modules',
            'aws-core-vscode',
            'dist',
            'src',
            'awsService',
            'sagemaker',
            'detached-server',
            'server.js'
        ),
        destination: path.join('src', 'awsService', 'sagemaker', 'detached-server', 'server.js'),
    },

    // Serverless Land
    {
        target: path.join(
            '../../node_modules/aws-core-vscode',
            'src',
            'awsService',
            'appBuilder',
            'serverlessLand',
            'metadata.json'
        ),
        destination: path.join('src', 'serverlessLand', 'metadata.json'),
    },

    // Vue
    {
        target: path.join('../core', 'resources', 'js', 'vscode.js'),
        destination: path.join('libs', 'vscode.js'),
    },
    {
        target: path.join('../../node_modules', 'vue', 'dist', 'vue.global.prod.js'),
        destination: path.join('libs', 'vue.min.js'),
    },
    {
        target: path.join('../../node_modules/aws-core-vscode/dist', 'vue'),
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
