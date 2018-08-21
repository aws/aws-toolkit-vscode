'use strict';

import {QuickPickItem} from 'vscode';

export class QuickPickNode implements QuickPickItem {
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