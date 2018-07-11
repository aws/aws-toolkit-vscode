'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase } from '../../shared/nodes';
import { BlueprintNode } from './blueprintNode';
import { BlueprintsCollection } from '../models/blueprintsCollection';
import { Blueprint } from '../models/blueprint';

export class BlueprintsLanguageNode extends ExplorerNodeBase {

    constructor(public readonly language: string, public readonly blueprintsCollection: BlueprintsCollection) {
        super();
    }

    public getChildren(): BlueprintNode[] {
        let blueprints: BlueprintNode[] = [];
        this.blueprintsCollection.filterBlueprintsForLanguage(this.language).forEach((b: Blueprint) => {
            blueprints.push(new BlueprintNode(b));
        });

        return blueprints;
    }

    public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem(this.language, vscode.TreeItemCollapsibleState.Collapsed);
        item.tooltip = `Project blueprints for creating new projects targeting AWS Lambda in ${this.language}`;

        return item;
    }
}
