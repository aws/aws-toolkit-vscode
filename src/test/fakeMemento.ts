/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { Memento } from 'vscode'

export class FakeMemento implements Memento {
    public get<T>(key: string): T | undefined
    public  get<T>(key: string, defaultValue: T): T
    public get(key: any, defaultValue?: any) {
        throw new Error('Method not implemented.')
    }
    public update(key: string, value: any): Thenable<void> {
        throw new Error('Method not implemented.')
    }
}
