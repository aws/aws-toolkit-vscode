'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase } from '../shared/explorerNodeBase';
import { GuideNode } from './guideNode';
import { URL } from 'url';

export class GuidesNode extends ExplorerNodeBase {

    rootNodes: ExplorerNodeBase[] = [
        new GuideNode('Developer Guide', new URL('https://docs.aws.amazon.com/lambda/latest/dg/welcome.html')),
        new GuideNode('API Reference', new URL('https://docs.aws.amazon.com/lambda/latest/dg/API_Reference.html'))
    ];

    getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]> {
        return this.rootNodes;
    }

    getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem('Reference Guides', vscode.TreeItemCollapsibleState.Collapsed);
        item.tooltip = 'Reference materials for working with AWS Lambda';

        return item;
    }
}

