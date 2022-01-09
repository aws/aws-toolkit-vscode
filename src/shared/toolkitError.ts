/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as telemetry from './telemetry/telemetry'
import { TimeoutError } from './utilities/timeoutUtils'

interface ErrorMetadata {
    // TODO: when `cause` is natively supported this can be removed
    /**
     * A reason for the error. This can be a string or another error.
     */
    readonly cause?: string | Error | ToolkitError

    /**
     * Detailed information about the error. This may be added to logs.
     */
    readonly detail?: string

    /**
     * Flag to determine if the error was from a user-initiated cancellation.
     */
    readonly cancelled?: boolean

    /**
     * Metric metadata associated with the error.
     */
    readonly metric?: {
        /**
         * The telemetry metric ID associated with this error.
         *
         * For example, if S3's `downloadFile` fails then we should use `s3_downloadObject` here.
         */
        readonly name: string

        /**
         * This should be set to either 'Failed' or 'Cancelled' depending on the control flow.
         */
        readonly result: Exclude<telemetry.Result, 'Succeeded'>
    }
}

/**
 * Error class for user-facing messages along with extra metadata.
 */
export class ToolkitError extends Error implements ErrorMetadata {
    /**
     * A message that could potentially be shown to the user. This should not contain any
     * sensitive information and should be limited in technical detail.
     */
    public readonly message!: string
    protected readonly metadata: ErrorMetadata

    constructor(message: string, metadata: ErrorMetadata = {}) {
        super(message)
        this.metadata = metadata
    }

    public get cause() {
        return this.metadata.cause
    }

    public get detail() {
        return this.metadata.detail
    }

    public get metric() {
        return this.metadata.metric
    }

    public get cancelled(): boolean {
        const cause = this.metadata.cause

        return TimeoutError.isCancelled(cause) || (cause instanceof ToolkitError && cause.cancelled)
    }
}
