/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Custom extensions to vscode extensions API for AWS Console integration. Only
 * works with custom fork of VSCode supporting postMessage through VSCode
 * Proposed API wrapper.
 */
declare module 'vscode' {
  namespace window {
    export const receiveMessage: Event<any> | undefined
    export const sendMessage: ((message: any) => void) | undefined
  }
}
