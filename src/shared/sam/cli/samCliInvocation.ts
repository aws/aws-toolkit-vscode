/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { SamCliInvoker } from './samCliInvoker'

/**
 * Represents a call to sam cli
 * Callers are expected to ensure SAM CLI is installed and has been configured
 */
export abstract class SamCliInvocation<T> {
    protected constructor(protected readonly invoker: SamCliInvoker) {
    }
    public abstract execute(): Thenable<T>

    /**
     * Ensures the command is properly set up to run, throws Error if not.
     * Derived classes should likely call validate at the start of their execute implementations.
     */
    protected abstract validate(): Promise<void>
}
