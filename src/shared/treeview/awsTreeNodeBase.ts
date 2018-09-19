/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 */

'use strict'

import { Command, Disposable, TreeItem } from 'vscode'
import { AwsContext } from '../awsContext'

export abstract class AWSTreeNodeBase extends Disposable {

    public readonly supportsPaging: boolean = false

    protected children: AWSTreeNodeBase[] | undefined
    protected disposable: Disposable | undefined

    constructor() {
        super(() => this.dispose())
    }

    dispose() {
        if (this.disposable !== undefined) {
            this.disposable.dispose()
            this.disposable = undefined
        }

        this.resetChildren()
    }

    public abstract getTreeItem(): TreeItem

    public abstract getChildren(): Thenable<AWSTreeNodeBase[]>

    public getCommand(): Command | undefined {
        return undefined
    }

    public refresh(newContext: AwsContext): void { }

    public resetChildren(): void {
        if (this.children !== undefined) {
            this.children.forEach(c => c.dispose())
            this.children = undefined
        }
    }
}

