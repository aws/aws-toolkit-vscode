'use strict';

import * as path from 'path';
import { ExplorerNodeBase } from '../../shared/nodes';
import { TreeItem, Uri, ThemeIcon } from 'vscode';
import { Blueprint } from '../models/blueprint';

export class BlueprintNode extends ExplorerNodeBase implements TreeItem {
    public static contextValue: string = 'awsLambdaBlueprint';
    public contextValue: string = BlueprintNode.contextValue;

    public label?: string;
    public tooltip?: string;
    public iconPath?: string | Uri | { light: string | Uri; dark: string | Uri } | ThemeIcon;

    constructor(
        public readonly blueprint: Blueprint
    ) {
        super();
        this.label = `${this.blueprint.name!}`;
        this.tooltip = `${this.blueprint.description}`;
        this.iconPath = {
            light: path.join(__filename, '..', '..', '..', 'resources', 'light', 'lambda_function.svg'),
            dark: path.join(__filename, '..', '..', '..', 'resources', 'dark', 'lambda_function.svg')
        };
    }

    public getChildren(): BlueprintNode[] {
        return [];
    }

    public getTreeItem(): BlueprintNode | Promise<BlueprintNode> {
        return this;
    }
}
