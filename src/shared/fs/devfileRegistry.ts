/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { WatchedFiles } from './watchedFiles'
import * as yaml from 'js-yaml'
import * as pathutils from '../utilities/pathUtils'
import * as filesystemUtilities from '../filesystemUtilities'
import { SystemUtilities } from '../systemUtilities'
import { ext } from '../extensionGlobals'
import { getLogger } from '../logger/logger'

export const DEVFILE_GLOB_PATTERN = '**/devfile.{yaml,yml}'

export class DevfileRegistry extends WatchedFiles<Devfile> {
    protected name = 'DevfileRegistry'

    protected async load(path: string): Promise<Devfile | undefined> {
        if (!(await SystemUtilities.fileExists(path))) {
            throw new Error(`Devfile not found: ${path}`)
        }

        try {
            const templateAsYaml: string = await filesystemUtilities.readFileAsString(path)
            const devfile = yaml.load(templateAsYaml) as Devfile
            // legacy (1.x) Devfiles do not contain a schemaVersion
            if (devfile.schemaVersion) {
                ext.schemaService.registerMapping({ path, type: 'yaml', schema: 'devfile' })
                return devfile
            }
        } catch (e) {
            getLogger().warn(`could not load Devfile ${path}: ${e}`)
        }
        ext.schemaService.registerMapping({ path, type: 'yaml', schema: undefined })
        return undefined
    }

    public async remove(path: string | vscode.Uri): Promise<void> {
        ext.schemaService.registerMapping({
            path: typeof path === 'string' ? path : pathutils.normalize(path.fsPath),
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
