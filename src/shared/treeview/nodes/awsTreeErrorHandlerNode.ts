/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { getLogger, Logger } from '../../logger'
import { AWSTreeNodeBase } from './awsTreeNodeBase'
import { ErrorNode } from './errorNode'

export abstract class AWSTreeErrorHandlerNode extends AWSTreeNodeBase {
    protected errorNode?: ErrorNode

    protected constructor(
        label: string,
        collapsibleState?: TreeItemCollapsibleState
    ) {
        super(label, collapsibleState)
    }

    protected async handleErrorProneOperation(operation: () => Promise<void>, errorLabel: string) {
        const logger: Logger = getLogger()
        this.errorNode = undefined
        try {
            await operation()
        } catch (err) {
            const error = err as Error
            this.errorNode = new ErrorNode(this, error, errorLabel)

            // TODO: Make the possibility to ErrorNode attempt to retry the operation
            logger.error(error)
        }
    }
}
