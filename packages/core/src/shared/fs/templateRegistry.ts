/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { readFileSync } from 'fs'
import * as CloudFormation from '../cloudformation/cloudformation'
import * as pathutils from '../utilities/pathUtils'
import * as path from 'path'
import { isInDirectory } from '../filesystemUtilities'
import { dotNetRuntimes, goRuntimes, javaRuntimes } from '../../lambda/models/samLambdaRuntime'
import { getLambdaDetails } from '../../lambda/utils'
import { WatchedFiles, WatchedItem } from './watchedFiles'
import { getLogger } from '../logger'
import globals from '../extensionGlobals'
import { Timeout } from '../utilities/timeoutUtils'
import { localize } from '../utilities/vsCodeUtils'
import { PerfLog } from '../logger/logger'
import { showMessageWithCancel } from '../utilities/messages'

export class CloudFormationTemplateRegistry extends WatchedFiles<CloudFormation.Template> {
    public name: string = 'CloudFormationTemplateRegistry'

    protected async process(uri: vscode.Uri, contents?: string): Promise<CloudFormation.Template | undefined> {
        // P0: Assume all template.yaml/yml files are CFN templates and assign correct JSON schema.
        // P1: Alter registry functionality to search ALL YAML files and apply JSON schemas + add to registry based on validity

        const r = await CloudFormation.tryLoad(uri, contents)
        if (r.kind === undefined) {
            globals.schemaService.registerMapping({ uri, type: 'yaml', schema: undefined })
            return undefined
        }

        if (r.kind === 'sam') {
            globals.schemaService.registerMapping({ uri, type: 'yaml', schema: 'sam' })
        } else if (r.kind === 'cfn') {
            globals.schemaService.registerMapping({ uri, type: 'yaml', schema: 'cfn' })
        }

        return r.template
    }

    // handles delete case
    public override async remove(uri: vscode.Uri): Promise<void> {
        globals.schemaService.registerMapping({
            uri,
            type: 'yaml',
            schema: undefined,
        })
        await super.remove(uri)
    }
}

/**
 * The purpose of this class is to resolve a {@link CloudFormationTemplateRegistry}
 * instance once the given setup is complete.
 *
 * This solves the issue where setup can take a while and if we
 * block on it the entire extension startup time is increased.
 */
export class AsyncCloudFormationTemplateRegistry {
    /** Setup of the registry can take a while, this property indicates it is done */
    private isSetup = false
    private setupPromise: Thenable<CloudFormationTemplateRegistry> | undefined

    /**
     * @param asyncSetupFunc registry setup that will be run async
     */
    constructor(
        private readonly instance: CloudFormationTemplateRegistry,
        private readonly asyncSetupFunc: (
            instance: CloudFormationTemplateRegistry,
            cancelSetup: Timeout,
            onItem?: (total: number, i: number, cancelled: boolean) => void
        ) => Promise<CloudFormationTemplateRegistry>
    ) {}

    /**
     * Returns the initial registry instance if setup has completed, otherwise returns a temporary
     * instance and shows a progress message ("Scanning...") until setup is done.
     */
    async getInstance(): Promise<CloudFormationTemplateRegistry> {
        if (this.isSetup) {
            return this.instance
        }
        if (this.setupPromise) {
            getLogger().debug('%s: getInstance() requested, still initializing', this.instance.name)
            return this.setupPromise
        }

        // Show a "Scanning..." progress message until setup is done.
        const cancelSetup = new Timeout(30 * 60 * 1000) // 30 min
        const msg = localize(
            'AWS.codelens.waitingForTemplateRegistry',
            'Scanning CloudFormation templates (except [search.exclude](command:workbench.action.openSettings?"@id:search.exclude"))'
        )
        const progress = await showMessageWithCancel(msg, cancelSetup)

        const perf = new PerfLog(`${this.instance.name}: template registry setup`)
        this.setupPromise = this.asyncSetupFunc(this.instance, cancelSetup, (total: number, i: number) => {
            if (cancelSetup.completed) {
                getLogger().debug('%s: getInstance() cancelled', this.instance.name)
                return
            }
            if (total !== 0) {
                progress.report({ increment: 100 * (1 / total), message: i.toString() })
            }
        })

        this.setupPromise.then(
            () => {
                if (perf) {
                    perf.done()
                }
                this.isSetup = true
                cancelSetup.dispose()
            },
            e => {
                getLogger().error('AsyncCloudFormationTemplateRegistry: setupPromise failed: %s', (e as Error).message)
            }
        )

        return this.setupPromise
    }
}

/**
 * Gets resources and additional metadata for resources tied to a filepath and handler.
 * Checks all registered templates by default; otherwise can operate on a subset TemplateDatum[]
 * @param filepath Handler file's path
 * @param handler Handler function from aforementioned file
 * @param unfilteredTemplates Array containing TemplateDatum objects to filter
 */
export function getResourcesForHandler(
    filepath: string,
    handler: string,
    unfilteredTemplates: WatchedItem<CloudFormation.Template>[]
): { templateDatum: WatchedItem<CloudFormation.Template>; name: string; resourceData: CloudFormation.Resource }[] {
    // TODO: Array.flat and Array.flatMap not introduced until >= Node11.x -- migrate when VS Code updates Node ver
    const o = unfilteredTemplates.map(templateDatum => {
        return getResourcesForHandlerFromTemplateDatum(filepath, handler, templateDatum).map(resource => {
            return {
                ...resource,
                templateDatum,
            }
        })
    })
    if (o.length === 0) {
        return []
    }
    return o.reduce((acc, cur) => [...acc, ...cur])
}

/**
 * Returns an array of Cloudformation Resources in a TemplateDatum that is tied to the filepath and handler given.
 * @param filepath Handler file's path
 * @param handler Handler function from aforementioned file
 * @param templateDatum TemplateDatum object to search through
 */
export function getResourcesForHandlerFromTemplateDatum(
    filepath: string,
    handler: string,
    templateDatum: WatchedItem<CloudFormation.Template>
): { name: string; resourceData: CloudFormation.Resource }[] {
    const matchingResources: { name: string; resourceData: CloudFormation.Resource }[] = []
    const templateDirname = path.dirname(templateDatum.path)
    // template isn't a parent or sibling of file
    if (!isInDirectory(templateDirname, path.dirname(filepath))) {
        return []
    }

    // no resources
    const resources = templateDatum.item.Resources
    if (!resources) {
        return []
    }

    for (const key of Object.keys(resources)) {
        const resource = resources[key]
        // check if some sort of serverless function
        if (
            resource &&
            [CloudFormation.SERVERLESS_FUNCTION_TYPE, CloudFormation.LAMBDA_FUNCTION_TYPE].includes(resource.Type)
        ) {
            // parse template values that could potentially be refs
            const registeredRuntime = CloudFormation.getStringForProperty(
                resource.Properties,
                'Runtime',
                templateDatum.item
            )
            const registeredCodeUri = CloudFormation.getStringForProperty(
                resource.Properties,
                'CodeUri',
                templateDatum.item
            )
            const registeredHandler = CloudFormation.getStringForProperty(
                resource.Properties,
                'Handler',
                templateDatum.item
            )

            // properties for image type templates
            const registeredPackageType = CloudFormation.getStringForProperty(
                resource.Properties,
                'PackageType',
                templateDatum.item
            )
            const registeredDockerContext = CloudFormation.getStringForProperty(
                resource.Metadata,
                'DockerContext',
                templateDatum.item
            )
            const registeredDockerFile = CloudFormation.getStringForProperty(
                resource.Metadata,
                'Dockerfile',
                templateDatum.item
            )

            if (registeredRuntime && registeredHandler && registeredCodeUri) {
                // Java and .NET are currently special cases in that the filepath and handler aren't specific.
                // For now: check if handler matches and check if the code URI contains the filepath.
                // TODO: Can we use Omnisharp or some sort of Java tooling to help guide us better?
                if (dotNetRuntimes.includes(registeredRuntime) || javaRuntimes.includes(registeredRuntime)) {
                    if (
                        handler === registeredHandler &&
                        isInDirectory(
                            pathutils.normalize(path.join(templateDirname, registeredCodeUri)),
                            pathutils.normalize(filepath)
                        )
                    ) {
                        matchingResources.push({ name: key, resourceData: resource })
                    }
                } else if (goRuntimes.includes(registeredRuntime)) {
                    // Go is another special case. The handler merely refers to the compiled binary.
                    // We ignore checking for a handler name match, since it is not relevant
                    // See here: https://github.com/aws/aws-lambda-go
                    if (
                        isInDirectory(
                            pathutils.normalize(path.join(templateDirname, registeredCodeUri)),
                            pathutils.normalize(filepath)
                        )
                    ) {
                        matchingResources.push({ name: key, resourceData: resource })
                    }
                } else {
                    // Interpreted languages all follow the same spec:
                    // ./path/to/handler/without/file/extension.handlerName
                    // Check to ensure filename and handler both match.
                    try {
                        const parsedLambda = getLambdaDetails({
                            Handler: registeredHandler,
                            Runtime: registeredRuntime,
                        })
                        const functionName = handler.split('.').pop()
                        if (
                            pathutils.normalize(filepath) ===
                                pathutils.normalize(
                                    path.join(templateDirname, registeredCodeUri, parsedLambda.fileName)
                                ) &&
                            functionName === parsedLambda.functionName
                        ) {
                            matchingResources.push({ name: key, resourceData: resource })
                        }
                    } catch (e) {
                        getLogger().warn(
                            `Resource ${key} in template ${templateDirname} has invalid runtime for handler ${handler}: ${registeredRuntime}`
                        )
                    }
                }
                // not direct-invoke type, attempt image type
            } else if (registeredPackageType === 'Image' && registeredDockerContext && registeredDockerFile) {
                // path must be inside dockerDir
                const dockerDir = path.join(templateDirname, registeredDockerContext)
                if (isInDirectory(dockerDir, filepath)) {
                    let adjustedHandler: string = handler
                    if (!filepath.endsWith('.cs')) {
                        // reframe path to be relative to dockerDir instead of package.json
                        // omit filename and append filename + function name from handler
                        const relPath = path.relative(dockerDir, path.dirname(filepath))
                        const handlerParts = pathutils.normalizeSeparator(handler).split('/')
                        adjustedHandler = pathutils.normalizeSeparator(
                            path.join(relPath, handlerParts[handlerParts.length - 1])
                        )
                    }
                    try {
                        // open dockerfile and see if it has a handler that matches the handler represented by this file
                        const fileText = readFileSync(path.join(dockerDir, registeredDockerFile)).toString()
                        // exact match within quotes to avoid shorter paths being picked up
                        if (
                            new RegExp(`['"]${adjustedHandler}['"]`, 'g').test(pathutils.normalizeSeparator(fileText))
                        ) {
                            matchingResources.push({ name: key, resourceData: resource })
                        }
                    } catch (e) {
                        // file read error
                        getLogger().error(e as Error)
                    }
                }
            } else {
                getLogger().verbose(`Resource ${key} in template ${templateDirname} does not match handler ${handler}`)
            }
        }
    }

    return matchingResources
}
