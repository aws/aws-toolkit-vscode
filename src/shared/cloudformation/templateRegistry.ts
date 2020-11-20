/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudFormation } from './cloudformation'
import * as pathutils from '../utilities/pathUtils'
import * as path from 'path'
import { isInDirectory } from '../filesystemUtilities'
import { dotNetRuntimes } from '../../lambda/models/samLambdaRuntime'
import { getLambdaDetails } from '../../lambda/utils'
import { ext } from '../extensionGlobals'
import { WatchedFiles, WatchedItem } from '../watchedFiles'

export interface TemplateDatum {
    path: string
    template: CloudFormation.Template
}

export class CloudFormationTemplateRegistry extends WatchedFiles<CloudFormation.Template> {
    protected name: string = 'CloudFormationTemplateRegistry'
    protected async load(path: string): Promise<CloudFormation.Template> {
        return await CloudFormation.load(path)
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
    unfilteredTemplates: WatchedItem<CloudFormation.Template>[] = ext.templateRegistry.registeredItems
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
                resource.Properties?.Runtime,
                templateDatum.item
            )
            const registeredCodeUri = CloudFormation.getStringForProperty(
                resource.Properties?.CodeUri,
                templateDatum.item
            )
            const registeredHandler = CloudFormation.getStringForProperty(
                resource.Properties?.Handler,
                templateDatum.item
            )

            if (registeredRuntime && registeredHandler && registeredCodeUri) {
                // .NET is currently a special case in that the filepath and handler aren't specific.
                // For now: check if handler matches and check if the code URI contains the filepath.
                // TODO: Can we use Omnisharp to help guide us better?
                if (dotNetRuntimes.includes(registeredRuntime)) {
                    if (
                        handler === registeredHandler &&
                        isInDirectory(
                            pathutils.normalize(path.join(templateDirname, registeredCodeUri)),
                            pathutils.normalize(filepath)
                        )
                    ) {
                        matchingResources.push({ name: key, resourceData: resource })
                    }
                    // Interpreted languages all follow the same spec:
                    // ./path/to/handler/without/file/extension.handlerName
                    // Check to ensure filename and handler both match.
                } else {
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
                        // swallow error from getLambdaDetails: handler not a valid runtime, so skip to the next one
                    }
                }
            }
        }
    }

    return matchingResources
}
