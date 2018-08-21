'use strict';

import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { AWSTreeNodeBase } from '../../shared/awsTreeNodeBase';
import { GuideNode } from './guideNode';
import { URL } from 'url';

export class GuidesNode extends AWSTreeNodeBase {

    rootNodes: AWSTreeNodeBase[] = [
        new GuideNode('Developer Guide', new URL('https://docs.aws.amazon.com/lambda/latest/dg/welcome.html')),
        new GuideNode('API Reference', new URL('https://docs.aws.amazon.com/lambda/latest/dg/API_Reference.html'))
    ];

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return new Promise(resolve => resolve(this.rootNodes));
    }

    public getTreeItem(): TreeItem {
        const item = new TreeItem('Reference Guides', TreeItemCollapsibleState.Collapsed);
        item.tooltip = 'Reference materials for working with AWS Lambda';

        return item;
    }
}

