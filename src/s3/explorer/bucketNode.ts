'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import S3 = require('aws-sdk/clients/s3');
import { ExplorerNodeBase } from '../../shared/nodes';

export class BucketNode extends ExplorerNodeBase {
    constructor(
        public readonly bucket: S3.Bucket,
        public readonly s3: S3
    ) {
		super();
	}

    getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]> {
        return [];
    }

    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem(this.bucket.Name as string, vscode.TreeItemCollapsibleState.None);
        item.tooltip = `${this.bucket.Name}`;
        item.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 's3_bucket.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 's3_bucket.svg')
        };

        return item;
    }
}
