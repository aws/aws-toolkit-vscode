/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as child_process from 'child_process'
import * as del from 'del'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/**
 * This script uses the AWS JS SDK to generate service clients where the client definition is contained within
 * this repo. Client definitions are added at the bottom of this script.
 */

interface ServiceClientDefinition {
    serviceName: string
    serviceJsonPath: string
}

async function generateServiceClients(serviceClientDefinitions: ServiceClientDefinition[]): Promise<void> {
    const tempJsSdkPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vsctk-generate'))
    console.log(`Temp JS SDK Repo location: ${tempJsSdkPath}`)
    console.log('Serivce Clients to Generate: ', serviceClientDefinitions.map(x => x.serviceName).join(', '))

    try {
        await cloneJsSdk(tempJsSdkPath)

        await insertServiceClientsIntoJsSdk(tempJsSdkPath, serviceClientDefinitions)

        await runTypingsGenerator(tempJsSdkPath)

        await integrateServiceClients(tempJsSdkPath, serviceClientDefinitions)

        console.log('Done generating service client(s)')
    } finally {
        // Clean up the temp path
        del.sync([tempJsSdkPath], { force: true })
    }
}

async function cloneJsSdk(destinationPath: string): Promise<void> {
    console.log('Cloning AWS JS SDK...')

    // Output stderr while it clones so it doesn't look frozen
    return new Promise<void>((resolve, reject) => {
        const exec = child_process.execFile(
            'git',
            ['clone', '--depth', '1', 'https://github.com/aws/aws-sdk-js.git', destinationPath],
            {
                encoding: 'utf8'
            }
        )

        exec.stderr.on('data', (data: any) => {
            console.log(data)
        })

        exec.once('close', (code, signal) => {
            exec.stdout.removeAllListeners()
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
    await patchServicesIntoApiMetadata(apiMetadataPath, serviceClientDefinitions.map(x => x.serviceName))
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

    const stdout = child_process.execFileSync('node', ['scripts/typings-generator.js'], {
        encoding: 'utf8',
        cwd: repoPath
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

// tslint:disable-next-line:no-floating-promises
;(async () => {
    const serviceClientDefinitions: ServiceClientDefinition[] = [
        {
            serviceJsonPath: 'src/shared/telemetry/service-2.json',
            serviceName: 'ClientTelemetry'
        }
    ]
    await generateServiceClients(serviceClientDefinitions)
})()
