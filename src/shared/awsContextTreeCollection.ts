'use strict';

import { AwsContext } from './awsContext';
import { IRefreshableAWSTreeProvider } from '../shared/treeview/IAWSTreeProvider';

export class AwsContextTreeCollection {
    private _trees: IRefreshableAWSTreeProvider[];

    constructor() {
        this._trees = [];
    }

    public addTree(tree: IRefreshableAWSTreeProvider): void {
        this._trees.push(tree);
    }

    public refreshTrees(awsContext: AwsContext): void {
        this._trees.forEach(t => {
            t.refresh(awsContext);
        });
    }
}
