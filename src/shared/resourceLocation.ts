/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 */

'use strict'

export interface ResourceLocation {
    getLocationUri(): string
}

export class WebResourceLocation implements ResourceLocation {
    private readonly _uri: string

    constructor(uri: string) {
        this._uri = uri
    }

    public getLocationUri(): string {
        return this._uri
    }
}

export class FileResourceLocation implements ResourceLocation {
    private readonly _filename: string

    constructor(filename: string) {
        this._filename = filename
    }

    public getLocationUri(): string {
        return this._filename
    }
}