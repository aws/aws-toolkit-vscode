/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { WatchedFiles } from './watchedFiles'
import * as yaml from 'js-yaml'
import * as filesystemUtilities from '../filesystemUtilities'
import { SystemUtilities } from '../systemUtilities'
import { getLogger } from '../logger/logger'
import globals from '../extensionGlobals'

export const devfileGlobPattern = '**/devfile.{yaml,yml}'

export class DevfileRegistry extends WatchedFiles<Devfile> {
    public name = 'DevfileRegistry'

    protected async process(uri: vscode.Uri, contents?: string): Promise<Devfile | undefined> {
        if (!(await SystemUtilities.fileExists(uri))) {
            throw new Error(`Devfile not found: ${uri.fsPath}`)
        }

        try {
            const templateAsYaml: string = await filesystemUtilities.readFileAsString(uri.fsPath)
            const devfile = yaml.load(templateAsYaml) as Devfile
            // legacy (1.x) Devfiles do not contain a schemaVersion
            if (devfile.schemaVersion) {
                globals.schemaService.registerMapping({ uri, type: 'yaml', schema: 'devfile' })
                return devfile
            }
        } catch (e) {
            getLogger().warn(`could not load Devfile "${uri.fsPath}": ${e}`)
        }
        globals.schemaService.registerMapping({ uri, type: 'yaml', schema: undefined })
        return undefined
    }

    public override async remove(path: vscode.Uri): Promise<void> {
        const uri = typeof path === 'string' ? vscode.Uri.parse(path, true) : path
        globals.schemaService.registerMapping({
            uri: uri,
            type: 'yaml',
            schema: undefined,
        })
        await super.remove(path)
    }
}

export interface Devfile {
    schemaVersion?: string

    metadata?: {
        [key: string]: string | undefined
    }
    components?: {
        [key: string]: string | undefined
    }
}
