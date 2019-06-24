/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'

export interface ItemsLoaderEndEvent {
    success: boolean,
    error?: Error,
    cancelled: boolean,
}

export const CANCELLED_ITEMSLOADER_END_EVENT: ItemsLoaderEndEvent = {
    success: false,
    error: undefined,
    cancelled: true,
}

export const SUCCESS_ITEMSLOADER_END_EVENT: ItemsLoaderEndEvent = {
    success: true,
    error: undefined,
    cancelled: false,
}

/**
 * Loads items in an event driven fashion.
 */
export interface ItemsLoader<T> {
    onLoadStart: vscode.Event<void>
    onItem: vscode.Event<T>
    onLoadEnd: vscode.Event<ItemsLoaderEndEvent>
}

export abstract class BaseItemsLoader<T> implements ItemsLoader<T> {
    protected readonly loadStartEmitter = new vscode.EventEmitter<void>()
    protected readonly loadEndEmitter = new vscode.EventEmitter<ItemsLoaderEndEvent>()

    protected readonly itemEmitter: vscode.EventEmitter<T> =
        new vscode.EventEmitter<T>()

    public get onLoadStart(): vscode.Event<void> {
        return this.loadStartEmitter.event
    }

    public get onItem(): vscode.Event<T> {
        return this.itemEmitter.event
    }

    public get onLoadEnd(): vscode.Event<ItemsLoaderEndEvent> {
        return this.loadEndEmitter.event
    }
}
