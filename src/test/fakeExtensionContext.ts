/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { ExtensionContext, Memento } from 'vscode'
import { FakeMemento } from './fakeMemento'

export class FakeExtensionContext implements ExtensionContext {
    public subscriptions: {
        dispose(): any;
    }[] = []
    public workspaceState: Memento = new FakeMemento()
    public globalState: Memento = new FakeMemento()
    public extensionPath: string = ''
    public storagePath: string | undefined

    public asAbsolutePath(relativePath: string): string {
        throw new Error('Method not implemented.')
    }
}
