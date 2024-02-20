/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import * as constants from '../shared/constants'
import * as aslFormats from '../stepFunctions/constants/aslFormats'
import * as fsutil from '../shared/filesystemUtilities'
import * as sysutil from '../shared/systemUtilities'
import * as collectionUtil from '../shared/utilities/collectionUtils'
import globals from './extensionGlobals'
import { telemetry } from './telemetry/telemetry'
import { AwsFiletype } from './telemetry/telemetry'
import * as CloudFormation from './cloudformation/cloudformation'

/** AWS filetypes: vscode language ids */
export const awsFiletypeLangIds = {
    /** vscode language ids registered by AWS Toolkit or other AWS extensions for handling. */
    awsOwned: [aslFormats.JSON_ASL, aslFormats.YAML_ASL, constants.ssmJson, constants.ssmYaml],
    /** generic vscode language ids that possibly are AWS filetypes  */
    ambiguous: ['ini', 'plaintext', aslFormats.JSON_TYPE, aslFormats.YAML_TYPE],
}

/**
 * Maps vscode language ids to AWS filetypes for telemetry.
 */
export function langidToAwsFiletype(langId: string): AwsFiletype {
    switch (langId) {
        case constants.ssmJson:
        case constants.ssmYaml:
            return 'ssmDocument'
        case aslFormats.JSON_ASL:
        case aslFormats.YAML_ASL:
            return 'stepfunctionsAsl'
        default:
            return 'other'
    }
}

/** Returns true if file `f` is somewhere in `~/.aws`. */
export function isAwsConfig(f: string): boolean {
    const awsDir = path.join(sysutil.SystemUtilities.getHomeDirectory(), '.aws')
    if (fsutil.isInDirectory(awsDir, f)) {
        return true
    }
    return false
}

export function isAwsFiletype(doc: vscode.TextDocument): boolean | undefined {
    if (awsFiletypeLangIds.awsOwned.includes(doc.languageId)) {
        return true
    }
    if (isAwsConfig(doc.fileName)) {
        return true
    }
    if (awsFiletypeLangIds.ambiguous.includes(doc.languageId)) {
        return undefined // Maybe
    }
    return false
}

export function activate(): void {
    globals.context.subscriptions.push(
        // TODO: onDidChangeTextDocument ?
        vscode.workspace.onDidOpenTextDocument(async (doc: vscode.TextDocument) => {
            const isAwsFileExt = isAwsFiletype(doc)
            const isSchemaHandled = globals.schemaService.isMapped(doc.uri)
            const cfnTemplate =
                CloudFormation.isValidFilename(doc.uri) && doc.languageId === 'yaml'
                    ? await CloudFormation.tryLoad(doc.uri)
                    : undefined
            const isCfnTemplate = cfnTemplate?.template !== undefined

            if (!isAwsFileExt && !isSchemaHandled && !isCfnTemplate) {
                return
            }

            const basename = path.basename(doc.fileName)
            let fileExt: string | undefined = path.extname(doc.fileName)
            fileExt = fileExt ? fileExt : undefined // Telemetry client will fail on empty string.

            // TODO: ask schemaService for the precise filetype.
            let telemKind = isAwsConfig(doc.fileName) ? 'awsCredentials' : langidToAwsFiletype(doc.languageId)
            if (isCfnTemplate) {
                telemKind = cfnTemplate.kind === 'sam' ? 'cloudformationSam' : 'cloudformation'
            } else if (telemKind === 'other') {
                telemKind = isSchemaHandled ? 'cloudformation' : 'other'
            }

            // HACK: for "~/.aws/foo" vscode sometimes _only_ emits "~/.aws/foo.git".
            if (telemKind === 'awsCredentials' && fileExt === '.git') {
                fileExt = undefined
            }

            // Ensure nice syntax highlighting for ~/.aws/ files.
            if (
                telemKind === 'awsCredentials' &&
                doc.languageId !== 'ini' &&
                (basename === 'credentials' || basename === 'config')
            ) {
                await vscode.languages.setTextDocumentLanguage(doc, 'ini')
            }

            if (await isSameMetricPending(telemKind, fileExt)) {
                return // Avoid redundant/duplicate metrics.
            }

            telemetry.file_editAwsFile.emit({
                awsFiletype: telemKind,
                passive: true,
                result: 'Succeeded',
                filenameExt: fileExt,
            })
        }, undefined)
    )
}

async function isSameMetricPending(filetype: string, fileExt: string | undefined): Promise<boolean> {
    const pendingMetrics = await collectionUtil.first(
        globals.telemetry.findIter(m => {
            const m1 = m.Metadata?.find(o => o.Key === 'awsFiletype')
            const m2 = m.Metadata?.find(o => o.Key === 'filenameExt')
            return m.MetricName === 'file_editAwsFile' && m1?.Value === filetype && m2?.Value === fileExt
        })
    )
    return !!pendingMetrics
}
