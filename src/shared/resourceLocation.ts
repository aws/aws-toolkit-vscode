/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

export interface ResourceLocation {
    getLocationUri(): string
}

export class WebResourceLocation implements ResourceLocation {
    private readonly _uri: string

    public constructor(uri: string) {
        this._uri = uri
    }

    public getLocationUri(): string {
        return this._uri
    }
}

export class FileResourceLocation implements ResourceLocation {
    private readonly _filename: string

    public constructor(filename: string) {
        this._filename = filename
    }

    public getLocationUri(): string {
        return this._filename
    }
}
