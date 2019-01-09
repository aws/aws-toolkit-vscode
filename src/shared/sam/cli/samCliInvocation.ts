/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SamCliConfiguration } from './samCliConfiguration'

/**
 * Represents a call to sam cli
 * Callers are expected to ensure SAM CLI is installed and has been configured
 */
export abstract class SamCliInvocation<T> {

    private readonly _samCliLocation: string | undefined

    protected constructor(config: SamCliConfiguration) {
        this._samCliLocation = config.getSamCliLocation()
    }

    public abstract execute(): Thenable<T>

    protected get samCliLocation(): string {
        if (!this._samCliLocation) {
            throw new Error('SAM CLI location not configured')
        }

        return this._samCliLocation
    }

    /**
     * Ensures the command is properly set up to run, throws Error if not.
     * Derived classes should likely call validate at the start of their execute implementations.
     */
    protected async validate(): Promise<void> {
        if (!this._samCliLocation) {
            throw new Error('SAM CLI location not configured')
        }
    }
}
