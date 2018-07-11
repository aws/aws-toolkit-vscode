'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { ExplorerNodeBase } from '../../shared/nodes';
import { URL } from 'url';

export class GuideNode extends ExplorerNodeBase {

    public static contextValue: string = 'awsLambdaGuide';
    public contextValue: string = GuideNode.contextValue;

    constructor(
        public readonly guideName: string,
        public readonly guideUri: URL
    ) {
        super();
    }

    public getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]> {
       return [];
    }

    public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem(`${this.guideName}`, vscode.TreeItemCollapsibleState.Collapsed);
        item.tooltip = `${this.guideUri}`;
        item.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'lambda_function.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'lambda_function.svg')
        };

        return item;
    }
}

