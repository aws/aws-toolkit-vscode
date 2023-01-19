/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ErrorMetadata {
    message: string
    severity: string
    source?: string
    errorCode?: string
    code?: string
    errorId: string
    file: string
    type?: ErrorType
    languageId?: string
    imports?: string[]
    stackTrace?: string
    state: ErrorState
}
export interface HeartbeatMetadata {
    fileName: string
    languageId?: string
    isEdit: boolean
}

export enum ErrorType {
    DIAGNOSTIC = 'DIAGNOSTIC',
    DEBUG = 'DEBUG',
    TERMINAL = 'TERMINAL',
}

export enum ErrorState {
    NEW = 'NEW',
    CLEARED = 'CLEARED',
}
