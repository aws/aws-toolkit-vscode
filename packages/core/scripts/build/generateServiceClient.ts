/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as proc from 'child_process'
import * as fs from 'fs-extra'
import * as path from 'path'

const repoRoot = path.join(process.cwd(), '../../') // root/packages/toolkit -> root/
/**
 * This script uses the AWS JS SDK to generate service clients where the client definition is contained within
 * this repo. Client definitions are added at the bottom of this script.
 */

interface ServiceClientDefinition {
    serviceName: string
    serviceJsonPath: string
}

async function generateServiceClients(serviceClientDefinitions: ServiceClientDefinition[]): Promise<void> {
    const tempJsSdkPath = path.join(repoRoot, 'node_modules', '.zzz-awssdk2')
    console.log(`Temp JS SDK Repo location: ${tempJsSdkPath}`)
    console.log('Service Clients to Generate: ', serviceClientDefinitions.map(x => x.serviceName).join(', '))

    await cloneJsSdk(tempJsSdkPath)
    await insertServiceClientsIntoJsSdk(tempJsSdkPath, serviceClientDefinitions)
    await runTypingsGenerator(tempJsSdkPath)
    await integrateServiceClients(tempJsSdkPath, serviceClientDefinitions)

    console.log('Done generating service client(s)')
}

/** When cloning aws-sdk-js, we want to pull the version actually used in package-lock.json. */
function getJsSdkVersion(): string {
    const json = fs.readFileSync(path.resolve(repoRoot, 'package-lock.json')).toString()
    const packageLock = JSON.parse(json)

    return packageLock['packages']['node_modules/aws-sdk']['version']
}

async function cloneJsSdk(dir: string): Promise<void> {
    // Output stderr while it clones so it doesn't look frozen
    return new Promise<void>((resolve, reject) => {
        const sdkversion = getJsSdkVersion()
        if (!sdkversion) {
            throw new Error('failed to get sdk version from package-lock.json')
        }
        const tag = `v${sdkversion}`

        const gitHead = proc.spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'])

        const alreadyCloned = gitHead.status !== undefined && gitHead.status === 0
        const msg = `${alreadyCloned ? 'Updating' : 'Cloning'} AWS JS SDK...
    tag: ${tag}
    git: status=${gitHead.status} output=${gitHead.output.toString()}`
        console.log(msg)

        const gitArgs = alreadyCloned
            ? // Local repo exists already: just update it and checkout the tag.
              // Fetch only the tag we need.
              //      git fetch origin tag v2.950.0 --no-tags
              ['-C', dir, 'fetch', '--quiet', 'origin', 'tag', tag, '--no-tags']
            : // Local repo does not exist: clone it.
              [
                  '-c',
                  'advice.detachedHead=false',
                  'clone',
                  '--quiet',
                  '-b',
                  tag,
                  '--depth',
                  '1',
                  'https://github.com/aws/aws-sdk-js.git',
                  dir,
              ]

        const gitCmd = proc.execFile('git', gitArgs, { encoding: 'utf8' })

        gitCmd.stderr?.on('data', (data: any) => {
            console.log(data)
        })
        gitCmd.once('close', (code, signal) => {
            gitCmd.stdout?.removeAllListeners()

            // Only needed for the "update" case, but harmless for "clone".
            const gitCheckout = proc.spawnSync('git', [
                '-c',
                'advice.detachedHead=false',
                '-C',
                dir,
                'checkout',
                '--force',
                tag,
            ])
            if (gitCheckout.status !== undefined && gitCheckout.status !== 0) {
                console.log(`error: git: status=${gitCheckout.status} output=${gitCheckout.output.toString()}`)
            }

            resolve()
        })
    })
}

async function insertServiceClientsIntoJsSdk(
    jsSdkPath: string,
    serviceClientDefinitions: ServiceClientDefinition[]
): Promise<void> {
    serviceClientDefinitions.forEach(serviceClientDefinition => {
        const apiVersion = getApiVersion(serviceClientDefinition.serviceJsonPath)

        // Copy the Service Json into the JS SDK for generation
        const jsSdkServiceJsonPath = path.join(
            jsSdkPath,
            'apis',
            `${serviceClientDefinition.serviceName.toLowerCase()}-${apiVersion}.normal.json`
        )
        fs.copyFileSync(serviceClientDefinition.serviceJsonPath, jsSdkServiceJsonPath)
    })

    const apiMetadataPath = path.join(jsSdkPath, 'apis', 'metadata.json')
    await patchServicesIntoApiMetadata(
        apiMetadataPath,
        serviceClientDefinitions.map(x => x.serviceName)
    )
}

interface ServiceJsonSchema {
    metadata: {
        apiVersion: string
    }
}

function getApiVersion(serviceJsonPath: string): string {
    const json = fs.readFileSync(serviceJsonPath).toString()
    const serviceJson = JSON.parse(json) as ServiceJsonSchema

    return serviceJson.metadata.apiVersion
}

interface ApiMetadata {
    [key: string]: { name: string }
}

/**
 * Updates the JS SDK's api metadata to contain the provided services
 */
async function patchServicesIntoApiMetadata(apiMetadataPath: string, serviceNames: string[]): Promise<void> {
    console.log(`Patching services (${serviceNames.join(', ')}) into API Metadata...`)

    const apiMetadataJson = fs.readFileSync(apiMetadataPath).toString()
    const apiMetadata = JSON.parse(apiMetadataJson) as ApiMetadata

    serviceNames.forEach(serviceName => {
        apiMetadata[serviceName.toLowerCase()] = { name: serviceName }
    })

    fs.writeFileSync(apiMetadataPath, JSON.stringify(apiMetadata, undefined, 4))
}

/**
 * Generates service clients
 */
async function runTypingsGenerator(repoPath: string): Promise<void> {
    console.log('Generating service client typings...')

    const stdout = proc.execFileSync('node', ['scripts/typings-generator.js'], {
        encoding: 'utf8',
        cwd: repoPath,
    })
    console.log(stdout)
}

/**
 * Copies the generated service clients into the repo
 */
async function integrateServiceClients(
    repoPath: string,
    serviceClientDefinitions: ServiceClientDefinition[]
): Promise<void> {
    for (const serviceClientDefinition of serviceClientDefinitions) {
        await integrateServiceClient(
            repoPath,
            serviceClientDefinition.serviceJsonPath,
            serviceClientDefinition.serviceName
        )
    }
}

/**
 * Copies the generated service client into the repo
 */
async function integrateServiceClient(repoPath: string, serviceJsonPath: string, serviceName: string): Promise<void> {
    const typingsFilename = `${serviceName.toLowerCase()}.d.ts`
    const sourceClientPath = path.join(repoPath, 'clients', typingsFilename)
    const destinationClientPath = path.join(path.dirname(serviceJsonPath), typingsFilename)

    console.log(`Integrating ${typingsFilename} ...`)

    fs.copyFileSync(sourceClientPath, destinationClientPath)

    await sanitizeServiceClient(destinationClientPath)
}

/**
 * Patches the type file imports to be relative to the SDK module
 */
async function sanitizeServiceClient(generatedClientPath: string): Promise<void> {
    console.log('Altering Service Client to fit the codebase...')

    let fileContents = fs.readFileSync(generatedClientPath).toString()

    // Add a header stating the file is autogenerated
    fileContents = `
/**
 * THIS FILE IS AUTOGENERATED BY 'generateServiceClient.ts'.
 * DO NOT EDIT BY HAND.
 */

${fileContents}
    `

    fileContents = fileContents.replace(/(import .* from.*)\.\.(.*)/g, '$1aws-sdk$2')

    fs.writeFileSync(generatedClientPath, fileContents)
}

// ---------------------------------------------------------------------------------------------------------------------

void (async () => {
    const serviceClientDefinitions: ServiceClientDefinition[] = [
        {
            serviceJsonPath: 'src/shared/telemetry/service-2.json',
            serviceName: 'ClientTelemetry',
        },
        {
            serviceJsonPath: 'src/codewhisperer/client/service-2.json',
            serviceName: 'CodeWhispererClient',
        },
        {
            serviceJsonPath: 'src/codewhisperer/client/user-service-2.json',
            serviceName: 'CodeWhispererUserClient',
        },
        {
            serviceJsonPath: 'src/amazonqFeatureDev/client/codewhispererruntime-2022-11-11.json',
            serviceName: 'FeatureDevProxyClient',
        },
    ]
    await generateServiceClients(serviceClientDefinitions)
})()
