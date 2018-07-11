'use strict';

import * as vscode from 'vscode';
import { ExplorerNodeBase } from '../../shared/nodes';
import { BlueprintsCollection } from '../models/blueprintsCollection';
import { BlueprintsLanguageNode } from './blueprintsLanguageNode';

export class ProjectBlueprintsNode extends ExplorerNodeBase {

    private allBlueprints: BlueprintsCollection = new BlueprintsCollection();

    public async getChildren(): Promise<ExplorerNodeBase[]> {

        await this.allBlueprints.loadAllBlueprints(); // to date we do VS blueprints only

        let languageNodes: BlueprintsLanguageNode[] = [];
        let languages = this.allBlueprints.filterBlueprintLanguages();
        languages.forEach((l: string) => {
            languageNodes.push(new BlueprintsLanguageNode(l, this.allBlueprints));
        });

        return languageNodes;
    }

    public getTreeItem(): vscode.TreeItem | Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem('Project Blueprints', vscode.TreeItemCollapsibleState.Collapsed);
        item.tooltip = 'Blueprints for creating new projects targeting AWS Lambda';

        return item;
    }
}
