/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IMPORTANT: We are importing the same test from the node timeoutUtils
 * since the behavior should be the exact same.
 *
 * Any web specific tests should be made within their own `describe()`.
 */
import { timeoutUtilsDescribe } from 'aws-core-vscode/testWeb'
timeoutUtilsDescribe
