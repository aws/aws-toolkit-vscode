/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 *
 * This class is responsible for responding to UI events by calling
 * the Scan extension.
 */

/**
 * TODO:
 * This file/declaration needs to be moved to packages/amazonq/src/amazonqScan/chat/controller
 * Once the mapping from Q folder to core is configured.
 */

import * as vscode from 'vscode'

// These events can be interactions within the chat,
// or elsewhere in the IDE
export interface ScanChatControllerEventEmitters {
    readonly tabOpened: vscode.EventEmitter<any>
    readonly tabClosed: vscode.EventEmitter<any>
    readonly authClicked: vscode.EventEmitter<any>
    readonly formActionClicked: vscode.EventEmitter<any>
    readonly errorThrown: vscode.EventEmitter<any>
    readonly showSecurityScan: vscode.EventEmitter<any>
    readonly scanStopped: vscode.EventEmitter<any>
    readonly followUpClicked: vscode.EventEmitter<any>
    readonly scanProgress: vscode.EventEmitter<any>
    readonly processResponseBodyLinkClick: vscode.EventEmitter<any>
    readonly fileClicked: vscode.EventEmitter<any>
    readonly scanCancelled: vscode.EventEmitter<any>
    readonly processChatItemVotedMessage: vscode.EventEmitter<any>
}
