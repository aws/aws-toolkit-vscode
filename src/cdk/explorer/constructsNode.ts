'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase } from '../../shared/nodes';
import { ServiceConstructsNode } from './serviceConstructsNode';
import { ConstructNode } from './constructNode';

export class ConstructsNode extends ExplorerNodeBase {

    // todo: these should all be read from a manifest, downloaded at
    // runtime or provided from fall-back resources in case of no
    // connectivity
    ec2Constructs: ServiceConstructsNode = new ServiceConstructsNode(
        'EC2',
        'Amazon Elastic Compute Cloud',
        [
            new ConstructNode('Stack'),
            new ConstructNode('Fleet'),
            new ConstructNode('HttpLoadBalancer'),
            new ConstructNode('MachineImage'),
            new ConstructNode('VpcNetwork'),
            new ConstructNode('VpcSubnetwork'),
            new ConstructNode('...other constructs...')
        ]);

    s3Constructs: ServiceConstructsNode = new ServiceConstructsNode(
        'S3',
        'Amazon Simple Storage Service',
        [
            new ConstructNode('Bucket'),
            new ConstructNode('...other constructs...')
        ]
    );

    iamConstructs: ServiceConstructsNode = new ServiceConstructsNode(
        'IAM',
        'Identity and Access Management',
        [
            new ConstructNode('RootUser'),
            new ConstructNode('Role'),
            new ConstructNode('RoleTarget'),
            new ConstructNode('ServiceRole'),
            new ConstructNode('...other constructs...')
        ]
    );

    getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]> {
        return [
            this.ec2Constructs,
            this.iamConstructs,
            this.s3Constructs
        ];
    }

    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem('Constructs', vscode.TreeItemCollapsibleState.Expanded);
        item.tooltip = 'CDK Constructs toolbox';

        return item;
    }
}
