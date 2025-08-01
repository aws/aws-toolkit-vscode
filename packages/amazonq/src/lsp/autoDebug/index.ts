/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Auto Debug feature for Amazon Q
 *
 * This module provides auto debug functionality including:
 * - Command registration for fixing problems with Amazon Q
 * - Code actions provider for quick fixes
 * - Integration with VSCode's diagnostic system
 */

export { AutoDebugFeature, activateAutoDebug } from './activation'
export { AutoDebugCommands } from './commands'
export { AutoDebugCodeActionsProvider } from './codeActionsProvider'
export { AutoDebugController } from './controller'
