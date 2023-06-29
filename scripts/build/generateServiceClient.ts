/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import { constants } from 'fs'

/**
 * This script uses the AWS JS SDK to generate service clients where the client definition is contained within
 * this repo.
 */

async function generateServiceClients(): Promise<void> {
    const tempJsSdkPath = path.resolve(process.cwd(), 'node_modules', '.zzz-awssdk3')
    console.log(`Temp JS SDK Repo location: ${tempJsSdkPath}`)

    await cloneJsSdk(tempJsSdkPath)
    await replaceModels(tempJsSdkPath, smithyModelPaths)
    await runTypingsGenerator(tempJsSdkPath)
    await installGeneratedPackages(
        tempJsSdkPath,
        smithyModelPaths.map(p => path.basename(p).replace(path.extname(p), ''))
    )

    console.log('Done generating service client(s)')
}

/** When cloning aws-sdk-js, we want to pull the version actually used in package-lock.json. */
async function getJsSdkVersion(): Promise<string> {
    const json = await fs.readFile(path.resolve(process.cwd(), 'package.json'), 'utf-8')
    const packageJson = JSON.parse(json)

    return packageJson['sdk-codegen-version']
}

async function cloneJsSdk(dir: string): Promise<void> {
    // Output stderr while it clones so it doesn't look frozen
    return new Promise<void>(async (resolve, reject) => {
        const tag = `v${await getJsSdkVersion()}`

        const gitHead = child_process.spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'])
        const exists = await fs.access(dir, constants.F_OK).then(
            () => true,
            () => false
        )
        const alreadyCloned = exists && gitHead.status !== undefined && gitHead.status === 0
        const msg = `${alreadyCloned ? 'Updating' : 'Cloning'} AWS JS SDK...
    tag: ${tag}
    git: status=${gitHead.status} output=${gitHead.output.toString()}`
        console.log(msg)

        const gitArgs = alreadyCloned
            ? // Local repo exists already: just update it and checkout the tag.
              // Fetch only the tag we need.
              //      git fetch origin tag v2.950.0 --no-tags
              ['-C', dir, 'fetch', 'origin', 'tag', tag, '--no-tags']
            : // Local repo does not exist: clone it.
              ['clone', '-b', tag, '--depth', '1', 'https://github.com/aws/aws-sdk-js-v3', dir]

        const gitCmd = child_process.execFile('git', gitArgs, { encoding: 'utf8' })

        gitCmd.stderr?.on('data', (data: any) => {
            console.log(data)
        })
        gitCmd.once('close', (code, signal) => {
            gitCmd.stdout?.removeAllListeners()

            // Only needed for the "update" case, but harmless for "clone".
            const gitCheckout = child_process.spawnSync('git', ['-C', dir, 'checkout', '--force', tag])
            if (gitCheckout.status !== undefined && gitCheckout.status !== 0) {
                console.log(`error: git: status=${gitCheckout.status} output=${gitCheckout.output.toString()}`)
            }

            resolve()
        })
    })
}

// Emitted models can contain duplicate shape definitions that are already defined
// These need to be removed for the build to succeed
const conflictingShapes = ['aws.auth#sigv4']
function removeConflicts(model: { shapes: Record<string, any> }) {
    const res = { ...model, shapes: { ...model.shapes } }
    for (const k of Object.keys(model.shapes)) {
        if (conflictingShapes.includes(k)) {
            delete res.shapes[k]
        }
    }

    return res
}

async function replaceModels(repoPath: string, modelPaths: string[]) {
    const modelsDir = path.resolve(repoPath, 'codegen', 'sdk-codegen', 'aws-models')
    const existingModels = await fs.readdir(modelsDir)
    await Promise.all(existingModels.map(f => fs.rm(path.resolve(modelsDir, f))))
    await Promise.all(
        modelPaths.map(async m => {
            const src = path.resolve(process.cwd(), m)
            const dest = path.resolve(modelsDir, path.basename(src))
            const model = removeConflicts(JSON.parse(await fs.readFile(src, 'utf-8')))

            return fs.writeFile(dest, JSON.stringify(model), 'utf-8')
        })
    )
}

/**
 * Generates service clients
 */
async function runTypingsGenerator(repoPath: string): Promise<void> {
    console.log('Generating service clients...')
    const cwd = path.join(repoPath, 'codegen')
    const gradleWrapperPath = path.resolve(cwd, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')

    child_process.execFileSync(gradleWrapperPath, [':sdk-codegen:build'], { cwd, stdio: 'inherit' })
}

async function installGeneratedPackages(repoPath: string, serviceNames: string[]) {
    console.log('Installing packages...')
    const buildPath = path.join(repoPath, 'codegen', 'sdk-codegen', 'build', 'smithyprojections', 'sdk-codegen')
    const packages = serviceNames.map(name => `file://${path.resolve(buildPath, name, 'typescript-codegen')}`)

    // This symlinks the generated packages into `node_modules`
    //
    // We save them as 'optional' because they're generated packages and should not
    // block the normal installation process.
    child_process.execFileSync('npm', ['i', '-O', ...packages], { stdio: 'inherit' })

    function runNpmInPackage(location: string, args: string[]) {
        return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
            child_process.execFile('npm', ['--prefix', location, ...args], (e, stdout, stderr) => {
                if (e) {
                    return reject(e)
                }

                resolve({ stdout, stderr })
            })
        })
    }

    await Promise.all(
        serviceNames.map(async name => {
            const packageLocation = path.join('node_modules', '@aws-sdk', `client-${name.split('.').shift()!}`)
            await runNpmInPackage(packageLocation, ['run', 'build:cjs'])
            await runNpmInPackage(packageLocation, ['run', 'build:types'])
        })
    )
}

;(async () => {
    await generateServiceClients()
})()

// ---------------------------------------------------------------------------------------------------------------------

const smithyModelPaths = [
    'src/shared/telemetry/toolkittelemetry.2017-07-25.json',
    'src/codewhisperer/client/codewhisperer.2022-06-15.json',
    'src/codewhisperer/client/codewhispererruntime.2022-11-11.json',
]
