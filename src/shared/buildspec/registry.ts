/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as yaml from 'js-yaml'
import globals from '../extensionGlobals'
import { WatchedFiles } from '../fs/watchedFiles'
import { isUntitledScheme } from '../utilities/vsCodeUtils'
import { SystemUtilities } from '../systemUtilities'

interface BuildspecTemplate {
    version?: unknown
    phases?: unknown
}

export class BuildspecTemplateRegistry extends WatchedFiles<BuildspecTemplate> {
    protected name: string = 'BuildspecTemplateRegistry'
    protected async process(uri: vscode.Uri, contents?: string): Promise<BuildspecTemplate | undefined> {
        let template: BuildspecTemplate | undefined
        try {
            if (isUntitledScheme(uri)) {
                if (!contents) {
                    // this error technically just throw us into the catch so the error message isn't used
                    throw new Error('Contents must be defined for untitled uris')
                }
                template = yaml.load(contents, {}) as BuildspecTemplate
            } else {
                const templateAsYaml: string = await SystemUtilities.readFile(uri)
                template = yaml.load(templateAsYaml, {}) as BuildspecTemplate
            }
        } catch (e) {
            globals.schemaService.registerMapping({ uri, type: 'yaml', schema: undefined, registry: this.name })
            return undefined
        }

        if (template && template.version && template.phases) {
            globals.schemaService.registerMapping({ uri, type: 'yaml', schema: 'buildspec', registry: this.name })
            return template
        }

        globals.schemaService.registerMapping({ uri, type: 'yaml', schema: undefined, registry: this.name })
        return undefined
    }

    public async remove(uri: vscode.Uri): Promise<void> {
        globals.schemaService.registerMapping({
            uri,
            type: 'yaml',
            schema: undefined,
            registry: this.name,
        })
        await super.remove(uri)
    }
}
