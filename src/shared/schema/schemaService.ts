/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { VSCODE_EXTENSION_ID } from '../extensions'
import { activateYamlExtension, YamlExtension } from '../extensions/yaml'
import { normalizeSeparator } from '../utilities/pathUtils'
import { getSchemas, SchemaType } from './schemas'

export type Schemas = { [key in SchemaType]?: vscode.Uri }

export interface SchemaMapping {
    path: string
    schema: SchemaType
}

/**
 * Processes the update of schema mappings for files in the workspace
 */
export class SchemaService {
    private static readonly DEFAULT_UPDATE_PERIOD_MILLIS = 1000

    private updatePeriod: number
    private timer?: NodeJS.Timer

    private updateQueue: SchemaMapping[] = []
    private schemas?: Schemas

    public constructor(
        private readonly extensionContext: vscode.ExtensionContext,
        private yamlExtension?: YamlExtension,
        opts?: {
            schemas?: Schemas
            updatePeriod?: number
        }
    ) {
        this.updatePeriod = opts?.updatePeriod ?? SchemaService.DEFAULT_UPDATE_PERIOD_MILLIS
        this.schemas = opts?.schemas
    }

    public async start(): Promise<void> {
        getSchemas(this.extensionContext).then(schemas => (this.schemas = schemas))
        await this.startTimer()
    }

    public registerMapping(mapping: SchemaMapping): void {
        this.updateQueue.push(mapping)
    }

    public async processUpdates(): Promise<void> {
        if (this.updateQueue.length === 0 || !this.schemas) {
            return
        }

        if (!this.yamlExtension) {
            if (!vscode.extensions.getExtension(VSCODE_EXTENSION_ID.yaml)) {
                return
            }
            this.yamlExtension = await activateYamlExtension()
        }

        const batch = this.updateQueue.splice(0, this.updateQueue.length)
        for (const mapping of batch) {
            const path = vscode.Uri.file(normalizeSeparator(mapping.path))
            const type = mapping.schema
            if (type !== 'none') {
                this.yamlExtension.assignSchema(path, this.schemas[type]!)
            } else {
                this.yamlExtension.removeSchema(path)
            }
        }
    }

    private async startTimer(): Promise<void> {
        this.timer = setTimeout(
            // this is async so that we don't have pseudo-concurrent invocations of the callback
            async () => {
                await this.processUpdates()
                // Race: _timer may be undefined after shutdown() (this async
                // closure may be pending on the event-loop, despite clearTimeout()).
                if (this.timer !== undefined) {
                    this.timer!.refresh()
                }
            },
            this.updatePeriod
        )
    }
}
