'use strict';

import * as vscode from 'vscode';
import { Command, Disposable, TreeItem } from 'vscode';
import { AWSContext } from './awsContext';

export interface IAWSTreeProvider {
    viewProviderId: string;

    initialize(): void;
}

export interface IRefreshableAWSTreeProvider extends IAWSTreeProvider {
    refresh(newContext: AWSContext): void;
}

export abstract class ExplorerNodeBase extends Disposable {

    public readonly supportsPaging: boolean = false;

    protected children: ExplorerNodeBase[] | undefined;
    protected disposable: Disposable | undefined;
    // protected readonly id: number;

    constructor() {
        super(() => this.dispose());
    }

    dispose() {
        if (this.disposable !== undefined) {
            this.disposable.dispose();
            this.disposable = undefined;
        }

        this.resetChildren();
    }

    public abstract getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]>;
    public abstract getTreeItem(): TreeItem | Promise<TreeItem>;

    public getCommand(): Command | undefined {
        return undefined;
    }

    public refresh(newContext: AWSContext): void { }

    public resetChildren(): void {
        if (this.children !== undefined) {
            this.children.forEach(c => c.dispose());
            this.children = undefined;
        }
    }
}

export class QuickPickNode implements vscode.QuickPickItem {
    label: string;
    description?: string | undefined;
    detail?: string | undefined;
    picked?: boolean | undefined;
    constructor(
        readonly id: string
    ) {
        this.label = id;
    }
}