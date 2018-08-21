'use strict';

import { TreeItem, Uri, ThemeIcon } from 'vscode';
import * as path from 'path';
import { AWSTreeNodeBase } from '../../shared/awsTreeNodeBase';
import { Blueprint } from '../models/blueprint';

export class BlueprintNode extends AWSTreeNodeBase implements TreeItem {
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

    public getChildren(): Thenable<BlueprintNode[]> {
        return new Promise(resolve => resolve([]));
    }

    public getTreeItem(): TreeItem {
        return this;
    }
}
