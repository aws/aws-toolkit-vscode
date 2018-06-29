'use strict';
import * as vscode from 'vscode';
import { Command, Disposable, TreeItem } from 'vscode';

export interface IRefreshTreeProvider {
    refresh(): void;
}

export abstract class ExplorerNodeBase extends Disposable {

    readonly supportsPaging: boolean = false;
    maxCount: number | undefined;

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

    abstract getChildren(): ExplorerNodeBase[] | Promise<ExplorerNodeBase[]>;
    abstract getTreeItem(): TreeItem | Promise<TreeItem>;

    getCommand(): Command | undefined {
        return undefined;
    }

    refresh(): void { }

    resetChildren(): void {
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