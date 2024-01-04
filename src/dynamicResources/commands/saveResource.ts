/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getLogger } from '../../shared/logger/logger'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { millisecondsSince, Result } from '../../shared/telemetry/telemetry'
import { compare, Operation } from 'fast-json-patch'
import { ResourceNode } from '../explorer/nodes/resourceNode'
import { ResourceTypeNode } from '../explorer/nodes/resourceTypeNode'
import { AwsResourceManager } from '../awsResourceManager'
import { CloudControlClient } from '../../shared/clients/cloudControlClient'
import { CloudControl } from 'aws-sdk'
import globals from '../../shared/extensionGlobals'
import { telemetry } from '../../shared/telemetry/telemetry'

const localize = nls.loadMessageBundle()

export async function saveResource(
    resourceDoc: vscode.TextDocument,
    resourceManager: AwsResourceManager,
    diagnostics: vscode.DiagnosticCollection
): Promise<boolean> {
    const resource = resourceManager.fromUri(resourceDoc.uri)
    if (resource) {
        try {
            if (resource instanceof ResourceTypeNode) {
                getLogger().info(`saveResource called for new resource (type ${resource.typeName})`)
                const identifier = await createResource(resource.typeName, resourceDoc.getText(), resource.cloudControl)
                if (identifier) {
                    resource.clearChildren()
                    await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', resource)
                    const resourceNodes = (await resource.getChildren()) as ResourceNode[]
                    const newNode = resourceNodes.find(node => node.identifier === identifier)
                    if (newNode) {
                        await resourceManager.open(newNode, true)
                    }
                    await resourceManager.close(resourceDoc.uri)
                    diagnostics.delete(resourceDoc.uri)
                }
                return true
            } else if (resource instanceof ResourceNode) {
                getLogger().info(
                    `saveResource called for existing resource ${resource.identifier} (type ${resource.parent.typeName}))`
                )
                const parent = resource.parent
                const updated = await updateResource(
                    parent.typeName,
                    resource.identifier,
                    resourceDoc.getText(),
                    parent.cloudControl
                )
                if (updated) {
                    diagnostics.delete(resourceDoc.uri)
                    await resourceManager.open(resource, true)
                    return true
                }
            }
        } catch (e) {
            const error = e as Error
            updateDiagnostics(error, resourceDoc, diagnostics)
        }
    }
    return false
}

export async function createResource(
    typeName: string,
    definition: string,
    cloudControl: CloudControlClient
): Promise<string | undefined> {
    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        },
        async progress => {
            const startTime = new globals.clock.Date()
            let result: Result = 'Succeeded'

            try {
                progress.report({
                    message: `Creating resource (${typeName})...`,
                })
                const result = await cloudControl.createResource({
                    TypeName: typeName,
                    DesiredState: JSON.stringify(JSON.parse(definition)),
                })
                const identifier = result.ProgressEvent!.Identifier!
                getLogger().info(`Created resource type ${typeName} identifier ${identifier}`)
                void vscode.window.showInformationMessage(
                    localize('aws.resources.createResource.success', 'Created resource {0} ({1})', identifier, typeName)
                )
                return identifier
            } catch (e) {
                const error = e as Error
                if (error.name === 'UnsupportedActionException') {
                    result = 'Cancelled'
                    getLogger().warn(
                        `Resource type ${typeName} does not support CREATE action in ${cloudControl.regionCode}`
                    )
                    void vscode.window.showWarningMessage(
                        localize(
                            'aws.resources.createResource.unsupported',
                            '{0} does not currently support resource creation in {1}',
                            typeName,
                            cloudControl.regionCode
                        )
                    )
                } else {
                    result = 'Failed'
                    getLogger().error(`Failed to create resource type ${typeName}: %O`, error.message)
                    void showViewLogsMessage(
                        localize('aws.resources.createResource.failure', 'Failed to create resource ({0})', typeName)
                    )
                    throw e
                }
            } finally {
                telemetry.dynamicresource_mutateResource.emit({
                    dynamicResourceOperation: 'Create',
                    duration: millisecondsSince(startTime),
                    resourceType: typeName,
                    result: result,
                })
            }
        }
    )
}

export async function updateResource(
    typeName: string,
    identifier: string,
    definition: string,
    cloudControl: CloudControlClient,
    diff?: Operation[]
): Promise<boolean> {
    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        },
        async progress => {
            const startTime = new globals.clock.Date()
            let result: Result = 'Succeeded'
            try {
                progress.report({
                    message: `Updating resource ${identifier} (${typeName})...`,
                })

                const current = await cloudControl.getResource({
                    TypeName: typeName,
                    Identifier: identifier,
                })
                const patch = diff ?? computeDiff(current.ResourceDescription!, definition)

                if (patch.length === 0) {
                    result = 'Cancelled'
                    void vscode.window.showWarningMessage(
                        localize(
                            'aws.resources.updateResource.noDiff',
                            'Update cancelled - no diff between local and remote definitions',
                            identifier,
                            typeName
                        )
                    )
                    return false
                }

                await cloudControl.updateResource({
                    TypeName: typeName,
                    Identifier: identifier,
                    PatchDocument: JSON.stringify(patch),
                })
                getLogger().info(`Updated resource type ${typeName} identifier ${identifier}`)

                void vscode.window.showInformationMessage(
                    localize('aws.resources.updateResource.success', 'Updated resource {0} ({1})', identifier, typeName)
                )
                return true
            } catch (e) {
                const error = e as Error
                if (error.name === 'UnsupportedActionException') {
                    result = 'Cancelled'
                    getLogger().warn(
                        `Resource type ${typeName} does not support UPDATE action in ${cloudControl.regionCode}`
                    )
                    void vscode.window.showWarningMessage(
                        localize(
                            'aws.resources.createResource.unsupported',
                            '{0} does not currently support resource updating in {1}',
                            typeName,
                            cloudControl.regionCode
                        )
                    )
                    return false
                } else {
                    result = 'Failed'
                    getLogger().error(
                        `Failed to update resource type ${typeName} identifier ${identifier}: %O`,
                        error.message
                    )
                    void showViewLogsMessage(
                        localize(
                            'aws.resources.updateResource.failure',
                            'Failed to update resource {0} ({1})',
                            identifier,
                            typeName
                        )
                    )
                    throw e
                }
            } finally {
                telemetry.dynamicresource_mutateResource.emit({
                    dynamicResourceOperation: 'Update',
                    duration: millisecondsSince(startTime),
                    resourceType: typeName,
                    result: result,
                })
            }
        }
    )
}

function computeDiff(currentDefinition: CloudControl.ResourceDescription, updatedDefinition: string): Operation[] {
    const current = JSON.parse(currentDefinition.Properties!)
    const updated = JSON.parse(updatedDefinition)
    return compare(current, updated)
}

export function updateDiagnostics(err: Error, doc: vscode.TextDocument, diagnostics: vscode.DiagnosticCollection) {
    const range = new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length))
    const diag = new vscode.Diagnostic(range, err.message)
    diagnostics.set(doc.uri, [diag])
    void vscode.commands.executeCommand('workbench.actions.view.problems')
}
