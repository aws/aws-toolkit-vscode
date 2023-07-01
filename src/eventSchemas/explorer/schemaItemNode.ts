/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schemas } from 'aws-sdk'

import * as os from 'os'
import { SchemaClient } from '../../shared/clients/schemaClient'

import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { getIcon } from '../../shared/icons'
import { localize } from '../../shared/utilities/vsCodeUtils'

export class SchemaItemNode extends AWSTreeNodeBase {
    public constructor(
        private schemaItem: Schemas.SchemaSummary,
        public readonly client: SchemaClient,
        public readonly registryName: string
    ) {
        super('')
        this.update(schemaItem)
        this.contextValue = 'awsSchemaItemNode'
        this.iconPath = getIcon('aws-schemas-schema')
        this.command = {
            command: 'aws.viewSchemaItem',
            title: localize('AWS.command.viewSchemaItem', 'Open Schema'),
            arguments: [this],
        }
    }

    public update(schemaItem: Schemas.SchemaSummary): void {
        this.schemaItem = schemaItem
        this.label = this.schemaItem.SchemaName || ''
        let schemaArn = ''
        if (this.schemaItem.SchemaArn) {
            schemaArn = `${os.EOL}${this.schemaItem.SchemaArn}`
        }
        this.tooltip = `${this.schemaItem.SchemaName}${schemaArn}`
    }

    public get schemaName(): string {
        return this.schemaItem.SchemaName || ''
    }

    public async getSchemaContent(): Promise<string> {
        const response = await this.client.describeSchema(this.registryName, this.schemaName)

        return response.Content!
    }

    public async listSchemaVersions(): Promise<Schemas.SchemaVersionSummary[]> {
        const versions = await toArrayAsync(this.client.listSchemaVersions(this.registryName, this.schemaName))

        return versions
    }
}
