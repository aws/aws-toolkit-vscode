'use strict';

import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { AWSTreeNodeBase } from './awsTreeNodeBase';

export abstract class AWSRegionTreeNode extends AWSTreeNodeBase {
    public readonly contextValue: string = 'awsRegion';

    constructor(public regionCode:string) {
        super();
    }

    protected abstract getLabel(): string;

    protected getTooltip(): string | undefined {
        return undefined;
    }

    public getTreeItem(): TreeItem {
        const item = new TreeItem(this.getLabel(), TreeItemCollapsibleState.Expanded);
        item.tooltip = this.getTooltip();

        return item;
    }
}
