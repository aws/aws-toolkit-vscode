/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Lambda } from 'aws-sdk'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'

export abstract class FunctionNodeBase extends AWSTreeNodeBase {
    public abstract readonly regionCode: string

    protected constructor(
        public configuration: Lambda.FunctionConfiguration
    ) {
        super('')
        this.update(configuration)
    }

    public update(configuration: Lambda.FunctionConfiguration): void {
        this.configuration = configuration
        this.label = this.configuration.FunctionName || ''
        this.tooltip = `${this.configuration.FunctionName}-${this.configuration.FunctionArn}`
    }
}
