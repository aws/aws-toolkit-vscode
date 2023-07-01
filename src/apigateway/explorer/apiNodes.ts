/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { RestApi } from 'aws-sdk/clients/apigateway'

export class RestApiNode extends AWSTreeNodeBase implements AWSResourceNode {
    public override id!: string

    public constructor(
        public readonly parent: AWSTreeNodeBase,
        public readonly partitionId: string,
        public override readonly regionCode: string,
        private api: RestApi
    ) {
        super('')
        this.update(api)
        this.contextValue = 'awsApiGatewayNode'
    }

    public update(api: RestApi): void {
        this.api = api
        this.label = `${this.api.name} (${this.api.id})` || ''
        this.tooltip = this.api.description

        if (api.id === undefined) {
            throw new Error('REST API id expected but not found')
        }

        this.id = api.id
    }

    public get name(): string {
        if (this.api.name === undefined) {
            throw new Error('REST API name expected but not found')
        }

        return this.api.name
    }

    public get arn(): string {
        return `arn:${this.partitionId}:apigateway:${this.regionCode}::/apis/${this.api.id}`
    }
}
