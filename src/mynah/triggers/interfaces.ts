/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TerminalLink } from 'vscode'
import { DebugProtocol } from '@vscode/debugprotocol'
import { Query } from '../models/model'

export type ExceptionBreakMode = 'never' | 'always' | 'unhandled' | 'userUnhandled'

export interface ExceptionInfoBody {
    /**
     * ID of the exception that was thrown.
     */
    exceptionId: string

    /**
     * Descriptive text for the exception provided by the debug adapter.
     */
    description?: string

    /**
     * Mode that caused the exception notification to be raised.
     */
    breakMode: ExceptionBreakMode

    /**
     * Detailed information about the exception.
     */
    details?: ExceptionDetails
}

export interface ExceptionDetails {
    /**
     * Message contained in the exception.
     */
    message?: string

    /**
     * Short type name of the exception object.
     */
    typeName?: string

    /**
     * Fully-qualified type name of the exception object.
     */
    fullTypeName?: string

    /**
     * Optional expression that can be evaluated in the current scope to obtain
     * the exception object.
     */
    evaluateName?: string

    /**
     * Stack trace at the time the exception was thrown.
     */
    stackTrace?: string

    /**
     * Details of the exception contained by this exception, if any.
     */
    innerException?: ExceptionDetails[]
}

export interface ExceptionInfoResponse extends DebugProtocol.Response {
    body: ExceptionInfoBody
}

export interface SearchTerminalLink extends TerminalLink {
    readonly query: Query
}
