/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { getLogger } from '../../shared/logger/logger'
import { Result } from '../../shared/telemetry/telemetry'
import { ResourceNode } from '../explorer/nodes/resourceNode'
import { AwsResourceManager, TypeSchema } from '../awsResourceManager'
import { telemetry } from '../../shared/telemetry/telemetry'
const localize = nls.loadMessageBundle()

export async function openResource(opts: {
    source: ResourceNode | vscode.Uri
    preview: boolean
    resourceManager: AwsResourceManager
    diagnostics: vscode.DiagnosticCollection
}): Promise<void> {
    const resource = opts.source instanceof vscode.Uri ? opts.resourceManager.fromUri(opts.source) : opts.source
    if (!resource || !(resource instanceof ResourceNode)) {
        throw new Error('could not resolve resource')
    }
    getLogger().info(`openResource called for type ${resource.parent.typeName} identifier ${resource.identifier}`)

    return await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        },
        async progress => {
            let result: Result = 'Succeeded'

            progress.report({
                message: `Opening resource ${resource.identifier} (${resource.parent.typeName})...`,
            })

            try {
                const editor = await opts.resourceManager.open(resource, opts.preview)
                if (!opts.preview) {
                    void vscode.window.showWarningMessage(
                        localize(
                            'aws.resources.editResource.notice',
                            'You are editing an AWS resource. Any saved changes will be reflected on the remote resource.'
                        )
                    )
                    const schema = opts.resourceManager.getSchema(resource.parent.typeName)
                    if (schema) {
                        const diag = getDiagnostics(schema, editor.document)
                        opts.diagnostics.set(editor.document.uri, diag)
                    }
                }
            } catch (err) {
                const error = err as Error
                const errorMessage = localize(
                    'AWS.message.error.resources.openResource.failed',
                    'Failed to open resource {0} ({1})',
                    resource.identifier,
                    resource.parent.typeName
                )

                void vscode.window.showErrorMessage(errorMessage)
                getLogger().error('Error opening resource: %s', error)
                result = 'Failed'
            } finally {
                telemetry.dynamicresource_getResource.emit({
                    resourceType: resource.parent.typeName,
                    result: result,
                })
            }
        }
    )
}

export function getDiagnostics(schema: TypeSchema, doc: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = []
    const text = doc.getText()
    if (schema.createOnlyProperties) {
        for (const property of schema.createOnlyProperties) {
            const propertyName = getPropertyName(property)
            const range = getPropertyRange(propertyName, text, doc)
            if (range) {
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        localize(
                            'AWS.message.information.resources.createOnlyProperty',
                            '"{0}" is a create-only property and cannot be modified on an existing resource',
                            propertyName
                        ),
                        vscode.DiagnosticSeverity.Information
                    )
                )
            }
        }
    }

    if (schema.readOnlyProperties) {
        for (const property of schema.readOnlyProperties) {
            const propertyName = getPropertyName(property)
            const range = getPropertyRange(propertyName, text, doc)
            if (range) {
                diagnostics.push(
                    new vscode.Diagnostic(
                        range,
                        localize(
                            'AWS.message.information.resources.readOnlyProperty',
                            '"{0}" is a read-only property and cannot be modified',
                            propertyName
                        ),
                        vscode.DiagnosticSeverity.Information
                    )
                )
            }
        }
    }
    return diagnostics
}

function getPropertyName(property: string) {
    // the returned format is `/properties/<propertyName>`
    return property.slice(property.lastIndexOf('/') + 1)
}

function getPropertyRange(property: string, text: string, doc: vscode.TextDocument): vscode.Range | undefined {
    const index = text.indexOf(`"${property}":`)
    if (index > -1) {
        const start = doc.positionAt(index)
        return new vscode.Range(start, doc.lineAt(start.line).range.end)
    }
}
