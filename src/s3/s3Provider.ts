'use strict';

import * as vscode from 'vscode';
import awsS3 = require('aws-sdk/clients/s3');
import { BucketNode } from './bucketNode';
import { ExplorerNodeBase } from '../shared/explorerNodeBase';

export class S3Provider implements vscode.TreeDataProvider<ExplorerNodeBase> {

    onDidChangeTreeData?: vscode.Event<any> | undefined;

    getTreeItem(element: any): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element.getTreeItem();
    }

    getChildren(element?: any): vscode.ProviderResult<any[]> {

        return new Promise(resolve => {
            this.queryS3Buckets().then(v => resolve(v));
        });
    }

    constructor() {
    }

    constructServiceClient(): awsS3 {
        const opts: awsS3.ClientConfiguration = {
            apiVersion: '2006-03-01',
            region: 'us-west-2'
        };

        return new awsS3(opts);
    }

    async queryS3Buckets() : Promise<BucketNode[]> {
        const s3Client = this.constructServiceClient();

        let arr: BucketNode[] = [];
        try {
            await s3Client.listBuckets()
            .promise()
            .then(r => {
                if (r && r.Buckets) {
                    r.Buckets.forEach(b => {
                        arr.push(new BucketNode(b));
                    });
                }
            });

        } catch (error) {
            // todo
        }

        return arr;
    }
}
