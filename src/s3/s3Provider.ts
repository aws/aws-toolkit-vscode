'use strict';

import * as vscode from 'vscode';
import { BucketNode } from './explorer/bucketNode';
import { ExplorerNodeBase, IRefreshableAWSTreeProvider } from '../shared/nodes';
import { AWSContext } from '../shared/awsContext';
import { ext } from '../shared/extensionGlobals';
import { listBuckets } from './utils';

export class S3Provider implements vscode.TreeDataProvider<ExplorerNodeBase>, IRefreshableAWSTreeProvider {

    private _onDidChangeTreeData: vscode.EventEmitter<BucketNode | undefined> = new vscode.EventEmitter<BucketNode | undefined>();
    readonly onDidChangeTreeData: vscode.Event<BucketNode | undefined> = this._onDidChangeTreeData.event;

    public viewProviderId: string = 's3';

    public initialize(): void {
        ext.treesToRefreshOnContextChange.push(this);
    }

    getTreeItem(element: any): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element.getTreeItem();
    }

    getChildren(element?: any): vscode.ProviderResult<any[]> {

        return new Promise(resolve => {
            listBuckets().then(v => resolve(v));
        });
    }

    refresh(context: AWSContext) {
        this._onDidChangeTreeData.fire();
    }


    constructor() {
    }
}
