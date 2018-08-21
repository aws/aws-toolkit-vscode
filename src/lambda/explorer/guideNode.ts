'use strict';

import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import * as path from 'path';
import { AWSTreeNodeBase } from '../../shared/awsTreeNodeBase';
import { URL } from 'url';

export class GuideNode extends AWSTreeNodeBase {

    public static contextValue: string = 'awsLambdaGuide';
    public contextValue: string = GuideNode.contextValue;

    constructor(
        public readonly guideName: string,
        public readonly guideUri: URL
    ) {
        super();
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
       return new Promise(resolve => resolve([]));
    }

    public getTreeItem(): TreeItem {
        const item = new TreeItem(`${this.guideName}`, TreeItemCollapsibleState.Collapsed);
        item.tooltip = `${this.guideUri}`;
        item.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'lambda_function.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'lambda_function.svg')
        };

        return item;
    }
}

