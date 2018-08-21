'use strict';

import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { AWSTreeNodeBase } from '../../shared/awsTreeNodeBase';
import { BlueprintsCollection } from '../models/blueprintsCollection';
import { BlueprintsLanguageNode } from './blueprintsLanguageNode';

export class ProjectBlueprintsNode extends AWSTreeNodeBase {

    private allBlueprints: BlueprintsCollection = new BlueprintsCollection();

    public async getChildren(): Promise<AWSTreeNodeBase[]> {

        await this.allBlueprints.loadAllBlueprints(); // to date we do VS blueprints only

        let languageNodes: BlueprintsLanguageNode[] = [];
        let languages = this.allBlueprints.filterBlueprintLanguages();
        languages.forEach((l: string) => {
            languageNodes.push(new BlueprintsLanguageNode(l, this.allBlueprints));
        });

        return languageNodes;
    }

    public getTreeItem(): TreeItem {
        const item = new TreeItem('Project Blueprints', TreeItemCollapsibleState.Collapsed);
        item.tooltip = 'Blueprints for creating new projects targeting AWS Lambda';

        return item;
    }
}
