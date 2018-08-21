'use strict';

import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { AWSTreeNodeBase } from '../../shared/awsTreeNodeBase';
import { BlueprintNode } from './blueprintNode';
import { BlueprintsCollection } from '../models/blueprintsCollection';
import { Blueprint } from '../models/blueprint';

export class BlueprintsLanguageNode extends AWSTreeNodeBase {

    constructor(public readonly language: string, public readonly blueprintsCollection: BlueprintsCollection) {
        super();
    }

    public getChildren(): Thenable<BlueprintNode[]> {
        return new Promise(resolve => {
            let blueprints: BlueprintNode[] = [];
            this.blueprintsCollection.filterBlueprintsForLanguage(this.language).forEach((b: Blueprint) => {
                blueprints.push(new BlueprintNode(b));
            });

            resolve(blueprints);
        });
    }

    public getTreeItem(): TreeItem {
        const item = new TreeItem(this.language, TreeItemCollapsibleState.Collapsed);
        item.tooltip = `Project blueprints for creating new projects targeting AWS Lambda in ${this.language}`;

        return item;
    }
}
